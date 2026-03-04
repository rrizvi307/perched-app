import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCheckins } from '@/storage/local';
import { track } from './analytics';
import { ensureFirebase, getCheckinsForUserRemote, updateUserRemote } from './firebaseClient';

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

export interface AchievementProgressDetails {
  current: number;
  target: number;
  percent: number;
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
const DAY_MS = 24 * 60 * 60 * 1000;

function createDefaultStats(): UserStats {
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

function getActiveUserId(): string | null {
  try {
    const fb = ensureFirebase();
    return fb?.auth()?.currentUser?.uid || null;
  } catch {
    return null;
  }
}

function getScopedStorageKey(baseKey: string, userId: string | null) {
  return userId ? `${baseKey}:${userId}` : baseKey;
}

async function readStorageWithLegacyFallback<T>(baseKey: string, userId: string | null): Promise<T | null> {
  const scopedKey = getScopedStorageKey(baseKey, userId);
  const keysToTry = scopedKey === baseKey ? [baseKey] : [scopedKey, baseKey];

  for (const key of keysToTry) {
    try {
      const json = await AsyncStorage.getItem(key);
      if (!json) continue;
      const parsed = JSON.parse(json) as T;
      if (key !== scopedKey) {
        await AsyncStorage.setItem(scopedKey, json);
      }
      return parsed;
    } catch (error) {
      console.error(`Failed to read ${key}:`, error);
    }
  }

  return null;
}

function toMillis(value: any): number {
  if (!value) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value?.toMillis === 'function') {
    try {
      return value.toMillis();
    } catch {}
  }
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDayStart(ms: number): number {
  const date = new Date(ms);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function mergeWithDefaults(raw: Partial<UserStats> | null | undefined): UserStats {
  return {
    ...createDefaultStats(),
    ...(raw || {}),
    spotVisits: raw?.spotVisits && typeof raw.spotVisits === 'object' ? raw.spotVisits : {},
  };
}

function checkinIdentity(item: any): string {
  const clientId = typeof item?.clientId === 'string' ? item.clientId.trim() : '';
  if (clientId) return `client:${clientId}`;
  const id = typeof item?.id === 'string' ? item.id.trim() : '';
  if (id) return `id:${id}`;
  const spotId = String(item?.spotPlaceId || item?.spotName || item?.spot || '').trim();
  const ts = toMillis(item?.createdAt || item?.timestamp);
  if (spotId && ts > 0) return `spot:${spotId}:${ts}`;
  return '';
}

function mergeUniqueCheckins(remote: any[], local: any[]): any[] {
  const merged = new Map<string, any>();
  [...(remote || []), ...(local || [])].forEach((item: any) => {
    const key = checkinIdentity(item) || `fallback:${merged.size}`;
    const existing = merged.get(key);
    if (!existing || toMillis(item?.createdAt || item?.timestamp) >= toMillis(existing?.createdAt || existing?.timestamp)) {
      merged.set(key, item);
    }
  });
  return Array.from(merged.values());
}

async function getMergedCheckinsForUser(userId: string): Promise<any[]> {
  const local = await getCheckins().catch(() => []);
  const mineLocal = (local || []).filter((item: any) => item?.userId === userId);

  let remoteItems: any[] = [];
  try {
    let cursor: any = undefined;
    let page = 0;
    const pageSize = 200;
    while (page < 5) {
      const response = await getCheckinsForUserRemote(userId, pageSize, cursor);
      const batch = Array.isArray(response) ? response : (response?.items || []);
      if (!batch.length) break;
      remoteItems = remoteItems.concat(batch);
      if (batch.length < pageSize) break;
      cursor = response?.lastCursor || batch[batch.length - 1]?.createdAt || batch[batch.length - 1]?.timestamp;
      if (!cursor) break;
      page += 1;
    }
  } catch {}

  return mergeUniqueCheckins(remoteItems, mineLocal).filter((item: any) => item?.userId === userId);
}

function buildStatsFromCheckins(checkins: any[], seed: UserStats): UserStats {
  const normalized = (checkins || [])
    .map((item: any) => ({ item, ts: toMillis(item?.createdAt || item?.timestamp) }))
    .filter((entry) => entry.ts > 0)
    .sort((a, b) => b.ts - a.ts);

  const spotVisits: Record<string, number> = {};
  let nightOwlCheckins = 0;
  let earlyBirdCheckins = 0;
  let weekendCheckins = 0;
  const dayStarts = new Set<number>();

  normalized.forEach(({ item, ts }) => {
    const spotId = String(item?.spotPlaceId || item?.spotName || item?.spot || '').trim();
    if (spotId) {
      spotVisits[spotId] = (spotVisits[spotId] || 0) + 1;
    }
    const date = new Date(ts);
    const hour = date.getHours();
    const day = date.getDay();
    if (hour >= 22 || hour < 6) nightOwlCheckins += 1;
    if (hour >= 5 && hour < 8) earlyBirdCheckins += 1;
    if (day === 0 || day === 6) weekendCheckins += 1;
    dayStarts.add(toDayStart(ts));
  });

  const sortedDaysAsc = Array.from(dayStarts).sort((a, b) => a - b);
  let longestStreak = 0;
  let rolling = 0;
  let previousDay: number | null = null;
  sortedDaysAsc.forEach((dayStart) => {
    if (previousDay !== null && dayStart - previousDay === DAY_MS) {
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
      cursor -= DAY_MS;
    }
  }

  const uniqueSpots = Object.keys(spotVisits).length;
  const returnVisits = Object.values(spotVisits).filter((count) => count >= 3).length;
  const totalCheckins = normalized.length;
  const latestCheckinTs = normalized[0]?.ts || seed.lastCheckinDate;

  return {
    ...seed,
    totalCheckins,
    uniqueSpots,
    streakDays,
    longestStreak: Math.max(seed.longestStreak || 0, longestStreak),
    nightOwlCheckins,
    earlyBirdCheckins,
    weekendCheckins,
    returnVisits,
    lastCheckinDate: latestCheckinTs,
    spotVisits,
    firstDiscoveries: seed.firstDiscoveries || 0,
  };
}

/**
 * Get user stats
 */
export async function getUserStats(options: { reconcileFromCheckins?: boolean } = {}): Promise<UserStats> {
  const reconcileFromCheckins = options.reconcileFromCheckins !== false;
  const userId = getActiveUserId();
  const storageKey = getScopedStorageKey(STORAGE_KEY, userId);
  let stats = createDefaultStats();

  try {
    const stored = await readStorageWithLegacyFallback<UserStats>(STORAGE_KEY, userId);
    if (stored) stats = mergeWithDefaults(stored);
  } catch (error) {
    console.error('Failed to load user stats:', error);
  }

  if (reconcileFromCheckins && userId) {
    try {
      const mine = await getMergedCheckinsForUser(userId);
      if (mine.length > 0) {
        const nextStats = buildStatsFromCheckins(mine, stats);
        const prevFingerprint = JSON.stringify(stats);
        const nextFingerprint = JSON.stringify(nextStats);
        if (prevFingerprint !== nextFingerprint) {
          stats = nextStats;
          await AsyncStorage.setItem(storageKey, JSON.stringify(stats));
          await checkAchievements(stats, userId);
        }
      } else if (stats.totalCheckins !== 0 || stats.uniqueSpots !== 0) {
        stats = {
          ...stats,
          totalCheckins: 0,
          uniqueSpots: 0,
          streakDays: 0,
          nightOwlCheckins: 0,
          earlyBirdCheckins: 0,
          weekendCheckins: 0,
          returnVisits: 0,
          lastCheckinDate: undefined,
          spotVisits: {},
        };
        await AsyncStorage.setItem(storageKey, JSON.stringify(stats));
      }
    } catch (error) {
      console.error('Failed to reconcile stats from check-ins:', error);
    }
  }

  return stats;
}

/**
 * Update user stats after check-in
 */
export async function updateStatsAfterCheckin(
  spotId: string,
  timestamp: number = Date.now()
): Promise<UserStats> {
  const userId = getActiveUserId();
  const storageKey = getScopedStorageKey(STORAGE_KEY, userId);
  const stats = await getUserStats({ reconcileFromCheckins: false });

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
  await AsyncStorage.setItem(storageKey, JSON.stringify(stats));

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
  await checkAchievements(stats, userId);

  return stats;
}

/**
 * Update friend count
 */
export async function updateFriendsCount(count: number): Promise<void> {
  const userId = getActiveUserId();
  const storageKey = getScopedStorageKey(STORAGE_KEY, userId);
  const stats = await getUserStats({ reconcileFromCheckins: false });
  stats.friendsCount = count;
  await AsyncStorage.setItem(storageKey, JSON.stringify(stats));
  await checkAchievements(stats, userId);
}

/**
 * Check and unlock new achievements
 */
async function checkAchievements(stats: UserStats, userId: string | null = getActiveUserId()): Promise<Achievement[]> {
  const unlockedIds = await getUnlockedAchievementIds(userId);
  const newlyUnlocked: Achievement[] = [];

  for (const achievement of ACHIEVEMENTS) {
    if (unlockedIds.includes(achievement.id)) {
      continue; // Already unlocked
    }

    if (achievement.condition(stats)) {
      // Unlock achievement
      await unlockAchievement(achievement, userId);
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
async function unlockAchievement(achievement: Achievement, userId: string | null = getActiveUserId()): Promise<void> {
  const storageKey = getScopedStorageKey(ACHIEVEMENTS_KEY, userId);
  const unlocked = await getUnlockedAchievements(userId);
  const updated = {
    ...achievement,
    unlockedAt: Date.now(),
  };
  unlocked.push(updated);
  await AsyncStorage.setItem(storageKey, JSON.stringify(unlocked));
}

/**
 * Get all unlocked achievements
 */
export async function getUnlockedAchievements(userId: string | null = getActiveUserId()): Promise<Achievement[]> {
  try {
    const stored = await readStorageWithLegacyFallback<Achievement[]>(ACHIEVEMENTS_KEY, userId);
    if (stored) return stored;
  } catch (error) {
    console.error('Failed to load achievements:', error);
  }
  return [];
}

/**
 * Get unlocked achievement IDs
 */
async function getUnlockedAchievementIds(userId: string | null = getActiveUserId()): Promise<string[]> {
  const unlocked = await getUnlockedAchievements(userId);
  return unlocked.map((a) => a.id);
}

/**
 * Get achievement progress
 */
export function getAchievementProgressDetails(
  achievement: Achievement,
  stats: UserStats
): AchievementProgressDetails {
  const progressFor = (current: number, target: number): AchievementProgressDetails => ({
    current: Math.max(0, current),
    target,
    percent: Math.max(0, Math.min(100, (current / target) * 100)),
  });

  switch (achievement.id) {
    case 'explorer_bronze':
      return progressFor(stats.uniqueSpots, 5);
    case 'explorer_silver':
      return progressFor(stats.uniqueSpots, 25);
    case 'explorer_gold':
      return progressFor(stats.uniqueSpots, 100);

    case 'social_bronze':
      return progressFor(stats.friendsCount, 10);
    case 'social_silver':
      return progressFor(stats.friendsCount, 50);

    case 'streak_bronze':
      return progressFor(stats.streakDays, 3);
    case 'streak_silver':
      return progressFor(stats.streakDays, 7);
    case 'streak_gold':
      return progressFor(stats.streakDays, 30);
    case 'streak_platinum':
      return progressFor(stats.streakDays, 100);

    case 'night_owl':
      return progressFor(stats.nightOwlCheckins, 10);
    case 'early_bird':
      return progressFor(stats.earlyBirdCheckins, 10);
    case 'weekend_warrior':
      return progressFor(stats.weekendCheckins, 20);

    case 'loyal_bronze':
      return progressFor(stats.returnVisits, 5);
    case 'loyal_silver':
      return progressFor(stats.returnVisits, 20);

    case 'trendsetter':
      return progressFor(stats.firstDiscoveries, 5);

    default: {
      const target = 1;
      const current = achievement.condition(stats) ? 1 : 0;
      return progressFor(current, target);
    }
  }
}

export function getAchievementProgress(achievement: Achievement, stats: UserStats): number {
  return getAchievementProgressDetails(achievement, stats).percent;
}

/**
 * Reset stats (for testing)
 */
export async function resetStats(): Promise<void> {
  const userId = getActiveUserId();
  const keys = Array.from(new Set([
    STORAGE_KEY,
    ACHIEVEMENTS_KEY,
    getScopedStorageKey(STORAGE_KEY, userId),
    getScopedStorageKey(ACHIEVEMENTS_KEY, userId),
  ]));
  await AsyncStorage.multiRemove(keys);
}

export default {
  getUserStats,
  updateStatsAfterCheckin,
  updateFriendsCount,
  getUnlockedAchievements,
  getAchievementProgress,
  ACHIEVEMENTS,
};
