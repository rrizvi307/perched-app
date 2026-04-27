import { scoreSpotForIntent, type DiscoveryIntentFilter } from './discoveryIntents';

export type RecommendationSource = 'personalized' | 'collaborative' | 'explore';

export type SpotUtilitySnapshot = {
  wifiQuality: number | null;
  noiseLevel: number | null;
  crowdLevel: number | null;
  outletAvailability: number | null;
  overallVibe: number | null;
  rating: number | null;
  hereNowCount: number;
  checkinCount: number;
  openNow: boolean | null;
};

export type RecommendationCandidate = {
  spotId: string;
  name: string;
  score: number;
  reasons: string[];
  intent: DiscoveryIntentFilter;
  distanceMeters: number | null;
  liveSignals: SpotUtilitySnapshot;
  source: RecommendationSource;
};

type IntentSignal = {
  score: number;
  reasons: string[];
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toNoiseScore(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(1, Math.min(5, value));
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'quiet') return 2;
  if (normalized === 'moderate') return 3;
  if (normalized === 'lively' || normalized === 'loud') return 4;
  return null;
}

function toCrowdScore(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(1, Math.min(5, value));
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'empty') return 1;
  if (normalized === 'some') return 3;
  if (normalized === 'packed') return 5;
  return null;
}

function toOutletScore(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(1, Math.min(5, value));
  if (typeof value === 'boolean') return value ? 4 : 1;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'plenty') return 5;
  if (normalized === 'some') return 4;
  if (normalized === 'few') return 2;
  if (normalized === 'none') return 1;
  return null;
}

function getIntentUtilitySignal(snapshot: SpotUtilitySnapshot, intent: DiscoveryIntentFilter) {
  const reasons: string[] = [];
  let score = 0;

  switch (intent) {
    case 'deep_work':
    case 'quiet_reading':
    case 'group_study':
      if ((snapshot.wifiQuality || 0) >= 4) {
        score += 8;
        reasons.push('Reliable WiFi right now');
      }
      if ((snapshot.outletAvailability || 0) >= 4) {
        score += 7;
        reasons.push('Easy outlet access');
      }
      if ((snapshot.noiseLevel || 0) > 0 && (snapshot.noiseLevel || 0) <= 2.5) {
        score += 8;
        reasons.push('Quieter than most spots nearby');
      }
      if ((snapshot.crowdLevel || 0) > 0 && (snapshot.crowdLevel || 0) <= 3) {
        score += 5;
      }
      break;
    case 'hangout_friends':
      if ((snapshot.crowdLevel || 0) >= 3 && (snapshot.crowdLevel || 0) <= 4.5) {
        score += 7;
        reasons.push('Good social energy without feeling slammed');
      }
      if ((snapshot.overallVibe || 0) >= 4) {
        score += 7;
        reasons.push('Strong overall vibe');
      }
      break;
    case 'date_night':
    case 'aesthetic_photos':
      if ((snapshot.overallVibe || 0) >= 4) {
        score += 9;
        reasons.push('Strong overall vibe');
      }
      if ((snapshot.rating || 0) >= 4.3) {
        score += 5;
      }
      break;
    case 'coffee_quality':
      if ((snapshot.rating || 0) >= 4.3) {
        score += 9;
        reasons.push('Strong community ratings');
      }
      if ((snapshot.overallVibe || 0) >= 4) {
        score += 4;
      }
      break;
    case 'quick_pickup':
      if ((snapshot.crowdLevel || 0) > 0 && (snapshot.crowdLevel || 0) <= 3) {
        score += 7;
        reasons.push('Lower friction right now');
      }
      break;
    case 'late_night_open':
      if (snapshot.openNow === true) {
        score += 10;
        reasons.push('Open now');
      }
      break;
    case 'pastry_snack':
      if ((snapshot.rating || 0) >= 4.1) {
        score += 5;
        reasons.push('Well-liked by the community');
      }
      if ((snapshot.overallVibe || 0) >= 4) {
        score += 4;
      }
      break;
    case 'any':
    default:
      if ((snapshot.wifiQuality || 0) >= 4) reasons.push('Reliable WiFi right now');
      if ((snapshot.outletAvailability || 0) >= 4) reasons.push('Easy outlet access');
      if ((snapshot.overallVibe || 0) >= 4) reasons.push('Strong overall vibe');
      break;
  }

  if (snapshot.openNow === true && !reasons.includes('Open now')) reasons.push('Open now');
  if (snapshot.hereNowCount >= 3) reasons.push(`${snapshot.hereNowCount} people here now`);

  return {
    score,
    reasons: Array.from(new Set(reasons)),
  };
}

