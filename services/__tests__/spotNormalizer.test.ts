import { getDefaultDisplay, getDefaultIntel, getDefaultLive } from '../spotSchema';
import { normalizeSpotForExplore, normalizeSpotsForExplore } from '../spotNormalizer';

describe('spotNormalizer', () => {
  it('returns safe defaults for null input', () => {
    const normalized = normalizeSpotForExplore(null);

    expect(normalized.name).toBe('Unknown');
    expect(normalized.geoHash).toBe('');
    expect(normalized.lat).toBe(0);
    expect(normalized.lng).toBe(0);
    expect(normalized.intel).toEqual(
      expect.objectContaining({
        priceLevel: null,
        avgRating: null,
        category: getDefaultIntel().category,
        inferredNoise: null,
        hasWifi: false,
        goodForStudying: false,
        goodForMeetings: false,
      })
    );
    expect(typeof normalized.intel.lastUpdated).toBe('number');
    expect(normalized.live).toEqual(expect.objectContaining(getDefaultLive()));
    expect(normalized.display).toEqual(expect.objectContaining(getDefaultDisplay()));
  });

  it('keeps valid core fields and merges intel/live/display', () => {
    const normalized = normalizeSpotForExplore({
      id: 'spot-1',
      name: 'Blacksmith Coffee',
      address: 'Houston, TX',
      placeId: 'g_1',
      geoHash: '9vk1abc',
      lat: 29.76,
      lng: -95.36,
      intel: {
        ...getDefaultIntel(),
        avgRating: 4.4,
        goodForStudying: true,
      },
      live: {
        ...getDefaultLive(),
        noise: 'quiet',
        checkinCount: 12,
      },
      display: {
        ...getDefaultDisplay(),
        noise: 'quiet',
        noiseSource: 'live',
      },
    });

    expect(normalized.id).toBe('spot-1');
    expect(normalized.name).toBe('Blacksmith Coffee');
    expect(normalized.intel.avgRating).toBe(4.4);
    expect(normalized.live.checkinCount).toBe(12);
    expect(normalized.display.noise).toBe('quiet');
  });

  it('extracts coordinates from nested location fields', () => {
    const normalized = normalizeSpotForExplore({
      name: 'Nested Spot',
      location: { _lat: 30.1, _long: -97.7 },
    } as any);

    expect(normalized.lat).toBe(30.1);
    expect(normalized.lng).toBe(-97.7);
    expect(normalized.location).toEqual({ lat: 30.1, lng: -97.7 });
  });

  it('falls back to example spot coordinates when top-level missing', () => {
    const normalized = normalizeSpotForExplore({
      name: 'Example Spot',
      example: {
        spotLatLng: { lat: 37.4, lng: -122.1 },
      },
    } as any);

    expect(normalized.lat).toBe(37.4);
    expect(normalized.lng).toBe(-122.1);
  });

  it('derives openNow from intel when direct value missing', () => {
    const normalized = normalizeSpotForExplore({
      intel: {
        ...getDefaultIntel(),
        isOpenNow: true,
      },
    } as any);

    expect(normalized.openNow).toBe(true);
  });

  it('prefers explicit openNow over intel.isOpenNow', () => {
    const normalized = normalizeSpotForExplore({
      openNow: false,
      intel: {
        ...getDefaultIntel(),
        isOpenNow: true,
      },
    } as any);

    expect(normalized.openNow).toBe(false);
  });

  it('derives rating from intel.avgRating when rating missing', () => {
    const normalized = normalizeSpotForExplore({
      intel: {
        ...getDefaultIntel(),
        avgRating: 4.8,
      },
    } as any);

    expect(normalized.rating).toBe(4.8);
  });

  it('prefers explicit rating over intel.avgRating', () => {
    const normalized = normalizeSpotForExplore({
      rating: 4.2,
      intel: {
        ...getDefaultIntel(),
        avgRating: 3.1,
      },
    } as any);

    expect(normalized.rating).toBe(4.2);
  });

  it('derives checkinCount from top-level count when live missing', () => {
    const normalized = normalizeSpotForExplore({
      count: 7,
    } as any);

    expect(normalized.live.checkinCount).toBe(7);
  });

  it('creates example place fallback values', () => {
    const normalized = normalizeSpotForExplore({
      id: 'doc-id-1',
      name: 'Fallback Place',
      address: 'Austin, TX',
    } as any);

    expect(normalized.example?.spotPlaceId).toBe('doc-id-1');
    expect(normalized.example?.address).toBe('Austin, TX');
    expect(normalized.example?.spotLatLng).toEqual({ lat: 0, lng: 0 });
  });

  it('normalizeSpotsForExplore returns empty array for non-array inputs', () => {
    expect(normalizeSpotsForExplore(null as any)).toEqual([]);
    expect(normalizeSpotsForExplore(undefined as any)).toEqual([]);
    expect(normalizeSpotsForExplore({} as any)).toEqual([]);
  });

  it('normalizeSpotsForExplore normalizes each item', () => {
    const items = normalizeSpotsForExplore([
      { name: 'A', lat: 1, lng: 2 },
      null,
      { name: '', location: { lat: 3, lng: 4 } },
    ] as any);

    expect(items).toHaveLength(3);
    expect(items[0].name).toBe('A');
    expect(items[1].name).toBe('Unknown');
    expect(items[2].name).toBe('Unknown');
    expect(items[2].lat).toBe(3);
    expect(items[2].lng).toBe(4);
  });
});
