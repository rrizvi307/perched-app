export interface FilterState {
  distance: number;
  openNow: boolean;
  noiseLevel: 'any' | 'quiet' | 'moderate' | 'loud';
  notCrowded: boolean;
  priceLevel: ('$' | '$$' | '$$$')[];
  highRated: boolean;
  goodForStudying: boolean;
  goodForMeetings: boolean;
}

export const FIRESTORE_FILTERS: (keyof FilterState)[] = [
  'openNow',
  'priceLevel',
  'goodForStudying',
  'goodForMeetings',
];

export const CLIENT_FILTERS: (keyof FilterState)[] = [
  'distance',
  'noiseLevel',
  'notCrowded',
  'highRated',
];

export const MAX_FIRESTORE_FILTERS = 3;

export const DEFAULT_FILTERS: FilterState = {
  distance: 2,
  openNow: false,
  noiseLevel: 'any',
  notCrowded: false,
  priceLevel: [],
  highRated: false,
  goodForStudying: false,
  goodForMeetings: false,
};

export function getActiveFilterCount(filters: FilterState) {
  let count = 0;
  if (filters.distance !== DEFAULT_FILTERS.distance) count += 1;
  if (filters.openNow) count += 1;
  if (filters.noiseLevel !== 'any') count += 1;
  if (filters.notCrowded) count += 1;
  if (filters.priceLevel.length > 0) count += 1;
  if (filters.highRated) count += 1;
  if (filters.goodForStudying) count += 1;
  if (filters.goodForMeetings) count += 1;
  return count;
}

export function hasActiveFilters(filters: FilterState) {
  return getActiveFilterCount(filters) > 0;
}

export function getActiveFirestoreFilterCount(filters: FilterState) {
  let count = 0;
  if (filters.openNow) count += 1;
  if (filters.priceLevel.length > 0) count += 1;
  if (filters.goodForStudying) count += 1;
  if (filters.goodForMeetings) count += 1;
  return count;
}

export interface QueryFilterNormalizationResult {
  normalized: FilterState;
  activeFirestoreFilters: Array<'openNow' | 'priceLevel' | 'goodForStudying' | 'goodForMeetings'>;
  downgraded: Array<'openNow' | 'priceLevel' | 'goodForStudying' | 'goodForMeetings'>;
}

/**
 * Ensures server-side filter count stays under cap to avoid slow/highly constrained
 * Firestore query paths. Any downgraded filters are expected to run client-side.
 */
export function normalizeQueryFilters(
  filters: FilterState,
  maxFirestoreFilters: number = MAX_FIRESTORE_FILTERS
): QueryFilterNormalizationResult {
  const normalized: FilterState = { ...filters };
  const downgraded: QueryFilterNormalizationResult['downgraded'] = [];

  const priorityToDowngrade: QueryFilterNormalizationResult['downgraded'] = [
    'goodForMeetings',
    'goodForStudying',
    'openNow',
    'priceLevel',
  ];

  while (getActiveFirestoreFilterCount(normalized) > maxFirestoreFilters) {
    const key = priorityToDowngrade.find((candidate) => {
      if (candidate === 'priceLevel') return normalized.priceLevel.length > 0;
      return normalized[candidate] === true;
    });

    if (!key) break;

    if (key === 'priceLevel') normalized.priceLevel = [];
    else (normalized as any)[key] = false;

    downgraded.push(key);
  }

  const activeFirestoreFilters: QueryFilterNormalizationResult['activeFirestoreFilters'] = [];
  if (normalized.openNow) activeFirestoreFilters.push('openNow');
  if (normalized.priceLevel.length > 0) activeFirestoreFilters.push('priceLevel');
  if (normalized.goodForStudying) activeFirestoreFilters.push('goodForStudying');
  if (normalized.goodForMeetings) activeFirestoreFilters.push('goodForMeetings');

  return {
    normalized,
    downgraded,
    activeFirestoreFilters,
  };
}
