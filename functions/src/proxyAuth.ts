export type ProxyRequestLike = {
  get(name: string): unknown;
};

export type ProxyAuthorizationResult = {
  ok: boolean;
  mode: 'secret' | 'auth' | 'app_check' | 'denied';
};

type ProxyAuthorizationOptions = {
  hasSecretBypass?: boolean;
  requireAuth?: boolean;
  requireAppCheck?: boolean;
  verifyUser: (req: ProxyRequestLike) => Promise<string | null>;
  verifyAppCheck: (req: ProxyRequestLike) => Promise<boolean>;
};

function hasProvidedAppCheckToken(req: ProxyRequestLike): boolean {
  const token = req.get('X-Firebase-AppCheck');
  return typeof token === 'string' && token.trim().length > 0;
}

export async function authorizeProxyRequest(
  req: ProxyRequestLike,
  options: ProxyAuthorizationOptions,
): Promise<ProxyAuthorizationResult> {
  const {
    hasSecretBypass = false,
    requireAuth = true,
    requireAppCheck = true,
    verifyUser,
    verifyAppCheck,
  } = options;

  if (hasSecretBypass) {
    return { ok: true, mode: 'secret' };
  }

  const uid = await verifyUser(req);
  if (uid) {
    return { ok: true, mode: 'auth' };
  }

  const shouldVerifyAppCheck = requireAppCheck || hasProvidedAppCheckToken(req);
  if (!shouldVerifyAppCheck) {
    return { ok: !requireAuth, mode: !requireAuth ? 'app_check' : 'denied' };
  }

  const appCheckOk = await verifyAppCheck(req);
  if (appCheckOk) {
    return { ok: true, mode: 'app_check' };
  }

  return { ok: false, mode: 'denied' };
}
