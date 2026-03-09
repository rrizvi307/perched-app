import {
  DEFAULT_FILTERS,
  FIRESTORE_FILTERS,
  CLIENT_FILTERS,
  getActiveFilterCount,
  getActiveFirestoreFilterCount,
  hasActiveFilters,
  normalizeQueryFilters,
  type FilterState,
} from '../filterPolicy';
import { calculateDisplayData } from '../liveAggregation';
import { parseCheckinTimestamp, queryAllCheckins, queryCheckinsBySpot, queryCheckinsByUser } from '../schemaHelpers';
import { normalizeSpotForExplore, normalizeSpotsForExplore } from '../spotNormalizer';

function mockSnapshot(items: any[]) {
  return {
    empty: items.length === 0,
    docs: items.map((item, index) => ({ id: item.id || `doc-${index}`, data: () => item })),
    forEach: (cb: (doc: any) => void) => {
      items.forEach((item, index) => cb({ id: item.id || `doc-${index}`, data: () => item }));
    },
  };
}

function buildQueryMock(getResults: any[]) {
  const queue = [...getResults];
  const query: any = {
    where: jest.fn(() => query),
    orderBy: jest.fn(() => query),
    limit: jest.fn(() => query),
    startAfter: jest.fn(() => query),
    get: jest.fn(async () => queue.shift() ?? mockSnapshot([])),
    onSnapshot: jest.fn(() => jest.fn()),
  };
  return query;
}

function buildDbWithCollectionQueue(queryMocks: any[]) {
  const queue = [...queryMocks];
  return {
    collection: jest.fn(() => queue.shift() || buildQueryMock([mockSnapshot([])])),
  } as any;
}

