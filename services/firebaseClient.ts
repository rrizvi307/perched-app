// Lightweight Firebase client wrapper (dynamic import).
// Fill FIREBASE_CONFIG below or load from env. Install `firebase` locally to enable runtime.

import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/storage';
import 'firebase/compat/functions';
import Constants from 'expo-constants';
import { spotKey } from '@/services/spotUtils';
import { devLog } from '@/services/logger';
import { normalizePhone } from '@/utils/phone';
import { recordPerfMetric } from './perfMonitor';
import { withErrorBoundary } from './errorBoundary';
import { registerSubscription } from './memoryMonitor';
import {
  invalidateCacheOnCheckinCreate,
  invalidateCacheOnCheckinDelete,
  invalidateCacheOnCheckinUpdate,
  invalidateCacheOnMetricUpdate,
} from './cacheInvalidation';
import { queryAllCheckins, queryCheckinsByUser, subscribeApprovedCheckins as subscribeApprovedCheckinsHelper } from './schemaHelpers';
import { addMutualFriend, removeFriendRequestPair, removeMutualFriend } from './friendsLocalUtils';

// Helper to get config from Expo Constants or environment
function getConfigValue(key: string): string {
  // Try Expo config first (injected via app.config.js)
  const expoConfig = (Constants.expoConfig as any)?.extra?.FIREBASE_CONFIG;
  if (expoConfig && expoConfig[key]) {
    return expoConfig[key];
  }

  // Try global (set in _layout.tsx)
  const globalConfig = (global as any)?.FIREBASE_CONFIG;
  if (globalConfig && globalConfig[key]) {
    return globalConfig[key];
  }

  // Try environment variables
  const envKey = `FIREBASE_${key.replace(/([A-Z])/g, '_$1').toUpperCase()}`;
  const expoPublicKey = `EXPO_PUBLIC_${envKey}`;

  return (
    (process.env[expoPublicKey] as string) ||
    (process.env[envKey] as string) ||
    ''
  );
}

export const FIREBASE_CONFIG = {
  apiKey: getConfigValue('apiKey'),
  authDomain: getConfigValue('authDomain'),
  projectId: getConfigValue('projectId'),
  storageBucket: getConfigValue('storageBucket'),
  messagingSenderId: getConfigValue('messagingSenderId'),
  appId: getConfigValue('appId'),
  measurementId: getConfigValue('measurementId'),
};

function getStorageBucketCandidates() {
  const config = resolveFirebaseConfig();
  const envBucket = (process.env.FIREBASE_STORAGE_BUCKET as string) || (global as any)?.FIREBASE_STORAGE_BUCKET;
  const projectBucketLegacy = config.projectId ? `${config.projectId}.appspot.com` : '';
  const projectBucketModern = config.projectId ? `${config.projectId}.firebasestorage.app` : '';
  const buckets = [envBucket, config.storageBucket, projectBucketLegacy, projectBucketModern].filter((b) => typeof b === 'string' && b.trim().length > 0);
  return Array.from(new Set(buckets));
}


function resolveFirebaseConfig() {
  const envRaw = process.env.FIREBASE_CONFIG as string | undefined;
  let envConfig: any = null;
  if (envRaw) {
    try {
      envConfig = JSON.parse(envRaw);
    } catch {
      envConfig = null;
    }
  }
  const globalConfig = (global as any)?.FIREBASE_CONFIG || null;
  return {
    ...FIREBASE_CONFIG,
    ...(envConfig || {}),
    ...(globalConfig || {}),
  };
}

export function isFirebaseConfigured() {
  // allow overriding via env/global at runtime
  const config = resolveFirebaseConfig();
  const key = (process.env.FIREBASE_API_KEY as string) || (process.env.FIREBASE_APIKEY as string) || (process.env.FIREBASE_CONFIG && (process.env.FIREBASE_CONFIG as any).apiKey) || config.apiKey || (global as any)?.FIREBASE_API_KEY || (global as any)?.FIREBASE_CONFIG?.apiKey;
  if (!key) return false;
  if (typeof key === 'string' && (key.trim() === '' || key.includes('REPLACE_ME'))) return false;
  return true;
}

let _initialized = false;
let _firebaseApp: any = null;
let _initError: any = null;
const checkinsCache = new Map<string, { ts: number; payload: any }>();
const usersByIdCache = new Map<string, { ts: number; payload: any[] }>();
const userFriendsCache = new Map<string, { ts: number; payload: string[] }>();
const CHECKINS_CACHE_MAX = 120;
const USERS_BY_ID_CACHE_MAX = 160;
const USER_FRIENDS_CACHE_MAX = 300;

function getCachedValue<T>(
  cache: Map<string, { ts: number; payload: T }>,
  key: string,
  ttlMs: number
): T | null {
  const cached = cache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.ts >= ttlMs) {
    cache.delete(key);
    return null;
  }
  // Promote hot keys to keep LRU-ish eviction behavior.
  cache.delete(key);
  cache.set(key, cached);
  return cached.payload;
}

function setCachedValue<T>(
  cache: Map<string, { ts: number; payload: T }>,
  key: string,
  payload: T,
  maxEntries: number
) {
  cache.set(key, { ts: Date.now(), payload });
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

function toMillisSafe(value: any): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value?.toMillis === 'function') {
    try {
      return value.toMillis();
    } catch {}
  }
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function invalidateCheckinsCache() {
  checkinsCache.clear();
}

function invalidateUserFriendsCache(userIds: Array<string | undefined | null>) {
  userIds.forEach((userId) => {
    if (!userId) return;
    userFriendsCache.delete(userId);
  });
}

function resolveSpotId(payload: Record<string, any> | null | undefined): string {
  if (!payload) return '';
  const spotPlaceId = payload.spotPlaceId;
  if (typeof spotPlaceId === 'string' && spotPlaceId.trim()) return spotPlaceId.trim();
  const spotId = payload.spotId;
  if (typeof spotId === 'string' && spotId.trim()) return spotId.trim();
  return '';
}

function hasMetricUpdates(fields: Record<string, any>): boolean {
  const metricFields = ['wifiSpeed', 'noiseLevel', 'busyness', 'outletAvailability', 'outlets', 'tags', 'spotLatLng'];
  return metricFields.some((field) => Object.prototype.hasOwnProperty.call(fields, field));
}

function hasOutcomeMetricUpdates(fields: Record<string, any>): boolean {
  const metricFields = ['wifiSpeed', 'noiseLevel', 'busyness', 'laptopFriendly', 'outletAvailability', 'outlets'];
  return metricFields.some((field) => Object.prototype.hasOwnProperty.call(fields, field));
}

function normalizeNoiseScore(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(1, Math.min(5, value));
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'silent') return 1;
  if (normalized === 'quiet') return 2;
  if (normalized === 'moderate' || normalized === 'average') return 3;
  if (normalized === 'lively') return 4;
  if (normalized === 'loud') return 5;
  return null;
}

function normalizeScore(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(1, Math.min(5, value));
}

function normalizeBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  }
  return null;
}

