export const DISCOVERY_INTENT_VALUES = [
  'hangout_friends',
  'date_night',
  'coffee_quality',
  'pastry_snack',
  'aesthetic_photos',
  'quick_pickup',
  'deep_work',
  'quiet_reading',
  'group_study',
  'late_night_open',
] as const;

export type DiscoveryIntent = (typeof DISCOVERY_INTENT_VALUES)[number];
export type DiscoveryIntentFilter = DiscoveryIntent | 'any';

export type DiscoveryIntentOption = {
  key: DiscoveryIntentFilter;
  label: string;
  shortLabel: string;
  emoji: string;
  hint: string;
};

const INTENT_META: Record<DiscoveryIntent, Omit<DiscoveryIntentOption, 'key'>> = {
  hangout_friends: {
    label: 'Hangout with friends',
    shortLabel: 'Hangout',
    emoji: '🫶',
    hint: 'Lively spots with room to chat.',
  },
  date_night: {
    label: 'Date night',
    shortLabel: 'Date',
    emoji: '💞',
    hint: 'Cozy vibe and good atmosphere.',
  },
  coffee_quality: {
    label: 'Great coffee',
    shortLabel: 'Coffee',
    emoji: '☕',
    hint: 'Best drinks and specialty pours.',
  },
  pastry_snack: {
    label: 'Pastry or snack',
    shortLabel: 'Pastries',
    emoji: '🥐',
    hint: 'Strong bakery or snack options.',
  },
  aesthetic_photos: {
    label: 'Aesthetic photos',
    shortLabel: 'Aesthetic',
    emoji: '📸',
    hint: 'Beautiful interiors and photogenic setups.',
  },
  quick_pickup: {
    label: 'Quick pickup',
    shortLabel: 'Quick',
    emoji: '🏃',
    hint: 'Fast stop with minimal friction.',
  },
  deep_work: {
    label: 'Deep work',
    shortLabel: 'Work',
    emoji: '💻',
    hint: 'Reliable focus conditions and setup.',
  },
  quiet_reading: {
    label: 'Quiet reading',
    shortLabel: 'Quiet',
    emoji: '📖',
    hint: 'Low-noise places to read and recharge.',
  },
  group_study: {
    label: 'Group study',
    shortLabel: 'Group',
    emoji: '👥',
    hint: 'Seats and vibe for small groups.',
  },
  late_night_open: {
    label: 'Late-night open',
    shortLabel: 'Late',
    emoji: '🌙',
    hint: 'Good options for evening/night visits.',
  },
};

export const DISCOVERY_INTENT_OPTIONS: DiscoveryIntentOption[] = DISCOVERY_INTENT_VALUES.map((key) => ({
  key,
  ...INTENT_META[key],
}));

export const DISCOVERY_INTENT_FILTER_OPTIONS: DiscoveryIntentOption[] = [
  {
    key: 'any',
    label: 'Any vibe',
    shortLabel: 'Any',
    emoji: '✨',
    hint: 'Balanced ranking across use cases.',
  },
  ...DISCOVERY_INTENT_OPTIONS,
];

