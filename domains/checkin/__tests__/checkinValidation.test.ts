import {
  countProvidedSpotIntel,
  getMinimumCheckinGapMs,
  validateCheckinSubmission,
} from '../checkinValidation';

describe('validateCheckinSubmission', () => {
  it('rejects unauthenticated posts', () => {
    expect(
      validateCheckinSubmission({
        hasImage: true,
        userId: null,
      }),
    ).toEqual({
      ok: false,
      reason: 'missing_user',
      message: 'Please sign in to post a check-in.',
    });
  });

  it('rejects unverified email posts', () => {
    expect(
      validateCheckinSubmission({
        hasImage: true,
        userId: 'u1',
        userEmail: 'test@example.com',
        userEmailVerified: false,
      }),
    ).toEqual({
      ok: false,
      reason: 'email_unverified',
      message: 'Verify your email before posting.',
    });
  });

  it('rejects missing lookup-backed spots', () => {
    expect(
      validateCheckinSubmission({
        hasImage: true,
        userId: 'u1',
        userEmailVerified: true,
        spot: 'Cafe',
        placeId: '',
        location: null,
      }),
    ).toEqual({
      ok: false,
      reason: 'missing_spot',
      message: 'Please select a spot from lookup.',
    });
  });

  it('rejects empty context when caption and tags are both missing', () => {
    expect(
      validateCheckinSubmission({
        hasImage: true,
        userId: 'u1',
        userEmailVerified: true,
        spot: 'Cafe',
        placeId: 'place-1',
        location: { lat: 1, lng: 2 },
        caption: '  ',
        selectedTags: [],
      }),
    ).toEqual({
      ok: false,
      reason: 'missing_context',
      message: 'Add a short caption or select a tag.',
    });
  });

  it('enforces the public posting cooldown', () => {
    expect(
      validateCheckinSubmission({
        hasImage: true,
        userId: 'u1',
        userEmailVerified: true,
        spot: 'Cafe',
        placeId: 'place-1',
        location: { lat: 1, lng: 2 },
        caption: 'Working here',
        selectedTags: [],
        visibility: 'public',
        lastCheckinAt: 1_000,
        now: 1_000 + getMinimumCheckinGapMs('public') - 60_000,
      }),
    ).toEqual({
      ok: false,
      reason: 'rate_limited',
      message: 'You can post again in about 1 minute.',
      retryInMinutes: 1,
    });
  });

  it('returns success with metrics count for valid submissions', () => {
    expect(
      validateCheckinSubmission({
        hasImage: true,
        userId: 'u1',
        userEmailVerified: true,
        spot: 'Cafe',
        placeId: 'place-1',
        location: { lat: 1, lng: 2 },
        caption: 'Working here',
        selectedTags: [],
        visibility: 'friends',
        noiseLevel: 2,
        wifiSpeed: 4,
      }),
    ).toEqual({
      ok: true,
      metricsProvided: 2,
    });
  });
});

describe('countProvidedSpotIntel', () => {
  it('counts only defined intel fields', () => {
    expect(
      countProvidedSpotIntel({
        noiseLevel: 2,
        busyness: null,
        overallVibe: 4,
        wifiSpeed: 5,
        outletAvailability: 4,
      }),
    ).toBe(4);
  });
});
