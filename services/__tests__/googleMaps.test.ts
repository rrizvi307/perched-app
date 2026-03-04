import Constants from 'expo-constants';
import { ensureFirebase } from '../firebaseClient';
import { getPlaceDetails, searchPlacesNearby } from '../googleMaps';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {},
    },
  },
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
    (global as any).fetch = jest.fn();
    (global as any).GOOGLE_MAPS_API_KEY = undefined;
    (Constants as any).expoConfig.extra = {
      FIREBASE_CONFIG: { projectId: 'perched-test' },
      FIREBASE_FUNCTIONS_REGION: 'us-central1',
    };
    (ensureFirebase as jest.Mock).mockReturnValue({
      auth: jest.fn(() => ({
        currentUser: null,
      })),
    });
  });

  afterEach(() => {
    delete (global as any).GOOGLE_MAPS_API_KEY;
    delete (global as any).GOOGLE_PLACES_ENDPOINT;
  });

  it('prefers the backend proxy for authenticated place details', async () => {
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
});