function round(value: number, digits = 2): number {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

type OutcomeQualityLabel = 'excellent' | 'good' | 'mixed' | 'poor';

function toLowerStrings(values: string[]) {
  return values.map((value) => value.trim().toLowerCase()).filter(Boolean);
}

function estimateTagQualityDelta(tags: string[]) {
  const normalized = toLowerStrings(tags);
  const positive = [
    'quiet',
    'wifi',
    'wi-fi',
    'outlets',
    'outlet',
    'focus',
    'study',
    'laptop',
    'productive',
    'deep work',
  ];
  const negative = [
    'loud',
    'noisy',
    'crowded',
    'packed',
    'slow wifi',
    'no wifi',
    'chaotic',
  ];
  let score = 0;
  normalized.forEach((tag) => {
    if (positive.some((token) => tag.includes(token))) score += 4;
    if (negative.some((token) => tag.includes(token))) score -= 5;
  });
  return Math.max(-14, Math.min(14, score));
}

function estimateCaptionQualityDelta(caption: string) {
  const normalized = String(caption || '').toLowerCase();
  if (!normalized.trim()) return 0;
  const positiveTokens = ['productive', 'great wifi', 'fast wifi', 'quiet', 'focused', 'smooth', 'good outlet'];
  const negativeTokens = ['loud', 'noisy', 'crowded', 'packed', 'slow wifi', 'bad wifi', 'couldn\'t focus', 'chaos'];
  let score = 0;
  positiveTokens.forEach((token) => {
    if (normalized.includes(token)) score += 5;
  });
  negativeTokens.forEach((token) => {
    if (normalized.includes(token)) score -= 6;
  });
  return Math.max(-18, Math.min(18, score));
}

function deriveOutcomeQuality(
  checkin: Record<string, any>,
  observed: { observedWorkScore: number; signalCount: number }
) {
  const tags = normalizeStringArray(checkin.tags);
  const caption = typeof checkin.caption === 'string' ? checkin.caption : '';
  const tagDelta = estimateTagQualityDelta(tags);
  const captionDelta = estimateCaptionQualityDelta(caption);
  const outcomeQualityScore = Math.max(0, Math.min(100, observed.observedWorkScore + tagDelta + captionDelta));

  let outcomeQualityLabel: OutcomeQualityLabel = 'mixed';
  if (outcomeQualityScore >= 80) outcomeQualityLabel = 'excellent';
  else if (outcomeQualityScore >= 65) outcomeQualityLabel = 'good';
  else if (outcomeQualityScore < 45) outcomeQualityLabel = 'poor';

  const signalBonus = Math.min(0.2, observed.signalCount * 0.04);
  const annotationBonus = Math.min(0.15, (tags.length ? 0.08 : 0) + (caption.trim() ? 0.07 : 0));
  const outcomeQualityConfidence = round(Math.max(0.2, Math.min(0.95, 0.45 + signalBonus + annotationBonus)), 2);

  const reasons: string[] = [];
  if (observed.observedWorkScore >= 75) reasons.push('strong_core_metrics');
  if (observed.observedWorkScore < 45) reasons.push('weak_core_metrics');
  if (tagDelta > 0) reasons.push('positive_tags');
  if (tagDelta < 0) reasons.push('negative_tags');
  if (captionDelta > 0) reasons.push('positive_caption_signal');
  if (captionDelta < 0) reasons.push('negative_caption_signal');

  return {
    outcomeQualityLabel,
    outcomeQualityScore,
    outcomeQualityConfidence,
    outcomeQualityReasons: reasons.slice(0, 4),
  };
}

function buildObservedWorkScore(checkin: Record<string, any>) {
  const wifi = normalizeScore(checkin.wifiSpeed);
  const noise = normalizeNoiseScore(checkin.noiseLevel);
  const busyness = normalizeScore(checkin.busyness);
  const laptop = normalizeBool(checkin.laptopFriendly);
  const outletsBool = normalizeBool(checkin.outletAvailability);
  const outletsScore = normalizeScore(checkin.outlets);

  let score = 0;
  let weight = 0;
  let signalCount = 0;

  if (wifi !== null) {
    signalCount += 1;
    weight += 35;
    score += ((wifi - 1) / 4) * 35;
  }
  if (noise !== null) {
    signalCount += 1;
    weight += 25;
    score += ((5 - noise) / 4) * 25;
  }
  if (busyness !== null) {
    signalCount += 1;
    weight += 20;
    score += ((5 - busyness) / 4) * 20;
  }
  if (laptop !== null) {
    signalCount += 1;
    weight += 12;
    score += laptop ? 12 : 2;
  }
  if (outletsBool !== null || outletsScore !== null) {
    signalCount += 1;
    weight += 8;
    if (outletsBool !== null) {
      score += outletsBool ? 8 : 2;
    } else if (outletsScore !== null) {
      score += ((outletsScore - 1) / 4) * 8;
    }
  }

  if (signalCount < 2 || weight <= 0) return null;

  const observedWorkScore = Math.max(0, Math.min(100, Math.round((score / weight) * 100)));
  return {
    observedWorkScore,
    signalCount,
    metrics: {
      wifiSpeed: wifi,
      noiseLevel: noise,
      busyness,
      laptopFriendly: laptop,
      outletAvailability: outletsBool,
      outlets: outletsScore,
    },
  };
}

function toSafeFieldKey(value: string): string {
  return String(value || 'unknown').replace(/[.#$/\[\]\s]+/g, '_').slice(0, 80) || 'unknown';
}

async function linkCheckinOutcomeTelemetry(checkinId: string, checkin: Record<string, any>) {
  const fb = ensureFirebase();
  if (!fb || !checkinId) return;

  const placeId = typeof checkin.spotPlaceId === 'string' ? checkin.spotPlaceId.trim() : '';
  const placeName = typeof checkin.spotName === 'string' ? checkin.spotName.trim() : '';
  const userId = typeof checkin.userId === 'string' ? checkin.userId.trim() : '';
  if (!placeId && !placeName) return;
  if (!userId) return;

  const observed = buildObservedWorkScore(checkin);
  if (!observed) return;

  const startedAt = Date.now();
  try {
    const db = fb.firestore();
    const createdAtMs =
      toMillisSafe(checkin.createdAt) ||
      toMillisSafe(checkin.createdAtServer) ||
      (typeof checkin.createdAtMs === 'number' ? checkin.createdAtMs : 0) ||
      Date.now();

    const windowStart = fb.firestore.Timestamp.fromMillis(createdAtMs - 6 * 60 * 60 * 1000);
    const windowEnd = fb.firestore.Timestamp.fromMillis(createdAtMs + 20 * 60 * 1000);

    const snapshot = await db
      .collection('intelligencePredictions')
      .where('createdAt', '>=', windowStart)
      .where('createdAt', '<=', windowEnd)
      .orderBy('createdAt', 'desc')
      .limit(60)
      .get();

    type Candidate = {
      id: string;
      data: Record<string, any>;
      score: number;
      predictionCreatedAtMs: number;
    };

    const normalizedPlaceName = placeName.toLowerCase();
    const candidates: Candidate[] = [];

    snapshot.forEach((doc: any) => {
      const data = (doc.data() || {}) as Record<string, any>;
      const predictedScore = typeof data.workScore === 'number' ? data.workScore : null;
      if (predictedScore === null) return;

      const predictionPlaceId = typeof data.placeId === 'string' ? data.placeId.trim() : '';
      const predictionPlaceName = typeof data.placeName === 'string' ? data.placeName.trim().toLowerCase() : '';
      const predictionUserId = typeof data.userId === 'string' ? data.userId.trim() : '';
      const predictionCreatedAtMs = toMillisSafe(data.createdAt) || toMillisSafe(data.generatedAt);

      let score = 0;
      if (placeId && predictionPlaceId && placeId === predictionPlaceId) score += 5;
      if (!placeId && placeName && predictionPlaceName && normalizedPlaceName === predictionPlaceName) score += 4;
      if (placeId && placeName && predictionPlaceName && normalizedPlaceName === predictionPlaceName) score += 1;
      if (predictionUserId && userId === predictionUserId) score += 2;
      if (predictionCreatedAtMs > 0 && predictionCreatedAtMs <= createdAtMs) {
        const ageHours = (createdAtMs - predictionCreatedAtMs) / (60 * 60 * 1000);
        score += Math.max(0, 2 - ageHours * 0.4);
      }

      if (score <= 0) return;
      candidates.push({ id: doc.id, data, score, predictionCreatedAtMs });
    });

    if (!candidates.length) {
      await recordPerfMetric('place_intelligence_outcome_link', Date.now() - startedAt, false);
      return;
    }

    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.predictionCreatedAtMs - a.predictionCreatedAtMs;
    });
    const best = candidates[0];
    const predictedWorkScore = typeof best.data.workScore === 'number' ? best.data.workScore : 0;
    const predictedConfidence = typeof best.data.confidence === 'number' ? best.data.confidence : 0;
    const modelVersion = typeof best.data.modelVersion === 'string' ? best.data.modelVersion : 'unknown';
    const signedError = round(observed.observedWorkScore - predictedWorkScore, 2);
    const absError = Math.abs(signedError);
    const squaredError = round(signedError * signedError, 4);

    const confidenceBucket =
      predictedConfidence >= 0.75 ? 'high' : predictedConfidence >= 0.5 ? 'medium' : 'low';
    const outcomeQuality = deriveOutcomeQuality(checkin, observed);
    const qualityKey = outcomeQuality.outcomeQualityLabel;
    const modelKey = toSafeFieldKey(modelVersion);
    const outcomeId = toSafeFieldKey(`${checkinId}_${best.id}`);
    const outcomeRef = db.collection('intelligenceOutcomes').doc(outcomeId);
    const existingOutcome = await outcomeRef.get();
    if (existingOutcome.exists) {
      await recordPerfMetric('place_intelligence_outcome_link', Date.now() - startedAt, true);
      return;
    }

    const outcomeDoc = {
      checkinId,
      predictionId: best.id,
      userId,
      placeId: placeId || null,
      placeName: placeName || null,
      modelVersion,
      predictedWorkScore,
      predictedConfidence,
      observedWorkScore: observed.observedWorkScore,
      observedMetrics: observed.metrics,
      observedSignalCount: observed.signalCount,
      signedError,
      absError,
      squaredError,
      outcomeQualityLabel: outcomeQuality.outcomeQualityLabel,
      outcomeQualityScore: outcomeQuality.outcomeQualityScore,
      outcomeQualityConfidence: outcomeQuality.outcomeQualityConfidence,
      outcomeQualityReasons: outcomeQuality.outcomeQualityReasons,
      checkinCreatedAtMs: createdAtMs,
      linkedAt: fb.firestore.FieldValue.serverTimestamp(),
      linkedAtMs: Date.now(),
    };

    await outcomeRef.set(outcomeDoc, { merge: true });

    await db.collection('intelligenceCalibrationMetrics').doc('current').set({
      updatedAt: fb.firestore.FieldValue.serverTimestamp(),
      sampleCount: fb.firestore.FieldValue.increment(1),
      absErrorSum: fb.firestore.FieldValue.increment(absError),
      squaredErrorSum: fb.firestore.FieldValue.increment(squaredError),
      outcomeQualityScoreSum: fb.firestore.FieldValue.increment(outcomeQuality.outcomeQualityScore),
      outcomeQualityConfidenceSum: fb.firestore.FieldValue.increment(outcomeQuality.outcomeQualityConfidence),
      [`confidenceBuckets.${confidenceBucket}.count`]: fb.firestore.FieldValue.increment(1),
      [`confidenceBuckets.${confidenceBucket}.absErrorSum`]: fb.firestore.FieldValue.increment(absError),
      [`qualityBuckets.${qualityKey}.count`]: fb.firestore.FieldValue.increment(1),
      [`qualityBuckets.${qualityKey}.absErrorSum`]: fb.firestore.FieldValue.increment(absError),
      [`qualityBuckets.${qualityKey}.qualityScoreSum`]:
        fb.firestore.FieldValue.increment(outcomeQuality.outcomeQualityScore),
      [`qualityBuckets.${qualityKey}.qualityConfidenceSum`]:
        fb.firestore.FieldValue.increment(outcomeQuality.outcomeQualityConfidence),
      [`models.${modelKey}.count`]: fb.firestore.FieldValue.increment(1),
      [`models.${modelKey}.absErrorSum`]: fb.firestore.FieldValue.increment(absError),
      [`models.${modelKey}.squaredErrorSum`]: fb.firestore.FieldValue.increment(squaredError),
      lastOutcome: {
        absError,
        signedError,
        outcomeQualityLabel: outcomeQuality.outcomeQualityLabel,
        outcomeQualityScore: outcomeQuality.outcomeQualityScore,
        modelVersion,
        placeId: placeId || null,
      },
    }, { merge: true });

    await db.collection('intelligencePredictions').doc(best.id).set({
      calibrationMatchedAt: fb.firestore.FieldValue.serverTimestamp(),
      outcomeCount: fb.firestore.FieldValue.increment(1),
      outcomeAbsErrorSum: fb.firestore.FieldValue.increment(absError),
    }, { merge: true });

    await recordPerfMetric('place_intelligence_outcome_link', Date.now() - startedAt, true);
    await recordPerfMetric('place_intelligence_calibration_abs_error', absError, true);
  } catch {
    await recordPerfMetric('place_intelligence_outcome_link', Date.now() - startedAt, false);
  }
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function cursorKey(cursor: any) {
  if (!cursor) return 'none';
  try {
    if (typeof cursor.toMillis === 'function') return `ts:${cursor.toMillis()}`;
  } catch {}
  try {
    return JSON.stringify(cursor);
  } catch {
    return String(cursor);
  }
}

function readLocalUsers() {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const rawList = window.localStorage.getItem('spot_users_v1');
    const list = rawList ? JSON.parse(rawList) : [];
    const currentRaw = window.localStorage.getItem('spot_user_v1');
    const current = currentRaw ? JSON.parse(currentRaw) : null;
    const merged = current ? [current, ...list] : list;
    const seen = new Set<string>();
    return merged.filter((u: any) => {
      if (!u || !u.id) return false;
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });
  } catch {
    return [];
  }
}

function readLocalFriends() {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem('spot_friends_v1');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLocalFriends(data: any) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem('spot_friends_v1', JSON.stringify(data));
  } catch {}
}

