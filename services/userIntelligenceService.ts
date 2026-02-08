/**
 * User Intelligence Service
 *
 * Derives smart insights from USER-GENERATED DATA without external APIs.
 * This creates a data flywheel: more users → more data → smarter app → more users.
 *
 * Key insights derived:
 * 1. Trending spots (recent activity surge)
 * 2. Hidden gems (high ratings, low visibility)
 * 3. Popular times (from check-in timestamps)
 * 4. User preferences (from check-in history)
 * 5. Similar users (for recommendations)
 * 6. Spot similarity (users who like X also like Y)
 */

import { ensureFirebase } from './firebaseClient';

// ============ TYPES ============

export type UserPreferenceProfile = {
  userId: string;

  // Derived preferences (0-1 scale)
  prefersQuiet: number;
  prefersLively: number;
  prefersCafes: number;
  prefersLibraries: number;
  prefersCoworking: number;

  // Time patterns
  typicalCheckInHour: number; // Most common hour
  weekendRatio: number; // 0-1, how often they check in on weekends
  morningPerson: number; // 0-1
  eveningPerson: number; // 0-1

  // Spot preferences
  favoriteSpotIds: string[];
  favoriteCategories: string[];
  favoriteTags: string[];

  // Social
  checkInCount: number;
  uniqueSpotsVisited: number;
  avgRating: number;

  // Computed at
  lastUpdated: number;
};

export type SpotIntelligence = {
  placeId: string;
  name: string;

  // Trending score (based on recent activity)
  trendingScore: number; // 0-100
  trendingDirection: 'up' | 'down' | 'stable';

  // Popularity
  totalCheckIns: number;
  uniqueVisitors: number;
  repeatVisitorRatio: number; // High = people come back

  // User-derived ratings
  avgUserRating: number;
  ratingCount: number;

  // Popular times (derived from check-in timestamps)
  popularHours: number[]; // 24 hours, each is 0-100
  busiestDay: number; // 0-6 (Sun-Sat)
  busiestHour: number;

  // User segments who love this spot
  lovedByStudents: number; // 0-1
  lovedByRemoteWorkers: number;
  lovedByCasual: number;

  // Hidden gem score (high quality, low visibility)
  hiddenGemScore: number;

  // Similar spots (collaborative filtering)
  similarSpotIds: string[];

  // Tags derived from user check-ins
  derivedTags: string[];

  // Freshness
  lastUpdated: number;
};

export type TrendingSpot = {
  placeId: string;
  name: string;
  score: number;
  checkInsLast7Days: number;
  checkInsPrevious7Days: number;
  percentChange: number;
  topReason: string; // "20 check-ins this week" or "5 new visitors"
};

export type PersonalizedRecommendation = {
  placeId: string;
  name: string;
  score: number;
  reason: string; // "Because you liked Boomtown Coffee"
  matchedPreferences: string[];
};

// ============ USER PREFERENCE ANALYSIS ============

/**
 * Build a user preference profile from their check-in history
 */
