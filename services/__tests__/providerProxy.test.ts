import { ensureFirebase, getCurrentFirebaseIdToken, waitForFirebaseAuthReady } from '../firebaseClient';

jest.mock('../firebaseClient', () => ({
  ensureFirebase: jest.fn(() => ({
    auth: jest.fn(() => ({ currentUser: null })),
  })),
  getCurrentFirebaseIdToken: jest.fn(async () => 'test-id-token'),
  waitForFirebaseAuthReady: jest.fn(async () => null),
}));

jest.mock('../firebaseAppCheck', () => ({
  getCurrentFirebaseAppCheckToken: jest.fn(() => ''),
  refreshFirebaseAppCheckToken: jest.fn(async () => ''),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));

import {
  fetchProviderProxyJson,
  isAbortedProxyResult,
  isTransientProxyError,
  primeProviderProxyAccess,
} from '../providerProxy';

function mkFetchResponse(payload: any, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    json: async () => payload,
  };
}

describe('providerProxy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = jest.fn(async () => mkFetchResponse({ data: 'ok' }));
    (getCurrentFirebaseIdToken as jest.Mock).mockResolvedValue('test-id-token');
  });

  afterEach(() => {
    delete (global as any).fetch;
  });

  describe('fetchProviderProxyJson', () => {
    it('returns proxy_endpoint_missing when endpoint is empty', async () => {
      const result = await fetchProviderProxyJson('', { action: 'test' });
      expect(result.meta.ok).toBe(false);
      expect(result.meta.errorCode).toBe('proxy_endpoint_missing');
    });

    it('retries once on 401/403 after refreshing auth', async () => {
      const mockFetch = jest.fn()
        .mockResolvedValueOnce(mkFetchResponse({ error: 'unauthorized' }, false, 401))
        .mockResolvedValueOnce(mkFetchResponse({ data: 'ok' }));
      (global as any).fetch = mockFetch;

      const result = await fetchProviderProxyJson(
        'https://proxy.test/api',
        { action: 'details' },
        { action: 'details' },
      );
      expect(result.meta.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('waits for auth hydration before giving up on proxy access', async () => {
      (getCurrentFirebaseIdToken as jest.Mock)
        .mockResolvedValueOnce('')   // cached-token fast path (no force refresh)
        .mockResolvedValueOnce('')   // primeProviderProxyAccess (force refresh)
        .mockResolvedValueOnce('hydrated-token'); // after waitForFirebaseAuthReady
      (waitForFirebaseAuthReady as jest.Mock).mockResolvedValue({ uid: 'user-1' });

      const result = await fetchProviderProxyJson(
        'https://proxy.test/api',
        { action: 'details' },
        { action: 'details', waitForAccessMs: 200 },
      );

      expect(waitForFirebaseAuthReady).toHaveBeenCalled();
      expect(result.meta.ok).toBe(true);
      expect((global as any).fetch).toHaveBeenCalledWith(
        'https://proxy.test/api',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer hydrated-token',
          }),
        }),
      );
    });

    it('retries once on timeout', async () => {
      let callCount = 0;
      const mockFetch = jest.fn().mockImplementation((_url: string, init: any) => {
        callCount++;
        if (callCount === 1) {
          // Simulate a slow request that gets aborted by the internal timeout
          return new Promise((_resolve, reject) => {
            if (init?.signal) {
              const onAbort = () => {
                const error = new Error('Aborted');
                (error as any).name = 'AbortError';
                reject(error);
              };
              if (init.signal.aborted) { onAbort(); return; }
              init.signal.addEventListener('abort', onAbort);
            }
          });
        }
        return Promise.resolve(mkFetchResponse({ data: 'ok' }));
      });
      (global as any).fetch = mockFetch;

      const result = await fetchProviderProxyJson(
        'https://proxy.test/api',
        { action: 'test' },
        { action: 'test', timeoutMs: 50 },
      );
      // Retry should have been attempted after internal timeout
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.meta.ok).toBe(true);
    });

    it('retries once on network error', async () => {
      const mockFetch = jest.fn()
        .mockRejectedValueOnce(new Error('Failed to fetch'))
        .mockResolvedValueOnce(mkFetchResponse({ data: 'ok' }));
      (global as any).fetch = mockFetch;

      const result = await fetchProviderProxyJson(
        'https://proxy.test/api',
        { action: 'test' },
        { action: 'test' },
      );
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.meta.ok).toBe(true);
    });

    it('does not retry on provider_error (non-retryable)', async () => {
      const mockFetch = jest.fn()
        .mockResolvedValueOnce(mkFetchResponse({ error: 'server error' }, false, 500));
      (global as any).fetch = mockFetch;

      const result = await fetchProviderProxyJson(
        'https://proxy.test/api',
        { action: 'test' },
        { action: 'test' },
      );
      expect(result.meta.ok).toBe(false);
      expect(result.meta.errorCode).toBe('proxy_provider_error');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('returns proxy_aborted when externally cancelled via signal', async () => {
      const controller = new AbortController();
      controller.abort();

      const result = await fetchProviderProxyJson(
        'https://proxy.test/api',
        { action: 'test' },
        { action: 'test', signal: controller.signal },
      );
      expect(result.meta.ok).toBe(false);
      expect(result.meta.errorCode).toBe('proxy_aborted');
    });

    it('does not retry externally aborted requests', async () => {
      const controller = new AbortController();
      const mockFetch = jest.fn().mockImplementation((_url: string, init: any) => {
        // Simulate external abort arriving during fetch
        controller.abort();
        const error = new Error('Aborted');
        (error as any).name = 'AbortError';
        return Promise.reject(error);
      });
      (global as any).fetch = mockFetch;

      const result = await fetchProviderProxyJson(
        'https://proxy.test/api',
        { action: 'test' },
        { action: 'test', signal: controller.signal },
      );
      expect(result.meta.errorCode).toBe('proxy_aborted');
      // Should NOT retry — only 1 call
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('isAbortedProxyResult', () => {
    it('returns true for aborted results', () => {
      expect(
        isAbortedProxyResult({
          data: null,
          meta: { action: 'test', endpoint: '', ok: false, authMode: 'none', errorCode: 'proxy_aborted' },
        }),
      ).toBe(true);
    });

    it('returns false for non-aborted errors', () => {
      expect(
        isAbortedProxyResult({
          data: null,
          meta: { action: 'test', endpoint: '', ok: false, authMode: 'none', errorCode: 'proxy_timeout' },
        }),
      ).toBe(false);
    });
  });

  describe('isTransientProxyError', () => {
    it('identifies transient error codes', () => {
      expect(isTransientProxyError('proxy_access_unavailable')).toBe(true);
      expect(isTransientProxyError('proxy_unauthorized')).toBe(true);
      expect(isTransientProxyError('proxy_timeout')).toBe(true);
      expect(isTransientProxyError('proxy_network_error')).toBe(true);
      expect(isTransientProxyError('proxy_provider_error')).toBe(true);
      expect(isTransientProxyError('proxy_aborted')).toBe(true);
    });

    it('does not classify endpoint_missing as transient', () => {
      expect(isTransientProxyError('proxy_endpoint_missing')).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(isTransientProxyError(undefined)).toBe(false);
    });
  });
});
