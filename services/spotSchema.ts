/**
 * Spot Schema Contract (Phase A/B Data Model)
 *
 * Canonical TypeScript schema for spot documents in Firestore.
 * All backend writes and frontend reads must conform to this schema.
 *
 * Design Principles:
 * - Root-level materialized fields for Firestore queries
 * - Required fields always present (never undefined)
 * - Optional fields explicitly nullable
 * - Strict types for enums (no loose strings)
 */

/**
 * Core spot identification and location
 */
export interface SpotCore {
  /** Firestore document ID */
  id: string;
  /** Spot name (user-facing) */
  name: string;
  /** Full address string */
  address: string;
  /** Google Place ID (primary key for API lookups) */
  placeId: string;
  /** Geohash for proximity queries (5-9 chars) */
  geoHash: string;
  /** Latitude (required for maps) */
  lat: number;
  /** Longitude (required for maps) */
  lng: number;
  /** Optional Yelp business ID */
  yelpId?: string;
  /** Optional Foursquare venue ID */
  foursquareId?: string;
}

/**
 * Intelligence from APIs + NLP (Phase A)
 */
export interface SpotIntel {
  // From APIs (no ML)
  /** Price level from Google/Yelp */
  priceLevel: '$' | '$$' | '$$$' | '$$$$' | null;
  /** Weighted average rating (Google 50%, Yelp 30%, Foursquare 20%) */
  avgRating: number | null;
  /** Inferred category */
  category: 'cafe' | 'coworking' | 'library' | 'other';
  /** Currently open (from Google Places hours) */
  isOpenNow: boolean;

  // From NLP (lightweight ML)
  /** Inferred noise level from review analysis */
  inferredNoise: 'quiet' | 'moderate' | 'loud' | null;
  /** Confidence in noise inference (0-1) */
  inferredNoiseConfidence: number;
  /** WiFi mentioned in reviews */
  hasWifi: boolean;
  /** WiFi confidence */
  wifiConfidence: number;
  /** Derived: inferredNoise === 'quiet' && hasWifi */
  goodForStudying: boolean;
  /** Derived: inferredNoise !== 'loud' && avgRating >= 4.0 */
  goodForMeetings: boolean;
  /** Confidence that spot is date-friendly (0-1) */
  dateFriendly?: number;
  /** Dominant aesthetic vibe inferred from reviews */
  aestheticVibe?: 'cozy' | 'modern' | 'rustic' | 'industrial' | 'classic' | null;
  /** Confidence that food/pastries are strong (0-1) */
  foodQualitySignal?: number;
  /** Dominant music atmosphere from reviews */
  musicAtmosphere?: 'none' | 'chill' | 'upbeat' | 'live' | 'unknown';
  /** Confidence this place is photogenic (0-1) */
  instagramWorthy?: number;
  /** Seating comfort from review language */
  seatingComfort?: 'comfortable' | 'basic' | 'mixed' | 'unknown';
  /** Confidence for date suitability (0-1) */
  goodForDates?: number;
  /** Confidence for group suitability (0-1) */
  goodForGroups?: number;

  // Provenance
  /** Data source identifier */
  source: 'api+nlp' | 'manual';
  /** Timestamp of last intelligence update */
  lastUpdated: number;
  /** Number of reviews analyzed */
  reviewCount: number;
}

/**
 * Live data from user check-ins (Phase B)
 */
export interface SpotLive {
  /** Aggregated noise from recent check-ins */
  noise: 'quiet' | 'moderate' | 'loud' | null;
  /** Most recent busyness */
  busyness: 'empty' | 'some' | 'packed' | null;
  /** Total check-in count (all-time) */
  checkinCount: number;
  /** Timestamp of most recent check-in */
  lastCheckinAt: number | null;
}

/**
 * Display data (weighted blend of intel + live) (Phase B)
 */
