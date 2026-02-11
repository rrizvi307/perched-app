/**
 * Cache Layer Service
 *
 * Provides Redis-like caching functionality for performance optimization
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { recordPerfMetric } from './perfMonitor';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
  hits: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  avgHitRate: number;
}

const CACHE_PREFIX = '@perched_cache_';
const STATS_KEY = '@perched_cache_stats';
const MAX_CACHE_SIZE = 100; // Max number of cache entries
const DEFAULT_STATS = {
  hits: 0,
  misses: 0,
  evictions: 0,
  size: 0,
};

let cacheStats = { ...DEFAULT_STATS };
let statsHydrated = false;

type StatsAction = 'hit' | 'miss' | 'set' | 'delete' | 'evict' | 'clear';

async function ensureStatsHydrated(): Promise<void> {
  if (statsHydrated) return;
  statsHydrated = true;
  try {
    const statsJson = await AsyncStorage.getItem(STATS_KEY);
    if (!statsJson) return;
    const parsed = JSON.parse(statsJson) as Partial<typeof DEFAULT_STATS> | null;
    if (!parsed || typeof parsed !== 'object') return;
    cacheStats = {
      hits: typeof parsed.hits === 'number' ? parsed.hits : 0,
      misses: typeof parsed.misses === 'number' ? parsed.misses : 0,
      evictions: typeof parsed.evictions === 'number' ? parsed.evictions : 0,
      size: typeof parsed.size === 'number' ? parsed.size : 0,
    };
  } catch {
    cacheStats = { ...DEFAULT_STATS };
  }
}

async function getCacheEntryCount(): Promise<number> {
  const allKeys = await AsyncStorage.getAllKeys();
  return allKeys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== STATS_KEY).length;
}

async function persistStats(): Promise<void> {
  await AsyncStorage.setItem(STATS_KEY, JSON.stringify(cacheStats));
}

async function updateCacheStats(action: StatsAction, amount: number = 1): Promise<void> {
  try {
    await ensureStatsHydrated();
    switch (action) {
      case 'hit':
        cacheStats.hits += amount;
        break;
      case 'miss':
        cacheStats.misses += amount;
        break;
      case 'evict':
        cacheStats.evictions += amount;
        cacheStats.size = Math.max(0, cacheStats.size - amount);
        break;
      case 'clear':
      case 'delete':
        cacheStats.size = Math.max(0, cacheStats.size - amount);
        break;
      case 'set':
        break;
      default:
        break;
    }

    if (action === 'set' || action === 'delete' || action === 'clear') {
      cacheStats.size = await getCacheEntryCount();
    }

    await persistStats();
    void recordPerfMetric(`cache_stats_${action}`, 0, true);
  } catch {
    void recordPerfMetric(`cache_stats_${action}`, 0, false);
  }
}

/**
 * Set cache with TTL
 */
export async function cacheSet<T>(
  key: string,
  value: T,
  ttlMs: number = 3600000 // Default 1 hour
): Promise<void> {
  const startedAt = Date.now();
  try {
    const entry: CacheEntry<T> = {
      data: value,
      timestamp: Date.now(),
      ttl: ttlMs,
      hits: 0,
    };

    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
    await updateCacheStats('set');
    void recordPerfMetric('cache_set', Date.now() - startedAt, true);
  } catch (error) {
    console.error('Cache set error:', error);
    void recordPerfMetric('cache_set', Date.now() - startedAt, false);
  }
}

/**
 * Get cache value
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const startedAt = Date.now();
  try {
    const cached = await AsyncStorage.getItem(CACHE_PREFIX + key);

    if (!cached) {
      await updateCacheStats('miss');
      void recordPerfMetric('cache_get_miss', Date.now() - startedAt, true);
      return null;
    }

    const entry: CacheEntry<T> = JSON.parse(cached);

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      await cacheDel(key);
      await updateCacheStats('miss');
      void recordPerfMetric('cache_get_expired', Date.now() - startedAt, true);
      return null;
    }

    // Increment hit counter
    entry.hits++;
    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
    await updateCacheStats('hit');
    void recordPerfMetric('cache_get_hit', Date.now() - startedAt, true);

    return entry.data;
  } catch (error) {
    console.error('Cache get error:', error);
    await updateCacheStats('miss');
    void recordPerfMetric('cache_get_miss', Date.now() - startedAt, false);
    return null;
  }
}

/**
 * Delete cache entry
 */
export async function cacheDel(key: string): Promise<void> {
  const startedAt = Date.now();
  try {
    await AsyncStorage.removeItem(CACHE_PREFIX + key);
    await updateCacheStats('delete');
    void recordPerfMetric('cache_delete', Date.now() - startedAt, true);
  } catch (error) {
    console.error('Cache delete error:', error);
    void recordPerfMetric('cache_delete', Date.now() - startedAt, false);
  }
}

