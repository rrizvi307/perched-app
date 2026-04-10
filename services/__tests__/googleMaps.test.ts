import Constants from 'expo-constants';
import { ensureFirebase, getCurrentFirebaseIdToken } from '../firebaseClient';
import {
  canonicalizePlaceSelection,
  getGoogleMapsCacheStats,
  getPlaceDetails,
  resetGoogleMapsCacheStats,
  searchPlacesNearby,
  searchPlacesNearbyResponse,
  searchPlacesResponse,
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

function mkFetchResponse(payload: any, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
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

  it('does not auto-enable direct Google calls in dev without an explicit override', async () => {
    delete process.env.EXPO_PUBLIC_ENABLE_CLIENT_PROVIDER_CALLS;
    (global as any).GOOGLE_MAPS_API_KEY = 'maps-key';

    const result = await searchPlacesResponse('coffee shops', 5);

    expect(result).toMatchObject({
      places: [],
      status: 'error',
      diagnostics: expect.objectContaining({
        source: 'proxy',
        errorCode: 'proxy_access_unavailable',
      }),
    });
    expect((global as any).fetch).not.toHaveBeenCalled();
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

  it('uses distance-ranked general nearby search when direct Google fallback is needed', async () => {
    (global as any).GOOGLE_MAPS_API_KEY = 'maps-key';
    (global as any).fetch = jest.fn(async (_url: string, init?: RequestInit) =>
      mkFetchResponse({
        places: [
          {
            id: 'general-nearby-1',
            displayName: { text: 'Current Venue' },
            location: { latitude: 29.72, longitude: -95.34 },
            types: ['restaurant'],
          },
        ],
      }),
    );

    const result = await searchPlacesNearbyResponse(29.72, -95.34, 1200, 'general');

    expect(result.status).toBe('ok');
    expect(result.places[0]).toEqual(
      expect.objectContaining({
        placeId: 'general-nearby-1',
        name: 'Current Venue',
      }),
    );
    expect((global as any).fetch).toHaveBeenCalledTimes(1);
    expect((global as any).fetch.mock.calls[0][0]).toBe('https://places.googleapis.com/v1/places:searchNearby');
    const [, requestInit] = (global as any).fetch.mock.calls[0];
    expect(JSON.parse(requestInit.body)).toEqual({
      locationRestriction: {
        circle: {
          center: { latitude: 29.72, longitude: -95.34 },
          radius: 1200,
        },
      },
      rankPreference: 'DISTANCE',
      maxResultCount: 20,
      languageCode: 'en',
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

  it('returns a typed proxy error instead of silent empty results when proxy access is unavailable', async () => {
    process.env.EXPO_PUBLIC_ENABLE_CLIENT_PROVIDER_CALLS = 'false';
    (global as any).fetch = jest.fn();

    const result = await searchPlacesResponse('coffee shops', 5);

    expect(result).toEqual(
      expect.objectContaining({
        places: [],
        status: 'error',
        diagnostics: expect.objectContaining({
          source: 'proxy',
          errorCode: 'proxy_access_unavailable',
        }),
      })
    );
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('retries once with refreshed proxy access when the proxy responds unauthorized', async () => {
    (getCurrentFirebaseIdToken as jest.Mock).mockResolvedValue('token-123');
    (ensureFirebase as jest.Mock).mockReturnValue({
      auth: jest.fn(() => ({
        currentUser: {
          getIdToken: jest.fn(async () => 'token-123'),
        },
      })),
    });
    (global as any).fetch = jest
      .fn()
      .mockResolvedValueOnce(mkFetchResponse({ error: 'Unauthorized' }, false, 401))
      .mockResolvedValueOnce(
        mkFetchResponse({
          place: {
            placeId: 'retry-place',
            name: 'Retry Cafe',
            address: '9 Proxy Way',
          },
        }),
      );

    const result = await getPlaceDetails('retry-place');

    expect(result).toEqual(
      expect.objectContaining({
        placeId: 'retry-place',
        name: 'Retry Cafe',
      }),
    );
    expect((global as any).fetch).toHaveBeenCalledTimes(2);
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

  it('hydrates canonical place details when a selected place is missing coordinates', async () => {
    (global as any).GOOGLE_MAPS_API_KEY = 'maps-key';
    (global as any).fetch = jest.fn(async (url: string) => {
      if (url.includes('places.googleapis.com/v1/places/canonical-place')) {
        return mkFetchResponse({
          id: 'canonical-place',
          displayName: { text: 'Canonical Cafe' },
          formattedAddress: '1 Verified Way',
          location: { latitude: 29.72, longitude: -95.34 },
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const result = await canonicalizePlaceSelection({
      placeId: 'canonical-place',
      name: 'Canonical Cafe',
    });

    expect(result).toEqual(
      expect.objectContaining({
        placeId: 'canonical-place',
        name: 'Canonical Cafe',
        location: { lat: 29.72, lng: -95.34 },
      }),
    );
  });

  it('resolves synthetic place ids to canonical Google place ids before posting', async () => {
    (global as any).FIREBASE_APP_CHECK_TOKEN = 'app-check-456';
    (global as any).fetch = jest.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body || '{}'));
      if (body.action === 'search_text') {
        return mkFetchResponse({
          places: [
            {
              placeId: 'resolved-google-place',
              name: 'Resolved Cafe',
              address: '200 Main St',
              location: { lat: 29.721, lng: -95.341 },
            },
          ],
        });
      }
      throw new Error(`Unexpected proxy request ${JSON.stringify(body)}`);
    });

    const result = await canonicalizePlaceSelection({
      placeId: 'native:resolved-cafe:29.7210:-95.3410',
      name: 'Resolved Cafe',
      location: { lat: 29.721, lng: -95.341 },
    });

    expect(result).toEqual(
      expect.objectContaining({
        placeId: 'resolved-google-place',
        name: 'Resolved Cafe',
        location: { lat: 29.721, lng: -95.341 },
      }),
    );
  });

  it('returns error with proxy_aborted when search is externally cancelled', async () => {
    (getCurrentFirebaseIdToken as jest.Mock).mockResolvedValue('token-789');
    const controller = new AbortController();
    controller.abort();

    const result = await searchPlacesResponse('test query', 5, controller.signal);
    expect(result.status).toBe('error');
    expect(result.diagnostics?.errorCode).toBe('proxy_aborted');
    expect(result.places).toEqual([]);
  });

  it('returns error with proxy_aborted when nearby search is externally cancelled', async () => {
    (getCurrentFirebaseIdToken as jest.Mock).mockResolvedValue('token-789');
    const controller = new AbortController();
    controller.abort();

    const result = await searchPlacesNearbyResponse(29.76, -95.37, 1500, 'study', controller.signal);
    expect(result.status).toBe('error');
    expect(result.diagnostics?.errorCode).toBe('proxy_aborted');
    expect(result.places).toEqual([]);
  });

  it('aborted search does not cache results or replace good state', async () => {
    (getCurrentFirebaseIdToken as jest.Mock).mockResolvedValue('token-789');
    // First: successful search
    (global as any).fetch = jest.fn(async () =>
      mkFetchResponse({
        places: [{ placeId: 'good-1', name: 'Good Cafe', address: '1 St', location: { lat: 29.7, lng: -95.3 } }],
      }),
    );
    const good = await searchPlacesResponse('cached query', 5);
    expect(good.status).toBe('ok');

    // Second: aborted search for same query
    const controller = new AbortController();
    controller.abort();
    const aborted = await searchPlacesResponse('cached query', 5, controller.signal);
    // Aborted result should not replace cached good result — returns cached
    // (the cache is checked before the proxy call, so a cached result wins)
    expect(aborted.status).toBe('ok');
    expect(aborted.places).toHaveLength(1);
  });
});
