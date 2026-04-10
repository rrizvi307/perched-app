/**
 * Google Maps / Places helper (single, consistent implementation)
 * - Uses `GOOGLE_MAPS_API_KEY` from env or global.
 * - Exports `searchPlaces` and `getPlaceDetails` used by UI components.
 */

import Constants from 'expo-constants';
import {
  fetchProviderProxyJson,
  type ProviderProxyAuthMode,
  type ProviderProxyErrorCode,
} from '@/services/providerProxy';
import { isClientProviderCallsEnabled } from '@/services/runtimeFlags';
import {
  getExpoExtra,
  getExpoFunctionEndpoint,
} from '@/services/expoConfig';

export function getMapsKey() {
  if (!isClientProviderCallsEnabled()) {
    return '';
  }
  return (
    (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY as string) ||
    (process.env.GOOGLE_MAPS_API_KEY as string) ||
    (typeof global !== 'undefined' ? (global as any).GOOGLE_MAPS_API_KEY : '') ||
    ((Constants.expoConfig as any)?.ios?.config?.googleMapsApiKey as string) ||
    ((Constants.expoConfig as any)?.android?.config?.googleMaps?.apiKey as string) ||
    (Constants.expoConfig as any)?.extra?.GOOGLE_MAPS_API_KEY ||
    (Constants as any)?.manifest?.extra?.GOOGLE_MAPS_API_KEY
  );
}

export type GooglePlaceReview = {
  text: string;
  rating: number;
  time: number;
};

export type PlaceSearchResult = {
  placeId: string;
  name: string;
  address?: string;
  location?: { lat: number; lng: number };
  rating?: number;
  ratingCount?: number;
  priceLevel?: string;
  openNow?: boolean;
  types?: string[];
  reviews?: GooglePlaceReview[];
  hours?: string[];
};

export type PlaceSearchDiagnostics = {
  source: 'proxy' | 'client' | 'none';
  authMode?: ProviderProxyAuthMode;
  errorCode?: ProviderProxyErrorCode | 'client_provider_error';
  message?: string;
};

export type PlaceSearchResponse = {
  places: PlaceSearchResult[];
  status: 'ok' | 'empty' | 'error';
  diagnostics: PlaceSearchDiagnostics | null;
};

type NearbySearchIntent = 'study' | 'general';

export function isSyntheticPlaceId(placeId?: string | null) {
  const normalized = typeof placeId === 'string' ? placeId.trim() : '';
  return normalized.startsWith('native:') || normalized.startsWith('top:');
}

function normalizePlaceName(value?: string | null) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function scoreCanonicalPlaceMatch(
  candidate: PlaceSearchResult,
  input: Pick<PlaceSearchResult, 'name' | 'location'>,
) {
  let score = 0;
  const candidateName = normalizePlaceName(candidate.name);
  const inputName = normalizePlaceName(input.name);
  if (candidateName && inputName && candidateName === inputName) score += 10;
  if (candidateName && inputName && candidateName.includes(inputName)) score += 4;
  if (input.location && candidate.location) {
    const latDelta = Math.abs(input.location.lat - candidate.location.lat);
    const lngDelta = Math.abs(input.location.lng - candidate.location.lng);
    score += Math.max(0, 5 - (latDelta + lngDelta) * 100);
  }
  if (typeof candidate.ratingCount === 'number') {
    score += Math.min(candidate.ratingCount / 100, 3);
  }
  return score;
}

