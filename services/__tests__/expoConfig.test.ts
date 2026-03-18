describe('expoConfig helpers', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('expo-constants');
  });

  function loadModule(constantsMock: any) {
    jest.resetModules();
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: constantsMock,
    }));
    return require('../expoConfig') as typeof import('../expoConfig');
  }

  it('merges release manifest extras and lets expoConfig win for overlaps', () => {
    const mod = loadModule({
      expoConfig: {
        extra: {
          ENV: 'production',
        },
      },
      manifest: {
        extra: {
          SENTRY_DSN: 'manifest-dsn',
        },
      },
      manifest2: {
        extra: {
          FIREBASE_FUNCTIONS_REGION: 'us-east1',
          expoClient: {
            extra: {
              FIREBASE_CONFIG: {
                appId: 'manifest2-app',
                projectId: 'manifest2-project',
              },
            },
          },
        },
      },
    });

    expect(mod.getExpoExtra()).toMatchObject({
      ENV: 'production',
      SENTRY_DSN: 'manifest-dsn',
      FIREBASE_FUNCTIONS_REGION: 'us-east1',
      FIREBASE_CONFIG: {
        appId: 'manifest2-app',
        projectId: 'manifest2-project',
      },
    });
  });

  it('reads Firebase config from manifest2 when expoConfig is unavailable', () => {
    const mod = loadModule({
      manifest2: {
        extra: {
          expoClient: {
            extra: {
              FIREBASE_CONFIG: {
                apiKey: 'api-key',
                authDomain: 'perched.firebaseapp.com',
              },
            },
          },
        },
      },
    });

    expect(mod.getExpoFirebaseConfig()).toEqual({
      apiKey: 'api-key',
      authDomain: 'perched.firebaseapp.com',
    });
  });
});
