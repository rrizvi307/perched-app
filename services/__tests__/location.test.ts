describe('location', () => {
  const grantedPermission = { status: 'granted', granted: true, canAskAgain: true };

  function loadLocationModule(expoLocationMock: any) {
    jest.resetModules();
    jest.doMock('expo-location', () => expoLocationMock, { virtual: true });
    return require('../location') as typeof import('../location');
  }

  afterEach(() => {
    jest.resetModules();
    jest.dontMock('expo-location');
  });

  it('uses last known coordinates by default before requesting current position', async () => {
    const getCurrentPositionAsync = jest.fn().mockResolvedValue({
      coords: { latitude: 37.7749, longitude: -122.4194 },
    });
    const getLastKnownPositionAsync = jest.fn().mockResolvedValue({
      coords: { latitude: 29.7604, longitude: -95.3698 },
    });

    const location = loadLocationModule({
      requestForegroundPermissionsAsync: jest.fn().mockResolvedValue(grantedPermission),
      hasServicesEnabledAsync: jest.fn().mockResolvedValue(true),
      getLastKnownPositionAsync,
      getCurrentPositionAsync,
      Accuracy: { Balanced: 3 },
    });

    const result = await location.requestForegroundLocationWithStatus({ ignoreCache: true });

    expect(result.coords).toEqual({ lat: 29.7604, lng: -95.3698 });
    expect(getLastKnownPositionAsync).toHaveBeenCalledTimes(1);
    expect(getCurrentPositionAsync).not.toHaveBeenCalled();
  });

  it('uses current coordinates when preferFresh is true', async () => {
    const getCurrentPositionAsync = jest.fn().mockResolvedValue({
      coords: { latitude: 37.7749, longitude: -122.4194 },
    });
    const getLastKnownPositionAsync = jest.fn().mockResolvedValue({
      coords: { latitude: 29.7604, longitude: -95.3698 },
    });

    const location = loadLocationModule({
      requestForegroundPermissionsAsync: jest.fn().mockResolvedValue(grantedPermission),
      hasServicesEnabledAsync: jest.fn().mockResolvedValue(true),
      getLastKnownPositionAsync,
      getCurrentPositionAsync,
      Accuracy: { Balanced: 3 },
    });

    const result = await location.requestForegroundLocationWithStatus({ ignoreCache: true, preferFresh: true });

    expect(result.coords).toEqual({ lat: 37.7749, lng: -122.4194 });
    expect(getLastKnownPositionAsync).not.toHaveBeenCalled();
    expect(getCurrentPositionAsync).toHaveBeenCalledTimes(1);
  });
});
