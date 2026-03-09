/**
 * Pre-population script for spot intelligence.
 *
 * Populates or refreshes `spots/{spotId}.intel` using:
 * - Google Places details
 * - Yelp business search/details/reviews
 * - Foursquare search/details/tips
 * - OpenAI GPT-4o-mini review NLP
 *
 * Usage:
 *   npx ts-node scripts/populateSpotIntelligence.ts [--dry-run] [--limit N]
 *     [--batch-size N] [--pause-ms N] [--refresh-stale-days N]
 *     [--include-all] [--service-account ./perched-service-account.json]
 *
 * Environment variables:
 *   OPENAI_API_KEY
 *   GOOGLE_MAPS_API_KEY
 *   YELP_API_KEY
 *   FOURSQUARE_API_KEY
 *
 * Notes:
 * - Raw review text is never persisted to Firestore.
 * - This script stores only inference output and metadata.
 */

import fs from 'node:fs';
import path from 'node:path';
import admin from 'firebase-admin';

const DEFAULT_BATCH_SIZE = 8;
const DEFAULT_PAUSE_MS = 2000;
const DEFAULT_COST_PER_SPOT = 0.025;
const MAX_REVIEW_SAMPLES = 10;

type PriceLevel = '$' | '$$' | '$$$' | '$$$$' | null;
type SpotCategory = 'cafe' | 'coworking' | 'library' | 'other';
type NoiseLevel = 'quiet' | 'moderate' | 'loud' | null;

type MaybeNumber = number | null;

interface SpotIntelligence {
  priceLevel: PriceLevel;
  avgRating: number | null;
  category: SpotCategory;
  isOpenNow: boolean;
  inferredNoise: NoiseLevel;
  inferredNoiseConfidence: number;
  hasWifi: boolean;
  wifiConfidence: number;
  goodForStudying: boolean;
  goodForMeetings: boolean;
  source: 'api+nlp';
  lastUpdated: number;
  reviewCount: number;
}

interface ApiKeys {
  googleMapsApiKey: string;
  yelpApiKey: string;
  foursquareApiKey: string;
  openAiApiKey: string;
}

interface ScriptOptions {
  dryRun: boolean;
  limit?: number;
  batchSize: number;
  pauseMs: number;
  refreshStaleDays?: number;
  includeAll: boolean;
  serviceAccountPath: string;
}

interface ProcessingStats {
  totalCandidates: number;
  processed: number;
  success: number;
  skipped: number;
  failed: number;
  estimatedCost: number;
  startTimeMs: number;
  errors: Array<{ spotId: string; error: string }>;
}

interface CandidateSpot {
  id: string;
  name: string;
  placeId: string;
  lat: number;
  lng: number;
  currentIntel?: any;
}

interface GooglePlaceData {
  rating: MaybeNumber;
  priceLevel: PriceLevel;
  isOpenNow: boolean;
  typeStrings: string[];
  reviews: string[];
}

interface YelpData {
  rating: MaybeNumber;
  priceLevel: PriceLevel;
  categoryStrings: string[];
  reviews: string[];
}

interface FoursquareData {
  rating: MaybeNumber;
  priceLevel: PriceLevel;
  categoryStrings: string[];
  tips: string[];
}

interface NlpResult {
  inferredNoise: NoiseLevel;
  inferredNoiseConfidence: number;
  hasWifi: boolean;
  wifiConfidence: number;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function normalizeNoise(value: unknown): NoiseLevel {
  if (typeof value !== 'string') return null;
  const v = value.toLowerCase().trim();
  if (v === 'quiet' || v === 'moderate' || v === 'loud') return v;
  return null;
}

function parseArgs(argv: string[]): ScriptOptions {
  const args = new Map<string, string | boolean>();

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args.set(token, true);
    } else {
      args.set(token, next);
      i += 1;
    }
  }

  const getNumber = (flag: string): number | undefined => {
    const raw = args.get(flag);
    if (typeof raw !== 'string') return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const serviceAccountPath =
    (args.get('--service-account') as string | undefined) ||
    path.resolve(process.cwd(), 'perched-service-account.json');

  return {
    dryRun: args.has('--dry-run'),
    limit: getNumber('--limit'),
    batchSize: Math.max(1, getNumber('--batch-size') || DEFAULT_BATCH_SIZE),
    pauseMs: Math.max(0, getNumber('--pause-ms') || DEFAULT_PAUSE_MS),
    refreshStaleDays: getNumber('--refresh-stale-days'),
    includeAll: args.has('--include-all'),
    serviceAccountPath,
  };
}