export async function canonicalizePlaceSelection(
  input: Partial<PlaceSearchResult> | null | undefined,
): Promise<PlaceSearchResult | null> {
  const placeId = typeof input?.placeId === 'string' ? input.placeId.trim() : '';
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  const location =
    typeof input?.location?.lat === 'number' && typeof input?.location?.lng === 'number'
      ? input.location
      : undefined;

  if (placeId && !isSyntheticPlaceId(placeId)) {
    if (location) {
      return {
        placeId,
        name: name || placeId,
        address: input?.address,
        location,
        rating: input?.rating,
        ratingCount: input?.ratingCount,
        priceLevel: input?.priceLevel,
        openNow: input?.openNow,
        types: input?.types,
        reviews: input?.reviews,
        hours: input?.hours,
      };
    }

    const details = await getPlaceDetails(placeId);
    if (!details) {
      return {
        placeId,
        name: name || placeId,
        address: input?.address,
        rating: input?.rating,
        ratingCount: input?.ratingCount,
        priceLevel: input?.priceLevel,
        openNow: input?.openNow,
        types: input?.types,
        reviews: input?.reviews,
        hours: input?.hours,
      };
    }
    return {
      ...details,
      name: details.name || name || placeId,
      address: details.address || input?.address,
      location: details.location || location,
    };
  }

  if (!name) return null;

  let candidates: PlaceSearchResult[] = [];
  if (location) {
    const biased = await searchPlacesWithBiasResponse(name, location.lat, location.lng, 4000, 5);
    candidates = biased.places;
  }
  if (!candidates.length) {
    const textSearch = await searchPlacesResponse(name, 5);
    candidates = textSearch.places;
  }

  const canonical = candidates
    .filter((candidate) => candidate.placeId && !isSyntheticPlaceId(candidate.placeId))
    .sort((a, b) => scoreCanonicalPlaceMatch(b, { name, location }) - scoreCanonicalPlaceMatch(a, { name, location }))[0];

  if (!canonical) return null;

  if (canonical.location) return canonical;
  const details = await getPlaceDetails(canonical.placeId);
  return details || canonical;
}

function getGooglePlacesProxyEndpoint() {
  return getExpoFunctionEndpoint(['GOOGLE_PLACES_ENDPOINT'], 'googlePlacesProxy');
}

const searchCache = new Map<string, { ts: number; payload: PlaceSearchResult[] }>();
const detailsCache = new Map<string, { ts: number; payload: PlaceSearchResult | null }>();
const geocodeCache = new Map<string, { ts: number; payload: string | null }>();
const searchInflight = new Map<string, Promise<PlaceSearchResult[]>>();
const detailsInflight = new Map<string, Promise<PlaceSearchResult | null>>();
const geocodeInflight = new Map<string, Promise<string | null>>();
const SEARCH_CACHE_MAX = 120;
const DETAILS_CACHE_MAX = 80;
const GEOCODE_CACHE_MAX = 64;
type GoogleMapsCacheBucket = 'search' | 'details' | 'geocode';
type GoogleMapsCacheCounter = { hits: number; misses: number; sets: number; evictions: number };
const googleMapsCacheCounters: Record<GoogleMapsCacheBucket, GoogleMapsCacheCounter> = {
  search: { hits: 0, misses: 0, sets: 0, evictions: 0 },
  details: { hits: 0, misses: 0, sets: 0, evictions: 0 },
  geocode: { hits: 0, misses: 0, sets: 0, evictions: 0 },
};

function getCacheBucket<T>(cache: Map<string, { ts: number; payload: T }>): GoogleMapsCacheBucket {
  if (cache === detailsCache) return 'details';
  if (cache === geocodeCache) return 'geocode';
  return 'search';
}

function touchCacheEntry<T>(cache: Map<string, { ts: number; payload: T }>, key: string, entry: { ts: number; payload: T }) {
  cache.delete(key);
  cache.set(key, entry);
}

function pruneCache<T>(cache: Map<string, { ts: number; payload: T }>, maxEntries: number) {
  const bucket = getCacheBucket(cache);
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
    googleMapsCacheCounters[bucket].evictions += 1;
  }
}

function cacheGet<T>(cache: Map<string, { ts: number; payload: T }>, key: string, ttlMs: number) {
  const bucket = getCacheBucket(cache);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < ttlMs) {
    touchCacheEntry(cache, key, cached);
    googleMapsCacheCounters[bucket].hits += 1;
    return cached.payload;
  }
  googleMapsCacheCounters[bucket].misses += 1;
  return null;
}

function cacheGetEntry<T>(cache: Map<string, { ts: number; payload: T }>, key: string, ttlMs: number) {
  const bucket = getCacheBucket(cache);
  const cached = cache.get(key);
  if (!cached) {
    googleMapsCacheCounters[bucket].misses += 1;
    return null;
  }
  if (Date.now() - cached.ts >= ttlMs) {
    cache.delete(key);
    googleMapsCacheCounters[bucket].misses += 1;
    return null;
  }
  touchCacheEntry(cache, key, cached);
  googleMapsCacheCounters[bucket].hits += 1;
  return cached;
}

