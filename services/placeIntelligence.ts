import Constants from 'expo-constants';
import { toMillis } from '@/services/checkinUtils';
import { withErrorBoundary } from './errorBoundary';

export type ExternalSource = 'foursquare' | 'yelp';

export type ExternalPlaceSignal = {
  source: ExternalSource;
  rating?: number;
  reviewCount?: number;
  priceLevel?: string;
  categories?: string[];
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

export type PlaceIntelligence = {
  workScore: number;
  crowdLevel: 'low' | 'moderate' | 'high' | 'unknown';
  bestTime: 'morning' | 'afternoon' | 'evening' | 'late' | 'anytime';
  confidence: number;
  reliability: IntelligenceReliability;
  momentum: IntelligenceMomentum;
  highlights: string[];
  externalSignals: ExternalPlaceSignal[];
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
};

const INTELLIGENCE_TTL_MS = 15 * 60 * 1000;
const MOMENTUM_WINDOW_DAYS = 7;
const PLACE_INTEL_MODEL_VERSION = '2026-02-11-r2';
const INTEL_TELEMETRY_SAMPLE_RATE = 0.08;
const INTEL_TELEMETRY_THROTTLE_MS = 20 * 60 * 1000;
const intelligenceCache = new Map<string, { ts: number; payload: PlaceIntelligence }>();
const proxySignalCache = new Map<string, { ts: number; payload: ExternalPlaceSignal[] }>();
const proxyInflight = new Map<string, Promise<ExternalPlaceSignal[]>>();
const telemetryThrottle = new Map<string, number>();

function getFallbackPlaceIntelligence(): PlaceIntelligence {
  return {
    workScore: 50,
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

function stableHash(text: string) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
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

function computeReliability(input: {
  sampleSize: number;
  wifiValues: number[];
  busynessValues: number[];
  noiseValues: number[];
  laptopVotes: boolean[];
  externalSignals: ExternalPlaceSignal[];
}): IntelligenceReliability {
  const { sampleSize, wifiValues, busynessValues, noiseValues, laptopVotes, externalSignals } = input;
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
  const externalSupport = externalSignals.length ? 0.08 : 0;
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
  const busynessValues = checkins.map((c: any) => c?.busyness).filter((v: any) => typeof v === 'number') as number[];
  const noiseValues = checkins.map((c: any) => toNoiseLevel(c?.noiseLevel)).filter((v: any) => typeof v === 'number') as number[];

  const wifiAvg = avg(wifiValues);
  const busynessAvg = avg(busynessValues);
  const noiseAvg = avg(noiseValues);
  const laptopVotes = checkins
    .map((c: any) => c?.laptopFriendly)
    .filter((v: any) => typeof v === 'boolean') as boolean[];
  const laptopPct = laptopVotes.length
    ? (laptopVotes.filter(Boolean).length / laptopVotes.length) * 100
    : null;

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

  const externalSignals = await getProxySignals(input);
  const externalRatingAvg = avg(externalSignals.map((s) => s.rating).filter((v): v is number => typeof v === 'number'));
  const reliability = computeReliability({
    sampleSize: checkins.length,
    wifiValues,
    busynessValues,
    noiseValues,
    laptopVotes,
    externalSignals,
  });
  const momentum = computeMomentum(checkins);

  const tagBoost =
    (tagScores['Wi-Fi'] || 0) * 1.4 +
    (tagScores['Outlets'] || 0) * 1.2 +
    (tagScores['Seating'] || 0) * 1 +
    (tagScores['Quiet'] || 0) * 1.1;
  const typeText = `${input.placeName || ''} ${(input.types || []).join(' ')}`.toLowerCase();
  const studyTypeBoost =
    /library|cowork|university|study|workspace|bookstore/.test(typeText) ? 8 : 0;
  const cafePenalty = /bar|night_club|casino/.test(typeText) ? 6 : 0;
  const openBoost = input.openNow === true ? 4 : input.openNow === false ? -4 : 0;
  const momentumBoost = momentum.trend === 'improving' ? 2 : momentum.trend === 'declining' ? -2 : 0;

  const score =
    (wifiAvg || 0) * 10 +
    (laptopPct || 0) * 0.22 +
    (noiseAvg !== null ? (6 - noiseAvg) * 7 : 0) +
    (busynessAvg !== null ? (6 - busynessAvg) * 6 : 0) +
    Math.log10(1 + Math.max(0, tagBoost)) * 18 +
    (externalRatingAvg || 0) * 6 +
    studyTypeBoost +
    openBoost -
    cafePenalty +
    momentumBoost;
  const workScore = clamp(Math.round(score), 0, 100);

  const avgExternalReviewCount = avg(
    externalSignals
      .map((s) => s.reviewCount)
      .filter((v): v is number => typeof v === 'number')
  );
  const reviewSupport = clamp((avgExternalReviewCount || 0) / 500, 0, 0.12);
  const confidence = clamp(
    round(reliability.score * 0.78 + (externalSignals.length ? 0.12 : 0) + reviewSupport, 2),
    0.1,
    0.97
  );

  const crowdForecast = buildCrowdForecast(checkins, confidence);
  const useCases = deriveUseCases({
    workScore,
    crowdLevel: deriveCrowdLevel(busynessAvg),
    bestTime,
    openNow: input.openNow,
    externalSignals,
    wifiAvg,
    laptopPct,
  });

  const highlights: string[] = [];
  if ((wifiAvg || 0) >= 4) highlights.push('Fast WiFi');
  if ((laptopPct || 0) >= 70) highlights.push('Laptop friendly');
  if ((busynessAvg || 0) <= 2.2) highlights.push('Usually not crowded');
  if ((noiseAvg || 0) <= 2.4) highlights.push('Typically quiet');
  if (crowdForecast[0]?.level === 'low') highlights.push('Low crowd now');
  if (externalSignals.some((s) => (s.reviewCount || 0) >= 100)) highlights.push('Strong external reviews');
  if (input.openNow === true) highlights.push('Open now');
  if (reliability.score >= 0.78 && highlights.length < 4) highlights.push('High confidence model');
  if (momentum.trend === 'improving' && highlights.length < 4) highlights.push('Trending better this week');
  if (momentum.trend === 'declining' && highlights.length < 4) highlights.push('Trend watch: getting busier');

  const payload: PlaceIntelligence = {
    workScore,
    crowdLevel: deriveCrowdLevel(busynessAvg),
    bestTime,
    confidence,
    reliability,
    momentum,
    highlights: highlights.slice(0, 4),
    externalSignals,
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
}

export async function buildPlaceIntelligence(input: BuildIntelligenceInput): Promise<PlaceIntelligence> {
  return withErrorBoundary(
    'place_intelligence_build',
    async () => buildPlaceIntelligenceCore(input),
    getFallbackPlaceIntelligence()
  );
}
