/**
 * Campus Network Service
 *
 * Manages campus detection, data, leaderboards, and network effects
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureFirebase, getUsersByIdsCached } from './firebaseClient';
import { SimpleLocation } from './location';
import { recordPerfMetric } from './perfMonitor';

export interface Campus {
  id: string;
  name: string;
  shortName: string;
  city: string;
  state: string;
  emoji: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  radius: number; // km
  studentCount?: number;
  color?: string; // Brand color
}

export interface CampusStats {
  campusId: string;
  totalUsers: number;
  activeUsers: number; // Last 7 days
  totalCheckins: number;
  topSpots: Array<{
    placeId: string;
    name: string;
    checkinCount: number;
  }>;
  lastUpdated: number;
}

export interface CampusChallenge {
  id: string;
  campusId: string;
  title: string;
  description: string;
  type: 'visit_spots' | 'check_ins' | 'streak' | 'social';
  target: number;
  reward: string;
  startDate: number;
  endDate: number;
  participants: number;
}

// Curated list of campuses for pilot launch
export const PILOT_CAMPUSES: Campus[] = [
  {
    id: 'rice',
    name: 'Rice University',
    shortName: 'Rice',
    city: 'Houston',
    state: 'TX',
    emoji: '🦉',
    coordinates: { lat: 29.7174, lng: -95.4018 },
    radius: 2,
    studentCount: 7000,
    color: '#00205B',
  },
  {
    id: 'ut-austin',
    name: 'University of Texas at Austin',
    shortName: 'UT Austin',
    city: 'Austin',
    state: 'TX',
    emoji: '🤘',
    coordinates: { lat: 30.2849, lng: -97.7341 },
    radius: 3,
    studentCount: 51000,
    color: '#BF5700',
  },
  {
    id: 'stanford',
    name: 'Stanford University',
    shortName: 'Stanford',
    city: 'Palo Alto',
    state: 'CA',
    emoji: '🌲',
    coordinates: { lat: 37.4275, lng: -122.1697 },
    radius: 3,
    studentCount: 17000,
    color: '#8C1515',
  },
  {
    id: 'mit',
    name: 'Massachusetts Institute of Technology',
    shortName: 'MIT',
    city: 'Cambridge',
    state: 'MA',
    emoji: '🏛️',
    coordinates: { lat: 42.3601, lng: -71.0942 },
    radius: 2,
    studentCount: 11000,
    color: '#A31F34',
  },
  {
    id: 'ucla',
    name: 'University of California, Los Angeles',
    shortName: 'UCLA',
    city: 'Los Angeles',
    state: 'CA',
    emoji: '🐻',
    coordinates: { lat: 34.0689, lng: -118.4452 },
    radius: 3,
    studentCount: 45000,
    color: '#2774AE',
  },
];

const CAMPUS_CACHE_KEY = '@perched_campus_cache';
const CAMPUS_STATS_KEY = '@perched_campus_stats';

/**
 * Detect campus based on user location
 */
export function detectCampusFromLocation(location: SimpleLocation): Campus | null {
  // Calculate distance to each campus
  for (const campus of PILOT_CAMPUSES) {
    const distance = haversineDistance(
      location.lat,
      location.lng,
      campus.coordinates.lat,
      campus.coordinates.lng
    );

    // Check if within campus radius
    if (distance <= campus.radius) {
      return campus;
    }
  }

  return null;
}

/**
 * Get campus by ID
 */
export function getCampusById(campusId: string): Campus | null {
  return PILOT_CAMPUSES.find(c => c.id === campusId) || null;
}

/**
 * Get all pilot campuses
 */
export function getAllPilotCampuses(): Campus[] {
  return PILOT_CAMPUSES;
}

