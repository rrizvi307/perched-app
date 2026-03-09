import Constants from 'expo-constants';
import { ensureFirebase } from '@/services/firebaseClient';

type DiagnosticStatus = 'ok' | 'fail' | 'skipped';

export type FirebaseDiagnosticsResult = {
  config: {
    projectId?: string;
    storageBucket?: string;
    apiKeyPresent: boolean;
  };
  firestore: { status: DiagnosticStatus; error?: string };
  storage: { status: DiagnosticStatus; error?: string };
};

const ONE_BY_ONE_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';

export async function runFirebaseDiagnostics(): Promise<FirebaseDiagnosticsResult> {
  const config = (Constants.expoConfig as any)?.extra?.FIREBASE_CONFIG || (global as any)?.FIREBASE_CONFIG || {};
  const apiKeyPresent = typeof config?.apiKey === 'string' && config.apiKey.trim().length > 0;
  const result: FirebaseDiagnosticsResult = {
    config: {
      projectId: config?.projectId,
      storageBucket: config?.storageBucket,
      apiKeyPresent,
    },
    firestore: { status: 'skipped' },
    storage: { status: 'skipped' },
  };

  const fb = ensureFirebase();
  if (!fb) {
    result.firestore = { status: 'fail', error: 'Firebase not initialized' };
    result.storage = { status: 'fail', error: 'Firebase not initialized' };
    return result;
  }

  const uid = fb.auth?.()?.currentUser?.uid || null;

  try {
    const db = fb.firestore();
    const docRef = db.collection('diagnostics').doc('client_ping');
    await docRef.set({ ts: fb.firestore.FieldValue.serverTimestamp() }, { merge: true });
    await docRef.get();
    result.firestore = { status: 'ok' };
  } catch (e: any) {
    result.firestore = { status: 'fail', error: String(e?.message || e) };
  }

  if (!uid) {
    result.storage = { status: 'fail', error: 'No authenticated user for storage test' };
    return result;
  }

  try {
    const storage = fb.storage();
    const path = `checkins/${uid}/diagnostics-${Date.now()}.png`;
    const ref = storage.ref().child(path);
    await ref.putString(ONE_BY_ONE_PNG, 'data_url');
    await ref.getDownloadURL();
    result.storage = { status: 'ok' };
  } catch (e: any) {
    result.storage = { status: 'fail', error: String(e?.message || e) };
  }

  return result;
}
