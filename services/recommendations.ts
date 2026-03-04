/**
 * AI-Powered Recommendations Service
 *
 * Collaborative filtering, time-aware predictions, contextual recommendations,
 * and personalization engine
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { ensureFirebase } from './firebaseClient';
import { recordPerfMetric } from './perfMonitor';
import { parseCheckinTimestamp } from './schemaHelpers';
import { withErrorBoundary } from './errorBoundary';
import { devLog } from './logger';
import { normalizeSpotForExplore } from './spotNormalizer';
import { getUserPreferenceScores } from '@/storage/local';
import { inferIntentsFromCheckin, scoreSpotForIntent, type DiscoveryIntent } from './discoveryIntents';
import { distanceBetween, geohashQueryBounds } from 'geofire-common';

export interface SpotRecommendation {
  placeId: string;
  name: string;
  score: number; // 0-100
  reasons: string[]; // Why this spot is recommended
  predictedBusyness?: number; // 1-5
  predictedNoise?: number; // 1-5
  bestTimeToVisit?: string; // e.g., "2-4 PM"
  matchScore?: number; // How well it matches user preferences
}

export interface UserPreferences {
  userId: string;
  preferredNoiseLevel: 'quiet' | 'moderate' | 'lively' | null;
  preferredBusyness: 'empty' | 'moderate' | 'busy' | null;
  preferredSpotTypes: string[]; // ['cafe', 'library', 'coworking']
  preferredTimeOfDay: 'morning' | 'afternoon' | 'evening' | null;
  wifiImportance: 'low' | 'medium' | 'high';
  outletImportance: 'low' | 'medium' | 'high';
  // Learned from behavior
  frequentSpots: string[]; // placeIds
  checkinTimes: number[]; // Hours of day (0-23)
  avgSessionLength: number; // minutes
  lastUpdated: number;
}

export interface TimePattern {
  hour: number;
  dayOfWeek: number; // 0-6 (Sunday-Saturday)
  avgBusyness: number;
  avgNoise: number;
  checkinCount: number;
}

const RECOMMENDATIONS_CACHE_KEY = '@perched_recommendations';
const USER_PREFERENCES_KEY = '@perched_user_preferences';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const CANDIDATE_SPOTS_CACHE_TTL = 10 * 60 * 1000;
const TIME_PATTERN_CACHE_TTL = 15 * 60 * 1000;
const MAX_RECOMMENDATION_SPOTS = 10;
const MAX_PATTERN_SPOTS = 12;
const RECOMMENDATION_SPOT_QUERY_LIMIT = 40;
const RECOMMENDATION_SPOT_FALLBACK_LIMIT = 120;
const TIME_PATTERN_BATCH_SIZE = 10;
const TIME_PATTERN_DOC_LIMIT_PER_SPOT = 60;
const candidateSpotsMemoryCache = new Map<string, { ts: number; spots: any[] }>();
const spotTimePatternMemoryCache = new Map<string, { ts: number; patterns: TimePattern[] }>();

function getFunctionsRegion() {
  return (
    ((Constants.expoConfig as any)?.extra?.FIREBASE_FUNCTIONS_REGION as string) ||
    (process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION as string) ||
    'us-central1'
  );
}

function sanitizeSpotRecommendation(raw: any): SpotRecommendation | null {
  if (!raw || typeof raw !== 'object') return null;
  const placeId = typeof raw.placeId === 'string' ? raw.placeId.trim() : '';
  if (!placeId) return null;
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : 'Unknown';
  const score = typeof raw.score === 'number' && Number.isFinite(raw.score)
    ? Math.max(0, Math.min(100, raw.score))
    : 0;
  const reasons = Array.isArray(raw.reasons)
    ? raw.reasons.filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0).slice(0, 4)
    : [];

  return {
    placeId,
    name,
    score,
    reasons,
    predictedBusyness: typeof raw.predictedBusyness === 'number' ? raw.predictedBusyness : undefined,
    predictedNoise: typeof raw.predictedNoise === 'number' ? raw.predictedNoise : undefined,
    bestTimeToVisit: typeof raw.bestTimeToVisit === 'string' ? raw.bestTimeToVisit : undefined,
    matchScore: typeof raw.matchScore === 'number' ? raw.matchScore : undefined,
  };
}

function formatCollaborativeReason(matchCount: number): string {
  const count = Math.max(0, Math.floor(matchCount));
  return `${count} ${count === 1 ? 'user' : 'users'} with similar taste checked in here`;
}

async function callCollaborativeRecommendations(
  currentSpotId?: string,
  limit: number = 5,
): Promise<SpotRecommendation[] | null> {
  const fb = ensureFirebase();
  if (!fb || typeof (fb as any).functions !== 'function' || typeof (fb as any).app !== 'function') {
    return null;
  }

  try {
    const callable = (fb as any)
      .app()
      .functions(getFunctionsRegion())
      .httpsCallable('getCollaborativeRecommendations');
    const response = await callable({ currentSpotId, limit });
    const items = Array.isArray(response?.data?.recommendations) ? response.data.recommendations : [];
    return items
      .map((item: any) => sanitizeSpotRecommendation(item))
      .filter((item: SpotRecommendation | null): item is SpotRecommendation => !!item);
  } catch (error) {
    devLog('getCollaborativeRecommendations callable failed', { error, currentSpotId, limit });
    return null;
  }
}

async function getCollaborativeRecommendationsFromFirestore(
  userId: string,
  currentSpotId?: string,
  limit: number = 5
): Promise<SpotRecommendation[]> {
  const fb = ensureFirebase();
  if (!fb) return [];

  const db = fb.firestore();

  // Get user's check-in history
  const userCheckinsSnapshot = await db
    .collection('checkins')
    .where('userId', '==', userId)
    .limit(50)
    .get();

  const userSpotIds = new Set<string>();
  userCheckinsSnapshot.forEach((doc: any) => {
    const placeId = doc.data().spotPlaceId;
    if (placeId) userSpotIds.add(placeId);
  });

  // If currentSpotId is provided, use it as the base
  const baseSpotId = currentSpotId || Array.from(userSpotIds)[0];
  if (!baseSpotId) return [];

  // Find users who also checked into this spot
  const similarUsersSnapshot = await db
    .collection('checkins')
    .where('spotPlaceId', '==', baseSpotId)
    .where('visibility', '==', 'public')
    .limit(100)
    .get();

  const similarUserIds = new Set<string>();
  similarUsersSnapshot.forEach((doc: any) => {
    const uid = doc.data().userId;
    if (uid && uid !== userId) similarUserIds.add(uid);
  });

  // Get spots these similar users visited (batched to avoid N+1 queries)
  const spotScores = new Map<string, number>();
  const similarUserList = Array.from(similarUserIds).slice(0, 30);
  const userBatches = similarUserList.reduce<string[][]>((batches, uid, index) => {
    const batchIndex = Math.floor(index / 10);
    if (!batches[batchIndex]) batches[batchIndex] = [];
    batches[batchIndex].push(uid);
    return batches;
  }, []);

  const userSnapshots = await Promise.all(
    userBatches.map(async (batch) => {
      try {
        return await db
          .collection('checkins')
          .where('visibility', '==', 'public')
          .where('userId', 'in', batch)
          .orderBy('createdAt', 'desc')
          .limit(batch.length * 30)
          .get();
      } catch {
        return db
          .collection('checkins')
          .where('visibility', '==', 'public')
          .where('userId', 'in', batch)
          .limit(batch.length * 30)
          .get();
      }
    })
  );

  userSnapshots.forEach((checkinsSnapshot) => {
    checkinsSnapshot.forEach((doc: any) => {
      const placeId = doc.data().spotPlaceId;
      if (placeId && !userSpotIds.has(placeId) && placeId !== baseSpotId) {
        spotScores.set(placeId, (spotScores.get(placeId) || 0) + 1);
      }
    });
  });

  // Sort by score and get top spots
  const sortedSpots = Array.from(spotScores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  // Resolve names from aggregated spot docs instead of issuing another
  // check-in batch query for each recommendation page.
  const spotNames = new Map<string, string>();
  const placeIds = sortedSpots.map(([placeId]) => placeId).filter(Boolean);
  const placeDocs = await Promise.all(
    placeIds.map(async (placeId) => {
      try {
        return await db.collection('spots').doc(placeId).get();
      } catch {
        return null;
      }
    })
  );
  placeDocs.forEach((doc: any, index) => {
    const placeId = placeIds[index];
    if (!placeId || !doc?.exists) return;
    const data = doc.data() || {};
    const normalized = normalizeSpotForExplore({ id: placeId, ...data });
    if (normalized.name) {
      spotNames.set(placeId, normalized.name);
    }
  });

  const denominator = Math.max(similarUserIds.size, 1);
  return sortedSpots.map(([placeId, score]) => ({
    placeId,
    name: spotNames.get(placeId) || 'Unknown',
    score: Math.min((score / denominator) * 100, 100),
    reasons: [
      formatCollaborativeReason(score),
      'Popular among people who like similar spots',
    ],
  }));
}

/**
 * Get personalized recommendations for a user
 */
