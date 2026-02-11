import type { Spot, SpotDisplay, SpotIntel, SpotLive } from './spotSchema';
import { getDefaultDisplay, getDefaultIntel, getDefaultLive } from './spotSchema';

export type SafeSpot = Omit<Spot, 'intel' | 'live' | 'display'> & {
  [key: string]: any;
  intel: SpotIntel;
  live: SpotLive;
  display: SpotDisplay;
  rating?: number;
  openNow?: boolean;
  priceLevel?: string | null;
  location?: { lat: number; lng: number };
  example?: {
    [key: string]: any;
    spotPlaceId: string;
    spotLatLng: { lat: number; lng: number };
    location: { lat: number; lng: number };
    address: string;
  };
};

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readCoords(rawSpot: any): { lat: number; lng: number } {
  const latCandidates = [
    rawSpot?.lat,
    rawSpot?.location?.lat,
    rawSpot?.location?._lat,
    rawSpot?.example?.spotLatLng?.lat,
    rawSpot?.example?.location?.lat,
  ];

  const lngCandidates = [
    rawSpot?.lng,
    rawSpot?.location?.lng,
    rawSpot?.location?._long,
    rawSpot?.location?._lng,
    rawSpot?.example?.spotLatLng?.lng,
    rawSpot?.example?.location?.lng,
  ];

  const lat = latCandidates.map(toNumber).find((v) => typeof v === 'number') ?? 0;
  const lng = lngCandidates.map(toNumber).find((v) => typeof v === 'number') ?? 0;

  return { lat, lng };
}

export function normalizeSpotForExplore(rawSpot: Partial<Spot> | null | undefined): SafeSpot {
  const base = rawSpot && typeof rawSpot === 'object' ? (rawSpot as Record<string, any>) : {};
  const coords = readCoords(base);

  const intel: SpotIntel = {
    ...getDefaultIntel(),
    ...(base.intel || {}),
  };

  const live: SpotLive = {
    ...getDefaultLive(),
    ...(base.live || {}),
    checkinCount:
      toNumber(base.live?.checkinCount) ??
      toNumber(base.checkinCount) ??
      toNumber(base.count) ??
      0,
  };

  const inferredNoise = typeof intel.inferredNoise === 'string' ? intel.inferredNoise : null;
  const liveNoise = typeof live.noise === 'string' ? live.noise : null;
  const liveBusyness = typeof live.busyness === 'string' ? live.busyness : null;

  const display: SpotDisplay = {
    ...getDefaultDisplay(),
    ...(base.display || {}),
    noise: (base.display?.noise || liveNoise || inferredNoise || null) as SpotDisplay['noise'],
    noiseSource: (base.display?.noiseSource || (liveNoise ? 'live' : inferredNoise ? 'inferred' : 'inferred')) as SpotDisplay['noiseSource'],
    busyness: (base.display?.busyness || liveBusyness || null) as SpotDisplay['busyness'],
    busynessSource: (base.display?.busynessSource || (liveBusyness ? 'live' : 'live')) as SpotDisplay['busynessSource'],
    noiseLabel:
      typeof base.display?.noiseLabel === 'string' && base.display.noiseLabel.trim()
        ? base.display.noiseLabel
        : getDefaultDisplay().noiseLabel,
    busynessLabel:
      typeof base.display?.busynessLabel === 'string' && base.display.busynessLabel.trim()
        ? base.display.busynessLabel
        : getDefaultDisplay().busynessLabel,
  };

  const openNow =
    typeof base.openNow === 'boolean'
      ? base.openNow
      : typeof intel.isOpenNow === 'boolean'
      ? intel.isOpenNow
      : undefined;

  const rating = toNumber(base.rating) ?? toNumber(intel.avgRating) ?? undefined;
  const priceLevel = typeof intel.priceLevel === 'string' ? intel.priceLevel : base.priceLevel || null;

  const normalized: SafeSpot = {
    ...base,
    id: typeof base.id === 'string' ? base.id : '',
    name: typeof base.name === 'string' && base.name.trim() ? base.name : 'Unknown',
    address: typeof base.address === 'string' ? base.address : base?.example?.address || '',
    placeId:
      (typeof base.placeId === 'string' && base.placeId) ||
      (typeof base.googlePlaceId === 'string' && base.googlePlaceId) ||
      (typeof base?.example?.spotPlaceId === 'string' && base.example.spotPlaceId) ||
      '',
    geoHash: typeof base.geoHash === 'string' ? base.geoHash : '',
    lat: coords.lat,
    lng: coords.lng,
    location: { lat: coords.lat, lng: coords.lng },
    openNow,
    rating,
    priceLevel,
    intel,
    live,
    display,
    example: {
      ...(base.example || {}),
      spotPlaceId: base?.example?.spotPlaceId || base.placeId || base.googlePlaceId || base.id || '',
      spotLatLng: {
        lat: coords.lat,
        lng: coords.lng,
      },
      location: {
        lat: coords.lat,
        lng: coords.lng,
      },
      address: base?.example?.address || base.address || '',
    },
  };

  return normalized;
}

export function normalizeSpotsForExplore(rawSpots: Array<Partial<Spot> | null | undefined>): SafeSpot[] {
  if (!Array.isArray(rawSpots)) return [];
  return rawSpots.map(normalizeSpotForExplore);
}
