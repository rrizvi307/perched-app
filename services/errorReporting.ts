let _initialized = false;

export function initErrorReporting() {
  if (_initialized) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Sentry = require('@sentry/react-native');
    if (Sentry?.init) {
      Sentry.init({
        dsn: process.env.SENTRY_DSN || (global as any)?.SENTRY_DSN || '',
        enableInExpoDevelopment: false,
        tracesSampleRate: 0.2,
      });
      _initialized = true;
    }
  } catch {
    // no-op if Sentry not installed
  }
}