export async function getPersonalizedRecommendations(
  userId: string,
  userLocation: { lat: number; lng: number },
  context?: {
    timeOfDay?: 'morning' | 'afternoon' | 'evening';
    weather?: 'sunny' | 'rainy' | 'cloudy';
    currentSpotId?: string; // Recommend similar spots
    intent?: DiscoveryIntent;
  }
): Promise<SpotRecommendation[]> {
  return withErrorBoundary('recommendations_personalized', async () => {
    const startedAt = Date.now();
    // Check cache first
    const cacheKey = `${RECOMMENDATIONS_CACHE_KEY}_${userId}_${userLocation.lat.toFixed(2)}_${userLocation.lng.toFixed(2)}_${context?.timeOfDay || 'any'}_${context?.weather || 'any'}_${context?.intent || 'any'}`;
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const { recommendations, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_TTL) {
        void recordPerfMetric('recommendations_personalized_cache_hit', Date.now() - startedAt, true);
        return recommendations;
      }
    }

    // Get user preferences
    const preferences = await getUserPreferences(userId);
    const preferenceScores = await getUserPreferenceScores(userId).catch(() => ({} as Record<string, number>));

    // Get candidate spots (nearby spots)
    const candidateSpots = await getCandidateSpots(userLocation, 5); // 5km radius

    // Score candidates first using aggregate spot docs, then fetch time patterns only
    // for the highest ranked subset instead of one pattern query per spot.
    const scoredSpots = candidateSpots
      .map((spot) => {
        const intentSignal = context?.intent ? scoreSpotForIntent(spot, context.intent) : null;
        const score = calculateSpotScore(spot, preferences, preferenceScores, context, intentSignal);
        const reasons = generateRecommendationReasons(spot, preferences, context, intentSignal);
        return {
          spot,
          score,
          reasons,
        };
      })
      .sort((a, b) => b.score - a.score);

    const patternCandidates = scoredSpots.slice(0, Math.min(MAX_PATTERN_SPOTS, scoredSpots.length));
    const timePatternsByPlace = await getSpotTimePatternsBatch(patternCandidates.map(({ spot }) => spot.placeId));
    const currentHour = new Date().getHours();
    const currentDay = new Date().getDay();

    // Sort by score and get top 10
    const recommendations = scoredSpots
      .slice(0, MAX_RECOMMENDATION_SPOTS)
      .map(({ spot, score, reasons }) => {
        const timePatterns = timePatternsByPlace.get(spot.placeId) || [];
        const currentPattern = timePatterns.find(
          (pattern) => pattern.hour === currentHour && pattern.dayOfWeek === currentDay
        );

        return {
          placeId: spot.placeId,
          name: spot.name,
          score,
          reasons,
          predictedBusyness: currentPattern?.avgBusyness ?? spot.avgBusyness ?? undefined,
          predictedNoise: currentPattern?.avgNoise ?? spot.avgNoiseLevel ?? undefined,
          bestTimeToVisit: getBestTimeToVisit(timePatterns, preferences),
          matchScore: score,
        } satisfies SpotRecommendation;
      });

    // Cache recommendations
    await AsyncStorage.setItem(
      cacheKey,
      JSON.stringify({ recommendations, timestamp: Date.now() })
    );

    return recommendations;
  }, []);
}