function readAppJsonExtraKey(key: string): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), 'app.json');
    if (!fs.existsSync(appJsonPath)) return '';
    const parsed = JSON.parse(fs.readFileSync(appJsonPath, 'utf8')) as any;
    const value = parsed?.expo?.extra?.[key];
    return typeof value === 'string' ? value.trim() : '';
  } catch {
    return '';
  }
}

function requireKey(name: string, fallbackKey?: string): string {
  const envValue = process.env[name]?.trim();
  if (envValue) return envValue;

  if (fallbackKey) {
    const appJsonValue = readAppJsonExtraKey(fallbackKey);
    if (appJsonValue) return appJsonValue;
  }

  throw new Error(`Missing required API key: ${name}`);
}

function loadApiKeys(): ApiKeys {
  return {
    googleMapsApiKey: requireKey('GOOGLE_MAPS_API_KEY', 'GOOGLE_MAPS_API_KEY'),
    yelpApiKey: requireKey('YELP_API_KEY', 'YELP_API_KEY'),
    foursquareApiKey: requireKey('FOURSQUARE_API_KEY', 'FOURSQUARE_API_KEY'),
    openAiApiKey: requireKey('OPENAI_API_KEY', 'OPENAI_API_KEY'),
  };
}

function initFirebaseAdmin(serviceAccountPath: string) {
  const resolved = path.resolve(serviceAccountPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Service account file not found: ${resolved}`);
  }

  const raw = fs.readFileSync(resolved, 'utf8');
  const json = JSON.parse(raw);

  if (!admin.apps || admin.apps.length === 0) {
    admin.initializeApp({
      credential: admin.credential.cert(json as admin.ServiceAccount),
    });
  }

  return admin.firestore();
}

async function fetchJsonWithRetry(
  url: string,
  init: RequestInit,
  opts: { retries?: number; minDelayMs?: number } = {}
): Promise<any> {
  const retries = opts.retries ?? 3;
  const minDelayMs = opts.minDelayMs ?? 1000;

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, init);

      if (res.ok) {
        const text = await res.text();
        return text ? JSON.parse(text) : {};
      }

      const retriable = res.status === 429 || (res.status >= 500 && res.status < 600);
      const body = await res.text().catch(() => '');
      const err = new Error(`HTTP ${res.status} ${res.statusText} ${body}`);
      lastError = err;

      if (!retriable || attempt === retries) throw err;

      const retryAfter = Number(res.headers.get('retry-after'));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : minDelayMs * Math.pow(2, attempt);
      await sleep(waitMs);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt === retries) throw lastError;
      await sleep(minDelayMs * Math.pow(2, attempt));
    }
  }

  throw lastError || new Error('Unknown request failure');
}

async function fetchGooglePlaceData(placeId: string, apiKey: string): Promise<GooglePlaceData | null> {
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', placeId);
  url.searchParams.set('fields', 'rating,price_level,opening_hours,types,reviews');
  url.searchParams.set('key', apiKey);

  const payload = await fetchJsonWithRetry(url.toString(), { method: 'GET' });
  if (payload?.status !== 'OK') return null;

  const result = payload?.result || {};
  const reviews = Array.isArray(result.reviews)
    ? result.reviews
        .map((entry: any) => (typeof entry?.text === 'string' ? entry.text.trim() : ''))
        .filter((v: string) => v.length > 0)
    : [];

  const googlePrice: PriceLevel = (() => {
    const level = result?.price_level;
    if (level === 1) return '$';
    if (level === 2) return '$$';
    if (level === 3) return '$$$';
    if (level === 4) return '$$$$';
    return null;
  })();

  return {
    rating: parseNumber(result?.rating),
    priceLevel: googlePrice,
    isOpenNow: Boolean(result?.opening_hours?.open_now),
    typeStrings: Array.isArray(result?.types) ? result.types.map((v: any) => String(v).toLowerCase()) : [],
    reviews,
  };
}

async function fetchYelpData(name: string, lat: number, lng: number, apiKey: string): Promise<YelpData | null> {
  const searchUrl = new URL('https://api.yelp.com/v3/businesses/search');
  searchUrl.searchParams.set('term', name);
  searchUrl.searchParams.set('latitude', String(lat));
  searchUrl.searchParams.set('longitude', String(lng));
  searchUrl.searchParams.set('limit', '1');

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    Accept: 'application/json',
  };

  const searchPayload = await fetchJsonWithRetry(searchUrl.toString(), { method: 'GET', headers });
  const business = Array.isArray(searchPayload?.businesses) ? searchPayload.businesses[0] : null;
  if (!business?.id) return null;

  const detailsUrl = `https://api.yelp.com/v3/businesses/${business.id}`;
  const reviewsUrl = `https://api.yelp.com/v3/businesses/${business.id}/reviews`;

  const [details, reviewsPayload] = await Promise.all([
    fetchJsonWithRetry(detailsUrl, { method: 'GET', headers }),
    fetchJsonWithRetry(reviewsUrl, { method: 'GET', headers }),
  ]);

  const reviews = Array.isArray(reviewsPayload?.reviews)
    ? reviewsPayload.reviews
        .map((entry: any) => (typeof entry?.text === 'string' ? entry.text.trim() : ''))
        .filter((v: string) => v.length > 0)
    : [];

  const categoryStrings = Array.isArray(details?.categories)
    ? details.categories.map((c: any) => String(c?.alias || c?.title || '').toLowerCase()).filter(Boolean)
    : [];

  const priceRaw = typeof details?.price === 'string' ? details.price.trim() : '';
  const priceLevel: PriceLevel = priceRaw === '$' || priceRaw === '$$' || priceRaw === '$$$' || priceRaw === '$$$$'
    ? (priceRaw as PriceLevel)
    : null;

  return {
    rating: parseNumber(details?.rating),
    priceLevel,
    categoryStrings,
    reviews,
  };
}

async function fetchFoursquareData(name: string, lat: number, lng: number, apiKey: string): Promise<FoursquareData | null> {
  const searchUrl = new URL('https://api.foursquare.com/v3/places/search');
  searchUrl.searchParams.set('query', name);
  searchUrl.searchParams.set('ll', `${lat},${lng}`);
  searchUrl.searchParams.set('limit', '1');

  const headers = {
    Authorization: apiKey,
    Accept: 'application/json',
  };

  const searchPayload = await fetchJsonWithRetry(searchUrl.toString(), { method: 'GET', headers });
  const place = Array.isArray(searchPayload?.results) ? searchPayload.results[0] : null;
  if (!place?.fsq_id) return null;

  const detailsUrl = new URL(`https://api.foursquare.com/v3/places/${place.fsq_id}`);
  detailsUrl.searchParams.set('fields', 'rating,price,categories,tips');
  const details = await fetchJsonWithRetry(detailsUrl.toString(), { method: 'GET', headers });

  const fsqRatingRaw = parseNumber(details?.rating);
  const rating = fsqRatingRaw !== null ? Math.max(0, Math.min(5, fsqRatingRaw / 2)) : null;

  const priceTier = parseNumber(details?.price);
  const priceLevel: PriceLevel = priceTier === 1
    ? '$'
    : priceTier === 2
      ? '$$'
      : priceTier === 3
        ? '$$$'
        : priceTier === 4
          ? '$$$$'
          : null;

  const categoryStrings = Array.isArray(details?.categories)
    ? details.categories.map((c: any) => String(c?.name || '').toLowerCase()).filter(Boolean)
    : [];

  const tips = Array.isArray(details?.tips)
    ? details.tips
        .map((tip: any) => {
          if (typeof tip === 'string') return tip.trim();
          if (typeof tip?.text === 'string') return tip.text.trim();
          return '';
        })
        .filter((v: string) => v.length > 0)
    : [];

  return {
    rating,
    priceLevel,
    categoryStrings,
    tips,
  };
}

async function analyzeReviewsWithOpenAI(reviews: string[], apiKey: string): Promise<NlpResult> {
  if (!reviews.length) {
    return {
      inferredNoise: null,
      inferredNoiseConfidence: 0,
      hasWifi: false,
      wifiConfidence: 0,
    };
  }

  const prompt = [
    'Analyze these cafe/workspace reviews and infer:',
    '1) noise: quiet | moderate | loud | null',
    '2) noiseConfidence: 0..1',
    '3) hasWifi: boolean',
    '4) wifiConfidence: 0..1',
    'Return strict JSON only with keys: noise, noiseConfidence, hasWifi, wifiConfidence.',
    '',
    ...reviews.slice(0, MAX_REVIEW_SAMPLES).map((r, idx) => `${idx + 1}. ${r}`),
  ].join('\n');

  const payload = await fetchJsonWithRetry(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      }),
    },
    { retries: 4, minDelayMs: 1500 }
  );

  const content = payload?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') {
    return {
      inferredNoise: null,
      inferredNoiseConfidence: 0,
      hasWifi: false,
      wifiConfidence: 0,
    };
  }

  let parsed: any = {};
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = {};
  }

  return {
    inferredNoise: normalizeNoise(parsed?.noise),
    inferredNoiseConfidence: clamp01(Number(parsed?.noiseConfidence || 0)),
    hasWifi: Boolean(parsed?.hasWifi),
    wifiConfidence: clamp01(Number(parsed?.wifiConfidence || 0)),
  };
}

