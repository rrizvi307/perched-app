import Constants from 'expo-constants';
import { ensureFirebase, getCurrentFirebaseIdToken } from '../firebaseClient';
import {
  getGoogleMapsCacheStats,
  getPlaceDetails,
  resetGoogleMapsCacheStats,
  searchPlacesNearby,
} from '../googleMaps';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {},
    },
  },
}));

jest.mock('../firebaseClient', () => ({
  ensureFirebase: jest.fn(() => ({
    auth: jest.fn(() => ({ currentUser: null })),
  })),
  getCurrentFirebaseIdToken: jest.fn(async () => ''),
}));

function mkFetchResponse(payload: any, ok = true) {
  return {
    ok,
    json: async () => payload,
  };
}

describe('googleMaps transport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetGoogleMapsCacheStats();
    (global as any).fetch = jest.fn();
    (global as any).GOOGLE_MAPS_API_KEY = undefined;
    process.env.EXPO_PUBLIC_ENABLE_CLIENT_PROVIDER_CALLS = 'true';
    (Constants as any).expoConfig.extra = {
      FIREBASE_CONFIG: { projectId: 'perched-test' },
      FIREBASE_FUNCTIONS_REGION: 'us-central1',
    };
    (ensureFirebase as jest.Mock).mockReturnValue({
      auth: jest.fn(() => ({
        currentUser: null,
      })),
    });
    (getCurrentFirebaseIdToken as jest.Mock).mockResolvedValue('');
  });

  afterEach(() => {
    delete (global as any).GOOGLE_MAPS_API_KEY;
    delete (global as any).GOOGLE_PLACES_ENDPOINT;
    delete (global as any).FIREBASE_APP_CHECK_TOKEN;
    delete process.env.EXPO_PUBLIC_ENABLE_CLIENT_PROVIDER_CALLS;
  });

  it('prefers the backend proxy for authenticated place details', async () => {
    (getCurrentFirebaseIdToken as jest.Mock).mockResolvedValue('token-123');
    (ensureFirebase as jest.Mock).mockReturnValue({
      auth: jest.fn(() => ({
        currentUser: {
          getIdToken: jest.fn(async () => 'token-123'),
        },
      })),
    });
    (global as any).fetch = jest.fn(async () =>
      mkFetchResponse({
        place: {
          placeId: 'proxy-place',
          name: 'Proxy Cafe',
          address: '123 Main St',
          rating: 4.7,
          ratingCount: 211,
          openNow: true,
          hours: ['Monday: 7:00 AM - 6:00 PM'],
        },
      })
    );

    const result = await getPlaceDetails('proxy-place');

    expect(result).toEqual(
      expect.objectContaining({
        placeId: 'proxy-place',
        name: 'Proxy Cafe',
        rating: 4.7,
        ratingCount: 211,
        openNow: true,
        hours: ['Monday: 7:00 AM - 6:00 PM'],
      })
    );
    expect((global as any).fetch).toHaveBeenCalledTimes(1);
    expect((global as any).fetch).toHaveBeenCalledWith(
      'https://us-central1-perched-test.cloudfunctions.net/googlePlacesProxy',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
        }),
      })
    );
    const [, requestInit] = (global as any).fetch.mock.calls[0];
    expect(JSON.parse(requestInit.body)).toEqual({
      action: 'details',
      placeId: 'proxy-place',
    });
  });

  it('falls back to direct Google calls when proxy auth is unavailable', async () => {
    (global as any).GOOGLE_MAPS_API_KEY = 'maps-key';
    (global as any).fetch = jest.fn(async (url: string) => {
      if (url.includes('places.googleapis.com/v1/places/direct-place')) {
        return mkFetchResponse({
          id: 'direct-place',
          displayName: { text: 'Direct Cafe' },
          formattedAddress: '456 Elm St',
          rating: 4.2,
          userRatingCount: 98,
          currentOpeningHours: {
            openNow: false,
            weekdayDescriptions: ['Tuesday: 8:00 AM - 5:00 PM'],
          },
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const result = await getPlaceDetails('direct-place');

    expect(result).toEqual(
      expect.objectContaining({
        placeId: 'direct-place',
        name: 'Direct Cafe',
        rating: 4.2,
        ratingCount: 98,
        openNow: false,
        hours: ['Tuesday: 8:00 AM - 5:00 PM'],
      })
    );
    expect((global as any).fetch).toHaveBeenCalledTimes(1);
    expect((global as any).fetch.mock.calls[0][0]).toContain('places.googleapis.com/v1/places/direct-place');
  });

  it('uses the backend proxy for nearby search when the user is authenticated', async () => {
    (getCurrentFirebaseIdToken as jest.Mock).mockResolvedValue('token-456');
    (ensureFirebase as jest.Mock).mockReturnValue({
      auth: jest.fn(() => ({
        currentUser: {
          getIdToken: jest.fn(async () => 'token-456'),
        },
      })),
    });
    (global as any).fetch = jest.fn(async () =>
      mkFetchResponse({
        places: [
          {
            placeId: 'nearby-1',
            name: 'Nearby Cafe',
            address: '789 Oak St',
            location: { lat: 29.72, lng: -95.34 },
            rating: 4.5,
            ratingCount: 144,
            openNow: true,
            types: ['cafe'],
          },
        ],
      })
    );

    const results = await searchPlacesNearby(29.72, -95.34, 220, 'study');

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(
      expect.objectContaining({
        placeId: 'nearby-1',
        name: 'Nearby Cafe',
        rating: 4.5,
        ratingCount: 144,
        openNow: true,
      })
    );
    const [, requestInit] = (global as any).fetch.mock.calls[0];
    expect(JSON.parse(requestInit.body)).toEqual({
      action: 'nearby',
      lat: 29.72,
      lng: -95.34,
      radius: 220,
      intent: 'study',
    });
  });

  it('uses the backend proxy when App Check is available without auth', async () => {
    (global as any).FIREBASE_APP_CHECK_TOKEN = 'app-check-123';
    (global as any).fetch = jest.fn(async () =>
      mkFetchResponse({
        place: {
          placeId: 'proxy-appcheck-place',
          name: 'Proxy App Check Cafe',
          address: '100 Safe Proxy Ave',
          rating: 4.6,
          ratingCount: 63,
          openNow: true,
        },
      })
    );

    const result = await getPlaceDetails('proxy-appcheck-place');

    expect(result).toEqual(
      expect.objectContaining({
        placeId: 'proxy-appcheck-place',
        name: 'Proxy App Check Cafe',
        rating: 4.6,
        ratingCount: 63,
        openNow: true,
      })
    );
    expect((global as any).fetch).toHaveBeenCalledTimes(1);
    expect((global as any).fetch).toHaveBeenCalledWith(
      'https://us-central1-perched-test.cloudfunctions.net/googlePlacesProxy',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Firebase-AppCheck': 'app-check-123',
        }),
      })
    );
  });

  it('tracks details cache counters for misses, sets, and hits', async () => {
    (getCurrentFirebaseIdToken as jest.Mock).mockResolvedValue('token-789');
    (ensureFirebase as jest.Mock).mockReturnValue({
      auth: jest.fn(() => ({
        currentUser: {
          getIdToken: jest.fn(async () => 'token-789'),
        },
      })),
    });
    (global as any).fetch = jest.fn(async () =>
      mkFetchResponse({
        place: {
          placeId: 'counter-place',
          name: 'Counter Cafe',
        },
      })
    );

    const first = await getPlaceDetails('counter-place');
    const second = await getPlaceDetails('counter-place');

    expect(first?.name).toBe('Counter Cafe');
    expect(second?.name).toBe('Counter Cafe');
    expect((global as any).fetch).toHaveBeenCalledTimes(1);

    const stats = getGoogleMapsCacheStats();
    expect(stats.details.misses).toBeGreaterThanOrEqual(1);
    expect(stats.details.sets).toBeGreaterThanOrEqual(1);
    expect(stats.details.hits).toBeGreaterThanOrEqual(1);
  });
});
