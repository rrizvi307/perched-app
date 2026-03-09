/**
 * Comprehensive Demo Data Seeding
 *
 * Seeds all features for testing:
 * - User stats & achievements
 * - Friends & friend requests
 * - Saved spots
 * - Metrics impact
 * - Recent check-ins with full utility metrics
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserStats } from '../services/gamification';
import { MetricsImpact } from '../services/metricsImpact';

const KEYS = {
  USER_STATS: '@perched_user_stats',
  SAVED_SPOTS: '@perched_saved_spots',
  METRICS_IMPACT: '@perched_metrics_impact',
  FRIENDS: 'spot_friends_v1',
  FRIEND_REQUESTS_INCOMING: '@perched_friend_requests_incoming',
  FRIEND_REQUESTS_OUTGOING: '@perched_friend_requests_outgoing',
  COMPREHENSIVE_LAST_SEEDED_AT: '@perched_demo_comprehensive_last_seeded_at',
};
const COMPREHENSIVE_SEED_TTL_MS = 6 * 60 * 60 * 1000;
const inFlightComprehensiveSeeds = new Map<string, Promise<void>>();

/**
 * Seed comprehensive user stats with unlocked achievements
 */
export async function seedUserStats(userId: string): Promise<void> {
  const stats: UserStats = {
    totalCheckins: 47, // Enough for several achievements
    uniqueSpots: 18,
    friendsCount: 12, // Will match seeded friends
    streakDays: 5,
    longestStreak: 12,
    nightOwlCheckins: 8,
    earlyBirdCheckins: 3,
    weekendCheckins: 15,
    returnVisits: 6,
    firstDiscoveries: 2,
    lastCheckinDate: Date.now() - (4 * 60 * 60 * 1000), // 4 hours ago
    spotVisits: {
      'demo-place-bluebottle': 5,
      'demo-place-fondren': 8,
      'demo-place-wework': 3,
      'demo-place-southside': 7,
      'demo-place-catalina': 4,
      'demo-place-doubletrouble': 3,
      'demo-place-blacksmith': 2,
      'demo-place-starbucksreserve': 6,
      'demo-place-coffeebean': 3,
      'demo-place-roastery': 2,
      'demo-place-boomtown': 4,
    },
  };

  await AsyncStorage.setItem(KEYS.USER_STATS, JSON.stringify(stats));
  console.log('✅ Seeded user stats:', stats.totalCheckins, 'check-ins');
}

/**
 * Seed saved spots (bookmarked spots)
 */
export async function seedSavedSpots(userId: string): Promise<void> {
  const savedSpots = [
    {
      id: 'demo-place-bluebottle',
      name: 'Blue Bottle Coffee',
      placeId: 'demo-place-bluebottle',
      location: { lat: 29.7172, lng: -95.4018 },
      savedAt: Date.now() - (2 * 24 * 60 * 60 * 1000), // 2 days ago
    },
    {
      id: 'demo-place-fondren',
      name: 'Fondren Library - 4th Floor',
      placeId: 'demo-place-fondren',
      location: { lat: 29.7174, lng: -95.4011 },
      savedAt: Date.now() - (5 * 24 * 60 * 60 * 1000), // 5 days ago
    },
    {
      id: 'demo-place-wework',
      name: 'WeWork - River Oaks',
      placeId: 'demo-place-wework',
      location: { lat: 29.7372, lng: -95.3915 },
      savedAt: Date.now() - (1 * 24 * 60 * 60 * 1000), // 1 day ago
    },
  ];

  await AsyncStorage.setItem(KEYS.SAVED_SPOTS, JSON.stringify(savedSpots));
  console.log('✅ Seeded saved spots:', savedSpots.length, 'spots');
}

/**
 * Seed metrics impact data
 */
export async function seedMetricsImpact(userId: string): Promise<void> {
  const impact: MetricsImpact = {
    totalMetricsProvided: 32, // Total metrics across all check-ins
    spotsWithMetrics: 8, // Number of unique spots
    estimatedPeopleHelped: 96, // ~3 people per metric
    lastUpdated: Date.now(),
  };

  await AsyncStorage.setItem(`${KEYS.METRICS_IMPACT}_${userId}`, JSON.stringify(impact));
  console.log('✅ Seeded metrics impact:', impact.totalMetricsProvided, 'metrics shared');
}

/**
 * Seed friend requests (incoming and outgoing)
 */