/**
 * Calculate haversine distance between two points (in km)
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

function getCampusAliases(campusId: string): string[] {
  const campus = getCampusById(campusId);
  return Array.from(
    new Set(
      [campusId, campus?.name, campus?.shortName]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim())
    )
  );
}

function getDateFromCheckin(data: any): Date | null {
  const ts = data?.createdAt || data?.timestamp;
  if (!ts) return null;
  if (typeof ts?.toDate === 'function') {
    try {
      return ts.toDate();
    } catch {
      return null;
    }
  }
  if (typeof ts?.seconds === 'number') return new Date(ts.seconds * 1000);
  if (typeof ts === 'number') return new Date(ts);
  const parsed = new Date(ts);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function getCampusCheckins(
  db: any,
  fb: any,
  campusId: string,
  options?: { startDate?: Date; endDate?: Date }
): Promise<any[]> {
  const aliases = getCampusAliases(campusId);
  const merged = new Map<string, any>();
  const startDate = options?.startDate;
  const endDate = options?.endDate;

  const queryField = async (timeField: 'createdAt' | 'timestamp') => {
    await Promise.all(
      aliases.map(async (alias) => {
        try {
          let query: any = db.collection('checkins').where('campus', '==', alias);
          if (startDate) query = query.where(timeField, '>=', fb.firestore.Timestamp.fromDate(startDate));
          if (endDate) query = query.where(timeField, '<', fb.firestore.Timestamp.fromDate(endDate));
          const snap = await query.get();
          snap.forEach((doc: any) => {
            if (merged.has(doc.id)) return;
            merged.set(doc.id, { id: doc.id, ...(doc.data() || {}) });
          });
        } catch {
          // Ignore index/field mismatch for fallback query path.
        }
      })
    );
  };

  await queryField('createdAt');
  if (!merged.size) {
    await queryField('timestamp');
  }

  return Array.from(merged.values());
}

/**
 * Get campus stats
 */
export async function getCampusStats(campusId: string): Promise<CampusStats | null> {
  const startedAt = Date.now();
  try {
    // Try cache first
    const cached = await AsyncStorage.getItem(`${CAMPUS_STATS_KEY}_${campusId}`);
    if (cached) {
      const stats: CampusStats = JSON.parse(cached);
      // Return if fresh (less than 1 hour old)
      if (Date.now() - stats.lastUpdated < 60 * 60 * 1000) {
        void recordPerfMetric('campus_stats_cache_hit', Date.now() - startedAt, true);
        return stats;
      }
    }

    // Fetch from Firebase
    const fb = ensureFirebase();
    if (!fb) return null;

    const db = fb.firestore();
    const campusAliases = getCampusAliases(campusId);

    // Get total users across both canonical and legacy campus fields.
    const userIds = new Set<string>();
    await Promise.all(
      campusAliases.flatMap((alias) => ([
        db.collection('users').where('campus', '==', alias).get(),
        db.collection('users').where('campusOrCity', '==', alias).get(),
      ])).map(async (promise: Promise<any>) => {
        try {
          const snapshot = await promise;
          snapshot.forEach((doc: any) => userIds.add(doc.id));
        } catch {
          // Ignore query/index failures and continue with partial data.
        }
      })
    );
    const totalUsers = userIds.size;

    // Get active users (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const campusCheckins = await getCampusCheckins(db, fb, campusId, { startDate: sevenDaysAgo });

    const activeUserIds = new Set<string>();
    const spotCounts = new Map<string, { name: string; count: number }>();

    campusCheckins.forEach((data) => {
      if (data?.userId) activeUserIds.add(data.userId);

      // Count check-ins per spot
      const placeId = data.spotPlaceId || data.spotName;
      if (!placeId) return;
      const existing = spotCounts.get(placeId);
      if (existing) {
        existing.count++;
      } else {
        spotCounts.set(placeId, { name: data.spotName || 'Unknown', count: 1 });
      }
    });

    // Get top 10 spots
    const topSpots = Array.from(spotCounts.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([placeId, data]) => ({
        placeId,
        name: data.name,
        checkinCount: data.count,
      }));

    const stats: CampusStats = {
      campusId,
      totalUsers,
      activeUsers: activeUserIds.size,
      totalCheckins: campusCheckins.length,
      topSpots,
      lastUpdated: Date.now(),
    };

    // Cache for 1 hour
    await AsyncStorage.setItem(`${CAMPUS_STATS_KEY}_${campusId}`, JSON.stringify(stats));

    void recordPerfMetric('campus_stats', Date.now() - startedAt, true);
    return stats;
  } catch (error) {
    console.error('Failed to get campus stats:', error);
    void recordPerfMetric('campus_stats', Date.now() - startedAt, false);
    return null;
  }
}

/**
 * Get campus leaderboard
 */
