export type SimpleLocation = { lat: number; lng: number };

export type LocationPermissionStatus = 'granted' | 'denied' | 'undetermined';
export type LocationPermissionState = {
  status: LocationPermissionStatus;
  granted: boolean;
  canAskAgain?: boolean;
  servicesEnabled?: boolean;
  error?: string | null;
};

let cached: { coords: SimpleLocation; ts: number } | null = null;
let lastError: string | null = null;

export function getLastLocationError() {
  return lastError;
}

function setLastError(message: string | null) {
  lastError = message;
}

function isFresh(ts: number, ttlMs: number) {
  return Date.now() - ts < ttlMs;
}

function normalizePermissionStatus(value: any): LocationPermissionStatus {
  if (value === 'granted' || value === 'denied' || value === 'undetermined') return value;
  return 'undetermined';
}

async function getExpoLocationModule(): Promise<any | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-location');
  } catch {
    return null;
  }
}

async function getBrowserLocation(): Promise<SimpleLocation | null> {
  try {
    if (typeof navigator !== 'undefined' && (navigator as any).geolocation) {
      return await new Promise((resolve) => {
        (navigator as any).geolocation.getCurrentPosition(
          (p: any) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
          () => resolve(null),
          { enableHighAccuracy: false, timeout: 7000, maximumAge: 60_000 }
        );
      });
    }
  } catch {
    // ignore
  }
  return null;
}

async function getLastKnownLocation(ExpoLocation: any): Promise<SimpleLocation | null> {
  try {
    if (!ExpoLocation?.getLastKnownPositionAsync) return null;
    const requiredAccuracy = ExpoLocation.Accuracy?.Balanced ?? undefined;
    const last = await ExpoLocation.getLastKnownPositionAsync({
      maxAge: 2 * 60_000,
      requiredAccuracy,
    });
    const lat = last?.coords?.latitude;
    const lng = last?.coords?.longitude;
    if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
  } catch {
    // ignore
  }
  return null;
}

async function isLocationServicesEnabled(ExpoLocation: any): Promise<boolean> {
  try {
    if (ExpoLocation?.hasServicesEnabledAsync) {
      const enabled = await ExpoLocation.hasServicesEnabledAsync();
      return !!enabled;
    }
  } catch {
    // ignore
  }
  return true;
}

async function getPermissionState(ExpoLocation: any, request: boolean): Promise<LocationPermissionState> {
  try {
    const fn = request ? ExpoLocation?.requestForegroundPermissionsAsync : ExpoLocation?.getForegroundPermissionsAsync;
    if (typeof fn !== 'function') {
      return { status: 'undetermined', granted: false, canAskAgain: true, error: 'Permissions API unavailable' };
    }
    const perm = await fn();
    const status = normalizePermissionStatus(perm?.status);
    const granted = status === 'granted';
    return { status, granted, canAskAgain: perm?.canAskAgain, error: null };
  } catch (e: any) {
    return { status: 'undetermined', granted: false, canAskAgain: true, error: e?.message || 'Permission check failed' };
  }
}

export async function getForegroundLocationIfPermitted(): Promise<SimpleLocation | null> {
  if (cached && isFresh(cached.ts, 90_000)) return cached.coords;
  const ExpoLocation = await getExpoLocationModule();
  if (ExpoLocation?.getForegroundPermissionsAsync && ExpoLocation?.getCurrentPositionAsync) {
    try {
      const perm = await ExpoLocation.getForegroundPermissionsAsync();
      if (perm?.status !== 'granted') {
        setLastError('Location permission not granted');
        return null;
      }
      const servicesEnabled = await isLocationServicesEnabled(ExpoLocation);
      if (!servicesEnabled) {
        setLastError('Location services are disabled');
        return null;
      }
      const lastKnown = await getLastKnownLocation(ExpoLocation);
      if (lastKnown) {
        cached = { coords: lastKnown, ts: Date.now() };
        setLastError(null);
        return lastKnown;
      }
      const pos = await ExpoLocation.getCurrentPositionAsync({
        accuracy: ExpoLocation.Accuracy?.Balanced ?? undefined,
      });
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      cached = { coords, ts: Date.now() };
      setLastError(null);
      return coords;
    } catch (e: any) {
      setLastError(e?.message || 'Unable to fetch location');
      return null;
    }
  }
  const browser = await getBrowserLocation();
  if (browser) cached = { coords: browser, ts: Date.now() };
  setLastError(browser ? null : 'Unable to fetch location');
  return browser;
}

export async function requestForegroundLocation(options?: { ignoreCache?: boolean; preferFresh?: boolean }): Promise<SimpleLocation | null> {
  const res = await requestForegroundLocationWithStatus(options);
  return res.coords;
}

export async function requestForegroundLocationWithStatus(options?: { ignoreCache?: boolean; preferFresh?: boolean }): Promise<{ coords: SimpleLocation | null; state: LocationPermissionState }> {
  // Skip cache if explicitly requested
  if (!options?.ignoreCache && cached && isFresh(cached.ts, 90_000)) {
    return { coords: cached.coords, state: { status: 'granted', granted: true, canAskAgain: true, servicesEnabled: true, error: null } };
  }

  const ExpoLocation = await getExpoLocationModule();
  if (ExpoLocation?.getCurrentPositionAsync) {
    const perm = await getPermissionState(ExpoLocation, true);
    if (!perm.granted) {
      setLastError('Location permission not granted');
      return { coords: null, state: { ...perm, error: getLastLocationError() } };
    }
    const servicesEnabled = await isLocationServicesEnabled(ExpoLocation);
    if (!servicesEnabled) {
      setLastError('Location services are disabled');
      return { coords: null, state: { ...perm, servicesEnabled, error: getLastLocationError() } };
    }
    try {
      if (!options?.preferFresh) {
        const lastKnown = await getLastKnownLocation(ExpoLocation);
        if (lastKnown) {
          cached = { coords: lastKnown, ts: Date.now() };
          setLastError(null);
          return { coords: lastKnown, state: { ...perm, servicesEnabled, error: null } };
        }
      }
      const pos = await ExpoLocation.getCurrentPositionAsync({
        accuracy: ExpoLocation.Accuracy?.Balanced ?? undefined,
      });
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      cached = { coords, ts: Date.now() };
      setLastError(null);
      return { coords, state: { ...perm, servicesEnabled, error: null } };
    } catch (e: any) {
      setLastError(e?.message || 'Unable to fetch location');
      return { coords: null, state: { ...perm, servicesEnabled, error: getLastLocationError() } };
    }
  }

  const browser = await getBrowserLocation();
  if (browser) cached = { coords: browser, ts: Date.now() };
  setLastError(browser ? null : 'Unable to fetch location');
  return { coords: browser, state: { status: browser ? 'granted' : 'undetermined', granted: !!browser, canAskAgain: true, servicesEnabled: true, error: getLastLocationError() } };
}

/**
 * Clear cached location data
 * Used when switching to demo mode to ensure demo data takes priority
 */
export function clearLocationCache() {
  cached = null;
}
