import { getCurrentFirebaseAppCheckToken, refreshFirebaseAppCheckToken } from '@/services/firebaseAppCheck';
import { devLog } from '@/services/logger';

export type ProviderProxyAuthMode = 'auth' | 'app_check' | 'none';

export type ProviderProxyErrorCode =
  | 'proxy_endpoint_missing'
  | 'proxy_access_unavailable'
  | 'proxy_unauthorized'
  | 'proxy_timeout'
  | 'proxy_network_error'
  | 'proxy_provider_error'
  | 'proxy_aborted';

export type ProviderProxyAuthState = {
  authMode: ProviderProxyAuthMode;
  hasAuth: boolean;
  hasAppCheck: boolean;
  headers: Record<string, string>;
};

export type ProviderProxyFetchMeta = {
  action: string;
  endpoint: string;
  ok: boolean;
  authMode: ProviderProxyAuthMode;
  statusCode?: number;
  errorCode?: ProviderProxyErrorCode;
  errorMessage?: string;
};

export type ProviderProxyJsonResult<T> = {
  data: T | null;
  meta: ProviderProxyFetchMeta;
};

/** True when the error originated from an externally-cancelled AbortSignal (not a timeout). */
export function isAbortedProxyResult(result: ProviderProxyJsonResult<unknown>): boolean {
  return !result.meta.ok && result.meta.errorCode === 'proxy_aborted';
}