/**
 * Check if cache key exists and is valid
 */
export async function cacheExists(key: string): Promise<boolean> {
  try {
    const cached = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!cached) return false;

    const entry: CacheEntry<any> = JSON.parse(cached);
    return Date.now() - entry.timestamp <= entry.ttl;
  } catch (error) {
    return false;
  }
}

/**
 * Get or set pattern (common usage)
 */
export async function cacheGetOrSet<T>(
  key: string,
  fetchFn: () => Promise<T>,
  ttlMs: number = 3600000
): Promise<T> {
  const cached = await cacheGet<T>(key);

  if (cached !== null) {
    return cached;
  }

  const fresh = await fetchFn();
  await cacheSet(key, fresh, ttlMs);
  return fresh;
}

/**
 * Batch get multiple cache keys
 */
export async function cacheMGet<T>(keys: string[]): Promise<(T | null)[]> {
  return Promise.all(keys.map(key => cacheGet<T>(key)));
}

/**
 * Batch set multiple cache keys
 */
export async function cacheMSet<T>(
  entries: Array<{ key: string; value: T; ttl?: number }>
): Promise<void> {
  await Promise.all(
    entries.map(({ key, value, ttl }) => cacheSet(key, value, ttl))
  );
}

/**
 * Clear all cache with optional pattern matching
 */
export async function cacheClear(pattern?: string): Promise<number> {
  const startedAt = Date.now();
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const cacheKeys = allKeys.filter(key => key.startsWith(CACHE_PREFIX) && key !== STATS_KEY);

    let keysToDelete = cacheKeys;

    if (pattern) {
      const regex = new RegExp(pattern);
      keysToDelete = cacheKeys.filter(key =>
        regex.test(key.replace(CACHE_PREFIX, ''))
      );
    }

    if (keysToDelete.length > 0) {
      await AsyncStorage.multiRemove(keysToDelete);
      await updateCacheStats('clear', keysToDelete.length);
    }

    void recordPerfMetric('cache_clear', Date.now() - startedAt, true);
    return keysToDelete.length;
  } catch (error) {
    console.error('Cache clear error:', error);
    void recordPerfMetric('cache_clear', Date.now() - startedAt, false);
    return 0;
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<CacheStats> {
  const startedAt = Date.now();
  try {
    await ensureStatsHydrated();
    cacheStats.size = await getCacheEntryCount();
    await persistStats();
    const total = cacheStats.hits + cacheStats.misses;
    void recordPerfMetric('cache_get_stats', Date.now() - startedAt, true);
    return {
      hits: cacheStats.hits,
      misses: cacheStats.misses,
      evictions: cacheStats.evictions,
      size: cacheStats.size,
      avgHitRate: total > 0 ? (cacheStats.hits / total) * 100 : 0,
    };
  } catch (error) {
    console.error('Get cache stats error:', error);
    void recordPerfMetric('cache_get_stats', Date.now() - startedAt, false);
    return { hits: 0, misses: 0, evictions: 0, size: 0, avgHitRate: 0 };
  }
}

export function getCacheHitRate(): number {
  const total = cacheStats.hits + cacheStats.misses;
  return total > 0 ? cacheStats.hits / total : 0;
}

export function resetCacheLayerState(): void {
  cacheStats = { ...DEFAULT_STATS };
  statsHydrated = false;
}

/**
 * Invalidate expired cache entries (cleanup)
 */
export async function cacheCleanup(): Promise<number> {
  const startedAt = Date.now();
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const cacheKeys = allKeys.filter(key => key.startsWith(CACHE_PREFIX) && key !== STATS_KEY);

    let deletedCount = 0;

    for (const fullKey of cacheKeys) {
      const cached = await AsyncStorage.getItem(fullKey);
      if (!cached) continue;

      try {
        const entry: CacheEntry<any> = JSON.parse(cached);

        if (Date.now() - entry.timestamp > entry.ttl) {
          await AsyncStorage.removeItem(fullKey);
          deletedCount++;
        }
      } catch {
        // Invalid entry, delete it
        await AsyncStorage.removeItem(fullKey);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      await updateCacheStats('clear', deletedCount);
    }
    void recordPerfMetric('cache_cleanup', Date.now() - startedAt, true);
    return deletedCount;
  } catch (error) {
    console.error('Cache cleanup error:', error);
    void recordPerfMetric('cache_cleanup', Date.now() - startedAt, false);
    return 0;
  }
}

/**
 * Evict least recently used entries if cache is full
 */
export async function cacheLRUEvict(): Promise<number> {
  const startedAt = Date.now();
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const cacheKeys = allKeys.filter(key => key.startsWith(CACHE_PREFIX) && key !== STATS_KEY);

    if (cacheKeys.length <= MAX_CACHE_SIZE) {
      return 0;
    }

    // Get all entries with their last access time
    const entries: Array<{ key: string; timestamp: number; hits: number }> = [];

    for (const fullKey of cacheKeys) {
      const cached = await AsyncStorage.getItem(fullKey);
      if (!cached) continue;

      try {
        const entry: CacheEntry<any> = JSON.parse(cached);
        entries.push({
          key: fullKey,
          timestamp: entry.timestamp,
          hits: entry.hits,
        });
      } catch {
        continue;
      }
    }

    // Sort by hits (ascending) then timestamp (ascending)
    entries.sort((a, b) => {
      if (a.hits !== b.hits) return a.hits - b.hits;
      return a.timestamp - b.timestamp;
    });

    // Delete oldest/least used entries
    const toDelete = entries.slice(0, entries.length - MAX_CACHE_SIZE);
    const keysToDelete = toDelete.map(e => e.key);

    if (keysToDelete.length > 0) {
      await AsyncStorage.multiRemove(keysToDelete);
      await updateCacheStats('evict', keysToDelete.length);
    }

    void recordPerfMetric('cache_lru_evict', Date.now() - startedAt, true);
    return keysToDelete.length;
  } catch (error) {
    console.error('LRU eviction error:', error);
    void recordPerfMetric('cache_lru_evict', Date.now() - startedAt, false);
    return 0;
  }
}