function readLocalRequests() {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem('spot_friend_requests_v1');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalRequests(items: any[]) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem('spot_friend_requests_v1', JSON.stringify(items));
  } catch {}
}

function removeLocalFriendRequestPair(items: any[], userA: string, userB: string) {
  return removeFriendRequestPair(items, userA, userB);
}

function addLocalMutualFriend(map: any, userA: string, userB: string) {
  addMutualFriend(map, userA, userB, normalizeStringArray);
}

function removeLocalMutualFriend(map: any, userA: string, userB: string) {
  removeMutualFriend(map, userA, userB, normalizeStringArray);
}

export function ensureFirebase() {
  if (_initialized) return _firebaseApp;

  try {
    const firebaseApp = (firebase as any)?.default ?? firebase;
    if (!firebaseApp?.apps?.length) {
      firebaseApp.initializeApp(resolveFirebaseConfig());
    }
    _firebaseApp = firebaseApp;
    _initialized = true;
    return _firebaseApp;
  } catch (e) {
    _initError = e;
    return null;
  }
}

export function getFirebaseInitError() {
  return _initError;
}

async function getBlobFromUri(uri: string): Promise<Blob | null> {
  try {
    const response = await fetch(uri);
    if (response.ok) return await response.blob();
  } catch {}
  try {
    const mod = await import('expo-file-system/legacy');
    const base64 = await mod.readAsStringAsync(uri, { encoding: mod.EncodingType.Base64 });
    const dataUri = `data:image/jpeg;base64,${base64}`;
    const response = await fetch(dataUri);
    if (response.ok) return await response.blob();
  } catch {}
  return null;
}

async function getBase64FromUri(uri: string): Promise<string | null> {
  if (!uri) return null;
  if (uri.startsWith('data:')) {
    return uri;
  }
  try {
    const mod = await import('expo-file-system/legacy');
    const base64 = await mod.readAsStringAsync(uri, { encoding: mod.EncodingType.Base64 });
    return base64 || null;
  } catch {}
  return null;
}

