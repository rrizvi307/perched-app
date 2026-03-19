import Constants from 'expo-constants';
import { toMillis } from '@/services/checkinUtils';
import { withErrorBoundary } from './errorBoundary';
import { getPlaceDetails, type GooglePlaceReview } from './googleMaps';
import { analyzeReviews, type ReviewNLPResult } from './nlpReviews';
import {
  fetchProviderProxyJson,
  type ProviderProxyAuthMode,
  type ProviderProxyErrorCode,
} from './providerProxy';
import { computeVibeScores, getPrimaryVibe, type VibeScores, type VibeType } from './vibeScoring';

export type ExternalSource = 'google' | 'foursquare' | 'yelp';
export type OpenStatusSource = 'google' | 'input' | 'legacy' | 'unknown';

export type ExternalPlaceSignal = {
  source: ExternalSource;
  rating?: number;
  reviewCount?: number;
  priceLevel?: string;
  categories?: string[];
};

export type ExternalPlacePhoto = {
  source: Exclude<ExternalSource, 'google'>;
  url: string;
};

export type ExternalSignalMeta = {
  providerCount: number;
  providerDiversity: number;
  totalReviewCount: number;
  ratingConsensus: number;
  trustScore: number;
};

export type CrowdForecastPoint = {
  offsetHours: number;
  label: string;
  localHourLabel: string;
  level: 'low' | 'moderate' | 'high' | 'unknown';
  score: number;
  confidence: number;
};

export type IntelligenceReliability = {
  sampleSize: number;
  dataCoverage: number;
  variancePenalty: number;
  score: number;
};

export type IntelligenceMomentum = {
  trend: 'improving' | 'declining' | 'stable' | 'insufficient_data';
  deltaWorkScore: number;
  wifiDelta: number;
  busynessDelta: number;
  noiseDelta: number;
  laptopDelta: number;
};

export type ContextSignal = {
  source: 'weather';
  condition: 'clear' | 'cloudy' | 'rain' | 'snow' | 'unknown';
  impact: 'increase_crowd' | 'decrease_crowd' | 'neutral';
  confidence: number;
  temperatureC?: number;
  precipitationMm?: number;
};

export type ScoreFactorSource = 'checkin' | 'inferred' | 'api' | 'none';

export type ScoreBreakdown = {
  wifi: { value: number; source: ScoreFactorSource };
  outlet: { value: number; source: ScoreFactorSource };
  noise: { value: number; source: ScoreFactorSource };
  busyness: { value: number; source: ScoreFactorSource };
  laptop: { value: number; source: ScoreFactorSource };
  drinkQuality: { value: number; source: ScoreFactorSource };
  tags: { value: number; source: ScoreFactorSource };
  externalRating: { value: number; source: ScoreFactorSource };
  venueType: { value: number };
  openStatus: { value: number };
  momentum: { value: number };
};

export type PlaceIntelligence = {
  workScore: number;
  vibeScores?: VibeScores;
  primaryVibe?: VibeType;
  aggregateRating: number | null;
  aggregateReviewCount: number;
  priceLevel: string | null;
  openNow: boolean | null;
  openNowSource: OpenStatusSource;
  scoreBreakdown: ScoreBreakdown;
  crowdLevel: 'low' | 'moderate' | 'high' | 'unknown';
  bestTime: 'morning' | 'afternoon' | 'evening' | 'late' | 'anytime';
  confidence: number;
  reliability: IntelligenceReliability;
  momentum: IntelligenceMomentum;
  recommendations: {
    goodForStudying: boolean;
    studyingConfidence: number;
    goodForMeetings: boolean;
    meetingsConfidence: number;
  };
  highlights: string[];
  externalSignals: ExternalPlaceSignal[];
  providerPhotos: ExternalPlacePhoto[];
  externalSignalMeta: ExternalSignalMeta;
  dataAvailability: {
    status: 'full' | 'degraded' | 'unavailable';
    reason?: ProviderProxyErrorCode | 'missing_location' | 'missing_endpoint' | 'provider_partial';
    authMode?: ProviderProxyAuthMode;
    degradedProviders: ExternalSource[];
  };
  contextSignals: ContextSignal[];
  crowdForecast: CrowdForecastPoint[];
  useCases: string[];
  hours?: string[];
  modelVersion: string;
  generatedAt: number;
};

function getAvailabilityProviderLabel(source: ExternalSource): string {
  if (source === 'foursquare') return 'Foursquare';
  if (source === 'yelp') return 'Yelp';
  return 'Google';
}

export function getPlaceIntelligenceAvailabilityMessage(
  availability?: PlaceIntelligence['dataAvailability'] | null,
): string | null {
  if (!availability || availability.status === 'full') return null;

  if (availability.status === 'degraded' && availability.degradedProviders.length) {
    const providers = availability.degradedProviders.map(getAvailabilityProviderLabel);
    return `Live data is limited right now. ${providers.join(' + ')} ${providers.length === 1 ? 'is' : 'are'} unavailable.`;
  }

  switch (availability.reason) {
    case 'missing_endpoint':
      return 'This build is missing live place enrichment configuration.';
    case 'missing_location':
      return 'Live place enrichment needs a valid location.';
    case 'proxy_access_unavailable':
      return 'Live place enrichment is still warming up. Try again in a moment.';
    case 'proxy_unauthorized':
      return 'Live place enrichment needs a fresh session. Try again in a moment.';
    case 'proxy_timeout':
      return 'Live place enrichment timed out. Check your connection and retry.';
    default:
      return 'Live place enrichment is temporarily unavailable. Showing on-device signals.';
  }
}

export function hasRenderablePlaceIntelligence(intelligence?: PlaceIntelligence | null) {
  if (!intelligence) return false;
  if (intelligence.dataAvailability.status !== 'unavailable') return true;
  if ((intelligence.reliability?.sampleSize || 0) > 0) return true;
  if ((intelligence.externalSignals || []).length > 0) return true;
  if (typeof intelligence.aggregateRating === 'number') return true;
  return false;
}

type BuildIntelligenceInput = {
  placeName: string;
  placeId?: string | null;
  location?: { lat: number; lng: number } | null;
  openNow?: boolean;
  types?: string[];
  checkins?: any[];
  tagScores?: Record<string, number>;
  inferred?: {
    noise?: 'quiet' | 'moderate' | 'loud' | null;
    noiseConfidence?: number;
    hasWifi?: boolean;
    wifiConfidence?: number;
    goodForStudying?: boolean;
    goodForMeetings?: boolean;
    goodForDates?: number;
    goodForGroups?: number;
    instagramWorthy?: number;
    foodQualitySignal?: number;
    aestheticVibe?: 'cozy' | 'modern' | 'rustic' | 'industrial' | 'classic' | null;
    musicAtmosphere?: 'none' | 'chill' | 'upbeat' | 'live' | 'unknown' | null;
    avgRating?: number | null;
    reviewCount?: number | null;
    priceLevel?: string | null;
    isOpenNow?: boolean | null;
    hours?: string[];
  } | null;
};

const INTELLIGENCE_TTL_MS = 15 * 60 * 1000;
const MOMENTUM_WINDOW_DAYS = 7;
const PLACE_INTEL_MODEL_VERSION = '2026-03-04-r7';
const INTEL_TELEMETRY_SAMPLE_RATE = 0.08;
const INTEL_TELEMETRY_THROTTLE_MS = 20 * 60 * 1000;
const WEATHER_TTL_MS = 30 * 60 * 1000;
const REVIEW_NLP_TTL_MS = 24 * 60 * 60 * 1000;
const EXTERNAL_PROVIDER_COUNT = 3;
const INTELLIGENCE_CACHE_MAX = 160;
const PROXY_SIGNAL_CACHE_MAX = 160;
const WEATHER_SIGNAL_CACHE_MAX = 64;
const REVIEW_NLP_CACHE_MAX = 96;
const TELEMETRY_THROTTLE_MAX = 400;
const intelligenceCache = new Map<string, { ts: number; payload: PlaceIntelligence }>();
type ProxyPlacePayload = {
  externalSignals: ExternalPlaceSignal[];
  googleSnapshot: GooglePlaceSignalSnapshot | null;
  providerPhotos: ExternalPlacePhoto[];
  dataAvailability: PlaceIntelligence['dataAvailability'];
};

const proxySignalCache = new Map<string, { ts: number; payload: ProxyPlacePayload }>();
const proxyInflight = new Map<string, Promise<ProxyPlacePayload>>();
const weatherSignalCache = new Map<string, { ts: number; payload: ContextSignal[] }>();
const weatherInflight = new Map<string, Promise<ContextSignal[]>>();
const reviewNlpCache = new Map<string, { ts: number; payload: ReviewNLPResult | null }>();
const reviewNlpInflight = new Map<string, Promise<ReviewNLPResult | null>>();
const telemetryThrottle = new Map<string, number>();
type PlaceIntelCacheBucket = 'intelligence' | 'proxySignals' | 'weatherSignals' | 'reviewNlp' | 'telemetryThrottle';
type PlaceIntelCacheCounter = { hits: number; misses: number; sets: number; evictions: number };
const placeIntelCacheCounters: Record<PlaceIntelCacheBucket, PlaceIntelCacheCounter> = {
  intelligence: { hits: 0, misses: 0, sets: 0, evictions: 0 },
  proxySignals: { hits: 0, misses: 0, sets: 0, evictions: 0 },
  weatherSignals: { hits: 0, misses: 0, sets: 0, evictions: 0 },
  reviewNlp: { hits: 0, misses: 0, sets: 0, evictions: 0 },
  telemetryThrottle: { hits: 0, misses: 0, sets: 0, evictions: 0 },
};

function getPlaceIntelCacheBucket(map: unknown): PlaceIntelCacheBucket | null {
  if (map === intelligenceCache) return 'intelligence';
  if (map === proxySignalCache) return 'proxySignals';
  if (map === weatherSignalCache) return 'weatherSignals';
  if (map === reviewNlpCache) return 'reviewNlp';
  if (map === telemetryThrottle) return 'telemetryThrottle';
  return null;
}

function touchMapEntry<T>(map: Map<string, T>, key: string, value: T) {
  map.delete(key);
  map.set(key, value);
}

function pruneMap<T>(map: Map<string, T>, maxEntries: number) {
  const bucket = getPlaceIntelCacheBucket(map);
  while (map.size > maxEntries) {
    const oldestKey = map.keys().next().value;
    if (!oldestKey) break;
    map.delete(oldestKey);
    if (bucket) placeIntelCacheCounters[bucket].evictions += 1;
  }
}

