const {
  DEFAULT_PLACE_PROVIDER_SMOKE_QUERIES,
  getSmokeQueries,
  parseSmokeQueries,
  selectSmokeResult,
} = require('../place-provider-smoke-check.js');

describe('place provider smoke check helpers', () => {
  it('uses the default deterministic query set when no overrides are provided', () => {
    expect(getSmokeQueries({ argv: ['node', 'script'], env: {} })).toEqual(
      DEFAULT_PLACE_PROVIDER_SMOKE_QUERIES,
    );
  });

  it('parses environment query lists', () => {
    expect(parseSmokeQueries('Blacksmith Houston TX, Catalina Coffee Houston TX')).toEqual([
      'Blacksmith Houston TX',
      'Catalina Coffee Houston TX',
    ]);
    expect(parseSmokeQueries('Agora Houston TX\nBoomtown Coffee Houston TX')).toEqual([
      'Agora Houston TX',
      'Boomtown Coffee Houston TX',
    ]);
  });

  it('prefers repeated CLI query flags over env defaults', () => {
    expect(
      getSmokeQueries({
        argv: [
          'node',
          'script',
          '--query',
          'Catalina Coffee Houston TX',
          '--query',
          'Boomtown Coffee Houston TX',
        ],
        env: { PLACE_PROVIDER_SMOKE_QUERY: 'Blacksmith Houston TX' },
      }),
    ).toEqual([
      'Catalina Coffee Houston TX',
      'Boomtown Coffee Houston TX',
    ]);
  });

  it('treats missing provider photos as a warning when strict photo mode is disabled', () => {
    const outcome = selectSmokeResult([
      {
        ok: true,
        query: 'Blacksmith Houston TX',
        placeName: 'Blacksmith',
        searchCount: 1,
        nearbyCount: 4,
        externalSignalsCount: 1,
        providerPhotosCount: 0,
        hasGoogleSnapshot: true,
      },
    ]);

    expect(outcome.ok).toBe(true);
    expect(outcome.warning).toContain('provider photos unavailable');
    expect(outcome.chosenAttempt.query).toBe('Blacksmith Houston TX');
  });

  it('requires a photo-backed success when strict photo mode is enabled', () => {
    const outcome = selectSmokeResult([
      {
        ok: true,
        query: 'Blacksmith Houston TX',
        placeName: 'Blacksmith',
        searchCount: 1,
        nearbyCount: 4,
        externalSignalsCount: 1,
        providerPhotosCount: 0,
        hasGoogleSnapshot: true,
      },
      {
        ok: false,
        query: 'Catalina Coffee Houston TX',
        error: 'search_text failed',
      },
    ], true);

    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('no provider photos');
  });

  it('prefers a photo-backed success when one exists', () => {
    const outcome = selectSmokeResult([
      {
        ok: true,
        query: 'Blacksmith Houston TX',
        placeName: 'Blacksmith',
        searchCount: 1,
        nearbyCount: 4,
        externalSignalsCount: 1,
        providerPhotosCount: 0,
        hasGoogleSnapshot: true,
      },
      {
        ok: true,
        query: 'Boomtown Coffee Houston TX',
        placeName: 'Boomtown Coffee',
        searchCount: 2,
        nearbyCount: 5,
        externalSignalsCount: 2,
        providerPhotosCount: 1,
        hasGoogleSnapshot: true,
      },
    ]);

    expect(outcome.ok).toBe(true);
    expect(outcome.warning).toBeNull();
    expect(outcome.chosenAttempt.query).toBe('Boomtown Coffee Houston TX');
  });
});
