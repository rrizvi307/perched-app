import { getCurrentFirebaseAppCheckToken, refreshFirebaseAppCheckToken } from '@/services/firebaseAppCheck';
import { devLog } from '@/services/logger';

export type ProviderProxyAuthMode = 'auth' | 'app_check' | 'none';

export type ProviderProxyErrorCode =
  | 'proxy_endpoint_missing'
  | 'proxy_access_unavailable'
  | 'proxy_unauthorized'
  | 'proxy_timeout'
  | 'proxy_network_error'
  | 'proxy_provider_error';

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
  maxWaitMs = 2200,
  pollMs = 120,
): Promise<ProviderProxyAuthState> {
  const deadline = Date.now() + Math.max(0, maxWaitMs);
  let attempt = 0;
  let lastState = await primeProviderProxyAccess(true);

  while (!lastState.hasAuth && !lastState.hasAppCheck && Date.now() < deadline) {
    attempt += 1;
    await sleep(pollMs);
    lastState = await readProviderProxyAuthState();
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
): Promise<ProviderProxyJsonResult<T>> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = setTimeout(() => controller?.abort(), timeoutMs);
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
    const abortMessage = getAbortMessage(error);
    const errorCode =
      typeof (error as any)?.name === 'string' && (error as any).name === 'AbortError'
        ? 'proxy_timeout'
        : 'proxy_network_error';
    addProviderProxyBreadcrumb('provider_proxy_request_exception', {
      action,
      endpoint,
      authMode: authState.authMode,
      errorCode,
      message: abortMessage,
    });
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
  }
}

export async function fetchProviderProxyJson<T>(
  endpoint: string,
  body: Record<string, any>,
  options?: {
    action?: string;
    timeoutMs?: number;
    waitForAccessMs?: number;
  },
): Promise<ProviderProxyJsonResult<T>> {
  const action = options?.action || 'request';
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
  const initial = await executeProviderProxyRequest<T>(endpoint, body, authState, action, timeoutMs);
  if (
    initial.meta.ok ||
    initial.meta.errorCode !== 'proxy_unauthorized'
  ) {
    return initial;
  }

  const refreshedState = await primeProviderProxyAccess(true);
  if (!refreshedState.hasAuth && !refreshedState.hasAppCheck) {
    return initial;
  }
  return executeProviderProxyRequest<T>(endpoint, body, refreshedState, action, timeoutMs);
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