export async function buildUserPreferenceProfile(userId: string): Promise<UserPreferenceProfile | null> {
  try {
    const fb = ensureFirebase();
    if (!fb) return null;

    // Get user's check-ins
    const checkinsSnap = await fb.firestore()
      .collection('checkins')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();

    if (checkinsSnap.empty) return null;

    const checkins = checkinsSnap.docs.map((d: any) => d.data());

    // Analyze patterns
    let quietCount = 0;
    let livelyCount = 0;
    let cafeCount = 0;
    let libraryCount = 0;
    let coworkCount = 0;
    let weekendCount = 0;
    let morningCount = 0; // 6am-12pm
    let eveningCount = 0; // 6pm-12am
    const hourCounts = new Array(24).fill(0);
    const spotCounts: Record<string, number> = {};
    const tagCounts: Record<string, number> = {};
    const categorySet = new Set<string>();
    let totalRating = 0;
    let ratingCount = 0;

    checkins.forEach((c: any) => {
      // Get timestamp
      const ts = c.createdAt?.seconds ? c.createdAt.seconds * 1000 : Date.now();
      const date = new Date(ts);
      const hour = date.getHours();
      const dayOfWeek = date.getDay();

      hourCounts[hour]++;
      if (dayOfWeek === 0 || dayOfWeek === 6) weekendCount++;
      if (hour >= 6 && hour < 12) morningCount++;
      if (hour >= 18 && hour < 24) eveningCount++;

      // Analyze spot type
      const spotName = (c.spotName || '').toLowerCase();
      const tags = c.tags || [];

      if (spotName.includes('library') || spotName.includes('study')) {
        libraryCount++;
        categorySet.add('library');
      }
      if (spotName.includes('coffee') || spotName.includes('cafe') || spotName.includes('café')) {
        cafeCount++;
        categorySet.add('cafe');
      }
      if (spotName.includes('cowork') || spotName.includes('wework')) {
        coworkCount++;
        categorySet.add('coworking');
      }

      // Analyze tags
      tags.forEach((tag: string) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        if (tag.toLowerCase().includes('quiet')) quietCount++;
        if (tag.toLowerCase().includes('lively') || tag.toLowerCase().includes('social')) livelyCount++;
      });

      // Count spot visits
      const spotKey = c.spotPlaceId || c.spotName;
      if (spotKey) {
        spotCounts[spotKey] = (spotCounts[spotKey] || 0) + 1;
      }

      // Track ratings
      if (typeof c.rating === 'number') {
        totalRating += c.rating;
        ratingCount++;
      }
    });

    const total = checkins.length;

    // Find most common hour
    const typicalCheckInHour = hourCounts.indexOf(Math.max(...hourCounts));

    // Find favorite spots (visited 2+ times)
    const favoriteSpotIds = Object.entries(spotCounts)
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([spotId]) => spotId);

    // Find favorite tags
    const favoriteTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag);

    const profile: UserPreferenceProfile = {
      userId,
      prefersQuiet: total > 0 ? quietCount / total : 0.5,
      prefersLively: total > 0 ? livelyCount / total : 0.5,
      prefersCafes: total > 0 ? cafeCount / total : 0.5,
      prefersLibraries: total > 0 ? libraryCount / total : 0.3,
      prefersCoworking: total > 0 ? coworkCount / total : 0.2,
      typicalCheckInHour,
      weekendRatio: total > 0 ? weekendCount / total : 0.3,
      morningPerson: total > 0 ? morningCount / total : 0.3,
      eveningPerson: total > 0 ? eveningCount / total : 0.3,
      favoriteSpotIds,
      favoriteCategories: Array.from(categorySet),
      favoriteTags,
      checkInCount: total,
      uniqueSpotsVisited: Object.keys(spotCounts).length,
      avgRating: ratingCount > 0 ? totalRating / ratingCount : 0,
      lastUpdated: Date.now(),
    };

    // Cache the profile
    await cacheUserProfile(userId, profile);

    return profile;
  } catch (error) {
    console.error('[UserIntel] Error building profile:', error);
    return null;
  }
}

async function cacheUserProfile(userId: string, profile: UserPreferenceProfile): Promise<void> {
  try {
    const fb = ensureFirebase();
    if (!fb) return;

    await fb.firestore().collection('userProfiles').doc(userId).set(profile);
  } catch (error) {
    console.error('[UserIntel] Error caching profile:', error);
  }
}

export async function getCachedUserProfile(userId: string): Promise<UserPreferenceProfile | null> {
  try {
    const fb = ensureFirebase();
    if (!fb) return null;

    const doc = await fb.firestore().collection('userProfiles').doc(userId).get();
    if (!doc.exists) return null;

    const profile = doc.data() as UserPreferenceProfile;

    // Refresh if older than 1 day
    if (Date.now() - profile.lastUpdated > 24 * 60 * 60 * 1000) {
      // Trigger background refresh
      buildUserPreferenceProfile(userId).catch(() => {});
    }

    return profile;
  } catch (error) {
    return null;
  }
}

// ============ SPOT INTELLIGENCE ============

/**
 * Build intelligence for a spot from all user check-ins
 */
