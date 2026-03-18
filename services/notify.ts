import { ensureFirebase } from './firebaseClient';
import { getExpoExtraString } from './expoConfig';
import { devLog } from './logger';

function getFunctionsRegion() {
  return (
    getExpoExtraString('FIREBASE_FUNCTIONS_REGION') ||
    (process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION as string) ||
    'us-central1'
  );
}

export async function sendSigninNotification(email: string, ip?: string, meta?: any) {
  const fb = ensureFirebase();
  if (!fb || typeof (fb as any).functions !== 'function') {
    devLog('signin notification skipped: firebase unavailable', { email, ip, meta });
    return;
  }

  try {
    const callable = (fb as any).app().functions(getFunctionsRegion()).httpsCallable('sendSigninAlert');
    await callable({
      email,
      ip: ip || null,
      meta: meta && typeof meta === 'object' ? meta : {},
    });
  } catch (error) {
    devLog('sendSigninAlert failed', { error, meta });
  }
}

export default { sendSigninNotification };