/**
 * Get collaborative filtering recommendations
 * "Users who liked X also liked Y"
 */
export async function getCollaborativeRecommendations(
  userId: string,
  currentSpotId?: string,
  limit: number = 5
): Promise<SpotRecommendation[]> {
  return withErrorBoundary('recommendations_collaborative', async () => {
    const callableRecommendations = await callCollaborativeRecommendations(currentSpotId, limit);
    if (callableRecommendations) {
      return callableRecommendations;
    }
    return getCollaborativeRecommendationsFromFirestore(userId, currentSpotId, limit);
  }, []);
}

/**
 * Learn user preferences from check-in history
 */
export async function learnUserPreferences(userId: string): Promise<UserPreferences> {
  return withErrorBoundary('recommendations_learn_preferences', async () => {
    const fb = ensureFirebase();
    if (!fb) {
      return getDefaultPreferences(userId);
    }

    const db = fb.firestore();

    // Get user's recent check-ins (last 50)
    const checkinsSnapshot = await db
      .collection('checkins')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const checkins: any[] = [];
    checkinsSnapshot.forEach((doc: any) => checkins.push(doc.data()));

    if (checkins.length === 0) {
      return getDefaultPreferences(userId);
    }

    // Analyze preferences
    const noiseLevels: number[] = [];
    const busynessLevels: number[] = [];
    const wifiSpeeds: number[] = [];
    const outletAvailabilityScores: number[] = [];
    const spotTypes: string[] = [];
    const checkinTimes: number[] = [];
    const spotIds = new Set<string>();

    checkins.forEach(checkin => {
      if (checkin.noiseLevel) noiseLevels.push(checkin.noiseLevel);
      if (checkin.busyness) busynessLevels.push(checkin.busyness);
      if (typeof checkin.wifiSpeed === 'number') wifiSpeeds.push(checkin.wifiSpeed);
      const outletScore = toOutletAvailabilityScore(checkin.outletAvailability);
      if (outletScore !== null) outletAvailabilityScores.push(outletScore);
      if (checkin.spotType) spotTypes.push(checkin.spotType);
      if (checkin.spotPlaceId) spotIds.add(checkin.spotPlaceId);

      // Extract hour from timestamp
      const timestamp = parseCheckinTimestamp(checkin);
      if (!timestamp) return;
      checkinTimes.push(timestamp.getHours());
    });

    // Calculate preferences
    const avgNoise = noiseLevels.length > 0
      ? noiseLevels.reduce((a, b) => a + b, 0) / noiseLevels.length
      : null;

    const avgBusyness = busynessLevels.length > 0
      ? busynessLevels.reduce((a, b) => a + b, 0) / busynessLevels.length
      : null;

    const avgWifiSpeed = average(wifiSpeeds);
    const avgOutletAvailability = average(outletAvailabilityScores);

    const preferences: UserPreferences = {
      userId,
      preferredNoiseLevel: avgNoise
        ? avgNoise <= 2 ? 'quiet' : avgNoise >= 4 ? 'lively' : 'moderate'
        : null,
      preferredBusyness: avgBusyness
        ? avgBusyness <= 2 ? 'empty' : avgBusyness >= 4 ? 'busy' : 'moderate'
        : null,
      preferredSpotTypes: getMostFrequent(spotTypes, 3),
      preferredTimeOfDay: getPreferredTimeOfDay(checkinTimes),
      wifiImportance: toImportance(avgWifiSpeed),
      outletImportance: toImportance(avgOutletAvailability),
      frequentSpots: Array.from(spotIds).slice(0, 10),
      checkinTimes: checkinTimes.slice(0, 20),
      avgSessionLength: 60, // TODO: Calculate from check-in duration
      lastUpdated: Date.now(),
    };

    // Cache preferences
    await AsyncStorage.setItem(
      `${USER_PREFERENCES_KEY}_${userId}`,
      JSON.stringify(preferences)
    );

    return preferences;
  }, getDefaultPreferences(userId));
}

