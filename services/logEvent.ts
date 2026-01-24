import { ensureFirebase } from './firebaseClient';
import { devLog } from './logger';

export async function logEvent(eventName: string, userId?: string, metadata?: Record<string, any>) {
  const fb = ensureFirebase();
  const payload = {
    eventName,
    userId: userId || null,
    eventTime: new Date().toISOString(),
    metadata: metadata || {},
  };

  if (!fb) {
    // fallback: console.log and no-op
    devLog('logEvent (local):', payload);
    return;
  }

  try {
    const db = fb.firestore();
    void db.collection('event_logs').add(payload).catch((e: any) => {
      devLog('logEvent error:', e);
    });
  } catch (e) {
    devLog('logEvent error:', e);
  }
}
