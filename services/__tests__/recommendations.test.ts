import AsyncStorage from '@react-native-async-storage/async-storage';
import { ensureFirebase } from '../firebaseClient';
import { getUserPreferenceScores } from '@/storage/local';
import { getCollaborativeRecommendations, getPersonalizedRecommendations } from '../recommendations';

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

  it('prefers callable collaborative recommendations when functions are available', async () => {
    const callable = jest.fn(async () => ({
      data: {
        recommendations: [
          {
            placeId: 'server-spot-1',
            name: 'Server Cafe',
            score: 88,
            reasons: ['4 users with similar taste checked in here', 'Popular among people who like similar spots'],
          },
        ],
      },
    }));
    const firestoreCollection = jest.fn(() => {
      throw new Error('firestore should not be used when callable succeeds');
    });

    (ensureFirebase as jest.Mock).mockReturnValue({
      functions: jest.fn(() => ({})),
      app: jest.fn(() => ({
        functions: jest.fn(() => ({
          httpsCallable: jest.fn(() => callable),
        })),
      })),
      firestore: jest.fn(() => ({
        collection: firestoreCollection,
      })),
    });

    const recommendations = await getCollaborativeRecommendations('user-1', 'spot-1', 3);

    expect(callable).toHaveBeenCalledWith({ currentSpotId: 'spot-1', limit: 3 });
    expect(recommendations).toEqual([
      {
        placeId: 'server-spot-1',
        name: 'Server Cafe',
        score: 88,
        reasons: ['4 users with similar taste checked in here', 'Popular among people who like similar spots'],
        predictedBusyness: undefined,
        predictedNoise: undefined,
        bestTimeToVisit: undefined,
        matchScore: undefined,
      },
    ]);
    expect(firestoreCollection).not.toHaveBeenCalled();
  });

  it('falls back to firestore collaborative recommendations when the callable is unavailable', async () => {
    const callable = jest.fn(async () => {
      throw new Error('unavailable');
    });

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
        limit() {
          return this;
        },
        doc(id: string) {
          return {
            async get() {
              if (collection === 'spots' && id === 'spot-2') {
                return {
                  exists: true,
                  data: () => ({ name: 'Fallback Cafe' }),
                };
              }
              return { exists: false, data: () => ({}) };
            },
          };
        },
        async get() {
          if (collection !== 'checkins') {
            return makeSnapshot([]);
          }
          if (filters.some((filter) => filter.field === 'userId' && filter.value === 'user-1')) {
            return makeSnapshot([{ userId: 'user-1', spotPlaceId: 'spot-1' }]);
          }
          if (filters.some((filter) => filter.field === 'spotPlaceId' && filter.value === 'spot-1')) {
            return makeSnapshot([{ userId: 'peer-1', spotPlaceId: 'spot-1' }]);
          }
          const userBatch = filters.find((filter) => filter.field === 'userId' && filter.op === 'in');
          if (userBatch) {
            return makeSnapshot([{ userId: 'peer-1', spotPlaceId: 'spot-2' }]);
          }
          return makeSnapshot([]);
        },
      };
    }

    (ensureFirebase as jest.Mock).mockReturnValue({
      functions: jest.fn(() => ({})),
      app: jest.fn(() => ({
        functions: jest.fn(() => ({
          httpsCallable: jest.fn(() => callable),
        })),
      })),
      firestore: jest.fn(() => ({
        collection: (name: string) => createQuery(name),
      })),
    });

    const recommendations = await getCollaborativeRecommendations('user-1', 'spot-1', 5);

    expect(callable).toHaveBeenCalled();
    expect(recommendations).toEqual([
      {
        placeId: 'spot-2',
        name: 'Fallback Cafe',
        score: 100,
        reasons: ['1 user with similar taste checked in here', 'Popular among people who like similar spots'],
      },
    ]);
  });
});