export interface SpotDisplay {
  /** Blended noise value */
  noise: 'quiet' | 'moderate' | 'loud' | null;
  /** Source of noise value */
  noiseSource: 'live' | 'inferred' | 'blended';
  /** User-facing label with provenance */
  noiseLabel: string;
  /** Busyness (always live, never inferred) */
  busyness: 'empty' | 'some' | 'packed' | null;
  /** Busyness source (always 'live') */
  busynessSource: 'live';
  /** User-facing busyness label */
  busynessLabel: string;
}

/**
 * Complete spot document schema (Firestore root)
 */
export interface Spot extends SpotCore {
  /** Intelligence data (Phase A) */
  intel: SpotIntel | null;
  /** Live check-in data (Phase B) */
  live: SpotLive | null;
  /** Blended display data (Phase B) */
  display: SpotDisplay | null;
  /** Firestore server timestamp */
  updatedAt?: any;  // Firestore FieldValue
  /** Firestore creation timestamp */
  createdAt?: any;  // Firestore FieldValue
}

/**
 * Safe defaults for missing data
 */

export function getDefaultIntel(): SpotIntel {
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
    dateFriendly: 0,
    aestheticVibe: null,
    foodQualitySignal: 0,
    musicAtmosphere: 'unknown',
    instagramWorthy: 0,
    seatingComfort: 'unknown',
    goodForDates: 0,
    goodForGroups: 0,
    source: 'manual',
    lastUpdated: Date.now(),
    reviewCount: 0,
  };
}

export function getDefaultLive(): SpotLive {
  return {
    noise: null,
    busyness: null,
    checkinCount: 0,
    lastCheckinAt: null,
  };
}

export function getDefaultDisplay(): SpotDisplay {
  return {
    noise: null,
    noiseSource: 'inferred',
    noiseLabel: 'No data yet',
    busyness: null,
    busynessSource: 'live',
    busynessLabel: 'No recent data',
  };
}

/**
 * Validation helpers
 */

export function isValidNoiseLevel(value: any): value is 'quiet' | 'moderate' | 'loud' {
  return value === 'quiet' || value === 'moderate' || value === 'loud';
}

export function isValidBusyness(value: any): value is 'empty' | 'some' | 'packed' {
  return value === 'empty' || value === 'some' || value === 'packed';
}

export function isValidPriceLevel(value: any): value is '$' | '$$' | '$$$' | '$$$$' {
  return value === '$' || value === '$$' || value === '$$$' || value === '$$$$';
}

export function isValidCategory(value: any): value is 'cafe' | 'coworking' | 'library' | 'other' {
  return value === 'cafe' || value === 'coworking' || value === 'library' || value === 'other';
}

/**
 * Validate spot intel fields (used by Cloud Functions before write)
 */