function cacheSet<T>(cache: Map<string, { ts: number; payload: T }>, key: string, payload: T, maxEntries: number) {
  const bucket = getCacheBucket(cache);
  cache.delete(key);
  cache.set(key, { ts: Date.now(), payload });
  googleMapsCacheCounters[bucket].sets += 1;
  pruneCache(cache, maxEntries);
}

function withInflight<T>(map: Map<string, Promise<T>>, key: string, fn: () => Promise<T>) {
  const existing = map.get(key);
  if (existing) return existing;
  const next = fn().finally(() => {
    map.delete(key);
  });
  map.set(key, next);
  return next;
}

async function fetchJson(url: string, timeoutMs = 3200) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = setTimeout(() => controller?.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller?.signal });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const message = json?.error?.message || json?.error_message || `Google Maps error ${res.status}`;
      throw new Error(message);
    }
    return json;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 3200) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = setTimeout(() => controller?.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller?.signal });
    const json = await res.json().catch(() => null);
    if (!res.ok) return null;
    return json;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

type GooglePlacesProxyPayload = {
  place?: unknown;
  places?: unknown[];
  city?: string | null;
};

async function fetchGooglePlacesProxy(action: string, payload: Record<string, any>, timeoutMs = 4200, signal?: AbortSignal | null) {
  const endpoint = getGooglePlacesProxyEndpoint();
  if (!endpoint) {
    return {
      data: null,
      meta: {
        action,
        endpoint: '',
        ok: false,
        authMode: 'none' as const,
        errorCode: 'proxy_endpoint_missing' as const,
        errorMessage: 'Google Places proxy endpoint missing',
      },
    };
  }
  return fetchProviderProxyJson<GooglePlacesProxyPayload>(
    endpoint,
    { action, ...payload },
    { action, timeoutMs, waitForAccessMs: 4200, signal },
  );
}

function okResponse(places: PlaceSearchResult[], diagnostics: PlaceSearchDiagnostics): PlaceSearchResponse {
  return {
    places,
    status: places.length ? 'ok' : 'empty',
    diagnostics,
  };
}

function errorResponse(diagnostics: PlaceSearchDiagnostics): PlaceSearchResponse {
  return {
    places: [],
    status: 'error',
    diagnostics,
  };
}

function normalizeGooglePriceLevel(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value <= 0) return undefined;
    return '$'.repeat(Math.max(1, Math.min(4, Math.round(value))));
  }
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (/^\$+$/.test(normalized)) return normalized.slice(0, 4);
  const match = normalized.match(/PRICE_LEVEL_(FREE|INEXPENSIVE|MODERATE|EXPENSIVE|VERY_EXPENSIVE)/i);
  if (!match) return undefined;
  if (match[1] === 'FREE') return undefined;
  if (match[1] === 'INEXPENSIVE') return '$';
  if (match[1] === 'MODERATE') return '$$';
  if (match[1] === 'EXPENSIVE') return '$$$';
  if (match[1] === 'VERY_EXPENSIVE') return '$$$$';
  return undefined;
}

function normalizeGoogleReviewText(value: any): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value?.text === 'string' && value.text.trim()) return value.text.trim();
  return null;
}

function normalizeGoogleReviewTime(value: any): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function normalizeGoogleReviews(value: unknown): GooglePlaceReview[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const reviews = value
    .map((review: any) => {
      const text = normalizeGoogleReviewText(review?.text ?? review);
      if (!text) return null;
      return {
        text,
        rating: typeof review?.rating === 'number' ? review.rating : 0,
        time: normalizeGoogleReviewTime(review?.publishTime ?? review?.time),
      } satisfies GooglePlaceReview;
    })
    .filter(Boolean) as GooglePlaceReview[];
  return reviews.length ? reviews : undefined;
}

function normalizePlaceLocation(value: any): { lat: number; lng: number } | undefined {
  const lat = typeof value?.latitude === 'number'
    ? value.latitude
    : typeof value?.lat === 'number'
      ? value.lat
      : null;
  const lng = typeof value?.longitude === 'number'
    ? value.longitude
    : typeof value?.lng === 'number'
      ? value.lng
      : null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lat, lng };
}