export async function buildSpotIntelligence(placeId: string, spotName: string): Promise<SpotIntelligence | null> {
  try {
    const fb = ensureFirebase();
    if (!fb) return null;

    // Get all check-ins for this spot
    const checkinsSnap = await fb.firestore()
      .collection('checkins')
      .where('spotPlaceId', '==', placeId)
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get();

    if (checkinsSnap.empty) return null;

    const checkins = checkinsSnap.docs.map((d: any) => d.data());
    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;

    // Analyze check-ins
    const hourCounts = new Array(24).fill(0);
    const dayCounts = new Array(7).fill(0);
    const userVisits: Record<string, number> = {};
    const tagCounts: Record<string, number> = {};
    let last7DaysCount = 0;
    let prev7DaysCount = 0;
    let totalRating = 0;
    let ratingCount = 0;

    // User segment counters (simplified heuristic)
    let studentSignals = 0;
    let remoteWorkerSignals = 0;
    let casualSignals = 0;

    checkins.forEach((c: any) => {
      const ts = c.createdAt?.seconds ? c.createdAt.seconds * 1000 : now;
      const date = new Date(ts);
      const hour = date.getHours();
      const day = date.getDay();

      hourCounts[hour]++;
      dayCounts[day]++;

      // Trending calculation
      if (ts >= oneWeekAgo) last7DaysCount++;
      else if (ts >= twoWeeksAgo) prev7DaysCount++;

      // User visits
      if (c.userId) {
        userVisits[c.userId] = (userVisits[c.userId] || 0) + 1;
      }

      // Tags
      (c.tags || []).forEach((tag: string) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });

      // Ratings
      if (typeof c.rating === 'number') {
        totalRating += c.rating;
        ratingCount++;
      }

      // User segment signals (heuristic based on check-in time and tags)
      if (hour >= 9 && hour <= 17) remoteWorkerSignals++;
      if (hour >= 18 || hour <= 8) {
        if (day === 0 || day === 6) casualSignals++;
        else studentSignals++;
      }
      if ((c.tags || []).some((t: string) => t.toLowerCase().includes('study'))) studentSignals++;
      if ((c.tags || []).some((t: string) => t.toLowerCase().includes('work') || t.toLowerCase().includes('wifi'))) remoteWorkerSignals++;
    });

    const total = checkins.length;
    const uniqueVisitors = Object.keys(userVisits).length;
    const repeatVisitors = Object.values(userVisits).filter(v => v >= 2).length;

    // Calculate trending
    const percentChange = prev7DaysCount > 0
      ? ((last7DaysCount - prev7DaysCount) / prev7DaysCount) * 100
      : last7DaysCount > 0 ? 100 : 0;

    const trendingScore = Math.min(100, Math.max(0,
      50 + (percentChange / 2) + (last7DaysCount * 2)
    ));

    const trendingDirection: 'up' | 'down' | 'stable' =
      percentChange > 10 ? 'up' : percentChange < -10 ? 'down' : 'stable';

    // Popular hours (normalize to 0-100)
    const maxHour = Math.max(...hourCounts, 1);
    const popularHours = hourCounts.map(c => Math.round((c / maxHour) * 100));

    // Hidden gem score: high rating + low visibility
    const avgRating = ratingCount > 0 ? totalRating / ratingCount : 3;
    const visibility = Math.min(1, total / 100); // Normalize, cap at 100 check-ins
    const hiddenGemScore = avgRating >= 4 && visibility < 0.3
      ? Math.round((avgRating / 5) * (1 - visibility) * 100)
      : 0;

    // Derived tags (top 5 most common)
    const derivedTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag]) => tag);

    // User segment ratios
    const totalSignals = studentSignals + remoteWorkerSignals + casualSignals || 1;

    const intelligence: SpotIntelligence = {
      placeId,
      name: spotName,
      trendingScore,
      trendingDirection,
      totalCheckIns: total,
      uniqueVisitors,
      repeatVisitorRatio: uniqueVisitors > 0 ? repeatVisitors / uniqueVisitors : 0,
      avgUserRating: avgRating,
      ratingCount,
      popularHours,
      busiestDay: dayCounts.indexOf(Math.max(...dayCounts)),
      busiestHour: hourCounts.indexOf(Math.max(...hourCounts)),
      lovedByStudents: studentSignals / totalSignals,
      lovedByRemoteWorkers: remoteWorkerSignals / totalSignals,
      lovedByCasual: casualSignals / totalSignals,
      hiddenGemScore,
      similarSpotIds: [], // Computed separately via collaborative filtering
      derivedTags,
      lastUpdated: now,
    };

    // Cache the intelligence
    await cacheSpotIntelligence(placeId, intelligence);

    return intelligence;
  } catch (error) {
    console.error('[UserIntel] Error building spot intel:', error);
    return null;
  }
}

