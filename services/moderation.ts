import { ensureFirebase } from './firebaseClient';
import { devLog } from './logger';

export async function reportCheckinRemote(
  checkinId: string,
  reporterId?: string,
  reason?: string,
  reportedUserId?: string,
  spotName?: string
) {
  const fb = ensureFirebase();
  if (!fb) {
    devLog('reportCheckinRemote (local):', { checkinId, reporterId, reason, reportedUserId, spotName });
    return;
  }

  try {
    const db = fb.firestore();
    await db.collection('reports').add({
      checkinId,
      reporterId: reporterId || null,
      reportedUserId: reportedUserId || null,
      spotName: spotName || null,
      reason: reason || null,
      status: 'open',
      createdAt: fb.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    devLog('reportCheckinRemote error', e);
  }
}

export async function getReportsRemote(limit = 100) {
  const fb = ensureFirebase();
  if (!fb) return [];
  try {
    const db = fb.firestore();
    const snap = await db.collection('reports').orderBy('createdAt', 'desc').limit(limit).get();
    return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    devLog('getReportsRemote error', e);
    return [];
  }
}

export function exportReportsCsv(reports: any[]) {
  const header = ['id', 'checkinId', 'reporterId', 'reportedUserId', 'spotName', 'reason', 'status', 'createdAt'];
  const rows = reports.map((r) => [
    r.id,
    r.checkinId || '',
    r.reporterId || '',
    r.reportedUserId || '',
    r.spotName || '',
    r.reason || '',
    r.status || '',
    r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000).toISOString() : r.createdAt || '',
  ]);
  return [header.join(','), ...rows.map((r) => r.map((v: string) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
}

export async function updateReportStatus(reportId: string, status: 'open' | 'review' | 'resolved') {
  const fb = ensureFirebase();
  if (!fb) return;
  try {
    const db = fb.firestore();
    await db.collection('reports').doc(reportId).set({ status }, { merge: true });
  } catch (e) {
    devLog('updateReportStatus error', e);
  }
}