function getFreshCacheEntry<T extends { ts: number }>(map: Map<string, T>, key: string, ttlMs: number) {
  const bucket = getPlaceIntelCacheBucket(map);
  const cached = map.get(key);
  if (!cached) {
    if (bucket) placeIntelCacheCounters[bucket].misses += 1;
    return null;
  }
  if (Date.now() - cached.ts >= ttlMs) {
    map.delete(key);
    if (bucket) placeIntelCacheCounters[bucket].misses += 1;
    return null;
  }
  touchMapEntry(map, key, cached);
  if (bucket) placeIntelCacheCounters[bucket].hits += 1;
  return cached;
}

function setBoundedMapEntry<T>(map: Map<string, T>, key: string, value: T, maxEntries: number) {
  const bucket = getPlaceIntelCacheBucket(map);
  map.delete(key);
  map.set(key, value);
  if (bucket) placeIntelCacheCounters[bucket].sets += 1;
  pruneMap(map, maxEntries);
}

const POSITIVE_WORK_TAG_TOKENS = [
  'wifi',
  'wi-fi',
  'outlet',
  'power',
  'quiet',
  'study',
  'focus',
  'productive',
  'work',
  'laptop',
  'seat',
  'desk',
  'table',
];

const NEGATIVE_WORK_TAG_TOKENS = [
  'loud',
  'noisy',
  'crowded',
  'packed',
  'chaotic',
  'party',
  'club',
  'slow wifi',
  'no wifi',
];

function getKnownWorkSpotBoost(typeText: string) {
  if (!typeText) return 0;
  if (/\bbrass\s*tacks\b/.test(typeText)) return 10;
  if (/\bthe\s+nook\b/.test(typeText) || /\bnook\b/.test(typeText)) return 10;
  return 0;
}

type WorkTagSignal = {
  positiveStrength: number;
  negativeStrength: number;
};

type WorkIntentSignal = {
  positive: number;
  negative: number;
};

function getFallbackPlaceIntelligence(): PlaceIntelligence {
  return {
    workScore: 50,
    vibeScores: {
      study: 50,
      date: 42,
      social: 45,
      quick: 48,
      aesthetic: 44,
    },
    primaryVibe: 'study',
    aggregateRating: null,
    aggregateReviewCount: 0,
    priceLevel: null,
    openNow: null,
    openNowSource: 'unknown',
    scoreBreakdown: {
      wifi: { value: 0, source: 'none' },
      outlet: { value: 0, source: 'none' },
      noise: { value: 0, source: 'none' },
      busyness: { value: 0, source: 'none' },
      laptop: { value: 0, source: 'none' },
      drinkQuality: { value: 0, source: 'none' },
      tags: { value: 0, source: 'none' },
      externalRating: { value: 0, source: 'none' },
      venueType: { value: 0 },
      openStatus: { value: 0 },
      momentum: { value: 0 },
    },
    crowdLevel: 'unknown',
    bestTime: 'anytime',
    confidence: 0.1,
    reliability: {
      sampleSize: 0,
      dataCoverage: 0,
      variancePenalty: 1,
      score: 0.1,
    },
    momentum: {
      trend: 'insufficient_data',
      deltaWorkScore: 0,
      wifiDelta: 0,
      busynessDelta: 0,
      noiseDelta: 0,
      laptopDelta: 0,
    },
    recommendations: {
      goodForStudying: false,
      studyingConfidence: 0,
      goodForMeetings: false,
      meetingsConfidence: 0,
    },
    highlights: [],
    externalSignals: [],
    providerPhotos: [],
    externalSignalMeta: {
      providerCount: 0,
      providerDiversity: 0,
      totalReviewCount: 0,
      ratingConsensus: 0,
      trustScore: 0,
    },
    dataAvailability: {
      status: 'unavailable',
      reason: 'missing_endpoint',
      authMode: 'none',
      degradedProviders: [],
    },
    contextSignals: [],
    crowdForecast: [],
    useCases: ['Quick focus stop'],
    hours: undefined,
    modelVersion: PLACE_INTEL_MODEL_VERSION,
    generatedAt: Date.now(),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2) {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function avg(nums: number[]) {
  if (!nums.length) return null;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function stddev(nums: number[]) {
  if (nums.length < 2) return 0;
  const mean = avg(nums);
  if (mean === null) return 0;
  const variance = nums.reduce((sum, n) => sum + Math.pow(n - mean, 2), 0) / nums.length;
  return Math.sqrt(variance);
}

type GooglePlaceSignalSnapshot = {
  rating?: number;
  reviewCount?: number;
  priceLevel?: string;
  openNow?: boolean;
  types?: string[];
  reviews?: GooglePlaceReview[];
  hours?: string[];
};

function normalizeHours(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const hours = value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => item.trim());
  return hours.length ? hours : undefined;
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

function normalizeGoogleProxySnapshot(value: unknown): GooglePlaceSignalSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, any>;
  const snapshot: GooglePlaceSignalSnapshot = {
    rating: typeof raw.rating === 'number' ? raw.rating : undefined,
    reviewCount: typeof raw.reviewCount === 'number' ? raw.reviewCount : undefined,
    priceLevel: typeof raw.priceLevel === 'string' && raw.priceLevel.trim() ? raw.priceLevel.trim() : undefined,
    openNow: typeof raw.openNow === 'boolean' ? raw.openNow : undefined,
    types: Array.isArray(raw.types)
      ? raw.types.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : undefined,
    reviews: normalizeGoogleReviews(raw.reviews),
    hours: normalizeHours(raw.hours),
  };
  const hasPayload =
    typeof snapshot.rating === 'number' ||
    typeof snapshot.reviewCount === 'number' ||
    typeof snapshot.priceLevel === 'string' ||
    typeof snapshot.openNow === 'boolean' ||
    Boolean(snapshot.hours?.length) ||
    Boolean(snapshot.reviews?.length);
  return hasPayload ? snapshot : null;
}

function uniqStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .map((value) => value.trim())
    )
  );
}

function buildGoogleExternalSignal(snapshot: GooglePlaceSignalSnapshot | null): ExternalPlaceSignal | null {
  if (!snapshot) return null;
  const hasPayload =
    typeof snapshot.rating === 'number' ||
    typeof snapshot.reviewCount === 'number' ||
    typeof snapshot.priceLevel === 'string';
  if (!hasPayload) return null;
  return {
    source: 'google',
    rating: snapshot.rating,
    reviewCount: snapshot.reviewCount,
    priceLevel: snapshot.priceLevel,
    categories: snapshot.types,
  };
}

function resolveOpenStatus(
  input: BuildIntelligenceInput,
  googleSnapshot: GooglePlaceSignalSnapshot | null,
): { openNow: boolean | null; source: OpenStatusSource } {
  if (typeof googleSnapshot?.openNow === 'boolean') {
    return { openNow: googleSnapshot.openNow, source: 'google' };
  }
  if (typeof input.openNow === 'boolean') {
    return { openNow: input.openNow, source: 'input' };
  }
  if (typeof input.inferred?.isOpenNow === 'boolean') {
    return { openNow: input.inferred.isOpenNow, source: 'legacy' };
  }
  return { openNow: null, source: 'unknown' };
}

function resolvePriceLevel(
  input: BuildIntelligenceInput,
  googleSnapshot: GooglePlaceSignalSnapshot | null,
  externalSignals: ExternalPlaceSignal[],
): string | null {
  if (typeof googleSnapshot?.priceLevel === 'string' && googleSnapshot.priceLevel.trim()) {
    return googleSnapshot.priceLevel.trim();
  }
  const external = externalSignals.find((signal) => typeof signal.priceLevel === 'string' && signal.priceLevel.trim());
  if (typeof external?.priceLevel === 'string') return external.priceLevel.trim();
  if (typeof input.inferred?.priceLevel === 'string' && input.inferred.priceLevel.trim()) {
    return input.inferred.priceLevel.trim();
  }
  return null;
}

function computeAggregateRating(externalSignals: ExternalPlaceSignal[]): number | null {
  const ratedSignals = externalSignals.filter((signal) => typeof signal.rating === 'number');
  if (!ratedSignals.length) return null;

  let weightedTotal = 0;
  let totalWeight = 0;
  ratedSignals.forEach((signal) => {
    const reviewWeight = typeof signal.reviewCount === 'number'
      ? clamp(Math.log10(1 + Math.max(0, signal.reviewCount)), 0.6, 3.4)
      : 0.7;
    const sourceWeight =
      signal.source === 'google' ? 1.35 :
        signal.source === 'yelp' ? 1.1 :
          0.9;
    const weight = reviewWeight * sourceWeight;
    weightedTotal += (signal.rating || 0) * weight;
    totalWeight += weight;
  });

  if (totalWeight <= 0) return null;
  return round(weightedTotal / totalWeight, 2);
}

function normalizeReviewNlpResult(value: any): ReviewNLPResult | null {
  if (!value || typeof value !== 'object') return null;
  const reviewsAnalyzed = typeof value.reviewCount === 'number' && Number.isFinite(value.reviewCount)
    ? value.reviewCount
    : 0;
  return {
    inferredNoise: value.noise === 'quiet' || value.noise === 'moderate' || value.noise === 'loud'
      ? value.noise
      : value.inferredNoise === 'quiet' || value.inferredNoise === 'moderate' || value.inferredNoise === 'loud'
        ? value.inferredNoise
        : null,
    inferredNoiseConfidence: clamp(
      typeof value.noiseConfidence === 'number' ? value.noiseConfidence :
        typeof value.inferredNoiseConfidence === 'number' ? value.inferredNoiseConfidence :
          0,
      0,
      1,
    ),
    hasWifi: Boolean(value.hasWifi),
    wifiConfidence: clamp(typeof value.wifiConfidence === 'number' ? value.wifiConfidence : 0, 0, 1),
    goodForStudying: Boolean(value.goodForStudying),
    goodForMeetings: Boolean(value.goodForMeetings),
    dateFriendly: clamp(typeof value.dateFriendly === 'number' ? value.dateFriendly : 0, 0, 1),
    aestheticVibe:
      value.aestheticVibe === 'cozy' ||
      value.aestheticVibe === 'modern' ||
      value.aestheticVibe === 'rustic' ||
      value.aestheticVibe === 'industrial' ||
      value.aestheticVibe === 'classic'
        ? value.aestheticVibe
        : null,
    foodQualitySignal: clamp(typeof value.foodQualitySignal === 'number' ? value.foodQualitySignal : 0, 0, 1),
    musicAtmosphere:
      value.musicAtmosphere === 'none' ||
      value.musicAtmosphere === 'chill' ||
      value.musicAtmosphere === 'upbeat' ||
      value.musicAtmosphere === 'live'
        ? value.musicAtmosphere
        : 'unknown',
    instagramWorthy: clamp(typeof value.instagramWorthy === 'number' ? value.instagramWorthy : 0, 0, 1),
    seatingComfort:
      value.seatingComfort === 'comfortable' ||
      value.seatingComfort === 'basic' ||
      value.seatingComfort === 'mixed'
        ? value.seatingComfort
        : 'unknown',
    goodForDates: clamp(typeof value.goodForDates === 'number' ? value.goodForDates : 0, 0, 1),
    goodForGroups: clamp(typeof value.goodForGroups === 'number' ? value.goodForGroups : 0, 0, 1),
    reviewCount: reviewsAnalyzed,
    lastAnalyzed: typeof value.lastAnalyzed === 'number' ? value.lastAnalyzed : Date.now(),
  };
}

