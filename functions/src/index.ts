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
      const referrerPushToken = referrerData.pushToken;
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
      const recipientDoc = await db.collection('users').doc(toId).get();
      const recipientData = recipientDoc.data() || {};
      const recipientToken = recipientData.pushToken;

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
      // Get the accepter's info
      const accepterDoc = await db.collection('users').doc(toId).get();
      const accepterData = accepterDoc.data() || {};
      const accepterName = accepterData.name || accepterData.handle || 'Someone';

      // Get the original sender's push token
      const senderDoc = await db.collection('users').doc(fromId).get();
      const senderData = senderDoc.data() || {};
      const senderToken = senderData.pushToken;

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

      // Batch get friend documents to get their push tokens
      const friendDocs = await Promise.all(
        targetFriends.slice(0, 50).map((friendId: string) =>
          db.collection('users').doc(friendId).get()
        )
      );

      const tokens: string[] = [];
      friendDocs.forEach((doc) => {
        const friendData = doc.data();
        if (friendData?.pushToken) {
          tokens.push(friendData.pushToken);
        }
      });

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

function withCors(res: any) {
  res.set('Access-Control-Allow-Origin', '*');
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
  .runWith({ secrets: ['YELP_API_KEY'] })
  .https.onRequest(async (req, res) => {
  withCors(res);
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

    await db.collection('apiKeys').doc(partnerId).set(keyData);

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
  const apiKey = req.get('X-API-Key') || (req.query.apiKey as string) || '';
  if (!apiKey) {
    res.status(401).json({ error: 'Missing API key', traceId });
    return;
  }

  try {
    // Get API key data
    const keysSnapshot = await db.collection('apiKeys').where('key', '==', apiKey).limit(1).get();

    if (keysSnapshot.empty) {
      logRequest(traceId, 'b2bGetSpotData', 'unknown', Date.now() - startTime, 401, { error: 'Invalid API key' });
      res.status(401).json({ error: 'Invalid API key', traceId });
      return;
    }

    const keyDoc = keysSnapshot.docs[0];
    const keyData = keyDoc.data();

    if (!keyData.active) {
      logRequest(traceId, 'b2bGetSpotData', keyData.partnerId, Date.now() - startTime, 403, { error: 'API key inactive' });
      res.status(403).json({ error: 'API key inactive', traceId });
      return;
    }

    // Check endpoint permission
    if (!keyData.permissions?.spotData) {
      logRequest(traceId, 'b2bGetSpotData', keyData.partnerId, Date.now() - startTime, 403, { error: 'Permission denied' });
      res.status(403).json({ error: 'Forbidden: spotData permission required', traceId });
      return;
    }

    // Check rate limit with transaction to prevent race conditions
    const now = Date.now();

    try {
      await db.runTransaction(async (transaction) => {
        const freshKeyDoc = await transaction.get(keyDoc.ref);
        const freshData = freshKeyDoc.data()!;

        const hoursSinceReset = (now - (freshData.lastResetAt || 0)) / (1000 * 60 * 60);

        if (hoursSinceReset >= 1) {
          // Reset usage counter
          transaction.update(keyDoc.ref, {
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
          transaction.update(keyDoc.ref, {
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
      res.status(400).json({ error: error.message, traceId });
      return;
    }

    // Fetch spot data
    const spotDoc = await db.collection('spots').doc(spotId).get();

    if (!spotDoc.exists) {
      logRequest(traceId, 'b2bGetSpotData', keyData.partnerId, Date.now() - startTime, 404, { error: 'Spot not found', spotId });
      res.status(404).json({ error: 'Spot not found', traceId });
      return;
    }

    const spotData = spotDoc.data()!;

    // Get recent check-ins for real-time metrics
    const checkinsSnapshot = await db
      .collection('checkins')
      .where('spotPlaceId', '==', spotId)
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    let totalWifi = 0;
    let totalNoise = 0;
    let totalBusyness = 0;
    let wifiCount = 0;
    let noiseCount = 0;
    let busynessCount = 0;

    checkinsSnapshot.forEach((doc: any) => {
      const checkin = doc.data();
      if (typeof checkin.wifiQuality === 'number') {
        totalWifi += checkin.wifiQuality;
        wifiCount++;
      }
      if (typeof checkin.noise === 'number') {
        totalNoise += checkin.noise;
        noiseCount++;
      }
      if (typeof checkin.busyness === 'number') {
        totalBusyness += checkin.busyness;
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
    res.status(401).json({ error: 'Missing API key', traceId });
    return;
  }

  try {
    // Get API key data
    const keysSnapshot = await db.collection('apiKeys').where('key', '==', apiKey).limit(1).get();

    if (keysSnapshot.empty) {
      logRequest(traceId, 'b2bGetNearbySpots', 'unknown', Date.now() - startTime, 401, { error: 'Invalid API key' });
      res.status(401).json({ error: 'Invalid API key', traceId });
      return;
    }

    const keyDoc = keysSnapshot.docs[0];
    const keyData = keyDoc.data();

    if (!keyData.active) {
      logRequest(traceId, 'b2bGetNearbySpots', keyData.partnerId, Date.now() - startTime, 403, { error: 'API key inactive' });
      res.status(403).json({ error: 'API key inactive', traceId });
      return;
    }

    // Check endpoint permission
    if (!keyData.permissions?.nearbySpots) {
      logRequest(traceId, 'b2bGetNearbySpots', keyData.partnerId, Date.now() - startTime, 403, { error: 'Permission denied' });
      res.status(403).json({ error: 'Forbidden: nearbySpots permission required', traceId });
      return;
    }

    // Check rate limit with transaction to prevent race conditions
    const now = Date.now();

    try {
      await db.runTransaction(async (transaction) => {
        const freshKeyDoc = await transaction.get(keyDoc.ref);
        const freshData = freshKeyDoc.data()!;

        const hoursSinceReset = (now - (freshData.lastResetAt || 0)) / (1000 * 60 * 60);

        if (hoursSinceReset >= 1) {
          // Reset usage counter
          transaction.update(keyDoc.ref, {
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
          transaction.update(keyDoc.ref, {
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
      res.status(400).json({ error: error.message, traceId });
      return;
    }

    // Simple geohash-based query (in production, use proper geospatial queries)
    // For now, just get all spots and filter by distance
    const spotsSnapshot = await db.collection('spots').limit(100).get();

    const nearbySpots: any[] = [];
    const spotIds: string[] = [];

    spotsSnapshot.forEach((doc: any) => {
      const spot = doc.data();
      const spotLat = spot.location?.latitude || spot.location?.lat;
      const spotLng = spot.location?.longitude || spot.location?.lng;

      if (typeof spotLat === 'number' && typeof spotLng === 'number') {
        const distance = calculateDistance(lat, lng, spotLat, spotLng);
        if (distance <= radius) {
          nearbySpots.push({ id: doc.id, ...spot, distance });
          spotIds.push(doc.id);
        }
      }
    });

    // Get busyness data for each spot
    const spotsWithBusyness = await Promise.all(
      nearbySpots.map(async (spot) => {
        const checkinsSnapshot = await db
          .collection('checkins')
          .where('spotPlaceId', '==', spot.id)
          .where('createdAt', '>=', now - 2 * 60 * 60 * 1000) // Last 2 hours
          .get();

        let totalBusyness = 0;
        let busynessCount = 0;

        checkinsSnapshot.forEach((doc: any) => {
          const checkin = doc.data();
          if (typeof checkin.busyness === 'number') {
            totalBusyness += checkin.busyness;
            busynessCount++;
          }
        });

        return {
          id: spot.id,
          name: spot.name,
          location: { lat: spot.location?.latitude || spot.location?.lat, lng: spot.location?.longitude || spot.location?.lng },
          distance: spot.distance,
          busyness: busynessCount > 0 ? totalBusyness / busynessCount : null,
          recentCheckins: checkinsSnapshot.size,
        };
      })
    );

    // Sort by busyness (lower = better)
    spotsWithBusyness.sort((a, b) => {
      if (a.busyness === null) return 1;
      if (b.busyness === null) return -1;
      return a.busyness - b.busyness;
    });

    // Usage already incremented in transaction above

    const responseTimeMs = Date.now() - startTime;

    // Log structured request
    logRequest(traceId, 'b2bGetNearbySpots', keyData.partnerId, responseTimeMs, 200, { lat, lng, radius, spotsFound: spotsWithBusyness.length });

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
      // Get all users with push tokens
      const usersSnapshot = await db.collection('users')
        .where('pushToken', '!=', null)
        .get();

      const tokens: string[] = [];
      usersSnapshot.forEach((doc) => {
        const data = doc.data();
        if (typeof data.pushToken === 'string' && data.pushToken.trim().length > 0) {
          tokens.push(data.pushToken.trim());
        }
      });

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
        for (const userDoc of usersSnapshot.docs) {
          const token = userDoc.data()?.pushToken;
          if (typeof token !== 'string' || !invalidTokens.has(token.trim())) continue;
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

      // Get total check-in count (all-time)
      const totalCount = await db.collection('checkins')
        .where('spotPlaceId', '==', spotId)
        .get()
        .then(snap => snap.size);

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