function aggregatePriceLevel(google: GooglePlaceData | null, yelp: YelpData | null, fsq: FoursquareData | null): PriceLevel {
  return google?.priceLevel || yelp?.priceLevel || fsq?.priceLevel || null;
}

function aggregateRating(google: GooglePlaceData | null, yelp: YelpData | null, fsq: FoursquareData | null): number | null {
  const weighted: Array<{ value: number; weight: number }> = [];
  if (google?.rating !== null && google?.rating !== undefined) weighted.push({ value: google.rating, weight: 0.5 });
  if (yelp?.rating !== null && yelp?.rating !== undefined) weighted.push({ value: yelp.rating, weight: 0.3 });
  if (fsq?.rating !== null && fsq?.rating !== undefined) weighted.push({ value: fsq.rating, weight: 0.2 });
  if (!weighted.length) return null;

  const sumWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  const value = weighted.reduce((sum, item) => sum + item.value * item.weight, 0) / sumWeight;
  return Math.round(value * 10) / 10;
}

function inferCategory(typeStrings: string[]): SpotCategory {
  const hay = typeStrings.join(' ');
  if (/(cowork|co-working|workspace)/.test(hay)) return 'coworking';
  if (/(library|book)/.test(hay)) return 'library';
  if (/(cafe|coffee|espresso|tea)/.test(hay)) return 'cafe';
  return 'other';
}

