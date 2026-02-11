import Constants from 'expo-constants';
import { ensureFirebase } from '../firebaseClient';
import { buildPlaceIntelligence } from '../placeIntelligence';

jest.mock('../firebaseClient', () => ({
  ensureFirebase: jest.fn(() => ({
    auth: jest.fn(() => ({ currentUser: null })),
  })),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {},
    },
  },
}));

function mkCheckin(overrides: any = {}) {
  return {
    createdAt: Date.now(),
    wifiSpeed: 4,
    busyness: 2,
    noiseLevel: 'quiet',
    laptopFriendly: true,
    ...overrides,
  };
}

function mkFetchResponse(payload: any, ok = true) {
  return {
    ok,
    json: async () => payload,
  };
}

describe('buildPlaceIntelligence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).PLACE_INTEL_ENDPOINT = 'https://intel.test/proxy';
    (global as any).FIREBASE_APP_CHECK_TOKEN = undefined;
    (Constants as any).expoConfig.extra = {};
    (global as any).fetch = jest.fn(async () => mkFetchResponse({ externalSignals: [] }, true));
  });

  afterEach(() => {
    delete (global as any).PLACE_INTEL_ENDPOINT;
    delete (global as any).FIREBASE_APP_CHECK_TOKEN;
  });

  it('returns stable baseline intelligence with minimal input', async () => {
    const result = await buildPlaceIntelligence({
      placeName: 'Minimal Spot',
    });

    expect(result.workScore).toBeGreaterThanOrEqual(0);
    expect(result.workScore).toBeLessThanOrEqual(100);
    expect(result.crowdLevel).toBe('unknown');
    expect(result.bestTime).toBe('anytime');
    expect(result.crowdForecast).toHaveLength(6);
    expect(result.useCases.length).toBeGreaterThan(0);
  });

  it('clamps workScore at upper bound for strong signals', async () => {
    const result = await buildPlaceIntelligence({
      placeName: 'High Signal Library',
      types: ['library'],
      openNow: true,
      checkins: Array.from({ length: 20 }).map(() => mkCheckin({ wifiSpeed: 5, busyness: 1, laptopFriendly: true })),
      tagScores: { 'Wi-Fi': 50, Outlets: 50, Seating: 50, Quiet: 50 },
    });

    expect(result.workScore).toBeLessThanOrEqual(100);
    expect(result.workScore).toBeGreaterThan(70);
  });

  it('derives low crowd level from low average busyness', async () => {
    const result = await buildPlaceIntelligence({
      placeName: 'Low Crowd Spot',
      checkins: [mkCheckin({ busyness: 1 }), mkCheckin({ busyness: 2 })],
    });
    expect(result.crowdLevel).toBe('low');
  });

  it('derives high crowd level from high average busyness', async () => {
    const result = await buildPlaceIntelligence({
      placeName: 'Busy Spot',
      checkins: [mkCheckin({ busyness: 5 }), mkCheckin({ busyness: 4.6 })],
    });
    expect(result.crowdLevel).toBe('high');
  });

  it('chooses bestTime from dominant checkin hour bucket', async () => {
    const afternoon = new Date();
    afternoon.setHours(14, 0, 0, 0);
    const evening = new Date();
    evening.setHours(19, 0, 0, 0);
    const checkins = [
      mkCheckin({ createdAt: afternoon.getTime() }),
      mkCheckin({ createdAt: afternoon.getTime() + 1000 }),
      mkCheckin({ createdAt: evening.getTime() }),
    ];

    const result = await buildPlaceIntelligence({
      placeName: 'Time Bucket Spot',
      checkins,
    });

    expect(result.bestTime).toBe('afternoon');
  });

  it('maps noise string values into scoring and quiet highlight', async () => {
    const result = await buildPlaceIntelligence({
      placeName: 'Quiet Corner',
      checkins: [mkCheckin({ noiseLevel: 'quiet' }), mkCheckin({ noiseLevel: 'quiet' })],
    });

    expect(result.highlights).toContain('Typically quiet');
  });

  it('adds open-now highlight when openNow is true', async () => {
    const result = await buildPlaceIntelligence({
      placeName: 'Open Spot',
      openNow: true,
      checkins: [mkCheckin({ wifiSpeed: 1, laptopFriendly: false, busyness: 4, noiseLevel: 'lively' })],
    });
    expect(result.highlights).toContain('Open now');
  });

  it('derives default use case when no strong signals exist', async () => {
    const result = await buildPlaceIntelligence({
      placeName: 'Neutral Spot',
      checkins: [],
      tagScores: {},
    });
    expect(result.useCases).toContain('Quick focus stop');
  });

  it('includes deep work and laptop sessions use cases from strong productivity signals', async () => {
    const result = await buildPlaceIntelligence({
      placeName: 'Focus Lab',
      types: ['workspace'],
      checkins: Array.from({ length: 10 }).map(() =>
        mkCheckin({ wifiSpeed: 5, laptopFriendly: true, busyness: 2, noiseLevel: 'quiet' })
      ),
      tagScores: { 'Wi-Fi': 30, Outlets: 30, Seating: 10, Quiet: 10 },
    });

    expect(result.useCases).toEqual(expect.arrayContaining(['Deep work', 'Laptop sessions']));
  });

  it('limits useCases to at most 3', async () => {
    const result = await buildPlaceIntelligence({
      placeName: 'Many Use Cases',
      openNow: true,
      checkins: Array.from({ length: 12 }).map(() =>
        mkCheckin({ wifiSpeed: 5, laptopFriendly: true, busyness: 4, noiseLevel: 'quiet' })
      ),
      tagScores: { 'Wi-Fi': 20, Outlets: 20, Quiet: 20 },
    });

    expect(result.useCases.length).toBeLessThanOrEqual(3);
  });

  it('fetches and normalizes external signals when endpoint and location are provided', async () => {
    (global as any).fetch = jest.fn(async () =>
      mkFetchResponse({
        externalSignals: [
          {
            source: 'yelp',
            rating: 4.6,
            reviewCount: 120,
            priceLevel: ' $$ ',
            categories: ['coffee', '', 123, 'study'],
          },
          {
            source: 'invalid',
            rating: 2,
          },
        ],
      })
    );

    const result = await buildPlaceIntelligence({
      placeName: 'External Spot',
      placeId: 'spot-1',
      location: { lat: 29.7, lng: -95.4 },
      checkins: [mkCheckin()],
    });

    expect(result.externalSignals).toHaveLength(1);
    expect(result.externalSignals[0]).toEqual({
      source: 'yelp',
      rating: 4.6,
      reviewCount: 120,
      priceLevel: '$$',
      categories: ['coffee', 'study'],
    });
    expect((global as any).fetch).toHaveBeenCalledTimes(1);
  });

  it('uses coffee meetups use case when external rating is high', async () => {
    (global as any).fetch = jest.fn(async () =>
      mkFetchResponse({
        externalSignals: [{ source: 'foursquare', rating: 4.5, reviewCount: 20 }],
      })
    );

    const result = await buildPlaceIntelligence({
      placeName: 'Rated Spot',
      placeId: 'rated-1',
      location: { lat: 10, lng: 10 },
      checkins: [mkCheckin({ wifiSpeed: 1, laptopFriendly: false, busyness: 1, noiseLevel: 'lively' })],
    });

    expect(result.useCases).toContain('Coffee meetups');
  });

  it('skips proxy fetch when endpoint is unavailable', async () => {
    (global as any).PLACE_INTEL_ENDPOINT = '';
    const result = await buildPlaceIntelligence({
      placeName: 'No Endpoint',
      location: { lat: 1, lng: 1 },
      checkins: [mkCheckin()],
    });
    expect(result.externalSignals).toEqual([]);
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('skips proxy fetch when location is missing', async () => {
    const result = await buildPlaceIntelligence({
      placeName: 'No Location',
      checkins: [mkCheckin()],
    });
    expect(result.externalSignals).toEqual([]);
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('handles network failures by returning no external signals', async () => {
    (global as any).fetch = jest.fn(async () => {
      throw new Error('network down');
    });

    const result = await buildPlaceIntelligence({
      placeName: 'Network Fail Spot',
      placeId: 'fail-1',
      location: { lat: 3, lng: 4 },
      checkins: [mkCheckin()],
    });

    expect(result.externalSignals).toEqual([]);
  });

  it('handles non-ok responses by returning no external signals', async () => {
    (global as any).fetch = jest.fn(async () => mkFetchResponse({}, false));
    const result = await buildPlaceIntelligence({
      placeName: 'Bad Status Spot',
      placeId: 'bad-1',
      location: { lat: 1, lng: 2 },
      checkins: [mkCheckin()],
    });
    expect(result.externalSignals).toEqual([]);
  });

  it('adds auth headers when user token and app check token exist', async () => {
    const token = 'token-123';
    (ensureFirebase as jest.Mock).mockReturnValue({
      auth: jest.fn(() => ({
        currentUser: {
          getIdToken: jest.fn(async () => token),
        },
      })),
    });
    (global as any).FIREBASE_APP_CHECK_TOKEN = 'app-check';
    (global as any).fetch = jest.fn(async () => mkFetchResponse({ externalSignals: [] }));

    await buildPlaceIntelligence({
      placeName: 'Header Spot',
      placeId: 'header-1',
      location: { lat: 1, lng: 1 },
      checkins: [mkCheckin()],
    });

    expect((global as any).fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${token}`,
          'X-Firebase-AppCheck': 'app-check',
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  it('uses intelligence cache for repeated identical requests', async () => {
    (global as any).fetch = jest.fn(async () => mkFetchResponse({ externalSignals: [] }));
    const input = {
      placeName: 'Cache Spot',
      placeId: 'cache-spot-1',
      location: { lat: 22, lng: 33 },
      checkins: [mkCheckin()],
    };

    const first = await buildPlaceIntelligence(input);
    const second = await buildPlaceIntelligence(input);

    expect(second).toEqual(first);
    expect((global as any).fetch).toHaveBeenCalledTimes(1);
  });

  it('deduplicates in-flight proxy requests for same key', async () => {
    let resolver: ((value: any) => void) | null = null;
    (global as any).fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          resolver = resolve;
        })
    );

    const input = {
      placeName: 'Inflight Spot',
      placeId: 'inflight-1',
      location: { lat: 9, lng: 9 },
      checkins: [mkCheckin()],
    };

    const p1 = buildPlaceIntelligence(input);
    const p2 = buildPlaceIntelligence(input);

    for (let i = 0; i < 20 && !resolver; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const resolveFetch = resolver;
    expect(resolveFetch).toBeTruthy();
    if (!resolveFetch) {
      throw new Error('fetch resolver was not initialized');
    }

    (resolveFetch as (value: any) => void)(mkFetchResponse({ externalSignals: [{ source: 'yelp', rating: 4.1 }] }));

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.externalSignals).toHaveLength(1);
    expect(r2.externalSignals).toHaveLength(1);
    expect((global as any).fetch).toHaveBeenCalledTimes(1);
  });

  it('builds six crowd forecast points with expected labels', async () => {
    const result = await buildPlaceIntelligence({
      placeName: 'Forecast Spot',
      checkins: [mkCheckin()],
    });

    expect(result.crowdForecast).toHaveLength(6);
    expect(result.crowdForecast[0].label).toBe('Now');
    expect(result.crowdForecast[1].label).toBe('+1h');
    expect(result.crowdForecast.every((p) => typeof p.localHourLabel === 'string')).toBe(true);
  });

  it('produces moderate/high social use cases when crowd is high', async () => {
    const result = await buildPlaceIntelligence({
      placeName: 'Social Spot',
      checkins: [mkCheckin({ busyness: 5 }), mkCheckin({ busyness: 4.5 })],
    });
    expect(result.useCases).toContain('Social energy');
  });

  it('includes low crowd highlight when forecast now is low', async () => {
    const early = new Date();
    early.setHours(6, 0, 0, 0);
    const result = await buildPlaceIntelligence({
      placeName: 'Low Forecast Spot',
      checkins: [
        mkCheckin({
          createdAt: early.getTime(),
          wifiSpeed: 1,
          laptopFriendly: false,
          busyness: 1,
          noiseLevel: 'lively',
        }),
        mkCheckin({
          createdAt: early.getTime(),
          wifiSpeed: 1,
          laptopFriendly: false,
          busyness: 1,
          noiseLevel: 'lively',
        }),
      ],
    });
    expect(result.highlights).toContain('Low crowd now');
  });

  it('handles non-number wifi/busyness/noise data safely', async () => {
    const result = await buildPlaceIntelligence({
      placeName: 'Malformed Metrics Spot',
      checkins: [
        mkCheckin({ wifiSpeed: 'fast', busyness: 'busy', noiseLevel: '???', laptopFriendly: 'yes' }),
      ] as any[],
    });

    expect(result.workScore).toBeGreaterThanOrEqual(0);
    expect(result.workScore).toBeLessThanOrEqual(100);
  });

  it('adds strong external review highlight for high review counts', async () => {
    (global as any).fetch = jest.fn(async () =>
      mkFetchResponse({
        externalSignals: [{ source: 'yelp', rating: 4.2, reviewCount: 300 }],
      })
    );
    const result = await buildPlaceIntelligence({
      placeName: 'Review Signal Spot',
      placeId: 'reviews-1',
      location: { lat: 2, lng: 2 },
      checkins: [mkCheckin({ wifiSpeed: 1, laptopFriendly: false, busyness: 4, noiseLevel: 'lively' })],
    });
    expect(result.highlights).toContain('Strong external reviews');
  });

  it('falls back to projectId/region-derived endpoint when explicit endpoint missing', async () => {
    (global as any).PLACE_INTEL_ENDPOINT = '';
    (Constants as any).expoConfig.extra = {
      FIREBASE_CONFIG: { projectId: 'perched-prod' },
      FIREBASE_FUNCTIONS_REGION: 'us-east1',
    };

    await buildPlaceIntelligence({
      placeName: 'Derived Endpoint Spot',
      placeId: 'derived-1',
      location: { lat: 3, lng: 3 },
      checkins: [mkCheckin()],
    });

    expect((global as any).fetch).toHaveBeenCalledWith(
      'https://us-east1-perched-prod.cloudfunctions.net/placeSignalsProxy',
      expect.any(Object)
    );
  });

  it('applies openNow penalty when closed compared to open', async () => {
    const checkins = [mkCheckin({ wifiSpeed: 3.5, busyness: 3, noiseLevel: 'moderate' })];
    const open = await buildPlaceIntelligence({
      placeName: 'Open Closed Compare',
      placeId: 'compare-1-open',
      location: { lat: 5, lng: 5 },
      openNow: true,
      checkins,
    });
    const closed = await buildPlaceIntelligence({
      placeName: 'Open Closed Compare',
      placeId: 'compare-1-closed',
      location: { lat: 5, lng: 5 },
      openNow: false,
      checkins,
    });

    expect(open.workScore).toBeGreaterThanOrEqual(closed.workScore);
  });
});