function normalizePlaceResult(value: any, fallbackPlaceId = ''): PlaceSearchResult | null {
  if (!value || typeof value !== 'object') return null;
  const placeId = typeof value.placeId === 'string' && value.placeId.trim()
    ? value.placeId.trim()
    : typeof value.id === 'string' && value.id.trim()
      ? value.id.trim()
      : typeof value.place_id === 'string' && value.place_id.trim()
        ? value.place_id.trim()
        : fallbackPlaceId.trim();
  const name = typeof value.displayName?.text === 'string' && value.displayName.text.trim()
    ? value.displayName.text.trim()
    : typeof value.name === 'string' && value.name.trim()
      ? value.name.trim()
      : '';
  if (!placeId || !name) return null;

  return {
    placeId,
    name,
    address:
      (typeof value.formattedAddress === 'string' && value.formattedAddress.trim()) ||
      (typeof value.formatted_address === 'string' && value.formatted_address.trim()) ||
      (typeof value.vicinity === 'string' && value.vicinity.trim()) ||
      (typeof value.address === 'string' && value.address.trim()) ||
      undefined,
    location: normalizePlaceLocation(value.location ?? value.geometry?.location),
    rating: typeof value.rating === 'number' ? value.rating : undefined,
    ratingCount:
      typeof value.userRatingCount === 'number'
        ? value.userRatingCount
        : typeof value.user_ratings_total === 'number'
          ? value.user_ratings_total
          : typeof value.ratingCount === 'number'
            ? value.ratingCount
            : undefined,
    priceLevel: normalizeGooglePriceLevel(value.priceLevel ?? value.price_level),
    openNow:
      typeof value.currentOpeningHours?.openNow === 'boolean'
        ? value.currentOpeningHours.openNow
        : typeof value.opening_hours?.open_now === 'boolean'
          ? value.opening_hours.open_now
          : typeof value.openNow === 'boolean'
            ? value.openNow
            : undefined,
    types: Array.isArray(value.types) ? value.types.filter((item: any) => typeof item === 'string' && item.trim()) : undefined,
    reviews: normalizeGoogleReviews(value.reviews),
    hours: Array.isArray(value.currentOpeningHours?.weekdayDescriptions)
      ? value.currentOpeningHours.weekdayDescriptions.filter((item: any) => typeof item === 'string' && item.trim())
      : Array.isArray(value.opening_hours?.weekday_text)
        ? value.opening_hours.weekday_text.filter((item: any) => typeof item === 'string' && item.trim())
        : Array.isArray(value.hours)
          ? value.hours.filter((item: any) => typeof item === 'string' && item.trim())
          : undefined,
  };
}

function normalizePlaceResults(value: unknown, limit?: number) {
  if (!Array.isArray(value)) return [];
  const results = value
    .map((item: any) => normalizePlaceResult(item))
    .filter(Boolean) as PlaceSearchResult[];
  return typeof limit === 'number' ? results.slice(0, limit) : results;
}

function pickCityFromGeocode(result: any): string | null {
  if (!result?.address_components) return null;
  const components = result.address_components as Array<{ long_name: string; types: string[] }>;
  const byType = (type: string) => components.find((c) => c.types.includes(type))?.long_name || null;
  return (
    byType('locality') ||
    byType('postal_town') ||
    byType('administrative_area_level_2') ||
    byType('administrative_area_level_1') ||
    null
  );
}

