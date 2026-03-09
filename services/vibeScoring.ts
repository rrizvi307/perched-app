import type { DiscoveryIntent, DiscoveryIntentFilter } from './discoveryIntents';

export type VibeType = 'study' | 'date' | 'social' | 'quick' | 'aesthetic';
export type VibeScores = Record<VibeType, number>;

type VibeSignalInput = {
  avgNoiseLevel?: number | null;
  avgBusyness?: number | null;
  avgWifiSpeed?: number | null;
  avgDrinkQuality?: number | null;
  avgDrinkPrice?: number | null;
  topOutletAvailability?: 'plenty' | 'some' | 'few' | 'none' | string | null;
  laptopFriendlyPct?: number | null;
  ambiance?: string | null;
  intentCounts?: Record<string, number> | null;
  tagScores?: Record<string, number> | null;
  photoTags?: string[] | null;
  externalRating?: number | null;
  openNow?: boolean;
  nlp?: {
    goodForStudying?: boolean;
    goodForDates?: number;
    goodForGroups?: number;
    instagramWorthy?: number;
    foodQualitySignal?: number;
    aestheticVibe?: string | null;
    musicAtmosphere?: 'none' | 'chill' | 'upbeat' | 'live' | 'unknown' | string | null;
  } | null;
};

type PrimaryVibeContext = {
  hour?: number;
  openNow?: boolean;
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function toRatio(value: number | null | undefined, min: number, max: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0.5;
  if (max <= min) return 0.5;
  return clamp(((value - min) / (max - min)) * 100, 0, 100) / 100;
}

function sweetSpot(value: number | null | undefined, low: number, high: number, spread = 1.2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0.45;
  if (value >= low && value <= high) return 1;
  const center = (low + high) / 2;
  const delta = Math.abs(value - center);
  const damped = Math.exp(-Math.pow(delta / spread, 2));
  return clamp(damped * 100, 0, 100) / 100;
}

function toOutletScore(value: string | null | undefined) {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'plenty') return 1;
  if (normalized === 'some') return 0.75;
  if (normalized === 'few') return 0.4;
  if (normalized === 'none') return 0.1;
  return 0.45;
}

function toTagScore(tagScores: Record<string, number> | null | undefined, keys: string[]) {
  if (!tagScores) return 0;
  const total = keys.reduce((sum, key) => sum + (Number(tagScores[key]) || 0), 0);
  return clamp(total * 10, 0, 100) / 100;
}

function toIntentRatio(intentCounts: Record<string, number> | null | undefined, keys: string[]) {
  if (!intentCounts) return 0;
  const values = Object.values(intentCounts).map((value) => Number(value) || 0);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return 0;
  const votes = keys.reduce((sum, key) => sum + (Number(intentCounts[key]) || 0), 0);
  return clamp((votes / total) * 100, 0, 100) / 100;
}

function hasPhotoTag(photoTags: string[] | null | undefined, words: string[]) {
  if (!Array.isArray(photoTags) || !photoTags.length) return false;
  const joined = photoTags.join(' ').toLowerCase();
  return words.some((word) => joined.includes(word));
}

export function intentToVibe(intent: DiscoveryIntentFilter | null | undefined): VibeType | null {
  if (!intent || intent === 'any') return null;
  const map: Record<DiscoveryIntent, VibeType> = {
    deep_work: 'study',
    quiet_reading: 'study',
    group_study: 'study',
    date_night: 'date',
    hangout_friends: 'social',
    late_night_open: 'social',
    quick_pickup: 'quick',
    coffee_quality: 'quick',
    pastry_snack: 'quick',
    aesthetic_photos: 'aesthetic',
  };
  return map[intent] || null;
}