export function validateSpotIntel(intel: Partial<SpotIntel>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Price level validation
  if (intel.priceLevel !== null && intel.priceLevel !== undefined) {
    if (!isValidPriceLevel(intel.priceLevel)) {
      errors.push(`Invalid priceLevel: ${intel.priceLevel}`);
    }
  }

  // Category validation
  if (intel.category && !isValidCategory(intel.category)) {
    errors.push(`Invalid category: ${intel.category}`);
  }

  // Noise validation
  if (intel.inferredNoise !== null && intel.inferredNoise !== undefined) {
    if (!isValidNoiseLevel(intel.inferredNoise)) {
      errors.push(`Invalid inferredNoise: ${intel.inferredNoise}`);
    }
  }

  // Confidence bounds
  if (intel.inferredNoiseConfidence !== undefined) {
    if (intel.inferredNoiseConfidence < 0 || intel.inferredNoiseConfidence > 1) {
      errors.push(`inferredNoiseConfidence out of range: ${intel.inferredNoiseConfidence}`);
    }
  }

  if (intel.wifiConfidence !== undefined) {
    if (intel.wifiConfidence < 0 || intel.wifiConfidence > 1) {
      errors.push(`wifiConfidence out of range: ${intel.wifiConfidence}`);
    }
  }

  if (intel.dateFriendly !== undefined) {
    if (intel.dateFriendly < 0 || intel.dateFriendly > 1) {
      errors.push(`dateFriendly out of range: ${intel.dateFriendly}`);
    }
  }

  if (intel.foodQualitySignal !== undefined) {
    if (intel.foodQualitySignal < 0 || intel.foodQualitySignal > 1) {
      errors.push(`foodQualitySignal out of range: ${intel.foodQualitySignal}`);
    }
  }

  if (intel.instagramWorthy !== undefined) {
    if (intel.instagramWorthy < 0 || intel.instagramWorthy > 1) {
      errors.push(`instagramWorthy out of range: ${intel.instagramWorthy}`);
    }
  }

  if (intel.goodForDates !== undefined) {
    if (intel.goodForDates < 0 || intel.goodForDates > 1) {
      errors.push(`goodForDates out of range: ${intel.goodForDates}`);
    }
  }

  if (intel.goodForGroups !== undefined) {
    if (intel.goodForGroups < 0 || intel.goodForGroups > 1) {
      errors.push(`goodForGroups out of range: ${intel.goodForGroups}`);
    }
  }

  if (intel.aestheticVibe !== undefined && intel.aestheticVibe !== null) {
    if (!['cozy', 'modern', 'rustic', 'industrial', 'classic'].includes(intel.aestheticVibe)) {
      errors.push(`Invalid aestheticVibe: ${intel.aestheticVibe}`);
    }
  }

  if (intel.musicAtmosphere !== undefined && intel.musicAtmosphere !== null) {
    if (!['none', 'chill', 'upbeat', 'live', 'unknown'].includes(intel.musicAtmosphere)) {
      errors.push(`Invalid musicAtmosphere: ${intel.musicAtmosphere}`);
    }
  }

  if (intel.seatingComfort !== undefined && intel.seatingComfort !== null) {
    if (!['comfortable', 'basic', 'mixed', 'unknown'].includes(intel.seatingComfort)) {
      errors.push(`Invalid seatingComfort: ${intel.seatingComfort}`);
    }
  }

  // Rating bounds
  if (intel.avgRating !== null && intel.avgRating !== undefined) {
    if (intel.avgRating < 0 || intel.avgRating > 5) {
      errors.push(`avgRating out of range: ${intel.avgRating}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate spot live fields
 */
export function validateSpotLive(live: Partial<SpotLive>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (live.noise !== null && live.noise !== undefined) {
    if (!isValidNoiseLevel(live.noise)) {
      errors.push(`Invalid noise: ${live.noise}`);
    }
  }

  if (live.busyness !== null && live.busyness !== undefined) {
    if (!isValidBusyness(live.busyness)) {
      errors.push(`Invalid busyness: ${live.busyness}`);
    }
  }

  if (live.checkinCount !== undefined && live.checkinCount < 0) {
    errors.push(`checkinCount cannot be negative: ${live.checkinCount}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate complete spot document before write
 */
export function validateSpot(spot: Partial<Spot>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Required core fields
  if (!spot.name || spot.name.trim().length === 0) {
    errors.push('Missing required field: name');
  }

  if (!spot.placeId || spot.placeId.trim().length === 0) {
    errors.push('Missing required field: placeId');
  }

  if (!spot.geoHash || spot.geoHash.trim().length === 0) {
    errors.push('Missing required field: geoHash');
  }

  if (spot.lat === undefined || spot.lat === null) {
    errors.push('Missing required field: lat');
  } else if (spot.lat < -90 || spot.lat > 90) {
    errors.push(`Invalid lat: ${spot.lat} (must be -90 to 90)`);
  }

  if (spot.lng === undefined || spot.lng === null) {
    errors.push('Missing required field: lng');
  } else if (spot.lng < -180 || spot.lng > 180) {
    errors.push(`Invalid lng: ${spot.lng} (must be -180 to 180)`);
  }

  // Validate nested objects if present
  if (spot.intel) {
    const intelValidation = validateSpotIntel(spot.intel);
    if (!intelValidation.valid) {
      errors.push(...intelValidation.errors);
    }
  }

  if (spot.live) {
    const liveValidation = validateSpotLive(spot.live);
    if (!liveValidation.valid) {
      errors.push(...liveValidation.errors);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
