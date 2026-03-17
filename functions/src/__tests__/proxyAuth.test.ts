import { authorizeProxyRequest } from '../proxyAuth';

function mkReq(headers: Record<string, string | undefined> = {}) {
  return {
    get(name: string) {
      return headers[name];
    },
  };
}

describe('authorizeProxyRequest', () => {
  it('allows secret bypass without running auth checks', async () => {
    const verifyUser = jest.fn(async () => null);
    const verifyAppCheck = jest.fn(async () => false);

    const result = await authorizeProxyRequest(mkReq(), {
      hasSecretBypass: true,
      requireAuth: true,
      requireAppCheck: true,
      verifyUser,
      verifyAppCheck,
    });

    expect(result).toEqual({ ok: true, mode: 'secret' });
    expect(verifyUser).not.toHaveBeenCalled();
    expect(verifyAppCheck).not.toHaveBeenCalled();
  });

  it('allows authenticated users even when app check is required', async () => {
    const verifyUser = jest.fn(async () => 'uid-123');
    const verifyAppCheck = jest.fn(async () => false);

    const result = await authorizeProxyRequest(mkReq(), {
      requireAuth: true,
      requireAppCheck: true,
      verifyUser,
      verifyAppCheck,
    });

    expect(result).toEqual({ ok: true, mode: 'auth' });
    expect(verifyAppCheck).not.toHaveBeenCalled();
  });

  it('allows unauthenticated requests with valid app check', async () => {
    const verifyUser = jest.fn(async () => null);
    const verifyAppCheck = jest.fn(async () => true);

    const result = await authorizeProxyRequest(
      mkReq({ 'X-Firebase-AppCheck': 'app-check-token' }),
      {
        requireAuth: true,
        requireAppCheck: true,
        verifyUser,
        verifyAppCheck,
      },
    );

    expect(result).toEqual({ ok: true, mode: 'app_check' });
    expect(verifyAppCheck).toHaveBeenCalledTimes(1);
  });

  it('rejects unauthenticated requests when app check validation fails', async () => {
    const verifyUser = jest.fn(async () => null);
    const verifyAppCheck = jest.fn(async () => false);

    const result = await authorizeProxyRequest(
      mkReq({ 'X-Firebase-AppCheck': 'bad-token' }),
      {
        requireAuth: true,
        requireAppCheck: true,
        verifyUser,
        verifyAppCheck,
      },
    );

    expect(result).toEqual({ ok: false, mode: 'denied' });
    expect(verifyAppCheck).toHaveBeenCalledTimes(1);
  });
});
