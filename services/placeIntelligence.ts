import Constants from 'expo-constants';
import { toMillis } from '@/services/checkinUtils';
import { withErrorBoundary } from './errorBoundary';
import { computeVibeScores, getPrimaryVibe, type VibeScores, type VibeType } from './vibeScoring';

export type ExternalSource = 'foursquare' | 'yelp';

export type ExternalPlaceSignal = {
  source: ExternalSource;
  rating?: number;
  reviewCount?: number;
  priceLevel?: string;
  categories?: string[];
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
  scoreBreakdown: ScoreBreakdown;
  crowdLevel: 'low' | 'moderate' | 'high' | 'unknown';
  bestTime: 'morning' | 'afternoon' | 'evening' | 'late' | 'anytime';
  confidence: number;
  reliability: IntelligenceReliability;
  momentum: IntelligenceMomentum;
  highlights: string[];
  externalSignals: ExternalPlaceSignal[];
  externalSignalMeta: ExternalSignalMeta;
  contextSignals: ContextSignal[];
  crowdForecast: CrowdForecastPoint[];
  useCases: string[];
  modelVersion: string;
  generatedAt: number;
};

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
    goodForDates?: number;
    goodForGroups?: number;
    instagramWorthy?: number;
    foodQualitySignal?: number;
    aestheticVibe?: 'cozy' | 'modern' | 'rustic' | 'industrial' | 'classic' | null;
    musicAtmosphere?: 'none' | 'chill' | 'upbeat' | 'live' | 'unknown' | null;
  } | null;
};

const INTELLIGENCE_TTL_MS = 15 * 60 * 1000;
const MOMENTUM_WINDOW_DAYS = 7;
const PLACE_INTEL_MODEL_VERSION = '2026-02-11-r3';
const INTEL_TELEMETRY_SAMPLE_RATE = 0.08;
const INTEL_TELEMETRY_THROTTLE_MS = 20 * 60 * 1000;
const WEATHER_TTL_MS = 30 * 60 * 1000;
const intelligenceCache = new Map<string, { ts: number; payload: PlaceIntelligence }>();
const proxySignalCache = new Map<string, { ts: number; payload: ExternalPlaceSignal[] }>();
const proxyInflight = new Map<string, Promise<ExternalPlaceSignal[]>>();
const weatherSignalCache = new Map<string, { ts: number; payload: ContextSignal[] }>();
const weatherInflight = new Map<string, Promise<ContextSignal[]>>();
const telemetryThrottle = new Map<string, number>();

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
    scoreBreakdown: {
      wifi: { value: 0, source: 'none' },
      outlet: { value: 0, source: 'none' },
      noise: { value: 0, source: 'none' },
      busyness: { value: 0, source: 'none' },
      laptop: { value: 0, source: 'none' },
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
    highlights: [],
    externalSignals: [],
    externalSignalMeta: {
      providerCount: 0,
      providerDiversity: 0,
      totalReviewCount: 0,
      ratingConsensus: 0,
      trustScore: 0,
    },
    contextSignals: [],
    crowdForecast: [],
    useCases: ['Quick focus stop'],
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
  if (typeof appCheckToken === 'string' && appCheckToken.trim().length > 0) {
    headers['X-Firebase-AppCheck'] = appCheckToken.trim();
  }

  return headers;
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
      if (!item || (item.source !== 'yelp' && item.source !== 'foursquare')) return null;
      return {
        source: item.source as ExternalSource,
        rating: typeof item.rating === 'number' ? item.rating : undefined,
        reviewCount: typeof item.reviewCount === 'number' ? item.reviewCount : undefined,
        priceLevel: parsePriceLevel(typeof item.priceLevel === 'string' ? item.priceLevel : undefined),
        categories: Array.isArray(item.categories)
          ? item.categories.filter((c: any) => typeof c === 'string' && c.trim().length > 0)
          : undefined,
      } as ExternalPlaceSignal;
    })
    .filter(Boolean) as ExternalPlaceSignal[];
}

