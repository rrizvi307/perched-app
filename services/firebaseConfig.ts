export const FIREBASE_REQUIRED_CONFIG_KEYS = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
] as const;

export type FirebaseRequiredConfigKey = (typeof FIREBASE_REQUIRED_CONFIG_KEYS)[number];

export type FirebaseConfigRecord = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId: string;
};

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeFirebaseConfig(input?: Record<string, unknown> | null): FirebaseConfigRecord {
  const raw = input || {};
  return {
    apiKey: normalizeString(raw.apiKey),
    authDomain: normalizeString(raw.authDomain),
    projectId: normalizeString(raw.projectId),
    storageBucket: normalizeString(raw.storageBucket),
    messagingSenderId: normalizeString(raw.messagingSenderId),
    appId: normalizeString(raw.appId),
    measurementId: normalizeString(raw.measurementId),
  };
}

export function getMissingFirebaseConfigKeys(input?: Record<string, unknown> | null): FirebaseRequiredConfigKey[] {
  const config = normalizeFirebaseConfig(input);
  return FIREBASE_REQUIRED_CONFIG_KEYS.filter((key) => !config[key]);
}

export function getFirebaseConfigStatus(input?: Record<string, unknown> | null) {
  const config = normalizeFirebaseConfig(input);
  const missingKeys = getMissingFirebaseConfigKeys(config);
  return {
    configured: missingKeys.length === 0,
    missingKeys,
    config,
  };
}
