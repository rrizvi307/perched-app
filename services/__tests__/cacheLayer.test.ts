import AsyncStorage from '@react-native-async-storage/async-storage';
import cacheLayer, {
  cacheCleanup,
  cacheClear,
  cacheDel,
  cacheExists,
  cacheExpire,
  cacheGet,
  cacheGetOrSet,
  cacheLRUEvict,
  cacheMGet,
  cacheMSet,
  cacheSet,
  cacheTTL,
  cacheWarmup,
  getCacheStats,
  getCacheHitRate,
  initCache,
  preloadCache,
  resetCacheLayerState,
} from '../cacheLayer';

const CACHE_PREFIX = '@perched_cache_';
const STATS_KEY = '@perched_cache_stats';

jest.mock('../perfMonitor', () => ({
  recordPerfMetric: jest.fn(async () => {}),
}));

type StorageMap = Map<string, string>;

function installStorageMock(store: StorageMap) {
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
    store.has(key) ? (store.get(key) as string) : null
  );
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => {
    store.set(key, value);
  });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => {
    store.delete(key);
  });
  (AsyncStorage.getAllKeys as jest.Mock).mockImplementation(async () => Array.from(store.keys()));
  (AsyncStorage.multiRemove as jest.Mock).mockImplementation(async (keys: string[]) => {
    keys.forEach((key) => store.delete(key));
  });
  (AsyncStorage.multiSet as jest.Mock).mockImplementation(async (entries: string[][]) => {
    entries.forEach(([key, value]) => {
      store.set(key, value);
    });
  });
  (AsyncStorage.multiGet as jest.Mock).mockImplementation(async (keys: string[]) =>
    keys.map((key) => [key, store.get(key) ?? null])
  );
  (AsyncStorage.clear as jest.Mock).mockImplementation(async () => {
    store.clear();
  });
}

async function readStats(store: StorageMap) {
  const raw = store.get(STATS_KEY);
  return raw ? JSON.parse(raw) : { hits: 0, misses: 0 };
}

function setCacheEntry(store: StorageMap, key: string, value: unknown, timestamp: number, ttl: number, hits = 0) {
  store.set(
    `${CACHE_PREFIX}${key}`,
    JSON.stringify({
      data: value,
      timestamp,
      ttl,
      hits,
    })
  );
}

