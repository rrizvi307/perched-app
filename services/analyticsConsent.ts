/**
 * Analytics consent management.
 *
 * Stores the user's choice in AsyncStorage and exposes a reactive getter
 * so that Sentry and Firebase Analytics can gate themselves at init time
 * and when the user changes their preference in Settings.
 */

const CONSENT_KEY = 'perched_analytics_consent_v1';

let cachedConsent: boolean | null = null;

function isTestEnv(): boolean {
  return typeof process !== 'undefined' && typeof process.env?.JEST_WORKER_ID === 'string';
}

async function getStore() {
  try {
    const mod = await import('@react-native-async-storage/async-storage');
    return (mod as any).default || mod;
  } catch {
    return null;
  }
}

/** Returns true if user has explicitly granted consent. null = not yet asked. */
export async function getAnalyticsConsent(): Promise<boolean | null> {
  if (cachedConsent !== null) return cachedConsent;
  try {
    const store = await getStore();
    if (!store) return null;
    const raw = await store.getItem(CONSENT_KEY);
    if (raw === null) return null;
    cachedConsent = raw === 'true';
    return cachedConsent;
  } catch {
    return null;
  }
}

/** Persist user's consent choice. */
export async function setAnalyticsConsent(granted: boolean): Promise<void> {
  cachedConsent = granted;
  try {
    const store = await getStore();
    if (!store) return;
    await store.setItem(CONSENT_KEY, String(granted));
  } catch {}
}

/** Synchronous check — returns the last cached value. */
export function isAnalyticsConsentGranted(): boolean {
  if (isTestEnv()) return true;
  return cachedConsent === true;
}

/** Returns true if the user hasn't been asked yet. */
export function isConsentPending(): boolean {
  return cachedConsent === null;
}

/** Hydrate the cache from storage. Call once at app startup. */
export async function seedAnalyticsConsent(): Promise<void> {
  await getAnalyticsConsent();
}
