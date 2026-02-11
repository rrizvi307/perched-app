import AsyncStorage from '@react-native-async-storage/async-storage';
import { cacheDel } from './cacheLayer';
import { invalidatePlaceIntelligenceCache } from './placeIntelligence';
import { recordPerfMetric } from './perfMonitor';

const RECOMMENDATIONS_CACHE_KEY = '@perched_recommendations';
const USER_PREFERENCES_KEY = '@perched_user_preferences';

async function invalidateKeys(keys: Array<string | null | undefined>): Promise<void> {
  const startedAt = Date.now();
  const validKeys = Array.from(
    new Set(
      keys
        .filter((key): key is string => typeof key === 'string')
        .map((key) => key.trim())
        .filter(Boolean)
    )
  );

  try {
    await Promise.all(validKeys.map((key) => cacheDel(key)));
    void recordPerfMetric('cache_invalidation_keys', Date.now() - startedAt, true);
  } catch (error) {
    console.warn('Cache invalidation failed:', error);
    void recordPerfMetric('cache_invalidation_keys', Date.now() - startedAt, false);
  }
}

async function invalidateRecommendationsForUser(userId?: string): Promise<void> {
  if (!userId) return;
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const recommendationKeys = allKeys.filter(
      (key) =>
        key.includes(`${RECOMMENDATIONS_CACHE_KEY}_${userId}_`) ||
        key === `${USER_PREFERENCES_KEY}_${userId}`
    );
    if (recommendationKeys.length > 0) {
      await AsyncStorage.multiRemove(recommendationKeys);
    }
  } catch (error) {
    console.warn('Failed to invalidate recommendation cache:', error);
  }
}

export async function invalidateCacheOnCheckinCreate(
  checkinId: string,
  spotId: string,
  userId: string
): Promise<void> {
  await invalidateKeys([
    `checkin_${checkinId}`,
    `checkins_spot_${spotId}`,
    `checkins_user_${userId}`,
    `spot_metrics_${spotId}`,
    'feed_approved',
  ]);
  invalidatePlaceIntelligenceCache(spotId);
  await invalidateRecommendationsForUser(userId);
}

export async function invalidateCacheOnCheckinUpdate(
  checkinId: string,
  spotId?: string,
  userId?: string
): Promise<void> {
  await invalidateKeys([
    `checkin_${checkinId}`,
    spotId ? `checkins_spot_${spotId}` : null,
    userId ? `checkins_user_${userId}` : null,
    'feed_approved',
  ]);
  if (spotId) {
    invalidatePlaceIntelligenceCache(spotId);
  }
  await invalidateRecommendationsForUser(userId);
}

export async function invalidateCacheOnCheckinDelete(
  checkinId: string,
  spotId?: string,
  userId?: string
): Promise<void> {
  await invalidateCacheOnCheckinUpdate(checkinId, spotId, userId);
}

export async function invalidateCacheOnMetricUpdate(spotId: string, userId?: string): Promise<void> {
  await invalidateKeys([
    `spot_metrics_${spotId}`,
    `place_intel_${spotId}`,
    `recommendations_nearby_${spotId}`,
    `checkins_spot_${spotId}`,
  ]);
  invalidatePlaceIntelligenceCache(spotId);
  await invalidateRecommendationsForUser(userId);
}