export function buildSpotUtilitySnapshot(spot: any): SpotUtilitySnapshot {
  return {
    wifiQuality:
      toNumber(spot?.avgWifiSpeed) ??
      toNumber(spot?.wifiSpeed) ??
      toNumber(spot?.live?.wifiSpeed) ??
      null,
    noiseLevel:
      toNoiseScore(spot?.avgNoiseLevel) ??
      toNoiseScore(spot?.display?.noise) ??
      toNoiseScore(spot?.live?.noise) ??
      toNoiseScore(spot?.intel?.inferredNoise) ??
      null,
    crowdLevel:
      toCrowdScore(spot?.avgBusyness) ??
      toCrowdScore(spot?.display?.busyness) ??
      toCrowdScore(spot?.live?.busyness) ??
      null,
    outletAvailability:
      toOutletScore(spot?.topOutletAvailability) ??
      toOutletScore(spot?.outletAvailability) ??
      toOutletScore(spot?.intel?.outletAvailability) ??
      null,
    overallVibe:
      toNumber(spot?.avgOverallVibe) ??
      toNumber(spot?.overallVibe) ??
      toNumber(spot?.avgDrinkQuality) ??
      toNumber(spot?.drinkQuality) ??
      null,
    rating:
      toNumber(spot?.intel?.avgRating) ??
      toNumber(spot?.aggregateRating) ??
      toNumber(spot?.rating) ??
      null,
    hereNowCount: Math.max(0, Math.round(toNumber(spot?.hereNowCount) || 0)),
    checkinCount: Math.max(0, Math.round(toNumber(spot?.count) || toNumber(spot?.checkinCount) || 0)),
    openNow:
      typeof spot?.openNow === 'boolean'
        ? spot.openNow
        : typeof spot?.intel?.isOpenNow === 'boolean'
          ? spot.intel.isOpenNow
          : null,
  };
}

export function buildUtilityReasonsFromSnapshot(
  snapshot: SpotUtilitySnapshot,
  intent: DiscoveryIntentFilter,
) {
  return getIntentUtilitySignal(snapshot, intent).reasons;
}

export function buildExploreRecommendationCandidate(
  spot: any,
  options: {
    intent: DiscoveryIntentFilter;
    queryBoost?: number;
    intentSignal?: IntentSignal | null;
  },
): RecommendationCandidate {
  const intentSignal = options.intentSignal ?? scoreSpotForIntent(spot, options.intent);
  const liveSignals = buildSpotUtilitySnapshot(spot);
  const utilitySignal = getIntentUtilitySignal(liveSignals, options.intent);
  const distanceKm = toNumber(spot?.distance);
  const distanceMeters = distanceKm !== null ? Math.round(distanceKm * 1000) : null;

  let score = 28;
  score += Math.max(0, Math.min(1, intentSignal.score || 0)) * 34;
  score += utilitySignal.score;
  score += Math.max(-4, Math.min(8, options.queryBoost || 0));

  if (distanceKm !== null) {
    score += Math.max(0, 18 - distanceKm * 4.5);
  }
  if ((liveSignals.rating || 0) >= 4) {
    score += ((liveSignals.rating || 0) - 4) * 10;
  }
  if (liveSignals.openNow === true) {
    score += 5;
  }
  if (liveSignals.hereNowCount > 0) {
    score += Math.min(8, liveSignals.hereNowCount * 2);
  }
  if (liveSignals.checkinCount > 0) {
    score += Math.min(7, liveSignals.checkinCount / 6);
  }

  const distanceReason =
    distanceKm !== null && distanceKm < 1.2 ? [`${distanceKm.toFixed(1)} km away`] : [];
  const reasons = Array.from(
    new Set([
      ...(intentSignal.reasons || []),
      ...utilitySignal.reasons,
      ...distanceReason,
    ]),
  ).slice(0, 4);

  return {
    spotId: String(spot?.placeId || spot?.id || spot?.key || '').trim() || String(spot?.name || 'spot'),
    name: String(spot?.name || 'Unknown'),
    score: clamp(score),
    reasons,
    intent: options.intent,
    distanceMeters,
    liveSignals,
    source: 'explore',
  };
}