function mergeInferredSignals(
  base: BuildIntelligenceInput['inferred'],
  reviewSignals: ReviewNLPResult | null,
  aggregateRating: number | null,
  aggregateReviewCount: number,
  priceLevel: string | null,
  openNow: boolean | null,
  hours?: string[],
): BuildIntelligenceInput['inferred'] {
  if (!base && !reviewSignals && aggregateRating === null && !aggregateReviewCount && !priceLevel && openNow === null && !hours?.length) {
    return null;
  }
  return {
    ...(base || {}),
    noise: base?.noise ?? reviewSignals?.inferredNoise ?? null,
    noiseConfidence: Math.max(base?.noiseConfidence ?? 0, reviewSignals?.inferredNoiseConfidence ?? 0) || undefined,
    hasWifi: Boolean(base?.hasWifi || reviewSignals?.hasWifi),
    wifiConfidence: Math.max(base?.wifiConfidence ?? 0, reviewSignals?.wifiConfidence ?? 0) || undefined,
    goodForStudying: Boolean(base?.goodForStudying || reviewSignals?.goodForStudying),
    goodForMeetings: Boolean(base?.goodForMeetings || reviewSignals?.goodForMeetings),
    goodForDates: base?.goodForDates ?? reviewSignals?.goodForDates,
    goodForGroups: base?.goodForGroups ?? reviewSignals?.goodForGroups,
    instagramWorthy: base?.instagramWorthy ?? reviewSignals?.instagramWorthy,
    foodQualitySignal: base?.foodQualitySignal ?? reviewSignals?.foodQualitySignal,
    aestheticVibe: base?.aestheticVibe ?? reviewSignals?.aestheticVibe ?? null,
    musicAtmosphere: base?.musicAtmosphere ?? reviewSignals?.musicAtmosphere ?? null,
    avgRating: base?.avgRating ?? aggregateRating,
    reviewCount: base?.reviewCount ?? (aggregateReviewCount || null),
    priceLevel: base?.priceLevel ?? priceLevel,
    isOpenNow: typeof base?.isOpenNow === 'boolean' ? base.isOpenNow : openNow,
    hours: normalizeHours(base?.hours) ?? normalizeHours(hours),
  };
}

function toNoiseLevel(value: unknown) {
  if (typeof value === 'number') return value;
  if (value === 'quiet') return 2;
  if (value === 'moderate') return 3;
  if (value === 'lively') return 4;
  if (value === 'loud') return 4;
  return null;
}

function toOutletAvailabilityLevel(value: unknown) {
  if (typeof value === 'number') return clamp(value, 1, 4);
  if (typeof value === 'boolean') return value ? 4 : 1;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'plenty') return 4;
  if (normalized === 'some') return 3;
  if (normalized === 'few') return 2;
  if (normalized === 'none') return 1;
  return null;
}

// Normalize heterogeneous user tags into a small scoring vocabulary so
// different wording ("wi-fi", "internet", "power") contributes consistently.
function canonicalWorkTag(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (/(wifi|wi-fi|internet)/.test(normalized)) return 'Wi-Fi';
  if (/(outlet|power|plug)/.test(normalized)) return 'Outlets';
  if (/(seat|chair|table|desk|spacious)/.test(normalized)) return 'Seating';
  if (/(quiet|silent|calm)/.test(normalized)) return 'Quiet';
  if (/(study|focus|productive|deep work|work|laptop)/.test(normalized)) return 'Study';
  if (/(loud|noisy|crowded|packed|chaotic)/.test(normalized)) return 'Crowded';
  return null;
}

function mergeTagScores(base: Record<string, number>, next: Record<string, number>) {
  const merged: Record<string, number> = { ...base };
  Object.entries(next || {}).forEach(([key, value]) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return;
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return;
    merged[normalizedKey] = (merged[normalizedKey] || 0) + Math.max(0, value);
  });
  return merged;
}

// Derive productivity tag signals directly from check-in fields so places with
// sparse explicit tag votes still have meaningful evidence.
function deriveTagScoresFromCheckins(checkins: any[]): Record<string, number> {
  const scores: Record<string, number> = {};
  const add = (key: string, amount = 1) => {
    if (!key) return;
    scores[key] = (scores[key] || 0) + amount;
  };

  checkins.forEach((checkin: any) => {
    if (Array.isArray(checkin?.tags)) {
      checkin.tags.forEach((tag: unknown) => {
        const canonical = canonicalWorkTag(tag);
        if (canonical) add(canonical, 1);
      });
    }
    if (typeof checkin?.wifiSpeed === 'number') {
      if (checkin.wifiSpeed >= 4) add('Wi-Fi', 1);
      if (checkin.wifiSpeed <= 2) add('Crowded', 0.6);
    }
    const outlets = toOutletAvailabilityLevel(checkin?.outletAvailability);
    if (typeof outlets === 'number') {
      if (outlets >= 3) add('Outlets', 1);
      if (outlets <= 1.4) add('Crowded', 0.4);
    }
    const noise = toNoiseLevel(checkin?.noiseLevel);
    if (typeof noise === 'number') {
      if (noise <= 2.4) add('Quiet', 1);
      if (noise >= 4) add('Crowded', 1);
    }
    if (typeof checkin?.busyness === 'number') {
      if (checkin.busyness <= 2.4) add('Quiet', 0.6);
      if (checkin.busyness >= 4) add('Crowded', 1);
    }
    if (checkin?.laptopFriendly === true) add('Study', 1);

    if (Array.isArray(checkin?.visitIntent)) {
      checkin.visitIntent.forEach((intent: unknown) => {
        const normalizedIntent = typeof intent === 'string' ? intent.trim().toLowerCase() : '';
        if (!normalizedIntent) return;
        if (['deep_work', 'quiet_reading', 'group_study'].includes(normalizedIntent)) add('Study', 1);
        if (['deep_work', 'quiet_reading'].includes(normalizedIntent)) add('Quiet', 0.8);
        if (normalizedIntent === 'group_study') add('Seating', 0.7);
        if (['hangout_friends', 'quick_pickup'].includes(normalizedIntent)) add('Crowded', 0.3);
      });
    }
  });

  return scores;
}

// Convert raw tag frequencies into dampened strengths to avoid overreacting to
// a few repeated tags while preserving directional signal.
function computeWorkTagSignal(tagScores: Record<string, number>): WorkTagSignal {
  let positive = 0;
  let negative = 0;
  Object.entries(tagScores || {}).forEach(([rawTag, rawCount]) => {
    if (typeof rawCount !== 'number' || !Number.isFinite(rawCount) || rawCount <= 0) return;
    const tag = rawTag.trim().toLowerCase();
    if (!tag) return;
    if (POSITIVE_WORK_TAG_TOKENS.some((token) => tag.includes(token))) positive += rawCount;
    if (NEGATIVE_WORK_TAG_TOKENS.some((token) => tag.includes(token))) negative += rawCount;
  });
  return {
    positiveStrength: Math.sqrt(Math.max(0, positive)),
    negativeStrength: Math.sqrt(Math.max(0, negative)),
  };
}

function computeWorkIntentSignal(checkins: any[]): WorkIntentSignal {
  let positive = 0;
  let negative = 0;
  checkins.forEach((checkin: any) => {
    if (!Array.isArray(checkin?.visitIntent)) return;
    checkin.visitIntent.forEach((intent: unknown) => {
      const normalized = typeof intent === 'string' ? intent.trim().toLowerCase() : '';
      if (!normalized) return;
      if (['deep_work', 'quiet_reading', 'group_study'].includes(normalized)) positive += 1;
      if (['hangout_friends', 'quick_pickup', 'date_night'].includes(normalized)) negative += 0.5;
    });
  });
  return { positive, negative };
}

// Prior score encodes venue/category/external priors so workScore remains
// realistic when direct check-in metrics are missing or noisy.
function computePriorWorkScore(input: {
  typeText: string;
  workFriendlyType: boolean;
  mixedUseType: boolean;
  outdoorOnlyType: boolean;
  noSeatingHardStop: boolean;
  openNow?: boolean;
  inferred?: BuildIntelligenceInput['inferred'];
  externalRatingAvg: number | null;
  externalSignalMeta: ExternalSignalMeta;
  tagScores: Record<string, number>;
  checkins: any[];
}): number {
  if (input.noSeatingHardStop) return 0;

  let prior =
    input.workFriendlyType ? 62 :
      input.mixedUseType ? 50 :
        input.outdoorOnlyType ? 26 :
          44;

  if (/bar|night_club|casino/.test(input.typeText)) prior -= 14;
  if (/library|cowork|study|workspace|bookstore/.test(input.typeText)) prior += 6;
  if (/coffee|cafe|espresso|roastery|tea/.test(input.typeText)) prior += 4;
  if (/hotel|airport|station/.test(input.typeText)) prior -= 3;
  prior += getKnownWorkSpotBoost(input.typeText) * 0.9;

  if (typeof input.externalRatingAvg === 'number') {
    const ratingDelta = clamp((input.externalRatingAvg - 3.8) * 12, -12, 14);
    const trustFactor = 0.55 + input.externalSignalMeta.trustScore * 0.45;
    prior += ratingDelta * trustFactor;
  }

  const inferredNoise = toNoiseLevel(input.inferred?.noise ?? null);
  if (input.inferred?.goodForStudying === true) prior += 6;
  if (input.inferred?.hasWifi === true) prior += 3;
  if (inferredNoise !== null) {
    if (inferredNoise <= 2.2) prior += 4;
    else if (inferredNoise >= 4) prior -= 5;
  }

  const tagSignal = computeWorkTagSignal(input.tagScores);
  prior += clamp(tagSignal.positiveStrength * 1.8 - tagSignal.negativeStrength * 2.2, -12, 12);

  const intentSignal = computeWorkIntentSignal(input.checkins);
  prior += clamp(intentSignal.positive * 1.2 - intentSignal.negative * 1.5, -8, 8);

  if (input.openNow === true) prior += 1;
  else if (input.openNow === false) prior -= 2;

  return clamp(round(prior, 2), 8, 92);
}