function dedupeReviews(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];

  values.forEach((value) => {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    output.push(normalized);
  });

  return output;
}

function isStale(lastUpdated: unknown, staleDays: number): boolean {
  if (typeof lastUpdated !== 'number' || !Number.isFinite(lastUpdated)) return true;
  return Date.now() - lastUpdated > staleDays * 24 * 60 * 60 * 1000;
}

function shouldProcessSpot(data: any, options: ScriptOptions): boolean {
  if (options.includeAll) return true;

  const intel = data?.intel;
  if (!intel || typeof intel !== 'object') return true;

  if (typeof options.refreshStaleDays === 'number' && options.refreshStaleDays > 0) {
    return isStale(intel.lastUpdated, options.refreshStaleDays);
  }

  return false;
}

function readLatLng(data: any): { lat: number; lng: number } | null {
  const latCandidates = [
    data?.lat,
    data?.location?.lat,
    data?.location?._lat,
    data?.spotLatLng?.lat,
  ];
  const lngCandidates = [
    data?.lng,
    data?.location?.lng,
    data?.location?._long,
    data?.location?._lng,
    data?.spotLatLng?.lng,
  ];

  const lat = latCandidates.map(parseNumber).find((v) => v !== null);
  const lng = lngCandidates.map(parseNumber).find((v) => v !== null);

  if (lat === null || lat === undefined || lng === null || lng === undefined) return null;
  return { lat, lng };
}

