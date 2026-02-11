/**
 * Campus Ambassador Program Service
 *
 * Manages ambassador applications, approvals, and benefits
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureFirebase } from './firebaseClient';

export interface AmbassadorApplication {
  id: string;
  userId: string;
  campusId: string;
  status: 'pending' | 'approved' | 'rejected';
  appliedAt: number;
  reviewedAt: number | null;
  reviewedBy: string | null;
  // Application details
  referrals: number;
  checkinsCount: number;
  streakCount: number;
  motivationStatement: string;
  socialMedia?: {
    instagram?: string;
    twitter?: string;
    tiktok?: string;
  };
}

export interface AmbassadorProfile {
  userId: string;
  campusId: string;
  campusName: string;
  approvedAt: number;
  rank: number | null;
  stats: {
    referrals: number;
    events: number;
    impact: number; // Combined score for ranking
  };
  perks: {
    premiumAccess: boolean;
    earlyFeatures: boolean;
    directSupport: boolean;
    exclusiveBadge: boolean;
  };
}

const AMBASSADOR_APPLICATION_KEY = '@perched_ambassador_application';
const AMBASSADOR_PROFILE_KEY = '@perched_ambassador_profile';

/**
 * Check eligibility for ambassador program
 */
export async function checkAmbassadorEligibility(userId: string): Promise<{
  eligible: boolean;
  requirements: {
    minReferrals: number;
    currentReferrals: number;
    minCheckins: number;
    currentCheckins: number;
    minStreak: number;
    currentStreak: number;
  };
}> {
  try {
    const fb = ensureFirebase();
    if (!fb) {
      return {
        eligible: false,
        requirements: {
          minReferrals: 5,
          currentReferrals: 0,
          minCheckins: 20,
          currentCheckins: 0,
          minStreak: 7,
          currentStreak: 0,
        },
      };
    }

    const db = fb.firestore();

    // Get user stats
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    // Get referrals count
    const referralsSnapshot = await db
      .collection('referralRewards')
      .where('referrerId', '==', userId)
      .where('type', '==', 'referrer_reward')
      .where('status', '==', 'claimed')
      .get();

    const currentReferrals = referralsSnapshot.size;

    // Get check-ins count
    const checkinsSnapshot = await db
      .collection('checkins')
      .where('userId', '==', userId)
      .get();

    const currentCheckins = checkinsSnapshot.size;

    // Get streak (from user data)
    const currentStreak = userData?.currentStreak || 0;

    // Define requirements
    const requirements = {
      minReferrals: 5,
      currentReferrals,
      minCheckins: 20,
      currentCheckins,
      minStreak: 7,
      currentStreak,
    };

    // Check eligibility
    const eligible =
      currentReferrals >= requirements.minReferrals &&
      currentCheckins >= requirements.minCheckins &&
      currentStreak >= requirements.minStreak;

    return { eligible, requirements };
  } catch (error) {
    console.error('Failed to check ambassador eligibility:', error);
    return {
      eligible: false,
      requirements: {
        minReferrals: 5,
        currentReferrals: 0,
        minCheckins: 20,
        currentCheckins: 0,
        minStreak: 7,
        currentStreak: 0,
      },
    };
  }
}

/**
 * Submit ambassador application
 */
export async function submitAmbassadorApplication(
  userId: string,
  campusId: string,
  motivationStatement: string,
  socialMedia?: AmbassadorApplication['socialMedia']
): Promise<{ success: boolean; applicationId?: string; error?: string }> {
  try {
    // Check eligibility first
    const { eligible, requirements } = await checkAmbassadorEligibility(userId);

    if (!eligible) {
      return {
        success: false,
        error: `Not eligible yet. Need ${requirements.minReferrals - requirements.currentReferrals} more referrals, ${requirements.minCheckins - requirements.currentCheckins} more check-ins, and ${requirements.minStreak - requirements.currentStreak} day streak.`,
      };
    }

    // Check for existing application
    const fb = ensureFirebase();
    if (!fb) {
      return { success: false, error: 'Firebase not configured' };
    }

    const db = fb.firestore();

    const existingSnapshot = await db
      .collection('ambassadorApplications')
      .where('userId', '==', userId)
      .where('campusId', '==', campusId)
      .where('status', 'in', ['pending', 'approved'])
      .get();

    if (!existingSnapshot.empty) {
      return { success: false, error: 'You already have an active application' };
    }

    // Create application
    const application: AmbassadorApplication = {
      id: `${userId}_${campusId}_${Date.now()}`,
      userId,
      campusId,
      status: 'pending',
      appliedAt: Date.now(),
      reviewedAt: null,
      reviewedBy: null,
      referrals: requirements.currentReferrals,
      checkinsCount: requirements.currentCheckins,
      streakCount: requirements.currentStreak,
      motivationStatement,
      socialMedia,
    };

    // Save to Firestore
    await db.collection('ambassadorApplications').doc(application.id).set(application);

    // Cache locally
    await AsyncStorage.setItem(
      `${AMBASSADOR_APPLICATION_KEY}_${userId}_${campusId}`,
      JSON.stringify(application)
    );

    return { success: true, applicationId: application.id };
  } catch (error) {
    console.error('Failed to submit ambassador application:', error);
    return { success: false, error: 'Failed to submit application' };
  }
}