export async function reverseGeocodeCity(lat: number, lng: number): Promise<string | null> {
  const cacheKey = `geocode:${lat.toFixed(3)}:${lng.toFixed(3)}`;
  const cachedEntry = cacheGetEntry(geocodeCache, cacheKey, 10 * 60 * 1000);
  if (cachedEntry) return cachedEntry.payload;
  return withInflight(geocodeInflight, cacheKey, async () => {
    try {
      const proxied = await fetchGooglePlacesProxy('reverse_geocode', { lat, lng }, 2400);
      if (proxied.meta.ok && (typeof proxied.data?.city === 'string' || proxied.data?.city === null)) {
        cacheSet(geocodeCache, cacheKey, proxied.data?.city ?? null, GEOCODE_CACHE_MAX);
        return proxied.data?.city ?? null;
      }

      const key = getMapsKey();
      if (!key) return null;
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&result_type=locality|postal_town|administrative_area_level_2&key=${key}&language=en`;
      const json = await fetchJson(url);
      if (!json || json.status !== 'OK' || !Array.isArray(json.results)) {
        cacheSet(geocodeCache, cacheKey, null, GEOCODE_CACHE_MAX);
        return null;
      }
      for (const result of json.results) {
        const city = pickCityFromGeocode(result);
        if (city) {
          cacheSet(geocodeCache, cacheKey, city, GEOCODE_CACHE_MAX);
          return city;
        }
      }
      cacheSet(geocodeCache, cacheKey, null, GEOCODE_CACHE_MAX);
      return null;
    } catch (e) {
      console.warn('reverseGeocodeCity error', e);
      return null;
    }
  });
}

function buildDiagnostics(
  source: 'proxy' | 'client' | 'none',
  diagnostics?: Partial<PlaceSearchDiagnostics> | null,
): PlaceSearchDiagnostics {
  return {
    source,
    ...(diagnostics || {}),
  };
}

async function runDirectSearchPlaces(query: string, limit: number): Promise<PlaceSearchResult[]> {
  const key = getMapsKey();
  if (!key) return [];
  // Prefer Places API v1 (CORS-friendly for web)
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours,places.types',
      },
      body: JSON.stringify({ textQuery: query, languageCode: 'en' }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const message = json?.error?.message || 'Google Places search failed.';
      throw new Error(message);
    }
    const places = Array.isArray(json?.places) ? json.places : [];
    return normalizePlaceResults(places, limit);
  } catch {}

  const q = encodeURIComponent(query);
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${q}&key=${key}&language=en`;
  const json = await fetchJson(url);
  if (!json || !Array.isArray(json.results)) return [];
  return normalizePlaceResults(json.results, limit);
}

async function runDirectSearchPlacesWithBias(
  query: string,
  lat: number,
  lng: number,
  radiusMeters: number,
  limit: number,
): Promise<PlaceSearchResult[]> {
  const key = getMapsKey();
  if (!key) return [];
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours,places.types',
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: 'en',
        locationBias: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: radiusMeters,
          },
        },
      }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const message = json?.error?.message || 'Google Places search failed.';
      throw new Error(message);
    }
    const places = Array.isArray(json?.places) ? json.places : [];
    return normalizePlaceResults(places, limit);
  } catch {}

  const q = encodeURIComponent(query);
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${q}&location=${lat},${lng}&radius=${radiusMeters}&key=${key}&language=en`;
  const json = await fetchJson(url);
  if (!json || !Array.isArray(json.results)) return [];
  return normalizePlaceResults(json.results, limit);
}

async function runDirectSearchPlacesNearby(
  lat: number,
  lng: number,
  radius: number,
  intent: NearbySearchIntent,
): Promise<PlaceSearchResult[]> {
  const key = getMapsKey();
  if (!key) return [];
  const includedTypes = intent === 'study'
    ? ['cafe', 'coffee_shop', 'library', 'university', 'coworking_space']
    : undefined;
  const rankPreference = intent === 'study' ? 'POPULARITY' : 'DISTANCE';
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours,places.types',
      },
      body: JSON.stringify({
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius,
          },
        },
        includedTypes,
        rankPreference,
        maxResultCount: 20,
        languageCode: 'en',
      }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const message = json?.error?.message || 'Google Places nearby search failed.';
      throw new Error(message);
    }
    const places = Array.isArray(json?.places) ? json.places : [];
    return normalizePlaceResults(places, 20);
  } catch {}

  const keyword = intent === 'study' ? '&keyword=study%20cafe%20coffee%20library%20coworking' : '';
  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}${keyword}&key=${key}&language=en`;
  const json = await fetchJson(url);
  if (!json || !Array.isArray(json.results)) return [];
  return normalizePlaceResults(json.results, 20);
}

