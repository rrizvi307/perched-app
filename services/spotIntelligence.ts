/**
 * Spot Intelligence Service (Phase A)
 *
 * Orchestrates pre-population of spot intelligence from:
 * 1. Google Places API (metadata: price, rating, category, hours)
 * 2. Yelp Fusion API (metadata: rating, price)
 * 3. Review NLP (GPT-4o-mini: noise, WiFi, work suitability)
 *
 * Phase B: Weighted blending with live check-in data (see liveAggregation.ts)
 */

import Constants from 'expo-constants';
import { ensureFirebase } from './firebaseClient';
import { analyzeReviews, type ReviewNLPResult } from './nlpReviews';

export interface SpotIntelligence {
  // From APIs (no ML)
  priceLevel: '$' | '$$' | '$$$' | '$$$$' | null;
  avgRating: number | null;  // Weighted avg (Google 50%, Yelp 30%, Foursquare 20%)
  category: 'cafe' | 'coworking' | 'library' | 'other';
  isOpenNow: boolean;

  // From NLP (lightweight ML)
  inferredNoise: 'quiet' | 'moderate' | 'loud' | null;
  inferredNoiseConfidence: number;
  hasWifi: boolean;
  wifiConfidence: number;
  goodForStudying: boolean;  // Derived: inferredNoise === 'quiet' && hasWifi
  goodForMeetings: boolean;  // Derived: inferredNoise !== 'loud' && avgRating >= 4.0

  // Provenance
  source: 'api+nlp';
  lastUpdated: number;
  reviewCount: number;
}

interface GooglePlaceDetails {
  rating?: number;
  price_level?: number;  // 0-4
  opening_hours?: {
    open_now?: boolean;
  };
  types?: string[];
  reviews?: Array<{
    text: string;
    rating: number;
    time: number;
  }>;
}

interface YelpBusiness {
  rating?: number;
  price?: string;  // '$', '$$', '$$$', '$$$$'
  reviews?: Array<{
    text: string;
    rating: number;
    time_created: string;
  }>;
}

/**
 * Build spot intelligence from APIs + NLP
 *
 * @param googlePlaceId - Google Places ID
 * @param spotName - Spot name for NLP context
 * @param yelpId - Optional Yelp business ID
 * @returns Complete intelligence object for Firestore
 */
export async function buildSpotIntelligence(
  googlePlaceId: string,
  spotName: string,
  yelpId?: string
): Promise<SpotIntelligence> {
  try {
    // Parallel fetch: Google Places + Yelp
    const [googleData, yelpData] = await Promise.all([
      fetchGooglePlaceDetails(googlePlaceId),
      yelpId ? fetchYelpBusiness(yelpId) : Promise.resolve(null),
    ]);

    // Extract metadata
    const priceLevel = extractPriceLevel(googleData, yelpData);
    const avgRating = calculateWeightedRating(googleData, yelpData);
    const category = inferCategory(googleData);
    const isOpenNow = googleData?.opening_hours?.open_now ?? false;

    // Collect reviews for NLP (5-10 samples)
    const reviews = collectReviewSamples(googleData, yelpData);

    // Run NLP analysis
    const nlpResult = await analyzeReviews(reviews, spotName);

    // Derive boolean filters
    const goodForStudying = nlpResult.inferredNoise === 'quiet' && nlpResult.hasWifi;
    const goodForMeetings = nlpResult.inferredNoise !== 'loud' && (avgRating ?? 0) >= 4.0;

    return {
      priceLevel,
      avgRating,
      category,
      isOpenNow,
      inferredNoise: nlpResult.inferredNoise,
      inferredNoiseConfidence: nlpResult.inferredNoiseConfidence,
      hasWifi: nlpResult.hasWifi,
      wifiConfidence: nlpResult.wifiConfidence,
      goodForStudying,
      goodForMeetings,
      source: 'api+nlp',
      lastUpdated: Date.now(),
      reviewCount: nlpResult.reviewCount,
    };
  } catch (error) {
    console.error('Failed to build spot intelligence:', error);
    return getEmptyIntelligence();
  }
}

/**
 * Fetch Google Place details (metadata + reviews)
 */
async function fetchGooglePlaceDetails(placeId: string): Promise<GooglePlaceDetails | null> {
  try {
    const apiKey = getGoogleMapsKey();
    if (!apiKey) {
      console.warn('Google Maps API key not configured');
      return null;
    }

    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=rating,price_level,opening_hours,types,reviews&key=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status !== 'OK') {
      console.warn('Google Places API error:', data.status);
      return null;
    }

    return data.result;
  } catch (error) {
    console.error('Google Places fetch error:', error);
    return null;
  }
}

/**
 * Fetch Yelp business details (metadata + reviews)
 */
