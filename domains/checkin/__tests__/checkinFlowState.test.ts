import {
  buildCheckinDetectionLabel,
  buildCheckinMetricsSummary,
  buildCheckinStaticMapUrl,
  buildCheckinSubmitState,
  buildCheckinVisibilityNote,
} from '../checkinFlowState';

describe('buildCheckinVisibilityNote', () => {
  it('returns the expected note for each visibility mode', () => {
    expect(buildCheckinVisibilityNote('public')).toBe('Anyone can see this check-in.');
    expect(buildCheckinVisibilityNote('friends')).toBe('Only friends can see this check-in.');
    expect(buildCheckinVisibilityNote('close')).toBe('Only close friends can see the exact spot.');
  });
});

describe('buildCheckinDetectionLabel', () => {
  it('describes the detection source and rounded distance', () => {
    expect(
      buildCheckinDetectionLabel({
        placeId: 'place-1',
        name: 'Agora Coffee',
        location: { lat: 29.7, lng: -95.4 },
        source: 'photo',
        distanceKm: 0.148,
      }),
    ).toBe('Photo GPS · 148m');
  });

  it('returns null when no detected place exists', () => {
    expect(buildCheckinDetectionLabel(null)).toBeNull();
  });
});

describe('buildCheckinMetricsSummary', () => {
  it('tracks progress for partially completed spot intel', () => {
    expect(
      buildCheckinMetricsSummary({
        noiseLevel: 2,
        busyness: 3,
        overallVibe: null,
        wifiSpeed: 5,
        outletAvailability: 4,
      }),
    ).toEqual({
      completed: 4,
      total: 5,
      percentage: 80,
      message: 'One more metric to go',
      isComplete: false,
    });
  });

  it('celebrates completion when every metric is provided', () => {
    expect(
      buildCheckinMetricsSummary({
        noiseLevel: 2,
        busyness: 3,
        overallVibe: 4,
        wifiSpeed: 5,
        outletAvailability: 5,
      }),
    ).toMatchObject({
      completed: 5,
      total: 5,
      percentage: 100,
      message: 'Thanks for helping the community!',
      isComplete: true,
    });
  });
});

describe('buildCheckinSubmitState', () => {
  it('blocks submission while the screen is still verifying a place', () => {
    expect(
      buildCheckinSubmitState({
        loading: false,
        resolvingPlaceSelection: true,
        spot: 'Agora Coffee',
        activePlace: { placeId: 'place-1', location: { lat: 29.7, lng: -95.4 } },
      }),
    ).toEqual({
      disabled: true,
      label: 'Verifying spot...',
      accessibilityLabel: 'Verifying spot',
      showPlusIcon: false,
    });
  });

  it('blocks submission until a verified place context exists', () => {
    expect(
      buildCheckinSubmitState({
        loading: false,
        resolvingPlaceSelection: false,
        spot: 'Agora Coffee',
        activePlace: { placeId: null, location: null },
      }),
    ).toEqual({
      disabled: true,
      label: 'Select a verified spot',
      accessibilityLabel: 'Select a verified spot before posting',
      showPlusIcon: false,
    });
  });

  it('enables submission when the place is verified', () => {
    expect(
      buildCheckinSubmitState({
        loading: false,
        resolvingPlaceSelection: false,
        spot: 'Agora Coffee',
        activePlace: { placeId: 'place-1', location: { lat: 29.7, lng: -95.4 } },
      }),
    ).toEqual({
      disabled: false,
      label: 'Post check-in',
      accessibilityLabel: 'Post check-in',
      showPlusIcon: true,
    });
  });
});

describe('buildCheckinStaticMapUrl', () => {
  it('returns a Google static map URL when the key and coordinates exist', () => {
    expect(
      buildCheckinStaticMapUrl({ lat: 29.7, lng: -95.4 }, 'maps-key', '400x200'),
    ).toBe(
      'https://maps.googleapis.com/maps/api/staticmap?center=29.7,-95.4&zoom=15&size=400x200&scale=2&markers=color:red%7C29.7,-95.4&key=maps-key',
    );
  });

  it('returns null when map context is incomplete', () => {
    expect(buildCheckinStaticMapUrl(null, 'maps-key')).toBeNull();
    expect(buildCheckinStaticMapUrl({ lat: 29.7, lng: -95.4 }, null)).toBeNull();
  });
});
