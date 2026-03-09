/**
 * Campus Challenges Service
 *
 * Manages campus-specific challenges, progress tracking, and rewards
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureFirebase } from './firebaseClient';
import { grantReferralPremium } from './premium';
import type { CampusChallenge } from './campus';

export interface ChallengeProgress {
  challengeId: string;
  userId: string;
  campusId: string;
  progress: number; // Current progress (e.g., 3 out of 5 check-ins)
  target: number; // Target to complete (e.g., 5 check-ins)
  completed: boolean;
  completedAt: number | null;
  startedAt: number;
  lastUpdatedAt: number;
}

export interface ChallengeReward {
  id: string;
  challengeId: string;
  userId: string;
  type: 'premium' | 'xp' | 'badge' | 'custom';
  value: number | string; // Days for premium, XP amount, badge ID, or custom data
  claimed: boolean;
  claimedAt: number | null;
  createdAt: number;
}

const CHALLENGE_PROGRESS_KEY = '@perched_challenge_progress';
const CHALLENGE_REWARDS_KEY = '@perched_challenge_rewards';
const CHALLENGE_VISITED_SPOTS_KEY = '@perched_challenge_visited_spots';

function calculateLevelFromXp(xp: number): { level: number; xpToNextLevel: number } {
  const levels = [0, 100, 250, 500, 1000, 2000, 3500, 5500, 8000, 12000, 20000];
  let level = 1;
  for (let index = 1; index < levels.length; index += 1) {
    if (xp >= levels[index]) {
      level = index + 1;
    } else {
      break;
    }
  }
  const nextLevelXp = levels[level] || levels[levels.length - 1] + 10000;
  return {
    level,
    xpToNextLevel: Math.max(0, nextLevelXp - xp),
  };
}

async function grantChallengeXp(userId: string, xp: number): Promise<void> {
  const fb = ensureFirebase();
  if (!fb || !userId || !Number.isFinite(xp) || xp <= 0) return;

  const db = fb.firestore();
  const profileRef = db.collection('gamification').doc(userId);
  const profileDoc = await profileRef.get().catch(() => null);
  const currentXp = typeof profileDoc?.data?.()?.xp === 'number' ? profileDoc.data().xp : 0;
  const nextXp = currentXp + xp;
  const { level, xpToNextLevel } = calculateLevelFromXp(nextXp);

  await profileRef.set(
    {
      userId,
      xp: nextXp,
      level,
      xpToNextLevel,
      lastUpdated: Date.now(),
    },
    { merge: true }
  );
}

async function grantChallengeBadge(
  userId: string,
  challengeId: string,
  challengeName: string,
  campusId: string
): Promise<void> {
  const fb = ensureFirebase();
  if (!fb || !userId || !challengeId) return;

  const badgeId = `campus_challenge_${challengeId}`;
  await fb.firestore().collection('achievements').doc(`${userId}_${badgeId}`).set(
    {
      userId,
      achievementId: badgeId,
      name: challengeName || 'Campus Challenge Winner',
      description: `Completed a campus challenge${campusId ? ` for ${campusId}` : ''}.`,
      icon: '🏅',
      tier: 'gold',
      unlockedAt: fb.firestore.FieldValue.serverTimestamp(),
      unlockedAtMs: Date.now(),
      source: 'campus_challenge',
      campusId,
    },
    { merge: true }
  );
}

function visitedSpotsKey(userId: string, challengeId: string): string {
  return `${CHALLENGE_VISITED_SPOTS_KEY}_${userId}_${challengeId}`;
}

async function getVisitedChallengeSpots(userId: string, challengeId: string): Promise<string[]> {
  try {
    const json = await AsyncStorage.getItem(visitedSpotsKey(userId, challengeId));
    const parsed = json ? JSON.parse(json) : [];
    return Array.isArray(parsed) ? parsed.map((value) => String(value || '').trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function markChallengeSpotVisited(userId: string, challengeId: string, spotPlaceId: string): Promise<boolean> {
  const spotId = String(spotPlaceId || '').trim();
  if (!spotId) return false;
  const visited = await getVisitedChallengeSpots(userId, challengeId);
  if (visited.includes(spotId)) return false;
  visited.push(spotId);
  await AsyncStorage.setItem(visitedSpotsKey(userId, challengeId), JSON.stringify(visited));
  return true;
}

/**
 * Get user's progress on a challenge
 */
export async function getChallengeProgress(
  userId: string,
  challengeId: string
): Promise<ChallengeProgress | null> {
  try {
    const json = await AsyncStorage.getItem(`${CHALLENGE_PROGRESS_KEY}_${userId}_${challengeId}`);
    if (json) {
      return JSON.parse(json);
    }

    // Check Firebase for server-side progress
    const fb = ensureFirebase();
    if (fb) {
      const db = fb.firestore();
      const doc = await db
        .collection('challengeProgress')
        .doc(`${userId}_${challengeId}`)
        .get();

      if (doc.exists) {
        const data = doc.data() as ChallengeProgress;
        // Cache locally
        await AsyncStorage.setItem(
          `${CHALLENGE_PROGRESS_KEY}_${userId}_${challengeId}`,
          JSON.stringify(data)
        );
        return data;
      }
    }

    return null;
  } catch (error) {
    console.error('Failed to get challenge progress:', error);
    return null;
  }
}

