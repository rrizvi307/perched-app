/**
 * Perched Cloud Functions
 *
 * Deploy with: cd functions && npm install && npm run deploy
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions/v1';
import * as crypto from 'crypto';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import * as winston from 'winston';
import * as Joi from 'joi';
import { validateSpotLive } from '../../services/spotSchema';
import { normalizePhone } from '../../utils/phone';
import { normalizeProviderError, resolveSendgridFailure, shouldThrottleSigninAlert } from './signinAlertUtils';

admin.initializeApp();

const secretClient = new SecretManagerServiceClient();

// Configure Winston structured logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'perched-b2b-api' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

/**
 * Generate a unique trace ID for request tracking
 */
function generateTraceId(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Log structured request information
 */
function logRequest(
  traceId: string,
  endpoint: string,
  partnerId: string,
  durationMs: number,
  statusCode: number,
  metadata?: Record<string, any>
) {
  logger.info({
    traceId,
    endpoint,
    partnerId,
    durationMs,
    statusCode,
    timestamp: Date.now(),
    ...metadata,
  });
}

const db = admin.firestore();
const USERS_COLLECTION = 'users';
const PUBLIC_PROFILES_COLLECTION = 'publicProfiles';
const USER_PRIVATE_COLLECTION = 'userPrivate';
const SOCIAL_GRAPH_COLLECTION = 'socialGraph';
const PUSH_TOKENS_COLLECTION = 'pushTokens';

const API_KEY_HASH_COLLECTION = 'apiKeyHashes';
const API_KEY_CACHE_TTL_MS = 60 * 1000;
const apiKeyCache = new Map<string, { ts: number; docId: string; data: any }>();
const LOGIN_NOTIFICATION_COLLECTION = 'login_notifications';
const LOGIN_NOTIFICATION_STATE_COLLECTION = 'login_notification_state';
const SIGNIN_ALERT_THROTTLE_MS = 2 * 60 * 1000;

const B2B_SPOT_CHECKIN_LIMIT = 60;
const B2B_NEARBY_SPOT_SCAN_LIMIT = 100;
const B2B_NEARBY_CANDIDATE_LIMIT = 40;
const B2B_NEARBY_BATCH_QUERY_LIMIT = 250;
const B2B_NEARBY_IN_MAX = 10;
const B2B_NEARBY_WINDOW_MS = 2 * 60 * 60 * 1000;
const EARLY_ADOPTER_WEEKLY_TARGET = 3;
const APP_CHECK_TOKEN_TTL_MS = 60 * 60 * 1000;

const BACKEND_PERF_COLLECTION = 'backendPerformanceMetrics';

function isBackendPerfEnabled(): boolean {
  const value = String(process.env.BACKEND_PERF_METRICS_ENABLED || '').toLowerCase().trim();
  return ['1', 'true', 'yes', 'on'].includes(value);
}

async function recordBackendPerf(
  operation: string,
  durationMs: number,
  ok: boolean,
  metadata?: Record<string, any>,
) {
  if (!isBackendPerfEnabled()) return;
  try {
    await db.collection(BACKEND_PERF_COLLECTION).add({
      operation,
      durationMs: Math.max(0, Number(durationMs) || 0),
      ok,
      timestamp: Date.now(),
      ...metadata,
    });
  } catch {
    // Never fail request path due to telemetry.
  }
}

function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

function buildApiKeyPreview(apiKey: string): string {
  const normalized = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!normalized) return '';
  if (normalized.length <= 18) return normalized;
  return `${normalized.slice(0, 12)}...${normalized.slice(-4)}`;
}

function buildApiKeyMetadata(apiKey: string) {
  const normalized = typeof apiKey === 'string' ? apiKey.trim() : '';
  return {
    keyPreview: buildApiKeyPreview(normalized),
    keyLast4: normalized ? normalized.slice(-4) : '',
  };
}

function sanitizeApiKeyRecordData(data: any) {
  if (!data || typeof data !== 'object') return {};
  const next = { ...data };
  delete next.key;
  return next;
}

function maybeSelfHealApiKeyRecord(
  ref: FirebaseFirestore.DocumentReference,
  rawData: any,
  keyHash: string,
  apiKey: string,
) {
  const updates: Record<string, any> = {};
  const metadata = buildApiKeyMetadata(apiKey);
  const rawKeyHash = asId(rawData?.keyHash);

  if (rawKeyHash !== keyHash) {
    updates.keyHash = keyHash;
  }
  if (rawData?.keyPreview !== metadata.keyPreview) {
    updates.keyPreview = metadata.keyPreview;
  }
  if (rawData?.keyLast4 !== metadata.keyLast4) {
    updates.keyLast4 = metadata.keyLast4;
  }
  if (typeof rawData?.key === 'string' && rawData.key) {
    updates.key = admin.firestore.FieldValue.delete();
  }

  if (Object.keys(updates).length > 0) {
    updates.updatedAt = Date.now();
    void ref.set(updates, { merge: true }).catch(() => {});
  }

  void db.collection(API_KEY_HASH_COLLECTION).doc(keyHash).set(
    {
      partnerId: ref.id,
      updatedAt: Date.now(),
    },
    { merge: true },
  ).catch(() => {});
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (!Array.isArray(items) || size <= 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function toFiniteNumber(value: any): number | null {
  const num = typeof value === 'number' ? value : null;
  if (num === null || !Number.isFinite(num)) return null;
  return num;
}

function normalizeBoundedMetric(value: any, min = 1, max = 5): number | null {
  const num = toFiniteNumber(value);
  if (num === null) return null;
  if (num < min || num > max) return null;
  return num;
}

function normalizeNoiseMetric(value: any): number | null {
  const numeric = normalizeBoundedMetric(value, 1, 5);
  if (numeric !== null) return numeric;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'quiet') return 2;
  if (normalized === 'moderate') return 3;
  if (normalized === 'lively' || normalized === 'loud') return 4;
  return null;
}

function normalizeBusynessMetric(value: any): number | null {
  const numeric = normalizeBoundedMetric(value, 1, 5);
  if (numeric !== null) return numeric;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'empty') return 1;
  if (normalized === 'some') return 3;
  if (normalized === 'packed') return 5;
  return null;
}

function normalizeWifiMetric(value: any): number | null {
  const numeric = normalizeBoundedMetric(value, 1, 5);
  if (numeric !== null) return numeric;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (['bad', 'poor', 'unusable', 'slow'].includes(normalized)) return 1;
  if (['ok', 'decent', 'average', 'moderate'].includes(normalized)) return 3;
  if (['fast', 'great', 'excellent', 'blazing'].includes(normalized)) return 5;
  return null;
}

function readSpotCoords(spot: any): { lat: number; lng: number } | null {
  const rawLat = spot?.location?.latitude ?? spot?.location?.lat;
  const rawLng = spot?.location?.longitude ?? spot?.location?.lng;
  const lat = toFiniteNumber(rawLat);
  const lng = toFiniteNumber(rawLng);
  if (lat === null || lng === null) return null;
  return { lat, lng };
}

function toMillis(value: any): number | null {
  const direct = toFiniteNumber(value);
  if (direct !== null) return direct;
  if (!value || typeof value !== 'object') return null;
  if (typeof value.toMillis === 'function') {
    try {
      const ms = value.toMillis();
      return toFiniteNumber(ms);
    } catch {
      return null;
    }
  }
  const seconds = toFiniteNumber(value.seconds);
  const nanos = toFiniteNumber(value.nanoseconds);
  if (seconds === null) return null;
  return Math.floor(seconds * 1000 + (nanos ?? 0) / 1_000_000);
}

function readCheckinTimeMs(checkin: any): number | null {
  return toMillis(checkin?.createdAt ?? checkin?.timestamp);
}

function getWeekWindowFromMs(nowMs: number) {
  const start = new Date(nowMs);
  start.setHours(0, 0, 0, 0);
  const dayOffsetFromMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dayOffsetFromMonday);
  const weekStartMs = start.getTime();
  const weekEndMs = weekStartMs + 7 * 24 * 60 * 60 * 1000 - 1;
  const weekKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
  return { weekKey, weekStartMs, weekEndMs };
}

type GamificationStats = {
  totalCheckins: number;
  uniqueSpots: number;
  friendsCount: number;
  streakDays: number;
  longestStreak: number;
  nightOwlCheckins: number;
  earlyBirdCheckins: number;
  weekendCheckins: number;
  returnVisits: number;
  firstDiscoveries: number;
  lastCheckinDate: number | null;
  spotVisits: Record<string, number>;
};

type GamificationAchievementDefinition = {
  id: string;
  name: string;
  description: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  unlocked: (stats: GamificationStats) => boolean;
};

const GAMIFICATION_ACHIEVEMENTS: GamificationAchievementDefinition[] = [
  {
    id: 'explorer_bronze',
    name: 'Explorer',
    description: 'Check in at 5 different spots',
    tier: 'bronze',
    unlocked: (stats) => stats.uniqueSpots >= 5,
  },
  {
    id: 'explorer_silver',
    name: 'World Traveler',
    description: 'Check in at 25 different spots',
    tier: 'silver',
    unlocked: (stats) => stats.uniqueSpots >= 25,
  },
  {
    id: 'explorer_gold',
    name: 'Legendary Explorer',
    description: 'Check in at 100 different spots',
    tier: 'gold',
    unlocked: (stats) => stats.uniqueSpots >= 100,
  },
  {
    id: 'social_bronze',
    name: 'Social Butterfly',
    description: 'Connect with 10 friends',
    tier: 'bronze',
    unlocked: (stats) => stats.friendsCount >= 10,
  },
  {
    id: 'social_silver',
    name: 'Connector',
    description: 'Connect with 50 friends',
    tier: 'silver',
    unlocked: (stats) => stats.friendsCount >= 50,
  },
  {
    id: 'streak_bronze',
    name: 'Getting Started',
    description: 'Check in 3 days in a row',
    tier: 'bronze',
    unlocked: (stats) => stats.streakDays >= 3,
  },
  {
    id: 'streak_silver',
    name: 'Week Warrior',
    description: 'Check in 7 days in a row',
    tier: 'silver',
    unlocked: (stats) => stats.streakDays >= 7,
  },
  {
    id: 'streak_gold',
    name: 'Unstoppable',
    description: 'Check in 30 days in a row',
    tier: 'gold',
    unlocked: (stats) => stats.streakDays >= 30,
  },
  {
    id: 'streak_platinum',
    name: 'Legend',
    description: 'Check in 100 days in a row',
    tier: 'platinum',
    unlocked: (stats) => stats.streakDays >= 100,
  },
  {
    id: 'night_owl',
    name: 'Night Owl',
    description: 'Check in after 10pm 10 times',
    tier: 'bronze',
    unlocked: (stats) => stats.nightOwlCheckins >= 10,
  },
  {
    id: 'early_bird',
    name: 'Early Bird',
    description: 'Check in before 8am 10 times',
    tier: 'bronze',
    unlocked: (stats) => stats.earlyBirdCheckins >= 10,
  },
  {
    id: 'weekend_warrior',
    name: 'Weekend Warrior',
    description: 'Check in on weekends 20 times',
    tier: 'silver',
    unlocked: (stats) => stats.weekendCheckins >= 20,
  },
  {
    id: 'loyal_bronze',
    name: 'Regular',
    description: 'Return to the same spot 5 times',
    tier: 'bronze',
    unlocked: (stats) => stats.returnVisits >= 5,
  },
  {
    id: 'loyal_silver',
    name: 'Super Regular',
    description: 'Return to the same spot 20 times',
    tier: 'silver',
    unlocked: (stats) => stats.returnVisits >= 20,
  },
  {
    id: 'trendsetter',
    name: 'Trendsetter',
    description: 'Be first to discover 5 new spots',
    tier: 'silver',
    unlocked: (stats) => stats.firstDiscoveries >= 5,
  },
];

const GAMIFICATION_DAY_MS = 24 * 60 * 60 * 1000;

function createDefaultGamificationStats(friendsCount = 0): GamificationStats {
  return {
    totalCheckins: 0,
    uniqueSpots: 0,
    friendsCount,
    streakDays: 0,
    longestStreak: 0,
    nightOwlCheckins: 0,
    earlyBirdCheckins: 0,
    weekendCheckins: 0,
    returnVisits: 0,
    firstDiscoveries: 0,
    lastCheckinDate: null,
    spotVisits: {},
  };
}

function toDayStartMs(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function getGamificationSpotKey(checkin: any): string {
  const canonicalId = asId(checkin?.spotPlaceId || checkin?.spotId);
  if (canonicalId) return canonicalId;
  const fallbackName = asId(checkin?.spotName || checkin?.spot);
  return fallbackName ? fallbackName.toLowerCase() : '';
}

function getDiscoverySpotKey(checkin: any): string {
  return asId(checkin?.spotPlaceId || checkin?.spotId);
}

function buildGamificationStatsFromCheckins(
  checkins: any[],
  friendsCount: number,
  firstDiscoveries: number,
): GamificationStats {
  const normalized = (checkins || [])
    .map((checkin: any) => ({
      checkin,
      ts: readCheckinTimeMs(checkin) || 0,
    }))
    .filter((entry) => entry.ts > 0)
    .sort((a, b) => b.ts - a.ts);

  if (!normalized.length) {
    return createDefaultGamificationStats(friendsCount);
  }

  const spotVisits: Record<string, number> = {};
  let nightOwlCheckins = 0;
  let earlyBirdCheckins = 0;
  let weekendCheckins = 0;
  const dayStarts = new Set<number>();

  normalized.forEach(({ checkin, ts }) => {
    const spotKey = getGamificationSpotKey(checkin);
    if (spotKey) {
      spotVisits[spotKey] = (spotVisits[spotKey] || 0) + 1;
    }
    const date = new Date(ts);
    const hour = date.getHours();
    const day = date.getDay();
    if (hour >= 22 || hour < 6) nightOwlCheckins += 1;
    if (hour >= 5 && hour < 8) earlyBirdCheckins += 1;
    if (day === 0 || day === 6) weekendCheckins += 1;
    dayStarts.add(toDayStartMs(ts));
  });

  const sortedDaysAsc = Array.from(dayStarts).sort((a, b) => a - b);
  let longestStreak = 0;
  let rolling = 0;
  let previousDay: number | null = null;
  sortedDaysAsc.forEach((dayStart) => {
    if (previousDay !== null && dayStart - previousDay === GAMIFICATION_DAY_MS) {
      rolling += 1;
    } else {
      rolling = 1;
    }
    previousDay = dayStart;
    if (rolling > longestStreak) longestStreak = rolling;
  });

  let streakDays = 0;
  if (sortedDaysAsc.length > 0) {
    const daySet = new Set(sortedDaysAsc);
    let cursor = sortedDaysAsc[sortedDaysAsc.length - 1];
    while (daySet.has(cursor)) {
      streakDays += 1;
      cursor -= GAMIFICATION_DAY_MS;
    }
  }

  return {
    totalCheckins: normalized.length,
    uniqueSpots: Object.keys(spotVisits).length,
    friendsCount,
    streakDays,
    longestStreak,
    nightOwlCheckins,
    earlyBirdCheckins,
    weekendCheckins,
    returnVisits: Object.values(spotVisits).filter((count) => count >= 3).length,
    firstDiscoveries,
    lastCheckinDate: normalized[0]?.ts || null,
    spotVisits,
  };
}

function sameIdList(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function sameCheckinGamificationFields(before: any, after: any): boolean {
  return (
    asId(before?.userId) === asId(after?.userId) &&
    getGamificationSpotKey(before) === getGamificationSpotKey(after) &&
    getDiscoverySpotKey(before) === getDiscoverySpotKey(after) &&
    (readCheckinTimeMs(before) || 0) === (readCheckinTimeMs(after) || 0)
  );
}

async function countFirstDiscoveriesForUser(userId: string, discoverySpotIds: string[]): Promise<number> {
  if (!userId || !discoverySpotIds.length) return 0;
  let count = 0;
  for (const spotId of discoverySpotIds) {
    try {
      const snapshot = await db.collection('checkins')
        .where('spotPlaceId', '==', spotId)
        .orderBy('createdAt', 'asc')
        .limit(1)
        .get();
      const first = snapshot.docs[0];
      if (first && asId(first.data()?.userId) === userId) {
        count += 1;
      }
    } catch {
      // Ignore per-spot failures so one bad query does not block all stats.
    }
  }
  return count;
}

async function syncAchievementUnlocksForUser(userId: string, stats: GamificationStats): Promise<void> {
  const unlocked = GAMIFICATION_ACHIEVEMENTS.filter((achievement) => achievement.unlocked(stats));
  if (!unlocked.length) return;

  const existingSnapshot = await db.collection('achievements').where('userId', '==', userId).get();
  const existingIds = new Set(
    existingSnapshot.docs
      .map((doc) => asId(doc.data()?.achievementId))
      .filter(Boolean),
  );

  const batch = db.batch();
  let writes = 0;
  unlocked.forEach((achievement) => {
    if (existingIds.has(achievement.id)) return;
    const ref = db.collection('achievements').doc(`${userId}_${achievement.id}`);
    batch.set(ref, {
      userId,
      achievementId: achievement.id,
      name: achievement.name,
      description: achievement.description,
      tier: achievement.tier,
      unlockedAt: admin.firestore.FieldValue.serverTimestamp(),
      unlockedAtMs: Date.now(),
      source: 'server_gamification',
    }, { merge: true });
    writes += 1;
  });

  if (writes > 0) {
    await batch.commit();
  }
}

async function syncGamificationForUser(userId: string): Promise<void> {
  if (!userId) return;

  const [socialGraphDoc, checkinsSnapshot] = await Promise.all([
    getSocialGraphDoc(userId),
    db.collection('checkins').where('userId', '==', userId).get(),
  ]);

  const userData = socialGraphDoc.exists ? (socialGraphDoc.data() || {}) : {};
  const friendsCount = normalizeIdList(userData.friends).length;
  const checkins = checkinsSnapshot.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
  const discoverySpotIds = Array.from(new Set(
    checkins
      .map((checkin) => getDiscoverySpotKey(checkin))
      .filter(Boolean),
  ));
  const firstDiscoveries = await countFirstDiscoveriesForUser(userId, discoverySpotIds);
  const stats = buildGamificationStatsFromCheckins(checkins, friendsCount, firstDiscoveries);
  const timestamp = admin.firestore.FieldValue.serverTimestamp();

  await db.collection('userStats').doc(userId).set({
    userId,
    ...stats,
    updatedAt: timestamp,
    computedAtMs: Date.now(),
  }, { merge: true });

  await writeUserPrivateAccount(userId, {
    streakDays: stats.streakDays,
    longestStreak: stats.longestStreak,
  });

  await syncAchievementUnlocksForUser(userId, stats);
}

type ApiKeyLookup = {
  docId: string;
  ref: FirebaseFirestore.DocumentReference;
  data: any;
};

async function resolveApiKeyRecord(apiKey: string): Promise<ApiKeyLookup | null> {
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!key) return null;

  const keyHash = hashApiKey(key);

  const cached = apiKeyCache.get(keyHash);
  const now = Date.now();
  if (cached && now - cached.ts < API_KEY_CACHE_TTL_MS) {
    return {
      docId: cached.docId,
      ref: db.collection('apiKeys').doc(cached.docId),
      data: cached.data,
    };
  }

  try {
    const hashDoc = await db.collection(API_KEY_HASH_COLLECTION).doc(keyHash).get();
    const partnerId = asId(hashDoc.data()?.partnerId);
    if (partnerId) {
      const keyDoc = await db.collection('apiKeys').doc(partnerId).get();
      if (keyDoc.exists) {
        const rawKeyData = keyDoc.data() || {};
        const storedHash = asId(rawKeyData.keyHash);
        if (!storedHash || storedHash === keyHash) {
          const keyData = sanitizeApiKeyRecordData(rawKeyData);
          apiKeyCache.set(keyHash, { ts: now, docId: keyDoc.id, data: keyData });
          maybeSelfHealApiKeyRecord(keyDoc.ref, rawKeyData, keyHash, key);
          return { docId: keyDoc.id, ref: keyDoc.ref, data: keyData };
        }
      }
    }
  } catch {
    // Fall through to hash query fallback.
  }

  const keysSnapshot = await db.collection('apiKeys').where('keyHash', '==', keyHash).limit(1).get();
  if (keysSnapshot.empty) return null;

  const keyDoc = keysSnapshot.docs[0];
  const rawKeyData = keyDoc.data() || {};
  const keyData = sanitizeApiKeyRecordData(rawKeyData);
  apiKeyCache.set(keyHash, { ts: now, docId: keyDoc.id, data: keyData });
  maybeSelfHealApiKeyRecord(keyDoc.ref, rawKeyData, keyHash, key);

  return { docId: keyDoc.id, ref: keyDoc.ref, data: keyData };
}

function asId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeSigninNotificationMeta(value: unknown): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries = Object.entries(value as Record<string, unknown>).slice(0, 12);
  const next: Record<string, string | number | boolean | null> = {};
  entries.forEach(([key, raw]) => {
    const safeKey = asId(key).slice(0, 40);
    if (!safeKey) return;
    if (typeof raw === 'string') {
      next[safeKey] = raw.slice(0, 200);
      return;
    }
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      next[safeKey] = raw;
      return;
    }
    if (typeof raw === 'boolean') {
      next[safeKey] = raw;
      return;
    }
    if (raw === null) {
      next[safeKey] = null;
    }
  });
  return next;
}

