import { ensureFirebase } from './firebaseClient';
import { devLog } from './logger';

export async function logEvent(eventName: string, userId?: string, metadata?: Record<string, any>) {
  const fb = ensureFirebase();
  const authUid = fb?.auth?.()?.currentUser?.uid || null;
  const resolvedUserId = userId || authUid;
  const payload = {
    eventName,
    userId: resolvedUserId || null,
    eventTime: new Date().toISOString(),
    metadata: metadata || {},
  };

  if (!fb) {
    // fallback: console.log and no-op
    devLog('logEvent (local):', payload);
    return;
  }

  // Firestore rules require authenticated writes with request.resource.data.userId == request.auth.uid.
  if (!authUid || !resolvedUserId || resolvedUserId !== authUid) {
    devLog('logEvent skipped (auth mismatch or missing user)', {
      eventName,
      authUid,
      resolvedUserId,
    });
    return;
  }

  try {
    const db = fb.firestore();
    void db.collection('eventLogs').add(payload).catch((e: any) => {
      devLog('logEvent error:', e);
    });
  } catch (e) {
    devLog('logEvent error:', e);
  }
}