async function fetchYelpBusiness(businessId: string): Promise<YelpBusiness | null> {
  try {
    const apiKey = getYelpAPIKey();
    if (!apiKey) {
      console.warn('Yelp API key not configured');
      return null;
    }

    // Note: Yelp Fusion API requires separate calls for business details + reviews
    const [businessResponse, reviewsResponse] = await Promise.all([
      fetch(`https://api.yelp.com/v3/businesses/${businessId}`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      }),
      fetch(`https://api.yelp.com/v3/businesses/${businessId}/reviews`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      }),
    ]);

    if (!businessResponse.ok || !reviewsResponse.ok) {
      console.warn('Yelp API error');
      return null;
    }

    const business = await businessResponse.json();
    const reviewsData = await reviewsResponse.json();

    return {
      rating: business.rating,
      price: business.price,
      reviews: reviewsData.reviews,
    };
  } catch (error) {
    console.error('Yelp fetch error:', error);
    return null;
  }
}

/**
 * Extract price level from Google + Yelp
 * Priority: Google > Yelp
 */
function extractPriceLevel(
  google: GooglePlaceDetails | null,
  yelp: YelpBusiness | null
): '$' | '$$' | '$$$' | '$$$$' | null {
  // Google price_level: 0-4 (0 = Free, 1 = $, 2 = $$, etc.)
  if (google?.price_level !== undefined) {
    const level = google.price_level;
    if (level === 1) return '$';
    if (level === 2) return '$$';
    if (level === 3) return '$$$';
    if (level === 4) return '$$$$';
  }

  // Yelp price: '$', '$$', '$$$', '$$$$'
  if (yelp?.price) {
    return yelp.price as '$' | '$$' | '$$$' | '$$$$';
  }

  return null;
}

/**
 * Calculate weighted average rating
 * Weights: Google 50%, Yelp 30%, Foursquare 20% (future)
 */
function calculateWeightedRating(
  google: GooglePlaceDetails | null,
  yelp: YelpBusiness | null
): number | null {
  let totalWeight = 0;
  let weightedSum = 0;

  if (google?.rating) {
    weightedSum += google.rating * 0.5;
    totalWeight += 0.5;
  }

  if (yelp?.rating) {
    weightedSum += yelp.rating * 0.3;
    totalWeight += 0.3;
  }

  // Future: Foursquare rating * 0.2

  return totalWeight > 0 ? weightedSum / totalWeight : null;
}

/**
 * Infer category from Google Place types
 */
function inferCategory(google: GooglePlaceDetails | null): 'cafe' | 'coworking' | 'library' | 'other' {
  if (!google?.types) return 'other';

  const types = google.types.map(t => t.toLowerCase());

  if (types.includes('library')) return 'library';
  if (types.includes('cafe') || types.includes('coffee_shop')) return 'cafe';
  if (types.includes('coworking_space')) return 'coworking';

  return 'other';
}

/**
 * Collect 5-10 review samples from Google + Yelp
 */
function collectReviewSamples(
  google: GooglePlaceDetails | null,
  yelp: YelpBusiness | null
): Array<{ text: string; rating: number; time: number }> {
  const samples: Array<{ text: string; rating: number; time: number }> = [];

  // Google reviews (max 5)
  if (google?.reviews) {
    google.reviews.slice(0, 5).forEach(r => {
      samples.push({
        text: r.text,
        rating: r.rating,
        time: r.time,
      });
    });
  }

  // Yelp reviews (max 5)
  if (yelp?.reviews) {
    yelp.reviews.slice(0, 5).forEach(r => {
      samples.push({
        text: r.text,
        rating: r.rating,
        time: new Date(r.time_created).getTime() / 1000,
      });
    });
  }

  // Return up to 10 total
  return samples.slice(0, 10);
}

/**
 * Get Google Maps API key
 */
function getGoogleMapsKey(): string | null {
  const expoKey = (Constants.expoConfig as any)?.extra?.GOOGLE_MAPS_API_KEY;
  const globalKey = (global as any)?.GOOGLE_MAPS_API_KEY;
  return expoKey || globalKey || null;
}

/**
 * Get Yelp API key
 */
function getYelpAPIKey(): string | null {
  const expoKey = (Constants.expoConfig as any)?.extra?.YELP_API_KEY;
  const globalKey = (global as any)?.YELP_API_KEY;
  return expoKey || globalKey || null;
}

/**
 * Empty intelligence when APIs unavailable
 */
function getEmptyIntelligence(): SpotIntelligence {
  return {
    priceLevel: null,
    avgRating: null,
    category: 'other',
    isOpenNow: false,
    inferredNoise: null,
    inferredNoiseConfidence: 0,
    hasWifi: false,
    wifiConfidence: 0,
    goodForStudying: false,
    goodForMeetings: false,
    source: 'api+nlp',
    lastUpdated: Date.now(),
    reviewCount: 0,
  };
}

/**
 * Save intelligence to Firestore (materialized on root for queries)
 */
export async function saveSpotIntelligence(
  spotId: string,
  intelligence: SpotIntelligence
): Promise<void> {
  try {
    const fb = ensureFirebase();
    if (!fb) throw new Error('Firebase not initialized');

    const db = fb.firestore();
    await db.collection('spots').doc(spotId).set({
      intel: intelligence,
      updatedAt: fb.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log(`Saved intelligence for spot ${spotId}`);
  } catch (error) {
    console.error('Failed to save spot intelligence:', error);
    throw error;
  }
}
