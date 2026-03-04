import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureFirebase } from '../firebaseClient';
import { getUserPreferenceScores } from '@/storage/local';
import { getPersonalizedRecommendations } from '../recommendations';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {},
    },
  },
}));

jest.mock('../firebaseClient', () => ({
  ensureFirebase: jest.fn(),
}));

jest.mock('@/storage/local', () => ({
  getUserPreferenceScores: jest.fn(async () => ({})),
}));

jest.mock('geofire-common', () => ({
  geohashQueryBounds: jest.fn(() => [['9vk1', '9vk9']]),
  distanceBetween: jest.fn((_a: number[], _b: number[]) => 0.8),
}));

function makeSnapshot(items: any[]) {
  const docs = items.map((item, index) => ({
    id: item.id || item.placeId || `doc-${index}`,
    data: () => item,
  }));
  return {
    docs,
    forEach: (callback: (doc: any) => void) => docs.forEach(callback),
  };
}

describe('recommendations scalability path', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('uses aggregated spots docs and batches time-pattern lookups', async () => {
    const queryLog: Array<{ collection: string; filters: Array<{ field: string; op: string; value: any }> }> = [];
    const spotDocs = [
      {
        id: 'spot-1',
        placeId: 'spot-1',
        name: 'Proxy Cafe',
        geoHash: '9vk1abc',
        lat: 29.72,
        lng: -95.34,
        intel: { category: 'cafe', hasWifi: true, wifiConfidence: 0.9, inferredNoise: 'quiet' },
        live: { checkinCount: 12, noise: 'quiet', busyness: 'some' },
        display: { noise: 'quiet', busyness: 'some' },
      },
      {
        id: 'spot-2',
        placeId: 'spot-2',
        name: 'Library Annex',
        geoHash: '9vk1abd',
        lat: 29.721,
        lng: -95.341,
        intel: { category: 'library', hasWifi: true, wifiConfidence: 0.8, inferredNoise: 'quiet' },
        live: { checkinCount: 7, noise: 'quiet', busyness: 'empty' },
        display: { noise: 'quiet', busyness: 'empty' },
      },
    ];
    const userCheckins = [
      { userId: 'user-1', spotPlaceId: 'spot-1', noiseLevel: 2, busyness: 2, wifiSpeed: 4.5, createdAt: Date.now() - 60_000 },
    ];
    const patternCheckins = [
      { spotPlaceId: 'spot-1', visibility: 'public', noiseLevel: 2, busyness: 2, createdAt: new Date('2026-03-03T14:00:00Z').getTime() },
      { spotPlaceId: 'spot-2', visibility: 'public', noiseLevel: 3, busyness: 1, createdAt: new Date('2026-03-03T15:00:00Z').getTime() },
    ];

    function createQuery(collection: string) {
      const filters: Array<{ field: string; op: string; value: any }> = [];
      return {
        where(field: string, op: string, value: any) {
          filters.push({ field, op, value });
          return this;
        },
        orderBy() {
          return this;
        },
        startAt() {
          return this;
        },
        endAt() {
          return this;
        },
        limit() {
          return this;
        },
        async get() {
          queryLog.push({ collection, filters: [...filters] });
          if (collection === 'spots') {
            return makeSnapshot(spotDocs);
          }
          if (collection === 'checkins') {
            if (filters.some((filter) => filter.field === 'userId' && filter.value === 'user-1')) {
              return makeSnapshot(userCheckins);
            }
            const inFilter = filters.find((filter) => filter.field === 'spotPlaceId' && filter.op === 'in');
            if (inFilter) {
              const allowed = Array.isArray(inFilter.value) ? new Set(inFilter.value) : new Set<string>();
              return makeSnapshot(patternCheckins.filter((checkin) => allowed.has(checkin.spotPlaceId)));
            }
          }
          return makeSnapshot([]);
        },
      };
    }

    (ensureFirebase as jest.Mock).mockReturnValue({
      auth: jest.fn(() => ({ currentUser: { uid: 'user-1' } })),
      firestore: jest.fn(() => ({
        collection: (name: string) => createQuery(name),
      })),
    });
    (getUserPreferenceScores as jest.Mock).mockResolvedValue({ cafe: 0.8, library: 0.2 });

    const recommendations = await getPersonalizedRecommendations(
      'user-1',
      { lat: 29.72, lng: -95.34 },
      { timeOfDay: 'afternoon' },
    );

    expect(recommendations).toHaveLength(2);
    expect(recommendations[0].placeId).toBe('spot-1');
    expect(getUserPreferenceScores).toHaveBeenCalledTimes(1);

    const spotQueries = queryLog.filter((query) => query.collection === 'spots');
    expect(spotQueries.length).toBeGreaterThan(0);

    const patternQueries = queryLog.filter((query) =>
      query.collection === 'checkins' &&
      query.filters.some((filter) => filter.field === 'spotPlaceId' && filter.op === 'in')
    );
    expect(patternQueries).toHaveLength(1);
    expect(patternQueries[0].filters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'visibility', op: '==', value: 'public' }),
      ])
    );

    const legacyCandidateScanQueries = queryLog.filter((query) =>
      query.collection === 'checkins' &&
      query.filters.some((filter) => filter.field === 'visibility' && filter.value === 'public') &&
      !query.filters.some((filter) => filter.field === 'spotPlaceId' && filter.op === 'in')
    );
    expect(legacyCandidateScanQueries).toHaveLength(0);
  });
});