/**
 * Get ambassador application status
 */
export async function getAmbassadorApplication(
  userId: string,
  campusId: string
): Promise<AmbassadorApplication | null> {
  try {
    // Try cache first
    const cached = await AsyncStorage.getItem(`${AMBASSADOR_APPLICATION_KEY}_${userId}_${campusId}`);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch from Firebase
    const fb = ensureFirebase();
    if (!fb) return null;

    const db = fb.firestore();
    const snapshot = await db
      .collection('ambassadorApplications')
      .where('userId', '==', userId)
      .where('campusId', '==', campusId)
      .orderBy('appliedAt', 'desc')
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    const application = snapshot.docs[0].data() as AmbassadorApplication;

    // Cache locally
    await AsyncStorage.setItem(
      `${AMBASSADOR_APPLICATION_KEY}_${userId}_${campusId}`,
      JSON.stringify(application)
    );

    return application;
  } catch (error) {
    console.error('Failed to get ambassador application:', error);
    return null;
  }
}

/**
 * Get ambassador profile (if approved)
 */
export async function getAmbassadorProfile(
  userId: string,
  campusId: string
): Promise<AmbassadorProfile | null> {
  try {
    // Try cache first
    const cached = await AsyncStorage.getItem(`${AMBASSADOR_PROFILE_KEY}_${userId}_${campusId}`);
    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch from Firebase
    const fb = ensureFirebase();
    if (!fb) return null;

    const db = fb.firestore();
    const doc = await db.collection('campusAmbassadors').doc(`${campusId}_${userId}`).get();

    if (!doc.exists) return null;

    const data = doc.data();
    const profile: AmbassadorProfile = {
      userId: data!.userId,
      campusId: data!.campusId,
      campusName: data!.campusName || '',
      approvedAt: data!.approvedAt || Date.now(),
      rank: null, // Will be calculated
      stats: {
        referrals: data!.referrals || 0,
        events: data!.events || 0,
        impact: data!.referrals * 10 + (data!.checkins || 0),
      },
      perks: {
        premiumAccess: true,
        earlyFeatures: true,
        directSupport: true,
        exclusiveBadge: true,
      },
    };

    // Get rank
    const ambassadorsSnapshot = await db
      .collection('campusAmbassadors')
      .where('campusId', '==', campusId)
      .get();

    const ambassadors = ambassadorsSnapshot.docs.map((doc: any) => ({
      userId: doc.data().userId,
      score: doc.data().referrals * 10 + (doc.data().checkins || 0),
    }));

    ambassadors.sort((a: any, b: any) => b.score - a.score);
    const rank = ambassadors.findIndex((a: any) => a.userId === userId);
    profile.rank = rank >= 0 ? rank + 1 : null;

    // Cache locally
    await AsyncStorage.setItem(
      `${AMBASSADOR_PROFILE_KEY}_${userId}_${campusId}`,
      JSON.stringify(profile)
    );

    return profile;
  } catch (error) {
    console.error('Failed to get ambassador profile:', error);
    return null;
  }
}

/**
 * Get all ambassadors for a campus
 */
export async function getCampusAmbassadors(
  campusId: string,
  limit: number = 10
): Promise<Array<{ userId: string; name: string; photoUrl?: string; rank: number; stats: AmbassadorProfile['stats'] }>> {
  try {
    const fb = ensureFirebase();
    if (!fb) return [];

    const db = fb.firestore();

    // Get all ambassadors for campus
    const snapshot = await db
      .collection('campusAmbassadors')
      .where('campusId', '==', campusId)
      .get();

    const ambassadors = snapshot.docs.map((doc: any) => {
      const data = doc.data();
      return {
        userId: data.userId,
        score: data.referrals * 10 + (data.checkins || 0),
        referrals: data.referrals || 0,
        events: data.events || 0,
      };
    });

    // Sort by score
    ambassadors.sort((a: any, b: any) => b.score - a.score);

    // Get user info for top ambassadors
    const topAmbassadors = ambassadors.slice(0, limit);

    const result = await Promise.all(
      topAmbassadors.map(async (amb: any, index: number) => {
        const userDoc = await db.collection('users').doc(amb.userId).get();
        const userData = userDoc.data();

        return {
          userId: amb.userId,
          name: userData?.name || 'Anonymous',
          photoUrl: userData?.photoUrl,
          rank: index + 1,
          stats: {
            referrals: amb.referrals,
            events: amb.events,
            impact: amb.score,
          },
        };
      })
    );

    return result;
  } catch (error) {
    console.error('Failed to get campus ambassadors:', error);
    return [];
  }
}

/**
 * Clear ambassador cache
 */
export async function clearAmbassadorCache(userId: string): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ambassadorKeys = keys.filter(
      key =>
        key.includes(AMBASSADOR_APPLICATION_KEY) ||
        key.includes(AMBASSADOR_PROFILE_KEY)
    );
    await AsyncStorage.multiRemove(ambassadorKeys);
  } catch (error) {
    console.warn('Failed to clear ambassador cache:', error);
  }
}
