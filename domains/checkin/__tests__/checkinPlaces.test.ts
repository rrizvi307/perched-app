import {
  detectCheckinPlace,
  distanceKm,
  extractLocationFromExif,
  rankDetectedPlaces,
  resolveManualCheckinPlaceSelection,
} from '../checkinPlaces';

jest.mock('@/services/googleMaps', () => ({
  canonicalizePlaceSelection: jest.fn(),
  searchPlacesNearbyResponse: jest.fn(),
}));

jest.mock('@/services/logEvent', () => ({
  logEvent: jest.fn(async () => {}),
}));

jest.mock('@/services/location', () => ({
  requestForegroundLocation: jest.fn(async () => ({ lat: 29.72, lng: -95.4 })),
}));

jest.mock('@/services/providerProxy', () => ({
  getProviderProxyUserMessage: jest.fn(() => 'Proxy unavailable'),
  primeProviderProxyAccess: jest.fn(async () => {}),
}));

jest.mock('@/storage/local', () => ({
  getPermissionPrimerSeen: jest.fn(async () => true),
}));

const { canonicalizePlaceSelection, searchPlacesNearbyResponse } = jest.requireMock('@/services/googleMaps') as {
  canonicalizePlaceSelection: jest.Mock;
  searchPlacesNearbyResponse: jest.Mock;
};

describe('extractLocationFromExif', () => {
  it('converts DMS EXIF coordinates to decimal lat/lng', () => {
    expect(
      extractLocationFromExif({
        GPSLatitude: [29, 43, 2.4],
        GPSLatitudeRef: 'N',
        GPSLongitude: [95, 24, 18],
        GPSLongitudeRef: 'W',
      }),
    ).toEqual({
      lat: 29.717333333333332,
      lng: -95.405,
    });
  });
});

describe('distanceKm', () => {
  it('returns zero for identical coordinates', () => {
    expect(distanceKm({ lat: 29.7, lng: -95.4 }, { lat: 29.7, lng: -95.4 })).toBe(0);
  });
});

describe('rankDetectedPlaces', () => {
  it('sorts nearby places by computed distance', () => {
    const ranked = rankDetectedPlaces(
      { lat: 29.7, lng: -95.4 },
      [
        { placeId: 'b', location: { lat: 29.8, lng: -95.4 } },
        { placeId: 'a', location: { lat: 29.7005, lng: -95.4002 } },
      ],
    );
    expect(ranked.map((item) => item.placeId)).toEqual(['a', 'b']);
  });
});

describe('resolveManualCheckinPlaceSelection', () => {
  it('returns a success result when canonicalization succeeds', async () => {
    canonicalizePlaceSelection.mockResolvedValueOnce({
      placeId: 'place-1',
      name: 'Agora Coffee',
      location: { lat: 29.7, lng: -95.4 },
    });

    await expect(resolveManualCheckinPlaceSelection({ placeId: 'place-1' })).resolves.toEqual({
      status: 'success',
      resolvedPlace: {
        placeId: 'place-1',
        name: 'Agora Coffee',
        location: { lat: 29.7, lng: -95.4 },
      },
    });
  });
});

describe('detectCheckinPlace', () => {
  it('returns the location primer state when location is unavailable and primer is unseen', async () => {
    const { requestForegroundLocation } = jest.requireMock('@/services/location') as {
      requestForegroundLocation: jest.Mock;
    };
    const { getPermissionPrimerSeen } = jest.requireMock('@/storage/local') as {
      getPermissionPrimerSeen: jest.Mock;
    };
    requestForegroundLocation.mockResolvedValueOnce(null);
    getPermissionPrimerSeen.mockResolvedValueOnce(false);

    await expect(
      detectCheckinPlace({
        allowWithoutImage: true,
        userId: 'u1',
      }),
    ).resolves.toEqual({
      status: 'needs_location_primer',
    });
  });

  it('returns ranked places and auto-fill metadata when nearby places are found', async () => {
    searchPlacesNearbyResponse.mockResolvedValueOnce({
      status: 'ok',
      places: [
        { placeId: 'place-1', name: 'Agora Coffee', location: { lat: 29.7201, lng: -95.4001 } },
        { placeId: 'place-2', name: 'Other Cafe', location: { lat: 29.74, lng: -95.41 } },
        { placeId: 'place-3', name: 'Third Place', location: { lat: 29.75, lng: -95.42 } },
      ],
    });

    await expect(
      detectCheckinPlace({
        allowWithoutImage: true,
        userId: 'u1',
        detectionThresholdKm: 0.5,
      }),
    ).resolves.toMatchObject({
      status: 'success',
      detectedPlace: {
        placeId: 'place-1',
        name: 'Agora Coffee',
      },
      detectedCandidates: [
        { placeId: 'place-1' },
        { placeId: 'place-2' },
        { placeId: 'place-3' },
      ],
      autoFill: {
        placeSelectionSource: 'auto',
        spot: 'Agora Coffee',
      },
    });
  });
});