function toLowerString(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function toNoiseValue(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (value === 'quiet') return 2;
  if (value === 'moderate') return 3;
  if (value === 'lively' || value === 'loud') return 4;
  return null;
}

function toBusynessValue(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (value === 'empty') return 1;
  if (value === 'some') return 3;
  if (value === 'packed') return 5;
  return null;
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function hasAnyKeyword(value: string, words: string[]): boolean {
  return words.some((word) => value.includes(word));
}

function extractTags(input: any): string {
  if (!Array.isArray(input?.tags)) return '';
  return input.tags
    .filter((tag: unknown) => typeof tag === 'string')
    .map((tag: string) => tag.trim().toLowerCase())
    .join(' ');
}

export function normalizeDiscoveryIntent(value: unknown): DiscoveryIntent | null {
  const normalized = toLowerString(value);
  if (!normalized) return null;
  return (DISCOVERY_INTENT_VALUES as readonly string[]).includes(normalized)
    ? (normalized as DiscoveryIntent)
    : null;
}

export function sanitizeDiscoveryIntents(value: unknown, maxItems = 2): DiscoveryIntent[] {
  if (!Array.isArray(value)) return [];
  const deduped: DiscoveryIntent[] = [];
  value.forEach((entry) => {
    const next = normalizeDiscoveryIntent(entry);
    if (!next) return;
    if (deduped.includes(next)) return;
    if (deduped.length >= maxItems) return;
    deduped.push(next);
  });
  return deduped;
}

export function getDiscoveryIntentMeta(intent: DiscoveryIntentFilter): DiscoveryIntentOption {
  if (intent === 'any') return DISCOVERY_INTENT_FILTER_OPTIONS[0];
  return { key: intent, ...INTENT_META[intent] };
}

export function inferIntentsFromCheckin(checkin: any): DiscoveryIntent[] {
  const explicit = sanitizeDiscoveryIntents(checkin?.visitIntent);
  if (explicit.length) return explicit;

  const inferred = new Set<DiscoveryIntent>();
  const caption = toLowerString(checkin?.caption);
  const spotName = toLowerString(checkin?.spotName || checkin?.spot);
  const tags = extractTags(checkin);
  const haystack = `${caption} ${spotName} ${tags}`;

  if (hasAnyKeyword(haystack, ['social', 'hangout', 'friends', 'chat', 'vibes', 'crew'])) inferred.add('hangout_friends');
  if (hasAnyKeyword(haystack, ['date', 'romantic', 'cozy', 'cute'])) inferred.add('date_night');
  if (hasAnyKeyword(haystack, ['coffee', 'espresso', 'latte', 'pour over', 'specialty'])) inferred.add('coffee_quality');
  if (hasAnyKeyword(haystack, ['pastry', 'croissant', 'bakery', 'snack', 'dessert'])) inferred.add('pastry_snack');
  if (hasAnyKeyword(haystack, ['photo', 'aesthetic', 'instagram', 'beautiful', 'bright'])) inferred.add('aesthetic_photos');
  if (hasAnyKeyword(haystack, ['quick', 'grab', 'pickup', 'takeaway', 'to-go'])) inferred.add('quick_pickup');
  if (hasAnyKeyword(haystack, ['work', 'focus', 'laptop', 'productive'])) inferred.add('deep_work');
  if (hasAnyKeyword(haystack, ['read', 'book', 'quiet', 'calm'])) inferred.add('quiet_reading');
  if (hasAnyKeyword(haystack, ['group', 'study', 'team', 'meeting'])) inferred.add('group_study');
  if (hasAnyKeyword(haystack, ['late-night', 'late night', 'night', 'open late'])) inferred.add('late_night_open');

  const noise = toNoiseValue(checkin?.noiseLevel);
  const busyness = toBusynessValue(checkin?.busyness);
  const wifi = toNumber(checkin?.wifiSpeed);
  const drinkQuality = toNumber(checkin?.drinkQuality);
  const openNow = checkin?.openNow === true;

  if (busyness !== null && busyness >= 3 && noise !== null && noise >= 3) inferred.add('hangout_friends');
  if (noise !== null && noise <= 2.4) inferred.add('quiet_reading');
  if (wifi !== null && wifi >= 4) inferred.add('deep_work');
  if (drinkQuality !== null && drinkQuality >= 4) inferred.add('coffee_quality');
  if (openNow && new Date().getHours() >= 20) inferred.add('late_night_open');

  if (!inferred.size) inferred.add('coffee_quality');
  return Array.from(inferred).slice(0, 2);
}

function getIntentVotesFromSpot(spot: any, intent: DiscoveryIntent): { votes: number; total: number } {
  const intentScores = spot?.intentScores && typeof spot.intentScores === 'object' ? spot.intentScores : null;
  if (intentScores) {
    const votes = toNumber(intentScores[intent]) || 0;
    const total = Object.values(intentScores)
      .map((value) => toNumber(value) || 0)
      .reduce((sum, value) => sum + value, 0);
    if (total > 0) return { votes, total };
  }

  const checkins = Array.isArray(spot?._checkins) ? spot._checkins : [];
  if (!checkins.length) return { votes: 0, total: 0 };

  let votes = 0;
  let total = 0;
  checkins.forEach((checkin: any) => {
    const intents = inferIntentsFromCheckin(checkin);
    if (!intents.length) return;
    total += 1;
    if (intents.includes(intent)) votes += 1;
  });

  return { votes, total };
}

export type IntentSignal = {
  score: number;
  reasons: string[];
};

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function scoreSpotForIntent(spot: any, intent: DiscoveryIntentFilter): IntentSignal {
  if (intent === 'any') {
    return {
      score: 0.5,
      reasons: ['Balanced ranking across coffee vibes'],
    };
  }

  const reasons: string[] = [];
  const { votes, total } = getIntentVotesFromSpot(spot, intent);
  const voteRatio = total > 0 ? votes / total : 0;
  let score = voteRatio * 0.55;

  if (votes >= 3) reasons.push(`${votes} recent check-ins for ${getDiscoveryIntentMeta(intent).shortLabel.toLowerCase()}`);
  else if (votes > 0) reasons.push('Recent community activity for this vibe');

  const noise = toNoiseValue(spot?.avgNoiseLevel ?? spot?.display?.noise ?? spot?.live?.noise ?? spot?.intel?.inferredNoise);
  const busyness = toBusynessValue(spot?.avgBusyness ?? spot?.display?.busyness ?? spot?.live?.busyness);
  const rating = toNumber(spot?.intel?.avgRating) || toNumber(spot?.rating);
  const distance = toNumber(spot?.distance);
  const openNow = spot?.openNow === true || spot?.intel?.isOpenNow === true;
  const wifi = toNumber(spot?.avgWifiSpeed) || toNumber(spot?.wifiSpeed);
  const drinkQuality = toNumber(spot?.avgDrinkQuality) || toNumber(spot?.drinkQuality);

  switch (intent) {
    case 'hangout_friends':
      if (busyness !== null && busyness >= 2.5 && busyness <= 4.4) {
        score += 0.14;
        reasons.push('Good social energy');
      }
      if (noise !== null && noise >= 2.8 && noise <= 4.4) score += 0.1;
      if ((toNumber(spot?.hereNowCount) || 0) > 0) reasons.push('People are here now');
      break;
    case 'date_night':
      if (openNow) score += 0.12;
      if (noise !== null && noise >= 2 && noise <= 3.6) score += 0.12;
      if (rating !== null && rating >= 4.2) {
        score += 0.1;
        reasons.push('Strong ratings for ambiance');
      }
      break;
    case 'coffee_quality':
      if (drinkQuality !== null && drinkQuality >= 3.8) {
        score += 0.14;
        reasons.push('Great drink quality from check-ins');
      }
      if (rating !== null && rating >= 4.1) score += 0.12;
      break;
    case 'pastry_snack':
      if (rating !== null && rating >= 4) score += 0.1;
      if (hasAnyKeyword(extractTags(spot), ['pastries', 'bakery', 'snack', 'dessert'])) {
        score += 0.14;
        reasons.push('Known for pastries and snacks');
      }
      break;
    case 'aesthetic_photos':
      if (hasAnyKeyword(extractTags(spot), ['bright', 'spacious', 'cozy', 'aesthetic'])) {
        score += 0.16;
        reasons.push('Photogenic interior tags');
      }
      if (rating !== null && rating >= 4.1) score += 0.08;
      break;
    case 'quick_pickup':
      if (distance !== null && distance <= 1.2) {
        score += 0.16;
        reasons.push('Very close by');
      }
      if (busyness !== null && busyness <= 3) score += 0.08;
      break;
    case 'deep_work':
      if (wifi !== null && wifi >= 4) score += 0.14;
      if (noise !== null && noise <= 2.8) score += 0.12;
      break;
    case 'quiet_reading':
      if (noise !== null && noise <= 2.2) {
        score += 0.16;
        reasons.push('Usually quiet');
      }
      if (busyness !== null && busyness <= 2.8) score += 0.08;
      break;
    case 'group_study':
      if (busyness !== null && busyness >= 2.3 && busyness <= 3.8) score += 0.14;
      if (wifi !== null && wifi >= 3.2) score += 0.08;
      break;
    case 'late_night_open':
      if (openNow) {
        score += 0.16;
        reasons.push('Open now');
      }
      if (hasAnyKeyword(extractTags(spot), ['late-night', 'late night'])) score += 0.12;
      break;
  }

  const finalScore = clamp(score, 0, 1);
  if (!reasons.length) reasons.push(getDiscoveryIntentMeta(intent).hint);
  return { score: Number(finalScore.toFixed(3)), reasons: Array.from(new Set(reasons)).slice(0, 3) };
}
