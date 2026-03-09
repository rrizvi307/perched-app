/**
 * External Data API Service
 *
 * Sources data from free/freemium APIs:
 * - Yelp Fusion API (5,000 calls/day free)
 * - Foursquare Places API (100,000 calls/month free)
 * - OpenStreetMap Overpass API (unlimited, free)
 *
 * Strategy:
 * 1. Check local cache first
 * 2. Try Yelp (best for ratings, reviews, attributes)
 * 3. Fallback to Foursquare (good for tips, tastes)
 * 4. Supplement with OSM (hours, accessibility)
 * 5. Cache all results for 7 days
 */

import { ensureFirebase } from './firebaseClient';
import Constants from 'expo-constants';

// ============ TYPES ============

export type ExternalSpotData = {
  // Source tracking
  source: 'yelp' | 'foursquare' | 'osm' | 'user' | 'cached';
  fetchedAt: number;
  expiresAt: number;

  // Core data
  name: string;
  address?: string;
  phone?: string;
  website?: string;

  // Ratings
  rating?: number;
  reviewCount?: number;
  priceLevel?: 1 | 2 | 3 | 4;

  // Hours
  hours?: {
    isOpenNow?: boolean;
    regular?: Array<{ day: number; open: string; close: string }>;
    displayHours?: string[];
  };

  // Photos (URLs)
  photos?: string[];

  // Categories
  categories?: string[];

  // Attributes (from Yelp/Foursquare)
  attributes?: {
    // Amenities
    hasWifi?: boolean;
    wifiType?: 'free' | 'paid';
    hasOutdoorSeating?: boolean;
    hasParking?: boolean;
    parkingType?: string;

    // Accessibility
    wheelchairAccessible?: boolean;

    // Good for
    goodForGroups?: boolean;
    goodForKids?: boolean;
    goodForDates?: boolean;
    goodForWorking?: boolean;

    // Pet policy
    dogFriendly?: boolean;

    // Food & drink
    servesAlcohol?: boolean;
    servesFood?: boolean;
    takeout?: boolean;
    delivery?: boolean;
    reservations?: boolean;

    // Vibe
    noiseLevel?: 'quiet' | 'average' | 'loud';
    ambience?: string[];
  };

  // Tips/reviews snippets
  tips?: Array<{
    text: string;
    authorName?: string;
    createdAt?: string;
  }>;

  // Derived/computed
  popularDishes?: string[];
  signatureDrinks?: string[];
};

// ============ API CONFIGURATION ============

function isClientProviderCallsEnabled(): boolean {
  const raw =
    (process.env.EXPO_PUBLIC_ENABLE_CLIENT_PROVIDER_CALLS as string) ||
    (process.env.ENABLE_CLIENT_PROVIDER_CALLS as string) ||
    '';
  const enabled = ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
  return !!__DEV__ && enabled;
}

// Get API keys from Expo Constants (set via app.config.js / environment)
function getApiKey(key: string): string {
  // Security hardening: do not allow provider keys from client runtime in production builds.
  if (!isClientProviderCallsEnabled()) return '';

  // Try Expo config extra first
  const extra = (Constants.expoConfig as any)?.extra;
  if (extra?.[key]) return extra[key];

  // Try process.env as fallback
  const envKey = `EXPO_PUBLIC_${key}`;
  if (typeof process !== 'undefined' && process.env?.[envKey]) {
    return process.env[envKey] as string;
  }

  return '';
}

const YELP_API_KEY = getApiKey('YELP_API_KEY');
const FOURSQUARE_API_KEY = getApiKey('FOURSQUARE_API_KEY');

// Cache duration: 7 days
const CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

// ============ YELP API ============

