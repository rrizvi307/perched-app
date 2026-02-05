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
    const { referralCode, newUserId, status } = data;

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
  .onRun(async (context) => {
    try {
      // Get all users with push tokens
      const usersSnapshot = await db.collection('users')
        .where('pushToken', '!=', null)
        .get();

      const tokens: string[] = [];
      usersSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.pushToken) {
          tokens.push(data.pushToken);
        }
      });

      if (tokens.length === 0) {
        console.log('No users with push tokens');
        return null;
      }

      // Send multicast notification
      const message = {
        notification: {
          title: 'Your Weekly Recap',
          body: "Check out your weekly recap and see where your friends have been!",
        },
        data: {
          type: 'weekly_recap',
        },
        tokens,
      };

      const response = await admin.messaging().sendEachForMulticast(message);
      console.log(`Sent ${response.successCount} weekly recap notifications`);

      return { success: true, sent: response.successCount };
    } catch (error) {
      console.error('Error sending weekly recap:', error);
      return null;
    }
  });