/**
 * Get user preferences (cached or learn new)
 */
export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  return withErrorBoundary('recommendations_get_preferences', async () => {
    // Check cache
    const cached = await AsyncStorage.getItem(`${USER_PREFERENCES_KEY}_${userId}`);
    if (cached) {
      const preferences: UserPreferences = JSON.parse(cached);
      // Refresh if older than 7 days
      if (Date.now() - preferences.lastUpdated < 7 * 24 * 60 * 60 * 1000) {
        return preferences;
      }
    }

    // Learn new preferences
    return await learnUserPreferences(userId);
  }, getDefaultPreferences(userId));
}

/**
 * Get time patterns for a spot (predict busyness/noise)
 */
function buildTimePatterns(checkins: any[]): TimePattern[] {
  const patterns = new Map<string, { busynessSum: number; noiseSum: number; count: number }>();

  checkins.forEach((checkin) => {
    const timestamp = parseCheckinTimestamp(checkin);
    if (!timestamp) return;
    const hour = timestamp.getHours();
    const dayOfWeek = timestamp.getDay();
    const key = `${dayOfWeek}_${hour}`;

    const existing = patterns.get(key) || { busynessSum: 0, noiseSum: 0, count: 0 };
    existing.busynessSum += typeof checkin.busyness === 'number' ? checkin.busyness : 0;
    existing.noiseSum += typeof checkin.noiseLevel === 'number' ? checkin.noiseLevel : 0;
    existing.count += 1;
    patterns.set(key, existing);
  });

  const timePatterns: TimePattern[] = [];
  patterns.forEach((value, key) => {
    const [dayOfWeek, hour] = key.split('_').map(Number);
    timePatterns.push({
      hour,
      dayOfWeek,
      avgBusyness: value.busynessSum / value.count,
      avgNoise: value.noiseSum / value.count,
      checkinCount: value.count,
    });
  });

  return timePatterns;
}