async function getProxySignals(input: BuildIntelligenceInput): Promise<ExternalPlaceSignal[]> {
  if (!input.placeName || !input.location) return [];
  const endpoint = getPlaceSignalEndpoint();
  if (!endpoint) return [];
  const cacheKey = `${input.placeId || ''}:${input.placeName}:${input.location.lat.toFixed(3)}:${input.location.lng.toFixed(3)}`;
  const cached = proxySignalCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < INTELLIGENCE_TTL_MS) {
    return cached.payload;
  }
  return withInflight(proxyInflight, cacheKey, async () => {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(await getProxyAuthHeaders()),
    };
    const payload = await fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          placeName: input.placeName,
          placeId: input.placeId || undefined,
          location: input.location,
        }),
      },
      2400,
    );
    const next = normalizeExternalSignals(payload?.externalSignals);
    proxySignalCache.set(cacheKey, { ts: Date.now(), payload: next });
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
  const cached = weatherSignalCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < WEATHER_TTL_MS) {
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
      weatherSignalCache.set(cacheKey, { ts: Date.now(), payload: [] });
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
    weatherSignalCache.set(cacheKey, { ts: Date.now(), payload: next });
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
    const busyAvg = hourlyBusynessCounts[hour]
      ? hourlyBusynessSums[hour] / hourlyBusynessCounts[hour]
      : globalBusyness;
    const busyNorm = clamp(busyAvg / 5, 0, 1);
    const score = clamp(0.65 * countNorm + 0.35 * busyNorm, 0, 1);
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
  const providerDiversity = clamp(providerCount / 2, 0, 1);
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

  telemetryThrottle.set(placeKey, Date.now());

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
  const cacheKey = `${input.placeId || ''}:${input.placeName || ''}:${input.location?.lat?.toFixed(3) || ''}:${input.location?.lng?.toFixed(3) || ''}`;
  const cached = intelligenceCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < INTELLIGENCE_TTL_MS) return cached.payload;

  const checkins = Array.isArray(input.checkins) ? input.checkins : [];
  const tagScores = input.tagScores || {};

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

  const inf = input.inferred;
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

  const [externalSignals, contextSignals] = await Promise.all([
    getProxySignals(input),
    getWeatherSignals(input),
  ]);
  const externalSignalMeta = buildExternalSignalMeta(externalSignals);
  const externalRatingAvg = avg(externalSignals.map((s) => s.rating).filter((v): v is number => typeof v === 'number'));
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
    (tagScores['Quiet'] || 0) * 1.1;
  const typeText = `${input.placeName || ''} ${(input.types || []).join(' ')}`.toLowerCase();
  const seatingSignal = (tagScores['Seating'] || 0) + (tagScores['Outdoor Seating'] || 0) * 0.6;
  const workFriendlyType = /library|cowork|coffee|cafe|study|workspace|bookstore/.test(typeText);
  const mixedUseType = /restaurant|bakery|hotel|lounge/.test(typeText);
  const outdoorOnlyType = /park|trail|playground|stadium|field|outdoor|plaza|beach/.test(typeText);
  const hasLaptopSignals = (laptopPct || 0) >= 35 || checkins.some((c: any) => c?.laptopFriendly === true);
  const hasConnectivitySignals = (wifiAvg || 0) >= 2.4 || (tagScores['Wi-Fi'] || 0) > 0 || (tagScores['Outlets'] || 0) > 0;
  const hasSeatingSignals = seatingSignal > 0 || hasLaptopSignals;
  const noSeatingHardStop = outdoorOnlyType && !hasSeatingSignals && !hasConnectivitySignals && checkins.length < 2;
  const venueBaseline = workFriendlyType ? 22 : mixedUseType ? 12 : outdoorOnlyType ? 0 : 8;
  const studyTypeBoost =
    /library|cowork|university|study|workspace|bookstore/.test(typeText) ? 8 : 0;
  const cafePenalty = /bar|night_club|casino/.test(typeText) ? 6 : 0;
  const openBoost = input.openNow === true ? 4 : input.openNow === false ? -4 : 0;
  const momentumBoost = momentum.trend === 'improving' ? 2 : momentum.trend === 'declining' ? -2 : 0;

  const score =
    venueBaseline +
    (wifiAvg || 0) * 10 +
    (outletAvg !== null ? (outletAvg - 1) * 5 : 0) +
    (laptopPct || 0) * 0.22 +
    (noiseAvg !== null ? (6 - noiseAvg) * 7 : 0) +
    (adjustedBusynessAvg !== null ? (6 - adjustedBusynessAvg) * 6 : 0) +
    Math.log10(1 + Math.max(0, tagBoost)) * 18 +
    (externalRatingAvg || 0) * 6 +
    studyTypeBoost +
    openBoost -
    cafePenalty +
    momentumBoost;
  let workScore = clamp(Math.round(score), 0, 100);
  if (noSeatingHardStop) {
    workScore = 0;
  } else if (workScore <= 0) {
    workScore = workFriendlyType ? 30 : 18;
  }
  const scoreBreakdown: ScoreBreakdown = {
    wifi: { value: round((wifiAvg || 0) * 10, 1), source: wifiSource },
    outlet: { value: round(outletAvg !== null ? (outletAvg - 1) * 5 : 0, 1), source: outletAvg !== null ? 'checkin' : 'none' },
    noise: { value: round(noiseAvg !== null ? (6 - noiseAvg) * 7 : 0, 1), source: noiseSource },
    busyness: { value: round(adjustedBusynessAvg !== null ? (6 - adjustedBusynessAvg) * 6 : 0, 1), source: adjustedBusynessAvg !== null ? 'checkin' : 'none' },
    laptop: { value: round((laptopPct || 0) * 0.22, 1), source: laptopSource },
    tags: { value: round(Math.log10(1 + Math.max(0, tagBoost)) * 18, 1), source: tagBoost > 0 ? 'checkin' : 'none' },
    externalRating: { value: round((externalRatingAvg || 0) * 6, 1), source: externalRatingAvg ? 'api' : 'none' },
    venueType: { value: round(venueBaseline + studyTypeBoost - cafePenalty, 1) },
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
    avgDrinkQuality: avg(drinkQualityValues),
    avgDrinkPrice: avg(drinkPriceValues),
    topOutletAvailability,
    laptopFriendlyPct: laptopPct,
    ambiance: dominantAmbiance,
    intentCounts,
    tagScores,
    photoTags: topPhotoTags,
    externalRating: externalRatingAvg,
    openNow: input.openNow,
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
  const primaryVibe = getPrimaryVibe(vibeScores, { hour: new Date().getHours(), openNow: input.openNow });

  const avgExternalReviewCount = avg(
    externalSignals
      .map((s) => s.reviewCount)
      .filter((v): v is number => typeof v === 'number')
  );
  const reviewSupport = clamp((avgExternalReviewCount || 0) / 500, 0, 0.12);
  const externalTrustSupport = externalSignalMeta.trustScore * 0.16;
  const maxConfidence = usedInferred && checkins.length === 0 ? 0.35 : 0.97;
  const confidence = clamp(
    round(reliability.score * 0.72 + externalTrustSupport + reviewSupport, 2),
    0.1,
    maxConfidence
  );

  const crowdForecast = buildCrowdForecast(checkins, confidence);
  const useCases = deriveUseCases({
    workScore,
    crowdLevel: deriveCrowdLevel(adjustedBusynessAvg),
    bestTime,
    openNow: input.openNow,
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
  if (input.openNow === true) highlights.push('Open now');
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

  const payload: PlaceIntelligence = {
    workScore,
    vibeScores,
    primaryVibe,
    scoreBreakdown,
    crowdLevel: deriveCrowdLevel(adjustedBusynessAvg),
    bestTime,
    confidence,
    reliability,
    momentum,
    highlights: highlights.slice(0, 4),
    externalSignals,
    externalSignalMeta,
    contextSignals,
    crowdForecast,
    useCases,
    modelVersion: PLACE_INTEL_MODEL_VERSION,
    generatedAt: Date.now(),
  };

  intelligenceCache.set(cacheKey, { ts: Date.now(), payload });
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
  // Weather cache is location-scoped and not place-scoped, keep it hot.
}

export async function buildPlaceIntelligence(input: BuildIntelligenceInput): Promise<PlaceIntelligence> {
  return withErrorBoundary(
    'place_intelligence_build',
    async () => buildPlaceIntelligenceCore(input),
    getFallbackPlaceIntelligence()
  );
}
