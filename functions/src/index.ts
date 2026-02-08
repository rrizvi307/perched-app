/**
 * Perched Cloud Functions
 *
 * Deploy with: cd functions && npm install && npm run deploy
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

admin.initializeApp();

const db = admin.firestore();

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
const runtimeConfig = (() => {
  try {
    return functions.config();
  } catch {
    return {};
  }
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
  const key = readFirstNonEmpty(
    process.env.FOURSQUARE_API_KEY,
    runtimeConfig?.places?.foursquare_api_key,
    runtimeConfig?.places?.foursquare,
  );
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
  const key = readFirstNonEmpty(
    process.env.YELP_API_KEY,
    runtimeConfig?.places?.yelp_api_key,
    runtimeConfig?.places?.yelp,
  );
  if (!key) return null;
  const params = new URLSearchParams({
    name: placeName,
    latitude: String(lat),
    longitude: String(lng),
    limit: '1',
  });
  const url = `https://api.yelp.com/v3/businesses/matches?${params.toString()}`;
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

export const placeSignalsProxy = functions.https.onRequest(async (req, res) => {
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

  const cacheKey = `${placeName.toLowerCase()}:${lat.toFixed(3)}:${lng.toFixed(3)}`;
  const cached = placeSignalCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < PLACE_SIGNAL_TTL_MS) {
    res.status(200).json({ externalSignals: cached.payload, cacheHit: true });
    return;
  }

  try {
    const [foursquare, yelp] = await Promise.all([
      fetchFoursquareSignalServer(placeName, lat, lng),
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