async function resolveSigninAlertEmail(userId: string, fallbackEmail?: string): Promise<string> {
  if (!userId) return '';
  const privateData = await getPrivateAccountData(userId);
  const privateEmail = asId(privateData?.email).toLowerCase();
  if (privateEmail) return privateEmail;

  return asId(fallbackEmail).toLowerCase();
}

async function sendSigninAlertEmail(email: string, ip?: string | null): Promise<{ sent: boolean; provider: 'sendgrid' | 'log_only'; error?: string | null }> {
  const normalizedEmail = asId(email).toLowerCase();
  if (!normalizedEmail) {
    return { sent: false, provider: 'log_only', error: 'missing_email' };
  }

  let sendgridKey = readFirstNonEmpty(
    process.env.SENDGRID_API_KEY,
    runtimeConfig?.notifications?.sendgrid_api_key,
    runtimeConfig?.sendgrid_api_key,
  );
  if (!sendgridKey) {
    sendgridKey = await getCachedSecret('SENDGRID_API_KEY');
  }
  if (!sendgridKey) {
    return { sent: false, provider: 'log_only', error: 'missing_sendgrid_key' };
  }

  const fromEmail = readFirstNonEmpty(
    process.env.SENDGRID_FROM_EMAIL,
    runtimeConfig?.notifications?.from_email,
    runtimeConfig?.sendgrid_from_email,
    'perchedappteam@gmail.com',
  );
  const fromName = readFirstNonEmpty(
    process.env.SENDGRID_FROM_NAME,
    runtimeConfig?.notifications?.from_name,
    runtimeConfig?.sendgrid_from_name,
    'Perched',
  );
  const subject = 'New sign-in to your Perched account';
  const text = `We detected a sign-in to your account${ip ? ` from IP ${ip}.` : '.'}

If this was you, no action is needed. If you did not sign in, please reset your password.`;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = setTimeout(() => controller?.abort(), 3500);
  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sendgridKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: normalizedEmail }], subject }],
        from: { email: fromEmail, name: fromName },
        content: [{ type: 'text/plain', value: text }],
      }),
      signal: controller?.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return { sent: false, provider: 'sendgrid', error: resolveSendgridFailure(response.status, errorText) };
    }

    return { sent: true, provider: 'sendgrid', error: null };
  } catch (error: any) {
    return { sent: false, provider: 'sendgrid', error: normalizeProviderError(error) };
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeIdList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    items.push(id);
  }
  return items;
}

function sanitizePublicUserProfile(userId: string, data: Record<string, any> | null | undefined) {
  const user = data || {};
  return {
    id: userId,
    name: typeof user.name === 'string' ? user.name : null,
    handle: typeof user.handle === 'string' ? user.handle : null,
    photoUrl: typeof user.photoUrl === 'string' ? user.photoUrl : null,
    avatarUrl: typeof user.avatarUrl === 'string' ? user.avatarUrl : null,
    city: typeof user.city === 'string' ? user.city : null,
    campus: typeof user.campus === 'string' ? user.campus : null,
    campusOrCity: typeof user.campusOrCity === 'string' ? user.campusOrCity : null,
    campusType: typeof user.campusType === 'string' ? user.campusType : null,
    coffeeIntents: Array.isArray(user.coffeeIntents) ? user.coffeeIntents.slice(0, 3) : [],
    ambiancePreference: typeof user.ambiancePreference === 'string' ? user.ambiancePreference : null,
    createdAt: user.createdAt || null,
    updatedAt: user.updatedAt || null,
  };
}

function normalizeSocialGraph(data: Record<string, any> | null | undefined) {
  return {
    friends: normalizeIdList(data?.friends),
    closeFriends: normalizeIdList(data?.closeFriends),
    blocked: normalizeIdList(data?.blocked),
  };
}

async function getPublicProfileDoc(userId: string) {
  return db.collection(PUBLIC_PROFILES_COLLECTION).doc(userId).get();
}

async function getSocialGraphDoc(userId: string) {
  return db.collection(SOCIAL_GRAPH_COLLECTION).doc(userId).get();
}

async function getPrivateAccountData(userId: string) {
  const privateDoc = await db.collection(USER_PRIVATE_COLLECTION).doc(userId).get();
  const legacyDoc = privateDoc.exists ? null : await db.collection(USERS_COLLECTION).doc(userId).get();
  return {
    ...(legacyDoc?.exists ? legacyDoc.data() || {} : {}),
    ...(privateDoc.exists ? privateDoc.data() || {} : {}),
  };
}

async function writeUserPrivateAccount(
  userId: string,
  fields: Record<string, any>,
  options: { isCreate?: boolean } = {},
) {
  const payload = {
    ...fields,
    ...(options.isCreate ? { createdAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await db.collection(USER_PRIVATE_COLLECTION).doc(userId).set(payload, { merge: true });
}

function sanitizeRecommendationLimit(value: unknown, fallback = 5, max = 10): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(numeric)));
}

const CHECKIN_MIN_INTERVAL_MS = 30 * 1000;
const CHECKIN_MAX_PER_HOUR = 24;
const CHECKIN_WINDOW_MS = 60 * 60 * 1000;

function sanitizeOptionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function sanitizeCheckinVisibility(value: unknown): 'public' | 'friends' | 'close' {
  return value === 'friends' || value === 'close' ? value : 'public';
}

function sanitizeCheckinStringArray(value: unknown, maxItems: number, maxItemLength = 40): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of value) {
    if (typeof raw !== 'string') continue;
    const next = raw.trim().slice(0, maxItemLength);
    if (!next || seen.has(next)) continue;
    seen.add(next);
    result.push(next);
    if (result.length >= maxItems) break;
  }
  return result;
}

function sanitizeSpotLatLng(value: unknown): { lat: number; lng: number } | null {
  if (!value || typeof value !== 'object') return null;
  const lat = typeof (value as any).lat === 'number' ? (value as any).lat : null;
  const lng = typeof (value as any).lng === 'number' ? (value as any).lng : null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

async function hasPostingAccessForActor(actorId: string, authToken: Record<string, any> | undefined) {
  if (authToken?.email_verified === true) return true;
  if (typeof authToken?.phone_number === 'string' && authToken.phone_number.trim()) return true;
  const adminDoc = await db.collection('admins').doc(actorId).get();
  return adminDoc.exists;
}

function buildCallableCheckinPayload(actorId: string, data: any, nowMs: number) {
  const createdAt = admin.firestore.Timestamp.fromMillis(nowMs);
  return {
    clientId: sanitizeOptionalText(data?.clientId, 120),
    userId: actorId,
    userName: sanitizeOptionalText(data?.userName, 120),
    userHandle: sanitizeOptionalText(data?.userHandle, 64),
    userPhotoUrl: sanitizeOptionalText(data?.userPhotoUrl, 2048),
    visibility: sanitizeCheckinVisibility(data?.visibility),
    spotName: sanitizeOptionalText(data?.spotName, 160) || '',
    spotPlaceId: sanitizeOptionalText(data?.spotPlaceId, 160),
    spotLatLng: sanitizeSpotLatLng(data?.spotLatLng),
    caption: sanitizeOptionalText(data?.caption, 500) || '',
    tags: sanitizeCheckinStringArray(data?.tags, 8),
    visitIntent: sanitizeCheckinStringArray(data?.visitIntent, 2),
    photoTags: sanitizeCheckinStringArray(data?.photoTags, 3),
    ambiance: sanitizeOptionalText(data?.ambiance, 60),
    photoUrl: sanitizeOptionalText(data?.photoUrl, 2048),
    photoPath: sanitizeOptionalText(data?.photoPath, 2048),
    photoPending: Boolean(data?.photoPending),
    campusOrCity: sanitizeOptionalText(data?.campusOrCity ?? data?.city, 120),
    city: sanitizeOptionalText(data?.city, 120),
    campus: sanitizeOptionalText(data?.campus, 120),
    createdAt,
    createdAtServer: admin.firestore.FieldValue.serverTimestamp(),
    createdAtMs: nowMs,
    approved: true,
    moderation: { status: 'approved' },
  };
}

function serializeCreatedCheckin(checkinId: string, payload: Record<string, any>) {
  return {
    id: checkinId,
    clientId: payload.clientId ?? null,
    userId: payload.userId,
    userName: payload.userName ?? null,
    userHandle: payload.userHandle ?? null,
    userPhotoUrl: payload.userPhotoUrl ?? null,
    visibility: payload.visibility,
    spotName: payload.spotName,
    spotPlaceId: payload.spotPlaceId ?? null,
    spotLatLng: payload.spotLatLng ?? null,
    caption: payload.caption ?? '',
    tags: payload.tags ?? [],
    visitIntent: payload.visitIntent ?? [],
    photoTags: payload.photoTags ?? [],
    ambiance: payload.ambiance ?? null,
    photoUrl: payload.photoUrl ?? null,
    photoPath: payload.photoPath ?? null,
    photoPending: Boolean(payload.photoPending),
    campusOrCity: payload.campusOrCity ?? null,
    city: payload.city ?? null,
    campus: payload.campus ?? null,
    createdAtMs: payload.createdAtMs,
    approved: true,
  };
}

const PROMOTION_TYPES = ['discount', 'freebie', 'special', 'boost'] as const;
const PARTNER_TIER_CONFIG = {
  basic: {
    monthlyFee: 50,
    benefits: {
      verifiedBadge: true,
      featuredInDiscovery: false,
      loyaltyProgram: false,
      eventHosting: false,
      sponsoredEquipment: false,
      coMarketing: false,
    },
  },
  premium: {
    monthlyFee: 100,
    benefits: {
      verifiedBadge: true,
      featuredInDiscovery: true,
      loyaltyProgram: true,
      eventHosting: true,
      sponsoredEquipment: false,
      coMarketing: true,
    },
  },
  elite: {
    monthlyFee: 200,
    benefits: {
      verifiedBadge: true,
      featuredInDiscovery: true,
      loyaltyProgram: true,
      eventHosting: true,
      sponsoredEquipment: true,
      coMarketing: true,
    },
  },
} as const;

function sanitizeEmailLike(value: unknown): string {
  const normalized = asId(value).toLowerCase();
  if (!normalized || normalized.length > 254 || !normalized.includes('@')) return '';
  return normalized;
}

function sanitizePositiveInteger(value: unknown, min = 1, max = 100000): number | null {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.floor(numeric);
  if (rounded < min || rounded > max) return null;
  return rounded;
}

function sanitizePromotionType(value: unknown): typeof PROMOTION_TYPES[number] | null {
  const normalized = asId(value) as typeof PROMOTION_TYPES[number];
  return PROMOTION_TYPES.includes(normalized) ? normalized : null;
}

function sanitizePartnerTier(value: unknown): keyof typeof PARTNER_TIER_CONFIG | null {
  const normalized = asId(value) as keyof typeof PARTNER_TIER_CONFIG;
  return Object.prototype.hasOwnProperty.call(PARTNER_TIER_CONFIG, normalized) ? normalized : null;
}

function sanitizeDayOfWeekList(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<number>();
  const days: number[] = [];
  value.forEach((raw) => {
    const next = sanitizePositiveInteger(raw, 0, 6);
    if (next === null || seen.has(next)) return;
    seen.add(next);
    days.push(next);
  });
  return days.length ? days : undefined;
}

function sanitizeTimeOfDay(value: unknown): string | null {
  const normalized = asId(value);
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(normalized) ? normalized : null;
}

function sanitizePromotionTimeRange(value: unknown): { start: string; end: string } | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const start = sanitizeTimeOfDay((value as Record<string, unknown>).start);
  const end = sanitizeTimeOfDay((value as Record<string, unknown>).end);
  if (!start || !end) return undefined;
  return { start, end };
}

function sanitizeBusinessMetadata(value: unknown): { address?: string; phone?: string; website?: string; hours?: string } | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const address = sanitizeOptionalText(raw.address, 240);
  const phone = normalizePhone(typeof raw.phone === 'string' ? raw.phone : '');
  const website = sanitizeOptionalText(raw.website, 2048);
  const hours = sanitizeOptionalText(raw.hours, 240);
  const next: Record<string, string> = {};
  if (address) next.address = address;
  if (phone) next.phone = phone;
  if (website) next.website = website;
  if (hours) next.hours = hours;
  return Object.keys(next).length ? next : undefined;
}

function sanitizeLoyaltyConfig(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if (raw.enabled !== true) return undefined;
  const checkinsRequired = sanitizePositiveInteger(raw.checkinsRequired, 1, 50);
  const rewardType = asId(raw.rewardType);
  const rewardValue = sanitizeOptionalText(raw.rewardValue, 120);
  const rewardDescription = sanitizeOptionalText(raw.rewardDescription, 240);
  if (!checkinsRequired || !['free_item', 'discount', 'custom'].includes(rewardType) || !rewardValue || !rewardDescription) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid loyalty configuration');
  }
  return {
    enabled: true,
    checkinsRequired,
    rewardType: rewardType as 'free_item' | 'discount' | 'custom',
    rewardValue,
    rewardDescription,
  };
}

async function getSpotDocById(spotId: string) {
  return db.collection('spots').doc(spotId).get();
}

async function requireOwnedBusinessSpot(actorId: string, spotId: string) {
  let snapshot = await db
    .collection('businessSpots')
    .where('spotId', '==', spotId)
    .where('ownerId', '==', actorId)
    .limit(1)
    .get();

  if (!snapshot.empty) {
    return snapshot.docs[0];
  }

  const spotDoc = await getSpotDocById(spotId);
  const placeId = asId(spotDoc.data()?.placeId);
  if (placeId) {
    snapshot = await db
      .collection('businessSpots')
      .where('placeId', '==', placeId)
      .where('ownerId', '==', actorId)
      .limit(1)
      .get();
  }

  if (snapshot.empty) {
    throw new functions.https.HttpsError('permission-denied', 'You do not own this spot');
  }

  return snapshot.docs[0];
}

function buildCollaborativeRecommendationReason(matchCount: number): string {
  const count = Math.max(0, Math.floor(matchCount));
  const label = count === 1 ? 'user' : 'users';
  return `${count} ${label} with similar taste checked in here`;
}

async function getCollaborativeRecommendationsForUser(
  userId: string,
  currentSpotId?: string,
  limit = 5,
) {
  const userCheckinsSnapshot = await db
    .collection('checkins')
    .where('userId', '==', userId)
    .limit(50)
    .get();

  const userSpotIds = new Set<string>();
  userCheckinsSnapshot.forEach((doc) => {
    const placeId = asId(doc.data()?.spotPlaceId);
    if (placeId) userSpotIds.add(placeId);
  });

  const baseSpotId = asId(currentSpotId) || Array.from(userSpotIds)[0] || '';
  if (!baseSpotId) {
    return [];
  }

  const similarUsersSnapshot = await db
    .collection('checkins')
    .where('spotPlaceId', '==', baseSpotId)
    .where('visibility', '==', 'public')
    .limit(100)
    .get();

  const similarUserIds = new Set<string>();
  similarUsersSnapshot.forEach((doc) => {
    const uid = asId(doc.data()?.userId);
    if (uid && uid !== userId) similarUserIds.add(uid);
  });

  if (!similarUserIds.size) {
    return [];
  }

  const spotScores = new Map<string, number>();
  const similarUserList = Array.from(similarUserIds).slice(0, 30);
  const userBatches = chunkArray(similarUserList, 10);

  const userSnapshots = await Promise.all(
    userBatches.map(async (batch) => {
      if (!batch.length) return null;
      try {
        return await db
          .collection('checkins')
          .where('visibility', '==', 'public')
          .where('userId', 'in', batch)
          .orderBy('createdAt', 'desc')
          .limit(batch.length * 30)
          .get();
      } catch {
        return db
          .collection('checkins')
          .where('visibility', '==', 'public')
          .where('userId', 'in', batch)
          .limit(batch.length * 30)
          .get();
      }
    }),
  );

  userSnapshots.forEach((checkinsSnapshot) => {
    checkinsSnapshot?.forEach((doc) => {
      const placeId = asId(doc.data()?.spotPlaceId);
      if (!placeId || userSpotIds.has(placeId) || placeId === baseSpotId) return;
      spotScores.set(placeId, (spotScores.get(placeId) || 0) + 1);
    });
  });

  const sortedSpots = Array.from(spotScores.entries())
    .sort((left, right) => right[1] - left[1])
    .slice(0, sanitizeRecommendationLimit(limit));

  if (!sortedSpots.length) {
    return [];
  }

  const spotNames = new Map<string, string>();
  await Promise.all(
    sortedSpots.map(async ([placeId]) => {
      try {
        const doc = await db.collection('spots').doc(placeId).get();
        if (!doc.exists) return;
        const data = doc.data() || {};
        const name = asId(data.name || data.displayName || data.spotName);
        if (name) {
          spotNames.set(placeId, name);
        }
      } catch {
        // Ignore individual hydration failures so the rest of the batch still returns.
      }
    }),
  );

  const denominator = Math.max(similarUserIds.size, 1);
  return sortedSpots.map(([placeId, score]) => ({
    placeId,
    name: spotNames.get(placeId) || 'Unknown',
    score: Math.min((score / denominator) * 100, 100),
    reasons: [
      buildCollaborativeRecommendationReason(score),
      'Popular among people who like similar spots',
    ],
  }));
}

// CORS allowed origins whitelist
const ALLOWED_ORIGINS = [
  'https://perched.app',
  'https://www.perched.app',
  'https://business.perched.app',
  'https://partner-dashboard.perched.app',
  'http://localhost:8081', // Expo development
  'http://localhost:19006', // Expo web
];

/**
 * Validate and set CORS headers with origin whitelist
 */
function setCorsHeaders(req: any, res: any) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
  }
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-API-Key, X-Trace-Id, Authorization, X-Firebase-AppCheck');
}