export function computeVibeScores(input: VibeSignalInput): VibeScores {
  const noise = input.avgNoiseLevel ?? null;
  const busyness = input.avgBusyness ?? null;
  const wifi = input.avgWifiSpeed ?? null;
  const drinkQuality = input.avgDrinkQuality ?? null;
  const drinkPrice = input.avgDrinkPrice ?? null;
  const laptop = input.laptopFriendlyPct ?? null;
  const outlet = toOutletScore(input.topOutletAvailability || null);
  const rating = toRatio(input.externalRating ?? null, 2.5, 5);
  const ambiance = String(input.ambiance || '').toLowerCase();
  const music = String(input.nlp?.musicAtmosphere || '').toLowerCase();
  const openBonus = input.openNow ? 0.08 : 0;

  const quietness = 1 - toRatio(noise, 1, 5);
  const energy = toRatio(noise, 1, 5);
  const crowdCalm = 1 - toRatio(busyness, 1, 5);
  const crowdSocial = sweetSpot(busyness, 2.2, 3.8, 1.1);
  const wifiScore = toRatio(wifi, 1, 5);
  const drinkScore = toRatio(drinkQuality, 1, 5);
  const laptopScore = toRatio(laptop, 0, 100);
  const budgetScore = 1 - toRatio(drinkPrice, 1, 3);

  const ambianceCozy = ['cozy', 'intimate', 'rustic'].includes(ambiance) ? 1 : 0.45;
  const ambianceSocial = ['energetic', 'bright', 'modern'].includes(ambiance) ? 1 : 0.45;
  const ambianceAesthetic = ['modern', 'rustic', 'intimate', 'cozy', 'bright'].includes(ambiance) ? 1 : 0.45;
  const musicDate = music === 'chill' ? 1 : music === 'upbeat' ? 0.5 : 0.35;
  const musicSocial = ['upbeat', 'live', 'chill'].includes(music) ? 1 : 0.45;

  const intentStudy = toIntentRatio(input.intentCounts, ['deep_work', 'quiet_reading', 'group_study']);
  const intentDate = toIntentRatio(input.intentCounts, ['date_night']);
  const intentSocial = toIntentRatio(input.intentCounts, ['hangout_friends', 'late_night_open']);
  const intentQuick = toIntentRatio(input.intentCounts, ['quick_pickup', 'coffee_quality', 'pastry_snack']);
  const intentAesthetic = toIntentRatio(input.intentCounts, ['aesthetic_photos']);

  const tagStudy = toTagScore(input.tagScores, ['Study', 'Quiet', 'Wi-Fi', 'Outlets']);
  const tagDate = toTagScore(input.tagScores, ['Cozy', 'Bright']);
  const tagSocial = toTagScore(input.tagScores, ['Social', 'Spacious', 'Late-night']);
  const tagQuick = toTagScore(input.tagScores, ['Good Coffee']);
  const tagAesthetic = toTagScore(input.tagScores, ['Bright', 'Cozy', 'Outdoor Seating']);

  const nlpStudy = input.nlp?.goodForStudying ? 1 : 0.35;
  const nlpDates = typeof input.nlp?.goodForDates === 'number' ? clamp(input.nlp.goodForDates * 100, 0, 100) / 100 : 0.4;
  const nlpGroups = typeof input.nlp?.goodForGroups === 'number' ? clamp(input.nlp.goodForGroups * 100, 0, 100) / 100 : 0.4;
  const nlpFood = typeof input.nlp?.foodQualitySignal === 'number' ? clamp(input.nlp.foodQualitySignal * 100, 0, 100) / 100 : 0.45;
  const nlpInstagram = typeof input.nlp?.instagramWorthy === 'number' ? clamp(input.nlp.instagramWorthy * 100, 0, 100) / 100 : 0.45;
  const nlpAestheticVibe = ['cozy', 'modern', 'rustic', 'industrial', 'classic'].includes(String(input.nlp?.aestheticVibe || '').toLowerCase()) ? 1 : 0.45;

  const photoAesthetic = hasPhotoTag(input.photoTags, ['aesthetic', 'decor', 'patio', 'latte', 'interior']) ? 1 : 0.4;
  const photoSocial = hasPhotoTag(input.photoTags, ['group', 'friends', 'seating']) ? 1 : 0.35;

  const study =
    12 +
    wifiScore * 22 +
    outlet * 14 +
    quietness * 16 +
    crowdCalm * 10 +
    laptopScore * 12 +
    intentStudy * 7 +
    tagStudy * 7 +
    nlpStudy * 8;

  const date =
    10 +
    drinkScore * 16 +
    ambianceCozy * 14 +
    sweetSpot(noise, 2, 3.4, 0.9) * 10 +
    crowdCalm * 6 +
    musicDate * 8 +
    nlpDates * 12 +
    nlpInstagram * 8 +
    tagDate * 6 +
    openBonus * 100;

  const social =
    10 +
    sweetSpot(energy * 5, 2.6, 4.2, 1.3) * 10 +
    crowdSocial * 12 +
    ambianceSocial * 12 +
    musicSocial * 10 +
    drinkScore * 6 +
    intentSocial * 8 +
    nlpGroups * 10 +
    tagSocial * 8 +
    photoSocial * 4 +
    openBonus * 100;

  const quick =
    12 +
    drinkScore * 22 +
    crowdCalm * 14 +
    budgetScore * 10 +
    intentQuick * 8 +
    nlpFood * 10 +
    tagQuick * 8 +
    rating * 8;

  const aesthetic =
    8 +
    nlpInstagram * 20 +
    nlpAestheticVibe * 10 +
    ambianceAesthetic * 16 +
    drinkScore * 8 +
    intentAesthetic * 8 +
    tagAesthetic * 8 +
    photoAesthetic * 12 +
    rating * 8;

  return {
    study: Math.round(clamp(study)),
    date: Math.round(clamp(date)),
    social: Math.round(clamp(social)),
    quick: Math.round(clamp(quick)),
    aesthetic: Math.round(clamp(aesthetic)),
  };
}