export async function searchPlacesResponse(query: string, limit = 6, signal?: AbortSignal | null): Promise<PlaceSearchResponse> {
  const cacheKey = `places:${query}:${limit}`;
  const cached = cacheGet(searchCache, cacheKey, 120000);
  if (cached) return okResponse(cached, buildDiagnostics('none'));
  try {
    const proxied = await fetchGooglePlacesProxy('search_text', { query, limit }, 2600, signal);
    // If externally cancelled, return a non-fatal aborted result.
    if (proxied.meta.errorCode === 'proxy_aborted') {
      return errorResponse(buildDiagnostics('proxy', { errorCode: 'proxy_aborted' }));
    }
    if (proxied.meta.ok) {
      const proxiedPlaces = normalizePlaceResults(proxied.data?.places, limit);
      if (proxiedPlaces.length) {
        cacheSet(searchCache, cacheKey, proxiedPlaces, SEARCH_CACHE_MAX);
        return okResponse(
          proxiedPlaces,
          buildDiagnostics('proxy', { authMode: proxied.meta.authMode }),
        );
      }
      return {
        places: [],
        status: 'empty',
        diagnostics: buildDiagnostics('proxy', { authMode: proxied.meta.authMode }),
      };
    }

    const directPlaces = await runDirectSearchPlaces(query, limit);
    if (directPlaces.length) {
      cacheSet(searchCache, cacheKey, directPlaces, SEARCH_CACHE_MAX);
      return okResponse(directPlaces, buildDiagnostics('client'));
    }
    if (!isClientProviderCallsEnabled()) {
      return errorResponse(
        buildDiagnostics('proxy', {
          authMode: proxied.meta.authMode,
          errorCode: proxied.meta.errorCode,
          message: proxied.meta.errorMessage,
        }),
      );
    }
    return {
      places: [],
      status: 'empty',
      diagnostics: buildDiagnostics('client'),
    };
  } catch (e) {
    console.warn('searchPlaces error', e);
    return errorResponse(
      buildDiagnostics('client', {
        errorCode: 'client_provider_error',
        message: e instanceof Error ? e.message : 'Google Places search failed.',
      }),
    );
  }
}

export async function searchPlaces(query: string, limit = 6, signal?: AbortSignal | null): Promise<PlaceSearchResult[]> {
  const response = await searchPlacesResponse(query, limit, signal);
  return response.places;
}

export async function searchPlacesWithBiasResponse(
  query: string,
  lat: number,
  lng: number,
  radiusMeters = 8000,
  limit = 8,
  signal?: AbortSignal | null,
): Promise<PlaceSearchResponse> {
  const cacheKey = `textbias:${query}:${lat.toFixed(3)}:${lng.toFixed(3)}:${radiusMeters}:${limit}`;
  const cached = cacheGet(searchCache, cacheKey, 120000);
  if (cached) return okResponse(cached, buildDiagnostics('none'));
  try {
    const proxied = await fetchGooglePlacesProxy(
      'search_text',
      { query, limit, lat, lng, radius: radiusMeters },
      2600,
      signal,
    );
    if (proxied.meta.errorCode === 'proxy_aborted') {
      return errorResponse(buildDiagnostics('proxy', { errorCode: 'proxy_aborted' }));
    }
    if (proxied.meta.ok) {
      const proxiedPlaces = normalizePlaceResults(proxied.data?.places, limit);
      if (proxiedPlaces.length) {
        cacheSet(searchCache, cacheKey, proxiedPlaces, SEARCH_CACHE_MAX);
        return okResponse(
          proxiedPlaces,
          buildDiagnostics('proxy', { authMode: proxied.meta.authMode }),
        );
      }
      return {
        places: [],
        status: 'empty',
        diagnostics: buildDiagnostics('proxy', { authMode: proxied.meta.authMode }),
      };
    }

    const directPlaces = await runDirectSearchPlacesWithBias(query, lat, lng, radiusMeters, limit);
    if (directPlaces.length) {
      cacheSet(searchCache, cacheKey, directPlaces, SEARCH_CACHE_MAX);
      return okResponse(directPlaces, buildDiagnostics('client'));
    }
    if (!isClientProviderCallsEnabled()) {
      return errorResponse(
        buildDiagnostics('proxy', {
          authMode: proxied.meta.authMode,
          errorCode: proxied.meta.errorCode,
          message: proxied.meta.errorMessage,
        }),
      );
    }
    return {
      places: [],
      status: 'empty',
      diagnostics: buildDiagnostics('client'),
    };
  } catch (e) {
    console.warn('searchPlacesWithBias error', e);
    return errorResponse(
      buildDiagnostics('client', {
        errorCode: 'client_provider_error',
        message: e instanceof Error ? e.message : 'Google Places search failed.',
      }),
    );
  }
}