export async function uploadPhotoToStorage(uri: string, userId?: string) {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Firebase not initialized. Run `npm install firebase` and provide config.');

  const storage = fb.storage();
  const resolvedUserId = userId || fb.auth()?.currentUser?.uid || 'anonymous';
  const path = `checkins/${resolvedUserId}/${Date.now()}.jpg`;

  const blob = await getBlobFromUri(uri);
  const base64 = blob ? null : await getBase64FromUri(uri);
  if (!blob && !base64) throw new Error('Unable to read photo for upload.');

  let lastErr: any = null;
  const buckets = getStorageBucketCandidates();
  const refs = buckets.length
    ? buckets.map((bucket) => storage.refFromURL(`gs://${bucket}`).child(path))
    : [storage.ref().child(path)];

  for (const ref of refs) {
    try {
      if (blob) {
        await ref.put(blob, { contentType: blob.type || 'image/jpeg' });
        try {
          if (typeof (blob as any).close === 'function') (blob as any).close();
        } catch {}
      } else if (base64) {
        if (base64.startsWith('data:')) {
          await ref.putString(base64, 'data_url');
        } else {
          await ref.putString(base64, 'base64', { contentType: 'image/jpeg' });
        }
      }
      const downloadURL = await ref.getDownloadURL();
      return downloadURL as string;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Photo upload failed.');
}

export async function createCheckinRemote({ userId, userName, userHandle, userPhotoUrl, spotName, caption, photoUrl, photoPending, campusOrCity, city, campus, visibility, spotPlaceId, spotLatLng, clientId, tags }: any) {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Firebase not initialized.');

  const db = fb.firestore();
  const now = Date.now();
  const createdAt = fb.firestore.Timestamp.fromMillis(now);
  const doc = {
    clientId: clientId || null,
    userId,
    userName: userName || null,
    userHandle: userHandle || null,
    userPhotoUrl: userPhotoUrl || null,
    visibility: visibility || 'public',
    spotName,
    spotPlaceId: spotPlaceId || null,
    spotLatLng: spotLatLng || null,
    caption: caption || '',
    tags: Array.isArray(tags) ? tags : [],
    photoUrl: photoUrl || null,
    photoPending: !!photoPending,
    campusOrCity: campusOrCity || city || null,
    city: city || null,
    campus: campus || null,
    createdAt,
    createdAtServer: fb.firestore.FieldValue.serverTimestamp(),
    createdAtMs: now,
    // Early-stage default: auto-approve so TestFlight users can see each other's posts immediately.
    approved: true,
    moderation: { status: 'approved' },
  };

  const ref = await db.collection('checkins').add(doc);
  invalidateCheckinsCache();
  void invalidateCacheOnCheckinCreate(ref.id, resolveSpotId(doc), userId || '');
  void linkCheckinOutcomeTelemetry(ref.id, doc);
  return { id: ref.id, ...doc };
}

const EVENT_WEIGHTS: Record<string, number> = {
  impression: 0.2,
  tap: 1,
  save: 2,
  checkin: 3,
  map_open: 0.5,
};

export async function recordPlaceEventRemote(payload: { userId?: string; placeId?: string | null; name?: string; category?: string; event: string }) {
  const fb = ensureFirebase();
  if (!fb || !payload?.userId) return;
  try {
    const db = fb.firestore();
    const weight = EVENT_WEIGHTS[payload.event] || 0.5;
    const category = payload.category || 'other';
    const placeId = payload.placeId || '';
    const key = spotKey(placeId || undefined, payload.name || 'unknown');
    const now = fb.firestore.FieldValue.serverTimestamp();
    await db.collection('user_place_prefs').doc(payload.userId).set({
      updatedAt: now,
      [`categories.${category}`]: fb.firestore.FieldValue.increment(weight),
      [`events.${payload.event}`]: fb.firestore.FieldValue.increment(1),
    }, { merge: true });
    await db.collection('place_scores').doc(key).set({
      updatedAt: now,
      placeId: placeId || null,
      name: payload.name || null,
      category,
      score: fb.firestore.FieldValue.increment(weight),
      [`events.${payload.event}`]: fb.firestore.FieldValue.increment(1),
    }, { merge: true });
  } catch {
    // ignore remote logging failures
  }
}

export async function getUserPreferenceRemote(userId: string) {
  const fb = ensureFirebase();
  if (!fb || !userId) return null;
  try {
    const doc = await fb.firestore().collection('user_place_prefs').doc(userId).get();
    if (!doc.exists) return null;
    const data = doc.data() || {};
    return (data.categories as Record<string, number>) || null;
  } catch {
    return null;
  }
}

export async function recordPlaceTagRemote(payload: { placeId?: string | null; name?: string; tag: string; delta?: number }) {
  const fb = ensureFirebase();
  if (!fb) return;
  try {
    const db = fb.firestore();
    const delta = typeof payload.delta === 'number' ? payload.delta : 1;
    const key = spotKey(payload.placeId || undefined, payload.name || 'unknown');
    await db.collection('place_tags').doc(key).set({
      [`tags.${payload.tag}`]: fb.firestore.FieldValue.increment(delta),
      updatedAt: fb.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    if (payload.placeId) {
      void invalidateCacheOnMetricUpdate(payload.placeId);
    }
  } catch {
    // ignore
  }
}

export async function getPlaceTagRemote(placeId?: string, name?: string) {
  const fb = ensureFirebase();
  if (!fb) return null;
  try {
    const key = spotKey(placeId || undefined, name || 'unknown');
    const doc = await fb.firestore().collection('place_tags').doc(key).get();
    if (!doc.exists) return null;
    const data = doc.data() || {};
    return data.tags || null;
  } catch {
    return null;
  }
}

export async function recordPlaceTagVoteRemote(payload: { userId: string; placeId?: string | null; name?: string; tag: string; active: boolean }) {
  const fb = ensureFirebase();
  if (!fb || !payload.userId) return;
  try {
    const db = fb.firestore();
    const key = spotKey(payload.placeId || undefined, payload.name || 'unknown');
    await db.collection('place_tag_votes').doc(`${payload.userId}_${key}`).set({
      userId: payload.userId,
      placeKey: key,
      [`votes.${payload.tag}`]: payload.active,
      updatedAt: fb.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch {
    // ignore
  }
}

export async function getPlaceTagVotesRemote(userId: string, placeId?: string, name?: string) {
  const fb = ensureFirebase();
  if (!fb || !userId) return null;
  try {
    const key = spotKey(placeId || undefined, name || 'unknown');
    const doc = await fb.firestore().collection('place_tag_votes').doc(`${userId}_${key}`).get();
    if (!doc.exists) return null;
    const data = doc.data() || {};
    return data.votes || null;
  } catch {
    return null;
  }
}

export async function getCheckinsRemote(limit = 50, startAfter?: any) {
  return withErrorBoundary('firebase_get_checkins_remote', async () => {
    const startedAt = Date.now();
    const fb = ensureFirebase();
    if (!fb) throw new Error('Firebase not initialized.');
    if (!fb.auth()?.currentUser?.uid) {
      return { items: [], lastCursor: null };
    }
    const cacheKey = `${limit}:${cursorKey(startAfter)}`;
    const cached = getCachedValue(checkinsCache, cacheKey, 10000);
    if (cached) {
      void recordPerfMetric('firebase_get_checkins_remote_cache_hit', Date.now() - startedAt, true);
      return cached;
    }

    const db = fb.firestore();

    // Query public feed only so collection reads satisfy Firestore query rules.
    let snapshot: any;
    try {
      let q: any = db
        .collection('checkins')
        .where('visibility', '==', 'public')
        .orderBy('createdAt', 'desc')
        .limit(limit);
      if (startAfter) q = q.startAfter(startAfter);
      snapshot = await q.get();
    } catch {
      // Legacy timestamp fallback
      try {
        let legacyQ: any = db
          .collection('checkins')
          .where('visibility', '==', 'public')
          .orderBy('timestamp', 'desc')
          .limit(limit);
        if (startAfter) legacyQ = legacyQ.startAfter(startAfter);
        snapshot = await legacyQ.get();
      } catch {
        // Both indexes missing — fall back to unordered query (can't paginate)
        snapshot = await db
          .collection('checkins')
          .where('visibility', '==', 'public')
          .limit(limit)
          .get();
        const items: any[] = [];
        snapshot.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
        items.sort((a, b) => toMillisSafe(b.createdAt || b.timestamp) - toMillisSafe(a.createdAt || a.timestamp));
        const payload = { items, lastCursor: null };
        setCachedValue(checkinsCache, cacheKey, payload, CHECKINS_CACHE_MAX);
        return payload;
      }
    }
    const items: any[] = [];
    snapshot.forEach((doc: any) => {
      items.push({ id: doc.id, ...(doc.data() || {}) });
    });

    const lastCursor = items.length
      ? (items[items.length - 1].createdAt ?? items[items.length - 1].timestamp ?? null)
      : null;
    const payload = { items, lastCursor };
    setCachedValue(checkinsCache, cacheKey, payload, CHECKINS_CACHE_MAX);
    return payload;
  }, { items: [], lastCursor: null });
}

export async function getCheckinsForUserRemote(userId: string, limit = 80, startAfter?: any) {
  return withErrorBoundary('firebase_get_checkins_for_user', async () => {
    const startedAt = Date.now();
    const fb = ensureFirebase();
    if (!fb) throw new Error('Firebase not initialized.');
    if (!userId) return { items: [], lastCursor: null };
    const cacheKey = `user:${userId}:${limit}:${cursorKey(startAfter)}`;
    const cached = getCachedValue(checkinsCache, cacheKey, 10000);
    if (cached) {
      void recordPerfMetric('firebase_get_checkins_for_user_cache_hit', Date.now() - startedAt, true);
      return cached;
    }

    const db = fb.firestore();

    // Use schema helper with automatic fallback for legacy data.
    // If query fails (permissions/index/network/auth timing), degrade to empty state.
    let snapshot: any;
    try {
      snapshot = await queryCheckinsByUser(db, fb, userId, { limit, startAfter });
    } catch (error) {
      devLog('getCheckinsForUserRemote index fallback to unordered query', error);
      try {
        const fallbackSnapshot = await db
          .collection('checkins')
          .where('userId', '==', userId)
          .limit(limit)
          .get();
        const fallbackItems: any[] = [];
        fallbackSnapshot.forEach((doc: any) => fallbackItems.push({ id: doc.id, ...(doc.data() || {}) }));
        fallbackItems.sort((a, b) => toMillisSafe(b.createdAt || b.timestamp) - toMillisSafe(a.createdAt || a.timestamp));
        const fallbackCursor = fallbackItems.length
          ? (fallbackItems[fallbackItems.length - 1].createdAt ?? fallbackItems[fallbackItems.length - 1].timestamp ?? null)
          : null;
        const fallbackPayload = { items: fallbackItems, lastCursor: fallbackCursor };
        setCachedValue(checkinsCache, cacheKey, fallbackPayload, CHECKINS_CACHE_MAX);
        return fallbackPayload;
      } catch (unorderedError) {
        devLog('getCheckinsForUserRemote unordered fallback to empty', unorderedError);
        return { items: [], lastCursor: null };
      }
    }
    const items: any[] = [];
    snapshot.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
    items.sort((a, b) => toMillisSafe(b.createdAt || b.timestamp) - toMillisSafe(a.createdAt || a.timestamp));
    const lastCursor = items.length
      ? (items[items.length - 1].createdAt ?? items[items.length - 1].timestamp ?? null)
      : null;
    const payload = { items, lastCursor };
    setCachedValue(checkinsCache, cacheKey, payload, CHECKINS_CACHE_MAX);
    return payload;
  }, { items: [], lastCursor: null });
}

export async function getApprovedCheckinsRemote(limit = 50, startAfter?: any) {
  return withErrorBoundary('firebase_get_approved_checkins', async () => {
    const startedAt = Date.now();
    const fb = ensureFirebase();
    if (!fb) throw new Error('Firebase not initialized.');
    const cacheKey = `approved:${limit}:${cursorKey(startAfter)}`;
    const cached = getCachedValue(checkinsCache, cacheKey, 10000);
    if (cached) {
      void recordPerfMetric('firebase_get_approved_checkins_cache_hit', Date.now() - startedAt, true);
      return cached;
    }

    const db = fb.firestore();

    // Use schema helper with automatic fallback for legacy data
    const snapshot = await queryAllCheckins(db, { limit, startAfter, approvedOnly: true });
    const items: any[] = [];
    snapshot.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
    const lastCursor = items.length
      ? (items[items.length - 1].createdAt ?? items[items.length - 1].timestamp ?? null)
      : null;
    const payload = { items, lastCursor };
    setCachedValue(checkinsCache, cacheKey, payload, CHECKINS_CACHE_MAX);
    return payload;
  }, { items: [], lastCursor: null });
}

export function subscribeApprovedCheckins(onUpdate: (items: any[]) => void, limit = 40) {
  const fb = ensureFirebase();
  if (!fb) return () => {};
  const db = fb.firestore();

  // Use schema helper with automatic fallback for legacy data
  const unsubscribe = subscribeApprovedCheckinsHelper(db, onUpdate, limit);
  return registerSubscription(unsubscribe);
}

export async function getUsersByIdsCached(ids: string[], ttlMs = 15000) {
  return withErrorBoundary('firebase_get_users_by_ids_cached', async () => {
    if (!ids || ids.length === 0) return [];
    const key = ids.slice().sort().join('|');
    const cached = getCachedValue(usersByIdCache, key, ttlMs);
    if (cached) return cached;
    const payload = await getUsersByIds(ids);
    setCachedValue(usersByIdCache, key, payload, USERS_BY_ID_CACHE_MAX);
    return payload;
  }, []);
}

export async function getUserFriendsCached(userId: string, ttlMs = 15000) {
  return withErrorBoundary('firebase_get_user_friends_cached', async () => {
    if (!userId) return [];
    const cached = getCachedValue(userFriendsCache, userId, ttlMs);
    if (cached) return cached;
    const payload = await getUserFriends(userId);
    setCachedValue(userFriendsCache, userId, payload, USER_FRIENDS_CACHE_MAX);
    return payload;
  }, []);
}

async function callSocialGraphMutation(action: string, payload: Record<string, any>) {
  const fb = ensureFirebase();
  if (!fb || typeof (fb as any).functions !== 'function') return null;
  try {
    const region =
      ((Constants.expoConfig as any)?.extra?.FIREBASE_FUNCTIONS_REGION as string) ||
      (process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION as string) ||
      'us-central1';
    const callable = (fb as any).functions(region).httpsCallable('socialGraphMutation');
    const response = await callable({ action, ...payload });
    return response?.data || null;
  } catch (error) {
    devLog(`socialGraphMutation(${action}) failed`, error);
    return null;
  }
}

export function subscribeCheckins(onUpdate: (items: any[]) => void, limit = 40) {
  const fb = ensureFirebase();
  if (!fb) return () => {};
  if (!fb.auth()?.currentUser?.uid) return () => {};

  const db = fb.firestore();

  // Try primary schema first (createdAt)
  let primaryUnsub: (() => void) | null = null;
  let legacyUnsub: (() => void) | null = null;
  let settled = false;

  const runUnorderedFallback = () => {
    db.collection('checkins')
      .where('visibility', '==', 'public')
      .limit(limit)
      .get()
      .then((snap: any) => {
        const items: any[] = [];
        snap.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
        items.sort((a, b) => toMillisSafe(b.createdAt || b.timestamp) - toMillisSafe(a.createdAt || a.timestamp));
        onUpdate(items);
      })
      .catch(() => onUpdate([]));
  };

  const startLegacySubscription = () => {
    if (legacyUnsub) return;
    const legacyQuery = db
      .collection('checkins')
      .where('visibility', '==', 'public')
      .orderBy('timestamp', 'desc')
      .limit(limit);
    legacyUnsub = registerSubscription(legacyQuery.onSnapshot((legacySnapshot: any) => {
      const items: any[] = [];
      legacySnapshot.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
      onUpdate(items);
    }, runUnorderedFallback));
  };

  const primaryQuery = db
    .collection('checkins')
    .where('visibility', '==', 'public')
    .orderBy('createdAt', 'desc')
    .limit(limit);
  primaryUnsub = registerSubscription(primaryQuery.onSnapshot((snapshot: any) => {
    if (settled) return;
    if (!snapshot.empty) {
      const items: any[] = [];
      snapshot.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
      onUpdate(items);

      // Clean up legacy subscription if it exists
      if (legacyUnsub) {
        legacyUnsub();
        legacyUnsub = null;
      }
    } else {
      // No results, try legacy schema (timestamp)
      startLegacySubscription();
    }
  }, () => {
    if (settled) return;
    settled = true;
    // Index missing — try legacy
    startLegacySubscription();
  }));

  // Return combined unsubscribe function
  return () => {
    if (primaryUnsub) primaryUnsub();
    if (legacyUnsub) legacyUnsub();
  };
}

export async function getCheckinByClientId(clientId: string) {
  if (!clientId) return null;
  const fb = ensureFirebase();
  if (!fb) return null;
  try {
    const db = fb.firestore();
    const q = await db.collection('checkins').where('clientId', '==', clientId).limit(1).get();
    if (q.empty) return null;
    const doc = q.docs[0];
    return { id: doc.id, data: doc.data() || {} };
  } catch {
    return null;
  }
}

export async function getCheckinById(checkinId: string) {
  if (!checkinId) return null;
  const fb = ensureFirebase();
  if (!fb) return null;
  try {
    const doc = await fb.firestore().collection('checkins').doc(checkinId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...(doc.data() || {}) };
  } catch {
    return null;
  }
}

export async function deleteCheckinRemote(checkinId: string) {
  if (!checkinId) return false;
  const fb = ensureFirebase();
  if (!fb) return false;
  try {
    const docRef = fb.firestore().collection('checkins').doc(checkinId);
    const snapshot = await docRef.get();
    const existing = snapshot.exists ? (snapshot.data() || {}) : {};
    await docRef.delete();
    invalidateCheckinsCache();
    void invalidateCacheOnCheckinDelete(checkinId, resolveSpotId(existing), existing.userId);
    return true;
  } catch {
    return false;
  }
}

export async function updateCheckinRemote(checkinId: string, fields: Record<string, any>) {
  const fb = ensureFirebase();
  if (!fb || !checkinId) return;
  try {
    const db = fb.firestore();
    const docRef = db.collection('checkins').doc(checkinId);
    const snapshot = await docRef.get();
    const existing = snapshot.exists ? (snapshot.data() || {}) : {};
    const merged = { ...existing, ...fields };
    await docRef.set(fields, { merge: true });
    invalidateCheckinsCache();
    const spotId = resolveSpotId(merged);
    const userId = merged.userId;
    void invalidateCacheOnCheckinUpdate(checkinId, spotId || undefined, userId);
    if (hasMetricUpdates(fields) && spotId) {
      void invalidateCacheOnMetricUpdate(spotId, userId);
    }
    if (hasOutcomeMetricUpdates(fields)) {
      void linkCheckinOutcomeTelemetry(checkinId, { ...merged, id: checkinId });
    }
  } catch {
    // ignore
  }
}

// Subscribe to checkins for a specific set of user IDs (handles Firestore 'in' batching)
export function subscribeCheckinsForUsers(userIds: string[], onUpdate: (items: any[]) => void, limit = 50) {
  const fb = ensureFirebase();
  if (!fb) return () => {};
  if (!userIds || userIds.length === 0) return () => {};
  const db = fb.firestore();
  const unsubs: Array<() => void> = [];
  const snapshotsByBatch = new Map<number, any[]>();
  let emitTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    emitTimer = null;
    const deduped = new Map<string, any>();
    snapshotsByBatch.forEach((batchItems) => {
      batchItems.forEach((item) => {
        const fallbackKey = `${item.userId || 'anon'}:${item.spotPlaceId || item.spotName || 'spot'}:${toMillisSafe(item.createdAt)}`;
        const key = item.id || item.clientId || fallbackKey;
        const existing = deduped.get(key);
        if (!existing || toMillisSafe(item.createdAt) > toMillisSafe(existing.createdAt)) {
          deduped.set(key, item);
        }
      });
    });
    const merged = Array.from(deduped.values()).sort(
      (a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt)
    );
    const maxItems = Math.max(limit, 20) * Math.max(1, snapshotsByBatch.size);
    onUpdate(merged.slice(0, maxItems));
  };

  const scheduleFlush = () => {
    if (emitTimer) return;
    emitTimer = setTimeout(flush, 0);
  };

  // Firestore 'in' supports up to 10 values — batch if needed
  for (let i = 0; i < userIds.length; i += 10) {
    const batchIndex = i / 10;
    const batch = userIds.slice(i, i + 10);

    // Try primary schema first (createdAt)
    const primaryQuery = db.collection('checkins').where('userId', 'in', batch).orderBy('createdAt', 'desc').limit(limit);
    let legacyUnsub: (() => void) | null = null;

    const runUnorderedFallback = () => {
      db.collection('checkins').where('userId', 'in', batch).limit(limit).get()
        .then((snap: any) => {
          const items: any[] = [];
          snap.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
          items.sort((a, b) => toMillisSafe(b.createdAt || b.timestamp) - toMillisSafe(a.createdAt || a.timestamp));
          snapshotsByBatch.set(batchIndex, items);
          scheduleFlush();
        })
        .catch(() => {
          snapshotsByBatch.set(batchIndex, []);
          scheduleFlush();
        });
    };

    const startLegacySubscription = () => {
      if (legacyUnsub) return;
      const legacyQuery = db.collection('checkins').where('userId', 'in', batch).orderBy('timestamp', 'desc').limit(limit);
      legacyUnsub = registerSubscription(legacyQuery.onSnapshot((legacySnapshot: any) => {
        const items: any[] = [];
        legacySnapshot.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
        snapshotsByBatch.set(batchIndex, items);
        scheduleFlush();
      }, runUnorderedFallback));
    };

    const primaryUnsub = registerSubscription(primaryQuery.onSnapshot((snapshot: any) => {
      if (!snapshot.empty) {
        // Primary schema has data, use it
        const items: any[] = [];
        snapshot.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
        snapshotsByBatch.set(batchIndex, items);
        scheduleFlush();

        // Clean up legacy subscription if it exists
        if (legacyUnsub) {
          legacyUnsub();
          legacyUnsub = null;
        }
      } else {
        // No results from primary, try legacy schema (timestamp)
        startLegacySubscription();
      }
    }, () => {
      // Index error on primary — fall back to legacy subscription
      startLegacySubscription();
    }));

    unsubs.push(() => {
      primaryUnsub();
      if (legacyUnsub) legacyUnsub();
    });
  }

  return () => {
    if (emitTimer) {
      clearTimeout(emitTimer);
      emitTimer = null;
    }
    unsubs.forEach((u) => u());
    snapshotsByBatch.clear();
  };
}

// Subscribe to approved checkins for a specific set of user IDs (handles Firestore 'in' batching)
export function subscribeApprovedCheckinsForUsers(userIds: string[], onUpdate: (items: any[]) => void, limit = 50) {
  const fb = ensureFirebase();
  if (!fb) return () => {};
  if (!userIds || userIds.length === 0) return () => {};
  const db = fb.firestore();
  const unsubs: Array<() => void> = [];
  const snapshotsByBatch = new Map<number, any[]>();
  let emitTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    emitTimer = null;
    const deduped = new Map<string, any>();
    snapshotsByBatch.forEach((batchItems) => {
      batchItems.forEach((item) => {
        const fallbackKey = `${item.userId || 'anon'}:${item.spotPlaceId || item.spotName || 'spot'}:${toMillisSafe(item.createdAt)}`;
        const key = item.id || item.clientId || fallbackKey;
        const existing = deduped.get(key);
        if (!existing || toMillisSafe(item.createdAt) > toMillisSafe(existing.createdAt)) {
          deduped.set(key, item);
        }
      });
    });
    const merged = Array.from(deduped.values()).sort(
      (a, b) => toMillisSafe(b.createdAt) - toMillisSafe(a.createdAt)
    );
    const maxItems = Math.max(limit, 20) * Math.max(1, snapshotsByBatch.size);
    onUpdate(merged.slice(0, maxItems));
  };

  const scheduleFlush = () => {
    if (emitTimer) return;
    emitTimer = setTimeout(flush, 0);
  };

  // Firestore 'in' supports up to 10 values — batch if needed
  for (let i = 0; i < userIds.length; i += 10) {
    const batchIndex = i / 10;
    const batch = userIds.slice(i, i + 10);

    // Try primary schema first (createdAt)
    const primaryQuery = db.collection('checkins').where('userId', 'in', batch).where('approved', '==', true).orderBy('createdAt', 'desc').limit(limit);
    let legacyUnsub: (() => void) | null = null;

    const primaryUnsub = registerSubscription(primaryQuery.onSnapshot((snapshot: any) => {
      if (!snapshot.empty) {
        // Primary schema has data, use it
        const items: any[] = [];
        snapshot.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
        snapshotsByBatch.set(batchIndex, items);
        scheduleFlush();

        // Clean up legacy subscription if it exists
        if (legacyUnsub) {
          legacyUnsub();
          legacyUnsub = null;
        }
      } else {
        // No results from primary, try legacy schema (timestamp)
        const legacyQuery = db.collection('checkins').where('userId', 'in', batch).where('approved', '==', true).orderBy('timestamp', 'desc').limit(limit);
        legacyUnsub = registerSubscription(legacyQuery.onSnapshot((legacySnapshot: any) => {
          const items: any[] = [];
          legacySnapshot.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
          snapshotsByBatch.set(batchIndex, items);
          scheduleFlush();
        }));
      }
    }));

    unsubs.push(() => {
      primaryUnsub();
      if (legacyUnsub) legacyUnsub();
    });
  }

  return () => {
    if (emitTimer) {
      clearTimeout(emitTimer);
      emitTimer = null;
    }
    unsubs.forEach((u) => u());
    snapshotsByBatch.clear();
  };
}

function readLocalBlocked() {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem('spot_blocked_v1');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLocalBlocked(data: any) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem('spot_blocked_v1', JSON.stringify(data));
  } catch {}
}

function readLocalPushTokens() {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem('spot_push_tokens_v1');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLocalPushTokens(data: any) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem('spot_push_tokens_v1', JSON.stringify(data));
  } catch {}
}

export async function getUserFriends(userId: string) {
  const fb = ensureFirebase();
  if (!fb) {
    const map = readLocalFriends();
    return normalizeStringArray(map[userId]);
  }
  const db = fb.firestore();
  try {
    const doc = await db.collection('users').doc(userId).get();
    if (!doc.exists) return [];
    const data = doc.data() || {};
    return normalizeStringArray(data.friends);
  } catch (e) {
    return [];
  }
}

export async function getCloseFriends(userId: string) {
  const fb = ensureFirebase();
  if (!fb) return [];
  const db = fb.firestore();
  try {
    const doc = await db.collection('users').doc(userId).get();
    if (!doc.exists) return [];
    const data = doc.data() || {};
    return normalizeStringArray(data.closeFriends);
  } catch (e) {
    return [];
  }
}

export async function followUserRemote(currentUserId: string, targetUserId: string) {
  const fb = ensureFirebase();
  if (!fb) {
    const map = readLocalFriends();
    const current = new Set(map[currentUserId] || []);
    current.add(targetUserId);
    map[currentUserId] = Array.from(current);
    writeLocalFriends(map);
    invalidateUserFriendsCache([currentUserId, targetUserId]);
    return;
  }
  const db = fb.firestore();
  const ref = db.collection('users').doc(currentUserId);
  await ref.set({ friends: fb.firestore.FieldValue.arrayUnion(targetUserId) }, { merge: true });
  invalidateUserFriendsCache([currentUserId, targetUserId]);
}

export async function unfollowUserRemote(currentUserId: string, targetUserId: string) {
  if (!currentUserId || !targetUserId || currentUserId === targetUserId) return;
  const fb = ensureFirebase();
  if (!fb) {
    const map = readLocalFriends();
    removeLocalMutualFriend(map, currentUserId, targetUserId);
    writeLocalFriends(map);
    writeLocalRequests(removeLocalFriendRequestPair(readLocalRequests(), currentUserId, targetUserId));
    invalidateUserFriendsCache([currentUserId, targetUserId]);
    return;
  }

  const callableResult = await callSocialGraphMutation('unfriend', { targetUserId });
  if (callableResult?.ok) {
    invalidateUserFriendsCache([currentUserId, targetUserId]);
    return;
  }

  const db = fb.firestore();
  const batch = db.batch();
  batch.set(
    db.collection('users').doc(currentUserId),
    {
      friends: fb.firestore.FieldValue.arrayRemove(targetUserId),
      closeFriends: fb.firestore.FieldValue.arrayRemove(targetUserId),
    },
    { merge: true }
  );
  batch.set(
    db.collection('users').doc(targetUserId),
    {
      friends: fb.firestore.FieldValue.arrayRemove(currentUserId),
      closeFriends: fb.firestore.FieldValue.arrayRemove(currentUserId),
    },
    { merge: true }
  );
  batch.delete(db.collection('friendRequests').doc(`${currentUserId}_${targetUserId}`));
  batch.delete(db.collection('friendRequests').doc(`${targetUserId}_${currentUserId}`));
  await batch.commit();
  invalidateUserFriendsCache([currentUserId, targetUserId]);
}

export async function setCloseFriendRemote(currentUserId: string, targetUserId: string, makeClose: boolean) {
  const fb = ensureFirebase();
  if (!fb) return;
  const db = fb.firestore();
  const ref = db.collection('users').doc(currentUserId);
  if (makeClose) {
    await ref.set({ closeFriends: fb.firestore.FieldValue.arrayUnion(targetUserId), friends: fb.firestore.FieldValue.arrayUnion(targetUserId) }, { merge: true });
  } else {
    await ref.set({ closeFriends: fb.firestore.FieldValue.arrayRemove(targetUserId) }, { merge: true });
  }
  invalidateUserFriendsCache([currentUserId, targetUserId]);
}

export async function createUserRemote({ userId, name, city, campus, campusOrCity, campusType, handle, email, photoUrl, phone }: any) {
  const fb = ensureFirebase();
  if (!fb) return;

  const sanitizeFields = (fields: Record<string, any>) =>
    Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));

  const db = fb.firestore();
  const normalizedPhone = normalizePhone(phone || '');
  const payload = sanitizeFields({
    name,
    city: city || null,
    campus: campus || null,
    campusOrCity: campusOrCity || city || null,
    campusType: campusType || null,
    handle: handle || null,
    email: email || null,
    phone: phone || null,
    phoneNormalized: normalizedPhone || null,
    photoUrl: photoUrl || null,
    createdAt: fb.firestore.FieldValue.serverTimestamp(),
  });
  await db.collection('users').doc(userId).set(payload);
  usersByIdCache.clear();
}

export async function updateUserRemote(userId: string, fields: any) {
  const fb = ensureFirebase();
  if (!fb) return;
  const sanitizeFields = (input: Record<string, any>) =>
    Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
  const db = fb.firestore();
  const normalizedPhone = fields?.phone ? normalizePhone(fields.phone) : undefined;
  const payload = sanitizeFields({
    ...fields,
    phoneNormalized: normalizedPhone ?? fields?.phoneNormalized,
    updatedAt: fb.firestore.FieldValue.serverTimestamp(),
  });
  await db.collection('users').doc(userId).set(payload, { merge: true });
  usersByIdCache.clear();
}

export async function findUserByEmail(email: string) {
  const fb = ensureFirebase();
  if (!fb) {
    const users = readLocalUsers();
    return users.find((u: any) => (u.email || '').toLowerCase() === email.toLowerCase()) || null;
  }
  const db = fb.firestore();
  const q = await db.collection('users').where('email', '==', email).limit(1).get();
  if (q.empty) return null;
  const doc = q.docs[0];
  return { id: doc.id, ...(doc.data() || {}) };
}

export async function findUserByPhone(phone: string) {
  const fb = ensureFirebase();
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  if (!fb) {
    const users = readLocalUsers();
    return users.find((u: any) => normalizePhone(u.phone || '') === normalized) || null;
  }
  const db = fb.firestore();
  const q = await db.collection('users').where('phoneNormalized', '==', normalized).limit(1).get();
  if (q.empty) return null;
  const doc = q.docs[0];
  return { id: doc.id, ...(doc.data() || {}) };
}

export async function findUserByHandle(handle: string) {
  const fb = ensureFirebase();
  if (!handle) return null;
  const normalized = handle.replace(/^@/, '').toLowerCase();
  if (!fb) {
    const users = readLocalUsers();
    return users.find((u: any) => (u.handle || '').toLowerCase() === normalized) || null;
  }
  const db = fb.firestore();
  const q = await db.collection('users').where('handle', '==', normalized).limit(1).get();
  if (q.empty) return null;
  const doc = q.docs[0];
  return { id: doc.id, ...(doc.data() || {}) };
}
export async function getUsersByIds(userIds: string[]) {
  const fb = ensureFirebase();
  if (!fb) {
    const users = readLocalUsers();
    const set = new Set(userIds || []);
    return users.filter((u: any) => set.has(u.id));
  }
  if (!userIds || userIds.length === 0) return [];
  const db = fb.firestore();
  const items: any[] = [];
  for (let i = 0; i < userIds.length; i += 10) {
    const batch = userIds.slice(i, i + 10);
    const snap = await db.collection('users').where(fb.firestore.FieldPath.documentId(), 'in', batch).get();
    snap.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
  }
  return items;
}

export async function getUsersByCampus(campusOrCity: string, limit = 10) {
  const fb = ensureFirebase();
  if (!campusOrCity) return [];
  if (!fb) {
    const users = readLocalUsers();
    return users.filter((u: any) => (u.campus || u.campusOrCity) === campusOrCity).slice(0, limit);
  }
  const db = fb.firestore();
  const [snapCampus, snapLegacy] = await Promise.all([
    db.collection('users').where('campus', '==', campusOrCity).limit(limit).get(),
    db.collection('users').where('campusOrCity', '==', campusOrCity).limit(limit).get(),
  ]);
  const items: any[] = [];
  snapCampus.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
  snapLegacy.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
  const seen = new Set<string>();
  return items.filter((u) => {
    if (!u?.id || seen.has(u.id)) return false;
    seen.add(u.id);
    return true;
  });
}

export async function sendFriendRequest(fromId: string, toId: string) {
  if (!fromId || !toId || fromId === toId) return null;
  const fb = ensureFirebase();
  if (!fb) {
    const map = readLocalFriends();
    if (normalizeStringArray(map[fromId]).includes(toId)) {
      invalidateUserFriendsCache([fromId, toId]);
      return { id: `${fromId}_${toId}`, fromId, toId, status: 'accepted', alreadyFriends: true };
    }

    const requests = readLocalRequests();
    const reverseRequestId = `${toId}_${fromId}`;
    const reverseRequest = requests.find((r: any) => r?.id === reverseRequestId && (r?.status || 'pending') === 'pending');
    if (reverseRequest) {
      addLocalMutualFriend(map, fromId, toId);
      writeLocalFriends(map);
      writeLocalRequests(removeLocalFriendRequestPair(requests, fromId, toId));
      invalidateUserFriendsCache([fromId, toId]);
      return { id: reverseRequestId, fromId: toId, toId: fromId, status: 'accepted', autoAccepted: true };
    }
    const requestId = `${fromId}_${toId}`;
    if (!requests.find((r: any) => r?.id === requestId)) {
      requests.push({ id: requestId, fromId, toId, status: 'pending', createdAt: Date.now() });
      writeLocalRequests(requests);
    }
    return { id: requestId, fromId, toId, status: 'pending' };
  }

  const callableResult = await callSocialGraphMutation('send_friend_request', { toId });
  if (callableResult?.ok) {
    invalidateUserFriendsCache([fromId, toId]);
    return {
      id: callableResult.requestId || `${fromId}_${toId}`,
      fromId,
      toId,
      status: callableResult.status || 'pending',
      autoAccepted: Boolean(callableResult.autoAccepted),
      alreadyFriends: Boolean(callableResult.alreadyFriends),
    };
  }

  const db = fb.firestore();
  const currentUserRef = db.collection('users').doc(fromId);
  const targetUserRef = db.collection('users').doc(toId);
  const reverseRequestId = `${toId}_${fromId}`;
  const reverseRef = db.collection('friendRequests').doc(reverseRequestId);
  const forwardRequestId = `${fromId}_${toId}`;
  const [currentUserDoc, reverseDoc] = await Promise.all([currentUserRef.get(), reverseRef.get()]);

  const currentFriends = normalizeStringArray(currentUserDoc.data()?.friends);
  if (currentFriends.includes(toId)) {
    invalidateUserFriendsCache([fromId, toId]);
    return { id: forwardRequestId, fromId, toId, status: 'accepted', alreadyFriends: true };
  }

  if (reverseDoc.exists && (reverseDoc.data()?.status || 'pending') === 'pending') {
    const batch = db.batch();
    batch.set(currentUserRef, { friends: fb.firestore.FieldValue.arrayUnion(toId) }, { merge: true });
    batch.set(targetUserRef, { friends: fb.firestore.FieldValue.arrayUnion(fromId) }, { merge: true });
    batch.delete(reverseRef);
    batch.delete(db.collection('friendRequests').doc(forwardRequestId));
    await batch.commit();
    invalidateUserFriendsCache([fromId, toId]);
    return { id: reverseRequestId, fromId: toId, toId: fromId, status: 'accepted', autoAccepted: true };
  }

  const ref = db.collection('friendRequests').doc(forwardRequestId);
  await ref.set(
    {
      fromId,
      toId,
      status: 'pending',
      createdAt: fb.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { id: forwardRequestId, fromId, toId, status: 'pending' };
}

export async function getIncomingFriendRequests(userId: string) {
  const fb = ensureFirebase();
  if (!fb) {
    const requests = readLocalRequests();
    return requests.filter((r: any) => r.toId === userId && r.status === 'pending');
  }
  const db = fb.firestore();
  const snap = await db.collection('friendRequests').where('toId', '==', userId).where('status', '==', 'pending').get();
  const items: any[] = [];
  snap.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
  return items;
}

export async function getOutgoingFriendRequests(userId: string) {
  const fb = ensureFirebase();
  if (!fb) {
    const requests = readLocalRequests();
    return requests.filter((r: any) => r.fromId === userId && r.status === 'pending');
  }
  const db = fb.firestore();
  const snap = await db.collection('friendRequests').where('fromId', '==', userId).where('status', '==', 'pending').get();
  const items: any[] = [];
  snap.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
  return items;
}

export async function acceptFriendRequest(requestId: string, fromId: string, toId: string) {
  const fb = ensureFirebase();
  if (!fb) {
    const map = readLocalFriends();
    addLocalMutualFriend(map, fromId, toId);
    writeLocalFriends(map);
    writeLocalRequests(removeLocalFriendRequestPair(readLocalRequests(), fromId, toId));
    invalidateUserFriendsCache([fromId, toId]);
    return;
  }

  const callableResult = await callSocialGraphMutation('accept_friend_request', { requestId });
  if (callableResult?.ok) {
    invalidateUserFriendsCache([fromId, toId]);
    return;
  }

  const db = fb.firestore();
  const batch = db.batch();
  batch.set(db.collection('users').doc(toId), { friends: fb.firestore.FieldValue.arrayUnion(fromId) }, { merge: true });
  batch.set(db.collection('users').doc(fromId), { friends: fb.firestore.FieldValue.arrayUnion(toId) }, { merge: true });
  batch.delete(db.collection('friendRequests').doc(requestId));
  batch.delete(db.collection('friendRequests').doc(`${toId}_${fromId}`));
  batch.delete(db.collection('friendRequests').doc(`${fromId}_${toId}`));
  await batch.commit();
  invalidateUserFriendsCache([fromId, toId]);
}

export async function declineFriendRequest(requestId: string) {
  const fb = ensureFirebase();
  if (!fb) {
    const requests = readLocalRequests().filter((r: any) => r.id !== requestId);
    writeLocalRequests(requests);
    return;
  }

  const callableResult = await callSocialGraphMutation('decline_friend_request', { requestId });
  if (callableResult?.ok) {
    return;
  }

  const db = fb.firestore();
  await db.collection('friendRequests').doc(requestId).delete();
}

export async function reportUserRemote(reporterId: string | undefined, targetUserId: string, reason?: string) {
  const fb = ensureFirebase();
  if (!fb) {
    devLog('reportUserRemote (local):', { reporterId, targetUserId, reason });
    return;
  }
  const db = fb.firestore();
  await db.collection('reports').add({
    reporterId: reporterId || null,
    reportedUserId: targetUserId,
    reason: reason || null,
    status: 'open',
    createdAt: fb.firestore.FieldValue.serverTimestamp(),
  });
}

export async function blockUserRemote(currentUserId: string, targetUserId: string) {
  if (!currentUserId || !targetUserId || currentUserId === targetUserId) return;
  const fb = ensureFirebase();
  if (!fb) {
    const friendsMap = readLocalFriends();
    removeLocalMutualFriend(friendsMap, currentUserId, targetUserId);
    writeLocalFriends(friendsMap);
    writeLocalRequests(removeLocalFriendRequestPair(readLocalRequests(), currentUserId, targetUserId));
    const map = readLocalBlocked();
    const set = new Set(map[currentUserId] || []);
    set.add(targetUserId);
    map[currentUserId] = Array.from(set);
    writeLocalBlocked(map);
    invalidateUserFriendsCache([currentUserId, targetUserId]);
    return;
  }

  const callableResult = await callSocialGraphMutation('block_user', { targetUserId });
  if (callableResult?.ok) {
    invalidateUserFriendsCache([currentUserId, targetUserId]);
    return;
  }

  const db = fb.firestore();
  const batch = db.batch();
  batch.set(
    db.collection('users').doc(currentUserId),
    {
      blocked: fb.firestore.FieldValue.arrayUnion(targetUserId),
      friends: fb.firestore.FieldValue.arrayRemove(targetUserId),
      closeFriends: fb.firestore.FieldValue.arrayRemove(targetUserId),
    },
    { merge: true }
  );
  batch.set(
    db.collection('users').doc(targetUserId),
    {
      friends: fb.firestore.FieldValue.arrayRemove(currentUserId),
      closeFriends: fb.firestore.FieldValue.arrayRemove(currentUserId),
    },
    { merge: true }
  );
  batch.delete(db.collection('friendRequests').doc(`${currentUserId}_${targetUserId}`));
  batch.delete(db.collection('friendRequests').doc(`${targetUserId}_${currentUserId}`));
  await batch.commit();
  invalidateUserFriendsCache([currentUserId, targetUserId]);
}

export async function unblockUserRemote(currentUserId: string, targetUserId: string) {
  const fb = ensureFirebase();
  if (!fb) {
    const map = readLocalBlocked();
    map[currentUserId] = (map[currentUserId] || []).filter((id: string) => id !== targetUserId);
    writeLocalBlocked(map);
    return;
  }

  const callableResult = await callSocialGraphMutation('unblock_user', { targetUserId });
  if (callableResult?.ok) return;

  const db = fb.firestore();
  await db.collection('users').doc(currentUserId).set({ blocked: fb.firestore.FieldValue.arrayRemove(targetUserId) }, { merge: true });
}

export async function getBlockedUsers(currentUserId: string) {
  const fb = ensureFirebase();
  if (!fb) {
    const map = readLocalBlocked();
    return normalizeStringArray(map[currentUserId]);
  }
  const db = fb.firestore();
  const doc = await db.collection('users').doc(currentUserId).get();
  if (!doc.exists) return [];
  const data = doc.data() || {};
  return normalizeStringArray(data.blocked);
}

export async function savePushToken(userId: string, token: string) {
  const fb = ensureFirebase();
  if (!fb) {
    const map = readLocalPushTokens();
    map[userId] = token;
    writeLocalPushTokens(map);
    return;
  }
  const db = fb.firestore();
  await db.collection('pushTokens').doc(userId).set(
    {
      userId,
      token,
      updatedAt: fb.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  // Legacy compatibility cleanup: remove token from public user profile doc.
  await db.collection('users').doc(userId).set(
    { pushToken: fb.firestore.FieldValue.delete(), updatedAt: fb.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
}

export async function clearPushToken(userId: string) {
  const fb = ensureFirebase();
  if (!fb) {
    const map = readLocalPushTokens();
    delete map[userId];
    writeLocalPushTokens(map);
    return;
  }
  const db = fb.firestore();
  await db.collection('pushTokens').doc(userId).delete().catch(() => {});
  // Legacy compatibility cleanup: remove token from public user profile doc.
  await db.collection('users').doc(userId).set({ pushToken: fb.firestore.FieldValue.delete() }, { merge: true });
}

// Auth helpers
export async function linkAnonymousWithEmail({ email, password }: { email: string; password: string }) {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Firebase not initialized.');

  const auth = fb.auth();
  const user = auth.currentUser;
  if (!user) throw new Error('No authenticated user to link.');

  const cred = fb.auth.EmailAuthProvider.credential(email, password);
  const res = await user.linkWithCredential(cred);
  return res.user;
}

export async function signInWithEmail({ email, password }: { email: string; password: string }) {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Firebase not initialized.');
  const auth = fb.auth();
  const res = await auth.signInWithEmailAndPassword(email, password);
  return res.user;
}

export async function createAccountWithEmail({ email, password, name, city, campus, campusOrCity, handle, campusType, phone }: any) {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Firebase not initialized.');
  const auth = fb.auth();
  const res = await auth.createUserWithEmailAndPassword(email, password);
  const uid = res.user.uid;
  // send verification email (non-blocking)
  try {
    if (typeof res.user.sendEmailVerification === 'function') {
      const actionUrl =
        (process.env.FIREBASE_ACTION_URL as string) ||
        ((global as any)?.FIREBASE_ACTION_URL as string) ||
        undefined;
      const actionCodeSettings = actionUrl ? { url: actionUrl, handleCodeInApp: true } : undefined;
      // @ts-ignore
      void res.user.sendEmailVerification(actionCodeSettings);
    }
  } catch (e) {
    // ignore
  }
  // create profile doc in background for faster UX
  void createUserRemote({ userId: uid, name, city, campus, campusOrCity, campusType, handle, email, phone, photoUrl: res.user.photoURL || null });
  return res.user;
}

export function getWebRecaptchaVerifier(containerId: string, size: 'invisible' | 'normal' = 'invisible') {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Firebase not initialized.');
  if (typeof window === 'undefined' || typeof document === 'undefined') throw new Error('Recaptcha requires web');
  let el = document.getElementById(containerId);
  if (!el) {
    el = document.createElement('div');
    el.id = containerId;
    el.style.display = 'none';
    document.body.appendChild(el);
  }
  const verifier = new fb.auth.RecaptchaVerifier(containerId, { size });
  try {
    if (typeof verifier.render === 'function') verifier.render();
  } catch {}
  return verifier;
}

export async function startPhoneAuth(phone: string, verifier: any) {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Firebase not initialized.');
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error('Invalid phone number');
  const res = await fb.auth().signInWithPhoneNumber(normalized, verifier);
  return { verificationId: res.verificationId };
}

export async function confirmPhoneAuth(verificationId: string, code: string) {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Firebase not initialized.');
  const credential = fb.auth.PhoneAuthProvider.credential(verificationId, code);
  const res = await fb.auth().signInWithCredential(credential);
  return res.user;
}

export async function sendVerificationEmail(actionUrl?: string) {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Firebase not initialized.');
  const auth = fb.auth();
  const user = auth.currentUser;
  if (!user) throw new Error('No authenticated user to send verification to');
  try {
    const fallbackUrl =
      actionUrl ||
      (process.env.FIREBASE_ACTION_URL as string) ||
      ((global as any)?.FIREBASE_ACTION_URL as string) ||
      undefined;
    const actionCodeSettings = fallbackUrl ? { url: fallbackUrl, handleCodeInApp: true } : undefined;
    // @ts-ignore
    if (typeof user.sendEmailVerification === 'function') await user.sendEmailVerification(actionCodeSettings);
  } catch (e) {
    throw e;
  }
}

export async function sendPasswordResetEmail(email: string) {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Firebase not initialized.');
  const auth = fb.auth();
  await auth.sendPasswordResetEmail(email);
}

export async function updateCurrentUserPassword(newPassword: string) {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Firebase not initialized.');
  const user = fb.auth().currentUser;
  if (!user) throw new Error('No authenticated user');
  await user.updatePassword(newPassword);
}

export async function deleteCurrentUser() {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Firebase not initialized.');
  const user = fb.auth().currentUser;
  if (!user) throw new Error('No authenticated user');
  await user.delete();
}

export async function deleteAccountAndData({ password }: { password?: string } = {}) {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Firebase not initialized.');
  const auth = fb.auth();
  const current = auth.currentUser;
  if (!current) throw new Error('No authenticated user');

  const userId = current.uid;
  const email = current.email || undefined;
  if (password && email) {
    await reauthenticateCurrentUser({ email, password });
  }

  const db = fb.firestore();

  // Attempt to remove user-generated content first while still authenticated.
  try {
    // Remove this user from friends lists (best effort).
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      const friends = normalizeStringArray(userDoc.data()?.friends);
      for (const friendId of friends) {
        try {
          await db
            .collection('users')
            .doc(friendId)
            .set({ friends: fb.firestore.FieldValue.arrayRemove(userId) }, { merge: true });
        } catch {}
      }
    } catch {}

    // Delete friend requests to/from this user.
    try {
      const toSnap = await db.collection('friendRequests').where('toId', '==', userId).get();
      for (const doc of toSnap.docs) {
        try {
          await db.collection('friendRequests').doc(doc.id).delete();
        } catch {}
      }
    } catch {}
    try {
      const fromSnap = await db.collection('friendRequests').where('fromId', '==', userId).get();
      for (const doc of fromSnap.docs) {
        try {
          await db.collection('friendRequests').doc(doc.id).delete();
        } catch {}
      }
    } catch {}

    // Delete check-ins authored by this user (batch in pages).
    for (let page = 0; page < 20; page++) {
      const snap = await db.collection('checkins').where('userId', '==', userId).limit(50).get();
      if (snap.empty) break;
      const batch = db.batch();
      snap.docs.forEach((d: any) => batch.delete(d.ref));
      await batch.commit();
      if (snap.size < 50) break;
    }

    // Delete the user profile document last.
    try {
      await db.collection('users').doc(userId).delete();
    } catch {}
  } catch (e) {
    // Continue to account deletion; server-side cleanup can be handled separately if needed.
  }

  // Finally, delete the auth account.
  await deleteCurrentUser();
}

export async function reauthenticateCurrentUser({ email, password }: { email: string; password: string }) {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Firebase not initialized.');
  const user = fb.auth().currentUser;
  if (!user) throw new Error('No authenticated user');
  const cred = fb.auth.EmailAuthProvider.credential(email, password);
  // modern API name may be reauthenticateWithCredential
  if (typeof user.reauthenticateWithCredential === 'function') {
    await user.reauthenticateWithCredential(cred);
  } else if (typeof user.reauthenticate === 'function') {
    await user.reauthenticate(cred);
  } else {
    throw new Error('Reauthentication not supported in this Firebase SDK');
  }
}

export async function addReactionToFirestore(reaction: {
  id: string;
  checkinId: string;
  userId: string;
  userName: string;
  userHandle?: string;
  type: string;
  createdAt: number;
}) {
  const fb = ensureFirebase();
  if (!fb || !reaction?.checkinId || !reaction?.userId || !reaction?.type) return false;
  const currentUid = fb.auth?.()?.currentUser?.uid || null;
  if (!currentUid || currentUid !== reaction.userId) return false;
  const db = fb.firestore();
  const sanitizeId = (value: string) => String(value || '').replace(/[\/#?]+/g, '_');
  const deterministicId = `rx_${sanitizeId(reaction.checkinId)}_${sanitizeId(reaction.userId)}`;
  const id = deterministicId || reaction.id || `${reaction.userId}_${reaction.type}_${Date.now()}`;
  try {
    await db.collection('reactions').doc(id).set({
      ...reaction,
      createdAt: reaction.createdAt || Date.now(),
      updatedAt: fb.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  } catch (error) {
    devLog('addReactionToFirestore failed', error);
    return false;
  }
}

export async function removeReactionFromFirestore(checkinId: string, userId: string, type: string) {
  const fb = ensureFirebase();
  if (!fb || !checkinId || !userId || !type) return false;
  const currentUid = fb.auth?.()?.currentUser?.uid || null;
  if (!currentUid || currentUid !== userId) return false;
  const db = fb.firestore();
  const sanitizeId = (value: string) => String(value || '').replace(/[\/#?]+/g, '_');
  const deterministicId = `rx_${sanitizeId(checkinId)}_${sanitizeId(userId)}`;
  const deterministicRef = db.collection('reactions').doc(deterministicId);

  try {
    const deterministicSnap = await deterministicRef.get();
    if (deterministicSnap.exists) {
      const data = deterministicSnap.data() || {};
      if (!data.type || data.type === type) {
        await deterministicRef.delete();
      }
    }
  } catch {}

  // Legacy cleanup for older reaction IDs.
  try {
    const snap = await db
      .collection('reactions')
      .where('checkinId', '==', checkinId)
      .where('userId', '==', userId)
      .where('type', '==', type)
      .limit(50)
      .get();
    if (snap.empty) return true;
    const batch = db.batch();
    snap.docs.forEach((doc: any) => batch.delete(doc.ref));
    await batch.commit();
    return true;
  } catch (error) {
    devLog('removeReactionFromFirestore failed', error);
    return false;
  }
}

export async function getReactionsFromFirestore(checkinId: string, limit = 250) {
  const fb = ensureFirebase();
  if (!fb || !checkinId) return [];
  const db = fb.firestore();
  const safeLimit = Math.min(Math.max(limit, 1), 500);
  let snap: any;
  try {
    snap = await db
      .collection('reactions')
      .where('checkinId', '==', checkinId)
      .orderBy('createdAt', 'desc')
      .limit(safeLimit)
      .get();
  } catch (error) {
    devLog('getReactionsFromFirestore failed', error);
    return [];
  }
  const items: any[] = [];
  snap.forEach((doc: any) => {
    items.push({ id: doc.id, ...(doc.data() || {}) });
  });
  const dedupedByUser = new Map<string, any>();
  items.forEach((item) => {
    const key = item?.userId ? String(item.userId) : `anon:${item?.id || ''}`;
    if (!dedupedByUser.has(key)) {
      dedupedByUser.set(key, item);
    }
  });
  return Array.from(dedupedByUser.values());
}

export async function addCommentToFirestore(comment: {
  id: string;
  checkinId: string;
  userId: string;
  userName: string;
  userHandle?: string;
  userPhotoUrl?: string;
  text: string;
  createdAt: number;
}) {
  const fb = ensureFirebase();
  if (!fb || !comment?.checkinId || !comment?.userId || !comment?.text) return;
  const db = fb.firestore();
  const id = comment.id || `comment_${Date.now()}`;
  await db.collection('comments').doc(id).set({
    ...comment,
    createdAt: comment.createdAt || Date.now(),
    updatedAt: fb.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function getCommentsFromFirestore(checkinId: string, limit = 200) {
  const fb = ensureFirebase();
  if (!fb || !checkinId) return [];
  const db = fb.firestore();
  const safeLimit = Math.min(Math.max(limit, 1), 300);
  const snap = await db
    .collection('comments')
    .where('checkinId', '==', checkinId)
    .orderBy('createdAt', 'asc')
    .limit(safeLimit)
    .get();
  const items: any[] = [];
  snap.forEach((doc: any) => {
    items.push({ id: doc.id, ...(doc.data() || {}) });
  });
  return items;
}

export async function deleteCommentFromFirestore(commentId: string, userId: string) {
  const fb = ensureFirebase();
  if (!fb || !commentId || !userId) return;
  const db = fb.firestore();
  const ref = db.collection('comments').doc(commentId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() || {};
  if (data.userId !== userId) return;
  await ref.delete();
}

export async function updateCommentInFirestore(commentId: string, userId: string, text: string) {
  const fb = ensureFirebase();
  if (!fb || !commentId || !userId || !text.trim()) return;
  const db = fb.firestore();
  const ref = db.collection('comments').doc(commentId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data() || {};
  if (data.userId !== userId) return;
  await ref.set(
    {
      text: text.trim(),
      updatedAt: fb.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}