describe('cacheLayer', () => {
  let store: StorageMap;

  beforeEach(() => {
    jest.clearAllMocks();
    store = new Map<string, string>();
    installStorageMock(store);
    resetCacheLayerState();
    jest.useRealTimers();
  });

  describe('cacheSet/cacheGet', () => {
    it('stores and retrieves cached value', async () => {
      await cacheSet('foo', { bar: 1 }, 5000);
      const value = await cacheGet<{ bar: number }>('foo');
      expect(value).toEqual({ bar: 1 });
      expect(store.has(`${CACHE_PREFIX}foo`)).toBe(true);
    });

    it('returns null for cache miss and increments miss stats', async () => {
      const value = await cacheGet('missing');
      const stats = await readStats(store);

      expect(value).toBeNull();
      expect(stats.misses).toBe(1);
    });

    it('increments hit counters on cache hit', async () => {
      setCacheEntry(store, 'hit', 'v', Date.now(), 10000, 0);

      await cacheGet('hit');
      const stats = await readStats(store);
      const raw = JSON.parse(store.get(`${CACHE_PREFIX}hit`) || '{}');

      expect(stats.hits).toBe(1);
      expect(raw.hits).toBe(1);
    });

    it('expires stale entries and deletes them', async () => {
      setCacheEntry(store, 'old', 'v', Date.now() - 10001, 10000, 2);

      const value = await cacheGet('old');
      const stats = await readStats(store);

      expect(value).toBeNull();
      expect(stats.misses).toBe(1);
      expect(store.has(`${CACHE_PREFIX}old`)).toBe(false);
    });

    it('handles read failures gracefully', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('boom'));

      const value = await cacheGet('error');

      expect(value).toBeNull();
    });
  });

  describe('cacheDel/cacheExists', () => {
    it('deletes cache entries', async () => {
      setCacheEntry(store, 'k', 'v', Date.now(), 10000, 0);

      await cacheDel('k');
      expect(store.has(`${CACHE_PREFIX}k`)).toBe(false);
    });

    it('cacheExists returns true for valid entries', async () => {
      setCacheEntry(store, 'exists', 1, Date.now(), 10000, 0);
      await expect(cacheExists('exists')).resolves.toBe(true);
    });

    it('cacheExists returns false for missing entries', async () => {
      await expect(cacheExists('none')).resolves.toBe(false);
    });

    it('cacheExists returns false for expired entries', async () => {
      setCacheEntry(store, 'expired', 1, Date.now() - 10001, 10000, 0);
      await expect(cacheExists('expired')).resolves.toBe(false);
    });

    it('cacheExists returns false for malformed entries', async () => {
      store.set(`${CACHE_PREFIX}bad`, '{ bad json');
      await expect(cacheExists('bad')).resolves.toBe(false);
    });
  });

  describe('cacheGetOrSet', () => {
    it('returns cached value without calling fallback', async () => {
      await cacheSet('cached', 'ok', 10000);
      const fetchFn = jest.fn(async () => 'fresh');

      const value = await cacheGetOrSet('cached', fetchFn);

      expect(value).toBe('ok');
      expect(fetchFn).not.toHaveBeenCalled();
    });

    it('uses fallback and stores value on miss', async () => {
      const fetchFn = jest.fn(async () => 'fresh');

      const value = await cacheGetOrSet('new', fetchFn, 5000);

      expect(value).toBe('fresh');
      expect(fetchFn).toHaveBeenCalledTimes(1);
      expect(await cacheGet('new')).toBe('fresh');
    });

    it('propagates fallback errors', async () => {
      const fetchFn = jest.fn(async () => {
        throw new Error('fetch failed');
      });

      await expect(cacheGetOrSet('k', fetchFn)).rejects.toThrow('fetch failed');
    });
  });

  describe('batch operations', () => {
    it('cacheMSet and cacheMGet work for multiple entries', async () => {
      await cacheMSet([
        { key: 'a', value: 1, ttl: 10000 },
        { key: 'b', value: 2, ttl: 10000 },
      ]);

      const values = await cacheMGet<number>(['a', 'b', 'c']);
      expect(values).toEqual([1, 2, null]);
    });

    it('cacheMSet works with default ttl when omitted', async () => {
      await cacheMSet([{ key: 'default-ttl', value: 'v' }]);
      const raw = JSON.parse(store.get(`${CACHE_PREFIX}default-ttl`) || '{}');
      expect(raw.ttl).toBe(3600000);
    });
  });

  describe('cacheClear', () => {
    it('clears all cache keys when no pattern provided', async () => {
      setCacheEntry(store, 'x', 1, Date.now(), 1000);
      setCacheEntry(store, 'y', 2, Date.now(), 1000);
      store.set('@other_key', 'keep');

      const deleted = await cacheClear();

      expect(deleted).toBe(2);
      expect(store.has('@other_key')).toBe(true);
      expect(store.has(`${CACHE_PREFIX}x`)).toBe(false);
    });

    it('clears only keys matching pattern', async () => {
      setCacheEntry(store, 'user_1', 1, Date.now(), 1000);
      setCacheEntry(store, 'user_2', 2, Date.now(), 1000);
      setCacheEntry(store, 'feed_1', 3, Date.now(), 1000);

      const deleted = await cacheClear('^user_');

      expect(deleted).toBe(2);
      expect(store.has(`${CACHE_PREFIX}feed_1`)).toBe(true);
    });

    it('returns 0 on clear errors', async () => {
      (AsyncStorage.getAllKeys as jest.Mock).mockRejectedValueOnce(new Error('fail'));
      await expect(cacheClear()).resolves.toBe(0);
    });
  });

  describe('getCacheStats', () => {
    it('returns default stats when stats key is missing', async () => {
      await expect(getCacheStats()).resolves.toEqual({
        hits: 0,
        misses: 0,
        evictions: 0,
        size: 0,
        avgHitRate: 0,
      });
    });

    it('returns computed hit rate and size', async () => {
      store.set(STATS_KEY, JSON.stringify({ hits: 3, misses: 1 }));
      setCacheEntry(store, 'a', 1, Date.now(), 1000);
      setCacheEntry(store, 'b', 2, Date.now(), 1000);

      const stats = await getCacheStats();
      expect(stats.hits).toBe(3);
      expect(stats.misses).toBe(1);
      expect(stats.evictions).toBe(0);
      expect(stats.size).toBe(2);
      expect(stats.avgHitRate).toBe(75);
    });

    it('returns defaults on stats errors', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('oops'));
      const stats = await getCacheStats();
      expect(stats).toEqual({ hits: 0, misses: 0, evictions: 0, size: 0, avgHitRate: 0 });
    });

    it('returns cache hit rate as ratio', async () => {
      await cacheGet('miss-1');
      await cacheSet('hit-1', 1, 1000);
      await cacheGet('hit-1');

      expect(getCacheHitRate()).toBe(0.5);
    });
  });

  describe('cacheCleanup', () => {
    it('deletes expired entries', async () => {
      setCacheEntry(store, 'fresh', 1, Date.now(), 100000);
      setCacheEntry(store, 'stale', 2, Date.now() - 100001, 100000);

      const deleted = await cacheCleanup();

      expect(deleted).toBe(1);
      expect(store.has(`${CACHE_PREFIX}fresh`)).toBe(true);
      expect(store.has(`${CACHE_PREFIX}stale`)).toBe(false);
    });

    it('deletes malformed entries', async () => {
      store.set(`${CACHE_PREFIX}bad`, '{ not json');
      const deleted = await cacheCleanup();
      expect(deleted).toBe(1);
    });

    it('returns 0 when cleanup fails', async () => {
      (AsyncStorage.getAllKeys as jest.Mock).mockRejectedValueOnce(new Error('fail'));
      await expect(cacheCleanup()).resolves.toBe(0);
    });
  });

  describe('cacheLRUEvict', () => {
    it('does not evict when size is within max', async () => {
      for (let i = 0; i < 5; i += 1) {
        setCacheEntry(store, `k${i}`, i, Date.now(), 1000, i);
      }

      await expect(cacheLRUEvict()).resolves.toBe(0);
    });

    it('evicts least used oldest entries when over capacity', async () => {
      for (let i = 0; i < 102; i += 1) {
        setCacheEntry(store, `k${i}`, i, i, 1000000, 0);
      }

      const deleted = await cacheLRUEvict();

      expect(deleted).toBe(2);
      expect(store.has(`${CACHE_PREFIX}k0`)).toBe(false);
      expect(store.has(`${CACHE_PREFIX}k1`)).toBe(false);
      expect(store.has(`${CACHE_PREFIX}k101`)).toBe(true);
    });

    it('ignores malformed entries during eviction', async () => {
      store.set(`${CACHE_PREFIX}bad`, '{ nope');
      for (let i = 0; i < 101; i += 1) {
        setCacheEntry(store, `k${i}`, i, i, 1000000, i % 3);
      }
      const deleted = await cacheLRUEvict();
      expect(deleted).toBe(1);
    });

    it('returns 0 when eviction fails', async () => {
      (AsyncStorage.getAllKeys as jest.Mock).mockRejectedValueOnce(new Error('fail'));
      await expect(cacheLRUEvict()).resolves.toBe(0);
    });
  });

  describe('cacheWarmup', () => {
    it('warms cache with returned entries', async () => {
      const warmupFn = jest.fn(async () => [
        { key: 'warm1', value: 1, ttl: 1234 },
        { key: 'warm2', value: 2 },
      ]);

      const count = await cacheWarmup(warmupFn);

      expect(count).toBe(2);
      expect(await cacheGet('warm1')).toBe(1);
      expect(await cacheGet('warm2')).toBe(2);
    });

    it('returns 0 if warmup function throws', async () => {
      const count = await cacheWarmup(async () => {
        throw new Error('warmup fail');
      });
      expect(count).toBe(0);
    });
  });

  describe('cacheTTL/cacheExpire', () => {
    it('returns null ttl for missing key', async () => {
      await expect(cacheTTL('missing')).resolves.toBeNull();
    });

    it('returns remaining ttl for active key', async () => {
      setCacheEntry(store, 'ttl', 'v', Date.now() - 1000, 5000);
      const ttl = await cacheTTL('ttl');
      expect(ttl).not.toBeNull();
      expect(ttl as number).toBeGreaterThan(0);
      expect(ttl as number).toBeLessThanOrEqual(5000);
    });

    it('returns 0 ttl for expired key', async () => {
      setCacheEntry(store, 'expired-ttl', 'v', Date.now() - 6000, 5000);
      await expect(cacheTTL('expired-ttl')).resolves.toBe(0);
    });

    it('returns null ttl for malformed key payload', async () => {
      store.set(`${CACHE_PREFIX}badttl`, '{invalid');
      await expect(cacheTTL('badttl')).resolves.toBeNull();
    });

    it('cacheExpire updates ttl and timestamp', async () => {
      setCacheEntry(store, 'exp', 'v', Date.now() - 10000, 5000);

      const ok = await cacheExpire('exp', 20000);
      const raw = JSON.parse(store.get(`${CACHE_PREFIX}exp`) || '{}');

      expect(ok).toBe(true);
      expect(raw.ttl).toBe(20000);
      expect(raw.timestamp).toBeGreaterThan(Date.now() - 2000);
    });

    it('cacheExpire returns false for missing key', async () => {
      await expect(cacheExpire('none', 1000)).resolves.toBe(false);
    });

    it('cacheExpire returns false for malformed key payload', async () => {
      store.set(`${CACHE_PREFIX}bad-expire`, '{bad');
      await expect(cacheExpire('bad-expire', 1000)).resolves.toBe(false);
    });
  });

  describe('preloadCache/initCache/default export', () => {
    it('preloadCache resolves without writing when no warmup data is defined', async () => {
      await expect(preloadCache('user-1')).resolves.toBeUndefined();
      expect(AsyncStorage.setItem).not.toHaveBeenCalledWith(
        expect.stringContaining(CACHE_PREFIX),
        expect.any(String)
      );
    });

    it('initCache runs cleanup and eviction paths safely', async () => {
      setCacheEntry(store, 'old-init', 1, Date.now() - 100001, 100000, 0);
      for (let i = 0; i < 101; i += 1) {
        setCacheEntry(store, `init-k${i}`, i, i, 9999999, i % 2);
      }

      await expect(initCache()).resolves.toBeUndefined();
      expect(store.has(`${CACHE_PREFIX}old-init`)).toBe(false);
    });

    it('initCache handles AsyncStorage errors without throwing', async () => {
      (AsyncStorage.getAllKeys as jest.Mock).mockRejectedValueOnce(new Error('cleanup fail'));
      await expect(initCache()).resolves.toBeUndefined();
    });

    it('default export exposes all primary cache APIs', () => {
      expect(cacheLayer.set).toBe(cacheSet);
      expect(cacheLayer.get).toBe(cacheGet);
      expect(cacheLayer.del).toBe(cacheDel);
      expect(cacheLayer.exists).toBe(cacheExists);
      expect(cacheLayer.getOrSet).toBe(cacheGetOrSet);
      expect(cacheLayer.mget).toBe(cacheMGet);
      expect(cacheLayer.mset).toBe(cacheMSet);
      expect(cacheLayer.clear).toBe(cacheClear);
      expect(cacheLayer.getStats).toBe(getCacheStats);
      expect(cacheLayer.getHitRate).toBe(getCacheHitRate);
      expect(cacheLayer.cleanup).toBe(cacheCleanup);
      expect(cacheLayer.lruEvict).toBe(cacheLRUEvict);
      expect(cacheLayer.warmup).toBe(cacheWarmup);
      expect(cacheLayer.ttl).toBe(cacheTTL);
      expect(cacheLayer.expire).toBe(cacheExpire);
      expect(cacheLayer.preload).toBe(preloadCache);
      expect(cacheLayer.init).toBe(initCache);
    });
  });
});