/**
 * Update challenge progress
 */
export async function updateChallengeProgress(
  userId: string,
  challengeId: string,
  campusId: string,
  delta: number,
  target: number
): Promise<ChallengeProgress> {
  try {
    // Get existing progress or create new
    let progress = await getChallengeProgress(userId, challengeId);

    if (!progress) {
      progress = {
        challengeId,
        userId,
        campusId,
        progress: 0,
        target,
        completed: false,
        completedAt: null,
        startedAt: Date.now(),
        lastUpdatedAt: Date.now(),
      };
    }

    // Update progress
    progress.progress = Math.min(progress.progress + delta, target);
    progress.lastUpdatedAt = Date.now();

    // Check if completed
    if (progress.progress >= target && !progress.completed) {
      progress.completed = true;
      progress.completedAt = Date.now();

      // Award challenge rewards
      await awardChallengeRewards(userId, challengeId, campusId);
    }

    // Save locally
    await AsyncStorage.setItem(
      `${CHALLENGE_PROGRESS_KEY}_${userId}_${challengeId}`,
      JSON.stringify(progress)
    );

    // Sync to Firebase
    const fb = ensureFirebase();
    if (fb) {
      const db = fb.firestore();
      await db
        .collection('challengeProgress')
        .doc(`${userId}_${challengeId}`)
        .set(progress, { merge: true });
    }

    return progress;
  } catch (error) {
    console.error('Failed to update challenge progress:', error);
    throw error;
  }
}

/**
 * Award rewards for completing a challenge
 */
async function awardChallengeRewards(
  userId: string,
  challengeId: string,
  campusId: string
): Promise<void> {
  try {
    // Get challenge details to determine rewards
    const fb = ensureFirebase();
    if (!fb) return;

    const db = fb.firestore();
    const challengeDoc = await db.collection('campusChallenges').doc(challengeId).get();

    if (!challengeDoc.exists) return;

    const challenge = challengeDoc.data() as CampusChallenge;

    // Parse reward string (e.g., "1 week premium", "500 XP", "Campus Champion badge")
    const rewardStr = challenge.reward.toLowerCase();

    if (rewardStr.includes('premium')) {
      // Grant premium time
      const weekMatch = rewardStr.match(/(\d+)\s*week/);
      const dayMatch = rewardStr.match(/(\d+)\s*day/);

      if (weekMatch) {
        const weeks = parseInt(weekMatch[1], 10);
        await grantReferralPremium(userId, weeks);

        // Record reward
        const reward: ChallengeReward = {
          id: `${challengeId}_${userId}_${Date.now()}`,
          challengeId,
          userId,
          type: 'premium',
          value: weeks * 7, // Convert to days
          claimed: true,
          claimedAt: Date.now(),
          createdAt: Date.now(),
        };
        await saveReward(userId, reward);
      } else if (dayMatch) {
        const days = parseInt(dayMatch[1], 10);
        const weeks = days / 7;
        await grantReferralPremium(userId, weeks);

        const reward: ChallengeReward = {
          id: `${challengeId}_${userId}_${Date.now()}`,
          challengeId,
          userId,
          type: 'premium',
          value: days,
          claimed: true,
          claimedAt: Date.now(),
          createdAt: Date.now(),
        };
        await saveReward(userId, reward);
      }
    } else if (rewardStr.includes('xp')) {
      const xpMatch = rewardStr.match(/(\d+)\s*xp/);
      if (xpMatch) {
        const xp = parseInt(xpMatch[1], 10);
        await grantChallengeXp(userId, xp);
        const reward: ChallengeReward = {
          id: `${challengeId}_${userId}_${Date.now()}`,
          challengeId,
          userId,
          type: 'xp',
          value: xp,
          claimed: true,
          claimedAt: Date.now(),
          createdAt: Date.now(),
        };
        await saveReward(userId, reward);
      }
    } else if (rewardStr.includes('badge')) {
      const badgeId = `campus_challenge_${challengeId}`;
      const reward: ChallengeReward = {
        id: `${challengeId}_${userId}_${Date.now()}`,
        challengeId,
        userId,
        type: 'badge',
        value: badgeId,
        claimed: true,
        claimedAt: Date.now(),
        createdAt: Date.now(),
      };
      await saveReward(userId, reward);
      await grantChallengeBadge(userId, challengeId, challenge.title || 'Campus Challenge Winner', campusId);
    }

    // Increment challenge participants counter
    await db.collection('campusChallenges').doc(challengeId).update({
      completions: fb.firestore.FieldValue.increment(1),
    });
  } catch (error) {
    console.error('Failed to award challenge rewards:', error);
  }
}

/**
 * Save reward
 */