/**
 * Warmup cache with commonly used data
 */
export async function cacheWarmup(
  warmupFn: () => Promise<Array<{ key: string; value: any; ttl?: number }>>
): Promise<number> {
  const startedAt = Date.now();
  try {
    const entries = await warmupFn();
    await cacheMSet(entries);
    void recordPerfMetric('cache_warmup', Date.now() - startedAt, true);
    return entries.length;
  } catch (error) {
    console.error('Cache warmup error:', error);
    void recordPerfMetric('cache_warmup', Date.now() - startedAt, false);
    return 0;
  }
}

/**
 * Get cache key with TTL remaining
 */
export async function cacheTTL(key: string): Promise<number | null> {
  try {
    const cached = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!cached) return null;

    const entry: CacheEntry<any> = JSON.parse(cached);
    const elapsed = Date.now() - entry.timestamp;
    const remaining = entry.ttl - elapsed;

    return remaining > 0 ? remaining : 0;
  } catch (error) {
    return null;
  }
}

/**
 * Extend cache TTL
 */
export async function cacheExpire(key: string, newTtlMs: number): Promise<boolean> {
  try {
    const cached = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (!cached) return false;

    const entry: CacheEntry<any> = JSON.parse(cached);
    entry.ttl = newTtlMs;
    entry.timestamp = Date.now(); // Reset timestamp

    await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Preload commonly accessed data into cache
 */
export async function preloadCache(userId: string): Promise<void> {
  const startedAt = Date.now();
  try {
    // Preload user stats, recent spots, etc.
    // This runs in background on app start

    const warmupData: Array<{ key: string; value: any; ttl?: number }> = [];

    // Example: Cache user profile
    // const userProfile = await getUserProfile(userId);
    // warmupData.push({ key: `user_profile_${userId}`, value: userProfile, ttl: 3600000 });

    // Example: Cache recent spots
    // const recentSpots = await getRecentSpots(userId);
    // warmupData.push({ key: `recent_spots_${userId}`, value: recentSpots, ttl: 1800000 });

    if (warmupData.length > 0) {
      await cacheMSet(warmupData);
    }
    void recordPerfMetric('cache_preload', Date.now() - startedAt, true);
  } catch (error) {
    console.error('Preload cache error:', error);
    void recordPerfMetric('cache_preload', Date.now() - startedAt, false);
  }
}

/**
 * Initialize cache system (run on app start)
 */
export async function initCache(): Promise<void> {
  const startedAt = Date.now();
  try {
    // Cleanup expired entries
    await cacheCleanup();

    // Evict LRU if needed
    await cacheLRUEvict();

    console.log('Cache system initialized');
    void recordPerfMetric('cache_init', Date.now() - startedAt, true);
  } catch (error) {
    console.error('Cache init error:', error);
    void recordPerfMetric('cache_init', Date.now() - startedAt, false);
  }
}

export default {
  set: cacheSet,
  get: cacheGet,
  del: cacheDel,
  exists: cacheExists,
  getOrSet: cacheGetOrSet,
  mget: cacheMGet,
  mset: cacheMSet,
  clear: cacheClear,
  getStats: getCacheStats,
  getHitRate: getCacheHitRate,
  cleanup: cacheCleanup,
  lruEvict: cacheLRUEvict,
  warmup: cacheWarmup,
  ttl: cacheTTL,
  expire: cacheExpire,
  preload: preloadCache,
  init: initCache,
};