async function fetchFromYelp(
  name: string,
  location: { lat: number; lng: number }
): Promise<ExternalSpotData | null> {
  if (!YELP_API_KEY) {
    console.log('[ExternalAPI] No Yelp API key configured');
    return null;
  }

  try {
    // First, search for the business
    const searchUrl = `https://api.yelp.com/v3/businesses/search?term=${encodeURIComponent(name)}&latitude=${location.lat}&longitude=${location.lng}&limit=1&categories=coffee,cafes,libraries`;

    const searchRes = await fetch(searchUrl, {
      headers: {
        Authorization: `Bearer ${YELP_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!searchRes.ok) {
      console.log('[ExternalAPI] Yelp search failed:', searchRes.status);
      return null;
    }

    const searchData = await searchRes.json();
    const business = searchData.businesses?.[0];

    if (!business) {
      console.log('[ExternalAPI] No Yelp results for:', name);
      return null;
    }

    // Get detailed business info
    const detailUrl = `https://api.yelp.com/v3/businesses/${business.id}`;
    const detailRes = await fetch(detailUrl, {
      headers: {
        Authorization: `Bearer ${YELP_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!detailRes.ok) {
      // Use search results if detail fails
      return mapYelpSearchResult(business);
    }

    const detail = await detailRes.json();
    return mapYelpDetailResult(detail);
  } catch (error) {
    console.error('[ExternalAPI] Yelp error:', error);
    return null;
  }
}

function mapYelpSearchResult(business: any): ExternalSpotData {
  return {
    source: 'yelp',
    fetchedAt: Date.now(),
    expiresAt: Date.now() + CACHE_DURATION_MS,
    name: business.name,
    address: business.location?.display_address?.join(', '),
    phone: business.phone,
    rating: business.rating,
    reviewCount: business.review_count,
    priceLevel: business.price?.length as 1 | 2 | 3 | 4,
    photos: business.image_url ? [business.image_url] : [],
    categories: business.categories?.map((c: any) => c.title) || [],
    hours: {
      isOpenNow: !business.is_closed,
    },
    attributes: {},
  };
}

function mapYelpDetailResult(detail: any): ExternalSpotData {
  // Parse hours
  let hours: ExternalSpotData['hours'] = {
    isOpenNow: detail.hours?.[0]?.is_open_now,
  };

  if (detail.hours?.[0]?.open) {
    hours.regular = detail.hours[0].open.map((h: any) => ({
      day: h.day,
      open: h.start,
      close: h.end,
    }));
  }

  // Parse attributes from transactions and special attributes
  const attributes: ExternalSpotData['attributes'] = {
    takeout: detail.transactions?.includes('pickup'),
    delivery: detail.transactions?.includes('delivery'),
    reservations: detail.transactions?.includes('restaurant_reservation'),
  };

  // Parse Yelp business attributes if available
  if (detail.attributes) {
    const attrs = detail.attributes;
    attributes.hasWifi = attrs.wifi === 'free' || attrs.wifi === 'paid';
    attributes.wifiType = attrs.wifi as 'free' | 'paid';
    attributes.hasOutdoorSeating = attrs.outdoor_seating === true;
    attributes.wheelchairAccessible = attrs.wheelchair_accessible === true;
    attributes.goodForGroups = attrs.good_for_groups === true;
    attributes.goodForKids = attrs.good_for_kids === true;
    attributes.noiseLevel = attrs.noise_level as 'quiet' | 'average' | 'loud';
    attributes.servesAlcohol = attrs.alcohol !== 'none' && attrs.alcohol !== undefined;
    attributes.ambience = attrs.ambience ? Object.keys(attrs.ambience).filter(k => attrs.ambience[k]) : [];
  }

  return {
    source: 'yelp',
    fetchedAt: Date.now(),
    expiresAt: Date.now() + CACHE_DURATION_MS,
    name: detail.name,
    address: detail.location?.display_address?.join(', '),
    phone: detail.display_phone,
    website: detail.url,
    rating: detail.rating,
    reviewCount: detail.review_count,
    priceLevel: detail.price?.length as 1 | 2 | 3 | 4,
    photos: detail.photos || [],
    categories: detail.categories?.map((c: any) => c.title) || [],
    hours,
    attributes,
  };
}

// ============ FOURSQUARE API ============

async function fetchFromFoursquare(
  name: string,
  location: { lat: number; lng: number }
): Promise<ExternalSpotData | null> {
  if (!FOURSQUARE_API_KEY) {
    console.log('[ExternalAPI] No Foursquare API key configured');
    return null;
  }

  try {
    // Search for place
    const searchUrl = `https://api.foursquare.com/v3/places/search?query=${encodeURIComponent(name)}&ll=${location.lat},${location.lng}&limit=1&categories=13032,13035,13003`; // coffee, cafe, library

    const searchRes = await fetch(searchUrl, {
      headers: {
        Authorization: FOURSQUARE_API_KEY,
        Accept: 'application/json',
      },
    });

    if (!searchRes.ok) {
      console.log('[ExternalAPI] Foursquare search failed:', searchRes.status);
      return null;
    }

    const searchData = await searchRes.json();
    const place = searchData.results?.[0];

    if (!place) {
      console.log('[ExternalAPI] No Foursquare results for:', name);
      return null;
    }

    // Get place details
    const detailUrl = `https://api.foursquare.com/v3/places/${place.fsq_id}?fields=name,location,tel,website,rating,price,hours,photos,categories,tastes,features,tips`;

    const detailRes = await fetch(detailUrl, {
      headers: {
        Authorization: FOURSQUARE_API_KEY,
        Accept: 'application/json',
      },
    });

    if (!detailRes.ok) {
      return mapFoursquareSearchResult(place);
    }

    const detail = await detailRes.json();
    return mapFoursquareDetailResult(detail);
  } catch (error) {
    console.error('[ExternalAPI] Foursquare error:', error);
    return null;
  }
}

function mapFoursquareSearchResult(place: any): ExternalSpotData {
  return {
    source: 'foursquare',
    fetchedAt: Date.now(),
    expiresAt: Date.now() + CACHE_DURATION_MS,
    name: place.name,
    address: place.location?.formatted_address,
    categories: place.categories?.map((c: any) => c.name) || [],
    attributes: {},
  };
}

function mapFoursquareDetailResult(detail: any): ExternalSpotData {
  // Parse features into attributes
  const attributes: ExternalSpotData['attributes'] = {};

  if (detail.features) {
    const features = detail.features;
    attributes.hasWifi = features.wifi?.toLowerCase() !== 'no';
    attributes.hasOutdoorSeating = features.outdoor_seating === true;
    attributes.hasParking = features.parking?.garage === true || features.parking?.street === true;
    attributes.wheelchairAccessible = features.wheelchair_accessible === true;
    attributes.servesAlcohol = features.serves_alcohol === true;
    attributes.takeout = features.takeout === true;
    attributes.delivery = features.delivery === true;
    attributes.reservations = features.reservations === true;
  }

  // Parse tastes for vibe/ambience
  if (detail.tastes) {
    attributes.ambience = detail.tastes.slice(0, 5);
  }

  // Parse tips
  const tips = detail.tips?.map((t: any) => ({
    text: t.text,
    createdAt: t.created_at,
  })) || [];

  // Parse photos
  const photos = detail.photos?.map((p: any) => `${p.prefix}300x300${p.suffix}`) || [];

  return {
    source: 'foursquare',
    fetchedAt: Date.now(),
    expiresAt: Date.now() + CACHE_DURATION_MS,
    name: detail.name,
    address: detail.location?.formatted_address,
    phone: detail.tel,
    website: detail.website,
    rating: detail.rating ? detail.rating / 2 : undefined, // Foursquare is 0-10, convert to 0-5
    priceLevel: detail.price as 1 | 2 | 3 | 4,
    photos,
    categories: detail.categories?.map((c: any) => c.name) || [],
    hours: detail.hours ? {
      isOpenNow: detail.hours.open_now,
      displayHours: detail.hours.display,
    } : undefined,
    attributes,
    tips,
  };
}

// ============ OPENSTREETMAP (OVERPASS) API ============

async function fetchFromOSM(
  name: string,
  location: { lat: number; lng: number }
): Promise<Partial<ExternalSpotData> | null> {
  try {
    // Sanitize name for OSM query (remove special characters that could break the query)
    const sanitizedName = name.replace(/['"\\<>]/g, '').substring(0, 100);
    if (!sanitizedName) return null;

    // Search for amenity near location
    const query = `
      [out:json][timeout:10];
      (
        node["amenity"~"cafe|library"]["name"~"${sanitizedName}",i](around:200,${location.lat},${location.lng});
        way["amenity"~"cafe|library"]["name"~"${sanitizedName}",i](around:200,${location.lat},${location.lng});
      );
      out body;
    `;

    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
    });

    if (!res.ok) {
      console.log('[ExternalAPI] OSM query failed:', res.status);
      return null;
    }

    const data = await res.json();
    const element = data.elements?.[0];

    if (!element) {
      return null;
    }

    const tags = element.tags || {};

    return {
      source: 'osm',
      fetchedAt: Date.now(),
      expiresAt: Date.now() + CACHE_DURATION_MS,
      name: tags.name,
      website: tags.website,
      phone: tags.phone,
      attributes: {
        hasWifi: tags.internet_access === 'wlan' || tags.internet_access === 'yes',
        wifiType: tags['internet_access:fee'] === 'no' ? 'free' : 'paid',
        hasOutdoorSeating: tags.outdoor_seating === 'yes',
        wheelchairAccessible: tags.wheelchair === 'yes',
        hasParking: tags.parking !== 'no' && tags.parking !== undefined,
      },
    };
  } catch (error) {
    console.error('[ExternalAPI] OSM error:', error);
    return null;
  }
}

// ============ CACHE LAYER (FIRESTORE) ============

const CACHE_COLLECTION = 'spotDataCache';

async function getCachedData(placeId: string): Promise<ExternalSpotData | null> {
  try {
    const fb = ensureFirebase();
    if (!fb) return null;

    const docSnap = await fb.firestore().collection(CACHE_COLLECTION).doc(placeId).get();

    if (!docSnap.exists) {
      return null;
    }

    const data = docSnap.data() as ExternalSpotData;

    // Check if cache is expired
    if (data.expiresAt < Date.now()) {
      console.log('[ExternalAPI] Cache expired for:', placeId);
      return null;
    }

    console.log('[ExternalAPI] Cache hit for:', placeId);
    return { ...data, source: 'cached' };
  } catch (error) {
    console.error('[ExternalAPI] Cache read error:', error);
    return null;
  }
}

async function setCachedData(placeId: string, data: ExternalSpotData): Promise<void> {
  try {
    const fb = ensureFirebase();
    if (!fb) return;

    await fb.firestore().collection(CACHE_COLLECTION).doc(placeId).set({
      ...data,
      _cachedAt: new Date(),
    });

    console.log('[ExternalAPI] Cached data for:', placeId);
  } catch (error) {
    console.error('[ExternalAPI] Cache write error:', error);
  }
}

// ============ MAIN FETCH FUNCTION ============

/**
 * Fetch external data for a spot with smart fallback chain:
 * 1. Check cache
 * 2. Try Yelp
 * 3. Fallback to Foursquare
 * 4. Supplement with OSM
 * 5. Cache result
 */
export async function fetchExternalSpotData(
  placeId: string,
  name: string,
  location: { lat: number; lng: number }
): Promise<ExternalSpotData | null> {
  // 1. Check cache first
  const cached = await getCachedData(placeId);
  if (cached) {
    return cached;
  }

  console.log('[ExternalAPI] Fetching fresh data for:', name);

  // 2. Try Yelp first (best data quality)
  let data = await fetchFromYelp(name, location);

  // 3. Fallback to Foursquare
  if (!data) {
    data = await fetchFromFoursquare(name, location);
  }

  // 4. If we have data, supplement with OSM for additional attributes
  if (data) {
    const osmData = await fetchFromOSM(name, location);
    if (osmData?.attributes) {
      // Merge OSM attributes (don't override existing)
      data.attributes = {
        ...osmData.attributes,
        ...data.attributes,
      };
    }

    // 5. Cache the result
    await setCachedData(placeId, data);
  }

  return data;
}

/**
 * Batch fetch for multiple spots (with rate limiting)
 */
export async function fetchExternalSpotDataBatch(
  spots: Array<{ placeId: string; name: string; location: { lat: number; lng: number } }>
): Promise<Map<string, ExternalSpotData>> {
  const results = new Map<string, ExternalSpotData>();

  // Process in batches of 5 with 200ms delay to avoid rate limits
  const BATCH_SIZE = 5;
  const DELAY_MS = 200;

  for (let i = 0; i < spots.length; i += BATCH_SIZE) {
    const batch = spots.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(async (spot) => {
        const data = await fetchExternalSpotData(spot.placeId, spot.name, spot.location);
        return { placeId: spot.placeId, data };
      })
    );

    batchResults.forEach(({ placeId, data }) => {
      if (data) {
        results.set(placeId, data);
      }
    });

    // Delay before next batch (except for last batch)
    if (i + BATCH_SIZE < spots.length) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }

  return results;
}

/**
 * Get API usage stats (for monitoring)
 */
export function getAPIStats(): { yelp: boolean; foursquare: boolean; osm: boolean } {
  return {
    yelp: !!YELP_API_KEY,
    foursquare: !!FOURSQUARE_API_KEY,
    osm: true, // Always available
  };
}