export async function seedFriendRequests(userId: string): Promise<void> {
  // Incoming friend requests
  const incomingRequests = [
    {
      id: 'req-1',
      fromUserId: 'demo-u13',
      fromUserName: 'Grace Liu',
      fromUserHandle: 'gracel',
      fromUserPhotoUrl: 'https://images.unsplash.com/photo-1547425260-76bcadfb4f2c?auto=format&fit=crop&w=240&q=80',
      createdAt: Date.now() - (6 * 60 * 60 * 1000), // 6 hours ago
      status: 'pending',
    },
    {
      id: 'req-2',
      fromUserId: 'demo-u14',
      fromUserName: 'Diego Martinez',
      fromUserHandle: 'diegom',
      fromUserPhotoUrl: 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=240&q=80',
      createdAt: Date.now() - (12 * 60 * 60 * 1000), // 12 hours ago
      status: 'pending',
    },
  ];

  // Outgoing friend requests
  const outgoingRequests = [
    {
      id: 'req-3',
      toUserId: 'demo-u15',
      toUserName: 'Nina Singh',
      toUserHandle: 'ninasingh',
      toUserPhotoUrl: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=240&q=80',
      createdAt: Date.now() - (24 * 60 * 60 * 1000), // 1 day ago
      status: 'pending',
    },
  ];

  await AsyncStorage.setItem(KEYS.FRIEND_REQUESTS_INCOMING, JSON.stringify(incomingRequests));
  await AsyncStorage.setItem(KEYS.FRIEND_REQUESTS_OUTGOING, JSON.stringify(outgoingRequests));
  console.log('✅ Seeded friend requests:', incomingRequests.length, 'incoming,', outgoingRequests.length, 'outgoing');
}

/**
 * Seed ALL demo data for comprehensive testing
 */
export async function seedComprehensiveDemoData(userId: string): Promise<void> {
  const existing = inFlightComprehensiveSeeds.get(userId);
  if (existing) {
    await existing;
    return;
  }

  const task = (async () => {
    const seedKey = `${KEYS.COMPREHENSIVE_LAST_SEEDED_AT}_${userId}`;
    const now = Date.now();
    try {
      const raw = await AsyncStorage.getItem(seedKey);
      const lastSeededAt = raw ? Number(raw) : 0;
      if (Number.isFinite(lastSeededAt) && lastSeededAt > 0 && now - lastSeededAt < COMPREHENSIVE_SEED_TTL_MS) {
        return;
      }
    } catch {
      // continue with seeding
    }

    console.log('🌱 Seeding comprehensive demo data for user:', userId);

    try {
      await Promise.all([
        seedUserStats(userId),
        seedSavedSpots(userId),
        seedMetricsImpact(userId),
        seedFriendRequests(userId),
      ]);

      console.log('✅ Comprehensive demo data seeded successfully!');
      console.log('');
      console.log('📊 What was seeded:');
      console.log('  • User stats with 47 check-ins');
      console.log('  • 5-day streak with achievements unlocked');
      console.log('  • 3 saved spots');
      console.log('  • 32 metrics shared, ~96 people helped');
      console.log('  • 2 incoming + 1 outgoing friend requests');
      console.log('  • 12 friends (from seedDemoNetwork)');
      await AsyncStorage.setItem(seedKey, String(now));
    } catch (error) {
      console.error('❌ Failed to seed demo data:', error);
      throw error;
    }
  })();

  inFlightComprehensiveSeeds.set(userId, task);
  try {
    await task;
  } finally {
    if (inFlightComprehensiveSeeds.get(userId) === task) {
      inFlightComprehensiveSeeds.delete(userId);
    }
  }
}

/**
 * Clear all demo data
 */
export async function clearDemoData(userId: string): Promise<void> {
  await Promise.all([
    AsyncStorage.removeItem(KEYS.USER_STATS),
    AsyncStorage.removeItem(KEYS.SAVED_SPOTS),
    AsyncStorage.removeItem(`${KEYS.METRICS_IMPACT}_${userId}`),
    AsyncStorage.removeItem(KEYS.FRIEND_REQUESTS_INCOMING),
    AsyncStorage.removeItem(KEYS.FRIEND_REQUESTS_OUTGOING),
    AsyncStorage.removeItem(`${KEYS.COMPREHENSIVE_LAST_SEEDED_AT}_${userId}`),
  ]);

  console.log('🧹 Cleared all demo data');
}