async function getSpotTimePatternsBatch(placeIds: string[]): Promise<Map<string, TimePattern[]>> {
  try {
    const uniquePlaceIds = Array.from(new Set(placeIds.filter((placeId) => typeof placeId === 'string' && placeId.trim())));
    const resolved = new Map<string, TimePattern[]>();
    const missing: string[] = [];

    uniquePlaceIds.forEach((placeId) => {
      const cached = spotTimePatternMemoryCache.get(placeId);
      if (cached && Date.now() - cached.ts < TIME_PATTERN_CACHE_TTL) {
        resolved.set(placeId, cached.patterns);
      } else {
        missing.push(placeId);
      }
    });

    if (missing.length === 0) {
      return resolved;
    }

    const fb = ensureFirebase();
    if (!fb) return resolved;

    const db = fb.firestore();

    const batches: string[][] = [];
    for (let index = 0; index < missing.length; index += TIME_PATTERN_BATCH_SIZE) {
      batches.push(missing.slice(index, index + TIME_PATTERN_BATCH_SIZE));
    }

    await Promise.all(
      batches.map(async (batch) => {
        const perSpot = new Map<string, any[]>();
        batch.forEach((placeId) => perSpot.set(placeId, []));

        const snapshot = await db
          .collection('checkins')
          .where('visibility', '==', 'public')
          .where('spotPlaceId', 'in', batch)
          .limit(batch.length * TIME_PATTERN_DOC_LIMIT_PER_SPOT)
          .get();

        snapshot.forEach((doc: any) => {
          const data = doc.data();
          const placeId = typeof data?.spotPlaceId === 'string' ? data.spotPlaceId : '';
          if (!placeId || !perSpot.has(placeId)) return;
          perSpot.get(placeId)?.push(data);
        });

        batch.forEach((placeId) => {
          const patterns = buildTimePatterns(perSpot.get(placeId) || []);
          spotTimePatternMemoryCache.set(placeId, { ts: Date.now(), patterns });
          resolved.set(placeId, patterns);
        });
      })
    );

    return resolved;
  } catch (error) {
    devLog('Failed to get spot time patterns:', error);
    return new Map();
  }
}

/**
 * Calculate recommendation score for a spot
 */
