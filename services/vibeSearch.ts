import type { FilterState } from './filterPolicy';
import { scoreSpotForIntent, type DiscoveryIntent } from './discoveryIntents';

export type ParsedCoffeeQuery = {
  rawQuery: string;
  normalizedQuery: string;
  matched: boolean;
  confidence: number;
  suggestedIntent: DiscoveryIntent | null;
  ambiance: 'cozy' | 'modern' | 'rustic' | 'bright' | 'intimate' | 'energetic' | null;
  filters: Partial<FilterState>;
  explanation: string[];
};

type QueryBoost = {
  boost: number;
  reasons: string[];
};

function hasAny(haystack: string, words: string[]) {
  return words.some((word) => haystack.includes(word));
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function parseCoffeeQuery(query: string): ParsedCoffeeQuery {
  const normalized = String(query || '').trim().toLowerCase();
  if (!normalized) {
    return {
      rawQuery: query,
      normalizedQuery: '',
      matched: false,
      confidence: 0,
      suggestedIntent: null,
      ambiance: null,
      filters: {},
      explanation: [],
    };
  }

  const filters: Partial<FilterState> = {};
  const explanation: string[] = [];
  let intent: DiscoveryIntent | null = null;
  let ambiance: ParsedCoffeeQuery['ambiance'] = null;
  let score = 0;

  if (hasAny(normalized, ['date', 'romantic', 'anniversary', 'cute'])) {
    intent = 'date_night';
    explanation.push('date night');
    score += 0.35;
  } else if (hasAny(normalized, ['study', 'work', 'laptop', 'focus'])) {
    intent = 'deep_work';
    explanation.push('study/work');
    score += 0.35;
  } else if (hasAny(normalized, ['read', 'book', 'quiet'])) {
    intent = 'quiet_reading';
    explanation.push('quiet reading');
    score += 0.3;
  } else if (hasAny(normalized, ['friends', 'hangout', 'social', 'group'])) {
    intent = 'hangout_friends';
    explanation.push('social hangout');
    score += 0.35;
  } else if (hasAny(normalized, ['quick', 'pickup', 'grab and go', 'to-go'])) {
    intent = 'quick_pickup';
    explanation.push('quick pickup');
    score += 0.35;
  } else if (hasAny(normalized, ['aesthetic', 'instagram', 'photo', 'photogenic'])) {
    intent = 'aesthetic_photos';
    explanation.push('aesthetic photos');
    score += 0.35;
  } else if (hasAny(normalized, ['pastry', 'croissant', 'snack', 'bakery'])) {
    intent = 'pastry_snack';
    explanation.push('pastry/snack');
    score += 0.3;
  } else if (hasAny(normalized, ['coffee', 'espresso', 'latte', 'pour over'])) {
    intent = 'coffee_quality';
    explanation.push('coffee quality');
    score += 0.25;
  }

  if (hasAny(normalized, ['cozy', 'warm', 'intimate'])) {
    ambiance = normalized.includes('intimate') ? 'intimate' : 'cozy';
    explanation.push(`${ambiance} ambiance`);
    score += 0.2;
  } else if (hasAny(normalized, ['modern', 'minimal'])) {
    ambiance = 'modern';
    explanation.push('modern ambiance');
    score += 0.2;
  } else if (hasAny(normalized, ['rustic', 'wood', 'vintage'])) {
    ambiance = 'rustic';
    explanation.push('rustic ambiance');
    score += 0.2;
  } else if (hasAny(normalized, ['bright', 'sunny', 'daylight'])) {
    ambiance = 'bright';
    explanation.push('bright ambiance');
    score += 0.2;
  } else if (hasAny(normalized, ['energetic', 'lively'])) {
    ambiance = 'energetic';
    explanation.push('energetic ambiance');
    score += 0.2;
  }

  if (hasAny(normalized, ['not crowded', 'uncrowded', 'empty'])) {
    filters.notCrowded = true;
    explanation.push('not crowded');
    score += 0.18;
  }
  if (hasAny(normalized, ['quiet', 'silent', 'calm'])) {
    filters.noiseLevel = 'quiet';
    explanation.push('quiet');
    score += 0.18;
  } else if (hasAny(normalized, ['loud', 'buzzing', 'noisy'])) {
    filters.noiseLevel = 'loud';
    explanation.push('lively noise');
    score += 0.16;
  }
  if (hasAny(normalized, ['cheap', 'affordable', 'budget'])) {
    filters.priceLevel = ['$'];
    explanation.push('budget friendly');
    score += 0.16;
  }
  if (hasAny(normalized, ['open now', 'right now'])) {
    filters.openNow = true;
    explanation.push('open now');
    score += 0.12;
  }
  if (hasAny(normalized, ['high rated', 'top rated', 'best rated'])) {
    filters.highRated = true;
    explanation.push('high rated');
    score += 0.1;
  }

  const confidence = clamp(score, 0, 1);
  return {
    rawQuery: query,
    normalizedQuery: normalized,
    matched: confidence >= 0.2,
    confidence,
    suggestedIntent: intent,
    ambiance,
    filters,
    explanation: Array.from(new Set(explanation)),
  };
}

export function applyParsedQueryBoost(spot: any, parsed: ParsedCoffeeQuery): QueryBoost {
  if (!parsed.matched) return { boost: 0, reasons: [] };

  let boost = 0;
  const reasons: string[] = [];

  if (parsed.suggestedIntent) {
    const signal = scoreSpotForIntent(spot, parsed.suggestedIntent);
    boost += signal.score * 20;
    if (signal.reasons.length) reasons.push(signal.reasons[0]);
  }

  const spotNoise = String(spot?.display?.noise || spot?.live?.noise || spot?.intel?.inferredNoise || '').toLowerCase();
  if (parsed.filters.noiseLevel && parsed.filters.noiseLevel !== 'any') {
    if (spotNoise === parsed.filters.noiseLevel) {
      boost += 8;
      reasons.push(`matches ${parsed.filters.noiseLevel} vibe`);
    } else {
      boost -= 4;
    }
  }

  if (parsed.filters.notCrowded) {
    const busyness = typeof spot?.avgBusyness === 'number' ? spot.avgBusyness : 3;
    if (busyness <= 2.8) {
      boost += 8;
      reasons.push('typically not crowded');
    } else if (busyness > 3.8) {
      boost -= 5;
    }
  }

  if (parsed.filters.priceLevel?.length) {
    const priceLevel = String(spot?.intel?.priceLevel || spot?.priceLevel || '').trim();
    if (priceLevel && parsed.filters.priceLevel.includes(priceLevel as '$' | '$$' | '$$$')) {
      boost += 6;
      reasons.push('matches budget');
    }
  }

  if (parsed.ambiance) {
    const haystack = `${spot?.name || ''} ${spot?.description || ''} ${(spot?.tags || []).join(' ')} ${(spot?.photoTags || []).join(' ')}`.toLowerCase();
    if (haystack.includes(parsed.ambiance)) {
      boost += 6;
      reasons.push(`${parsed.ambiance} feel`);
    }
  }

  return { boost, reasons: Array.from(new Set(reasons)).slice(0, 2) };
}