describe('Integration Tests', () => {
  describe('Missing geoHash fallback', () => {
    it('handles spot without geoHash using root lat/lng', () => {
      const spot = normalizeSpotForExplore({ id: 'a', name: 'A', lat: 29.7, lng: -95.3, intel: null, live: null, display: null } as any);
      expect(spot.geoHash).toBe('');
      expect(spot.lat).toBe(29.7);
      expect(spot.lng).toBe(-95.3);
    });

    it('reads coordinates from location object', () => {
      const spot = normalizeSpotForExplore({ id: 'b', name: 'B', location: { lat: 29.71, lng: -95.31 } } as any);
      expect(spot.lat).toBe(29.71);
      expect(spot.lng).toBe(-95.31);
    });

    it('reads coordinates from firestore geo-point-like fields', () => {
      const spot = normalizeSpotForExplore({ id: 'c', name: 'C', location: { _lat: 29.72, _long: -95.32 } } as any);
      expect(spot.lat).toBe(29.72);
      expect(spot.lng).toBe(-95.32);
    });

    it('falls back to example.spotLatLng coordinates', () => {
      const spot = normalizeSpotForExplore({ id: 'd', name: 'D', example: { spotLatLng: { lat: 29.73, lng: -95.33 } } } as any);
      expect(spot.lat).toBe(29.73);
      expect(spot.lng).toBe(-95.33);
    });

    it('defaults to 0/0 when coordinates are missing', () => {
      const spot = normalizeSpotForExplore({ id: 'e', name: 'E' } as any);
      expect(spot.lat).toBe(0);
      expect(spot.lng).toBe(0);
      expect(spot.location).toEqual({ lat: 0, lng: 0 });
    });

    it('normalizes arrays with malformed/null spots safely', () => {
      const spots = normalizeSpotsForExplore([
        null,
        undefined,
        { id: 'x', name: 'X', lat: 1, lng: 2 },
        { name: 'Y', example: { spotLatLng: { lat: 3, lng: 4 } } },
      ] as any);
      expect(spots).toHaveLength(4);
      expect(spots[0].name).toBe('Unknown');
      expect(spots[2].lat).toBe(1);
      expect(spots[3].lng).toBe(4);
    });
  });

  describe('Schema migration compatibility', () => {
    it('parses Firestore Timestamp-like createdAt values', () => {
      const date = new Date('2026-01-01T00:00:00.000Z');
      const parsed = parseCheckinTimestamp({ createdAt: { toDate: () => date } });
      expect(parsed?.toISOString()).toBe(date.toISOString());
    });

    it('parses numeric legacy timestamp values', () => {
      const parsed = parseCheckinTimestamp({ timestamp: 1735689600000 });
      expect(parsed?.getTime()).toBe(1735689600000);
    });

    it('returns null for invalid timestamp payloads', () => {
      expect(parseCheckinTimestamp({ createdAt: 'bad-date' })).toBeNull();
      expect(parseCheckinTimestamp({})).toBeNull();
    });

    it('uses primary spotPlaceId query when data exists', async () => {
      const primary = buildQueryMock([mockSnapshot([{ id: 'p1', spotPlaceId: 'spot-a' }])]);
      const db = buildDbWithCollectionQueue([primary]);
      const fb: any = { firestore: { Timestamp: { fromDate: (d: Date) => d } } };

      const result = await queryCheckinsBySpot(db, fb, 'spot-a', { limit: 10 });
      expect(result.empty).toBe(false);
      expect(db.collection).toHaveBeenCalledTimes(1);
      expect(primary.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
    });

    it('falls back to legacy spotId query when primary is empty', async () => {
      const primary = buildQueryMock([mockSnapshot([])]);
      const legacy = buildQueryMock([mockSnapshot([{ id: 'l1', spotId: 'spot-b' }])]);
      const db = buildDbWithCollectionQueue([primary, legacy]);
      const fb: any = { firestore: { Timestamp: { fromDate: (d: Date) => d } } };

      const result = await queryCheckinsBySpot(db, fb, 'spot-b', { limit: 5 });
      expect(result.empty).toBe(false);
      expect(db.collection).toHaveBeenCalledTimes(2);
      expect(legacy.orderBy).toHaveBeenCalledWith('timestamp', 'desc');
    });

    it('falls back to legacy timestamp query for user checkins', async () => {
      const primary = buildQueryMock([mockSnapshot([])]);
      const legacy = buildQueryMock([mockSnapshot([{ id: 'u1', userId: 'user-a' }])]);
      const db = buildDbWithCollectionQueue([primary, legacy]);
      const fb: any = { firestore: { Timestamp: { fromDate: (d: Date) => d } } };

      const result = await queryCheckinsByUser(db, fb, 'user-a', { limit: 20 });
      expect(result.empty).toBe(false);
      expect(primary.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
      expect(legacy.orderBy).toHaveBeenCalledWith('timestamp', 'desc');
    });

    it('supports approvedOnly fallback in queryAllCheckins', async () => {
      const query = buildQueryMock([mockSnapshot([]), mockSnapshot([{ id: 'a1', approved: true }])]);
      const db = { collection: jest.fn(() => query) } as any;

      const result = await queryAllCheckins(db, { approvedOnly: true, limit: 10 });
      expect(result.empty).toBe(false);
      expect(query.where).toHaveBeenCalledWith('approved', '==', true);
      expect(query.orderBy).toHaveBeenNthCalledWith(1, 'createdAt', 'desc');
      expect(query.orderBy).toHaveBeenNthCalledWith(2, 'timestamp', 'desc');
    });
  });

  describe('Filter combination edge cases', () => {
    const allFilters: FilterState = {
      distance: 5,
      openNow: true,
      noiseLevel: 'quiet',
      notCrowded: true,
      priceLevel: ['$', '$$'],
      highRated: true,
      goodForStudying: true,
      goodForMeetings: true,
    };

    it('counts all active filters correctly', () => {
      expect(getActiveFilterCount(allFilters)).toBe(8);
    });

    it('counts only firestore-backed filters separately', () => {
      expect(getActiveFirestoreFilterCount(allFilters)).toBe(4);
    });

    it('downgrades excess firestore filters to stay under max=3', () => {
      const result = normalizeQueryFilters(allFilters, 3);
      expect(result.activeFirestoreFilters.length).toBeLessThanOrEqual(3);
      expect(result.downgraded).toEqual(['goodForMeetings']);
      expect(result.normalized.goodForMeetings).toBe(false);
    });

    it('downgrades in priority order for max=2', () => {
      const result = normalizeQueryFilters(allFilters, 2);
      expect(result.downgraded).toEqual(['goodForMeetings', 'goodForStudying']);
      expect(result.normalized.openNow).toBe(true);
      expect(result.normalized.priceLevel).toEqual(['$', '$$']);
    });

    it('downgrades to one firestore filter for max=1', () => {
      const result = normalizeQueryFilters(allFilters, 1);
      expect(result.activeFirestoreFilters).toEqual(['priceLevel']);
      expect(result.normalized.priceLevel).toEqual(['$', '$$']);
    });

    it('does not mutate input filter object', () => {
      const original = { ...allFilters, priceLevel: [...allFilters.priceLevel] };
      normalizeQueryFilters(allFilters, 2);
      expect(allFilters).toEqual(original);
    });

    it('hasActiveFilters returns false for defaults and true when changed', () => {
      expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
      expect(hasActiveFilters({ ...DEFAULT_FILTERS, notCrowded: true })).toBe(true);
    });

    it('keeps firestore and client filter sets disjoint', () => {
      const overlap = FIRESTORE_FILTERS.filter((field) => CLIENT_FILTERS.includes(field as any));
      expect(overlap).toEqual([]);
    });
  });

  describe('Intelligence data lifecycle', () => {
    it('returns empty display when no inferred or live data exists', () => {
      const result = calculateDisplayData(
        { inferredNoise: null, inferredNoiseConfidence: 0 },
        { noise: null, busyness: null, checkinCount: 0, lastCheckinAt: null }
      );

      expect(result.noise).toBeNull();
      expect(result.noiseSource).toBe('inferred');
      expect(result.noiseLabel).toBe('No data yet');
      expect(result.busynessLabel).toBe('No recent data');
    });

    it('shows inferred noise when no live checkins are available', () => {
      const result = calculateDisplayData(
        { inferredNoise: 'quiet', inferredNoiseConfidence: 0.8 },
        { noise: null, busyness: null, checkinCount: 0, lastCheckinAt: null }
      );

      expect(result.noiseSource).toBe('inferred');
      expect(result.noiseLabel).toContain('inferred from reviews');
    });

    it('shows blended noise at low checkin count when live differs from inferred', () => {
      const result = calculateDisplayData(
        { inferredNoise: 'quiet', inferredNoiseConfidence: 0.75 },
        { noise: 'loud', busyness: 'some', checkinCount: 1, lastCheckinAt: Date.now() }
      );

      expect(result.noiseSource).toBe('blended');
      expect(result.noise).toBe('loud');
      expect(result.noiseLabel).toContain('usually quiet');
    });

    it('shows blended noise at low checkin count when live matches inferred', () => {
      const result = calculateDisplayData(
        { inferredNoise: 'moderate', inferredNoiseConfidence: 0.75 },
        { noise: 'moderate', busyness: 'some', checkinCount: 2, lastCheckinAt: Date.now() }
      );

      expect(result.noiseSource).toBe('blended');
      expect(result.noiseLabel).not.toContain('usually');
    });

    it('switches to live source at higher checkin confidence', () => {
      const result = calculateDisplayData(
        { inferredNoise: 'quiet', inferredNoiseConfidence: 0.6 },
        { noise: 'moderate', busyness: 'packed', checkinCount: 6, lastCheckinAt: Date.now() }
      );

      expect(result.noiseSource).toBe('live');
      expect(result.noise).toBe('moderate');
      expect(result.noiseLabel).toContain('check-ins');
    });

    it('stays live at max checkin confidence (10+)', () => {
      const result = calculateDisplayData(
        { inferredNoise: 'quiet', inferredNoiseConfidence: 0.9 },
        { noise: 'loud', busyness: 'packed', checkinCount: 12, lastCheckinAt: Date.now() }
      );

      expect(result.noiseSource).toBe('live');
      expect(result.noise).toBe('loud');
    });

    it('returns no recent busyness when missing live busyness', () => {
      const result = calculateDisplayData(
        { inferredNoise: 'quiet', inferredNoiseConfidence: 0.9 },
        { noise: 'quiet', busyness: null, checkinCount: 4, lastCheckinAt: Date.now() }
      );

      expect(result.busyness).toBeNull();
      expect(result.busynessLabel).toBe('No recent data');
    });

    it('returns live busyness label when busyness exists', () => {
      const result = calculateDisplayData(
        { inferredNoise: 'quiet', inferredNoiseConfidence: 0.9 },
        { noise: 'quiet', busyness: 'some', checkinCount: 4, lastCheckinAt: Date.now() }
      );

      expect(result.busyness).toBe('some');
      expect(result.busynessSource).toBe('live');
      expect(result.busynessLabel).toContain('(live)');
    });
  });
});