function calculateSpotScore(
  spot: any,
  preferences: UserPreferences,
  preferenceScores: Record<string, number>,
  context?: {
    timeOfDay?: 'morning' | 'afternoon' | 'evening';
    weather?: 'sunny' | 'rainy' | 'cloudy';
    intent?: DiscoveryIntent;
  },
  intentSignal?: { score: number; reasons: string[] } | null
): number {
  let score = 50; // Base score

  // Preference matching
  if (preferences.preferredNoiseLevel) {
    const spotNoise = spot.avgNoiseLevel || 3;
    const preferredNoise = preferences.preferredNoiseLevel === 'quiet' ? 1.5 : preferences.preferredNoiseLevel === 'lively' ? 4.5 : 3;
    const noiseDiff = Math.abs(spotNoise - preferredNoise);
    score += Math.max(0, 20 - noiseDiff * 5); // Up to +20 for noise match
  }

  // Spot type match
  if (preferences.preferredSpotTypes.length > 0 && spot.category) {
    if (preferences.preferredSpotTypes.includes(spot.category)) {
      score += 15;
    }
  }

  // Behavioral preference boost from place events
  const categoryWeight = preferenceScores?.[spot.category] || 0;
  if (categoryWeight > 0) {
    score = score * (1 + 0.3 * Math.min(categoryWeight, 1));
  }

  // Frequency bonus (user's frequent spots)
  if (preferences.frequentSpots.includes(spot.placeId)) {
    score += 10;
  }

  // Context: Time of day
  if (context?.timeOfDay && preferences.preferredTimeOfDay) {
    if (context.timeOfDay === preferences.preferredTimeOfDay) {
      score += 10;
    }
  }

  // Context: Weather (indoor preference when rainy)
  if (context?.weather === 'rainy' && spot.indoor) {
    score += 15;
  }

  // Distance penalty (prefer closer spots)
  if (spot.distance !== undefined) {
    const distancePenalty = Math.min(spot.distance * 2, 20); // Up to -20 for distance
    score -= distancePenalty;
  }

  // Quality metrics
  if (spot.avgWifiSpeed && spot.avgWifiSpeed >= 4) {
    score += preferences.wifiImportance === 'high' ? 10 : 5;
  }

  if (spot.topOutletAvailability === 'plenty') {
    score += preferences.outletImportance === 'high' ? 10 : 5;
  }

  // Popularity boost
  if (spot.checkinCount) {
    score += Math.min(spot.checkinCount / 10, 10); // Up to +10 for popularity
  }

  // Intent-aware blend for broader coffee discovery use cases.
  if (context?.intent && intentSignal) {
    const intentScore = Math.max(0, Math.min(100, intentSignal.score * 100));
    score = score * 0.75 + intentScore * 0.25;
    if (intentSignal.score < 0.18) {
      score -= 8;
    }
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Generate human-readable reasons for recommendation
 */
function generateRecommendationReasons(
  spot: any,
  preferences: UserPreferences,
  context?: {
    timeOfDay?: 'morning' | 'afternoon' | 'evening';
    weather?: 'sunny' | 'rainy' | 'cloudy';
    intent?: DiscoveryIntent;
  },
  intentSignal?: { score: number; reasons: string[] } | null
): string[] {
  const reasons: string[] = [];

  if (context?.intent && intentSignal) {
    reasons.push(...intentSignal.reasons.slice(0, 2));
  }

  if (preferences.preferredNoiseLevel && spot.avgNoiseLevel) {
    const spotNoise = spot.avgNoiseLevel;
    if (preferences.preferredNoiseLevel === 'quiet' && spotNoise <= 2) {
      reasons.push('Usually quiet - matches your preference');
    } else if (preferences.preferredNoiseLevel === 'lively' && spotNoise >= 4) {
      reasons.push('Lively atmosphere - matches your preference');
    }
  }

  if (preferences.frequentSpots.includes(spot.placeId)) {
    reasons.push('One of your favorite spots');
  }

  if (spot.avgWifiSpeed && spot.avgWifiSpeed >= 4) {
    reasons.push('Great WiFi (4+ Mbps)');
  }

  if (spot.topOutletAvailability === 'plenty') {
    reasons.push('Plenty of outlets available');
  }

  if (spot.distance !== undefined && spot.distance < 1) {
    reasons.push(`Only ${spot.distance.toFixed(1)}km away`);
  }

  if (context?.weather === 'rainy' && spot.indoor) {
    reasons.push('Perfect for rainy weather');
  }

  if (spot.checkinCount && spot.checkinCount > 50) {
    reasons.push('Very popular with students');
  }

  const deduped = Array.from(new Set(reasons));
  return deduped.length > 0 ? deduped : ['Based on your activity'];
}

/**
 * Get best time to visit a spot based on patterns
 */
function getBestTimeToVisit(patterns: TimePattern[], preferences: UserPreferences): string {
  if (patterns.length === 0) return '';

  // Filter by user's preferred time of day if available
  let relevantPatterns = patterns;
  if (preferences.preferredTimeOfDay) {
    const timeRange = getTimeRange(preferences.preferredTimeOfDay);
    relevantPatterns = patterns.filter(p => p.hour >= timeRange.start && p.hour < timeRange.end);
  }

  if (relevantPatterns.length === 0) relevantPatterns = patterns;

  // Find time with lowest busyness (if user prefers empty) or moderate busyness
  const sorted = relevantPatterns.sort((a, b) => {
    if (preferences.preferredBusyness === 'empty') {
      return a.avgBusyness - b.avgBusyness;
    } else if (preferences.preferredBusyness === 'busy') {
      return b.avgBusyness - a.avgBusyness;
    }
    // Prefer moderate busyness (around 2.5-3.5)
    const aDistance = Math.abs(a.avgBusyness - 3);
    const bDistance = Math.abs(b.avgBusyness - 3);
    return aDistance - bDistance;
  });

  const best = sorted[0];
  if (best) {
    const hour = best.hour;
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}-${displayHour + 2} ${period}`;
  }

  return '';
}

// Helper functions

function getDefaultPreferences(userId: string): UserPreferences {
  return {
    userId,
    preferredNoiseLevel: null,
    preferredBusyness: null,
    preferredSpotTypes: [],
    preferredTimeOfDay: null,
    wifiImportance: 'medium',
    outletImportance: 'medium',
    frequentSpots: [],
    checkinTimes: [],
    avgSessionLength: 60,
    lastUpdated: Date.now(),
  };
}

function getMostFrequent(arr: string[], limit: number): string[] {
  const counts = new Map<string, number>();
  arr.forEach(item => counts.set(item, (counts.get(item) || 0) + 1));
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([item]) => item);
}

function average(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toImportance(avgValue: number | null): 'low' | 'medium' | 'high' {
  if (avgValue === null) return 'medium';
  if (avgValue >= 4) return 'high';
  if (avgValue <= 2) return 'low';
  return 'medium';
}

function toOutletAvailabilityScore(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 4 : 1;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'plenty') return 4;
  if (normalized === 'some') return 3;
  if (normalized === 'few') return 2;
  if (normalized === 'none') return 1;
  return null;
}

function getPreferredTimeOfDay(hours: number[]): 'morning' | 'afternoon' | 'evening' | null {
  if (hours.length === 0) return null;

  const morning = hours.filter(h => h >= 6 && h < 12).length;
  const afternoon = hours.filter(h => h >= 12 && h < 18).length;
  const evening = hours.filter(h => h >= 18 || h < 6).length;

  if (morning >= afternoon && morning >= evening) return 'morning';
  if (afternoon >= evening) return 'afternoon';
  return 'evening';
}

function getTimeRange(timeOfDay: 'morning' | 'afternoon' | 'evening'): { start: number; end: number } {
  switch (timeOfDay) {
    case 'morning': return { start: 6, end: 12 };
    case 'afternoon': return { start: 12, end: 18 };
    case 'evening': return { start: 18, end: 24 };
  }
}

function toNoiseScore(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'quiet') return 2;
  if (normalized === 'moderate') return 3;
  if (normalized === 'loud' || normalized === 'lively') return 4;
  return null;
}

function toBusynessScore(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'empty') return 1;
  if (normalized === 'some') return 3;
  if (normalized === 'packed') return 5;
  return null;
}

function deriveWifiScore(spot: any): number | null {
  if (typeof spot?.avgWifiSpeed === 'number' && Number.isFinite(spot.avgWifiSpeed)) {
    return spot.avgWifiSpeed;
  }
  if (spot?.intel?.hasWifi === true) {
    const confidence = typeof spot?.intel?.wifiConfidence === 'number' ? spot.intel.wifiConfidence : 0.6;
    return Math.max(1, Math.min(5, 2.8 + Math.max(0.2, Math.min(1, confidence)) * 1.4));
  }
  return null;
}

function deriveOutletAvailability(spot: any): 'plenty' | 'some' | 'few' | 'none' | null {
  const direct = typeof spot?.topOutletAvailability === 'string' ? spot.topOutletAvailability : null;
  if (direct === 'plenty' || direct === 'some' || direct === 'few' || direct === 'none') return direct;
  return null;
}

async function getCandidateSpots(location: { lat: number; lng: number }, radiusKm: number): Promise<any[]> {
  try {
    const cacheKey = `${location.lat.toFixed(2)}:${location.lng.toFixed(2)}:${radiusKm.toFixed(1)}`;
    const cached = candidateSpotsMemoryCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CANDIDATE_SPOTS_CACHE_TTL) {
      return cached.spots;
    }

    const fb = ensureFirebase();
    if (!fb) return [];
    if (!fb.auth()?.currentUser?.uid) return [];

    const db = fb.firestore();
    const radiusMeters = radiusKm * 1000;
    const bounds = geohashQueryBounds([location.lat, location.lng], radiusMeters);
    const merged = new Map<string, any>();

    try {
      const snapshots = await Promise.all(
        bounds.map((bound) =>
          db
            .collection('spots')
            .orderBy('geoHash')
            .startAt(bound[0])
            .endAt(bound[1])
            .limit(RECOMMENDATION_SPOT_QUERY_LIMIT)
            .get()
        )
      );

      snapshots.forEach((snapshot: any) => {
        snapshot.docs.forEach((doc: any) => {
          if (!merged.has(doc.id)) {
            merged.set(doc.id, { id: doc.id, ...doc.data() });
          }
        });
      });
    } catch {
      const fallback = await db.collection('spots').limit(RECOMMENDATION_SPOT_FALLBACK_LIMIT).get();
      fallback.docs.forEach((doc: any) => {
        if (!merged.has(doc.id)) {
          merged.set(doc.id, { id: doc.id, ...doc.data() });
        }
      });
    }

    const spots = Array.from(merged.values())
      .map((rawSpot) => normalizeSpotForExplore(rawSpot))
      .map((spot) => {
        const lat = typeof spot?.lat === 'number' ? spot.lat : spot?.location?.lat;
        const lng = typeof spot?.lng === 'number' ? spot.lng : spot?.location?.lng;
        if (typeof lat !== 'number' || typeof lng !== 'number') return null;

        const distance = distanceBetween([location.lat, location.lng], [lat, lng]);
        if (!Number.isFinite(distance) || distance > radiusKm) return null;

        return {
          placeId: spot.placeId || spot.id,
          name: spot.name,
          distance,
          category: spot?.intel?.category || spot?.category || 'cafe',
          checkinCount: typeof spot?.live?.checkinCount === 'number' ? spot.live.checkinCount : 0,
          avgNoiseLevel:
            toNoiseScore(spot?.avgNoiseLevel) ??
            toNoiseScore(spot?.display?.noise) ??
            toNoiseScore(spot?.live?.noise) ??
            toNoiseScore(spot?.intel?.inferredNoise),
          avgBusyness:
            toBusynessScore(spot?.avgBusyness) ??
            toBusynessScore(spot?.display?.busyness) ??
            toBusynessScore(spot?.live?.busyness),
          avgWifiSpeed: deriveWifiScore(spot),
          topOutletAvailability: deriveOutletAvailability(spot),
          intentScores:
            spot?.intentScores && typeof spot.intentScores === 'object'
              ? spot.intentScores
              : {},
          indoor:
            typeof spot?.indoor === 'boolean'
              ? spot.indoor
              : ['cafe', 'coworking', 'library'].includes(spot?.intel?.category || ''),
        };
      })
      .filter((spot): spot is NonNullable<typeof spot> => Boolean(spot));

    candidateSpotsMemoryCache.set(cacheKey, { ts: Date.now(), spots });
    while (candidateSpotsMemoryCache.size > 30) {
      const oldestKey = candidateSpotsMemoryCache.keys().next().value;
      if (oldestKey === undefined) break;
      candidateSpotsMemoryCache.delete(oldestKey);
    }
    return spots;
  } catch (error: any) {
    const code = String(error?.code || '');
    if (code === 'permission-denied') {
      devLog('getCandidateSpots permission-denied; returning empty list');
      return [];
    }
    devLog('Failed to get candidate spots:', error);
    return [];
  }
}

/**
 * Clear recommendations cache
 */
export async function clearRecommendationsCache(userId: string): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(key =>
      key.includes(RECOMMENDATIONS_CACHE_KEY) ||
      key.includes(`${USER_PREFERENCES_KEY}_${userId}`)
    );
    await AsyncStorage.multiRemove(cacheKeys);
  } catch (error) {
    devLog('Failed to clear recommendations cache:', error);
  }
}