export function deriveVibeScoresFromSpot(spot: any): VibeScores {
  const outlet = typeof spot?.topOutletAvailability === 'string' ? spot.topOutletAvailability : null;
  return computeVibeScores({
    avgNoiseLevel: typeof spot?.avgNoiseLevel === 'number' ? spot.avgNoiseLevel : null,
    avgBusyness: typeof spot?.avgBusyness === 'number' ? spot.avgBusyness : null,
    avgWifiSpeed: typeof spot?.avgWifiSpeed === 'number' ? spot.avgWifiSpeed : null,
    avgDrinkQuality: typeof spot?.avgDrinkQuality === 'number' ? spot.avgDrinkQuality : null,
    avgDrinkPrice: typeof spot?.avgDrinkPrice === 'number' ? spot.avgDrinkPrice : null,
    topOutletAvailability: outlet,
    laptopFriendlyPct: typeof spot?.laptopFriendlyPct === 'number' ? spot.laptopFriendlyPct : null,
    intentCounts: spot?.intentScores || null,
    tagScores: spot?.tagScores || null,
    photoTags: Array.isArray(spot?.photoTags) ? spot.photoTags : null,
    externalRating: typeof spot?.intel?.avgRating === 'number' ? spot.intel.avgRating : typeof spot?.rating === 'number' ? spot.rating : null,
    openNow: spot?.openNow === true || spot?.intel?.isOpenNow === true,
    ambiance: typeof spot?.ambiance === 'string' ? spot.ambiance : typeof spot?.intel?.aestheticVibe === 'string' ? spot.intel.aestheticVibe : null,
    nlp: {
      goodForStudying: spot?.intel?.goodForStudying,
      goodForDates: spot?.intel?.goodForDates,
      goodForGroups: spot?.intel?.goodForGroups,
      instagramWorthy: spot?.intel?.instagramWorthy,
      foodQualitySignal: spot?.intel?.foodQualitySignal,
      aestheticVibe: spot?.intel?.aestheticVibe,
      musicAtmosphere: spot?.intel?.musicAtmosphere,
    },
  });
}

export function getPrimaryVibe(scores: VibeScores, context?: PrimaryVibeContext): VibeType {
  const entries = Object.entries(scores) as Array<[VibeType, number]>;
  entries.sort((a, b) => b[1] - a[1]);
  const top = entries[0]?.[0] || 'study';

  const hour = typeof context?.hour === 'number' ? context.hour : new Date().getHours();
  if (!context?.openNow && top === 'social' && hour < 10) return 'quick';
  return top;
}
