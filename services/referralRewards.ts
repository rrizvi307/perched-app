/**
 * Referral Rewards System
 *
 * Double-sided incentives for viral growth:
 * - Referrer: 1 week premium per friend who makes 3 check-ins
 * - Referee: Instant 3-day premium trial on signup
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureFirebase } from './firebaseClient';
import { grantReferralPremium } from './premium';

export interface ReferralReward {
  id: string;
  referrerId: string;
  refereeId: string;
  type: 'referrer_reward' | 'referee_trial';
  premiumWeeks: number;
  premiumDays: number;
  status: 'pending' | 'claimed' | 'expired';
  claimedAt: number | null;
  createdAt: number;
  // Tracking for referrer rewards
  refereeCheckinsCount?: number;
  requiredCheckins?: number;
}

export interface ReferralStats {
  totalReferrals: number;
  successfulReferrals: number; // Completed 3 check-ins
  pendingReferrals: number; // Not yet 3 check-ins
  totalPremiumEarned: number; // In days
  currentMonthReferrals: number;
  rank: number | null; // Leaderboard rank
}

const REFERRAL_REWARDS_KEY = '@perched_referral_rewards';
const REFERRAL_STATS_KEY = '@perched_referral_stats';

/**
 * Grant instant 3-day premium trial to new referee
 */
export async function grantRefereeTrial(refereeId: string, referrerId: string): Promise<void> {
  try {
    // Grant 3-day premium trial
    const threeDaysInWeeks = 3 / 7; // 0.428 weeks
    await grantReferralPremium(refereeId, threeDaysInWeeks);

    // Record the reward
    const reward: ReferralReward = {
      id: `referee-${refereeId}-${Date.now()}`,
      referrerId,
      refereeId,
      type: 'referee_trial',
      premiumWeeks: 0,
      premiumDays: 3,
      status: 'claimed',
      claimedAt: Date.now(),
      createdAt: Date.now(),
    };

    await saveReward(reward);

    // Track in Firebase for analytics
    const fb = ensureFirebase();
    if (fb) {
      const db = fb.firestore();
      await db.collection('referralRewards').doc(reward.id).set(reward);
    }
  } catch (error) {
    console.error('Failed to grant referee trial:', error);
  }
}

/**
 * Check if referee has completed required check-ins and grant referrer reward
 */
export async function checkAndGrantReferrerReward(
  referrerId: string,
  refereeId: string,
  refereeCheckinsCount: number
): Promise<boolean> {
  try {
    const REQUIRED_CHECKINS = 3;

    if (refereeCheckinsCount < REQUIRED_CHECKINS) {
      return false; // Not yet eligible
    }

    // Check if reward already granted
    const existingRewards = await getReferrerRewards(referrerId);
    const alreadyGranted = existingRewards.some(
      (r: any) => r.refereeId === refereeId && r.type === 'referrer_reward' && r.status === 'claimed'
    );

    if (alreadyGranted) {
      return false; // Already rewarded
    }

    // Grant 1 week of premium to referrer
    await grantReferralPremium(referrerId, 1);

    // Record the reward
    const reward: ReferralReward = {
      id: `referrer-${referrerId}-${refereeId}-${Date.now()}`,
      referrerId,
      refereeId,
      type: 'referrer_reward',
      premiumWeeks: 1,
      premiumDays: 7,
      status: 'claimed',
      claimedAt: Date.now(),
      createdAt: Date.now(),
      refereeCheckinsCount,
      requiredCheckins: REQUIRED_CHECKINS,
    };

    await saveReward(reward);

    // Track in Firebase
    const fb = ensureFirebase();
    if (fb) {
      const db = fb.firestore();
      await db.collection('referralRewards').doc(reward.id).set(reward);
    }

    // Update referral stats
    await incrementReferralStats(referrerId, 'successful');

    return true;
  } catch (error) {
    console.error('Failed to grant referrer reward:', error);
    return false;
  }
}

/**
 * Get referrer's rewards
 */
async function getReferrerRewards(referrerId: string): Promise<ReferralReward[]> {
  try {
    const json = await AsyncStorage.getItem(`${REFERRAL_REWARDS_KEY}_${referrerId}`);
    if (json) {
      return JSON.parse(json);
    }
  } catch (error) {
    console.warn('Failed to get referrer rewards:', error);
  }
  return [];
}

/**
 * Save reward
 */
async function saveReward(reward: ReferralReward): Promise<void> {
  try {
    const existingRewards = await getReferrerRewards(reward.referrerId);
    const updated = [...existingRewards, reward];
    await AsyncStorage.setItem(
      `${REFERRAL_REWARDS_KEY}_${reward.referrerId}`,
      JSON.stringify(updated)
    );
  } catch (error) {
    console.error('Failed to save reward:', error);
  }
}

/**
 * Get referral stats for a user
 */