// Blend weight increases as on-site evidence quality improves; low evidence
// leans toward prior to prevent unrealistic low/high scores.
function computeEvidenceWeight(input: {
  sampleSize: number;
  observedSignalCount: number;
  reliabilityScore: number;
  externalTrustScore: number;
}) {
  if (input.observedSignalCount <= 0) return 0.12;
  const sampleNorm = clamp(Math.log10(1 + input.sampleSize) / 1.3, 0, 1);
  const signalNorm = clamp(input.observedSignalCount / 6, 0, 1);
  const reliabilityNorm = clamp(input.reliabilityScore, 0, 1);
  const externalNorm = clamp(input.externalTrustScore, 0, 1);

  return clamp(
    0.12 +
      sampleNorm * 0.38 +
      signalNorm * 0.25 +
      reliabilityNorm * 0.2 +
      externalNorm * 0.05,
    0.2,
    0.9
  );
}

// Add a calibrated "holistic fit" term so sparse but high-quality evidence
// (trusted external ratings + work-friendly signals) can lift clearly good spots.
function computeHolisticWorkFitBoost(input: {
  workFriendlyType: boolean;
  externalRatingAvg: number | null;
  externalSignalMeta: ExternalSignalMeta;
  wifiAvg: number | null;
  outletAvg: number | null;
  laptopPct: number | null;
  drinkQualityAvg: number | null;
  inferred?: BuildIntelligenceInput['inferred'];
  tagScores: Record<string, number>;
}) {
  let boost = 0;

  if (typeof input.externalRatingAvg === 'number') {
    const reviewDepth = clamp(Math.log10(1 + input.externalSignalMeta.totalReviewCount) / 3.4, 0, 1);
    const ratingLift = clamp((input.externalRatingAvg - 3.8) * (5.5 + reviewDepth * 3.5), -8, 11);
    const trustFactor = 0.45 + input.externalSignalMeta.trustScore * 0.55;
    boost += ratingLift * trustFactor;
  }

  if (input.workFriendlyType) boost += 2.5;
  if ((input.wifiAvg || 0) >= 3.6) boost += 2;
  if ((input.outletAvg || 0) >= 2.8) boost += 2;
  if ((input.laptopPct || 0) >= 60) boost += 2;
  if (typeof input.drinkQualityAvg === 'number') {
    boost += clamp((input.drinkQualityAvg - 3) * 1.4, -2, 3);
  }

  if (input.inferred?.goodForStudying === true) boost += 2.2;
  if (input.inferred?.hasWifi === true) boost += 1.2;
  if (typeof input.inferred?.foodQualitySignal === 'number') {
    boost += clamp((input.inferred.foodQualitySignal - 0.5) * 3.2, -1.2, 2.2);
  }

  const tagSignal = computeWorkTagSignal(input.tagScores);
  boost += clamp(tagSignal.positiveStrength * 0.75 - tagSignal.negativeStrength * 1.05, -4, 4);

  return clamp(round(boost, 2), -12, 18);
}

function bucketHour(hour: number): 'morning' | 'afternoon' | 'evening' | 'late' {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'late';
}

function parsePriceLevel(value?: string) {
  if (!value) return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  return normalized;
}

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

function getPlaceSignalEndpoint() {
  const extra = getExpoExtra();
  const explicit =
    (process.env.EXPO_PUBLIC_PLACE_INTEL_ENDPOINT as string) ||
    (process.env.PLACE_INTEL_ENDPOINT as string) ||
    (extra?.PLACE_INTEL_ENDPOINT as string) ||
    ((global as any)?.PLACE_INTEL_ENDPOINT as string) ||
    '';
  if (explicit) return explicit;
  const projectId = getFunctionsProjectId();
  if (!projectId) return '';
  const region = getFunctionsRegion();
  return `https://${region}-${projectId}.cloudfunctions.net/placeSignalsProxy`;
}