async function cacheSpotIntelligence(placeId: string, intel: SpotIntelligence): Promise<void> {
  try {
    const fb = ensureFirebase();
    if (!fb) return;

    await fb.firestore().collection('spotIntelligence').doc(placeId).set(intel);
  } catch (error) {
    console.error('[UserIntel] Error caching spot intel:', error);
  }
}

// ============ TRENDING SPOTS ============

/**
 * Get trending spots based on recent check-in activity
 */
export async function getTrendingSpots(limit = 10): Promise<TrendingSpot[]> {
  try {
    const fb = ensureFirebase();
    if (!fb) return [];

    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;

    // Get recent check-ins
    const recentSnap = await fb.firestore()
      .collection('checkins')
      .where('createdAt', '>=', new Date(twoWeeksAgo))
      .orderBy('createdAt', 'desc')
      .limit(1000)
      .get();

    // Aggregate by spot
    const spotStats: Record<string, {
      name: string;
      last7: number;
      prev7: number;
    }> = {};

    recentSnap.docs.forEach((doc: any) => {
      const c = doc.data();
      const placeId = c.spotPlaceId;
      if (!placeId) return;

      const ts = c.createdAt?.seconds ? c.createdAt.seconds * 1000 : now;

      if (!spotStats[placeId]) {
        spotStats[placeId] = { name: c.spotName || 'Unknown', last7: 0, prev7: 0 };
      }

      if (ts >= oneWeekAgo) {
        spotStats[placeId].last7++;
      } else {
        spotStats[placeId].prev7++;
      }
    });

    // Calculate trending scores
    const trending: TrendingSpot[] = Object.entries(spotStats)
      .map(([placeId, stats]) => {
        const percentChange = stats.prev7 > 0
          ? ((stats.last7 - stats.prev7) / stats.prev7) * 100
          : stats.last7 > 0 ? 100 : 0;

        const score = stats.last7 * 10 + percentChange;

        return {
          placeId,
          name: stats.name,
          score,
          checkInsLast7Days: stats.last7,
          checkInsPrevious7Days: stats.prev7,
          percentChange,
          topReason: stats.last7 > stats.prev7
            ? `${stats.last7} check-ins this week (+${Math.round(percentChange)}%)`
            : `${stats.last7} check-ins this week`,
        };
      })
      .filter(s => s.checkInsLast7Days >= 2) // At least 2 check-ins
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return trending;
  } catch (error) {
    console.error('[UserIntel] Error getting trending:', error);
    return [];
  }
}

// ============ PERSONALIZED RECOMMENDATIONS ============

/**
 * Get personalized spot recommendations for a user
 */