async function collectCandidateSpots(
  db: admin.firestore.Firestore,
  options: ScriptOptions
): Promise<CandidateSpot[]> {
  const candidates: CandidateSpot[] = [];
  const pageSize = 250;
  let cursor: admin.firestore.QueryDocumentSnapshot | undefined;

  while (true) {
    let query: admin.firestore.Query = db.collection('spots').orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize);
    if (cursor) query = query.startAfter(cursor);

    const snapshot = await query.get();
    if (snapshot.empty) break;

    for (const doc of snapshot.docs) {
      if (options.limit && candidates.length >= options.limit) return candidates;

      const data = doc.data() || {};
      if (!shouldProcessSpot(data, options)) continue;

      const coords = readLatLng(data);
      const name = typeof data?.name === 'string' ? data.name.trim() : '';
      const placeId = typeof data?.placeId === 'string' && data.placeId.trim()
        ? data.placeId.trim()
        : typeof data?.googlePlaceId === 'string' && data.googlePlaceId.trim()
          ? data.googlePlaceId.trim()
          : '';

      if (!name || !placeId || !coords) continue;

      candidates.push({
        id: doc.id,
        name,
        placeId,
        lat: coords.lat,
        lng: coords.lng,
        currentIntel: data?.intel,
      });
    }

    cursor = snapshot.docs[snapshot.docs.length - 1];
    if (!cursor || snapshot.size < pageSize) break;
  }

  return candidates;
}

async function buildSpotIntelligence(spot: CandidateSpot, keys: ApiKeys): Promise<SpotIntelligence> {
  const [google, yelp, fsq] = await Promise.all([
    fetchGooglePlaceData(spot.placeId, keys.googleMapsApiKey),
    fetchYelpData(spot.name, spot.lat, spot.lng, keys.yelpApiKey),
    fetchFoursquareData(spot.name, spot.lat, spot.lng, keys.foursquareApiKey),
  ]);

  const reviews = dedupeReviews([
    ...(google?.reviews || []),
    ...(yelp?.reviews || []),
    ...(fsq?.tips || []),
  ]).slice(0, MAX_REVIEW_SAMPLES);

  const nlp = await analyzeReviewsWithOpenAI(reviews, keys.openAiApiKey);

  const allTypeStrings = [
    ...(google?.typeStrings || []),
    ...(yelp?.categoryStrings || []),
    ...(fsq?.categoryStrings || []),
  ];

  const avgRating = aggregateRating(google, yelp, fsq);
  const inferredNoise = nlp.inferredNoise;

  return {
    priceLevel: aggregatePriceLevel(google, yelp, fsq),
    avgRating,
    category: inferCategory(allTypeStrings),
    isOpenNow: Boolean(google?.isOpenNow),
    inferredNoise,
    inferredNoiseConfidence: nlp.inferredNoiseConfidence,
    hasWifi: nlp.hasWifi,
    wifiConfidence: nlp.wifiConfidence,
    goodForStudying: inferredNoise === 'quiet' && nlp.hasWifi,
    goodForMeetings: inferredNoise !== 'loud' && (avgRating || 0) >= 4,
    source: 'api+nlp',
    lastUpdated: Date.now(),
    reviewCount: reviews.length,
  };
}