function readBoolFlag(value: unknown) {
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function isIntelTelemetryEnabled() {
  const extra = getExpoExtra();
  const raw =
    (process.env.EXPO_PUBLIC_PLACE_INTEL_TELEMETRY as string) ||
    (process.env.PLACE_INTEL_TELEMETRY as string) ||
    (extra?.PLACE_INTEL_TELEMETRY as string) ||
    ((global as any)?.PLACE_INTEL_TELEMETRY as string) ||
    '';
  return readBoolFlag(raw);
}

function isWeatherSignalEnabled() {
  const extra = getExpoExtra();
  const raw =
    (process.env.EXPO_PUBLIC_PLACE_INTEL_ENABLE_WEATHER as string) ||
    (process.env.PLACE_INTEL_ENABLE_WEATHER as string) ||
    (extra?.PLACE_INTEL_ENABLE_WEATHER as string) ||
    ((global as any)?.PLACE_INTEL_ENABLE_WEATHER as string) ||
    '';
  return readBoolFlag(raw);
}

function stableHash(text: string) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function buildInputCacheKey(input: BuildIntelligenceInput) {
  const checkins = Array.isArray(input.checkins) ? input.checkins : [];
  const checkinSignature = stableHash(
    checkins
      .map((checkin: any) => {
        const createdAt = toMillis(checkin?.createdAt) || toMillis(checkin?.timestamp) || 0;
        const tags = Array.isArray(checkin?.tags) ? checkin.tags.join(',') : '';
        const intents = Array.isArray(checkin?.visitIntent) ? checkin.visitIntent.join(',') : '';
        return [
          createdAt,
          checkin?.wifiSpeed ?? '',
          checkin?.busyness ?? '',
          toNoiseLevel(checkin?.noiseLevel) ?? '',
          checkin?.laptopFriendly === true ? '1' : checkin?.laptopFriendly === false ? '0' : '',
          checkin?.outletAvailability ?? '',
          tags,
          intents,
        ].join(':');
      })
      .join('|')
  );
  const tagSignature = stableHash(
    Object.entries(input.tagScores || {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}:${round(Number(value) || 0, 2)}`)
      .join('|')
  );
  const inferredSignature = stableHash(JSON.stringify({
    noise: input.inferred?.noise ?? null,
    noiseConfidence: input.inferred?.noiseConfidence ?? null,
    hasWifi: input.inferred?.hasWifi ?? null,
    wifiConfidence: input.inferred?.wifiConfidence ?? null,
    goodForStudying: input.inferred?.goodForStudying ?? null,
    goodForMeetings: input.inferred?.goodForMeetings ?? null,
    avgRating: input.inferred?.avgRating ?? null,
    reviewCount: input.inferred?.reviewCount ?? null,
    priceLevel: input.inferred?.priceLevel ?? null,
    isOpenNow: input.inferred?.isOpenNow ?? null,
  }));
  const typeSignature = uniqStrings(input.types || []).sort().join(',');
  const openSignature = input.openNow === true ? '1' : input.openNow === false ? '0' : 'u';
  return [
    input.placeId || '',
    input.placeName || '',
    input.location?.lat?.toFixed(3) || '',
    input.location?.lng?.toFixed(3) || '',
    typeSignature,
    openSignature,
    checkins.length,
    checkinSignature,
    tagSignature,
    inferredSignature,
  ].join(':');
}

async function getGooglePlaceSnapshot(placeId?: string | null): Promise<GooglePlaceSignalSnapshot | null> {
  if (!placeId) return null;
  const details = await getPlaceDetails(placeId);
  if (!details) return null;
  return {
    rating: typeof details.rating === 'number' ? details.rating : undefined,
    reviewCount: typeof details.ratingCount === 'number' ? details.ratingCount : undefined,
    priceLevel: typeof details.priceLevel === 'string' ? details.priceLevel : undefined,
    openNow: typeof details.openNow === 'boolean' ? details.openNow : undefined,
    types: Array.isArray(details.types) ? details.types : undefined,
    reviews: Array.isArray(details.reviews) ? details.reviews : undefined,
    hours: normalizeHours(details.hours),
  };
}

async function getReviewNlpSignals(
  input: BuildIntelligenceInput,
  reviews: GooglePlaceReview[],
): Promise<ReviewNLPResult | null> {
  if (!input.placeId || !input.placeName || !Array.isArray(reviews) || reviews.length === 0) return null;
  const reviewKey = stableHash(
    reviews
      .slice(0, 10)
      .map((review) => `${review.time}:${review.rating}:${review.text.slice(0, 120)}`)
      .join('|')
  );
  const cacheKey = `${input.placeId}:${reviewKey}`;
  const cached = getFreshCacheEntry(reviewNlpCache, cacheKey, REVIEW_NLP_TTL_MS);
  if (cached) {
    return cached.payload;
  }

  return withInflight(reviewNlpInflight, cacheKey, async () => {
    let payload: ReviewNLPResult | null = null;

    try {
      const { ensureFirebase } = await import('./firebaseClient');
      const fb = ensureFirebase();
      const callable = (fb as any)?.app?.()?.functions?.(getFunctionsRegion())?.httpsCallable?.('analyzeSpotReviews');
      if (callable) {
        const response = await callable({
          placeId: input.placeId,
          placeName: input.placeName,
          reviewTexts: reviews.slice(0, 10).map((review) => review.text),
        });
        payload = normalizeReviewNlpResult(response?.data);
      }
    } catch {}

    if (!payload) {
      try {
        payload = await analyzeReviews(reviews.slice(0, 10), input.placeName);
      } catch {
        payload = null;
      }
    }

    setBoundedMapEntry(reviewNlpCache, cacheKey, { ts: Date.now(), payload }, REVIEW_NLP_CACHE_MAX);
    return payload;
  });
}

function classifyWeatherCondition(code: number, precipitationMm: number): ContextSignal['condition'] {
  if (!Number.isFinite(code)) return 'unknown';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if (precipitationMm > 0 || [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([0, 1].includes(code)) return 'clear';
  if ([2, 3, 45, 48].includes(code)) return 'cloudy';
  return 'unknown';
}

function toWeatherImpact(condition: ContextSignal['condition']): ContextSignal['impact'] {
  if (condition === 'rain' || condition === 'snow') return 'increase_crowd';
  if (condition === 'clear') return 'decrease_crowd';
  return 'neutral';
}

function deriveWeatherConfidence(code: number, precipitationMm: number): number {
  const condition = classifyWeatherCondition(code, precipitationMm);
  if (condition === 'rain') return precipitationMm >= 2 ? 0.85 : 0.65;
  if (condition === 'snow') return 0.78;
  if (condition === 'clear') return 0.4;
  if (condition === 'cloudy') return 0.55;
  return 0.5;
}

function withInflight<T>(map: Map<string, Promise<T>>, key: string, fn: () => Promise<T>) {
  const current = map.get(key);
  if (current) return current;
  const next = fn().finally(() => map.delete(key));
  map.set(key, next);
  return next;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 3200) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = setTimeout(() => controller?.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller?.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeExternalSignals(value: unknown): ExternalPlaceSignal[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: any) => {
      if (!item || (item.source !== 'google' && item.source !== 'yelp' && item.source !== 'foursquare')) return null;
      const rawRating = typeof item.rating === 'number' ? item.rating : undefined;
      const normalizedRating =
        item.source === 'foursquare' && typeof rawRating === 'number' && rawRating > 5
          ? rawRating / 2
          : rawRating;
      return {
        source: item.source as ExternalSource,
        rating: normalizedRating,
        reviewCount: typeof item.reviewCount === 'number' ? item.reviewCount : undefined,
        priceLevel: parsePriceLevel(typeof item.priceLevel === 'string' ? item.priceLevel : undefined),
        categories: Array.isArray(item.categories)
          ? item.categories.filter((c: any) => typeof c === 'string' && c.trim().length > 0)
          : undefined,
      } as ExternalPlaceSignal;
    })
    .filter(Boolean) as ExternalPlaceSignal[];
}

function normalizeProviderPhotos(value: unknown): ExternalPlacePhoto[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item: any) => {
      if (!item || (item.source !== 'yelp' && item.source !== 'foursquare')) return null;
      const url = typeof item.url === 'string' ? item.url.trim() : '';
      if (!url.startsWith('https://')) return null;
      return {
        source: item.source as ExternalPlacePhoto['source'],
        url,
      } satisfies ExternalPlacePhoto;
    })
    .filter(Boolean) as ExternalPlacePhoto[];
}

async function getProxySignals(input: BuildIntelligenceInput): Promise<ProxyPlacePayload> {
  if (!input.placeName || !input.location) {
    return {
      externalSignals: [],
      googleSnapshot: null,
      providerPhotos: [],
      dataAvailability: {
        status: 'unavailable',
        reason: 'missing_location',
        authMode: 'none',
        degradedProviders: [],
      },
    };
  }
  const endpoint = getPlaceSignalEndpoint();
  if (!endpoint) {
    return {
      externalSignals: [],
      googleSnapshot: null,
      providerPhotos: [],
      dataAvailability: {
        status: 'unavailable',
        reason: 'missing_endpoint',
        authMode: 'none',
        degradedProviders: [],
      },
    };
  }
  const cacheKey = `${input.placeId || ''}:${input.placeName}:${input.location.lat.toFixed(3)}:${input.location.lng.toFixed(3)}`;
  const cached = getFreshCacheEntry(proxySignalCache, cacheKey, INTELLIGENCE_TTL_MS);
  if (cached) {
    return cached.payload;
  }
  return withInflight(proxyInflight, cacheKey, async () => {
    const payload = await fetchProviderProxyJson<{
      externalSignals?: unknown[];
      googleSnapshot?: unknown;
      providerPhotos?: unknown[];
      degradedProviders?: unknown[];
    }>(
      endpoint,
      {
        placeName: input.placeName,
        placeId: input.placeId || undefined,
        location: input.location,
      },
      { action: 'place_signals', timeoutMs: 2400 },
    );
    const degradedProviders = Array.isArray(payload.data?.degradedProviders)
      ? payload.data?.degradedProviders.filter(
        (item): item is ExternalSource =>
          item === 'google' || item === 'yelp' || item === 'foursquare',
      )
      : [];
    const next: ProxyPlacePayload = {
      externalSignals: normalizeExternalSignals(payload.data?.externalSignals),
      googleSnapshot: normalizeGoogleProxySnapshot(payload.data?.googleSnapshot),
      providerPhotos: normalizeProviderPhotos(payload.data?.providerPhotos),
      dataAvailability: {
        status: payload.meta.ok
          ? degradedProviders.length
            ? 'degraded'
            : 'full'
          : 'unavailable',
        reason: payload.meta.ok
          ? degradedProviders.length
            ? 'provider_partial'
            : undefined
          : payload.meta.errorCode,
        authMode: payload.meta.authMode,
        degradedProviders,
      },
    };
    setBoundedMapEntry(proxySignalCache, cacheKey, { ts: Date.now(), payload: next }, PROXY_SIGNAL_CACHE_MAX);
    return next;
  });
}

async function getWeatherSignals(input: BuildIntelligenceInput): Promise<ContextSignal[]> {
  if (!isWeatherSignalEnabled()) return [];
  if (!input.location) return [];
  const lat = input.location.lat;
  const lng = input.location.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];

  const cacheKey = `weather:${lat.toFixed(2)}:${lng.toFixed(2)}`;
  const cached = getFreshCacheEntry(weatherSignalCache, cacheKey, WEATHER_TTL_MS);
  if (cached) {
    return cached.payload;
  }

  return withInflight(weatherInflight, cacheKey, async () => {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lng),
      current: 'temperature_2m,precipitation,weather_code',
      timezone: 'auto',
    });
    const url = `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
    const payload = await fetchWithTimeout(url, { method: 'GET', headers: { Accept: 'application/json' } }, 1800);

    const current = (payload as any)?.current || null;
    const code = typeof current?.weather_code === 'number' ? current.weather_code : NaN;
    const precipitation = typeof current?.precipitation === 'number' ? current.precipitation : 0;
    const temperature = typeof current?.temperature_2m === 'number' ? current.temperature_2m : undefined;
    const condition = classifyWeatherCondition(code, precipitation);
    const impact = toWeatherImpact(condition);
    if (condition === 'unknown') {
      setBoundedMapEntry(weatherSignalCache, cacheKey, { ts: Date.now(), payload: [] }, WEATHER_SIGNAL_CACHE_MAX);
      return [];
    }

    const next: ContextSignal[] = [{
      source: 'weather',
      condition,
      impact,
      confidence: deriveWeatherConfidence(code, precipitation),
      temperatureC: temperature,
      precipitationMm: precipitation,
    }];
    setBoundedMapEntry(weatherSignalCache, cacheKey, { ts: Date.now(), payload: next }, WEATHER_SIGNAL_CACHE_MAX);
    return next;
  });
}

function deriveCrowdLevel(avgBusyness: number | null): PlaceIntelligence['crowdLevel'] {
  if (avgBusyness === null) return 'unknown';
  if (avgBusyness <= 2.1) return 'low';
  if (avgBusyness >= 3.8) return 'high';
  return 'moderate';
}

function to12HourLabel(hour: number) {
  const meridiem = hour >= 12 ? 'PM' : 'AM';
  const normalized = hour % 12 || 12;
  return `${normalized}${meridiem}`;
}

function toForecastLevel(score: number): CrowdForecastPoint['level'] {
  if (score <= 0.34) return 'low';
  if (score >= 0.67) return 'high';
  return 'moderate';
}

function buildCrowdForecast(checkins: any[], baseConfidence: number): CrowdForecastPoint[] {
  const now = new Date();
  const currentHour = now.getHours();

  const hourlyCounts = new Array<number>(24).fill(0);
  const hourlyBusynessSums = new Array<number>(24).fill(0);
  const hourlyBusynessCounts = new Array<number>(24).fill(0);

  checkins.forEach((c: any) => {
    const ms = toMillis(c?.createdAt);
    if (!ms) return;
    const hour = new Date(ms).getHours();
    hourlyCounts[hour] += 1;
    if (typeof c?.busyness === 'number') {
      hourlyBusynessSums[hour] += c.busyness;
      hourlyBusynessCounts[hour] += 1;
    }
  });

  const maxCount = Math.max(1, ...hourlyCounts);
  const globalBusyness =
    avg(
      hourlyBusynessSums.map((sum, hour) => {
        const count = hourlyBusynessCounts[hour];
        return count ? sum / count : null;
      }).filter((v): v is number => typeof v === 'number')
    ) || 3;

  const points: CrowdForecastPoint[] = [];
  for (let offset = 0; offset < 6; offset += 1) {
    const hour = (currentHour + offset) % 24;
    const countNorm = clamp(hourlyCounts[hour] / maxCount, 0, 1);
    const hasHourlyBusyness = hourlyBusynessCounts[hour] > 0;
    const busyAvg = hasHourlyBusyness
      ? hourlyBusynessSums[hour] / hourlyBusynessCounts[hour]
      : globalBusyness;
    const busyNorm = clamp(busyAvg / 5, 0, 1);
    // Sample volume should strengthen confidence, not override explicit low/high
    // busyness ratings for the hour itself.
    const score = hasHourlyBusyness
      ? busyNorm
      : clamp(0.45 * countNorm + 0.55 * busyNorm, 0, 1);
    const localConfidence = clamp(baseConfidence * 0.6 + countNorm * 0.4, 0.1, 0.95);

    points.push({
      offsetHours: offset,
      label: offset === 0 ? 'Now' : `+${offset}h`,
      localHourLabel: to12HourLabel(hour),
      level: toForecastLevel(score),
      score: Number(score.toFixed(2)),
      confidence: Number(localConfidence.toFixed(2)),
    });
  }

  return points;
}

function buildExternalSignalMeta(externalSignals: ExternalPlaceSignal[]): ExternalSignalMeta {
  const providerCount = new Set(externalSignals.map((signal) => signal.source)).size;
  const providerDiversity = clamp(providerCount / EXTERNAL_PROVIDER_COUNT, 0, 1);
  const ratings = externalSignals
    .map((signal) => signal.rating)
    .filter((value): value is number => typeof value === 'number');
  const totalReviewCount = externalSignals
    .map((signal) => (typeof signal.reviewCount === 'number' ? signal.reviewCount : 0))
    .reduce((sum, count) => sum + count, 0);

  let ratingConsensus = 0;
  if (ratings.length === 1) {
    ratingConsensus = 0.6;
  } else if (ratings.length >= 2) {
    const spread = Math.max(...ratings) - Math.min(...ratings);
    ratingConsensus = clamp(1 - spread / 2.5, 0, 1);
  }

  const reviewSupportNorm = clamp(Math.log10(1 + totalReviewCount) / 3.2, 0, 1);
  const trustScore = round(
    clamp(providerDiversity * 0.45 + ratingConsensus * 0.35 + reviewSupportNorm * 0.2, 0, 1),
    2
  );

  return {
    providerCount,
    providerDiversity: round(providerDiversity, 2),
    totalReviewCount,
    ratingConsensus: round(ratingConsensus, 2),
    trustScore,
  };
}

function computeReliability(input: {
  sampleSize: number;
  wifiValues: number[];
  busynessValues: number[];
  noiseValues: number[];
  laptopVotes: boolean[];
  externalSignalMeta: ExternalSignalMeta;
}): IntelligenceReliability {
  const { sampleSize, wifiValues, busynessValues, noiseValues, laptopVotes, externalSignalMeta } = input;
  if (sampleSize <= 0) {
    return {
      sampleSize: 0,
      dataCoverage: 0,
      variancePenalty: 1,
      score: 0.1,
    };
  }

  const observedSignals =
    wifiValues.length +
    busynessValues.length +
    noiseValues.length +
    laptopVotes.length;
  const totalPossibleSignals = sampleSize * 4;
  const dataCoverage = clamp(observedSignals / Math.max(1, totalPossibleSignals), 0, 1);

  const wifiVarianceNorm = clamp(stddev(wifiValues) / 2, 0, 1);
  const busynessVarianceNorm = clamp(stddev(busynessValues) / 2, 0, 1);
  const noiseVarianceNorm = clamp(stddev(noiseValues) / 2, 0, 1);

  const laptopTrueRate = laptopVotes.length
    ? laptopVotes.filter(Boolean).length / laptopVotes.length
    : 0.5;
  // Bernoulli variance normalized to [0..1], peaks at p=0.5 (most uncertain).
  const laptopVarianceNorm = laptopVotes.length
    ? clamp(4 * laptopTrueRate * (1 - laptopTrueRate), 0, 1)
    : 1;

  const variancePenalty = round(
    (wifiVarianceNorm + busynessVarianceNorm + noiseVarianceNorm + laptopVarianceNorm) / 4,
    2
  );

  const sampleScore = clamp(Math.log10(1 + sampleSize) / 2, 0, 1);
  const externalSupport = round(externalSignalMeta.trustScore * 0.12, 2);
  const score = round(
    clamp(
      sampleScore * 0.55 +
      dataCoverage * 0.3 +
      (1 - variancePenalty) * 0.15 +
      externalSupport,
      0.05,
      0.98
    ),
    2
  );

  return {
    sampleSize,
    dataCoverage: round(dataCoverage, 2),
    variancePenalty,
    score,
  };
}

function filterWindow(checkins: any[], startMs: number, endMs: number): any[] {
  return checkins.filter((c: any) => {
    const ms = toMillis(c?.createdAt);
    return typeof ms === 'number' && ms >= startMs && ms < endMs;
  });
}

function avgLaptopPct(checkins: any[]) {
  const votes = checkins
    .map((c: any) => c?.laptopFriendly)
    .filter((v: any) => typeof v === 'boolean') as boolean[];
  if (!votes.length) return null;
  return (votes.filter(Boolean).length / votes.length) * 100;
}

function avgNoise(checkins: any[]) {
  return avg(checkins.map((c: any) => toNoiseLevel(c?.noiseLevel)).filter((v: any) => typeof v === 'number'));
}

function avgBusyness(checkins: any[]) {
  return avg(checkins.map((c: any) => c?.busyness).filter((v: any) => typeof v === 'number'));
}

function avgWifi(checkins: any[]) {
  return avg(checkins.map((c: any) => c?.wifiSpeed).filter((v: any) => typeof v === 'number'));
}

function computeMomentum(checkins: any[]): IntelligenceMomentum {
  if (checkins.length < 6) {
    return {
      trend: 'insufficient_data',
      deltaWorkScore: 0,
      wifiDelta: 0,
      busynessDelta: 0,
      noiseDelta: 0,
      laptopDelta: 0,
    };
  }

  const now = Date.now();
  const windowMs = MOMENTUM_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  const recentStart = now - windowMs;
  const previousStart = now - windowMs * 2;
  const recent = filterWindow(checkins, recentStart, now);
  const previous = filterWindow(checkins, previousStart, recentStart);

  if (recent.length < 3 || previous.length < 3) {
    return {
      trend: 'insufficient_data',
      deltaWorkScore: 0,
      wifiDelta: 0,
      busynessDelta: 0,
      noiseDelta: 0,
      laptopDelta: 0,
    };
  }

  const recentWifi = avgWifi(recent);
  const previousWifi = avgWifi(previous);
  const recentBusyness = avgBusyness(recent);
  const previousBusyness = avgBusyness(previous);
  const recentNoise = avgNoise(recent);
  const previousNoise = avgNoise(previous);
  const recentLaptop = avgLaptopPct(recent);
  const previousLaptop = avgLaptopPct(previous);

  const wifiDelta = round((recentWifi ?? 0) - (previousWifi ?? 0), 2);
  const busynessDelta = round((recentBusyness ?? 0) - (previousBusyness ?? 0), 2);
  const noiseDelta = round((recentNoise ?? 0) - (previousNoise ?? 0), 2);
  const laptopDelta = round((recentLaptop ?? 0) - (previousLaptop ?? 0), 2);

  const deltaWorkScore = clamp(
    Math.round(
      wifiDelta * 8 +
      laptopDelta * 0.15 +
      (-noiseDelta) * 6 +
      (-busynessDelta) * 5
    ),
    -20,
    20
  );

  let trend: IntelligenceMomentum['trend'] = 'stable';
  if (Math.abs(deltaWorkScore) < 4) {
    trend = 'stable';
  } else if (deltaWorkScore > 0) {
    trend = 'improving';
  } else {
    trend = 'declining';
  }

  return {
    trend,
    deltaWorkScore,
    wifiDelta,
    busynessDelta,
    noiseDelta,
    laptopDelta,
  };
}

async function emitIntelligenceTelemetry(
  cacheKey: string,
  input: BuildIntelligenceInput,
  payload: PlaceIntelligence,
  checkins: any[]
) {
  if (!isIntelTelemetryEnabled()) return;

  const sampled = (stableHash(cacheKey) % 1000) / 1000 < INTEL_TELEMETRY_SAMPLE_RATE;
  if (!sampled) return;

  const placeKey = input.placeId || input.placeName || cacheKey;
  const lastWrite = telemetryThrottle.get(placeKey) || 0;
  if (Date.now() - lastWrite < INTEL_TELEMETRY_THROTTLE_MS) return;

  setBoundedMapEntry(telemetryThrottle, placeKey, Date.now(), TELEMETRY_THROTTLE_MAX);

  try {
    const { ensureFirebase } = await import('./firebaseClient');
    const fb = ensureFirebase();
    const db = fb?.firestore?.();
    if (!db) return;

    const user = fb?.auth?.()?.currentUser || null;
    const createdAt = fb?.firestore?.FieldValue?.serverTimestamp
      ? fb.firestore.FieldValue.serverTimestamp()
      : Date.now();

    await db.collection('intelligencePredictions').add({
      modelVersion: payload.modelVersion,
      generatedAt: payload.generatedAt,
      createdAt,
      placeId: input.placeId || null,
      placeName: input.placeName || '',
      location: input.location || null,
      workScore: payload.workScore,
      confidence: payload.confidence,
      reliability: payload.reliability,
      momentum: payload.momentum,
      externalSources: payload.externalSignals.map((s) => s.source),
      externalSignalCount: payload.externalSignals.length,
      externalProviderCount: payload.externalSignalMeta.providerCount,
      externalTotalReviewCount: payload.externalSignalMeta.totalReviewCount,
      externalRatingConsensus: payload.externalSignalMeta.ratingConsensus,
      externalTrustScore: payload.externalSignalMeta.trustScore,
      checkinCount: checkins.length,
      crowdLevel: payload.crowdLevel,
      bestTime: payload.bestTime,
      userId: user?.uid || null,
    });
  } catch {
    // Telemetry should never block intelligence generation.
  }
}

function deriveUseCases(input: {
  workScore: number;
  crowdLevel: PlaceIntelligence['crowdLevel'];
  bestTime: PlaceIntelligence['bestTime'];
  openNow?: boolean;
  externalSignals: ExternalPlaceSignal[];
  wifiAvg: number | null;
  laptopPct: number | null;
}) {
  const next: string[] = [];

  if (input.workScore >= 78) {
    next.push('Deep work');
  }
  if ((input.wifiAvg || 0) >= 3.8 && (input.laptopPct || 0) >= 60) {
    next.push('Laptop sessions');
  }
  if (input.crowdLevel === 'moderate') {
    next.push('Group study');
  }
  if (input.crowdLevel === 'high') {
    next.push('Social energy');
  }
  const avgExternal = avg(
    input.externalSignals
      .map((s) => s.rating)
      .filter((v): v is number => typeof v === 'number')
  );
  if ((avgExternal || 0) >= 4.2) {
    next.push('Coffee meetups');
  }
  if (input.bestTime === 'late' || input.openNow === true) {
    next.push('Late sessions');
  }
  if (!next.length) {
    next.push('Quick focus stop');
  }

  return Array.from(new Set(next)).slice(0, 3);
}

async function buildPlaceIntelligenceCore(input: BuildIntelligenceInput): Promise<PlaceIntelligence> {
  const cacheKey = buildInputCacheKey(input);
  const cached = getFreshCacheEntry(intelligenceCache, cacheKey, INTELLIGENCE_TTL_MS);
  if (cached) return cached.payload;

  const checkins = Array.isArray(input.checkins) ? input.checkins : [];
  // Combine explicit aggregate votes with inferred votes from check-ins to avoid
  // losing tag intent in views that do not pre-aggregate tagScores.
  const inferredTagScores = deriveTagScoresFromCheckins(checkins);
  const tagScores = mergeTagScores(inferredTagScores, input.tagScores || {});
  const [proxyPayload, contextSignals] = await Promise.all([
    getProxySignals(input),
    getWeatherSignals(input),
  ]);
  const googleSnapshot = proxyPayload.googleSnapshot ?? await getGooglePlaceSnapshot(input.placeId);
  const externalSignals = [
    buildGoogleExternalSignal(googleSnapshot),
    ...proxyPayload.externalSignals,
  ].filter(Boolean) as ExternalPlaceSignal[];
  const externalSignalMeta = buildExternalSignalMeta(externalSignals);
  const aggregateRating =
    computeAggregateRating(externalSignals) ??
    (typeof input.inferred?.avgRating === 'number' ? round(input.inferred.avgRating, 2) : null);
  const aggregateReviewCount = Math.max(
    externalSignalMeta.totalReviewCount,
    typeof input.inferred?.reviewCount === 'number' ? Math.max(0, input.inferred.reviewCount) : 0,
  );
  const resolvedOpenStatus = resolveOpenStatus(input, googleSnapshot);
  const priceLevel = resolvePriceLevel(input, googleSnapshot, externalSignals);
  const reviewSignals = await getReviewNlpSignals(input, googleSnapshot?.reviews || []);
  const inf = mergeInferredSignals(
    input.inferred,
    reviewSignals,
    aggregateRating,
    aggregateReviewCount,
    priceLevel,
    resolvedOpenStatus.openNow,
    googleSnapshot?.hours,
  );
  const effectiveTypes = uniqStrings([...(input.types || []), ...(googleSnapshot?.types || [])]);

  const wifiValues = checkins.map((c: any) => c?.wifiSpeed).filter((v: any) => typeof v === 'number') as number[];
  const outletValues = checkins
    .map((c: any) => toOutletAvailabilityLevel(c?.outletAvailability))
    .filter((v: any) => typeof v === 'number') as number[];
  const busynessValues = checkins.map((c: any) => c?.busyness).filter((v: any) => typeof v === 'number') as number[];
  const noiseValues = checkins.map((c: any) => toNoiseLevel(c?.noiseLevel)).filter((v: any) => typeof v === 'number') as number[];
  const drinkQualityValues = checkins.map((c: any) => c?.drinkQuality).filter((v: any) => typeof v === 'number') as number[];
  const drinkPriceValues = checkins.map((c: any) => c?.drinkPrice).filter((v: any) => typeof v === 'number') as number[];
  const ambianceCounts: Record<string, number> = {};
  const intentCounts: Record<string, number> = {};
  const photoTagCounts: Record<string, number> = {};

  checkins.forEach((checkin: any) => {
    if (typeof checkin?.ambiance === 'string' && checkin.ambiance.trim()) {
      const key = checkin.ambiance.trim().toLowerCase();
      ambianceCounts[key] = (ambianceCounts[key] || 0) + 1;
    }
    if (Array.isArray(checkin?.visitIntent)) {
      checkin.visitIntent.forEach((intent: unknown) => {
        if (typeof intent !== 'string') return;
        const key = intent.trim();
        if (!key) return;
        intentCounts[key] = (intentCounts[key] || 0) + 1;
      });
    }
    if (Array.isArray(checkin?.photoTags)) {
      checkin.photoTags.forEach((tag: unknown) => {
        if (typeof tag !== 'string') return;
        const key = tag.trim();
        if (!key) return;
        photoTagCounts[key] = (photoTagCounts[key] || 0) + 1;
      });
    }
  });

  const dominantAmbiance = (Object.entries(ambianceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null) as
    | 'cozy'
    | 'modern'
    | 'rustic'
    | 'bright'
    | 'intimate'
    | 'energetic'
    | null;
  const topPhotoTags = Object.entries(photoTagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([key]) => key);

  let wifiAvg = avg(wifiValues);
  const outletAvg = avg(outletValues);
  let noiseAvg = avg(noiseValues);
  const laptopVotes = checkins
    .map((c: any) => c?.laptopFriendly)
    .filter((v: any) => typeof v === 'boolean') as boolean[];
  let laptopPct = laptopVotes.length
    ? (laptopVotes.filter(Boolean).length / laptopVotes.length) * 100
    : null;

  let wifiSource: ScoreFactorSource = wifiAvg !== null ? 'checkin' : 'none';
  let noiseSource: ScoreFactorSource = noiseAvg !== null ? 'checkin' : 'none';
  let laptopSource: ScoreFactorSource = laptopPct !== null ? 'checkin' : 'none';
  let usedInferred = false;

  if (inf) {
    if (wifiAvg === null && inf.hasWifi === true) {
      const conf = clamp(typeof inf.wifiConfidence === 'number' ? inf.wifiConfidence : 0.6, 0.2, 1);
      wifiAvg = clamp(2.8 + conf * 1.4, 1, 5);
      wifiSource = 'inferred';
      usedInferred = true;
    }
    if (noiseAvg === null && inf.noise) {
      const mapped = toNoiseLevel(inf.noise);
      if (mapped !== null) {
        const conf = clamp(typeof inf.noiseConfidence === 'number' ? inf.noiseConfidence : 0.6, 0.2, 1);
        noiseAvg = clamp(mapped * conf + 3 * (1 - conf), 1, 5);
        noiseSource = 'inferred';
        usedInferred = true;
      }
    }
    if (laptopPct === null && inf.goodForStudying === true) {
      const confidenceBits = [
        typeof inf.wifiConfidence === 'number' ? inf.wifiConfidence : null,
        typeof inf.noiseConfidence === 'number' ? inf.noiseConfidence : null,
      ].filter((value): value is number => typeof value === 'number');
      const confidence = confidenceBits.length ? clamp(avg(confidenceBits) || 0.6, 0.35, 1) : 0.6;
      laptopPct = clamp(52 + confidence * 32, 0, 100);
      laptopSource = 'inferred';
      usedInferred = true;
    }
  }

  const busynessAvg = avg(busynessValues);

  const hourBuckets = { morning: 0, afternoon: 0, evening: 0, late: 0 } as Record<
    'morning' | 'afternoon' | 'evening' | 'late',
    number
  >;
  checkins.forEach((c: any) => {
    const ms = toMillis(c?.createdAt);
    if (!ms) return;
    const bucket = bucketHour(new Date(ms).getHours());
    hourBuckets[bucket] += 1;
  });
  const rankedTimes = Object.entries(hourBuckets).sort((a, b) => b[1] - a[1]);
  const bestTime = rankedTimes[0]?.[1] ? (rankedTimes[0][0] as PlaceIntelligence['bestTime']) : 'anytime';
  const weatherSignal = contextSignals.find((s) => s.source === 'weather') || null;
  const weatherCrowdDelta =
    weatherSignal?.impact === 'increase_crowd' ? 0.35 :
      weatherSignal?.impact === 'decrease_crowd' ? -0.2 :
        0;
  const adjustedBusynessAvg = busynessAvg === null
    ? null
    : clamp(busynessAvg + weatherCrowdDelta, 1, 5);
  const reliability = computeReliability({
    sampleSize: checkins.length,
    wifiValues,
    busynessValues,
    noiseValues,
    laptopVotes,
    externalSignalMeta,
  });
  const momentum = computeMomentum(checkins);

  const tagBoost =
    (tagScores['Wi-Fi'] || 0) * 1.4 +
    (tagScores['Outlets'] || 0) * 1.2 +
    (tagScores['Seating'] || 0) * 1 +
    (tagScores['Quiet'] || 0) * 1.1 +
    (tagScores['Study'] || 0) * 1.35 -
    (tagScores['Crowded'] || 0) * 0.9;
  const typeText = `${input.placeName || ''} ${effectiveTypes.join(' ')}`.toLowerCase();
  const seatingSignal = (tagScores['Seating'] || 0) + (tagScores['Outdoor Seating'] || 0) * 0.6;
  const workFriendlyType = /library|cowork|coffee|cafe|study|workspace|bookstore|espresso|roastery|tea/.test(typeText);
  const mixedUseType = /restaurant|bakery|hotel|lounge/.test(typeText);
  const outdoorOnlyType = /park|trail|playground|stadium|field|outdoor|plaza|beach/.test(typeText);
  const hasLaptopSignals = (laptopPct || 0) >= 35 || checkins.some((c: any) => c?.laptopFriendly === true);
  const hasConnectivitySignals = (wifiAvg || 0) >= 2.4 || (tagScores['Wi-Fi'] || 0) > 0 || (tagScores['Outlets'] || 0) > 0;
  const hasSeatingSignals = seatingSignal > 0 || hasLaptopSignals;
  const noSeatingHardStop = outdoorOnlyType && !hasSeatingSignals && !hasConnectivitySignals && checkins.length < 2;
  const venueBaseline = workFriendlyType ? 22 : mixedUseType ? 12 : outdoorOnlyType ? 0 : 8;
  const studyTypeBoost =
    (/library|cowork|university|study|workspace|bookstore/.test(typeText) ? 8 : 0) + getKnownWorkSpotBoost(typeText);
  const cafePenalty = /bar|night_club|casino/.test(typeText) ? 6 : 0;
  const openBoost = resolvedOpenStatus.openNow === true ? 4 : resolvedOpenStatus.openNow === false ? -4 : 0;
  const momentumBoost = momentum.trend === 'improving' ? 2 : momentum.trend === 'declining' ? -2 : 0;
  const drinkQualityAvg = avg(drinkQualityValues);
  const holisticWorkFitBoost = computeHolisticWorkFitBoost({
    workFriendlyType,
    externalRatingAvg: aggregateRating,
    externalSignalMeta,
    wifiAvg,
    outletAvg,
    laptopPct,
    drinkQualityAvg,
    inferred: inf,
    tagScores,
  });

  const score =
    venueBaseline +
    (wifiAvg || 0) * 9.5 +
    (outletAvg !== null ? (outletAvg - 1) * 6 : 0) +
    (laptopPct || 0) * 0.24 +
    (noiseAvg !== null ? (6 - noiseAvg) * 5.5 : 0) +
    (adjustedBusynessAvg !== null ? (6 - adjustedBusynessAvg) * 4.5 : 0) +
    (drinkQualityAvg !== null ? (drinkQualityAvg - 3) * 2.8 : 0) +
    Math.log10(1 + Math.max(0, tagBoost)) * 16 +
    (aggregateRating || 0) * 4.8 +
    studyTypeBoost +
    openBoost -
    cafePenalty +
    momentumBoost +
    holisticWorkFitBoost;
  // Raw model score from observed metrics.
  const modelWorkScore = clamp(Math.round(score), 0, 100);
  const observedSignalCount = [
    wifiAvg,
    outletAvg,
    noiseAvg,
    adjustedBusynessAvg,
    laptopPct,
  ].filter((value) => typeof value === 'number').length + (Object.keys(tagScores).length > 0 ? 1 : 0);
  const priorWorkScore = computePriorWorkScore({
    typeText,
    workFriendlyType,
    mixedUseType,
    outdoorOnlyType,
    noSeatingHardStop,
    openNow: resolvedOpenStatus.openNow === null ? undefined : resolvedOpenStatus.openNow,
    inferred: inf,
    externalRatingAvg: aggregateRating,
    externalSignalMeta,
    tagScores,
    checkins,
  });
  const evidenceWeight = computeEvidenceWeight({
    sampleSize: checkins.length,
    observedSignalCount,
    reliabilityScore: reliability.score,
    externalTrustScore: externalSignalMeta.trustScore,
  });
  // Final score: evidence-weighted blend of observed model and prior baseline.
  let workScore = clamp(
    Math.round(modelWorkScore * evidenceWeight + priorWorkScore * (1 - evidenceWeight)),
    0,
    100
  );
  if (noSeatingHardStop) {
    workScore = 0;
  } else if (workScore <= 0) {
    workScore = workFriendlyType ? 42 : 30;
  }
  const scoreBreakdown: ScoreBreakdown = {
    wifi: { value: round((wifiAvg || 0) * 9.5, 1), source: wifiSource },
    outlet: { value: round(outletAvg !== null ? (outletAvg - 1) * 6 : 0, 1), source: outletAvg !== null ? 'checkin' : 'none' },
    noise: { value: round(noiseAvg !== null ? (6 - noiseAvg) * 5.5 : 0, 1), source: noiseSource },
    busyness: { value: round(adjustedBusynessAvg !== null ? (6 - adjustedBusynessAvg) * 4.5 : 0, 1), source: adjustedBusynessAvg !== null ? 'checkin' : 'none' },
    laptop: { value: round((laptopPct || 0) * 0.24, 1), source: laptopSource },
    drinkQuality: { value: round(drinkQualityAvg !== null ? (drinkQualityAvg - 3) * 2.8 : 0, 1), source: drinkQualityAvg !== null ? 'checkin' : 'none' },
    tags: { value: round(Math.log10(1 + Math.max(0, tagBoost)) * 16, 1), source: Object.keys(tagScores).length > 0 ? 'checkin' : 'none' },
    externalRating: { value: round((aggregateRating || 0) * 4.8, 1), source: aggregateRating ? 'api' : 'none' },
    // Venue includes static type priors plus holistic fit so users can see why
    // known strong work spots still score well when check-in samples are sparse.
    venueType: { value: round(venueBaseline + studyTypeBoost - cafePenalty + holisticWorkFitBoost, 1) },
    openStatus: { value: round(openBoost, 1) },
    momentum: { value: round(momentumBoost, 1) },
  };

  const topOutletAvailability =
    outletAvg === null
      ? null
      : outletAvg >= 3.6
        ? 'plenty'
        : outletAvg >= 2.6
          ? 'some'
          : outletAvg >= 1.6
            ? 'few'
            : 'none';
  const vibeScores = computeVibeScores({
    avgNoiseLevel: noiseAvg,
    avgBusyness: adjustedBusynessAvg ?? busynessAvg,
    avgWifiSpeed: wifiAvg,
    avgDrinkQuality: drinkQualityAvg,
    avgDrinkPrice: avg(drinkPriceValues),
    topOutletAvailability,
    laptopFriendlyPct: laptopPct,
    ambiance: dominantAmbiance,
    intentCounts,
    tagScores,
    photoTags: topPhotoTags,
    externalRating: aggregateRating,
    openNow: resolvedOpenStatus.openNow === true,
    nlp: {
      goodForStudying: inf?.goodForStudying,
      goodForDates: inf?.goodForDates,
      goodForGroups: inf?.goodForGroups,
      instagramWorthy: inf?.instagramWorthy,
      foodQualitySignal: inf?.foodQualitySignal,
      aestheticVibe: inf?.aestheticVibe,
      musicAtmosphere: inf?.musicAtmosphere,
    },
  });
  const primaryVibe = getPrimaryVibe(vibeScores, {
    hour: new Date().getHours(),
    openNow: resolvedOpenStatus.openNow === true,
  });

  const reviewSupport = clamp(aggregateReviewCount / 1200, 0, 0.12);
  const externalTrustSupport = externalSignalMeta.trustScore * 0.2;
  const inferredSupport = inf
    ? clamp(
      (inf.goodForStudying === true ? 0.04 : 0) +
      (inf.hasWifi === true ? 0.03 : 0) +
      (typeof inf.noiseConfidence === 'number' ? clamp(inf.noiseConfidence, 0, 1) * 0.02 : 0),
      0,
      0.08
    )
    : 0;
  const qualitySignalSupport = clamp(
    ((wifiAvg || 0) >= 3.5 ? 0.05 : 0) +
    ((outletAvg || 0) >= 2.8 ? 0.04 : 0) +
    ((laptopPct || 0) >= 60 ? 0.05 : 0) +
    ((aggregateRating || 0) >= 4.2 ? 0.05 : 0),
    0,
    0.16
  );
  const maxConfidence = usedInferred && checkins.length === 0 ? 0.35 : 0.97;
  const workFriendlyConfidenceFloor = workFriendlyType
    ? clamp(0.28 + externalSignalMeta.trustScore * 0.12 + (checkins.length > 0 ? 0.06 : 0), 0.28, 0.46)
    : 0.1;
  const minConfidence = Math.min(maxConfidence, workFriendlyConfidenceFloor);
  const confidence = clamp(
    round(reliability.score * 0.68 + externalTrustSupport + reviewSupport + inferredSupport + qualitySignalSupport, 2),
    minConfidence,
    maxConfidence
  );

  const crowdForecast = buildCrowdForecast(checkins, confidence);
  const useCases = deriveUseCases({
    workScore,
    crowdLevel: deriveCrowdLevel(adjustedBusynessAvg),
    bestTime,
    openNow: resolvedOpenStatus.openNow === true,
    externalSignals,
    wifiAvg,
    laptopPct,
  });

  const highlights: string[] = [];
  if ((wifiAvg || 0) >= 4) highlights.push('Fast WiFi');
  if ((laptopPct || 0) >= 70) highlights.push('Laptop friendly');
  if ((adjustedBusynessAvg || 0) <= 2.2) highlights.push('Usually not crowded');
  if ((noiseAvg || 0) <= 2.4) highlights.push('Typically quiet');
  if (crowdForecast[0]?.level === 'low') highlights.push('Low crowd now');
  if (externalSignals.some((s) => (s.reviewCount || 0) >= 100)) highlights.push('Strong external reviews');
  if (resolvedOpenStatus.openNow === true) highlights.push('Open now');
  if (noSeatingHardStop) highlights.push('Not suitable for laptop work');
  if (externalSignalMeta.providerCount >= 2 && externalSignalMeta.ratingConsensus >= 0.72 && highlights.length < 4) {
    highlights.push('Cross-source consensus');
  }
  if (weatherSignal?.condition === 'rain' && highlights.length < 4) highlights.push('Rain may increase indoor traffic');
  if (weatherSignal?.condition === 'snow' && highlights.length < 4) highlights.push('Snow likely shifts traffic indoors');
  if (reliability.score >= 0.78 && highlights.length < 4) highlights.push('High confidence model');
  if (momentum.trend === 'improving' && highlights.length < 4) highlights.push('Trending better this week');
  if (momentum.trend === 'declining' && highlights.length < 4) highlights.push('Trend watch: getting busier');
  if (highlights.length < 4) {
    const vibeLabel = primaryVibe.charAt(0).toUpperCase() + primaryVibe.slice(1);
    highlights.push(`${vibeLabel} vibe match`);
  }

  const studyingConfidence = round(
    clamp(
      confidence * 0.35 +
      (workScore / 100) * 0.25 +
      ((wifiAvg || 0) >= 3.5 ? 0.12 : 0) +
      ((laptopPct || 0) >= 55 ? 0.12 : 0) +
      ((noiseAvg || 0) > 0 && (noiseAvg || 0) <= 2.8 ? 0.08 : 0) +
      (inf?.goodForStudying ? 0.12 : 0),
      0,
      1,
    ),
    2,
  );
  const meetingsConfidence = round(
    clamp(
      confidence * 0.32 +
      ((aggregateRating || 0) >= 4.1 ? 0.18 : 0) +
      (crowdForecast[0]?.level !== 'high' ? 0.12 : 0) +
      ((noiseAvg || 0) > 0 && (noiseAvg || 0) <= 3.4 ? 0.12 : 0) +
      ((busynessAvg || 0) > 0 && (busynessAvg || 0) <= 3.6 ? 0.08 : 0) +
      (inf?.goodForMeetings ? 0.12 : 0),
      0,
      1,
    ),
    2,
  );
  const recommendations = {
    goodForStudying: studyingConfidence >= 0.58,
    studyingConfidence,
    goodForMeetings: meetingsConfidence >= 0.56,
    meetingsConfidence,
  };

  const payload: PlaceIntelligence = {
    workScore,
    vibeScores,
    primaryVibe,
    aggregateRating,
    aggregateReviewCount,
    priceLevel,
    openNow: resolvedOpenStatus.openNow,
    openNowSource: resolvedOpenStatus.source,
    scoreBreakdown,
    crowdLevel: deriveCrowdLevel(adjustedBusynessAvg),
    bestTime,
    confidence,
    reliability,
    momentum,
    recommendations,
    highlights: highlights.slice(0, 4),
    externalSignals,
    providerPhotos: proxyPayload.providerPhotos,
    externalSignalMeta,
    dataAvailability: proxyPayload.dataAvailability,
    contextSignals,
    crowdForecast,
    useCases,
    hours: normalizeHours(googleSnapshot?.hours) ?? normalizeHours(inf?.hours),
    modelVersion: PLACE_INTEL_MODEL_VERSION,
    generatedAt: Date.now(),
  };

  setBoundedMapEntry(intelligenceCache, cacheKey, { ts: Date.now(), payload }, INTELLIGENCE_CACHE_MAX);
  void emitIntelligenceTelemetry(cacheKey, input, payload, checkins);
  return payload;
}

export function invalidatePlaceIntelligenceCache(placeId?: string): void {
  if (!placeId) {
    intelligenceCache.clear();
    proxySignalCache.clear();
    proxyInflight.clear();
    weatherSignalCache.clear();
    weatherInflight.clear();
    reviewNlpCache.clear();
    reviewNlpInflight.clear();
    telemetryThrottle.clear();
    return;
  }

  const prefix = `${placeId}:`;
  for (const key of Array.from(intelligenceCache.keys())) {
    if (key.startsWith(prefix)) {
      intelligenceCache.delete(key);
    }
  }
  for (const key of Array.from(proxySignalCache.keys())) {
    if (key.startsWith(prefix)) {
      proxySignalCache.delete(key);
    }
  }
  for (const key of Array.from(proxyInflight.keys())) {
    if (key.startsWith(prefix)) {
      proxyInflight.delete(key);
    }
  }
  for (const key of Array.from(reviewNlpCache.keys())) {
    if (key.startsWith(prefix)) {
      reviewNlpCache.delete(key);
    }
  }
  for (const key of Array.from(reviewNlpInflight.keys())) {
    if (key.startsWith(prefix)) {
      reviewNlpInflight.delete(key);
    }
  }
  // Weather cache is location-scoped and not place-scoped, keep it hot.
}

export async function buildPlaceIntelligence(input: BuildIntelligenceInput): Promise<PlaceIntelligence> {
  const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number) =>
    await new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Place intelligence timed out')), timeoutMs);
      promise.then(
        (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      );
    });

  return withErrorBoundary(
    'place_intelligence_build',
    async () => withTimeout(buildPlaceIntelligenceCore(input), 4500),
    getFallbackPlaceIntelligence()
  );
}