export async function getReferralStats(userId: string): Promise<ReferralStats> {
  try {
    // Try local cache first
    const json = await AsyncStorage.getItem(`${REFERRAL_STATS_KEY}_${userId}`);
    if (json) {
      return JSON.parse(json);
    }

    // Fetch from Firebase
    const fb = ensureFirebase();
    if (fb) {
      const db = fb.firestore();

      // Get all referrals
      const referralsSnapshot = await db
        .collection('referrals')
        .where('referralCode', '==', userId.toUpperCase())
        .get();

      const totalReferrals = referralsSnapshot.size;

      // Get successful referrals (those with rewards)
      const rewardsSnapshot = await db
        .collection('referralRewards')
        .where('referrerId', '==', userId)
        .where('type', '==', 'referrer_reward')
        .where('status', '==', 'claimed')
        .get();

      const successfulReferrals = rewardsSnapshot.size;

      // Calculate total premium earned
      let totalPremiumDays = 0;
      rewardsSnapshot.forEach((doc: any) => {
        const data = doc.data();
        totalPremiumDays += data.premiumDays || 0;
      });

      // Get current month referrals
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const monthReferralsSnapshot = await db
        .collection('referrals')
        .where('referralCode', '==', userId.toUpperCase())
        .where('createdAt', '>=', fb.firestore.Timestamp.fromDate(monthStart))
        .get();

      const stats: ReferralStats = {
        totalReferrals,
        successfulReferrals,
        pendingReferrals: totalReferrals - successfulReferrals,
        totalPremiumEarned: totalPremiumDays,
        currentMonthReferrals: monthReferralsSnapshot.size,
        rank: null, // Will be calculated by leaderboard
      };

      // Cache locally
      await AsyncStorage.setItem(`${REFERRAL_STATS_KEY}_${userId}`, JSON.stringify(stats));

      return stats;
    }
  } catch (error) {
    console.error('Failed to get referral stats:', error);
  }

  // Default stats
  return {
    totalReferrals: 0,
    successfulReferrals: 0,
    pendingReferrals: 0,
    totalPremiumEarned: 0,
    currentMonthReferrals: 0,
    rank: null,
  };
}

/**
 * Increment referral stats
 */
async function incrementReferralStats(
  userId: string,
  type: 'total' | 'successful'
): Promise<void> {
  try {
    const stats = await getReferralStats(userId);

    if (type === 'total') {
      stats.totalReferrals += 1;
      stats.currentMonthReferrals += 1;
      stats.pendingReferrals += 1;
    } else if (type === 'successful') {
      stats.successfulReferrals += 1;
      stats.pendingReferrals -= 1;
      stats.totalPremiumEarned += 7; // 1 week = 7 days
    }

    await AsyncStorage.setItem(`${REFERRAL_STATS_KEY}_${userId}`, JSON.stringify(stats));
  } catch (error) {
    console.error('Failed to increment referral stats:', error);
  }
}

/**
 * Get referral leaderboard
 */
export async function getReferralLeaderboard(limit: number = 50): Promise<Array<{
  userId: string;
  userName: string;
  photoUrl?: string;
  successfulReferrals: number;
  totalPremiumEarned: number;
  rank: number;
}>> {
  try {
    const fb = ensureFirebase();
    if (!fb) return [];

    const db = fb.firestore();

    // Get top referrers by successful referrals this month
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const snapshot = await db
      .collection('referralRewards')
      .where('type', '==', 'referrer_reward')
      .where('status', '==', 'claimed')
      .where('claimedAt', '>=', monthStart.getTime())
      .get();

    // Aggregate by referrer
    const referrerCounts = new Map<string, number>();
    snapshot.forEach((doc: any) => {
      const data = doc.data();
      const count = referrerCounts.get(data.referrerId) || 0;
      referrerCounts.set(data.referrerId, count + 1);
    });

    // Sort and get top referrers
    const sorted = Array.from(referrerCounts.entries())
      .sort((a: any, b: any) => b[1] - a[1])
      .slice(0, limit);

    // Get user info for each
    const leaderboard = await Promise.all(
      sorted.map(async ([userId, count], index) => {
        const userDoc = await db.collection('users').doc(userId).get();
        const userData = userDoc.data();

        return {
          userId,
          userName: userData?.name || 'Anonymous',
          photoUrl: userData?.photoUrl,
          successfulReferrals: count,
          totalPremiumEarned: count * 7, // 1 week per successful referral
          rank: index + 1,
        };
      })
    );

    return leaderboard;
  } catch (error) {
    console.error('Failed to get referral leaderboard:', error);
    return [];
  }
}

/**
 * Clear referral stats cache
 */
export async function clearReferralStatsCache(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${REFERRAL_STATS_KEY}_${userId}`);
  } catch (error) {
    console.warn('Failed to clear referral stats cache:', error);
  }
}
