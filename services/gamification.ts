import AsyncStorage from '@react-native-async-storage/async-storage';
import { track } from './analytics';
import { ensureFirebase, updateUserRemote } from './firebaseClient';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  condition: (stats: UserStats) => boolean;
  reward?: string;
  unlockedAt?: number;
}

export interface UserStats {
  totalCheckins: number;
  uniqueSpots: number;
  friendsCount: number;
  streakDays: number;
  longestStreak: number;
  nightOwlCheckins: number; // after 10pm
  earlyBirdCheckins: number; // before 8am
  weekendCheckins: number;
  returnVisits: number; // same spot 3+ times
  firstDiscoveries: number; // first to check in at spot
  lastCheckinDate?: number;
  spotVisits: Record<string, number>; // spotId -> count
}

// Achievement definitions
export const ACHIEVEMENTS: Achievement[] = [
  // Explorer achievements
  {
    id: 'explorer_bronze',
    name: 'Explorer',
    description: 'Check in at 5 different spots',
    icon: '🗺️',
    tier: 'bronze',
    condition: (stats) => stats.uniqueSpots >= 5,
  },
  {
    id: 'explorer_silver',
    name: 'World Traveler',
    description: 'Check in at 25 different spots',
    icon: '✈️',
    tier: 'silver',
    condition: (stats) => stats.uniqueSpots >= 25,
  },
  {
    id: 'explorer_gold',
    name: 'Legendary Explorer',
    description: 'Check in at 100 different spots',
    icon: '🌍',
    tier: 'gold',
    condition: (stats) => stats.uniqueSpots >= 100,
  },

  // Social achievements
  {
    id: 'social_bronze',
    name: 'Social Butterfly',
    description: 'Connect with 10 friends',
    icon: '🦋',
    tier: 'bronze',
    condition: (stats) => stats.friendsCount >= 10,
  },
  {
    id: 'social_silver',
    name: 'Connector',
    description: 'Connect with 50 friends',
    icon: '🤝',
    tier: 'silver',
    condition: (stats) => stats.friendsCount >= 50,
  },

  // Streak achievements
  {
    id: 'streak_bronze',
    name: 'Getting Started',
    description: 'Check in 3 days in a row',
    icon: '🔥',
    tier: 'bronze',
    condition: (stats) => stats.streakDays >= 3,
  },
  {
    id: 'streak_silver',
    name: 'Week Warrior',
    description: 'Check in 7 days in a row',
    icon: '⚡',
    tier: 'silver',
    condition: (stats) => stats.streakDays >= 7,
  },
  {
    id: 'streak_gold',
    name: 'Unstoppable',
    description: 'Check in 30 days in a row',
    icon: '💪',
    tier: 'gold',
    condition: (stats) => stats.streakDays >= 30,
  },
  {
    id: 'streak_platinum',
    name: 'Legend',
    description: 'Check in 100 days in a row',
    icon: '👑',
    tier: 'platinum',
    condition: (stats) => stats.streakDays >= 100,
  },

  // Activity patterns
  {
    id: 'night_owl',
    name: 'Night Owl',
    description: 'Check in after 10pm 10 times',
    icon: '🦉',
    tier: 'bronze',
    condition: (stats) => stats.nightOwlCheckins >= 10,
  },
  {
    id: 'early_bird',
    name: 'Early Bird',
    description: 'Check in before 8am 10 times',
    icon: '🌅',
    tier: 'bronze',
    condition: (stats) => stats.earlyBirdCheckins >= 10,
  },
  {
    id: 'weekend_warrior',
    name: 'Weekend Warrior',
    description: 'Check in on weekends 20 times',
    icon: '🎉',
    tier: 'silver',
    condition: (stats) => stats.weekendCheckins >= 20,
  },

  // Loyalty achievements
  {
    id: 'loyal_bronze',
    name: 'Regular',
    description: 'Return to the same spot 5 times',
    icon: '⭐',
    tier: 'bronze',
    condition: (stats) => stats.returnVisits >= 5,
  },
  {
    id: 'loyal_silver',
    name: 'Super Regular',
    description: 'Return to the same spot 20 times',
    icon: '🌟',
    tier: 'silver',
    condition: (stats) => stats.returnVisits >= 20,
  },

  // Discovery achievements
  {
    id: 'trendsetter',
    name: 'Trendsetter',
    description: 'Be first to discover 5 new spots',
    icon: '🎯',
    tier: 'silver',
    condition: (stats) => stats.firstDiscoveries >= 5,
  },
];

const STORAGE_KEY = '@perched_user_stats';
const ACHIEVEMENTS_KEY = '@perched_achievements';

/**
 * Get user stats
 */
export async function getUserStats(): Promise<UserStats> {
  try {
    const json = await AsyncStorage.getItem(STORAGE_KEY);
    if (json) {
      return JSON.parse(json);
    }
  } catch (error) {
    console.error('Failed to load user stats:', error);
  }

  // Default stats
  return {
    totalCheckins: 0,
    uniqueSpots: 0,
    friendsCount: 0,
    streakDays: 0,
    longestStreak: 0,
    nightOwlCheckins: 0,
    earlyBirdCheckins: 0,
    weekendCheckins: 0,
    returnVisits: 0,
    firstDiscoveries: 0,
    spotVisits: {},
  };
}

/**
 * Update user stats after check-in
 */
