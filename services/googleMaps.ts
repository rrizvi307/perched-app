/**
 * Google Maps / Places helper (single, consistent implementation)
 * - Uses `GOOGLE_MAPS_API_KEY` from env or global.
 * - Exports `searchPlaces` and `getPlaceDetails` used by UI components.
 */

import Constants from 'expo-constants';

export function getMapsKey() {
  return (
    (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY as string) ||
    (process.env.GOOGLE_MAPS_API_KEY as string) ||
    (typeof global !== 'undefined' ? (global as any).GOOGLE_MAPS_API_KEY : '') ||
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

function getExpoExtra() {
  return ((Constants.expoConfig as any)?.extra || {}) as Record<string, any>;
}

function getFunctionsProjectId() {
  const extra = getExpoExtra();
  return (
    (process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID as string) ||
    (process.env.FIREBASE_PROJECT_ID as string) ||
    (extra?.FIREBASE_CONFIG?.projectId as string) ||
    ((global as any)?.FIREBASE_CONFIG?.projectId as string) ||
    ''
  );
}

function getFunctionsRegion() {
  const extra = getExpoExtra();
  return (
    (process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION as string) ||
    (process.env.FIREBASE_FUNCTIONS_REGION as string) ||
    (extra?.FIREBASE_FUNCTIONS_REGION as string) ||
    'us-central1'
  );
}

function getGooglePlacesProxyEndpoint() {
  const extra = getExpoExtra();
  const explicit =
    (process.env.EXPO_PUBLIC_GOOGLE_PLACES_ENDPOINT as string) ||
    (process.env.GOOGLE_PLACES_ENDPOINT as string) ||
    (extra?.GOOGLE_PLACES_ENDPOINT as string) ||
    ((global as any)?.GOOGLE_PLACES_ENDPOINT as string) ||
    '';
  if (explicit) return explicit;
  const projectId = getFunctionsProjectId();
  if (!projectId) return '';
  return `https://${getFunctionsRegion()}-${projectId}.cloudfunctions.net/googlePlacesProxy`;
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

function touchCacheEntry<T>(cache: Map<string, { ts: number; payload: T }>, key: string, entry: { ts: number; payload: T }) {
  cache.delete(key);
  cache.set(key, entry);
}

function pruneCache<T>(cache: Map<string, { ts: number; payload: T }>, maxEntries: number) {
  while (cache.size > maxEntries) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

function cacheGet<T>(cache: Map<string, { ts: number; payload: T }>, key: string, ttlMs: number) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < ttlMs) {
    touchCacheEntry(cache, key, cached);
    return cached.payload;
  }
  return null;
}

function cacheGetEntry<T>(cache: Map<string, { ts: number; payload: T }>, key: string, ttlMs: number) {
  const cached = cache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.ts >= ttlMs) {
    cache.delete(key);
    return null;
  }
  touchCacheEntry(cache, key, cached);
  return cached;
}

function cacheSet<T>(cache: Map<string, { ts: number; payload: T }>, key: string, payload: T, maxEntries: number) {
  cache.delete(key);
  cache.set(key, { ts: Date.now(), payload });
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

async function fetchJson(url: string) {
  const res = await fetch(url);
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = json?.error?.message || json?.error_message || `Google Maps error ${res.status}`;
    throw new Error(message);
  }
  return json;
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

async function getProxyAuthHeaders() {
  const headers: Record<string, string> = {};
  try {
    const { ensureFirebase } = await import('./firebaseClient');
    const fb = ensureFirebase();
    const user = fb?.auth?.()?.currentUser;
    if (user && typeof user.getIdToken === 'function') {
      const idToken = await user.getIdToken();
      if (idToken) headers.Authorization = `Bearer ${idToken}`;
    }
  } catch {}

  const appCheckToken = (global as any)?.FIREBASE_APP_CHECK_TOKEN;
  if (typeof appCheckToken === 'string' && appCheckToken.trim()) {
    headers['X-Firebase-AppCheck'] = appCheckToken.trim();
  }

  return headers;
}

async function fetchGooglePlacesProxy(action: string, payload: Record<string, any>, timeoutMs = 3200) {
  const endpoint = getGooglePlacesProxyEndpoint();
  if (!endpoint) return null;
  const authHeaders = await getProxyAuthHeaders();
  if (typeof authHeaders.Authorization !== 'string' || !authHeaders.Authorization.trim()) {
    return null;
  }
  return fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify({
        action,
        ...payload,
      }),
    },
    timeoutMs,
  );
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
      if (proxied && (typeof proxied.city === 'string' || proxied.city === null)) {
        cacheSet(geocodeCache, cacheKey, proxied.city ?? null, GEOCODE_CACHE_MAX);
        return proxied.city ?? null;
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

export async function searchPlaces(query: string, limit = 6): Promise<PlaceSearchResult[]> {
  const cacheKey = `places:${query}:${limit}`;
  const cached = cacheGet(searchCache, cacheKey, 120000);
  if (cached) return cached;
  return withInflight(searchInflight, cacheKey, async () => {
    try {
      const proxied = await fetchGooglePlacesProxy('search_text', { query, limit }, 2600);
      const proxiedPlaces = normalizePlaceResults(proxied?.places, limit);
      if (proxiedPlaces.length) {
        cacheSet(searchCache, cacheKey, proxiedPlaces, SEARCH_CACHE_MAX);
        return proxiedPlaces;
      }

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
        const payload = normalizePlaceResults(places, limit);
        cacheSet(searchCache, cacheKey, payload, SEARCH_CACHE_MAX);
        return payload;
      } catch {}

      const q = encodeURIComponent(query);
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${q}&key=${key}&language=en`;
      const json = await fetchJson(url);
      if (!json || !Array.isArray(json.results)) return [];
      const payload = normalizePlaceResults(json.results, limit);
      cacheSet(searchCache, cacheKey, payload, SEARCH_CACHE_MAX);
      return payload;
    } catch (e) {
      console.warn('searchPlaces error', e);
      return [];
    }
  });
}

export async function searchPlacesWithBias(
  query: string,
  lat: number,
  lng: number,
  radiusMeters = 8000,
  limit = 8,
): Promise<PlaceSearchResult[]> {
  const cacheKey = `textbias:${query}:${lat.toFixed(3)}:${lng.toFixed(3)}:${radiusMeters}:${limit}`;
  const cached = cacheGet(searchCache, cacheKey, 120000);
  if (cached) return cached;
  return withInflight(searchInflight, cacheKey, async () => {
    try {
    const proxied = await fetchGooglePlacesProxy(
      'search_text',
      { query, limit, lat, lng, radius: radiusMeters },
      2600,
    );
    const proxiedPlaces = normalizePlaceResults(proxied?.places, limit);
    if (proxiedPlaces.length) {
      cacheSet(searchCache, cacheKey, proxiedPlaces, SEARCH_CACHE_MAX);
      return proxiedPlaces;
    }

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
      const payload = normalizePlaceResults(places, limit);
      cacheSet(searchCache, cacheKey, payload, SEARCH_CACHE_MAX);
      return payload;
    } catch {}

    const q = encodeURIComponent(query);
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${q}&location=${lat},${lng}&radius=${radiusMeters}&key=${key}&language=en`;
    const json = await fetchJson(url);
    if (!json || !Array.isArray(json.results)) return [];
    const payload = normalizePlaceResults(json.results, limit);
      cacheSet(searchCache, cacheKey, payload, SEARCH_CACHE_MAX);
      return payload;
    } catch (e) {
      console.warn('searchPlacesWithBias error', e);
      return [];
    }
  });
}

export async function getPlaceDetails(placeId: string): Promise<PlaceSearchResult | null> {
  const cacheKey = `details:${placeId}`;
  const cachedEntry = cacheGetEntry(detailsCache, cacheKey, 600000);
  if (cachedEntry) return cachedEntry.payload;
  return withInflight(detailsInflight, cacheKey, async () => {
    try {
    const proxied = await fetchGooglePlacesProxy('details', { placeId }, 2600);
    const proxiedPlace = normalizePlaceResult(proxied?.place, placeId);
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

export async function searchPlacesNearby(
  lat: number,
  lng: number,
  radius = 1500,
  intent: 'study' | 'general' = 'study',
): Promise<PlaceSearchResult[]> {
  const cacheKey = `nearby:${lat.toFixed(3)}:${lng.toFixed(3)}:${radius}:${intent}`;
  const cached = cacheGet(searchCache, cacheKey, 120000);
  if (cached) return cached;
  return withInflight(searchInflight, cacheKey, async () => {
    try {
    const proxied = await fetchGooglePlacesProxy(
      'nearby',
      { lat, lng, radius, intent },
      2600,
    );
    const proxiedPlaces = normalizePlaceResults(proxied?.places, 20);
    if (proxiedPlaces.length) {
      cacheSet(searchCache, cacheKey, proxiedPlaces, SEARCH_CACHE_MAX);
      return proxiedPlaces;
    }

    const key = getMapsKey();
    if (!key) return [];
    try {
      const includedTypes = intent === 'study'
        ? ['cafe', 'coffee_shop', 'library', 'university', 'coworking_space']
        : undefined;
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
          rankPreference: 'POPULARITY',
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
      const payload = normalizePlaceResults(places, 20);
      cacheSet(searchCache, cacheKey, payload, SEARCH_CACHE_MAX);
      return payload;
    } catch {}

    const keyword = intent === 'study' ? '&keyword=study%20cafe%20coffee%20library%20coworking' : '';
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}${keyword}&key=${key}&language=en`;
    const json = await fetchJson(url);
    if (!json || !Array.isArray(json.results)) return [];
    const payload = normalizePlaceResults(json.results, 20);
      cacheSet(searchCache, cacheKey, payload, SEARCH_CACHE_MAX);
      return payload;
    } catch (e) {
      console.warn('searchPlacesNearby error', e);
      return [];
    }
  });
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
    const proxiedPlaces = normalizePlaceResults(proxied?.places, limit);
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

export default { searchPlaces, getPlaceDetails, searchPlacesNearby, searchLocations, reverseGeocodeCity };