async function processCandidate(
  db: admin.firestore.Firestore,
  spot: CandidateSpot,
  keys: ApiKeys,
  options: ScriptOptions
): Promise<{ spotId: string; skipped?: boolean; message: string; cost: number }> {
  const intel = await buildSpotIntelligence(spot, keys);

  if (options.dryRun) {
    return {
      spotId: spot.id,
      message: `would write intel: ${intel.category}, ${intel.priceLevel || 'n/a'}, ${intel.avgRating ?? 'n/a'} rating, ${intel.inferredNoise || 'n/a'} noise`,
      cost: DEFAULT_COST_PER_SPOT,
    };
  }

  await db.collection('spots').doc(spot.id).set(
    {
      intel,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return {
    spotId: spot.id,
    message: `intel updated (${intel.category}, ${intel.priceLevel || 'n/a'}, ${intel.reviewCount} reviews)` ,
    cost: DEFAULT_COST_PER_SPOT,
  };
}

function printSummary(stats: ProcessingStats) {
  const elapsedMs = Date.now() - stats.startTimeMs;
  const elapsedMin = (elapsedMs / 60000).toFixed(2);

  console.log('\n' + '='.repeat(72));
  console.log('Spot Intelligence Population Summary');
  console.log('='.repeat(72));
  console.log(`Candidates:      ${stats.totalCandidates}`);
  console.log(`Processed:       ${stats.processed}`);
  console.log(`Success:         ${stats.success}`);
  console.log(`Skipped:         ${stats.skipped}`);
  console.log(`Failed:          ${stats.failed}`);
  console.log(`Estimated cost:  $${stats.estimatedCost.toFixed(2)}`);
  console.log(`Elapsed:         ${elapsedMin} minutes`);
  console.log('='.repeat(72));

  if (stats.errors.length) {
    console.log('\nErrors:');
    stats.errors.forEach((entry) => {
      console.log(`- ${entry.spotId}: ${entry.error}`);
    });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  console.log('\nPerched spot intelligence pre-population\n');
  console.log(`Mode:            ${options.dryRun ? 'dry-run' : 'write'}`);
  console.log(`Batch size:      ${options.batchSize}`);
  console.log(`Pause between:   ${options.pauseMs} ms`);
  if (options.limit) console.log(`Limit:           ${options.limit}`);
  if (options.includeAll) console.log('Scope:           all spots');
  if (options.refreshStaleDays) console.log(`Refresh stale:   > ${options.refreshStaleDays} days`);

  const keys = loadApiKeys();
  const db = initFirebaseAdmin(options.serviceAccountPath);

  const candidates = await collectCandidateSpots(db, options);
  const stats: ProcessingStats = {
    totalCandidates: candidates.length,
    processed: 0,
    success: 0,
    skipped: 0,
    failed: 0,
    estimatedCost: 0,
    startTimeMs: Date.now(),
    errors: [],
  };

  if (!candidates.length) {
    console.log('\nNo candidate spots found. Nothing to process.\n');
    return;
  }

  console.log(`\nFound ${candidates.length} candidate spot(s).`);
  console.log(`Estimated max cost: $${(candidates.length * DEFAULT_COST_PER_SPOT).toFixed(2)}\n`);

  for (let i = 0; i < candidates.length; i += options.batchSize) {
    const batch = candidates.slice(i, i + options.batchSize);
    const batchNumber = Math.floor(i / options.batchSize) + 1;

    console.log(`\nBatch ${batchNumber} (${i + 1}-${Math.min(i + options.batchSize, candidates.length)} of ${candidates.length})`);

    const results = await Promise.allSettled(
      batch.map((spot) => processCandidate(db, spot, keys, options))
    );

    results.forEach((result, idx) => {
      stats.processed += 1;
      const spotId = batch[idx].id;

      if (result.status === 'fulfilled') {
        if (result.value.skipped) {
          stats.skipped += 1;
        } else {
          stats.success += 1;
          stats.estimatedCost += result.value.cost;
        }
        console.log(`  ✓ ${spotId}: ${result.value.message}`);
      } else {
        stats.failed += 1;
        const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
        stats.errors.push({ spotId, error });
        console.log(`  ✗ ${spotId}: ${error}`);
      }
    });

    const pct = ((stats.processed / stats.totalCandidates) * 100).toFixed(1);
    console.log(`Progress: ${stats.processed}/${stats.totalCandidates} (${pct}%) | success ${stats.success} | failed ${stats.failed}`);

    if (i + options.batchSize < candidates.length && options.pauseMs > 0) {
      await sleep(options.pauseMs);
    }
  }

  printSummary(stats);

  if (stats.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('\nFatal error in populateSpotIntelligence:', error);
  process.exit(1);
});
