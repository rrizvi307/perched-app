/**
 * Perched Cloud Functions
 *
 * Deploy with: cd functions && npm install && npm run deploy
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import * as crypto from 'crypto';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import * as winston from 'winston';
import * as Joi from 'joi';
import { validateSpotLive } from '../../services/spotSchema';

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

const API_KEY_HASH_COLLECTION = 'apiKeyHashes';
const API_KEY_CACHE_TTL_MS = 60 * 1000;
const apiKeyCache = new Map<string, { ts: number; docId: string; data: any }>();

const B2B_SPOT_CHECKIN_LIMIT = 60;
const B2B_NEARBY_SPOT_SCAN_LIMIT = 100;
const B2B_NEARBY_CANDIDATE_LIMIT = 40;
const B2B_NEARBY_BATCH_QUERY_LIMIT = 250;
const B2B_NEARBY_IN_MAX = 10;
const B2B_NEARBY_WINDOW_MS = 2 * 60 * 60 * 1000;

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

type ApiKeyLookup = {
  docId: string;
  ref: FirebaseFirestore.DocumentReference;
  data: any;
};

async function resolveApiKeyRecord(apiKey: string): Promise<ApiKeyLookup | null> {
  const key = typeof apiKey === 'string' ? apiKey.trim() : '';
  if (!key) return null;

  const cached = apiKeyCache.get(key);
  const now = Date.now();
  if (cached && now - cached.ts < API_KEY_CACHE_TTL_MS) {
    return {
      docId: cached.docId,
      ref: db.collection('apiKeys').doc(cached.docId),
      data: cached.data,
    };
  }

  const keyHash = hashApiKey(key);

  try {
    const hashDoc = await db.collection(API_KEY_HASH_COLLECTION).doc(keyHash).get();
    const partnerId = asId(hashDoc.data()?.partnerId);
    if (partnerId) {
      const keyDoc = await db.collection('apiKeys').doc(partnerId).get();
      if (keyDoc.exists) {
        const keyData = keyDoc.data() || {};
        if (keyData.key === key) {
          apiKeyCache.set(key, { ts: now, docId: keyDoc.id, data: keyData });
          return { docId: keyDoc.id, ref: keyDoc.ref, data: keyData };
        }
      }
    }
  } catch {
    // Fall through to legacy query.
  }

  const keysSnapshot = await db.collection('apiKeys').where('key', '==', key).limit(1).get();
  if (keysSnapshot.empty) return null;

  const keyDoc = keysSnapshot.docs[0];
  const keyData = keyDoc.data() || {};
  apiKeyCache.set(key, { ts: now, docId: keyDoc.id, data: keyData });

  // Self-heal hash lookup index for subsequent fast lookups.
  void db.collection(API_KEY_HASH_COLLECTION).doc(keyHash).set(
    {
      partnerId: keyDoc.id,
      updatedAt: Date.now(),
    },
    { merge: true },
  ).catch(() => {});

  return { docId: keyDoc.id, ref: keyDoc.ref, data: keyData };
}

function asId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
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
    const pushTokenDoc = await db.collection('pushTokens').doc(userId).get();
    const scopedToken = normalizePushToken(pushTokenDoc.data()?.token);
    if (scopedToken) return scopedToken;
  } catch {}

  // Legacy fallback during migration period.
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    return normalizePushToken(userDoc.data()?.pushToken);
  } catch {
    return null;
  }
}

async function getPushTokensForUsers(userIds: string[]): Promise<string[]> {
  const ids = normalizeIdList(userIds).slice(0, 100);
  if (!ids.length) return [];
  const tokens: string[] = [];

  const scopedDocs = await Promise.all(ids.map((userId) => db.collection('pushTokens').doc(userId).get()));
  const unresolved: string[] = [];

  scopedDocs.forEach((doc, index) => {
    const token = normalizePushToken(doc.data()?.token);
    if (token) {
      tokens.push(token);
      return;
    }
    unresolved.push(ids[index]);
  });

  if (unresolved.length) {
    const legacyDocs = await Promise.all(unresolved.map((userId) => db.collection('users').doc(userId).get()));
    legacyDocs.forEach((doc) => {
      const token = normalizePushToken(doc.data()?.pushToken);
      if (token) tokens.push(token);
    });
  }

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
    const { referralCode, status } = data;

    if (status !== 'pending') {
      return null;
    }

    try {
      // Find the referrer by their referral code
      // Referral codes are based on user handles or user IDs
      const usersSnapshot = await db.collection('users')
        .where('handle', '==', referralCode.toLowerCase())
        .limit(1)
        .get();

      let referrerId: string | null = null;

      if (!usersSnapshot.empty) {
        referrerId = usersSnapshot.docs[0].id;
      } else {
        // Try finding by partial user ID match
        const usersByIdSnapshot = await db.collection('users')
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

      // Credit the referrer with 1 week of premium
      const PREMIUM_WEEKS_PER_REFERRAL = 1;
      const premiumDays = PREMIUM_WEEKS_PER_REFERRAL * 7;

      const referrerDoc = await db.collection('users').doc(referrerId).get();
      const referrerData = referrerDoc.data() || {};

      // Calculate new premium expiration
      const currentPremiumUntil = referrerData.premiumUntil?.toDate() || new Date();
      const now = new Date();
      const baseDate = currentPremiumUntil > now ? currentPremiumUntil : now;
      const newPremiumUntil = new Date(baseDate.getTime() + premiumDays * 24 * 60 * 60 * 1000);

      // Update referrer's premium status
      await db.collection('users').doc(referrerId).update({
        premiumUntil: admin.firestore.Timestamp.fromDate(newPremiumUntil),
        totalReferrals: admin.firestore.FieldValue.increment(1),
        premiumWeeksEarned: admin.firestore.FieldValue.increment(PREMIUM_WEEKS_PER_REFERRAL),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Update referral status
      await snap.ref.update({
        status: 'credited',
        referrerId,
        premiumWeeksAwarded: PREMIUM_WEEKS_PER_REFERRAL,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

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

type SocialGraphAction =
  | 'send_friend_request'
  | 'accept_friend_request'
  | 'decline_friend_request'
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
    const actorUserRef = db.collection('users').doc(actorId);
    const targetUserRef = db.collection('users').doc(targetUserId);
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
        tx.set(actorUserRef, { friends: admin.firestore.FieldValue.arrayUnion(targetUserId) }, { merge: true });
        tx.set(targetUserRef, { friends: admin.firestore.FieldValue.arrayUnion(actorId) }, { merge: true });
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

      tx.set(db.collection('users').doc(toId), { friends: admin.firestore.FieldValue.arrayUnion(fromId) }, { merge: true });
      tx.set(db.collection('users').doc(fromId), { friends: admin.firestore.FieldValue.arrayUnion(toId) }, { merge: true });
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

  if (action === 'unfriend') {
    const targetUserId = asId(data?.targetUserId);
    if (!targetUserId || targetUserId === actorId) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid target user');
    }

    await db.runTransaction(async (tx) => {
      tx.set(
        db.collection('users').doc(actorId),
        {
          friends: admin.firestore.FieldValue.arrayRemove(targetUserId),
          closeFriends: admin.firestore.FieldValue.arrayRemove(targetUserId),
        },
        { merge: true }
      );
      tx.set(
        db.collection('users').doc(targetUserId),
        {
          friends: admin.firestore.FieldValue.arrayRemove(actorId),
          closeFriends: admin.firestore.FieldValue.arrayRemove(actorId),
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
        db.collection('users').doc(actorId),
        {
          blocked: admin.firestore.FieldValue.arrayUnion(targetUserId),
          friends: admin.firestore.FieldValue.arrayRemove(targetUserId),
          closeFriends: admin.firestore.FieldValue.arrayRemove(targetUserId),
        },
        { merge: true }
      );
      tx.set(
        db.collection('users').doc(targetUserId),
        {
          friends: admin.firestore.FieldValue.arrayRemove(actorId),
          closeFriends: admin.firestore.FieldValue.arrayRemove(actorId),
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

    await db.collection('users').doc(actorId).set(
      { blocked: admin.firestore.FieldValue.arrayRemove(targetUserId) },
      { merge: true }
    );
    return { ok: true, status: 'unblocked', targetUserId };
  }

  throw new functions.https.HttpsError('invalid-argument', `Unsupported action: ${action}`);
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
      const senderDoc = await db.collection('users').doc(fromId).get();
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
      const [accepterDoc, senderDoc] = await Promise.all([
        db.collection('users').doc(toId).get(),
        db.collection('users').doc(fromId).get(),
      ]);
      const accepterData = accepterDoc.data() || {};
      const senderData = senderDoc.data() || {};

      // Guard: only notify if friendship is now mutual.
      const accepterFriends = normalizeIdList(accepterData.friends);
      const senderFriends = normalizeIdList(senderData.friends);
      const isMutual = accepterFriends.includes(fromId) && senderFriends.includes(toId);
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
      const posterDoc = await db.collection('users').doc(userId).get();
      const posterData = posterDoc.data() || {};
      const posterName = posterData.name || posterData.handle || 'Someone';
      const posterFriends = posterData.friends || [];

      if (posterFriends.length === 0) {
        return null;
      }

      // Get close friends if visibility is 'close'
      let targetFriends = posterFriends;
      if (visibility === 'close') {
        targetFriends = posterData.closeFriends || [];
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

type ExternalSource = 'foursquare' | 'yelp';
type ExternalPlaceSignal = {
  source: ExternalSource;
  rating?: number;
  reviewCount?: number;
  priceLevel?: string;
  categories?: string[];
};

const PLACE_SIGNAL_TTL_MS = 30 * 60 * 1000;
const placeSignalCache = new Map<string, { ts: number; payload: ExternalPlaceSignal[] }>();
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
  try {
    const direct = functions.config();
    if (direct && typeof direct === 'object' && Object.keys(direct).length > 0) {
      return direct;
    }
  } catch {
    // Ignore and fallback below.
  }
  return parseCloudRuntimeConfig();
})();

function readFirstNonEmpty(...values: Array<string | undefined>) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return '';
}

function parsePriceLevel(value?: string) {
  if (!value) return undefined;
  const next = value.trim();
  return next ? next : undefined;
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

function parseExternalSignals(payload: unknown): ExternalPlaceSignal[] {
  if (!Array.isArray(payload)) return [];
  return payload.filter(Boolean);
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
    rating: typeof place.rating === 'number' ? place.rating : undefined,
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

export const placeSignalsProxy = functions
  .runWith({ secrets: ['YELP_API_KEY', 'FOURSQUARE_API_KEY'] })
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
  const requireAppCheck = ['1', 'true', 'yes', 'on'].includes(requireAppCheckRaw.toLowerCase());

  // Temporary fail-safe: disable Foursquare provider unless explicitly enabled.
  const enableFoursquareRaw = readFirstNonEmpty(
    process.env.PLACE_INTEL_ENABLE_FOURSQUARE,
    runtimeConfig?.places?.enable_foursquare,
  );
  const enableFoursquare = ['1', 'true', 'yes', 'on'].includes((enableFoursquareRaw || '').toLowerCase());

  if (!hasSecretBypass) {
    const uid = await verifyFirebaseUserFromRequest(req);
    if (requireAuth && !uid) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const providedAppCheck = req.get('X-Firebase-AppCheck') || '';
    if (requireAppCheck || providedAppCheck) {
      const appCheckOk = await verifyAppCheckFromRequest(req);
      if (!appCheckOk) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
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
  const lat = typeof body?.location?.lat === 'number' ? body.location.lat : null;
  const lng = typeof body?.location?.lng === 'number' ? body.location.lng : null;

  if (!placeName || typeof lat !== 'number' || typeof lng !== 'number') {
    res.status(400).json({ error: 'Missing placeName/location' });
    return;
  }

  const cacheKey = `${placeName.toLowerCase()}:${lat.toFixed(3)}:${lng.toFixed(3)}:fsq${enableFoursquare ? '1' : '0'}`;
  const cached = placeSignalCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < PLACE_SIGNAL_TTL_MS) {
    res.status(200).json({ externalSignals: cached.payload, cacheHit: true });
    return;
  }

  try {
    const [foursquare, yelp] = await Promise.all([
      enableFoursquare ? fetchFoursquareSignalServer(placeName, lat, lng) : Promise.resolve(null),
      fetchYelpSignalServer(placeName, lat, lng),
    ]);
    const externalSignals = parseExternalSignals([foursquare, yelp]);
    placeSignalCache.set(cacheKey, { ts: Date.now(), payload: externalSignals });
    res.status(200).json({ externalSignals, cacheHit: false });
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
      key: apiKey,
      keyHash: hashApiKey(apiKey),
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
    const hashRef = db.collection(API_KEY_HASH_COLLECTION).doc(keyData.keyHash);
    batch.set(keyRef, keyData);
    batch.set(hashRef, {
      partnerId,
      updatedAt: Date.now(),
    }, { merge: true });
    await batch.commit();

    apiKeyCache.set(apiKey, { ts: Date.now(), docId: partnerId, data: keyData });

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
      // Primary source: scoped push tokens collection.
      const pushTokensSnapshot = await db.collection('pushTokens').get();
      const tokenDocs: Array<{ ref: FirebaseFirestore.DocumentReference; token: string }> = [];
      pushTokensSnapshot.forEach((doc) => {
        const token = normalizePushToken(doc.data()?.token);
        if (token) tokenDocs.push({ ref: doc.ref, token });
      });

      // Legacy fallback while migrating from users.pushToken.
      const usersSnapshot = await db.collection('users').where('pushToken', '!=', null).get();
      const legacyTokenDocs: Array<{ ref: FirebaseFirestore.DocumentReference; token: string }> = [];
      usersSnapshot.forEach((doc) => {
        const token = normalizePushToken(doc.data()?.pushToken);
        if (token) legacyTokenDocs.push({ ref: doc.ref, token });
      });

      const tokens = [
        ...tokenDocs.map((entry) => entry.token),
        ...legacyTokenDocs.map((entry) => entry.token),
      ];

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
        for (const userDoc of legacyTokenDocs) {
          if (!invalidTokens.has(userDoc.token)) continue;
          batch.update(userDoc.ref, {
            pushToken: admin.firestore.FieldValue.delete(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
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

      const recentCheckins = await db.collection('checkins')
        .where('spotPlaceId', '==', spotId)
        .where('timestamp', '>', cutoff)
        .orderBy('timestamp', 'desc')
        .limit(20)
        .get();

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