function normalizePushToken(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function getPushTokenForUser(userId: string): Promise<string | null> {
  if (!userId) return null;
  try {
    const pushTokenDoc = await db.collection(PUSH_TOKENS_COLLECTION).doc(userId).get();
    const scopedToken = normalizePushToken(pushTokenDoc.data()?.token);
    if (scopedToken) return scopedToken;
  } catch {}
  return null;
}

async function getPushTokensForUsers(userIds: string[]): Promise<string[]> {
  const ids = normalizeIdList(userIds).slice(0, 100);
  if (!ids.length) return [];
  const tokens: string[] = [];

  const scopedDocs = await Promise.all(ids.map((userId) => db.collection(PUSH_TOKENS_COLLECTION).doc(userId).get()));

  scopedDocs.forEach((doc, index) => {
    const token = normalizePushToken(doc.data()?.token);
    if (token) {
      tokens.push(token);
    }
  });

  return Array.from(new Set(tokens));
}

/**
 * Joi validation schemas for B2B API endpoints
 */
const spotDataSchema = Joi.object({
  spotId: Joi.string().required().min(1).max(100),
});

const nearbySchema = Joi.object({
  lat: Joi.number().required().min(-90).max(90),
  lng: Joi.number().required().min(-180).max(180),
  radius: Joi.number().optional().min(100).max(50000).default(5000),
});

/**
 * Validate request data against Joi schema
 * Returns validated data or throws error with details
 */
function validateRequest<T>(schema: Joi.Schema, data: any): T {
  const { error, value } = schema.validate(data, { abortEarly: false });
  if (error) {
    const details = error.details.map(d => d.message).join(', ');
    throw new Error(`Validation failed: ${details}`);
  }
  return value as T;
}

/**
 * Fetch secret from Google Cloud Secret Manager
 * Falls back to environment variables for local development
 */
async function getSecret(secretName: string): Promise<string> {
  // Check environment variable first (for local development)
  const envValue = process.env[secretName];
  if (envValue) {
    return envValue;
  }

  // Fetch from Secret Manager
  try {
    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
    if (!projectId) {
      console.warn(`No GCP project ID found for secret: ${secretName}`);
      return '';
    }

    const secretPath = `projects/${projectId}/secrets/${secretName}/versions/latest`;
    const [version] = await secretClient.accessSecretVersion({ name: secretPath });
    const payload = version.payload?.data;

    if (!payload) {
      console.warn(`Empty payload for secret: ${secretName}`);
      return '';
    }

    return payload.toString('utf8');
  } catch (error) {
    console.error(`Error fetching secret ${secretName}:`, error);
    return '';
  }
}

// Cache secrets to avoid repeated Secret Manager calls
const secretCache = new Map<string, { value: string; ts: number }>();
const SECRET_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get secret with caching (5-minute TTL)
 */
async function getCachedSecret(secretName: string): Promise<string> {
  const cached = secretCache.get(secretName);
  if (cached && Date.now() - cached.ts < SECRET_CACHE_TTL_MS) {
    return cached.value;
  }

  const value = await getSecret(secretName);
  secretCache.set(secretName, { value, ts: Date.now() });
  return value;
}

function normalizeReferralCode(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function referralCodeFromHandle(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// =============================================================================
// REFERRAL FUNCTIONS
// =============================================================================

/**
 * Process referral when a new user signs up with a referral code
 * Triggered when a new document is created in the 'referrals' collection
 */
export const processReferral = functions.firestore
  .document('referrals/{referralId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const rawReferralCode = data.referralCode;
    const referralCode = normalizeReferralCode(rawReferralCode);
    const { status } = data;

    if (status !== 'pending') {
      return null;
    }
    if (!referralCode) {
      await snap.ref.update({ status: 'invalid_code' });
      return null;
    }

    try {
      // Find the referrer by their referral code
      let referrerId: string | null = null;
      const normalizedHandle = referralCode.toLowerCase();

      // Preferred match: precomputed canonical referralCode on user profile.
      const byReferralCodeSnapshot = await db.collection(PUBLIC_PROFILES_COLLECTION)
        .where('referralCode', '==', referralCode)
        .limit(1)
        .get();
      if (!byReferralCodeSnapshot.empty) {
        referrerId = byReferralCodeSnapshot.docs[0].id;
      }

      // Legacy match: exact handle.
      if (!referrerId) {
        const usersSnapshot = await db.collection(PUBLIC_PROFILES_COLLECTION)
          .where('handle', '==', normalizedHandle)
          .limit(1)
          .get();
        if (!usersSnapshot.empty) {
          referrerId = usersSnapshot.docs[0].id;
        }
      }

      // Legacy fallback: handle prefix scan + canonicalized comparison.
      if (!referrerId && normalizedHandle.length >= 3) {
        const prefix = normalizedHandle.slice(0, Math.min(4, normalizedHandle.length));
        const prefixEnd = `${prefix}\uf8ff`;
        const handleCandidates = await db.collection(PUBLIC_PROFILES_COLLECTION)
          .where('handle', '>=', prefix)
          .where('handle', '<=', prefixEnd)
          .limit(80)
          .get();
        const match = handleCandidates.docs.find((doc) => {
          const handle = doc.data()?.handle;
          return referralCodeFromHandle(handle) === referralCode;
        });
        if (match) {
          referrerId = match.id;
        }
      }

      // Last fallback: partial user ID match for historical referral links.
      if (!referrerId) {
        const usersByIdSnapshot = await db.collection(PUBLIC_PROFILES_COLLECTION)
          .orderBy(admin.firestore.FieldPath.documentId())
          .startAt(referralCode)
          .endAt(referralCode + '\uf8ff')
          .limit(1)
          .get();
        if (!usersByIdSnapshot.empty) {
          referrerId = usersByIdSnapshot.docs[0].id;
        }
      }

      if (!referrerId) {
        console.log(`No referrer found for code: ${referralCode}`);
        await snap.ref.update({ status: 'invalid_code' });
        return null;
      }

      const newUserId = asId(data.newUserId);
      if (newUserId && referrerId === newUserId) {
        console.log(`Self-referral rejected: ${newUserId} tried to use their own code`);
        await snap.ref.update({ status: 'self_referral' });
        return null;
      }

      // Credit the referrer with 1 week of premium
      const PREMIUM_WEEKS_PER_REFERRAL = 1;
      const premiumDays = PREMIUM_WEEKS_PER_REFERRAL * 7;
      const referralRef = snap.ref;
      const referrerPrivateRef = db.collection(USER_PRIVATE_COLLECTION).doc(referrerId);
      const referrerLegacyRef = db.collection(USERS_COLLECTION).doc(referrerId);
      let alreadyProcessed = false;

      await db.runTransaction(async (transaction) => {
        const referralDoc = await transaction.get(referralRef);
        const referralData = referralDoc.data();
        if (!referralDoc.exists || referralData?.status !== 'pending') {
          alreadyProcessed = true;
          return;
        }

        const privateDoc = await transaction.get(referrerPrivateRef);
        const legacyDoc = privateDoc.exists ? null : await transaction.get(referrerLegacyRef);
        const referrerData = {
          ...(legacyDoc?.exists ? legacyDoc.data() || {} : {}),
          ...(privateDoc.exists ? privateDoc.data() || {} : {}),
        };

        const currentPremiumUntil = referrerData.premiumUntil?.toDate?.() || new Date();
        const now = new Date();
        const baseDate = currentPremiumUntil > now ? currentPremiumUntil : now;
        const newPremiumUntil = new Date(baseDate.getTime() + premiumDays * 24 * 60 * 60 * 1000);

        transaction.set(referrerPrivateRef, {
          premiumUntil: admin.firestore.Timestamp.fromDate(newPremiumUntil),
          totalReferrals: admin.firestore.FieldValue.increment(1),
          premiumWeeksEarned: admin.firestore.FieldValue.increment(PREMIUM_WEEKS_PER_REFERRAL),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        transaction.update(referralRef, {
          status: 'credited',
          referrerId,
          premiumWeeksAwarded: PREMIUM_WEEKS_PER_REFERRAL,
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      });

      if (alreadyProcessed) {
        console.log(`Referral ${context.params.referralId} already processed, skipping`);
        return null;
      }

      // Send notification to referrer
      const referrerPushToken = await getPushTokenForUser(referrerId);
      if (referrerPushToken) {
        await sendPushNotification(
          referrerPushToken,
          'Someone joined Perched!',
          `You earned ${PREMIUM_WEEKS_PER_REFERRAL} week of Premium! Keep sharing to earn more.`,
          { type: 'referral_credit' }
        );
      }

      console.log(`Credited ${referrerId} with ${PREMIUM_WEEKS_PER_REFERRAL} week(s) of premium for referral ${referralCode}`);
      return { success: true, referrerId, premiumWeeksAwarded: PREMIUM_WEEKS_PER_REFERRAL };
    } catch (error) {
      console.error('Error processing referral:', error);
      await snap.ref.update({ status: 'error', error: String(error) });
      return null;
    }
  });

// =============================================================================
// FRIEND REQUEST NOTIFICATIONS
// =============================================================================

/**
 * Server-authoritative check-in creation with coarse abuse throttling.
 * This replaces direct client writes so rate limiting and idempotency live on the backend.
 */
export const createCheckinSecure = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const actorId = context.auth.uid;
  const allowed = await hasPostingAccessForActor(actorId, context.auth.token as Record<string, any> | undefined);
  if (!allowed) {
    throw new functions.https.HttpsError('permission-denied', 'Account is not allowed to post check-ins');
  }

  const nowMs = Date.now();
  const payload = buildCallableCheckinPayload(actorId, data, nowMs);
  if (!payload.spotName) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing spotName');
  }

  if (payload.clientId) {
    const existingSnapshot = await db
      .collection('checkins')
      .where('userId', '==', actorId)
      .where('clientId', '==', payload.clientId)
      .limit(1)
      .get();

    if (!existingSnapshot.empty) {
      const existingDoc = existingSnapshot.docs[0];
      return { checkin: serializeCreatedCheckin(existingDoc.id, existingDoc.data() || payload) };
    }
  }

  const guardRef = db.collection('checkinWriteGuards').doc(actorId);
  const checkinRef = db.collection('checkins').doc();

  try {
    await db.runTransaction(async (tx) => {
      const guardDoc = await tx.get(guardRef);
      const guardData = guardDoc.data() || {};
      const lastCreatedAtMs = typeof guardData.lastCreatedAtMs === 'number' ? guardData.lastCreatedAtMs : 0;
      const previousWindowStartMs = typeof guardData.windowStartMs === 'number' ? guardData.windowStartMs : 0;
      const previousWindowCount = typeof guardData.windowCount === 'number' ? guardData.windowCount : 0;

      if (lastCreatedAtMs > 0 && nowMs - lastCreatedAtMs < CHECKIN_MIN_INTERVAL_MS) {
        throw new functions.https.HttpsError('resource-exhausted', 'Posting too quickly. Wait a moment and retry.');
      }

      const windowStillOpen = previousWindowStartMs > 0 && nowMs - previousWindowStartMs < CHECKIN_WINDOW_MS;
      const nextWindowStartMs = windowStillOpen ? previousWindowStartMs : nowMs;
      const nextWindowCount = windowStillOpen ? previousWindowCount + 1 : 1;

      if (nextWindowCount > CHECKIN_MAX_PER_HOUR) {
        throw new functions.https.HttpsError('resource-exhausted', 'Hourly check-in limit reached. Try again later.');
      }

      tx.set(checkinRef, payload);
      tx.set(guardRef, {
        userId: actorId,
        lastCreatedAtMs: nowMs,
        windowStartMs: nextWindowStartMs,
        windowCount: nextWindowCount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    });
  } catch (error) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to create check-in');
  }

  return { checkin: serializeCreatedCheckin(checkinRef.id, payload) };
});

export const claimBusinessSpotSecure = functions.https.onCall(async (data, context) => {
  const actorId = context.auth?.uid;
  if (!actorId) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const spotId = asId(data?.spotId);
  const ownerEmail = sanitizeEmailLike(data?.ownerEmail);
  if (!spotId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing spotId');
  }
  if (!ownerEmail) {
    throw new functions.https.HttpsError('invalid-argument', 'Valid ownerEmail is required');
  }

  const spotDoc = await getSpotDocById(spotId);
  if (!spotDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Spot not found');
  }

  const existingClaim = await db
    .collection('businessSpots')
    .where('spotId', '==', spotId)
    .limit(1)
    .get();
  const placeId = asId(spotDoc.data()?.placeId);
  const existingPlaceClaim = placeId
    ? await db
        .collection('businessSpots')
        .where('placeId', '==', placeId)
        .limit(1)
        .get()
    : null;
  if (!existingClaim.empty || (existingPlaceClaim && !existingPlaceClaim.empty)) {
    throw new functions.https.HttpsError('already-exists', 'Spot already claimed');
  }

  const spotData = spotDoc.data() || {};
  const metadata = sanitizeBusinessMetadata(data?.metadata);
  const payload: Record<string, any> = {
    name: sanitizeOptionalText(spotData.name, 160) || 'Unknown Spot',
    spotId,
    placeId: placeId || spotId,
    ownerId: actorId,
    ownerEmail,
    claimedAt: Date.now(),
    verified: false,
    subscriptionTier: null,
    locationCount: 1,
  };
  if (metadata) {
    payload.metadata = metadata;
  }

  const docRef = await db.collection('businessSpots').add(payload);
  return { ok: true, businessSpotId: docRef.id };
});

export const createPromotionSecure = functions.https.onCall(async (data, context) => {
  const actorId = context.auth?.uid;
  if (!actorId) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const spotId = asId(data?.spotId);
  if (!spotId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing spotId');
  }

  await requireOwnedBusinessSpot(actorId, spotId);
  const spotDoc = await getSpotDocById(spotId);
  if (!spotDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Spot not found');
  }

  const promotionInput = data?.promotion || {};
  const type = sanitizePromotionType(promotionInput?.type);
  const title = sanitizeOptionalText(promotionInput?.title, 120);
  const description = sanitizeOptionalText(promotionInput?.description, 500);
  const startDate = toFiniteNumber(promotionInput?.startDate);
  const endDate = toFiniteNumber(promotionInput?.endDate);
  if (!type || !title || !description || startDate === null || endDate === null || endDate <= startDate) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid promotion payload');
  }

  const now = Date.now();
  const docRef = await db.collection('promotions').add({
    spotId,
    spotName: sanitizeOptionalText(spotDoc.data()?.name, 160) || 'Unknown Spot',
    ownerId: actorId,
    type,
    title,
    description,
    discountPercent: toFiniteNumber(promotionInput?.discountPercent),
    termsAndConditions: sanitizeOptionalText(promotionInput?.termsAndConditions, 1200),
    startDate,
    endDate,
    daysOfWeek: sanitizeDayOfWeekList(promotionInput?.daysOfWeek),
    timeRange: sanitizePromotionTimeRange(promotionInput?.timeRange),
    maxRedemptions: sanitizePositiveInteger(promotionInput?.maxRedemptions, 1, 100000),
    currentRedemptions: 0,
    requiresCheckin: promotionInput?.requiresCheckin === true,
    featured: promotionInput?.featured === true,
    boostExpiry: toFiniteNumber(promotionInput?.boostExpiry),
    status: now >= startDate && now <= endDate ? 'active' : 'paused',
    createdAt: now,
    updatedAt: now,
  });

  return { ok: true, promotionId: docRef.id };
});

export const respondToCheckinSecure = functions.https.onCall(async (data, context) => {
  const actorId = context.auth?.uid;
  if (!actorId) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const spotId = asId(data?.spotId);
  const checkinId = asId(data?.checkinId);
  const responseText = sanitizeOptionalText(data?.responseText, 500);
  if (!spotId || !checkinId || !responseText) {
    throw new functions.https.HttpsError('invalid-argument', 'spotId, checkinId, and responseText are required');
  }

  const businessSpotDoc = await requireOwnedBusinessSpot(actorId, spotId);
  const businessSpot = businessSpotDoc.data() || {};
  const ownedSpotId = asId(businessSpot.spotId) || spotId;
  const ownedPlaceId = asId(businessSpot.placeId);
  const checkinDoc = await db.collection('checkins').doc(checkinId).get();
  if (!checkinDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Check-in not found');
  }

  const checkin = checkinDoc.data() || {};
  const checkinSpotId = asId(checkin.spotId);
  const checkinPlaceId = asId(checkin.spotPlaceId);
  const matchesOwnedSpot = [ownedSpotId, ownedPlaceId]
    .filter(Boolean)
    .some((value) => value === checkinSpotId || value === checkinPlaceId);
  if (!matchesOwnedSpot) {
    throw new functions.https.HttpsError('permission-denied', 'Check-in does not belong to this business');
  }

  const existingResponse = await db
    .collection('checkinResponses')
    .where('checkinId', '==', checkinId)
    .limit(1)
    .get();
  if (!existingResponse.empty) {
    throw new functions.https.HttpsError('already-exists', 'Already responded to this check-in');
  }

  const docRef = await db.collection('checkinResponses').add({
    spotId: ownedSpotId,
    ownerId: actorId,
    checkinId,
    userId: asId(checkin.userId),
    userName: sanitizeOptionalText(checkin.userName, 120) || 'User',
    userCaption: sanitizeOptionalText(checkin.caption, 240) || '',
    responseText,
    respondedAt: Date.now(),
  });

  return { ok: true, responseId: docRef.id };
});

export const createPartnerSecure = functions.https.onCall(async (data, context) => {
  const actorId = context.auth?.uid;
  if (!actorId) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const spotId = asId(data?.spotId);
  const tier = sanitizePartnerTier(data?.tier);
  if (!spotId || !tier) {
    throw new functions.https.HttpsError('invalid-argument', 'spotId and tier are required');
  }

  await requireOwnedBusinessSpot(actorId, spotId);
  const spotDoc = await getSpotDocById(spotId);
  if (!spotDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Spot not found');
  }

  const loyaltyConfig = sanitizeLoyaltyConfig(data?.loyaltyConfig);
  const tierConfig = PARTNER_TIER_CONFIG[tier];
  const now = Date.now();
  const docRef = await db.collection('partners').add({
    spotId,
    spotName: sanitizeOptionalText(spotDoc.data()?.name, 160) || 'Unknown',
    ownerId: actorId,
    tier,
    status: 'pending',
    benefits: tierConfig.benefits,
    loyaltyConfig: loyaltyConfig || undefined,
    monthlyFee: tierConfig.monthlyFee,
    revenueShare: loyaltyConfig ? 20 : undefined,
    stats: {
      totalCheckins: 0,
      loyaltyRedemptions: 0,
      eventsHosted: 0,
      revenue: 0,
    },
    joinedAt: now,
    renewsAt: now + 30 * 24 * 60 * 60 * 1000,
  });

  return { ok: true, partnerId: docRef.id };
});

type SocialGraphAction =
  | 'send_friend_request'
  | 'accept_friend_request'
  | 'decline_friend_request'
  | 'set_close_friend'
  | 'remove_close_friend'
  | 'unfriend'
  | 'block_user'
  | 'unblock_user';

/**
 * Server-authoritative social graph mutation endpoint.
 * Client should prefer this over direct cross-user Firestore writes.
 */
export const socialGraphMutation = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const actorId = context.auth.uid;
  const action = asId(data?.action) as SocialGraphAction;

  if (!action) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing action');
  }

  if (action === 'send_friend_request') {
    const targetUserId = asId(data?.toId);
    if (!targetUserId || targetUserId === actorId) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid target user');
    }

    const forwardRequestId = `${actorId}_${targetUserId}`;
    const reverseRequestId = `${targetUserId}_${actorId}`;
    const actorUserRef = db.collection(SOCIAL_GRAPH_COLLECTION).doc(actorId);
    const targetUserRef = db.collection(SOCIAL_GRAPH_COLLECTION).doc(targetUserId);
    const forwardRequestRef = db.collection('friendRequests').doc(forwardRequestId);
    const reverseRequestRef = db.collection('friendRequests').doc(reverseRequestId);

    let result:
      | { ok: true; status: 'pending'; requestId: string }
      | { ok: true; status: 'accepted'; requestId: string; autoAccepted: boolean; alreadyFriends?: boolean }
      = { ok: true, status: 'pending', requestId: forwardRequestId };

    await db.runTransaction(async (tx) => {
      const [actorUserDoc, reverseRequestDoc] = await Promise.all([
        tx.get(actorUserRef),
        tx.get(reverseRequestRef),
      ]);

      const actorFriends = normalizeIdList(actorUserDoc.data()?.friends);
      if (actorFriends.includes(targetUserId)) {
        result = {
          ok: true,
          status: 'accepted',
          requestId: forwardRequestId,
          autoAccepted: false,
          alreadyFriends: true,
        };
        return;
      }

      const reverseStatus = asId(reverseRequestDoc.data()?.status || 'pending') || 'pending';
      if (reverseRequestDoc.exists && reverseStatus === 'pending') {
        tx.set(actorUserRef, {
          friends: admin.firestore.FieldValue.arrayUnion(targetUserId),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        tx.set(targetUserRef, {
          friends: admin.firestore.FieldValue.arrayUnion(actorId),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        tx.delete(reverseRequestRef);
        tx.delete(forwardRequestRef);
        result = {
          ok: true,
          status: 'accepted',
          requestId: reverseRequestId,
          autoAccepted: true,
        };
        return;
      }

      tx.set(
        forwardRequestRef,
        {
          fromId: actorId,
          toId: targetUserId,
          status: 'pending',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      result = { ok: true, status: 'pending', requestId: forwardRequestId };
    });

    return result;
  }

  if (action === 'accept_friend_request') {
    const requestId = asId(data?.requestId);
    if (!requestId) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing requestId');
    }

    const requestRef = db.collection('friendRequests').doc(requestId);
    let result: { ok: true; status: 'accepted' | 'not_found'; requestId: string; fromId?: string; toId?: string } = {
      ok: true,
      status: 'not_found',
      requestId,
    };

    await db.runTransaction(async (tx) => {
      const requestDoc = await tx.get(requestRef);
      if (!requestDoc.exists) {
        result = { ok: true, status: 'not_found', requestId };
        return;
      }

      const fromId = asId(requestDoc.data()?.fromId);
      const toId = asId(requestDoc.data()?.toId);
      if (!fromId || !toId) {
        throw new functions.https.HttpsError('failed-precondition', 'Malformed friend request');
      }
      if (toId !== actorId) {
        throw new functions.https.HttpsError('permission-denied', 'Only recipient can accept this request');
      }

      tx.set(db.collection(SOCIAL_GRAPH_COLLECTION).doc(toId), {
        friends: admin.firestore.FieldValue.arrayUnion(fromId),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      tx.set(db.collection(SOCIAL_GRAPH_COLLECTION).doc(fromId), {
        friends: admin.firestore.FieldValue.arrayUnion(toId),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      tx.delete(requestRef);
      tx.delete(db.collection('friendRequests').doc(`${toId}_${fromId}`));

      result = { ok: true, status: 'accepted', requestId, fromId, toId };
    });

    return result;
  }

  if (action === 'decline_friend_request') {
    const requestId = asId(data?.requestId);
    if (!requestId) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing requestId');
    }

    const requestRef = db.collection('friendRequests').doc(requestId);
    await db.runTransaction(async (tx) => {
      const requestDoc = await tx.get(requestRef);
      if (!requestDoc.exists) return;
      const fromId = asId(requestDoc.data()?.fromId);
      const toId = asId(requestDoc.data()?.toId);
      if (actorId !== fromId && actorId !== toId) {
        throw new functions.https.HttpsError('permission-denied', 'Not allowed to decline this request');
      }
      tx.delete(requestRef);
    });
    return { ok: true, status: 'declined', requestId };
  }

  if (action === 'set_close_friend' || action === 'remove_close_friend') {
    const targetUserId = asId(data?.targetUserId);
    if (!targetUserId || targetUserId === actorId) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid target user');
    }

    const actorGraphRef = db.collection(SOCIAL_GRAPH_COLLECTION).doc(actorId);
    await db.runTransaction(async (tx) => {
      if (action === 'set_close_friend') {
        tx.set(actorGraphRef, {
          friends: admin.firestore.FieldValue.arrayUnion(targetUserId),
          closeFriends: admin.firestore.FieldValue.arrayUnion(targetUserId),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return;
      }
      tx.set(actorGraphRef, {
        closeFriends: admin.firestore.FieldValue.arrayRemove(targetUserId),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    });

    return {
      ok: true,
      status: action === 'set_close_friend' ? 'close_friend_set' : 'close_friend_removed',
      targetUserId,
    };
  }

  if (action === 'unfriend') {
    const targetUserId = asId(data?.targetUserId);
    if (!targetUserId || targetUserId === actorId) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid target user');
    }

    await db.runTransaction(async (tx) => {
      tx.set(
        db.collection(SOCIAL_GRAPH_COLLECTION).doc(actorId),
        {
          friends: admin.firestore.FieldValue.arrayRemove(targetUserId),
          closeFriends: admin.firestore.FieldValue.arrayRemove(targetUserId),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      tx.set(
        db.collection(SOCIAL_GRAPH_COLLECTION).doc(targetUserId),
        {
          friends: admin.firestore.FieldValue.arrayRemove(actorId),
          closeFriends: admin.firestore.FieldValue.arrayRemove(actorId),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      tx.delete(db.collection('friendRequests').doc(`${actorId}_${targetUserId}`));
      tx.delete(db.collection('friendRequests').doc(`${targetUserId}_${actorId}`));
    });
    return { ok: true, status: 'unfriended', targetUserId };
  }

  if (action === 'block_user') {
    const targetUserId = asId(data?.targetUserId);
    if (!targetUserId || targetUserId === actorId) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid target user');
    }

    await db.runTransaction(async (tx) => {
      tx.set(
        db.collection(SOCIAL_GRAPH_COLLECTION).doc(actorId),
        {
          blocked: admin.firestore.FieldValue.arrayUnion(targetUserId),
          friends: admin.firestore.FieldValue.arrayRemove(targetUserId),
          closeFriends: admin.firestore.FieldValue.arrayRemove(targetUserId),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      tx.set(
        db.collection(SOCIAL_GRAPH_COLLECTION).doc(targetUserId),
        {
          friends: admin.firestore.FieldValue.arrayRemove(actorId),
          closeFriends: admin.firestore.FieldValue.arrayRemove(actorId),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      tx.delete(db.collection('friendRequests').doc(`${actorId}_${targetUserId}`));
      tx.delete(db.collection('friendRequests').doc(`${targetUserId}_${actorId}`));
    });
    return { ok: true, status: 'blocked', targetUserId };
  }

  if (action === 'unblock_user') {
    const targetUserId = asId(data?.targetUserId);
    if (!targetUserId || targetUserId === actorId) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid target user');
    }

    await db.collection(SOCIAL_GRAPH_COLLECTION).doc(actorId).set(
      {
        blocked: admin.firestore.FieldValue.arrayRemove(targetUserId),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { ok: true, status: 'unblocked', targetUserId };
  }

  throw new functions.https.HttpsError('invalid-argument', `Unsupported action: ${action}`);
});

export const secureUserLookup = functions.https.onCall(async (data, context) => {
  const actorId = context.auth?.uid;
  if (!actorId) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const type = asId(data?.type);
  const rawQuery = asId(data?.query);
  if (!type || !rawQuery) {
    throw new functions.https.HttpsError('invalid-argument', 'type and query are required');
  }

  const privateUsers = db.collection('userPrivate');
  let snapshot: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>;

  if (type === 'email') {
    const normalizedEmail = rawQuery.toLowerCase();
    snapshot = await privateUsers.where('email', '==', normalizedEmail).limit(1).get();
  } else if (type === 'phone') {
    const normalized = normalizePhone(rawQuery);
    if (!normalized) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid phone');
    }
    snapshot = await privateUsers.where('phoneNormalized', '==', normalized).limit(1).get();
  } else {
    throw new functions.https.HttpsError('invalid-argument', 'Unsupported lookup type');
  }

  if (snapshot.empty) {
    return { user: null };
  }

  const privateDoc = snapshot.docs[0];
  const userId = privateDoc.id;
  const publicDoc = await db.collection(PUBLIC_PROFILES_COLLECTION).doc(userId).get();
  if (!publicDoc.exists) {
    return { user: null };
  }

  return { user: sanitizePublicUserProfile(publicDoc.id, publicDoc.data() || {}) };
});

export const getProfileAccessSnapshot = functions.https.onCall(async (data, context) => {
  const actorId = context.auth?.uid;
  if (!actorId) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const targetUserId = asId(data?.targetUserId);
  if (!targetUserId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing target user');
  }

  if (targetUserId === actorId) {
    return {
      isFriend: true,
      canSeeFriends: true,
      canSeeClose: true,
      viewerBlocked: false,
      blockedByTarget: false,
    };
  }

  const [viewerGraphDoc, targetGraphDoc] = await Promise.all([
    getSocialGraphDoc(actorId),
    getSocialGraphDoc(targetUserId),
  ]);

  const viewerGraph = normalizeSocialGraph(viewerGraphDoc.data() || {});
  const targetGraph = normalizeSocialGraph(targetGraphDoc.data() || {});
  const viewerBlocked = viewerGraph.blocked.includes(targetUserId);
  const blockedByTarget = targetGraph.blocked.includes(actorId);
  const isFriend = viewerGraph.friends.includes(targetUserId);
  const canSeeClose = targetGraph.closeFriends.includes(actorId);

  return {
    isFriend,
    canSeeFriends: isFriend && !viewerBlocked && !blockedByTarget,
    canSeeClose: isFriend && canSeeClose && !viewerBlocked && !blockedByTarget,
    viewerBlocked,
    blockedByTarget,
  };
});

export const issueAppCheckToken = functions.https.onCall(async (data, context) => {
  const allowedAppIds = getAllowedAppCheckAppIds();
  if (!allowedAppIds.length) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'APP_CHECK_ALLOWED_APP_IDS must be configured before issuing App Check tokens',
    );
  }
  const requestedAppId = asId(data?.appId || allowedAppIds[0]);
  if (!requestedAppId) {
    throw new functions.https.HttpsError('failed-precondition', 'Missing appId');
  }
  if (allowedAppIds.length > 0 && !allowedAppIds.includes(requestedAppId)) {
    throw new functions.https.HttpsError('permission-denied', 'App id is not allowed');
  }

  try {
    const created = await admin.appCheck().createToken(requestedAppId, {
      ttlMillis: APP_CHECK_TOKEN_TTL_MS,
    });
    return {
      token: created.token,
      expireTimeMillis: Date.now() + created.ttlMillis,
      ttlMillis: created.ttlMillis,
      appId: requestedAppId,
    };
  } catch (error: any) {
    throw new functions.https.HttpsError('internal', error?.message || 'Failed to issue App Check token');
  }
});

export const syncMyGamification = functions.https.onCall(async (_data, context) => {
  const userId = context.auth?.uid;
  if (!userId) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  await syncGamificationForUser(userId);
  return { ok: true };
});

export const getCollaborativeRecommendations = functions.https.onCall(async (data, context) => {
  const userId = context.auth?.uid;
  if (!userId) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const limit = sanitizeRecommendationLimit(data?.limit);
  const currentSpotId = asId(data?.currentSpotId);
  const startedAt = Date.now();

  try {
    const recommendations = await getCollaborativeRecommendationsForUser(userId, currentSpotId, limit);
    await recordBackendPerf('collaborative_recommendations', Date.now() - startedAt, true, {
      userId,
      baseSpotId: currentSpotId || null,
      count: recommendations.length,
      limit,
    });
    return { recommendations };
  } catch (error: any) {
    await recordBackendPerf('collaborative_recommendations', Date.now() - startedAt, false, {
      userId,
      baseSpotId: currentSpotId || null,
      limit,
      error: error?.message || String(error),
    });
    throw new functions.https.HttpsError('internal', 'Unable to load collaborative recommendations');
  }
});

export const sendSigninAlert = functions
  .runWith({ secrets: ['SENDGRID_API_KEY'] })
  .https.onCall(async (data, context) => {
    const userId = context.auth?.uid;
    if (!userId) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const fallbackEmail = readFirstNonEmpty(
      typeof context.auth?.token?.email === 'string' ? context.auth.token.email : '',
      typeof data?.email === 'string' ? data.email : '',
    );
    const ip = asId(data?.ip).slice(0, 64) || null;
    const meta = sanitizeSigninNotificationMeta(data?.meta);
    const email = await resolveSigninAlertEmail(userId, fallbackEmail);

    if (!email) {
      await db.collection(LOGIN_NOTIFICATION_COLLECTION).add({
        userId,
        email: null,
        ip,
        meta,
        provider: 'log_only',
        status: 'skipped_missing_email',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAtMs: Date.now(),
      });
      return { ok: true, sent: false, skipped: true, reason: 'missing_email' };
    }

    const stateRef = db.collection(LOGIN_NOTIFICATION_STATE_COLLECTION).doc(userId);
    const stateDoc = await stateRef.get();
    const lastSentAtMs = typeof stateDoc.data()?.lastSentAtMs === 'number' ? stateDoc.data()?.lastSentAtMs : 0;
    const now = Date.now();
    if (shouldThrottleSigninAlert(lastSentAtMs, now, SIGNIN_ALERT_THROTTLE_MS)) {
      return { ok: true, sent: false, skipped: true, reason: 'throttled' };
    }

    const delivery = await sendSigninAlertEmail(email, ip);
    await db.collection(LOGIN_NOTIFICATION_COLLECTION).add({
      userId,
      email,
      ip,
      meta,
      provider: delivery.provider,
      status: delivery.sent ? 'sent' : 'logged',
      error: delivery.error || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAtMs: now,
      sentAtMs: delivery.sent ? now : null,
    });
    await stateRef.set({
      userId,
      lastSentAtMs: now,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return { ok: true, sent: delivery.sent, skipped: false, provider: delivery.provider };
  });

/**
 * Send notification when a friend request is created
 */
export const onFriendRequestCreated = functions.firestore
  .document('friendRequests/{requestId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const { fromId, toId, status } = data;

    if (status !== 'pending') {
      return null;
    }

    try {
      // Get the sender's info
      const senderDoc = await getPublicProfileDoc(fromId);
      const senderData = senderDoc.data() || {};
      const senderName = senderData.name || senderData.handle || 'Someone';

      // Get the recipient's push token
      const recipientToken = await getPushTokenForUser(toId);

      if (!recipientToken) {
        console.log(`No push token for user ${toId}`);
        return null;
      }

      // Send push notification
      await sendPushNotification(
        recipientToken,
        'New Friend Request',
        `${senderName} wants to be your friend!`,
        { type: 'friend_request', fromUserId: fromId, requestId: context.params.requestId }
      );

      console.log(`Sent friend request notification to ${toId} from ${fromId}`);
      return { success: true };
    } catch (error) {
      console.error('Error sending friend request notification:', error);
      return null;
    }
  });

/**
 * Send notification when a friend request is accepted
 */
export const onFriendRequestAccepted = functions.firestore
  .document('friendRequests/{requestId}')
  .onDelete(async (snap, context) => {
    const data = snap.data();
    const { fromId, toId, status } = data;

    // Only notify if the request was pending (meaning it was accepted, not declined)
    // When declined, status would be 'declined' before deletion
    if (status !== 'pending') {
      return null;
    }

    try {
      // Get both user docs to verify this delete represents an actual acceptance.
      const [accepterDoc, accepterGraphDoc, senderGraphDoc] = await Promise.all([
        getPublicProfileDoc(toId),
        getSocialGraphDoc(toId),
        getSocialGraphDoc(fromId),
      ]);
      const accepterData = accepterDoc.data() || {};
      const accepterGraph = normalizeSocialGraph(accepterGraphDoc.data() || {});
      const senderGraph = normalizeSocialGraph(senderGraphDoc.data() || {});

      // Guard: only notify if friendship is now mutual.
      const isMutual = accepterGraph.friends.includes(fromId) && senderGraph.friends.includes(toId);
      if (!isMutual) {
        console.log(`Skipping friend accepted notification for ${fromId}<->${toId}; no mutual friendship found`);
        return null;
      }

      const accepterName = accepterData.name || accepterData.handle || 'Someone';
      const senderToken = await getPushTokenForUser(fromId);

      if (!senderToken) {
        console.log(`No push token for user ${fromId}`);
        return null;
      }

      // Send push notification
      await sendPushNotification(
        senderToken,
        'Friend Request Accepted!',
        `${accepterName} is now your friend!`,
        { type: 'friend_accepted', userId: toId }
      );

      console.log(`Sent friend accepted notification to ${fromId}`);
      return { success: true };
    } catch (error) {
      console.error('Error sending friend accepted notification:', error);
      return null;
    }
  });

// =============================================================================
// CHECK-IN NOTIFICATIONS
// =============================================================================

/**
 * Notify friends when a user creates a check-in
 */
export const onCheckinCreated = functions.firestore
  .document('checkins/{checkinId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const { userId, spotName, visibility } = data;

    // Only notify for public or friends visibility
    if (visibility === 'private') {
      return null;
    }

    try {
      // Get the poster's info
      const [posterDoc, posterGraphDoc] = await Promise.all([
        getPublicProfileDoc(userId),
        getSocialGraphDoc(userId),
      ]);
      const posterData = posterDoc.data() || {};
      const posterGraph = normalizeSocialGraph(posterGraphDoc.data() || {});
      const posterName = posterData.name || posterData.handle || 'Someone';
      const posterFriends = posterGraph.friends || [];

      if (posterFriends.length === 0) {
        return null;
      }

      // Get close friends if visibility is 'close'
      let targetFriends = posterFriends;
      if (visibility === 'close') {
        targetFriends = posterGraph.closeFriends || [];
      }

      const tokens = await getPushTokensForUsers(targetFriends.slice(0, 50));

      if (tokens.length === 0) {
        return null;
      }

      // Send multicast notification
      const message = {
        notification: {
          title: 'Friend Activity',
          body: `${posterName} just checked in at ${spotName}`,
        },
        data: {
          type: 'friend_checkin',
          checkinId: context.params.checkinId,
          userId,
        },
        tokens,
      };

      const response = await admin.messaging().sendEachForMulticast(message);
      console.log(`Sent ${response.successCount} check-in notifications for ${posterName}`);

      return { success: true, sent: response.successCount };
    } catch (error) {
      console.error('Error sending check-in notifications:', error);
      return null;
    }
  });

export const enterWeeklyRaffleOnCheckin = functions.firestore
  .document('checkins/{checkinId}')
  .onCreate(async (snap) => {
    const data = snap.data() || {};
    const userId = asId(data.userId);
    if (!userId) return null;

    const checkinTimeMs = readCheckinTimeMs(data) || Date.now();
    const { weekKey, weekStartMs, weekEndMs } = getWeekWindowFromMs(checkinTimeMs);
    const entryId = `${userId}_${weekKey}`;
    const entryRef = db.collection('weeklyRaffleEntries').doc(entryId);

    try {
      const existing = await entryRef.get();
      if (existing.exists) return null;

      const weeklySnapshot = await db.collection('checkins')
        .where('userId', '==', userId)
        .where('createdAt', '>=', admin.firestore.Timestamp.fromMillis(weekStartMs))
        .where('createdAt', '<=', admin.firestore.Timestamp.fromMillis(weekEndMs))
        .limit(EARLY_ADOPTER_WEEKLY_TARGET)
        .get();

      if (weeklySnapshot.size < EARLY_ADOPTER_WEEKLY_TARGET) {
        return null;
      }

      const serverTimestamp = admin.firestore.FieldValue.serverTimestamp();
      await entryRef.set({
        userId,
        weekKey,
        weekStartMs,
        weekEndMs,
        target: EARLY_ADOPTER_WEEKLY_TARGET,
        postCount: EARLY_ADOPTER_WEEKLY_TARGET,
        status: 'entered',
        qualifiedAt: serverTimestamp,
        createdAt: serverTimestamp,
        updatedAt: serverTimestamp,
      }, { merge: false });
      return null;
    } catch (error) {
      console.error('enterWeeklyRaffleOnCheckin error', error);
      return null;
    }
  });

export const syncGamificationOnCheckinWrite = functions.firestore
  .document('checkins/{checkinId}')
  .onWrite(async (change) => {
    const before = change.before.exists ? (change.before.data() || {}) : null;
    const after = change.after.exists ? (change.after.data() || {}) : null;

    if (before && after && sameCheckinGamificationFields(before, after)) {
      return null;
    }

    const userIds = Array.from(new Set([
      asId(before?.userId),
      asId(after?.userId),
    ].filter(Boolean)));

    try {
      await Promise.all(userIds.map((userId) => syncGamificationForUser(userId)));
    } catch (error) {
      console.error('syncGamificationOnCheckinWrite error', error);
    }
    return null;
  });

export const syncGamificationOnFriendsWrite = functions.firestore
  .document('socialGraph/{userId}')
  .onWrite(async (change, context) => {
    const beforeFriends = normalizeIdList(change.before.exists ? change.before.data()?.friends : []);
    const afterFriends = normalizeIdList(change.after.exists ? change.after.data()?.friends : []);

    if (sameIdList(beforeFriends, afterFriends)) {
      return null;
    }

    try {
      await syncGamificationForUser(asId(context.params.userId));
    } catch (error) {
      console.error('syncGamificationOnFriendsWrite error', error);
    }
    return null;
  });

function normalizePlaceTagLabel(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.slice(0, 40);
}

async function rebuildPlaceTagAggregate(placeKey: string): Promise<void> {
  const normalizedPlaceKey = asId(placeKey);
  if (!normalizedPlaceKey) return;

  const snapshot = await db.collection('place_tag_votes').where('placeKey', '==', normalizedPlaceKey).get();
  const counts: Record<string, number> = {};
  let voters = 0;

  snapshot.forEach((doc) => {
    const votes = doc.data()?.votes;
    if (!votes || typeof votes !== 'object') return;
    voters += 1;
    Object.entries(votes as Record<string, unknown>).forEach(([rawTag, rawActive]) => {
      if (rawActive !== true) return;
      const tag = normalizePlaceTagLabel(rawTag);
      if (!tag) return;
      counts[tag] = (counts[tag] || 0) + 1;
    });
  });

  const ref = db.collection('place_tags').doc(normalizedPlaceKey);
  if (!Object.keys(counts).length) {
    await ref.delete().catch(() => {});
    return;
  }

  await ref.set({
    placeKey: normalizedPlaceKey,
    tags: counts,
    voterCount: voters,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAtMs: Date.now(),
    source: 'place_tag_votes_trigger',
  }, { merge: true });
}

export const syncPlaceTagAggregates = functions.firestore
  .document('place_tag_votes/{voteId}')
  .onWrite(async (change) => {
    const placeKeys = Array.from(
      new Set(
        [
          asId(change.before.exists ? change.before.data()?.placeKey : ''),
          asId(change.after.exists ? change.after.data()?.placeKey : ''),
        ].filter(Boolean)
      )
    );
    if (!placeKeys.length) return null;

    for (const placeKey of placeKeys) {
      try {
        await rebuildPlaceTagAggregate(placeKey);
      } catch (error) {
        console.error('syncPlaceTagAggregates error', { placeKey, error });
      }
    }
    return null;
  });

type ExternalSource = 'foursquare' | 'yelp';
type ExternalPlaceSignal = {
  source: ExternalSource;
  rating?: number;
  reviewCount?: number;
  priceLevel?: string;
  categories?: string[];
};

type GooglePlaceReview = {
  text: string;
  rating: number;
  time: number;
};

type GooglePlaceSnapshot = {
  rating?: number;
  reviewCount?: number;
  priceLevel?: string;
  openNow?: boolean;
  types?: string[];
  reviews?: GooglePlaceReview[];
  hours?: string[];
};

type GooglePlaceResult = {
  placeId: string;
  name: string;
  address?: string;
  location?: { lat: number; lng: number };
  rating?: number;
  ratingCount?: number;
  priceLevel?: string;
  openNow?: boolean;
  types?: string[];
  reviews?: GooglePlaceReview[];
  hours?: string[];
};

const PLACE_SIGNAL_TTL_MS = 30 * 60 * 1000;
const placeSignalCache = new Map<string, { ts: number; payload: { externalSignals: ExternalPlaceSignal[]; googleSnapshot: GooglePlaceSnapshot | null } }>();
const GOOGLE_PLACES_PROXY_TTL_MS = 5 * 60 * 1000;
const googlePlacesProxyCache = new Map<string, { ts: number; payload: any }>();
function parseCloudRuntimeConfig() {
  const raw = process.env.CLOUD_RUNTIME_CONFIG;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}
  return {};
}
const runtimeConfig = (() => {
  return parseCloudRuntimeConfig();
})();

function readFirstNonEmpty(...values: Array<string | undefined>) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return '';
}

function parseCsvList(value: string | undefined): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getAllowedAppCheckAppIds(): string[] {
  return Array.from(
    new Set(
      [
        ...parseCsvList(process.env.APP_CHECK_ALLOWED_APP_IDS),
        ...parseCsvList(runtimeConfig?.app_check?.allowed_app_ids),
        ...parseCsvList(runtimeConfig?.appCheck?.allowed_app_ids),
        ...parseCsvList(runtimeConfig?.app_check_allowed_app_ids),
      ].filter(Boolean),
    ),
  );
}

function parsePriceLevel(value?: string) {
  if (!value) return undefined;
  const next = value.trim();
  return next ? next : undefined;
}

function normalizeGooglePriceLevel(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value <= 0) return undefined;
    return '$'.repeat(Math.max(1, Math.min(4, Math.round(value))));
  }
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (/^\$+$/.test(normalized)) return normalized.slice(0, 4);
  const match = normalized.match(/PRICE_LEVEL_(FREE|INEXPENSIVE|MODERATE|EXPENSIVE|VERY_EXPENSIVE)/i);
  if (!match) return undefined;
  if (match[1] === 'FREE') return undefined;
  if (match[1] === 'INEXPENSIVE') return '$';
  if (match[1] === 'MODERATE') return '$$';
  if (match[1] === 'EXPENSIVE') return '$$$';
  if (match[1] === 'VERY_EXPENSIVE') return '$$$$';
  return undefined;
}

function normalizeGoogleReviewText(value: any): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value?.text === 'string' && value.text.trim()) return value.text.trim();
  if (typeof value?.text?.text === 'string' && value.text.text.trim()) return value.text.text.trim();
  return null;
}

function normalizeGoogleReviewTime(value: any): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function normalizeGoogleReviews(value: unknown): GooglePlaceReview[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const reviews = value
    .map((review: any) => {
      const text = normalizeGoogleReviewText(review?.text ?? review);
      if (!text) return null;
      return {
        text,
        rating: typeof review?.rating === 'number' ? review.rating : 0,
        time: normalizeGoogleReviewTime(review?.publishTime ?? review?.time),
      } satisfies GooglePlaceReview;
    })
    .filter(Boolean) as GooglePlaceReview[];
  return reviews.length ? reviews : undefined;
}

function normalizeGoogleHours(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const hours = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
  return hours.length ? hours : undefined;
}

function normalizeGoogleSnapshot(value: any): GooglePlaceSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const snapshot: GooglePlaceSnapshot = {
    rating: typeof value.rating === 'number' ? value.rating : undefined,
    reviewCount:
      typeof value.userRatingCount === 'number'
        ? value.userRatingCount
        : typeof value.user_ratings_total === 'number'
          ? value.user_ratings_total
          : undefined,
    priceLevel: normalizeGooglePriceLevel(value.priceLevel ?? value.price_level),
    openNow:
      typeof value.currentOpeningHours?.openNow === 'boolean'
        ? value.currentOpeningHours.openNow
        : typeof value.opening_hours?.open_now === 'boolean'
          ? value.opening_hours.open_now
          : undefined,
    types: Array.isArray(value.types) ? value.types.filter((item: any) => typeof item === 'string' && item.trim()) : undefined,
    reviews: normalizeGoogleReviews(value.reviews),
    hours: normalizeGoogleHours(value.currentOpeningHours?.weekdayDescriptions ?? value.opening_hours?.weekday_text),
  };
  const hasPayload =
    typeof snapshot.rating === 'number' ||
    typeof snapshot.reviewCount === 'number' ||
    typeof snapshot.priceLevel === 'string' ||
    typeof snapshot.openNow === 'boolean' ||
    Boolean(snapshot.hours?.length) ||
    Boolean(snapshot.reviews?.length);
  return hasPayload ? snapshot : null;
}

function normalizeGooglePlaceLocation(value: any): { lat: number; lng: number } | undefined {
  const lat = toFiniteNumber(value?.latitude ?? value?.lat);
  const lng = toFiniteNumber(value?.longitude ?? value?.lng);
  if (lat === null || lng === null) return undefined;
  return { lat, lng };
}

function normalizeGooglePlaceResult(value: any, fallbackPlaceId = ''): GooglePlaceResult | null {
  if (!value || typeof value !== 'object') return null;
  const placeId = asId(value.id ?? value.placeId ?? value.place_id ?? fallbackPlaceId);
  const name = readFirstNonEmpty(value.displayName?.text, value.name);
  if (!placeId || !name) return null;

  const location = normalizeGooglePlaceLocation(value.location ?? value.geometry?.location);
  const address = readFirstNonEmpty(value.formattedAddress, value.formatted_address, value.vicinity, value.address) || undefined;
  const rating = toFiniteNumber(value.rating) ?? undefined;
  const reviewCount = toFiniteNumber(value.userRatingCount ?? value.user_ratings_total) ?? undefined;
  const priceLevel = normalizeGooglePriceLevel(value.priceLevel ?? value.price_level);
  const openNow =
    typeof value.currentOpeningHours?.openNow === 'boolean'
      ? value.currentOpeningHours.openNow
      : typeof value.opening_hours?.open_now === 'boolean'
        ? value.opening_hours.open_now
        : typeof value.openNow === 'boolean'
          ? value.openNow
          : undefined;
  const types = Array.isArray(value.types)
    ? value.types.filter((item: any) => typeof item === 'string' && item.trim())
    : undefined;
  const reviews = normalizeGoogleReviews(value.reviews);
  const hours = normalizeGoogleHours(
    value.currentOpeningHours?.weekdayDescriptions ??
      value.opening_hours?.weekday_text ??
      value.hours,
  );

  return {
    placeId,
    name,
    address,
    location,
    rating,
    ratingCount: reviewCount,
    priceLevel,
    openNow,
    types,
    reviews,
    hours,
  };
}

async function getGoogleMapsKeyServer(): Promise<string> {
  let key = readFirstNonEmpty(
    process.env.GOOGLE_MAPS_API_KEY,
    runtimeConfig?.places?.google_maps_api_key,
    runtimeConfig?.google_maps_api_key,
    runtimeConfig?.maps?.api_key,
  );
  if (!key) {
    key = await getCachedSecret('GOOGLE_MAPS_API_KEY');
  }
  return key;
}

function withCors(req: any, res: any) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Vary', 'Origin');
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Firebase-AppCheck, X-Place-Intel-Secret');
}

async function verifyFirebaseUserFromRequest(req: any): Promise<string | null> {
  const header = req.get('Authorization') || '';
  if (typeof header !== 'string' || !header.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  const token = header.slice(7).trim();
  if (!token) return null;
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return decoded?.uid || null;
  } catch {
    return null;
  }
}

async function verifyAppCheckFromRequest(req: any): Promise<boolean> {
  const token = req.get('X-Firebase-AppCheck') || '';
  if (typeof token !== 'string' || !token.trim()) {
    return false;
  }
  try {
    await admin.appCheck().verifyToken(token.trim());
    return true;
  } catch {
    return false;
  }
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs = 2800) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = setTimeout(() => controller?.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller?.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJsonResponseWithTimeout(url: string, init: RequestInit, timeoutMs = 2800) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = setTimeout(() => controller?.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller?.signal });
    const json = await res.json().catch(() => null);
    return {
      ok: res.ok,
      status: res.status,
      json,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function parseExternalSignals(payload: unknown): ExternalPlaceSignal[] {
  if (!Array.isArray(payload)) return [];
  return payload.filter(Boolean);
}

async function fetchGooglePlaceSignalServer(placeId: string): Promise<GooglePlaceSnapshot | null> {
  const normalizedPlaceId = asId(placeId);
  if (!normalizedPlaceId) return null;

  const key = await getGoogleMapsKeyServer();
  if (!key) return null;

  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(normalizedPlaceId)}`, {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,types,rating,userRatingCount,priceLevel,reviews,currentOpeningHours',
      },
    });
    if (res.ok) {
      const payload = normalizeGoogleSnapshot(await res.json().catch(() => null));
      if (payload) return payload;
    }
  } catch {}

  try {
    const fields = encodeURIComponent('name,formatted_address,geometry,types,opening_hours,rating,user_ratings_total,price_level,reviews');
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(normalizedPlaceId)}&fields=${fields}&key=${encodeURIComponent(key)}&language=en`;
    const json = await fetchJsonWithTimeout(url, { method: 'GET', headers: { Accept: 'application/json' } });
    return normalizeGoogleSnapshot((json as any)?.result);
  } catch {
    return null;
  }
}

function pickCityFromGeocode(result: any): string | null {
  if (!result?.address_components) return null;
  const components = result.address_components as Array<{ long_name: string; types: string[] }>;
  const byType = (type: string) => components.find((item) => item.types.includes(type))?.long_name || null;
  return (
    byType('locality') ||
    byType('postal_town') ||
    byType('administrative_area_level_2') ||
    byType('administrative_area_level_1') ||
    null
  );
}

function clampGooglePlacesLimit(value: unknown, fallback: number, max = 20) {
  const numeric = toFiniteNumber(value);
  if (numeric === null) return fallback;
  return Math.max(1, Math.min(max, Math.round(numeric)));
}

function normalizeGooglePlacesResponse(value: unknown, limit?: number): GooglePlaceResult[] {
  if (!Array.isArray(value)) return [];
  const results = value
    .map((item: any) => normalizeGooglePlaceResult(item))
    .filter(Boolean) as GooglePlaceResult[];
  return typeof limit === 'number' ? results.slice(0, limit) : results;
}

async function searchGoogleTextServer(
  query: string,
  limit = 6,
  bias?: { lat: number; lng: number; radiusMeters?: number },
): Promise<GooglePlaceResult[]> {
  const normalizedQuery = asId(query);
  if (!normalizedQuery) return [];
  const key = await getGoogleMapsKeyServer();
  if (!key) return [];

  const effectiveLimit = clampGooglePlacesLimit(limit, 6);
  const radiusMeters = Math.max(100, Math.min(50000, Math.round(toFiniteNumber(bias?.radiusMeters) ?? 8000)));

  try {
    const response = await fetchJsonResponseWithTimeout(
      'https://places.googleapis.com/v1/places:searchText',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours,places.types',
        },
        body: JSON.stringify({
          textQuery: normalizedQuery,
          languageCode: 'en',
          ...(bias
            ? {
              locationBias: {
                circle: {
                  center: {
                    latitude: bias.lat,
                    longitude: bias.lng,
                  },
                  radius: radiusMeters,
                },
              },
            }
            : {}),
        }),
      },
      3200,
    );
    const proxied = normalizeGooglePlacesResponse(response?.json?.places, effectiveLimit);
    if (response?.ok && proxied.length) return proxied;
  } catch {}

  const params = new URLSearchParams({
    query: normalizedQuery,
    key,
    language: 'en',
  });
  if (bias) {
    params.set('location', `${bias.lat},${bias.lng}`);
    params.set('radius', String(radiusMeters));
  }
  const legacy = await fetchJsonWithTimeout(
    `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`,
    { method: 'GET', headers: { Accept: 'application/json' } },
    3200,
  );
  return normalizeGooglePlacesResponse((legacy as any)?.results, effectiveLimit);
}

async function fetchGooglePlaceDetailsServer(placeId: string): Promise<GooglePlaceResult | null> {
  const normalizedPlaceId = asId(placeId);
  if (!normalizedPlaceId) return null;
  const key = await getGoogleMapsKeyServer();
  if (!key) return null;

  try {
    const response = await fetchJsonResponseWithTimeout(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(normalizedPlaceId)}`,
      {
        method: 'GET',
        headers: {
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,types,rating,userRatingCount,priceLevel,reviews,currentOpeningHours',
        },
      },
      3200,
    );
    const payload = normalizeGooglePlaceResult(response?.json, normalizedPlaceId);
    if (response?.ok && payload) return payload;
  } catch {}

  const fields = encodeURIComponent('name,formatted_address,geometry,types,opening_hours,rating,user_ratings_total,price_level,reviews');
  const legacy = await fetchJsonWithTimeout(
    `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(normalizedPlaceId)}&fields=${fields}&key=${encodeURIComponent(key)}&language=en`,
    { method: 'GET', headers: { Accept: 'application/json' } },
    3200,
  );
  return normalizeGooglePlaceResult((legacy as any)?.result, normalizedPlaceId);
}

async function searchGoogleNearbyServer(
  lat: number,
  lng: number,
  radius = 1500,
  intent: 'study' | 'general' = 'study',
): Promise<GooglePlaceResult[]> {
  const key = await getGoogleMapsKeyServer();
  if (!key) return [];
  const normalizedRadius = Math.max(100, Math.min(50000, Math.round(toFiniteNumber(radius) ?? 1500)));

  try {
    const includedTypes = intent === 'study'
      ? ['cafe', 'coffee_shop', 'library', 'university', 'coworking_space']
      : undefined;
    const response = await fetchJsonResponseWithTimeout(
      'https://places.googleapis.com/v1/places:searchNearby',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours,places.types',
        },
        body: JSON.stringify({
          locationRestriction: {
            circle: {
              center: { latitude: lat, longitude: lng },
              radius: normalizedRadius,
            },
          },
          includedTypes,
          rankPreference: 'POPULARITY',
          maxResultCount: 20,
          languageCode: 'en',
        }),
      },
      3200,
    );
    const payload = normalizeGooglePlacesResponse(response?.json?.places, 20);
    if (response?.ok && payload.length) return payload;
  } catch {}

  const keyword = intent === 'study' ? '&keyword=study%20cafe%20coffee%20library%20coworking' : '';
  const legacy = await fetchJsonWithTimeout(
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${normalizedRadius}${keyword}&key=${key}&language=en`,
    { method: 'GET', headers: { Accept: 'application/json' } },
    3200,
  );
  return normalizeGooglePlacesResponse((legacy as any)?.results, 20);
}

async function reverseGeocodeCityServer(lat: number, lng: number): Promise<string | null> {
  const key = await getGoogleMapsKeyServer();
  if (!key) return null;
  const params = new URLSearchParams({
    latlng: `${lat},${lng}`,
    result_type: 'locality|postal_town|administrative_area_level_2',
    key,
    language: 'en',
  });
  const json = await fetchJsonWithTimeout(
    `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`,
    { method: 'GET', headers: { Accept: 'application/json' } },
    3200,
  );
  const results = Array.isArray((json as any)?.results) ? (json as any).results : [];
  for (const result of results) {
    const city = pickCityFromGeocode(result);
    if (city) return city;
  }
  return null;
}

async function searchGoogleLocationsServer(
  query: string,
  kind: 'campus' | 'city',
  limit = 8,
  bias?: { lat: number; lng: number },
): Promise<GooglePlaceResult[]> {
  const key = await getGoogleMapsKeyServer();
  const normalizedQuery = asId(query);
  if (!key || !normalizedQuery) return [];

  const baseQuery = kind === 'campus' ? `${normalizedQuery} university college` : normalizedQuery;
  const type = kind === 'campus' ? 'university' : 'locality';
  const params = new URLSearchParams({
    query: baseQuery,
    type,
    key,
    language: 'en',
  });
  if (bias) {
    params.set('location', `${bias.lat},${bias.lng}`);
    params.set('radius', '80000');
  }

  const effectiveLimit = clampGooglePlacesLimit(limit, 8);
  const json = await fetchJsonWithTimeout(
    `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`,
    { method: 'GET', headers: { Accept: 'application/json' } },
    3200,
  );
  const payload = normalizeGooglePlacesResponse((json as any)?.results, effectiveLimit * 2);
  const seen = new Set<string>();
  return payload
    .filter((result) => {
      const dedupeKey = result.name.trim().toLowerCase();
      if (!dedupeKey || seen.has(dedupeKey)) return false;
      seen.add(dedupeKey);
      return true;
    })
    .slice(0, effectiveLimit);
}

async function fetchFoursquareSignalServer(placeName: string, lat: number, lng: number): Promise<ExternalPlaceSignal | null> {
  // Prefer env/runtime config (works with functions.runWith secrets), then fallback to Secret Manager.
  let key = readFirstNonEmpty(
    process.env.FOURSQUARE_API_KEY,
    runtimeConfig?.places?.foursquare_api_key,
    runtimeConfig?.places?.foursquare,
    runtimeConfig?.foursquare_api_key,
    runtimeConfig?.foursquare,
  );
  if (!key) {
    key = await getCachedSecret('FOURSQUARE_API_KEY');
  }
  if (!key) return null;
  const ll = `${lat},${lng}`;
  const params = new URLSearchParams({ query: placeName, ll, limit: '1' });
  const url = `https://api.foursquare.com/v3/places/search?${params.toString()}`;
  const json = await fetchJsonWithTimeout(url, {
    headers: {
      Accept: 'application/json',
      Authorization: key,
    },
  });
  const place = Array.isArray((json as any)?.results) ? (json as any).results[0] : null;
  if (!place) return null;
  const categories = Array.isArray(place.categories)
    ? place.categories
      .map((c: any) => (typeof c?.name === 'string' ? c.name : null))
      .filter((v: any) => typeof v === 'string')
    : undefined;
  return {
    source: 'foursquare',
    rating: typeof place.rating === 'number' ? place.rating / 2 : undefined,
    priceLevel: parsePriceLevel(place.price?.toString()),
    categories,
  };
}

async function fetchYelpSignalServer(placeName: string, lat: number, lng: number): Promise<ExternalPlaceSignal | null> {
  // Prefer env/runtime config (works with functions.runWith secrets), then fallback to Secret Manager.
  let key = readFirstNonEmpty(
    process.env.YELP_API_KEY,
    runtimeConfig?.places?.yelp_api_key,
    runtimeConfig?.places?.yelp,
    runtimeConfig?.yelp_api_key,
    runtimeConfig?.yelp,
  );
  if (!key) {
    key = await getCachedSecret('YELP_API_KEY');
  }
  if (!key) return null;
  // `businesses/matches` now requires address fields; use search with location bias instead.
  const params = new URLSearchParams({
    term: placeName,
    latitude: String(lat),
    longitude: String(lng),
    limit: '1',
    sort_by: 'best_match',
  });
  const url = `https://api.yelp.com/v3/businesses/search?${params.toString()}`;
  const json = await fetchJsonWithTimeout(url, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
  });
  const business = Array.isArray((json as any)?.businesses) ? (json as any).businesses[0] : null;
  if (!business) return null;
  const categories = Array.isArray(business.categories)
    ? business.categories
      .map((c: any) => (typeof c?.title === 'string' ? c.title : null))
      .filter((v: any) => typeof v === 'string')
    : undefined;
  return {
    source: 'yelp',
    rating: typeof business.rating === 'number' ? business.rating : undefined,
    reviewCount: typeof business.review_count === 'number' ? business.review_count : undefined,
    priceLevel: parsePriceLevel(business.price),
    categories,
  };
}

export const googlePlacesProxy = functions
  .runWith({ secrets: ['GOOGLE_MAPS_API_KEY'] })
  .https.onRequest(async (req, res) => {
  withCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const requiredSecret = readFirstNonEmpty(
    process.env.GOOGLE_PLACES_PROXY_SECRET,
    process.env.PLACE_INTEL_PROXY_SECRET,
    runtimeConfig?.places?.google_proxy_secret,
    runtimeConfig?.places?.proxy_secret,
    runtimeConfig?.google_places_proxy_secret,
    runtimeConfig?.place_intel_proxy_secret,
    runtimeConfig?.proxy_secret,
  );
  const providedSecret = req.get('X-Place-Intel-Secret') || '';
  const hasSecretBypass = Boolean(requiredSecret && providedSecret === requiredSecret);

  const requireAuthRaw = readFirstNonEmpty(
    process.env.GOOGLE_PLACES_REQUIRE_AUTH,
    process.env.PLACE_INTEL_REQUIRE_AUTH,
    runtimeConfig?.places?.google_require_auth,
    runtimeConfig?.places?.require_auth,
  );
  const requireAuth =
    !requireAuthRaw || !['0', 'false', 'no', 'off'].includes(requireAuthRaw.toLowerCase());

  const requireAppCheckRaw = readFirstNonEmpty(
    process.env.GOOGLE_PLACES_REQUIRE_APP_CHECK,
    process.env.PLACE_INTEL_REQUIRE_APP_CHECK,
    runtimeConfig?.places?.google_require_app_check,
    runtimeConfig?.places?.require_app_check,
  );
  const requireAppCheck =
    !requireAppCheckRaw || !['0', 'false', 'no', 'off'].includes(requireAppCheckRaw.toLowerCase());

  if (!hasSecretBypass) {
    const uid = await verifyFirebaseUserFromRequest(req);
    const providedAppCheck = req.get('X-Firebase-AppCheck') || '';
    let appCheckOk = false;
    if (requireAppCheck || providedAppCheck) {
      appCheckOk = await verifyAppCheckFromRequest(req);
      if (!appCheckOk) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    }
    if (requireAuth && !uid && !appCheckOk) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  const body = typeof req.body === 'string'
    ? (() => {
      try {
        return JSON.parse(req.body);
      } catch {
        return null;
      }
    })()
    : req.body;

  const action = typeof body?.action === 'string' ? body.action.trim().toLowerCase() : '';
  const placeId = typeof body?.placeId === 'string' ? body.placeId.trim() : '';
  const query = typeof body?.query === 'string' ? body.query.trim() : '';
  const kind = body?.kind === 'campus' ? 'campus' : 'city';
  const lat = toFiniteNumber(body?.lat ?? body?.location?.lat);
  const lng = toFiniteNumber(body?.lng ?? body?.location?.lng);
  const radius = clampGooglePlacesLimit(body?.radius, 1500, 50000);
  const limit = clampGooglePlacesLimit(body?.limit, 8, 20);
  const intent = body?.intent === 'general' ? 'general' : 'study';
  const bias = lat !== null && lng !== null ? { lat, lng } : undefined;

  if (!action) {
    res.status(400).json({ error: 'Missing action' });
    return;
  }

  const cacheKey = (() => {
    if (action === 'details') return `details:${placeId}`;
    if (action === 'reverse_geocode') return `reverse:${lat?.toFixed(3) || 'na'}:${lng?.toFixed(3) || 'na'}`;
    if (action === 'nearby') return `nearby:${lat?.toFixed(3) || 'na'}:${lng?.toFixed(3) || 'na'}:${radius}:${intent}`;
    if (action === 'search_locations') return `locations:${kind}:${query.toLowerCase()}:${limit}:${lat?.toFixed(3) || 'na'}:${lng?.toFixed(3) || 'na'}`;
    return `text:${query.toLowerCase()}:${limit}:${lat?.toFixed(3) || 'na'}:${lng?.toFixed(3) || 'na'}:${radius}`;
  })();
  const cached = googlePlacesProxyCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < GOOGLE_PLACES_PROXY_TTL_MS) {
    res.status(200).json({ ...cached.payload, cacheHit: true });
    return;
  }

  try {
    let payload: any = null;

    switch (action) {
      case 'details': {
        if (!placeId) {
          res.status(400).json({ error: 'Missing placeId' });
          return;
        }
        payload = { place: await fetchGooglePlaceDetailsServer(placeId) };
        break;
      }
      case 'search_text': {
        if (!query) {
          res.status(400).json({ error: 'Missing query' });
          return;
        }
        payload = {
          places: await searchGoogleTextServer(
            query,
            limit,
            bias ? { ...bias, radiusMeters: radius } : undefined,
          ),
        };
        break;
      }
      case 'nearby': {
        if (lat === null || lng === null) {
          res.status(400).json({ error: 'Missing location' });
          return;
        }
        payload = {
          places: await searchGoogleNearbyServer(lat, lng, radius, intent),
        };
        break;
      }
      case 'reverse_geocode': {
        if (lat === null || lng === null) {
          res.status(400).json({ error: 'Missing location' });
          return;
        }
        payload = {
          city: await reverseGeocodeCityServer(lat, lng),
        };
        break;
      }
      case 'search_locations': {
        if (!query) {
          res.status(400).json({ error: 'Missing query' });
          return;
        }
        payload = {
          places: await searchGoogleLocationsServer(query, kind, limit, bias),
        };
        break;
      }
      default:
        res.status(400).json({ error: 'Unsupported action' });
        return;
    }

    googlePlacesProxyCache.set(cacheKey, { ts: Date.now(), payload });
    res.status(200).json({ ...payload, cacheHit: false });
    return;
  } catch (error) {
    console.error('googlePlacesProxy error', { action, error });
    res.status(500).json({ error: 'google places proxy failed' });
    return;
  }
});

export const placeSignalsProxy = functions
  .runWith({ secrets: ['YELP_API_KEY', 'FOURSQUARE_API_KEY', 'GOOGLE_MAPS_API_KEY'] })
  .https.onRequest(async (req, res) => {
  withCors(req, res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const requiredSecret = readFirstNonEmpty(
    process.env.PLACE_INTEL_PROXY_SECRET,
    runtimeConfig?.places?.proxy_secret,
    runtimeConfig?.place_intel_proxy_secret,
    runtimeConfig?.proxy_secret,
  );

  const providedSecret = req.get('X-Place-Intel-Secret') || '';
  const hasSecretBypass = Boolean(requiredSecret && providedSecret === requiredSecret);

  const requireAuthRaw = readFirstNonEmpty(
    process.env.PLACE_INTEL_REQUIRE_AUTH,
    runtimeConfig?.places?.require_auth,
  );
  const requireAuth =
    !requireAuthRaw || !['0', 'false', 'no', 'off'].includes(requireAuthRaw.toLowerCase());

  const requireAppCheckRaw = readFirstNonEmpty(
    process.env.PLACE_INTEL_REQUIRE_APP_CHECK,
    runtimeConfig?.places?.require_app_check,
  );
  const requireAppCheck =
    !requireAppCheckRaw || !['0', 'false', 'no', 'off'].includes(requireAppCheckRaw.toLowerCase());

  const enableFoursquareRaw = readFirstNonEmpty(
    process.env.PLACE_INTEL_ENABLE_FOURSQUARE,
    runtimeConfig?.places?.enable_foursquare,
  );
  const foursquareKeyPresent = Boolean(
    readFirstNonEmpty(
      process.env.FOURSQUARE_API_KEY,
      runtimeConfig?.places?.foursquare_api_key,
      runtimeConfig?.places?.foursquare,
      runtimeConfig?.foursquare_api_key,
      runtimeConfig?.foursquare,
    )
  );
  const enableFoursquare = foursquareKeyPresent &&
    !['0', 'false', 'no', 'off'].includes((enableFoursquareRaw || '').toLowerCase());

  if (!hasSecretBypass) {
    const uid = await verifyFirebaseUserFromRequest(req);
    const providedAppCheck = req.get('X-Firebase-AppCheck') || '';
    let appCheckOk = false;
    if (requireAppCheck || providedAppCheck) {
      appCheckOk = await verifyAppCheckFromRequest(req);
      if (!appCheckOk) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
    }
    if (requireAuth && !uid && !appCheckOk) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  const body = typeof req.body === 'string'
    ? (() => {
      try {
        return JSON.parse(req.body);
      } catch {
        return null;
      }
    })()
    : req.body;

  const placeName = typeof body?.placeName === 'string' ? body.placeName.trim() : '';
  const placeId = typeof body?.placeId === 'string' ? body.placeId.trim() : '';
  const lat = typeof body?.location?.lat === 'number' ? body.location.lat : null;
  const lng = typeof body?.location?.lng === 'number' ? body.location.lng : null;

  if (!placeName || typeof lat !== 'number' || typeof lng !== 'number') {
    res.status(400).json({ error: 'Missing placeName/location' });
    return;
  }

  const cacheKey = `${placeId}:${placeName.toLowerCase()}:${lat.toFixed(3)}:${lng.toFixed(3)}:fsq${enableFoursquare ? '1' : '0'}`;
  const cached = placeSignalCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < PLACE_SIGNAL_TTL_MS) {
    res.status(200).json({ ...cached.payload, cacheHit: true });
    return;
  }

  try {
    const [googleSnapshot, foursquare, yelp] = await Promise.all([
      fetchGooglePlaceSignalServer(placeId),
      enableFoursquare ? fetchFoursquareSignalServer(placeName, lat, lng) : Promise.resolve(null),
      fetchYelpSignalServer(placeName, lat, lng),
    ]);
    const externalSignals = parseExternalSignals([foursquare, yelp]);
    const payload = { externalSignals, googleSnapshot };
    placeSignalCache.set(cacheKey, { ts: Date.now(), payload });
    res.status(200).json({ ...payload, cacheHit: false });
    return;
  } catch (error) {
    console.error('placeSignalsProxy error', error);
    res.status(500).json({ error: 'place signal lookup failed' });
    return;
  }
});

// =============================================================================
// NLP REVIEW ANALYSIS (Cloud Function — moves OpenAI call server-side)
// =============================================================================

const NLP_CACHE_COLLECTION = 'nlpReviewCache';
const NLP_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Analyze spot reviews using GPT-4o-mini via Cloud Function.
 * Accepts { placeId, placeName, reviewTexts: string[] }.
 * Returns work + coffee vibe inference signals.
 * Results are cached in Firestore for 24h to avoid repeated OpenAI calls.
 */
export const analyzeSpotReviews = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const placeId = typeof data?.placeId === 'string' ? data.placeId.trim() : '';
  const placeName = typeof data?.placeName === 'string' ? data.placeName.trim() : '';
  const reviewTexts: string[] = Array.isArray(data?.reviewTexts)
    ? data.reviewTexts.filter((t: unknown) => typeof t === 'string').slice(0, 10)
    : [];

  if (!placeId || !placeName) {
    throw new functions.https.HttpsError('invalid-argument', 'placeId and placeName are required');
  }
  if (reviewTexts.length === 0) {
    return {
      noise: null,
      noiseConfidence: 0,
      hasWifi: false,
      wifiConfidence: 0,
      goodForStudying: false,
      goodForMeetings: false,
      dateFriendly: 0,
      aestheticVibe: null,
      foodQualitySignal: 0,
      musicAtmosphere: 'unknown',
      instagramWorthy: 0,
      seatingComfort: 'unknown',
      goodForDates: 0,
      goodForGroups: 0,
    };
  }

  // Check Firestore TTL cache
  try {
    const cacheDoc = await db.collection(NLP_CACHE_COLLECTION).doc(placeId).get();
    if (cacheDoc.exists) {
      const cached = cacheDoc.data();
      if (cached && cached.analyzedAt && Date.now() - cached.analyzedAt < NLP_CACHE_TTL_MS) {
        return cached.result;
      }
    }
  } catch {}

  // Fetch OpenAI API key from Secret Manager
  const openaiKey = await getCachedSecret('OPENAI_API_KEY');
  if (!openaiKey) {
    throw new functions.https.HttpsError('failed-precondition', 'OpenAI API key not configured');
  }

  // Build prompt
  const reviewBlock = reviewTexts
    .map((text, i) => `Review ${i + 1}: "${text.slice(0, 200)}"`)
    .join('\n\n');

  const prompt = `Analyze these reviews for "${placeName}" and extract the following information:

${reviewBlock}

Respond with JSON matching this exact schema:
{
  "noise": "quiet" | "moderate" | "loud" | null,
  "noiseConfidence": 0.0 to 1.0,
  "hasWifi": true | false,
  "wifiConfidence": 0.0 to 1.0,
  "goodForStudying": true | false,
  "goodForMeetings": true | false,
  "dateFriendly": 0.0 to 1.0,
  "aestheticVibe": "cozy" | "modern" | "rustic" | "industrial" | "classic" | null,
  "foodQualitySignal": 0.0 to 1.0,
  "musicAtmosphere": "none" | "chill" | "upbeat" | "live" | "unknown",
  "instagramWorthy": 0.0 to 1.0,
  "seatingComfort": "comfortable" | "basic" | "mixed" | "unknown",
  "goodForDates": 0.0 to 1.0,
  "goodForGroups": 0.0 to 1.0
}

Guidelines:
- "noise": Infer from mentions of "quiet", "loud", "noisy", "peaceful", "busy atmosphere"
- "noiseConfidence": How certain you are (0-1)
- "hasWifi": True if WiFi is mentioned positively
- "wifiConfidence": How certain you are based on mentions
- "goodForStudying": True if reviews mention "study", "work", "laptop", "quiet for work"
- "goodForMeetings": True if reviews mention "meet", "meetings", "group work"
- "dateFriendly": Confidence this works for dates/romantic visits
- "aestheticVibe": Dominant aesthetic style if implied
- "foodQualitySignal": Confidence food/pastry quality is strong
- "musicAtmosphere": Dominant music vibe if mentioned
- "instagramWorthy": Confidence this place is photogenic
- "seatingComfort": Comfort level implied by seating mentions
- "goodForDates": Explicit confidence for date suitability
- "goodForGroups": Explicit confidence for group suitability

If no information is found, use null for noise and false for booleans with 0 confidence.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert at analyzing coffee shop and workspace reviews to extract structured data about noise levels, WiFi, and work suitability. Respond ONLY with valid JSON.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 200,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('OpenAI API error:', errText);
      throw new functions.https.HttpsError('internal', 'OpenAI API call failed');
    }

    const apiData = await response.json();
    const content = apiData.choices?.[0]?.message?.content;
    if (!content) {
      throw new functions.https.HttpsError('internal', 'Empty OpenAI response');
    }

    const parsed = JSON.parse(content);
    const aestheticVibe =
      ['cozy', 'modern', 'rustic', 'industrial', 'classic'].includes(String(parsed.aestheticVibe))
        ? String(parsed.aestheticVibe)
        : null;
    const musicAtmosphere =
      ['none', 'chill', 'upbeat', 'live', 'unknown'].includes(String(parsed.musicAtmosphere))
        ? String(parsed.musicAtmosphere)
        : 'unknown';
    const seatingComfort =
      ['comfortable', 'basic', 'mixed', 'unknown'].includes(String(parsed.seatingComfort))
        ? String(parsed.seatingComfort)
        : 'unknown';
    const result = {
      noise: ['quiet', 'moderate', 'loud'].includes(parsed.noise) ? parsed.noise : null,
      noiseConfidence: Math.max(0, Math.min(1, parsed.noiseConfidence || 0)),
      hasWifi: Boolean(parsed.hasWifi),
      wifiConfidence: Math.max(0, Math.min(1, parsed.wifiConfidence || 0)),
      goodForStudying: Boolean(parsed.goodForStudying),
      goodForMeetings: Boolean(parsed.goodForMeetings),
      dateFriendly: Math.max(0, Math.min(1, parsed.dateFriendly || 0)),
      aestheticVibe,
      foodQualitySignal: Math.max(0, Math.min(1, parsed.foodQualitySignal || 0)),
      musicAtmosphere,
      instagramWorthy: Math.max(0, Math.min(1, parsed.instagramWorthy || 0)),
      seatingComfort,
      goodForDates: Math.max(0, Math.min(1, parsed.goodForDates || 0)),
      goodForGroups: Math.max(0, Math.min(1, parsed.goodForGroups || 0)),
    };

    // Cache result in Firestore
    try {
      await db.collection(NLP_CACHE_COLLECTION).doc(placeId).set({
        result,
        analyzedAt: Date.now(),
        placeName,
        reviewCount: reviewTexts.length,
      });
    } catch {}

    return result;
  } catch (error: any) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('analyzeSpotReviews error:', error);
    throw new functions.https.HttpsError('internal', 'NLP analysis failed');
  }
});

// =============================================================================
// B2B API ENDPOINTS
// =============================================================================

/**
 * Generate a cryptographically secure API key
 * Uses crypto.randomBytes for high entropy random generation
 */
function generateCryptoKey(): string {
  const buffer = crypto.randomBytes(32); // 256 bits of entropy
  const key = buffer.toString('base64url'); // URL-safe base64 encoding
  return `pk_live_${key}`;
}

/**
 * Generate API key for B2B partner (admin-only)
 * Callable function that requires admin custom claim
 */
export const b2bGenerateAPIKey = functions.https.onCall(async (data, context) => {
  // Verify admin auth
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const adminClaim = context.auth.token.admin;
  if (!adminClaim) {
    throw new functions.https.HttpsError('permission-denied', 'Must be admin');
  }

  const { partnerId, partnerName, tier, permissions } = data;

  if (!partnerId || !partnerName) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing partnerId or partnerName');
  }

  try {
    // Generate cryptographically secure API key
    const apiKey = generateCryptoKey();
    const keyHash = hashApiKey(apiKey);
    const keyMetadata = buildApiKeyMetadata(apiKey);

    const rateLimits: Record<string, number> = {
      free: 100,
      pro: 10000,
      enterprise: 100000,
    };

    // Default permissions: grant all endpoints for backward compatibility
    const defaultPermissions = {
      spotData: true,
      nearbySpots: true,
      usageStats: true,
    };

    const keyData = {
      keyHash,
      ...keyMetadata,
      partnerId,
      partnerName,
      tier: tier || 'free',
      permissions: permissions || defaultPermissions,
      rateLimit: rateLimits[tier || 'free'] || 100,
      currentUsage: 0,
      lastResetAt: Date.now(),
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const batch = db.batch();
    const keyRef = db.collection('apiKeys').doc(partnerId);
    const hashRef = db.collection(API_KEY_HASH_COLLECTION).doc(keyHash);
    batch.set(keyRef, keyData);
    batch.set(hashRef, {
      partnerId,
      updatedAt: Date.now(),
    }, { merge: true });
    await batch.commit();

    apiKeyCache.set(keyHash, { ts: Date.now(), docId: partnerId, data: keyData });

    console.log(`Generated API key for partner: ${partnerId}`);
    return { success: true, apiKey, tier: keyData.tier, rateLimit: keyData.rateLimit };
  } catch (error) {
    console.error('Error generating API key:', error);
    throw new functions.https.HttpsError('internal', 'Failed to generate API key');
  }
});

/**
 * Get spot data with API key authentication
 * HTTPS request endpoint with rate limiting
 */
export const b2bGetSpotData = functions.https.onRequest(async (req, res) => {
  // Generate trace ID for request tracking
  const traceId = generateTraceId();
  const startTime = Date.now();

  // CORS with origin whitelist
  setCorsHeaders(req, res);
  res.set('X-Trace-Id', traceId);

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed', traceId });
    return;
  }

  // Validate API key
  const apiKey = req.get('X-API-Key') || '';
  if (!apiKey) {
    void recordBackendPerf('b2b_spot_data', Date.now() - startTime, false, { statusCode: 401, reason: 'missing_api_key' });
    res.status(401).json({ error: 'Missing API key', traceId });
    return;
  }

  try {
    // Get API key data
    const keyRecord = await resolveApiKeyRecord(apiKey);
    if (!keyRecord) {
      logRequest(traceId, 'b2bGetSpotData', 'unknown', Date.now() - startTime, 401, { error: 'Invalid API key' });
      void recordBackendPerf('b2b_spot_data', Date.now() - startTime, false, { statusCode: 401, reason: 'invalid_api_key' });
      res.status(401).json({ error: 'Invalid API key', traceId });
      return;
    }

    const keyDocRef = keyRecord.ref;
    const keyData = keyRecord.data;

    if (!keyData.active) {
      logRequest(traceId, 'b2bGetSpotData', keyData.partnerId, Date.now() - startTime, 403, { error: 'API key inactive' });
      void recordBackendPerf('b2b_spot_data', Date.now() - startTime, false, {
        statusCode: 403,
        reason: 'api_key_inactive',
        partnerId: keyData.partnerId,
      });
      res.status(403).json({ error: 'API key inactive', traceId });
      return;
    }

    // Check endpoint permission
    if (!keyData.permissions?.spotData) {
      logRequest(traceId, 'b2bGetSpotData', keyData.partnerId, Date.now() - startTime, 403, { error: 'Permission denied' });
      void recordBackendPerf('b2b_spot_data', Date.now() - startTime, false, {
        statusCode: 403,
        reason: 'missing_permission',
        partnerId: keyData.partnerId,
      });
      res.status(403).json({ error: 'Forbidden: spotData permission required', traceId });
      return;
    }

    // Check rate limit with transaction to prevent race conditions
    const now = Date.now();

    try {
      await db.runTransaction(async (transaction) => {
        const freshKeyDoc = await transaction.get(keyDocRef);
        const freshData = freshKeyDoc.data()!;

        const hoursSinceReset = (now - (freshData.lastResetAt || 0)) / (1000 * 60 * 60);

        if (hoursSinceReset >= 1) {
          // Reset usage counter
          transaction.update(keyDocRef, {
            currentUsage: 1,
            lastResetAt: now,
          });
          return { currentUsage: 1, rateLimit: freshData.rateLimit };
        } else {
          // Check if rate limit would be exceeded
          if (freshData.currentUsage >= freshData.rateLimit) {
            throw new Error('RATE_LIMIT_EXCEEDED');
          }
          // Increment usage
          transaction.update(keyDocRef, {
            currentUsage: admin.firestore.FieldValue.increment(1),
          });
          return { currentUsage: freshData.currentUsage + 1, rateLimit: freshData.rateLimit };
        }
      });
    } catch (error: any) {
      if (error.message === 'RATE_LIMIT_EXCEEDED') {
        const hoursSinceReset = (now - (keyData.lastResetAt || 0)) / (1000 * 60 * 60);
        const retryAfter = Math.ceil(3600 - (hoursSinceReset * 3600));
        logRequest(traceId, 'b2bGetSpotData', keyData.partnerId, Date.now() - startTime, 429, { error: 'Rate limit exceeded', retryAfter });
        void recordBackendPerf('b2b_spot_data', Date.now() - startTime, false, {
          statusCode: 429,
          reason: 'rate_limit',
          partnerId: keyData.partnerId,
        });
        res.status(429).json({ error: 'Rate limit exceeded', retryAfter, traceId });
        return;
      }
      throw error;
    }

    // Get and validate spot ID from query
    const rawSpotId = req.method === 'GET' ? (req.query.spotId as string) : req.body.spotId;

    let spotId: string;
    try {
      const validated = validateRequest<{ spotId: string }>(spotDataSchema, { spotId: rawSpotId });
      spotId = validated.spotId;
    } catch (error: any) {
      logRequest(traceId, 'b2bGetSpotData', keyData.partnerId, Date.now() - startTime, 400, { error: error.message });
      void recordBackendPerf('b2b_spot_data', Date.now() - startTime, false, {
        statusCode: 400,
        reason: 'invalid_input',
        partnerId: keyData.partnerId,
      });
      res.status(400).json({ error: error.message, traceId });
      return;
    }

    // Fetch spot data
    const spotDoc = await db.collection('spots').doc(spotId).get();

    if (!spotDoc.exists) {
      logRequest(traceId, 'b2bGetSpotData', keyData.partnerId, Date.now() - startTime, 404, { error: 'Spot not found', spotId });
      void recordBackendPerf('b2b_spot_data', Date.now() - startTime, false, {
        statusCode: 404,
        reason: 'spot_not_found',
        partnerId: keyData.partnerId,
      });
      res.status(404).json({ error: 'Spot not found', traceId });
      return;
    }

    const spotData = spotDoc.data()!;

    // Get recent check-ins for real-time metrics
    const checkinsSnapshot = await db
      .collection('checkins')
      .where('spotPlaceId', '==', spotId)
      .orderBy('createdAt', 'desc')
      .limit(B2B_SPOT_CHECKIN_LIMIT)
      .get();

    let totalWifi = 0;
    let totalNoise = 0;
    let totalBusyness = 0;
    let wifiCount = 0;
    let noiseCount = 0;
    let busynessCount = 0;

    checkinsSnapshot.forEach((doc: any) => {
      const checkin = doc.data();
      const wifi = normalizeWifiMetric(checkin.wifiSpeed ?? checkin.wifiQuality);
      const noise = normalizeNoiseMetric(checkin.noiseLevel ?? checkin.noise);
      const busyness = normalizeBusynessMetric(checkin.busyness);
      if (wifi !== null) {
        totalWifi += wifi;
        wifiCount++;
      }
      if (noise !== null) {
        totalNoise += noise;
        noiseCount++;
      }
      if (busyness !== null) {
        totalBusyness += busyness;
        busynessCount++;
      }
    });

    const metrics = {
      avgWifi: wifiCount > 0 ? totalWifi / wifiCount : null,
      avgNoise: noiseCount > 0 ? totalNoise / noiseCount : null,
      avgBusyness: busynessCount > 0 ? totalBusyness / busynessCount : null,
      totalCheckins: checkinsSnapshot.size,
    };

    // Usage already incremented in transaction above

    const responseTimeMs = Date.now() - startTime;

    // Log structured request
    logRequest(traceId, 'b2bGetSpotData', keyData.partnerId, responseTimeMs, 200, { spotId, checkins: checkinsSnapshot.size });
    void recordBackendPerf('b2b_spot_data', responseTimeMs, true, {
      statusCode: 200,
      partnerId: keyData.partnerId,
      spotId,
      checkins: checkinsSnapshot.size,
    });

    // Log usage metrics to Firestore
    await db.collection('b2bMetrics').add({
      traceId,
      partnerId: keyData.partnerId,
      endpoint: 'getSpotData',
      spotId,
      timestamp: now,
      responseTimeMs,
      statusCode: 200,
    });

    res.status(200).json({
      spot: {
        id: spotDoc.id,
        name: spotData.name,
        location: spotData.location,
        address: spotData.address,
        type: spotData.type,
        ...metrics,
      },
      traceId,
    });
  } catch (error) {
    logger.error('Error in b2bGetSpotData', { traceId, error, stack: (error as Error).stack });
    logRequest(traceId, 'b2bGetSpotData', 'unknown', Date.now() - startTime, 500, { error: String(error) });
    void recordBackendPerf('b2b_spot_data', Date.now() - startTime, false, { statusCode: 500, reason: 'internal_error' });
    res.status(500).json({ error: 'Internal server error', traceId });
  }
});

/**
 * Get nearby spots by busyness with API key authentication
 * HTTPS request endpoint with rate limiting
 */
export const b2bGetNearbySpots = functions.https.onRequest(async (req, res) => {
  // Generate trace ID for request tracking
  const traceId = generateTraceId();
  const startTime = Date.now();

  // CORS with origin whitelist
  setCorsHeaders(req, res);
  res.set('X-Trace-Id', traceId);

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed', traceId });
    return;
  }

  // Validate API key
  const apiKey = req.get('X-API-Key') || '';
  if (!apiKey) {
    void recordBackendPerf('b2b_nearby_spots', Date.now() - startTime, false, { statusCode: 401, reason: 'missing_api_key' });
    res.status(401).json({ error: 'Missing API key', traceId });
    return;
  }

  try {
    // Get API key data
    const keyRecord = await resolveApiKeyRecord(apiKey);
    if (!keyRecord) {
      logRequest(traceId, 'b2bGetNearbySpots', 'unknown', Date.now() - startTime, 401, { error: 'Invalid API key' });
      void recordBackendPerf('b2b_nearby_spots', Date.now() - startTime, false, { statusCode: 401, reason: 'invalid_api_key' });
      res.status(401).json({ error: 'Invalid API key', traceId });
      return;
    }

    const keyDocRef = keyRecord.ref;
    const keyData = keyRecord.data;

    if (!keyData.active) {
      logRequest(traceId, 'b2bGetNearbySpots', keyData.partnerId, Date.now() - startTime, 403, { error: 'API key inactive' });
      void recordBackendPerf('b2b_nearby_spots', Date.now() - startTime, false, {
        statusCode: 403,
        reason: 'api_key_inactive',
        partnerId: keyData.partnerId,
      });
      res.status(403).json({ error: 'API key inactive', traceId });
      return;
    }

    // Check endpoint permission
    if (!keyData.permissions?.nearbySpots) {
      logRequest(traceId, 'b2bGetNearbySpots', keyData.partnerId, Date.now() - startTime, 403, { error: 'Permission denied' });
      void recordBackendPerf('b2b_nearby_spots', Date.now() - startTime, false, {
        statusCode: 403,
        reason: 'missing_permission',
        partnerId: keyData.partnerId,
      });
      res.status(403).json({ error: 'Forbidden: nearbySpots permission required', traceId });
      return;
    }

    // Check rate limit with transaction to prevent race conditions
    const now = Date.now();

    try {
      await db.runTransaction(async (transaction) => {
        const freshKeyDoc = await transaction.get(keyDocRef);
        const freshData = freshKeyDoc.data()!;

        const hoursSinceReset = (now - (freshData.lastResetAt || 0)) / (1000 * 60 * 60);

        if (hoursSinceReset >= 1) {
          // Reset usage counter
          transaction.update(keyDocRef, {
            currentUsage: 1,
            lastResetAt: now,
          });
          return { currentUsage: 1, rateLimit: freshData.rateLimit };
        } else {
          // Check if rate limit would be exceeded
          if (freshData.currentUsage >= freshData.rateLimit) {
            throw new Error('RATE_LIMIT_EXCEEDED');
          }
          // Increment usage
          transaction.update(keyDocRef, {
            currentUsage: admin.firestore.FieldValue.increment(1),
          });
          return { currentUsage: freshData.currentUsage + 1, rateLimit: freshData.rateLimit };
        }
      });
    } catch (error: any) {
      if (error.message === 'RATE_LIMIT_EXCEEDED') {
        const hoursSinceReset = (now - (keyData.lastResetAt || 0)) / (1000 * 60 * 60);
        const retryAfter = Math.ceil(3600 - (hoursSinceReset * 3600));
        logRequest(traceId, 'b2bGetNearbySpots', keyData.partnerId, Date.now() - startTime, 429, { error: 'Rate limit exceeded', retryAfter });
        void recordBackendPerf('b2b_nearby_spots', Date.now() - startTime, false, {
          statusCode: 429,
          reason: 'rate_limit',
          partnerId: keyData.partnerId,
        });
        res.status(429).json({ error: 'Rate limit exceeded', retryAfter, traceId });
        return;
      }
      throw error;
    }

    // Validate request body
    let lat: number;
    let lng: number;
    let radius: number;
    try {
      const validated = validateRequest<{ lat: number; lng: number; radius: number }>(nearbySchema, req.body);
      lat = validated.lat;
      lng = validated.lng;
      radius = validated.radius;
    } catch (error: any) {
      logRequest(traceId, 'b2bGetNearbySpots', keyData.partnerId, Date.now() - startTime, 400, { error: error.message });
      void recordBackendPerf('b2b_nearby_spots', Date.now() - startTime, false, {
        statusCode: 400,
        reason: 'invalid_input',
        partnerId: keyData.partnerId,
      });
      res.status(400).json({ error: error.message, traceId });
      return;
    }

    // Basic distance filter (bounded scan)
    const spotsSnapshot = await db.collection('spots').limit(B2B_NEARBY_SPOT_SCAN_LIMIT).get();
    const nearbyCandidates: Array<{ id: string; name: string; location: { lat: number; lng: number }; distance: number }> = [];

    spotsSnapshot.forEach((doc: any) => {
      const spot = doc.data();
      const coords = readSpotCoords(spot);
      if (!coords) return;
      const distance = calculateDistance(lat, lng, coords.lat, coords.lng);
      if (distance > radius) return;
      nearbyCandidates.push({
        id: doc.id,
        name: spot.name || 'Unknown Spot',
        location: coords,
        distance,
      });
    });

    // Keep nearest candidates to cap aggregation work.
    nearbyCandidates.sort((a, b) => a.distance - b.distance);
    const cappedCandidates = nearbyCandidates.slice(0, B2B_NEARBY_CANDIDATE_LIMIT);

    type SpotAgg = { totalBusyness: number; busynessCount: number; recentCheckins: number };
    const windowStart = now - B2B_NEARBY_WINDOW_MS;
    const bySpot = new Map<string, SpotAgg>();
    const candidateIds = cappedCandidates.map((spot) => spot.id);

    // Batch load checkins by spot groups to remove N+1 queries.
    for (const chunk of chunkArray(candidateIds, B2B_NEARBY_IN_MAX)) {
      if (!chunk.length) continue;
      const chunkSet = new Set(chunk);

      let checkinsSnapshot: FirebaseFirestore.QuerySnapshot;
      try {
        checkinsSnapshot = await db
          .collection('checkins')
          .where('spotPlaceId', 'in', chunk)
          .orderBy('createdAt', 'desc')
          .limit(B2B_NEARBY_BATCH_QUERY_LIMIT)
          .get();
      } catch {
        // Fallback for datasets that still rely on legacy timestamp field.
        checkinsSnapshot = await db
          .collection('checkins')
          .where('spotPlaceId', 'in', chunk)
          .orderBy('timestamp', 'desc')
          .limit(B2B_NEARBY_BATCH_QUERY_LIMIT)
          .get();
      }

      checkinsSnapshot.forEach((doc: any) => {
        const checkin = doc.data();
        const spotId = asId(checkin.spotPlaceId || checkin.spotId);
        if (!chunkSet.has(spotId)) return;
        const checkinTimeMs = readCheckinTimeMs(checkin);
        if (checkinTimeMs !== null && checkinTimeMs < windowStart) return;

        const agg = bySpot.get(spotId) || { totalBusyness: 0, busynessCount: 0, recentCheckins: 0 };
        agg.recentCheckins += 1;

        const busyness = normalizeBusynessMetric(checkin.busyness);
        if (busyness !== null) {
          agg.totalBusyness += busyness;
          agg.busynessCount += 1;
        }
        bySpot.set(spotId, agg);
      });
    }

    const spotsWithBusyness = cappedCandidates.map((spot) => {
      const agg = bySpot.get(spot.id);
      return {
        id: spot.id,
        name: spot.name,
        location: spot.location,
        distance: spot.distance,
        busyness: agg && agg.busynessCount > 0 ? agg.totalBusyness / agg.busynessCount : null,
        recentCheckins: agg?.recentCheckins || 0,
      };
    });

    // Sort by busyness (lower = better)
    spotsWithBusyness.sort((a, b) => {
      if (a.busyness === null && b.busyness === null) return a.distance - b.distance;
      if (a.busyness === null) return 1;
      if (b.busyness === null) return -1;
      return a.busyness - b.busyness;
    });

    // Usage already incremented in transaction above

    const responseTimeMs = Date.now() - startTime;

    // Log structured request
    logRequest(traceId, 'b2bGetNearbySpots', keyData.partnerId, responseTimeMs, 200, { lat, lng, radius, spotsFound: spotsWithBusyness.length });
    void recordBackendPerf('b2b_nearby_spots', responseTimeMs, true, {
      statusCode: 200,
      partnerId: keyData.partnerId,
      spotsFound: spotsWithBusyness.length,
      candidatesScanned: spotsSnapshot.size,
    });

    // Log usage metrics to Firestore
    await db.collection('b2bMetrics').add({
      traceId,
      partnerId: keyData.partnerId,
      endpoint: 'getNearbySpots',
      lat,
      lng,
      radius,
      timestamp: now,
      responseTimeMs,
      statusCode: 200,
    });

    res.status(200).json({ spots: spotsWithBusyness.slice(0, 20), traceId });
  } catch (error) {
    logger.error('Error in b2bGetNearbySpots', { traceId, error, stack: (error as Error).stack });
    logRequest(traceId, 'b2bGetNearbySpots', 'unknown', Date.now() - startTime, 500, { error: String(error) });
    void recordBackendPerf('b2b_nearby_spots', Date.now() - startTime, false, { statusCode: 500, reason: 'internal_error' });
    res.status(500).json({ error: 'Internal server error', traceId });
  }
});

/**
 * Get API usage statistics for partner dashboard
 * Callable function that requires partner ownership verification
 */
export const b2bGetUsageStats = functions.https.onCall(async (data, context) => {
  // Verify auth
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
  }

  const { partnerId, timeRangeMs = 7 * 24 * 60 * 60 * 1000 } = data;

  if (!partnerId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing partnerId');
  }

  try {
    // Verify ownership (partner can only see their own stats)
    const keyDoc = await db.collection('apiKeys').doc(partnerId).get();

    if (!keyDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Partner not found');
    }

    const keyData = keyDoc.data()!;

    // Admin can see all, partner can only see their own
    const isAdmin = context.auth.token.admin;
    if (!isAdmin && context.auth.uid !== keyData.partnerId) {
      throw new functions.https.HttpsError('permission-denied', 'Access denied');
    }

    // Get usage metrics
    const startTime = Date.now() - timeRangeMs;
    const metricsSnapshot = await db
      .collection('b2bMetrics')
      .where('partnerId', '==', partnerId)
      .where('timestamp', '>=', startTime)
      .orderBy('timestamp', 'desc')
      .get();

    const metrics: any[] = [];
    let totalRequests = 0;
    let totalErrors = 0;
    const endpointCounts: Record<string, number> = {};

    metricsSnapshot.forEach((doc: any) => {
      const metric = doc.data();
      metrics.push(metric);
      totalRequests++;
      if (metric.statusCode >= 400) totalErrors++;
      endpointCounts[metric.endpoint] = (endpointCounts[metric.endpoint] || 0) + 1;
    });

    const stats = {
      partnerId,
      partnerName: keyData.partnerName,
      tier: keyData.tier,
      rateLimit: keyData.rateLimit,
      currentUsage: keyData.currentUsage,
      timeRange: {
        start: startTime,
        end: Date.now(),
        durationMs: timeRangeMs,
      },
      totalRequests,
      totalErrors,
      errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
      endpointBreakdown: endpointCounts,
      recentMetrics: metrics.slice(0, 100),
    };

    return { success: true, stats };
  } catch (error) {
    console.error('Error in b2bGetUsageStats:', error);
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', 'Failed to get usage stats');
  }
});

/**
 * Helper: Calculate distance between two coordinates in meters
 */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Send a push notification using Firebase Cloud Messaging
 */
async function sendPushNotification(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>
): Promise<void> {
  try {
    const message = {
      notification: {
        title,
        body,
      },
      data: data || {},
      token,
    };

    await admin.messaging().send(message);
    console.log(`Push notification sent: ${title}`);
  } catch (error) {
    console.error('Error sending push notification:', error);
    throw error;
  }
}

/**
 * Scheduled function to send weekly recap notifications
 * Runs every Sunday at 6pm
 */
export const sendWeeklyRecap = functions.pubsub
  .schedule('0 18 * * 0') // Every Sunday at 6pm
  .timeZone('America/Chicago')
  .onRun(async (_context) => {
    try {
      const pushTokensSnapshot = await db.collection(PUSH_TOKENS_COLLECTION).get();
      const tokenDocs: Array<{ ref: FirebaseFirestore.DocumentReference; token: string }> = [];
      pushTokensSnapshot.forEach((doc) => {
        const token = normalizePushToken(doc.data()?.token);
        if (token) tokenDocs.push({ ref: doc.ref, token });
      });

      const tokens = tokenDocs.map((entry) => entry.token);

      if (tokens.length === 0) {
        console.log('No users with push tokens');
        return null;
      }

      const dedupedTokens = Array.from(new Set(tokens));
      const invalidTokens = new Set<string>();
      const chunkSize = 500;
      let successCount = 0;
      let failureCount = 0;

      for (let i = 0; i < dedupedTokens.length; i += chunkSize) {
        const chunk = dedupedTokens.slice(i, i + chunkSize);
        const response = await admin.messaging().sendEachForMulticast({
          notification: {
            title: 'Your Weekly Recap',
            body: "Check out your weekly recap and see where your friends have been!",
          },
          data: {
            type: 'weekly_recap',
          },
          tokens: chunk,
        });

        successCount += response.successCount;
        failureCount += response.failureCount;

        response.responses.forEach((item, index) => {
          if (item.success) return;
          const code = item.error?.code || '';
          if (
            code === 'messaging/invalid-registration-token' ||
            code === 'messaging/registration-token-not-registered'
          ) {
            invalidTokens.add(chunk[index]);
          }
        });
      }

      if (invalidTokens.size > 0) {
        let batch = db.batch();
        let pendingOps = 0;
        for (const tokenDoc of tokenDocs) {
          if (!invalidTokens.has(tokenDoc.token)) continue;
          batch.delete(tokenDoc.ref);
          pendingOps += 1;
          if (pendingOps >= 400) {
            await batch.commit();
            batch = db.batch();
            pendingOps = 0;
          }
        }
        if (pendingOps > 0) {
          await batch.commit();
        }
      }

      console.log(
        `Weekly recap notifications: sent=${successCount}, failed=${failureCount}, invalidTokensCleared=${invalidTokens.size}`,
      );
      return { success: true, sent: successCount, failed: failureCount, invalidTokensCleared: invalidTokens.size };
    } catch (error) {
      console.error('Error sending weekly recap:', error);
      return null;
    }
  });

// =============================================================================
// SLO MONITORING & VIOLATION DETECTION
// =============================================================================

/**
 * Check for SLO violations in performance metrics
 * Scheduled to run every 5 minutes via Cloud Scheduler
 * Detects violations and writes to sloViolations collection for alerting
 */
export const checkSLOViolations = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async (context) => {
    try {
      const now = Date.now();
      const fiveMinutesAgo = now - 5 * 60 * 1000;

      // Query recent performance metrics
      const metricsSnapshot = await db.collection('performanceMetrics')
        .where('timestamp', '>', fiveMinutesAgo)
        .get();

      if (metricsSnapshot.empty) {
        console.log('No recent metrics found');
        return null;
      }

      // Aggregate metrics by operation
      const metricsByOperation = new Map<string, any[]>();

      metricsSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const operation = data.operation || 'unknown';

        if (!metricsByOperation.has(operation)) {
          metricsByOperation.set(operation, []);
        }
        metricsByOperation.get(operation)!.push(data);
      });

      // SLO definitions
      const sloTargets: Record<string, { p50: number; p95: number; p99: number; errorRate: number; priority: string }> = {
        'checkin_query': { p50: 200, p95: 500, p99: 1000, errorRate: 0.01, priority: 'critical' },
        'schema_fallback': { p50: 300, p95: 800, p99: 1500, errorRate: 0.001, priority: 'high' },
        'b2b_spot_data': { p50: 400, p95: 1000, p99: 2000, errorRate: 0.05, priority: 'high' },
        'checkin_create': { p50: 500, p95: 1200, p99: 2500, errorRate: 0.005, priority: 'critical' },
        'place_intelligence': { p50: 600, p95: 1500, p99: 3000, errorRate: 0.02, priority: 'medium' },
      };

      const violations: any[] = [];

      // Check each operation for SLO violations
      for (const [operation, metrics] of metricsByOperation.entries()) {
        const slo = sloTargets[operation];
        if (!slo) continue;

        // Aggregate metrics
        const avgP50 = metrics.reduce((sum, m) => sum + (m.p50 || 0), 0) / metrics.length;
        const avgP95 = metrics.reduce((sum, m) => sum + (m.p95 || 0), 0) / metrics.length;
        const avgP99 = metrics.reduce((sum, m) => sum + (m.p99 || 0), 0) / metrics.length;
        const avgErrorRate = metrics.reduce((sum, m) => sum + (m.errorRate || 0), 0) / metrics.length;

        // Check for violations
        const violationTypes: string[] = [];
        if (avgP50 > slo.p50) violationTypes.push('p50');
        if (avgP95 > slo.p95) violationTypes.push('p95');
        if (avgP99 > slo.p99) violationTypes.push('p99');
        if (avgErrorRate > slo.errorRate) violationTypes.push('errorRate');

        if (violationTypes.length > 0) {
          violations.push({
            operation,
            violationTypes,
            p50: avgP50,
            p95: avgP95,
            p99: avgP99,
            errorRate: avgErrorRate,
            sloTargets: slo,
            severity: violationTypes.length >= 3 ? 'high' : violationTypes.length >= 2 ? 'medium' : 'low',
            priority: slo.priority,
            timestamp: now,
            metricCount: metrics.length,
          });
        }
      }

      // Write violations to Firestore
      if (violations.length > 0) {
        const batch = db.batch();
        violations.forEach(violation => {
          const docRef = db.collection('sloViolations').doc();
          batch.set(docRef, violation);
        });
        await batch.commit();
        await sendSlackAlert(violations);

        console.log(`Detected ${violations.length} SLO violations`);
      }

      return { success: true, violations: violations.length, timestamp: now };
    } catch (error) {
      console.error('Error checking SLO violations:', error);
      return null;
    }
  });

/**
 * Send Slack alert for SLO violations
 * Called by checkSLOViolations when high-priority violations detected
 */
async function sendSlackAlert(violations: any[]): Promise<void> {
  try {
    const webhookUrl = await getCachedSecret('SLACK_WEBHOOK_URL');
    if (!webhookUrl) {
      console.warn('Slack webhook URL not configured');
      return;
    }

    const criticalViolations = violations.filter(v => v.severity === 'high' || v.priority === 'critical');
    if (criticalViolations.length === 0) return;

    const violationText = criticalViolations.map(v =>
      `• *${v.operation}*: ${v.violationTypes.join(', ')} exceeded (${v.severity} severity)\n  p95: ${Math.round(v.p95)}ms / ${v.sloTargets.p95}ms`
    ).join('\n');

    const message = {
      text: '🚨 SLO Violation Alert',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🚨 SLO Violation Detected',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${criticalViolations.length} critical violation(s)* detected in the last 5 minutes:\n\n${violationText}`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Timestamp: <!date^${Math.floor(Date.now() / 1000)}^{date_short_pretty} at {time}|${new Date().toISOString()}>`,
            },
          ],
        },
      ],
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      console.error(`Slack webhook failed: ${response.status}`);
    } else {
      console.log(`Sent Slack alert for ${criticalViolations.length} violations`);
    }
  } catch (error) {
    console.error('Error sending Slack alert:', error);
  }
}

/**
 * Phase A/B Intelligence: Update display data when check-in created
 *
 * Triggered on every check-in creation to maintain real-time blended data
 */
export const updateSpotDisplayData = functions.firestore
  .document('checkins/{checkinId}')
  .onCreate(async (snap, context) => {
    const checkin = snap.data();
    const spotId = checkin.spotPlaceId || checkin.spotId;

    if (!spotId) {
      console.warn('Check-in missing spotPlaceId/spotId, skipping display update');
      return null;
    }

    try {
      // Get spot document to access inferred intelligence
      const spotDoc = await db.collection('spots').doc(spotId).get();
      if (!spotDoc.exists) {
        console.warn(`Spot ${spotId} not found, skipping display update`);
        return null;
      }

      const spotData = spotDoc.data()!;
      const intel = spotData.intel || {};

      // Aggregate recent check-ins for live data
      const recentWindow = 7 * 24 * 60 * 60 * 1000; // 7 days
      const cutoff = Date.now() - recentWindow;
      const cutoffTimestamp = admin.firestore.Timestamp.fromMillis(cutoff);
      let recentCheckins: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>;
      try {
        recentCheckins = await db.collection('checkins')
          .where('spotPlaceId', '==', spotId)
          .where('createdAt', '>', cutoffTimestamp)
          .orderBy('createdAt', 'desc')
          .limit(20)
          .get();
      } catch {
        // Legacy fallback for older rows that only contain numeric `timestamp`.
        recentCheckins = await db.collection('checkins')
          .where('spotPlaceId', '==', spotId)
          .where('timestamp', '>', cutoff)
          .orderBy('timestamp', 'desc')
          .limit(20)
          .get();
      }

      // Calculate live aggregation
      const liveData = aggregateLiveDataFromCheckins(recentCheckins.docs.map(d => d.data()));

      // Get total check-in count (all-time) via aggregation query.
      // Fallback to previous value + 1 if aggregation is unavailable.
      let totalCount = Math.max(1, (toFiniteNumber(spotData?.live?.checkinCount) || 0) + 1);
      try {
        const countSnap = await db.collection('checkins')
          .where('spotPlaceId', '==', spotId)
          .count()
          .get();
        totalCount = Number(countSnap.data().count || totalCount);
      } catch {
        // Keep fallback value.
      }

      liveData.checkinCount = totalCount;

      // Calculate display data with weighted blending
      const displayData = calculateBlendedDisplayData(intel, liveData);

      // Validate live and display data before write (Phase 1 safety)
      const liveValidation = validateSpotLive(liveData);
      if (!liveValidation.valid) {
        console.error(`Invalid live data for spot ${spotId}:`, liveValidation.errors);
        return null;
      }

      // Validate display data structure (basic check)
      if (!displayData.noiseSource || !displayData.noiseLabel || !displayData.busynessSource || !displayData.busynessLabel) {
        console.error(`Invalid display data structure for spot ${spotId}`);
        return null;
      }

      // Update spot document with live + display fields
      await db.collection('spots').doc(spotId).set({
        live: liveData,
        display: displayData,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });

      console.log(`Updated display data for spot ${spotId} (${totalCount} total check-ins)`);
      return { success: true, spotId, totalCheckins: totalCount };
    } catch (error) {
      console.error('Error updating spot display data:', error);
      return null;
    }
  });

/**
 * Helper: Aggregate live data from check-ins array
 */
function aggregateLiveDataFromCheckins(checkins: any[]): any {
  if (checkins.length === 0) {
    return {
      noise: null,
      busyness: null,
      checkinCount: 0,
      lastCheckinAt: null,
    };
  }

  // Aggregate noise (weighted by recency)
  const noiseCounts: Record<string, number> = {
    quiet: 0,
    moderate: 0,
    loud: 0,
  };

  const now = Date.now();
  checkins.forEach(checkin => {
    if (!checkin.noise) return;

    const age = now - checkin.timestamp;
    const weight = Math.exp(-age / (3.5 * 24 * 60 * 60 * 1000)); // 3.5 day half-life

    noiseCounts[checkin.noise] = (noiseCounts[checkin.noise] || 0) + weight;
  });

  const maxNoise = Math.max(noiseCounts.quiet, noiseCounts.moderate, noiseCounts.loud);
  let noise: string | null = null;
  if (maxNoise > 0) {
    if (noiseCounts.quiet === maxNoise) noise = 'quiet';
    else if (noiseCounts.moderate === maxNoise) noise = 'moderate';
    else noise = 'loud';
  }

  // Busyness: most recent only
  const busyness = checkins[0]?.busyness || null;

  return {
    noise,
    busyness,
    checkinCount: 0, // Will be set by caller
    lastCheckinAt: checkins[0]?.timestamp || null,
  };
}

/**
 * Helper: Calculate blended display data (Phase B logic)
 */
function calculateBlendedDisplayData(intel: any, live: any): any {
  const inferredNoise = intel.inferredNoise || null;
  const liveNoise = live.noise;
  const checkinCount = live.checkinCount || 0;

  // Calculate noise display
  let noise: string | null = null;
  let noiseSource: 'live' | 'inferred' | 'blended' = 'inferred';
  let noiseLabel = 'No data yet';

  if (!inferredNoise && !liveNoise) {
    noise = null;
    noiseSource = 'inferred';
    noiseLabel = 'No data yet';
  } else if (!liveNoise || checkinCount === 0) {
    // Only inferred
    noise = inferredNoise;
    noiseSource = 'inferred';
    noiseLabel = `${capitalize(inferredNoise || 'Unknown')} (inferred from reviews)`;
  } else {
    // Calculate live weight
    const wLive = Math.min(checkinCount / 10, 0.9);

    if (wLive > 0.5) {
      // High confidence in live
      noise = liveNoise;
      noiseSource = 'live';
      noiseLabel = `${capitalize(liveNoise)} (${checkinCount} check-in${checkinCount === 1 ? '' : 's'})`;
    } else {
      // Blended
      noise = liveNoise;
      noiseSource = 'blended';
      if (liveNoise === inferredNoise) {
        noiseLabel = `${capitalize(liveNoise)} (${checkinCount} check-in${checkinCount === 1 ? '' : 's'})`;
      } else {
        noiseLabel = `${capitalize(liveNoise)} (${checkinCount} check-in${checkinCount === 1 ? '' : 's'}, usually ${inferredNoise || 'varies'})`;
      }
    }
  }

  // Calculate busyness display (always live)
  const busyness = live.busyness || null;
  const busynessSource = 'live';
  let busynessLabel = 'No recent data';

  if (busyness && checkinCount > 0) {
    const label = busyness === 'empty' ? 'Empty' :
                  busyness === 'some' ? 'Some people' :
                  'Packed';
    busynessLabel = `${label} (live)`;
  }

  return {
    noise,
    noiseSource,
    noiseLabel,
    busyness,
    busynessSource,
    busynessLabel,
  };
}

/**
 * Helper: Capitalize first letter
 */
function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