export async function updateStatsAfterCheckin(
  spotId: string,
  timestamp: number = Date.now()
): Promise<UserStats> {
  const stats = await getUserStats();

  // Increment total
  stats.totalCheckins++;

  // Track spot visits
  if (!stats.spotVisits[spotId]) {
    stats.spotVisits[spotId] = 0;
    stats.uniqueSpots++;
  }
  stats.spotVisits[spotId]++;

  // Check if first discovery (first person to check in at this spot)
  if (stats.spotVisits[spotId] === 1) {
    try {
      const fb = ensureFirebase();
      if (fb) {
        const snap = await fb.firestore()
          .collection('checkins')
          .where('spotPlaceId', '==', spotId)
          .limit(2)
          .get();
        if (snap.size <= 1) {
          stats.firstDiscoveries++;
        }
      }
    } catch {}
  }

  // Check if return visit (3+ times)
  if (stats.spotVisits[spotId] >= 3) {
    stats.returnVisits = Object.values(stats.spotVisits).filter((count) => count >= 3).length;
  }

  // Update streak
  const lastCheckin = stats.lastCheckinDate;
  const today = new Date(timestamp).setHours(0, 0, 0, 0);
  const yesterday = today - 24 * 60 * 60 * 1000;

  if (!lastCheckin) {
    // First check-in
    stats.streakDays = 1;
  } else {
    const lastDay = new Date(lastCheckin).setHours(0, 0, 0, 0);

    if (lastDay === today) {
      // Same day, don't update streak
    } else if (lastDay === yesterday) {
      // Consecutive day
      stats.streakDays++;
      if (stats.streakDays > stats.longestStreak) {
        stats.longestStreak = stats.streakDays;
      }
    } else {
      // Streak broken
      stats.streakDays = 1;
    }
  }

  stats.lastCheckinDate = timestamp;

  // Time-based achievements
  const hour = new Date(timestamp).getHours();
  if (hour >= 22 || hour < 6) {
    stats.nightOwlCheckins++;
  }
  if (hour >= 5 && hour < 8) {
    stats.earlyBirdCheckins++;
  }

  // Weekend check-ins
  const day = new Date(timestamp).getDay();
  if (day === 0 || day === 6) {
    stats.weekendCheckins++;
  }

  // Save stats
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stats));

  // Sync streak to Firestore user doc for campus leaderboard
  try {
    const fb = ensureFirebase();
    const uid = fb?.auth()?.currentUser?.uid;
    if (uid) {
      void updateUserRemote(uid, {
        streakDays: stats.streakDays,
        longestStreak: stats.longestStreak,
      });
    }
  } catch {}

  // Check for new achievements
  await checkAchievements(stats);

  return stats;
}

/**
 * Update friend count
 */
export async function updateFriendsCount(count: number): Promise<void> {
  const stats = await getUserStats();
  stats.friendsCount = count;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
  await checkAchievements(stats);
}

/**
 * Check and unlock new achievements
 */
async function checkAchievements(stats: UserStats): Promise<Achievement[]> {
  const unlockedIds = await getUnlockedAchievementIds();
  const newlyUnlocked: Achievement[] = [];

  for (const achievement of ACHIEVEMENTS) {
    if (unlockedIds.includes(achievement.id)) {
      continue; // Already unlocked
    }

    if (achievement.condition(stats)) {
      // Unlock achievement
      await unlockAchievement(achievement);
      newlyUnlocked.push(achievement);

      // Track analytics
      track('achievement_unlocked', {
        achievement_id: achievement.id,
        achievement_name: achievement.name,
        achievement_tier: achievement.tier,
      });
    }
  }

  return newlyUnlocked;
}

/**
 * Unlock an achievement
 */
async function unlockAchievement(achievement: Achievement): Promise<void> {
  const unlocked = await getUnlockedAchievements();
  const updated = {
    ...achievement,
    unlockedAt: Date.now(),
  };
  unlocked.push(updated);
  await AsyncStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(unlocked));
}

/**
 * Get all unlocked achievements
 */
export async function getUnlockedAchievements(): Promise<Achievement[]> {
  try {
    const json = await AsyncStorage.getItem(ACHIEVEMENTS_KEY);
    if (json) {
      return JSON.parse(json);
    }
  } catch (error) {
    console.error('Failed to load achievements:', error);
  }
  return [];
}

/**
 * Get unlocked achievement IDs
 */
async function getUnlockedAchievementIds(): Promise<string[]> {
  const unlocked = await getUnlockedAchievements();
  return unlocked.map((a) => a.id);
}

/**
 * Get achievement progress
 */
export function getAchievementProgress(achievement: Achievement, stats: UserStats): number {
  // Simple progress calculation based on achievement type
  switch (achievement.id) {
    case 'explorer_bronze':
      return Math.min(100, (stats.uniqueSpots / 5) * 100);
    case 'explorer_silver':
      return Math.min(100, (stats.uniqueSpots / 25) * 100);
    case 'explorer_gold':
      return Math.min(100, (stats.uniqueSpots / 100) * 100);
    case 'social_bronze':
      return Math.min(100, (stats.friendsCount / 10) * 100);
    case 'social_silver':
      return Math.min(100, (stats.friendsCount / 50) * 100);
    case 'streak_bronze':
      return Math.min(100, (stats.streakDays / 3) * 100);
    case 'streak_silver':
      return Math.min(100, (stats.streakDays / 7) * 100);
    case 'streak_gold':
      return Math.min(100, (stats.streakDays / 30) * 100);
    case 'streak_platinum':
      return Math.min(100, (stats.streakDays / 100) * 100);
    default:
      return achievement.condition(stats) ? 100 : 0;
  }
}

/**
 * Reset stats (for testing)
 */
export async function resetStats(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
  await AsyncStorage.removeItem(ACHIEVEMENTS_KEY);
}

export default {
  getUserStats,
  updateStatsAfterCheckin,
  updateFriendsCount,
  getUnlockedAchievements,
  getAchievementProgress,
  ACHIEVEMENTS,
};