export async function getPersonalizedRecommendations(
  userId: string,
  limit = 10
): Promise<PersonalizedRecommendation[]> {
  try {
    // Get user profile
    let profile = await getCachedUserProfile(userId);
    if (!profile) {
      profile = await buildUserPreferenceProfile(userId);
    }
    if (!profile) return [];

    const fb = ensureFirebase();
    if (!fb) return [];

    // Get spots the user hasn't visited yet
    const allSpotsSnap = await fb.firestore()
      .collection('spotIntelligence')
      .orderBy('trendingScore', 'desc')
      .limit(50)
      .get();

    const visitedSet = new Set(profile.favoriteSpotIds);

    const recommendations: PersonalizedRecommendation[] = [];

    allSpotsSnap.docs.forEach((doc: any) => {
      const intel = doc.data() as SpotIntelligence;

      // Skip already visited
      if (visitedSet.has(intel.placeId)) return;

      // Calculate match score based on preferences
      let score = 0;
      const matchedPreferences: string[] = [];

      // Match on user segments
      if (profile!.prefersQuiet > 0.5 && intel.derivedTags.includes('quiet')) {
        score += 20;
        matchedPreferences.push('Quiet atmosphere');
      }

      if (profile!.prefersCafes > 0.5 && intel.name.toLowerCase().includes('coffee')) {
        score += 15;
        matchedPreferences.push('Coffee shop');
      }

      if (profile!.prefersLibraries > 0.3 && intel.name.toLowerCase().includes('library')) {
        score += 15;
        matchedPreferences.push('Library');
      }

      // Match on popular times
      if (intel.popularHours[profile!.typicalCheckInHour] > 50) {
        score += 10;
        matchedPreferences.push('Popular at your usual time');
      }

      // Boost for high ratings
      if (intel.avgUserRating >= 4) {
        score += intel.avgUserRating * 5;
        matchedPreferences.push(`${intel.avgUserRating.toFixed(1)}★ rating`);
      }

      // Boost for hidden gems if user likes them
      if (intel.hiddenGemScore > 50) {
        score += 15;
        matchedPreferences.push('Hidden gem');
      }

      // Boost trending spots
      if (intel.trendingScore > 70) {
        score += 10;
        matchedPreferences.push('Trending');
      }

      if (score > 0) {
        // Generate reason
        const reason = profile!.favoriteSpotIds.length > 0
          ? `Based on your visits to ${profile!.favoriteSpotIds.length} similar spots`
          : matchedPreferences[0] || 'Recommended for you';

        recommendations.push({
          placeId: intel.placeId,
          name: intel.name,
          score,
          reason,
          matchedPreferences,
        });
      }
    });

    return recommendations
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  } catch (error) {
    console.error('[UserIntel] Error getting recommendations:', error);
    return [];
  }
}

// ============ COLLABORATIVE FILTERING ============

/**
 * Find similar spots based on user overlap (users who like X also like Y)
 */
export async function findSimilarSpots(placeId: string, limit = 5): Promise<string[]> {
  try {
    const fb = ensureFirebase();
    if (!fb) return [];

    // Get users who visited this spot
    const visitorsSnap = await fb.firestore()
      .collection('checkins')
      .where('spotPlaceId', '==', placeId)
      .limit(100)
      .get();

    const visitorIds = new Set(visitorsSnap.docs.map((d: any) => d.data().userId).filter(Boolean));

    if (visitorIds.size < 2) return [];

    // Get other spots these users visited
    const otherSpotCounts: Record<string, number> = {};

    for (const visitorId of Array.from(visitorIds).slice(0, 20)) {
      const userCheckinsSnap = await fb.firestore()
        .collection('checkins')
        .where('userId', '==', visitorId)
        .limit(50)
        .get();

      userCheckinsSnap.docs.forEach((doc: any) => {
        const c = doc.data();
        const otherPlaceId = c.spotPlaceId;
        if (otherPlaceId && otherPlaceId !== placeId) {
          otherSpotCounts[otherPlaceId] = (otherSpotCounts[otherPlaceId] || 0) + 1;
        }
      });
    }

    // Return spots visited by multiple users who also visited the target spot
    return Object.entries(otherSpotCounts)
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([spotId]) => spotId);
  } catch (error) {
    console.error('[UserIntel] Error finding similar spots:', error);
    return [];
  }
}

// ============ HIDDEN GEMS ============

/**
 * Find hidden gems (high quality, low visibility)
 */
export async function getHiddenGems(limit = 10): Promise<SpotIntelligence[]> {
  try {
    const fb = ensureFirebase();
    if (!fb) return [];

    const gemsSnap = await fb.firestore()
      .collection('spotIntelligence')
      .where('hiddenGemScore', '>', 30)
      .orderBy('hiddenGemScore', 'desc')
      .limit(limit)
      .get();

    return gemsSnap.docs.map((d: any) => d.data() as SpotIntelligence);
  } catch (error) {
    console.error('[UserIntel] Error getting hidden gems:', error);
    return [];
  }
}
