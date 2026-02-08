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

type PlaceSearchResult = {
  placeId: string;
  name: string;
  address?: string;
  location?: { lat: number; lng: number };
  rating?: number;
  ratingCount?: number;
  openNow?: boolean;
  types?: string[];
};

const searchCache = new Map<string, { ts: number; payload: PlaceSearchResult[] }>();
const detailsCache = new Map<string, { ts: number; payload: PlaceSearchResult | null }>();
const geocodeCache = new Map<string, { ts: number; payload: string | null }>();
const searchInflight = new Map<string, Promise<PlaceSearchResult[]>>();
const detailsInflight = new Map<string, Promise<PlaceSearchResult | null>>();
const geocodeInflight = new Map<string, Promise<string | null>>();

function cacheGet<T>(cache: Map<string, { ts: number; payload: T }>, key: string, ttlMs: number) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < ttlMs) return cached.payload;
  return null;
}

function cacheGetEntry<T>(cache: Map<string, { ts: number; payload: T }>, key: string, ttlMs: number) {
  const cached = cache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.ts >= ttlMs) {
    cache.delete(key);
    return null;
  }
  return cached;
}

function cacheSet<T>(cache: Map<string, { ts: number; payload: T }>, key: string, payload: T) {
  cache.set(key, { ts: Date.now(), payload });
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
  const key = getMapsKey();
  if (!key) return null;
  const cacheKey = `geocode:${lat.toFixed(3)}:${lng.toFixed(3)}`;
  const cachedEntry = cacheGetEntry(geocodeCache, cacheKey, 10 * 60 * 1000);
  if (cachedEntry) return cachedEntry.payload;
  return withInflight(geocodeInflight, cacheKey, async () => {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&result_type=locality|postal_town|administrative_area_level_2&key=${key}&language=en`;
      const json = await fetchJson(url);
      if (!json || json.status !== 'OK' || !Array.isArray(json.results)) {
        cacheSet(geocodeCache, cacheKey, null);
        return null;
      }
      for (const result of json.results) {
        const city = pickCityFromGeocode(result);
        if (city) {
          cacheSet(geocodeCache, cacheKey, city);
          return city;
        }
      }
      cacheSet(geocodeCache, cacheKey, null);
      return null;
    } catch (e) {
      console.warn('reverseGeocodeCity error', e);
      return null;
    }
  });
}

export async function searchPlaces(query: string, limit = 6): Promise<PlaceSearchResult[]> {
  const key = getMapsKey();
  if (!key) return [];
  const cacheKey = `places:${query}:${limit}`;
  const cached = cacheGet(searchCache, cacheKey, 120000);
  if (cached) return cached;
  return withInflight(searchInflight, cacheKey, async () => {
    try {
      // Prefer Places API v1 (CORS-friendly for web)
      try {
        const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.currentOpeningHours,places.types',
          },
          body: JSON.stringify({ textQuery: query, languageCode: 'en' }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          const message = json?.error?.message || 'Google Places search failed.';
          throw new Error(message);
        }
        const places = Array.isArray(json?.places) ? json.places : [];
        const payload = places.slice(0, limit).map((p: any) => ({
          placeId: p.id,
          name: p.displayName?.text || 'Unknown',
          address: p.formattedAddress,
          location: p.location ? { lat: p.location.latitude, lng: p.location.longitude } : undefined,
          rating: typeof p.rating === 'number' ? p.rating : undefined,
          ratingCount: typeof p.userRatingCount === 'number' ? p.userRatingCount : undefined,
          openNow: typeof p.currentOpeningHours?.openNow === 'boolean' ? p.currentOpeningHours.openNow : undefined,
          types: Array.isArray(p.types) ? p.types : undefined,
        }));
        cacheSet(searchCache, cacheKey, payload);
        return payload;
      } catch {}

      const q = encodeURIComponent(query);
      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${q}&key=${key}&language=en`;
      const json = await fetchJson(url);
      if (!json || !Array.isArray(json.results)) return [];
      const payload = json.results.slice(0, limit).map((r: any) => ({
        placeId: r.place_id,
        name: r.name,
        address: r.formatted_address || r.vicinity,
        location: r.geometry?.location ? { lat: r.geometry.location.lat, lng: r.geometry.location.lng } : undefined,
        rating: typeof r.rating === 'number' ? r.rating : undefined,
        ratingCount: typeof r.user_ratings_total === 'number' ? r.user_ratings_total : undefined,
        openNow: typeof r.opening_hours?.open_now === 'boolean' ? r.opening_hours.open_now : undefined,
        types: Array.isArray(r.types) ? r.types : undefined,
      }));
      cacheSet(searchCache, cacheKey, payload);
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
  const key = getMapsKey();
  if (!key) return [];
  const cacheKey = `textbias:${query}:${lat.toFixed(3)}:${lng.toFixed(3)}:${radiusMeters}:${limit}`;
  const cached = cacheGet(searchCache, cacheKey, 120000);
  if (cached) return cached;
  return withInflight(searchInflight, cacheKey, async () => {
    try {
    try {
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.currentOpeningHours,places.types',
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
      const payload = places.slice(0, limit).map((p: any) => ({
        placeId: p.id,
        name: p.displayName?.text || 'Unknown',
        address: p.formattedAddress,
        location: p.location ? { lat: p.location.latitude, lng: p.location.longitude } : undefined,
        rating: typeof p.rating === 'number' ? p.rating : undefined,
        ratingCount: typeof p.userRatingCount === 'number' ? p.userRatingCount : undefined,
        openNow: typeof p.currentOpeningHours?.openNow === 'boolean' ? p.currentOpeningHours.openNow : undefined,
        types: Array.isArray(p.types) ? p.types : undefined,
      }));
      cacheSet(searchCache, cacheKey, payload);
      return payload;
    } catch {}

    const q = encodeURIComponent(query);
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${q}&location=${lat},${lng}&radius=${radiusMeters}&key=${key}&language=en`;
    const json = await fetchJson(url);
    if (!json || !Array.isArray(json.results)) return [];
    const payload = json.results.slice(0, limit).map((r: any) => ({
      placeId: r.place_id,
      name: r.name,
      address: r.formatted_address || r.vicinity,
      location: r.geometry?.location ? { lat: r.geometry.location.lat, lng: r.geometry.location.lng } : undefined,
      rating: typeof r.rating === 'number' ? r.rating : undefined,
      ratingCount: typeof r.user_ratings_total === 'number' ? r.user_ratings_total : undefined,
      openNow: typeof r.opening_hours?.open_now === 'boolean' ? r.opening_hours.open_now : undefined,
      types: Array.isArray(r.types) ? r.types : undefined,
    }));
      cacheSet(searchCache, cacheKey, payload);
      return payload;
    } catch (e) {
      console.warn('searchPlacesWithBias error', e);
      return [];
    }
  });
}

export async function getPlaceDetails(placeId: string): Promise<PlaceSearchResult | null> {
  const key = getMapsKey();
  if (!key) return null;
  const cacheKey = `details:${placeId}`;
  const cachedEntry = cacheGetEntry(detailsCache, cacheKey, 600000);
  if (cachedEntry) return cachedEntry.payload;
  return withInflight(detailsInflight, cacheKey, async () => {
    try {
    // Try Places API v1
    try {
      const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
        headers: {
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,types,currentOpeningHours',
        },
      });
      if (res.ok) {
        const r = await res.json();
        const payload = {
          placeId: r.id || placeId,
          name: r.displayName?.text || 'Unknown',
          address: r.formattedAddress,
          location: r.location ? { lat: r.location.latitude, lng: r.location.longitude } : undefined,
          types: Array.isArray(r.types) ? r.types : undefined,
          openNow: typeof r.currentOpeningHours?.openNow === 'boolean' ? r.currentOpeningHours.openNow : undefined,
        };
        cacheSet(detailsCache, cacheKey, payload);
        return payload;
      }
    } catch {}

    const id = encodeURIComponent(placeId);
    const fields = encodeURIComponent('name,formatted_address,geometry,types,opening_hours');
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${id}&fields=${fields}&key=${key}&language=en`;
    const json = await fetchJson(url);
    if (!json || !json.result) return null;
    const r = json.result;
    const payload = {
      placeId: placeId,
      name: r.name,
      address: r.formatted_address,
      location: r.geometry?.location ? { lat: r.geometry.location.lat, lng: r.geometry.location.lng } : undefined,
      types: Array.isArray(r.types) ? r.types : undefined,
      openNow: typeof r.opening_hours?.open_now === 'boolean' ? r.opening_hours.open_now : undefined,
    };
      cacheSet(detailsCache, cacheKey, payload);
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
  const key = getMapsKey();
  if (!key) return [];
  const cacheKey = `nearby:${lat.toFixed(3)}:${lng.toFixed(3)}:${radius}:${intent}`;
  const cached = cacheGet(searchCache, cacheKey, 120000);
  if (cached) return cached;
  return withInflight(searchInflight, cacheKey, async () => {
    try {
    try {
      const includedTypes = intent === 'study'
        ? ['cafe', 'coffee_shop', 'library', 'university', 'coworking_space']
        : undefined;
      const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': key,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.currentOpeningHours,places.types',
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
      const payload = places.map((p: any) => ({
        placeId: p.id,
        name: p.displayName?.text || 'Unknown',
        address: p.formattedAddress,
        location: p.location ? { lat: p.location.latitude, lng: p.location.longitude } : undefined,
        rating: typeof p.rating === 'number' ? p.rating : undefined,
        ratingCount: typeof p.userRatingCount === 'number' ? p.userRatingCount : undefined,
        openNow: typeof p.currentOpeningHours?.openNow === 'boolean' ? p.currentOpeningHours.openNow : undefined,
        types: Array.isArray(p.types) ? p.types : undefined,
      }));
      cacheSet(searchCache, cacheKey, payload);
      return payload;
    } catch {}

    const keyword = intent === 'study' ? '&keyword=study%20cafe%20coffee%20library%20coworking' : '';
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}${keyword}&key=${key}&language=en`;
    const json = await fetchJson(url);
    if (!json || !Array.isArray(json.results)) return [];
    const payload = json.results.slice(0, 20).map((r: any) => ({
      placeId: r.place_id,
      name: r.name,
      address: r.vicinity || r.formatted_address,
      location: r.geometry?.location ? { lat: r.geometry.location.lat, lng: r.geometry.location.lng } : undefined,
      rating: typeof r.rating === 'number' ? r.rating : undefined,
      ratingCount: typeof r.user_ratings_total === 'number' ? r.user_ratings_total : undefined,
      openNow: typeof r.opening_hours?.open_now === 'boolean' ? r.opening_hours.open_now : undefined,
      types: Array.isArray(r.types) ? r.types : undefined,
    }));
      cacheSet(searchCache, cacheKey, payload);
      return payload;
    } catch (e) {
      console.warn('searchPlacesNearby error', e);
      return [];
    }
  });
}

export async function searchLocations(query: string, kind: 'campus' | 'city', limit = 8, bias?: { lat: number; lng: number }): Promise<PlaceSearchResult[]> {
  const key = getMapsKey();
  if (!key || !query.trim()) return [];
  const biasKey = bias ? `${bias.lat.toFixed(3)}:${bias.lng.toFixed(3)}` : 'none';
  const cacheKey = `locations:${kind}:${query}:${limit}:${biasKey}`;
  const cached = cacheGet(searchCache, cacheKey, 120000);
  if (cached) return cached;
  return withInflight(searchInflight, cacheKey, async () => {
    try {
    const baseQuery = kind === 'campus' ? `${query} university college` : query;
    const q = encodeURIComponent(baseQuery);
    const type = kind === 'campus' ? 'university' : 'locality';
    const locationBias = bias ? `&location=${bias.lat},${bias.lng}&radius=80000` : '';
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${q}&type=${type}${locationBias}&key=${key}&language=en`;
    const json = await fetchJson(url);
    if (!json || !Array.isArray(json.results)) return [];
    const payload = json.results.slice(0, limit * 2).map((r: any) => ({
      placeId: r.place_id,
      name: r.name,
      address: r.formatted_address || r.vicinity,
      location: r.geometry?.location ? { lat: r.geometry.location.lat, lng: r.geometry.location.lng } : undefined,
    }));
    const seen = new Set<string>();
    const deduped = payload.filter((r: any) => {
      const key = (r?.name || '').trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, limit);
      cacheSet(searchCache, cacheKey, deduped);
      return deduped;
    } catch (e) {
      console.warn('searchLocations error', e);
      return [];
    }
  });
}

export default { searchPlaces, getPlaceDetails, searchPlacesNearby, searchLocations, reverseGeocodeCity };