/** True when the error is transient and should not be cached or surface sticky UI state. */
export function isTransientProxyError(code?: ProviderProxyErrorCode | 'proxy_aborted'): boolean {
  return (
    code === 'proxy_access_unavailable' ||
    code === 'proxy_unauthorized' ||
    code === 'proxy_timeout' ||
    code === 'proxy_network_error' ||
    code === 'proxy_provider_error' ||
    code === 'proxy_aborted'
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addProviderProxyBreadcrumb(message: string, data?: Record<string, unknown>) {
  try {
    void import('./sentry')
      .then((module) => {
        if (typeof module?.addBreadcrumb === 'function') {
          module.addBreadcrumb(message, 'provider_proxy', data);
        }
      })
      .catch(() => {});
  } catch {}
}

async function readProviderProxyAuthState(options?: {
  forceRefreshAuth?: boolean;
  forceRefreshAppCheck?: boolean;
}): Promise<ProviderProxyAuthState> {
  const headers: Record<string, string> = {};
  let hasAuth = false;
  let hasAppCheck = false;

  try {
    const { getCurrentFirebaseIdToken } = await import('./firebaseClient');
    if (typeof getCurrentFirebaseIdToken === 'function') {
      const idToken = await getCurrentFirebaseIdToken(Boolean(options?.forceRefreshAuth));
      if (typeof idToken === 'string' && idToken.trim()) {
        headers.Authorization = `Bearer ${idToken.trim()}`;
        hasAuth = true;
      }
    }
  } catch (error) {
    devLog('provider proxy auth token read failed', error);
  }

  try {
    let appCheckToken = getCurrentFirebaseAppCheckToken();
    if (!appCheckToken && options?.forceRefreshAppCheck) {
      appCheckToken = await refreshFirebaseAppCheckToken();
    }
    if (typeof appCheckToken === 'string' && appCheckToken.trim()) {
      headers['X-Firebase-AppCheck'] = appCheckToken.trim();
      hasAppCheck = true;
    }
  } catch (error) {
    devLog('provider proxy app check read failed', error);
  }

  return {
    authMode: hasAuth ? 'auth' : hasAppCheck ? 'app_check' : 'none',
    hasAuth,
    hasAppCheck,
    headers,
  };
}

export async function primeProviderProxyAccess(
  forceRefresh = true,
): Promise<ProviderProxyAuthState> {
  const state = await readProviderProxyAuthState({
    forceRefreshAuth: forceRefresh,
    forceRefreshAppCheck: forceRefresh,
  });
  addProviderProxyBreadcrumb('provider_proxy_access_primed', {
    authMode: state.authMode,
    hasAuth: state.hasAuth,
    hasAppCheck: state.hasAppCheck,
    forceRefresh,
  });
  return state;
}

export async function waitForProviderProxyAccess(
  maxWaitMs = 6500,
  pollMs = 160,
): Promise<ProviderProxyAuthState> {
  const deadline = Date.now() + Math.max(0, maxWaitMs);
  let attempt = 0;

  // Fast path: check if cached tokens are already available (seeded from
  // AsyncStorage on cold start). This avoids the network round-trip of
  // force-refreshing on the very first request. If the cached token is
  // stale the server returns 401 and the retry logic handles it.
  let lastState = await readProviderProxyAuthState({
    forceRefreshAuth: false,
    forceRefreshAppCheck: false,
  });

  if (lastState.hasAuth || lastState.hasAppCheck) {
    addProviderProxyBreadcrumb('provider_proxy_access_ready', {
      authMode: lastState.authMode,
      hasAuth: lastState.hasAuth,
      hasAppCheck: lastState.hasAppCheck,
      attempts: 0,
      source: 'cached',
    });
    return lastState;
  }

  // No cached tokens — force-refresh and wait for auth hydration.
  lastState = await primeProviderProxyAccess(true);

  if (!lastState.hasAuth && !lastState.hasAppCheck) {
    try {
      const { waitForFirebaseAuthReady } = await import('./firebaseClient');
      if (typeof waitForFirebaseAuthReady === 'function') {
        await waitForFirebaseAuthReady(Math.min(4000, Math.max(0, maxWaitMs)));
        lastState = await readProviderProxyAuthState({
          forceRefreshAuth: true,
          forceRefreshAppCheck: true,
        });
      }
    } catch (error) {
      devLog('provider proxy auth hydration wait failed', error);
    }
  }

  while (!lastState.hasAuth && !lastState.hasAppCheck && Date.now() < deadline) {
    attempt += 1;
    await sleep(pollMs);
    lastState = await readProviderProxyAuthState({
      forceRefreshAuth: attempt <= 2 || attempt % 5 === 0,
      forceRefreshAppCheck: attempt === 1,
    });
  }

  addProviderProxyBreadcrumb('provider_proxy_access_ready', {
    authMode: lastState.authMode,
    hasAuth: lastState.hasAuth,
    hasAppCheck: lastState.hasAppCheck,
    attempts: attempt,
  });

  return lastState;
}

function getAbortMessage(error: unknown) {
  const name = typeof (error as any)?.name === 'string' ? (error as any).name : '';
  if (name === 'AbortError') return 'Request timed out';
  return error instanceof Error ? error.message : String(error || '');
}

function mapStatusToErrorCode(statusCode: number): ProviderProxyErrorCode {
  if (statusCode === 401 || statusCode === 403) return 'proxy_unauthorized';
  return 'proxy_provider_error';
}

async function executeProviderProxyRequest<T>(
  endpoint: string,
  body: Record<string, any>,
  authState: ProviderProxyAuthState,
  action: string,
  timeoutMs: number,
  externalSignal?: AbortSignal | null,
): Promise<ProviderProxyJsonResult<T>> {
  // If the caller already aborted before we start, short-circuit.
  if (externalSignal?.aborted) {
    return {
      data: null,
      meta: { action, endpoint, ok: false, authMode: authState.authMode, errorCode: 'proxy_aborted', errorMessage: 'Request cancelled' },
    };
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller?.abort(); }, timeoutMs);

  // Link the external signal so the caller can cancel the request.
  const onExternalAbort = () => controller?.abort();
  externalSignal?.addEventListener('abort', onExternalAbort, { once: true });

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...authState.headers,
      },
      body: JSON.stringify(body),
      signal: controller?.signal,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const errorCode = mapStatusToErrorCode(res.status);
      const errorMessage =
        json?.error?.message ||
        json?.error ||
        `Proxy request failed with status ${res.status}`;
      addProviderProxyBreadcrumb('provider_proxy_request_failed', {
        action,
        endpoint,
        authMode: authState.authMode,
        statusCode: res.status,
        errorCode,
      });
      return {
        data: null,
        meta: {
          action,
          endpoint,
          ok: false,
          authMode: authState.authMode,
          statusCode: res.status,
          errorCode,
          errorMessage,
        },
      };
    }

    addProviderProxyBreadcrumb('provider_proxy_request_ok', {
      action,
      endpoint,
      authMode: authState.authMode,
      statusCode: res.status,
    });
    return {
      data: json as T,
      meta: {
        action,
        endpoint,
        ok: true,
        authMode: authState.authMode,
        statusCode: res.status,
      },
    };
  } catch (error) {
    const isAbort = typeof (error as any)?.name === 'string' && (error as any).name === 'AbortError';
    // Distinguish caller-cancelled from timeout-triggered abort.
    const errorCode: ProviderProxyErrorCode = isAbort
      ? (timedOut ? 'proxy_timeout' : 'proxy_aborted')
      : 'proxy_network_error';
    const abortMessage = getAbortMessage(error);
    // External aborts are expected (superseded requests) — log at breadcrumb level only.
    if (errorCode !== 'proxy_aborted') {
      addProviderProxyBreadcrumb('provider_proxy_request_exception', {
        action,
        endpoint,
        authMode: authState.authMode,
        errorCode,
        message: abortMessage,
      });
    }
    return {
      data: null,
      meta: {
        action,
        endpoint,
        ok: false,
        authMode: authState.authMode,
        errorCode,
        errorMessage: abortMessage,
      },
    };
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', onExternalAbort);
  }
}

