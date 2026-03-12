import firebase from 'firebase/compat/app';
import 'firebase/compat/app-check';
import Constants from 'expo-constants';
import { ensureFirebase } from './firebaseClient';
import { observeIdTokenChanges } from './firebaseClient';
import { devLog } from './logger';

const GLOBAL_APP_CHECK_TOKEN_KEY = 'FIREBASE_APP_CHECK_TOKEN';
const APP_CHECK_CALLABLE = 'issueAppCheckToken';
const APP_CHECK_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const APP_CHECK_FAILURE_BACKOFF_MS = 10 * 60 * 1000;

let appCheckInitialized = false;
let tokenListenerUnsubscribe: (() => void) | null = null;
let authListenerUnsubscribe: (() => void) | null = null;
let appCheckTokenExpiryMs = 0;
let appCheckRetryAfterMs = 0;

function shouldEnableFirebaseAppCheck() {
  return !(typeof __DEV__ !== 'undefined' && __DEV__);
}

function getExpoExtra() {
  return ((Constants.expoConfig as any)?.extra || {}) as Record<string, any>;
}

function getFirebaseAppId() {
  const extra = getExpoExtra();
  return (
    (process.env.EXPO_PUBLIC_FIREBASE_APP_ID as string) ||
    (process.env.FIREBASE_APP_ID as string) ||
    (extra?.FIREBASE_CONFIG?.appId as string) ||
    ((global as any)?.FIREBASE_CONFIG?.appId as string) ||
    ''
  );
}

function getFunctionsRegion() {
  const extra = getExpoExtra();
  return (
    (process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION as string) ||
    (process.env.FIREBASE_FUNCTIONS_REGION as string) ||
    (extra?.FIREBASE_FUNCTIONS_REGION as string) ||
    'us-central1'
  );
}

function setGlobalAppCheckToken(token?: string | null) {
  (global as any)[GLOBAL_APP_CHECK_TOKEN_KEY] = typeof token === 'string' ? token.trim() : '';
}

function setAppCheckTokenState(token?: string | null, expireTimeMillis?: number | null) {
  setGlobalAppCheckToken(token);
  appCheckTokenExpiryMs =
    typeof expireTimeMillis === 'number' && Number.isFinite(expireTimeMillis)
      ? expireTimeMillis
      : 0;
  if (typeof token === 'string' && token.trim()) {
    appCheckRetryAfterMs = 0;
  }
}

function isAppCheckFailureBackoffActive() {
  return appCheckRetryAfterMs > Date.now();
}

function noteAppCheckFailure() {
  setGlobalAppCheckToken('');
  appCheckTokenExpiryMs = 0;
  appCheckRetryAfterMs = Date.now() + APP_CHECK_FAILURE_BACKOFF_MS;
}

export function getCurrentFirebaseAppCheckToken() {
  const token = (global as any)?.[GLOBAL_APP_CHECK_TOKEN_KEY];
  if (typeof token !== 'string' || token.trim().length === 0) return '';
  if (appCheckTokenExpiryMs && Date.now() >= appCheckTokenExpiryMs - APP_CHECK_REFRESH_BUFFER_MS) {
    return '';
  }
  return token.trim();
}

async function issueCustomAppCheckToken(appId: string) {
  const fb = ensureFirebase();
  if (!fb || typeof (fb as any).functions !== 'function') {
    throw new Error('Firebase Functions unavailable for App Check');
  }

  const callable = (fb as any).app().functions(getFunctionsRegion()).httpsCallable(APP_CHECK_CALLABLE);
  const response = await callable({ appId });
  const token = typeof response?.data?.token === 'string' ? response.data.token.trim() : '';
  const expireTimeMillis =
    typeof response?.data?.expireTimeMillis === 'number'
      ? response.data.expireTimeMillis
      : Date.now() + 55 * 60 * 1000;
  if (!token) {
    throw new Error('App Check issuer returned no token');
  }
  return { token, expireTimeMillis };
}

export async function initFirebaseAppCheck() {
  if (isAppCheckFailureBackoffActive()) return null;
  if (!shouldEnableFirebaseAppCheck()) return null;
  const fb = ensureFirebase();
  if (!fb || typeof (fb as any).appCheck !== 'function') return null;
  if (appCheckInitialized) {
    return (fb as any).appCheck();
  }

  const appId = getFirebaseAppId();
  if (!appId) {
    devLog('Firebase App Check skipped: missing Firebase app id');
    return null;
  }

  const compatFirebase = (firebase as any)?.default ?? firebase;
  const provider = new compatFirebase.appCheck.CustomProvider({
    getToken: async () => issueCustomAppCheckToken(appId),
  });

  const appCheck = (fb as any).appCheck();
  appCheck.activate(provider, true);
  if (typeof appCheck.setTokenAutoRefreshEnabled === 'function') {
    appCheck.setTokenAutoRefreshEnabled(true);
  }

  tokenListenerUnsubscribe = appCheck.onTokenChanged(
    (tokenResult: { token?: string; expireTimeMillis?: number }) => {
      setAppCheckTokenState(tokenResult?.token || '', tokenResult?.expireTimeMillis || null);
    },
    (error: Error) => {
      noteAppCheckFailure();
      devLog('Firebase App Check token listener failed', error);
    },
  );

  authListenerUnsubscribe = observeIdTokenChanges(() => {
    void appCheck.getToken(true).catch((error: any) => {
      devLog('Firebase App Check refresh failed after auth change', error);
    });
  });

  appCheckInitialized = true;

  try {
    const tokenResult = await appCheck.getToken(true);
    setAppCheckTokenState(tokenResult?.token || '', tokenResult?.expireTimeMillis || null);
  } catch (error) {
    noteAppCheckFailure();
    devLog('Firebase App Check initial token fetch failed', error);
  }

  return appCheck;
}

export async function refreshFirebaseAppCheckToken(forceRefresh = false) {
  if (isAppCheckFailureBackoffActive()) return '';
  if (!shouldEnableFirebaseAppCheck()) return '';
  const fb = ensureFirebase();
  if (!fb || typeof (fb as any).appCheck !== 'function') return '';
  if (!forceRefresh) {
    const cached = getCurrentFirebaseAppCheckToken();
    if (cached) return cached;
  }
  const appCheck = await initFirebaseAppCheck();
  if (!appCheck) return '';
  try {
    const tokenResult = await (appCheck as any).getToken(Boolean(forceRefresh));
    const token = typeof tokenResult?.token === 'string' ? tokenResult.token.trim() : '';
    setAppCheckTokenState(token, tokenResult?.expireTimeMillis || null);
    return token;
  } catch (error) {
    noteAppCheckFailure();
    devLog('Firebase App Check getToken failed', error);
    return '';
  }
}

export function resetFirebaseAppCheckForTests() {
  appCheckInitialized = false;
  appCheckTokenExpiryMs = 0;
  appCheckRetryAfterMs = 0;
  tokenListenerUnsubscribe?.();
  tokenListenerUnsubscribe = null;
  authListenerUnsubscribe?.();
  authListenerUnsubscribe = null;
  setAppCheckTokenState('');
}