export function getPlaceIntelligenceCacheStats() {
  return {
    intelligence: {
      ...placeIntelCacheCounters.intelligence,
      size: intelligenceCache.size,
      max: INTELLIGENCE_CACHE_MAX,
    },
    proxySignals: {
      ...placeIntelCacheCounters.proxySignals,
      size: proxySignalCache.size,
      max: PROXY_SIGNAL_CACHE_MAX,
    },
    weatherSignals: {
      ...placeIntelCacheCounters.weatherSignals,
      size: weatherSignalCache.size,
      max: WEATHER_SIGNAL_CACHE_MAX,
    },
    reviewNlp: {
      ...placeIntelCacheCounters.reviewNlp,
      size: reviewNlpCache.size,
      max: REVIEW_NLP_CACHE_MAX,
    },
    telemetryThrottle: {
      ...placeIntelCacheCounters.telemetryThrottle,
      size: telemetryThrottle.size,
      max: TELEMETRY_THROTTLE_MAX,
    },
  };
}

export function resetPlaceIntelligenceCacheStats() {
  (Object.keys(placeIntelCacheCounters) as PlaceIntelCacheBucket[]).forEach((key) => {
    placeIntelCacheCounters[key] = { hits: 0, misses: 0, sets: 0, evictions: 0 };
  });
}
