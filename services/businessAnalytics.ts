/**
 * Business Analytics Service
 *
 * Provides analytics and insights for coffee shop owners and coworking spaces
 */

import { ensureFirebase } from './firebaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseCheckinTimestamp, queryCheckinsBySpot } from './schemaHelpers';

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

export interface BusinessAnalytics {
  spotId: string;
  spotName: string;
  period: 'week' | 'month' | 'quarter' | 'year';

  // Check-in metrics
  totalCheckins: number;
  uniqueVisitors: number;
  repeatVisitors: number;
  avgCheckinsPerDay: number;
  trend: 'up' | 'down' | 'stable'; // Compared to previous period
  trendPercent: number;

  // Peak hours
  peakHours: Array<{
    hour: number;
    count: number;
    dayOfWeek?: number; // 0-6 (Sunday-Saturday)
  }>;
  busiestDay: string;
  quietestDay: string;

  // User demographics
  demographics: {
    avgAge?: number;
    topCampuses: Array<{ campus: string; count: number }>;
    newVsReturning: { new: number; returning: number };
  };

  // Ratings
  ratings: {
    avgWifi: number;
    avgNoise: number;
    avgBusyness: number;
    avgOutlets: number;
    ratingCount: number;
  };

  // Sentiment
  sentiment: {
    positive: number;
    neutral: number;
    negative: number;
    topKeywords: string[];
  };
}

export interface CompetitiveIntelligence {
  yourSpot: {
    spotId: string;
    spotName: string;
    checkins: number;
    avgWifi: number;
    avgNoise: number;
    uniqueVisitors: number;
  };
  competitors: Array<{
    spotId: string;
    spotName: string;
    distance: number; // km
    checkins: number;
    avgWifi: number;
    avgNoise: number;
    uniqueVisitors: number;
  }>;
  ranking: {
    byCheckins: number; // Position in area
    byWifi: number;
    byVisitors: number;
  };
}

export interface BusinessSpot {
  id: string;
  name: string;
  placeId: string;
  ownerId: string;
  ownerEmail: string;
  claimedAt: number;
  verified: boolean;
  subscriptionTier: 'basic' | 'pro' | 'enterprise' | null;
  subscriptionExpiry?: number;
  locationCount: number;
  metadata?: {
    address?: string;
    phone?: string;
    website?: string;
    hours?: string;
  };
}


/**
 * Get business analytics for a spot
 */
