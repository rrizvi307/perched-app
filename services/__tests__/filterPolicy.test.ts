import {
  CLIENT_FILTERS,
  DEFAULT_FILTERS,
  FIRESTORE_FILTERS,
  MAX_FIRESTORE_FILTERS,
  FilterState,
  getActiveFilterCount,
  getActiveFirestoreFilterCount,
  hasActiveFilters,
  normalizeQueryFilters,
} from '../filterPolicy';

describe('filterPolicy', () => {
  function build(overrides: Partial<FilterState> = {}): FilterState {
    return { ...DEFAULT_FILTERS, ...overrides };
  }

  it('defines expected Firestore and client filter sets', () => {
    expect(FIRESTORE_FILTERS).toEqual(['openNow', 'priceLevel', 'goodForStudying', 'goodForMeetings']);
    expect(CLIENT_FILTERS).toEqual(['distance', 'noiseLevel', 'notCrowded', 'highRated']);
    expect(MAX_FIRESTORE_FILTERS).toBe(3);
  });

  it('counts active filters correctly', () => {
    const filters = build({
      openNow: true,
      highRated: true,
      priceLevel: ['$$'],
      noiseLevel: 'quiet',
    });

    expect(getActiveFilterCount(filters)).toBe(4);
  });

  it('reports no active filters for defaults', () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
  });

  it('reports active filters when any filter enabled', () => {
    expect(hasActiveFilters(build({ openNow: true }))).toBe(true);
  });

  it('counts active Firestore filters correctly', () => {
    const filters = build({
      openNow: true,
      priceLevel: ['$', '$$'],
      goodForStudying: true,
      goodForMeetings: false,
    });

    expect(getActiveFirestoreFilterCount(filters)).toBe(3);
  });

  it('does not downgrade when Firestore filter count is within limit', () => {
    const filters = build({
      openNow: true,
      priceLevel: ['$$'],
      goodForStudying: true,
    });

    const result = normalizeQueryFilters(filters);

    expect(result.downgraded).toEqual([]);
    expect(result.normalized).toEqual(filters);
    expect(result.activeFirestoreFilters).toEqual(['openNow', 'priceLevel', 'goodForStudying']);
  });

  it('downgrades lowest-priority Firestore filter when over limit', () => {
    const filters = build({
      openNow: true,
      priceLevel: ['$$'],
      goodForStudying: true,
      goodForMeetings: true,
    });

    const result = normalizeQueryFilters(filters);

    expect(result.downgraded).toEqual(['goodForMeetings']);
    expect(result.normalized.goodForMeetings).toBe(false);
    expect(result.activeFirestoreFilters).toEqual(['openNow', 'priceLevel', 'goodForStudying']);
  });

  it('can aggressively cap to two Firestore filters', () => {
    const filters = build({
      openNow: true,
      priceLevel: ['$$'],
      goodForStudying: true,
      goodForMeetings: true,
    });

    const result = normalizeQueryFilters(filters, 2);

    expect(result.activeFirestoreFilters).toHaveLength(2);
    expect(result.downgraded).toEqual(['goodForMeetings', 'goodForStudying']);
    expect(result.normalized.openNow).toBe(true);
    expect(result.normalized.priceLevel).toEqual(['$$']);
  });

  it('can cap to one Firestore filter and preserves order of downgrades', () => {
    const filters = build({
      openNow: true,
      priceLevel: ['$$'],
      goodForStudying: true,
      goodForMeetings: true,
    });

    const result = normalizeQueryFilters(filters, 1);

    expect(result.activeFirestoreFilters).toHaveLength(1);
    expect(result.downgraded).toEqual(['goodForMeetings', 'goodForStudying', 'openNow']);
    expect(result.normalized.priceLevel).toEqual(['$$']);
  });

  it('does not mutate original filter object', () => {
    const filters = build({
      openNow: true,
      priceLevel: ['$$'],
      goodForStudying: true,
      goodForMeetings: true,
    });

    const copy = JSON.parse(JSON.stringify(filters));
    normalizeQueryFilters(filters);

    expect(filters).toEqual(copy);
  });

  it('handles empty price level as inactive Firestore filter', () => {
    const filters = build({
      openNow: true,
      priceLevel: [],
      goodForStudying: true,
      goodForMeetings: true,
    });

    const result = normalizeQueryFilters(filters);

    expect(result.activeFirestoreFilters).toEqual(['openNow', 'goodForStudying', 'goodForMeetings']);
    expect(result.downgraded).toEqual([]);
  });
});
