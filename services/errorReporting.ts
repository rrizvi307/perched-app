import { initSentry, setUser, clearUser, captureException, captureMessage, addBreadcrumb } from './sentry';

let _initialized = false;

export function initErrorReporting() {
  if (_initialized) return;
  try {
    initSentry();
    _initialized = true;
  } catch (error) {
    console.error('Failed to initialize error reporting:', error);
  }
}

// Re-export Sentry utilities for convenience
export { setUser, clearUser, captureException, captureMessage, addBreadcrumb };