export async function getBusinessAnalytics(
  spotId: string,
  period: 'week' | 'month' | 'quarter' | 'year' = 'month'
): Promise<BusinessAnalytics | null> {
  const cacheKey = `@business_analytics_${spotId}_${period}`;

  try {
    // Check cache
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const { data, ts } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL) {
        return data;
      }
    }

    const fb = ensureFirebase();
    if (!fb) return null;

    const db = fb.firestore();

    // Calculate date range
    const now = new Date();
    const periodStart = new Date(now);

    switch (period) {
      case 'week':
        periodStart.setDate(now.getDate() - 7);
        break;
      case 'month':
        periodStart.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        periodStart.setMonth(now.getMonth() - 3);
        break;
      case 'year':
        periodStart.setFullYear(now.getFullYear() - 1);
        break;
    }

    // Get check-ins for this period
    const checkinsSnapshot = await queryCheckinsBySpot(db, fb, spotId, { startDate: periodStart });

    const checkins = checkinsSnapshot.docs.map(doc => doc.data());

    // Calculate metrics
    const totalCheckins = checkins.length;
    const uniqueVisitors = new Set(checkins.map(c => c.userId)).size;

    // Find repeat visitors
    const visitorCounts = new Map<string, number>();
    checkins.forEach(c => {
      visitorCounts.set(c.userId, (visitorCounts.get(c.userId) || 0) + 1);
    });
    const repeatVisitors = Array.from(visitorCounts.values()).filter(count => count > 1).length;

    // Avg check-ins per day
    const daysInPeriod = Math.max(1, Math.ceil((now.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24)));
    const avgCheckinsPerDay = totalCheckins / daysInPeriod;

    // Calculate trend (compare to previous period)
    const prevPeriodStart = new Date(periodStart);
    prevPeriodStart.setTime(prevPeriodStart.getTime() - (now.getTime() - periodStart.getTime()));

    const prevCheckinsSnapshot = await queryCheckinsBySpot(
      db,
      fb,
      spotId,
      { startDate: prevPeriodStart, endDate: periodStart }
    );

    const prevTotal = prevCheckinsSnapshot.size;
    let trend: 'up' | 'down' | 'stable' = 'stable';
    let trendPercent = 0;

    if (prevTotal > 0) {
      trendPercent = ((totalCheckins - prevTotal) / prevTotal) * 100;
      if (trendPercent > 5) trend = 'up';
      else if (trendPercent < -5) trend = 'down';
    }

    // Peak hours analysis
    const hourCounts = new Map<number, number>();
    const dayHourCounts = new Map<string, number>();
    const dayCounts = new Map<number, number>();

    checkins.forEach((c: any) => {
      const date = parseCheckinTimestamp(c);
      if (!date) return;
      const hour = date.getHours();
      const day = date.getDay();

      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
      dayCounts.set(day, (dayCounts.get(day) || 0) + 1);

      const key = `${day}_${hour}`;
      dayHourCounts.set(key, (dayHourCounts.get(key) || 0) + 1);
    });

    const peakHours = Array.from(hourCounts.entries())
      .map(([hour, count]) => ({ hour, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayCountsArray = Array.from(dayCounts.entries());
    const busiestDayEntry = dayCountsArray.sort((a, b) => b[1] - a[1])[0];
    const quietestDayEntry = dayCountsArray.sort((a, b) => a[1] - b[1])[0];

    const busiestDay = busiestDayEntry ? dayNames[busiestDayEntry[0]] : 'N/A';
    const quietestDay = quietestDayEntry ? dayNames[quietestDayEntry[0]] : 'N/A';

    // Demographics
    const campusCounts = new Map<string, number>();
    let totalAge = 0;
    let ageCount = 0;

    // Get user data for demographics
    const userIds = Array.from(new Set(checkins.map(c => c.userId)));
    const userDataPromises = userIds.slice(0, 100).map(async uid => {
      try {
        const userDoc = await db.collection('users').doc(uid).get();
        return userDoc.data();
      } catch {
        return null;
      }
    });

    const userData = (await Promise.all(userDataPromises)).filter(Boolean);

    userData.forEach(user => {
      if (user?.campus) {
        campusCounts.set(user.campus, (campusCounts.get(user.campus) || 0) + 1);
      }
      if (user?.age) {
        totalAge += user.age;
        ageCount++;
      }
    });

    const topCampuses = Array.from(campusCounts.entries())
      .map(([campus, count]) => ({ campus, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const demographics = {
      avgAge: ageCount > 0 ? totalAge / ageCount : undefined,
      topCampuses,
      newVsReturning: {
        new: uniqueVisitors - repeatVisitors,
        returning: repeatVisitors,
      },
    };

    // Ratings analysis
    const checkinsWithRatings = checkins.filter(c => c.metrics);
    let totalWifi = 0, totalNoise = 0, totalBusyness = 0, totalOutlets = 0;
    let wifiCount = 0, noiseCount = 0, busynessCount = 0, outletsCount = 0;

    checkinsWithRatings.forEach(c => {
      if (c.metrics.wifi !== undefined) {
        totalWifi += c.metrics.wifi;
        wifiCount++;
      }
      if (c.metrics.noise !== undefined) {
        totalNoise += c.metrics.noise;
        noiseCount++;
      }
      if (c.metrics.busyness !== undefined) {
        totalBusyness += c.metrics.busyness;
        busynessCount++;
      }
      if (c.metrics.outlets !== undefined) {
        totalOutlets += c.metrics.outlets;
        outletsCount++;
      }
    });

    const ratings = {
      avgWifi: wifiCount > 0 ? totalWifi / wifiCount : 0,
      avgNoise: noiseCount > 0 ? totalNoise / noiseCount : 0,
      avgBusyness: busynessCount > 0 ? totalBusyness / busynessCount : 0,
      avgOutlets: outletsCount > 0 ? totalOutlets / outletsCount : 0,
      ratingCount: checkinsWithRatings.length,
    };

    // Sentiment analysis (basic keyword extraction)
    const captions = checkins.map(c => c.caption || '').filter(Boolean);
    const positiveWords = ['great', 'love', 'amazing', 'perfect', 'excellent', 'awesome', 'fantastic', 'wonderful', 'best', 'good', 'nice', 'cozy', 'comfortable', 'friendly'];
    const negativeWords = ['bad', 'terrible', 'awful', 'worst', 'hate', 'poor', 'disappointing', 'crowded', 'loud', 'dirty', 'slow', 'expensive'];

    let positive = 0, neutral = 0, negative = 0;
    const wordCounts = new Map<string, number>();

    captions.forEach(caption => {
      const lower = caption.toLowerCase();
      const hasPositive = positiveWords.some(w => lower.includes(w));
      const hasNegative = negativeWords.some(w => lower.includes(w));

      if (hasPositive && !hasNegative) positive++;
      else if (hasNegative && !hasPositive) negative++;
      else neutral++;

      // Extract keywords (simple word frequency)
      const words = lower.match(/\b\w{4,}\b/g) || [];
      words.forEach((word: string) => {
        if (!['this', 'that', 'with', 'from', 'have', 'been', 'were'].includes(word)) {
          wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
        }
      });
    });

    const topKeywords = Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);

    const sentiment = {
      positive,
      neutral,
      negative,
      topKeywords,
    };

    // Get spot name
    const spotDoc = await db.collection('spots').doc(spotId).get();
    const spotName = spotDoc.exists ? spotDoc.data()?.name || 'Unknown Spot' : 'Unknown Spot';

    const analytics: BusinessAnalytics = {
      spotId,
      spotName,
      period,
      totalCheckins,
      uniqueVisitors,
      repeatVisitors,
      avgCheckinsPerDay: Math.round(avgCheckinsPerDay * 10) / 10,
      trend,
      trendPercent: Math.round(trendPercent * 10) / 10,
      peakHours,
      busiestDay,
      quietestDay,
      demographics,
      ratings,
      sentiment,
    };

    // Cache result
    await AsyncStorage.setItem(cacheKey, JSON.stringify({
      data: analytics,
      ts: Date.now(),
    }));

    return analytics;
  } catch (error) {
    console.error('Failed to get business analytics:', error);
    return null;
  }
}

/**
 * Get competitive intelligence for a spot
 */
export async function getCompetitiveIntelligence(
  spotId: string,
  radiusKm: number = 2
): Promise<CompetitiveIntelligence | null> {
  try {
    const fb = ensureFirebase();
    if (!fb) return null;

    const db = fb.firestore();

    // Get your spot data
    const spotDoc = await db.collection('spots').doc(spotId).get();
    if (!spotDoc.exists) return null;

    const spotData = spotDoc.data()!;
    const spotLocation = spotData.location || spotData.spotLatLng;
    if (!spotLocation) return null;

    // Get analytics for your spot
    const yourAnalytics = await getBusinessAnalytics(spotId, 'month');
    if (!yourAnalytics) return null;

    // Get nearby spots (simplified - in production, use geohash queries)
    const allSpotsSnapshot = await db.collection('spots').limit(500).get();

    const competitors: CompetitiveIntelligence['competitors'] = [];

    for (const doc of allSpotsSnapshot.docs) {
      if (doc.id === spotId) continue;

      const competitorData = doc.data();
      const competitorLocation = competitorData.location || competitorData.spotLatLng;

      if (!competitorLocation) continue;

      const distance = haversineDistance(
        spotLocation.lat,
        spotLocation.lng,
        competitorLocation.lat,
        competitorLocation.lng
      );

      if (distance <= radiusKm) {
        // Get competitor analytics
        const competitorAnalytics = await getBusinessAnalytics(doc.id, 'month');

        if (competitorAnalytics) {
          competitors.push({
            spotId: doc.id,
            spotName: competitorData.name || 'Unknown',
            distance: Math.round(distance * 10) / 10,
            checkins: competitorAnalytics.totalCheckins,
            avgWifi: competitorAnalytics.ratings.avgWifi,
            avgNoise: competitorAnalytics.ratings.avgNoise,
            uniqueVisitors: competitorAnalytics.uniqueVisitors,
          });
        }
      }
    }

    // Sort competitors by check-ins
    competitors.sort((a, b) => b.checkins - a.checkins);

    // Calculate rankings
    const allSpots = [
      {
        checkins: yourAnalytics.totalCheckins,
        wifi: yourAnalytics.ratings.avgWifi,
        visitors: yourAnalytics.uniqueVisitors,
      },
      ...competitors.map(c => ({
        checkins: c.checkins,
        wifi: c.avgWifi,
        visitors: c.uniqueVisitors,
      })),
    ];

    const byCheckins = allSpots.sort((a, b) => b.checkins - a.checkins);
    const byWifi = allSpots.sort((a, b) => b.wifi - a.wifi);
    const byVisitors = allSpots.sort((a, b) => b.visitors - a.visitors);

    const ranking = {
      byCheckins: byCheckins.findIndex(s => s.checkins === yourAnalytics.totalCheckins) + 1,
      byWifi: byWifi.findIndex(s => s.wifi === yourAnalytics.ratings.avgWifi) + 1,
      byVisitors: byVisitors.findIndex(s => s.visitors === yourAnalytics.uniqueVisitors) + 1,
    };

    return {
      yourSpot: {
        spotId,
        spotName: yourAnalytics.spotName,
        checkins: yourAnalytics.totalCheckins,
        avgWifi: yourAnalytics.ratings.avgWifi,
        avgNoise: yourAnalytics.ratings.avgNoise,
        uniqueVisitors: yourAnalytics.uniqueVisitors,
      },
      competitors: competitors.slice(0, 10),
      ranking,
    };
  } catch (error) {
    console.error('Failed to get competitive intelligence:', error);
    return null;
  }
}

/**
 * Claim a spot as a business owner
 */
export async function claimSpot(
  userId: string,
  spotId: string,
  ownerEmail: string,
  metadata?: BusinessSpot['metadata']
): Promise<{ success: boolean; error?: string }> {
  try {
    const fb = ensureFirebase();
    if (!fb) return { success: false, error: 'Firebase not initialized' };

    const db = fb.firestore();

    // Check if spot exists
    const spotDoc = await db.collection('spots').doc(spotId).get();
    if (!spotDoc.exists) {
      return { success: false, error: 'Spot not found' };
    }

    // Check if already claimed
    const existingClaim = await db
      .collection('businessSpots')
      .where('spotId', '==', spotId)
      .get();

    if (!existingClaim.empty) {
      return { success: false, error: 'Spot already claimed' };
    }

    const spotData = spotDoc.data()!;

    // Create business spot claim
    const businessSpot: Omit<BusinessSpot, 'id'> = {
      name: spotData.name || 'Unknown Spot',
      placeId: spotData.placeId || spotId,
      ownerId: userId,
      ownerEmail,
      claimedAt: Date.now(),
      verified: false, // Requires manual verification
      subscriptionTier: null,
      locationCount: 1,
      metadata,
    };

    const docRef = await db.collection('businessSpots').add(businessSpot);

    return { success: true };
  } catch (error) {
    console.error('Failed to claim spot:', error);
    return { success: false, error: 'Failed to claim spot' };
  }
}

/**
 * Get business spots for a user
 */
export async function getBusinessSpots(userId: string): Promise<BusinessSpot[]> {
  try {
    const fb = ensureFirebase();
    if (!fb) return [];

    const db = fb.firestore();

    const snapshot = await db
      .collection('businessSpots')
      .where('ownerId', '==', userId)
      .get();

    return snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data(),
    } as BusinessSpot));
  } catch (error) {
    console.error('Failed to get business spots:', error);
    return [];
  }
}

// Helper function
function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export default {
  getBusinessAnalytics,
  getCompetitiveIntelligence,
  claimSpot,
  getBusinessSpots,
};
