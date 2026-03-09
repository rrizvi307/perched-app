import { ensureFirebase } from './firebaseClient';
import { devLog } from './logger';

export type DetectionMetrics = {
  total: number;
  success: number;
  failure: number;
  successRate: number;
  avgDistanceKm: number | null;
  sources: Record<string, number>;
};

export async function getDetectionMetrics(limit = 300): Promise<DetectionMetrics> {
  const fb = ensureFirebase();
  if (!fb) {
    return { total: 0, success: 0, failure: 0, successRate: 0, avgDistanceKm: null, sources: {} };
  }
  try {
    const db = fb.firestore();
    const snap = await db
      .collection('eventLogs')
      .where('eventName', '==', 'place_detected')
      .orderBy('eventTime', 'desc')
      .limit(limit)
      .get();
    const logs = snap.docs.map((d: any) => d.data());
    let total = 0;
    let success = 0;
    let failure = 0;
    let distTotal = 0;
    let distCount = 0;
    const sources: Record<string, number> = {};
    logs.forEach((l: any) => {
      total += 1;
      if (l?.metadata?.success) {
        success += 1;
      } else {
        failure += 1;
      }
      const src = l?.metadata?.source;
      if (src) sources[src] = (sources[src] || 0) + 1;
      const d = l?.metadata?.distanceKm;
      if (typeof d === 'number' && !Number.isNaN(d)) {
        distTotal += d;
        distCount += 1;
      }
    });
    return {
      total,
      success,
      failure,
      successRate: total ? Math.round((success / total) * 100) : 0,
      avgDistanceKm: distCount ? distTotal / distCount : null,
      sources,
    };
  } catch (e) {
    devLog('getDetectionMetrics error', e);
    return { total: 0, success: 0, failure: 0, successRate: 0, avgDistanceKm: null, sources: {} };
  }
}

export async function getDetectionLogs(limit = 300) {
  const fb = ensureFirebase();
  if (!fb) return [];
  try {
    const db = fb.firestore();
    const snap = await db
      .collection('eventLogs')
      .where('eventName', '==', 'place_detected')
      .orderBy('eventTime', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    devLog('getDetectionLogs error', e);
    return [];
  }
}

export function exportDetectionCsv(logs: any[]) {
  const header = ['id', 'eventTime', 'userId', 'success', 'source', 'distanceKm', 'reason'];
  const rows = logs.map((l) => [
    l.id,
    l.eventTime || '',
    l.userId || '',
    l.metadata?.success ? 'true' : 'false',
    l.metadata?.source || '',
    typeof l.metadata?.distanceKm === 'number' ? l.metadata.distanceKm : '',
    l.metadata?.reason || '',
  ]);
  return [header.join(','), ...rows.map((r) => r.map((v: string) => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
}