export async function getCampusLeaderboard(
  campusId: string,
  period: 'week' | 'month' | 'all' = 'month',
  limit: number = 50
): Promise<Array<{
  userId: string;
  userName: string;
  photoUrl?: string;
  checkinCount: number;
  streak: number;
  rank: number;
}>> {
  const startedAt = Date.now();
  try {
    const fb = ensureFirebase();
    if (!fb) return [];

    const db = fb.firestore();

    // Calculate time range
    let startDate = new Date();
    if (period === 'week') {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === 'month') {
      startDate.setMonth(startDate.getMonth() - 1);
    } else {
      // All time
      startDate = new Date(0);
    }

    // Get check-ins for campus
    const checkins = await getCampusCheckins(db, fb, campusId, { startDate });

    // Aggregate by user
    const userCounts = new Map<string, number>();
    checkins.forEach((data) => {
      if (!data?.userId) return;
      const checkinDate = getDateFromCheckin(data);
      if (!checkinDate || checkinDate < startDate) return;
      const count = userCounts.get(data.userId) || 0;
      userCounts.set(data.userId, count + 1);
    });

    // Sort and limit
    const sorted = Array.from(userCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    const rankedUserIds = sorted.map(([userId]) => userId);
    const users = await getUsersByIdsCached(rankedUserIds, 60_000);
    const userById = new Map<string, any>(users.map((entry: any) => [entry.id, entry]));
    const leaderboard = sorted.map(([userId, checkinCount], index) => {
      const userData: any = userById.get(userId);
      const streak = userData?.streakDays ?? 0;
      return {
        userId,
        userName: userData?.name || 'Anonymous',
        photoUrl: userData?.photoUrl,
        checkinCount,
        streak,
        rank: index + 1,
      };
    });

    void recordPerfMetric('campus_leaderboard', Date.now() - startedAt, true);
    return leaderboard;
  } catch (error) {
    console.error('Failed to get campus leaderboard:', error);
    void recordPerfMetric('campus_leaderboard', Date.now() - startedAt, false);
    return [];
  }
}

/**
 * Get active campus challenges
 */
export async function getCampusChallenges(campusId: string): Promise<CampusChallenge[]> {
  try {
    const fb = ensureFirebase();
    if (!fb) return [];

    const db = fb.firestore();
    const now = Date.now();

    const snapshot = await db
      .collection('campusChallenges')
      .where('campusId', '==', campusId)
      .where('endDate', '>=', now)
      .orderBy('endDate', 'asc')
      .get();

    const challenges: CampusChallenge[] = [];
    snapshot.forEach((doc: any) => {
      const data = doc.data();
      challenges.push({
        id: doc.id,
        campusId: data.campusId,
        title: data.title,
        description: data.description,
        type: data.type,
        target: data.target,
        reward: data.reward,
        startDate: data.startDate,
        endDate: data.endDate,
        participants: data.participants || 0,
      });
    });

    return challenges;
  } catch (error) {
    console.error('Failed to get campus challenges:', error);
    return [];
  }
}

/**
 * Check if user is a campus ambassador
 */
export async function isCampusAmbassador(userId: string, campusId: string): Promise<boolean> {
  try {
    const fb = ensureFirebase();
    if (!fb) return false;

    const db = fb.firestore();
    const doc = await db.collection('campusAmbassadors').doc(`${campusId}_${userId}`).get();

    return doc.exists;
  } catch (error) {
    console.error('Failed to check ambassador status:', error);
    return false;
  }
}

/**
 * Get campus ambassador rank (based on referrals and activity)
 */
export async function getCampusAmbassadorRank(
  userId: string,
  campusId: string
): Promise<number | null> {
  try {
    const fb = ensureFirebase();
    if (!fb) return null;

    const db = fb.firestore();

    // Get all ambassadors for campus with their stats
    const ambassadorsSnapshot = await db
      .collection('campusAmbassadors')
      .where('campusId', '==', campusId)
      .get();

    const ambassadors: Array<{ userId: string; score: number }> = ambassadorsSnapshot.docs.map((doc: any) => ({
      userId: doc.data().userId,
      score: doc.data().referrals * 10 + doc.data().checkins,
    }));

    // Sort by score
    ambassadors.sort((a: { userId: string; score: number }, b: { userId: string; score: number }) => b.score - a.score);

    // Find user's rank
    const rank = ambassadors.findIndex((a: { userId: string; score: number }) => a.userId === userId);
    return rank >= 0 ? rank + 1 : null;
  } catch (error) {
    console.error('Failed to get ambassador rank:', error);
    return null;
  }
}

/**
 * Clear campus stats cache
 */
export async function clearCampusStatsCache(campusId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${CAMPUS_STATS_KEY}_${campusId}`);
  } catch (error) {
    console.warn('Failed to clear campus stats cache:', error);
  }
}