async function saveReward(userId: string, reward: ChallengeReward): Promise<void> {
  try {
    // Save locally
    const json = await AsyncStorage.getItem(`${CHALLENGE_REWARDS_KEY}_${userId}`);
    const rewards: ChallengeReward[] = json ? JSON.parse(json) : [];
    rewards.push(reward);
    await AsyncStorage.setItem(`${CHALLENGE_REWARDS_KEY}_${userId}`, JSON.stringify(rewards));

    // Sync to Firebase
    const fb = ensureFirebase();
    if (fb) {
      const db = fb.firestore();
      await db.collection('challengeRewards').doc(reward.id).set(reward);
    }
  } catch (error) {
    console.error('Failed to save reward:', error);
  }
}

/**
 * Get user's challenge rewards
 */
export async function getChallengeRewards(userId: string): Promise<ChallengeReward[]> {
  try {
    // Try local cache first
    const json = await AsyncStorage.getItem(`${CHALLENGE_REWARDS_KEY}_${userId}`);
    if (json) {
      return JSON.parse(json);
    }

    // Fetch from Firebase
    const fb = ensureFirebase();
    if (fb) {
      const db = fb.firestore();
      const snapshot = await db
        .collection('challengeRewards')
        .where('userId', '==', userId)
        .get();

      const rewards: ChallengeReward[] = [];
      snapshot.forEach((doc: any) => {
        rewards.push(doc.data() as ChallengeReward);
      });

      // Cache locally
      await AsyncStorage.setItem(`${CHALLENGE_REWARDS_KEY}_${userId}`, JSON.stringify(rewards));

      return rewards;
    }

    return [];
  } catch (error) {
    console.error('Failed to get challenge rewards:', error);
    return [];
  }
}

/**
 * Get user's progress on all active challenges for their campus
 */
export async function getUserChallengeProgress(
  userId: string,
  campusId: string
): Promise<Array<{ challenge: CampusChallenge; progress: ChallengeProgress | null }>> {
  try {
    const fb = ensureFirebase();
    if (!fb) return [];

    const db = fb.firestore();
    const now = Date.now();

    // Get active challenges for campus
    const challengesSnapshot = await db
      .collection('campusChallenges')
      .where('campusId', '==', campusId)
      .where('endDate', '>=', now)
      .orderBy('endDate', 'asc')
      .get();

    const result: Array<{ challenge: CampusChallenge; progress: ChallengeProgress | null }> = [];

    for (const doc of challengesSnapshot.docs) {
      const challenge = {
        id: doc.id,
        ...doc.data(),
      } as CampusChallenge;

      const progress = await getChallengeProgress(userId, challenge.id);
      result.push({ challenge, progress });
    }

    return result;
  } catch (error) {
    console.error('Failed to get user challenge progress:', error);
    return [];
  }
}

/**
 * Track check-in for challenge progress
 * Updates progress for relevant challenges (visit_spots, check_ins, etc.)
 */
export async function trackCheckinForChallenges(
  userId: string,
  campusId: string,
  spotPlaceId: string
): Promise<void> {
  try {
    const challenges = await getUserChallengeProgress(userId, campusId);

    for (const { challenge, progress } of challenges) {
      if (progress?.completed) continue; // Skip completed challenges

      if (challenge.type === 'check_ins') {
        // Increment check-in count
        await updateChallengeProgress(userId, challenge.id, campusId, 1, challenge.target);
      } else if (challenge.type === 'visit_spots') {
        const isNewSpot = await markChallengeSpotVisited(userId, challenge.id, spotPlaceId);
        if (isNewSpot) {
          await updateChallengeProgress(userId, challenge.id, campusId, 1, challenge.target);
        }
      }
    }
  } catch (error) {
    console.error('Failed to track check-in for challenges:', error);
  }
}

/**
 * Track streak for challenge progress
 */
export async function trackStreakForChallenges(
  userId: string,
  campusId: string,
  currentStreak: number
): Promise<void> {
  try {
    const challenges = await getUserChallengeProgress(userId, campusId);

    for (const { challenge, progress } of challenges) {
      if (progress?.completed) continue;

      if (challenge.type === 'streak') {
        // Update streak challenge
        await updateChallengeProgress(userId, challenge.id, campusId, 0, challenge.target);
        // Manually set progress to current streak
        const updatedProgress = await getChallengeProgress(userId, challenge.id);
        if (updatedProgress) {
          updatedProgress.progress = currentStreak;
          await AsyncStorage.setItem(
            `${CHALLENGE_PROGRESS_KEY}_${userId}_${challenge.id}`,
            JSON.stringify(updatedProgress)
          );
        }
      }
    }
  } catch (error) {
    console.error('Failed to track streak for challenges:', error);
  }
}

/**
 * Clear challenge cache
 */
export async function clearChallengeCache(userId: string): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const challengeKeys = keys.filter(
      key =>
        key.includes(CHALLENGE_PROGRESS_KEY) ||
        key.includes(CHALLENGE_REWARDS_KEY) ||
        key.includes(CHALLENGE_VISITED_SPOTS_KEY)
    );
    await AsyncStorage.multiRemove(challengeKeys);
  } catch (error) {
    console.warn('Failed to clear challenge cache:', error);
  }
}
