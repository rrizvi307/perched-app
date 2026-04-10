const {
  evaluateSubmissionGate,
  getPostDeploySmokeArgs,
  isProxyOnlyEnabled,
  isSubmissionEnv,
} = require('../release-preflight.js');

describe('release preflight submission gate', () => {
  const validEnv = {
    ENV: 'production',
    SMOKE_TEST_EMAIL: 'smoke@perched.app',
    SMOKE_TEST_PASSWORD: 'secret',
    REQUIRE_AUTH_SMOKE_CHECK: 'true',
    REQUIRE_PLACE_PROVIDER_SMOKE_CHECK: 'true',
    REQUIRE_PROXY_ONLY_PARITY: 'true',
    REQUIRE_POST_DEPLOY_SMOKE_CHECK: 'true',
    FORCE_PROXY_ONLY: 'true',
  };

  it('accepts a fully configured submission gate', () => {
    const result = evaluateSubmissionGate(validEnv);

    expect(result).toEqual({
      errors: [],
      hasSmokeCredentials: true,
      proxyOnlyEnabled: true,
    });
  });

  it('rejects missing smoke credentials and required release flags', () => {
    const result = evaluateSubmissionGate({
      ENV: 'production',
    });

    expect(result.errors).toEqual(
      expect.arrayContaining([
        'SMOKE_TEST_EMAIL is required for the App Store submission gate.',
        'SMOKE_TEST_PASSWORD is required for the App Store submission gate.',
        'REQUIRE_AUTH_SMOKE_CHECK=true is required for the App Store submission gate.',
        'REQUIRE_PLACE_PROVIDER_SMOKE_CHECK=true is required for the App Store submission gate.',
        'REQUIRE_PROXY_ONLY_PARITY=true is required for the App Store submission gate.',
        'REQUIRE_POST_DEPLOY_SMOKE_CHECK=true is required for the App Store submission gate.',
        'FORCE_PROXY_ONLY=true or EXPO_PUBLIC_FORCE_PROXY_ONLY=true is required for the App Store submission gate.',
      ]),
    );
  });

  it('rejects non-production ENV', () => {
    const result = evaluateSubmissionGate({
      ...validEnv,
      ENV: 'development',
    });

    expect(result.errors).toContain(
      'ENV=production is required for the App Store submission gate.',
    );
  });

  it('accepts EXPO_PUBLIC_FORCE_PROXY_ONLY as the proxy-only toggle', () => {
    const result = evaluateSubmissionGate({
      ...validEnv,
      FORCE_PROXY_ONLY: '',
      EXPO_PUBLIC_FORCE_PROXY_ONLY: 'true',
    });

    expect(result.errors).toEqual([]);
    expect(result.proxyOnlyEnabled).toBe(true);
  });
});

describe('release preflight helpers', () => {
  it('detects proxy-only mode from either env key', () => {
    expect(isProxyOnlyEnabled({ FORCE_PROXY_ONLY: 'true' })).toBe(true);
    expect(isProxyOnlyEnabled({ EXPO_PUBLIC_FORCE_PROXY_ONLY: 'true' })).toBe(true);
    expect(isProxyOnlyEnabled({ FORCE_PROXY_ONLY: 'false' })).toBe(false);
  });

  it('detects submission env case-insensitively', () => {
    expect(isSubmissionEnv({ ENV: 'production' })).toBe(true);
    expect(isSubmissionEnv({ ENV: 'Production' })).toBe(true);
    expect(isSubmissionEnv({ ENV: 'development' })).toBe(false);
  });

  it('forwards local service-account and project args to post-deploy smoke checks', () => {
    expect(
      getPostDeploySmokeArgs({
        POST_DEPLOY_SERVICE_ACCOUNT: '/tmp/perched-smoke.json',
        FIREBASE_PROJECT_ID: 'spot-app-ce2d8',
      }),
    ).toEqual([
      'run',
      'post-deploy:smoke-check',
      '--',
      '--service-account',
      '/tmp/perched-smoke.json',
      '--project',
      'spot-app-ce2d8',
    ]);
  });

  it('falls back to GOOGLE_APPLICATION_CREDENTIALS when no explicit post-deploy path is set', () => {
    expect(
      getPostDeploySmokeArgs({
        GOOGLE_APPLICATION_CREDENTIALS: '/tmp/application-default.json',
      }),
    ).toEqual([
      'run',
      'post-deploy:smoke-check',
      '--',
      '--service-account',
      '/tmp/application-default.json',
    ]);
  });
});