export async function fetchProviderProxyJson<T>(
  endpoint: string,
  body: Record<string, any>,
  options?: {
    action?: string;
    timeoutMs?: number;
    waitForAccessMs?: number;
    signal?: AbortSignal | null;
  },
): Promise<ProviderProxyJsonResult<T>> {
  const action = options?.action || 'request';
  const signal = options?.signal ?? null;

  if (!endpoint) {
    return {
      data: null,
      meta: {
        action,
        endpoint: '',
        ok: false,
        authMode: 'none',
        errorCode: 'proxy_endpoint_missing',
        errorMessage: 'Proxy endpoint missing',
      },
    };
  }

  // If externally aborted before we even start, bail immediately.
  if (signal?.aborted) {
    return {
      data: null,
      meta: { action, endpoint, ok: false, authMode: 'none', errorCode: 'proxy_aborted', errorMessage: 'Request cancelled' },
    };
  }

  const authState = await waitForProviderProxyAccess(options?.waitForAccessMs);
  if (!authState.hasAuth && !authState.hasAppCheck) {
    return {
      data: null,
      meta: {
        action,
        endpoint,
        ok: false,
        authMode: 'none',
        errorCode: 'proxy_access_unavailable',
        errorMessage: 'Proxy access unavailable',
      },
    };
  }

  const timeoutMs = options?.timeoutMs ?? 3200;
  const initial = await executeProviderProxyRequest<T>(endpoint, body, authState, action, timeoutMs, signal);

  // Never retry externally-cancelled requests.
  if (initial.meta.errorCode === 'proxy_aborted') return initial;

  // Success or non-retryable error — return immediately.
  if (initial.meta.ok) return initial;

  const retryableErrors: ProviderProxyErrorCode[] = ['proxy_unauthorized', 'proxy_timeout', 'proxy_network_error'];
  if (!retryableErrors.includes(initial.meta.errorCode!)) {
    return initial;
  }

  // For auth errors, force-refresh tokens. For transient errors, just retry once.
  const refreshedState = initial.meta.errorCode === 'proxy_unauthorized'
    ? await primeProviderProxyAccess(true)
    : authState;
  if (!refreshedState.hasAuth && !refreshedState.hasAppCheck) {
    return initial;
  }
  return executeProviderProxyRequest<T>(endpoint, body, refreshedState, action, timeoutMs, signal);
}

export function getProviderProxyUserMessage(
  code?: ProviderProxyErrorCode,
  context: 'places' | 'intelligence' = 'places',
): string {
  const subject = context === 'intelligence' ? 'spot intelligence' : 'spot search';
  switch (code) {
    case 'proxy_endpoint_missing':
      return `This build is missing ${subject} configuration.`;
    case 'proxy_access_unavailable':
      return `${subject} is still warming up. Try again in a moment.`;
    case 'proxy_unauthorized':
      return `${subject} needs a fresh session. Try again in a moment.`;
    case 'proxy_timeout':
      return `${subject} timed out. Check your connection and retry.`;
    case 'proxy_network_error':
      return `${subject} could not reach the server.`;
    case 'proxy_provider_error':
      return `${subject} is temporarily unavailable.`;
    default:
      return `${subject} is temporarily unavailable.`;
  }
}