export async function searchPlacesWithBias(
  query: string,
  lat: number,
  lng: number,
  radiusMeters = 8000,
  limit = 8,
  signal?: AbortSignal | null,
): Promise<PlaceSearchResult[]> {
  const response = await searchPlacesWithBiasResponse(query, lat, lng, radiusMeters, limit, signal);
  return response.places;
}

export async function getPlaceDetails(placeId: string): Promise<PlaceSearchResult | null> {
  const cacheKey = `details:${placeId}`;
  const cachedEntry = cacheGetEntry(detailsCache, cacheKey, 600000);
  if (cachedEntry) return cachedEntry.payload;
  return withInflight(detailsInflight, cacheKey, async () => {
    try {
      const proxied = await fetchGooglePlacesProxy('details', { placeId }, 2600);
      const proxiedPlace = normalizePlaceResult(proxied.data?.place, placeId);
      if (proxiedPlace) {
        cacheSet(detailsCache, cacheKey, proxiedPlace, DETAILS_CACHE_MAX);
        return proxiedPlace;
      }

      const key = getMapsKey();
      if (!key) return null;
      // Try Places API v1
      try {
        const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
          headers: {
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,types,rating,userRatingCount,priceLevel,reviews,currentOpeningHours',
          },
        });
        if (res.ok) {
          const r = await res.json();
          const payload = normalizePlaceResult(r, placeId);
          if (payload) {
            cacheSet(detailsCache, cacheKey, payload, DETAILS_CACHE_MAX);
            return payload;
          }
        }
      } catch {}

      const id = encodeURIComponent(placeId);
      const fields = encodeURIComponent('name,formatted_address,geometry,types,opening_hours,rating,user_ratings_total,price_level,reviews');
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${id}&fields=${fields}&key=${key}&language=en`;
      const json = await fetchJson(url);
      if (!json || !json.result) return null;
      const payload = normalizePlaceResult(json.result, placeId);
      if (!payload) return null;
      cacheSet(detailsCache, cacheKey, payload, DETAILS_CACHE_MAX);
      return payload;
    } catch (e) {
      console.warn('getPlaceDetails error', e);
      return null;
    }
  });
}

export async function searchPlacesNearbyResponse(
  lat: number,
  lng: number,
  radius = 1500,
  intent: NearbySearchIntent = 'study',
  signal?: AbortSignal | null,
): Promise<PlaceSearchResponse> {
  const cacheKey = `nearby:${lat.toFixed(3)}:${lng.toFixed(3)}:${radius}:${intent}`;
  const cached = cacheGet(searchCache, cacheKey, 120000);
  if (cached) return okResponse(cached, buildDiagnostics('none'));
  try {
    const proxied = await fetchGooglePlacesProxy(
      'nearby',
      { lat, lng, radius, intent },
      2600,
      signal,
    );
    if (proxied.meta.errorCode === 'proxy_aborted') {
      return errorResponse(buildDiagnostics('proxy', { errorCode: 'proxy_aborted' }));
    }
    if (proxied.meta.ok) {
      const proxiedPlaces = normalizePlaceResults(proxied.data?.places, 20);
      if (proxiedPlaces.length) {
        cacheSet(searchCache, cacheKey, proxiedPlaces, SEARCH_CACHE_MAX);
        return okResponse(
          proxiedPlaces,
          buildDiagnostics('proxy', { authMode: proxied.meta.authMode }),
        );
      }
      return {
        places: [],
        status: 'empty',
        diagnostics: buildDiagnostics('proxy', { authMode: proxied.meta.authMode }),
      };
    }

    const directPlaces = await runDirectSearchPlacesNearby(lat, lng, radius, intent);
    if (directPlaces.length) {
      cacheSet(searchCache, cacheKey, directPlaces, SEARCH_CACHE_MAX);
      return okResponse(directPlaces, buildDiagnostics('client'));
    }
    if (!isClientProviderCallsEnabled()) {
      return errorResponse(
        buildDiagnostics('proxy', {
          authMode: proxied.meta.authMode,
          errorCode: proxied.meta.errorCode,
          message: proxied.meta.errorMessage,
        }),
      );
    }
    return {
      places: [],
      status: 'empty',
      diagnostics: buildDiagnostics('client'),
    };
  } catch (e) {
    console.warn('searchPlacesNearby error', e);
    return errorResponse(
      buildDiagnostics('client', {
        errorCode: 'client_provider_error',
        message: e instanceof Error ? e.message : 'Google Places nearby search failed.',
      }),
    );
  }
}

export async function searchPlacesNearby(
  lat: number,
  lng: number,
  radius = 1500,
  intent: NearbySearchIntent = 'study',
  signal?: AbortSignal | null,
): Promise<PlaceSearchResult[]> {
  const response = await searchPlacesNearbyResponse(lat, lng, radius, intent, signal);
  return response.places;
}

export async function searchLocations(query: string, kind: 'campus' | 'city', limit = 8, bias?: { lat: number; lng: number }): Promise<PlaceSearchResult[]> {
  if (!query.trim()) return [];
  const biasKey = bias ? `${bias.lat.toFixed(3)}:${bias.lng.toFixed(3)}` : 'none';
  const cacheKey = `locations:${kind}:${query}:${limit}:${biasKey}`;
  const cached = cacheGet(searchCache, cacheKey, 120000);
  if (cached) return cached;
  return withInflight(searchInflight, cacheKey, async () => {
    try {
      const proxied = await fetchGooglePlacesProxy(
        'search_locations',
        {
          query,
          kind,
          limit,
          ...(bias ? { lat: bias.lat, lng: bias.lng } : {}),
        },
        2600,
      );
      const proxiedPlaces = normalizePlaceResults(proxied.data?.places, limit);
      if (proxiedPlaces.length) {
        cacheSet(searchCache, cacheKey, proxiedPlaces, SEARCH_CACHE_MAX);
        return proxiedPlaces;
      }

      const key = getMapsKey();
      if (!key) return [];
      const baseQuery = kind === 'campus' ? `${query} university college` : query;
      const q = encodeURIComponent(baseQuery);
      const type = kind === 'campus' ? 'university' : 'locality';
      const locationBias = bias ? `&location=${bias.lat},${bias.lng}&radius=80000` : '';
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${q}&type=${type}${locationBias}&key=${key}&language=en`;
      const json = await fetchJson(url);
      if (!json || !Array.isArray(json.results)) return [];
      const payload = normalizePlaceResults(json.results, limit * 2);
      const seen = new Set<string>();
      const deduped = payload.filter((result: PlaceSearchResult) => {
        const dedupeKey = result.name.trim().toLowerCase();
        if (!dedupeKey || seen.has(dedupeKey)) return false;
        seen.add(dedupeKey);
        return true;
      }).slice(0, limit);
      cacheSet(searchCache, cacheKey, deduped, SEARCH_CACHE_MAX);
      return deduped;
    } catch (e) {
      console.warn('searchLocations error', e);
      return [];
    }
  });
}

export function getGoogleMapsCacheStats() {
  return {
    search: {
      ...googleMapsCacheCounters.search,
      size: searchCache.size,
      max: SEARCH_CACHE_MAX,
    },
    details: {
      ...googleMapsCacheCounters.details,
      size: detailsCache.size,
      max: DETAILS_CACHE_MAX,
    },
    geocode: {
      ...googleMapsCacheCounters.geocode,
      size: geocodeCache.size,
      max: GEOCODE_CACHE_MAX,
    },
  };
}

export function resetGoogleMapsCacheStats() {
  (Object.keys(googleMapsCacheCounters) as GoogleMapsCacheBucket[]).forEach((key) => {
    googleMapsCacheCounters[key] = { hits: 0, misses: 0, sets: 0, evictions: 0 };
  });
}

export default {
  searchPlaces,
  getPlaceDetails,
  searchPlacesNearby,
  searchLocations,
  reverseGeocodeCity,
  getGoogleMapsCacheStats,
  resetGoogleMapsCacheStats,
};
