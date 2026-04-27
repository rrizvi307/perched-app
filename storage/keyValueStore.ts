export const STORAGE_KEYS = {
  checkins: 'spot_checkins_v1',
  checkinCooldown: 'spot_checkin_last_v1',
  demoSeed: 'spot_demo_seeded_v1',
  permissionPrimer: 'spot_permission_seen_v1',
  pendingCheckins: 'spot_pending_checkins_v1',
  pendingProfile: 'spot_pending_profile_v1',
  checkinDraft: 'spot_checkin_draft_v1',
  userProfile: 'spot_user_profile_v1',
  demoAutoApprove: 'spot_demo_auto_approve_v1',
  demoModeEnabled: 'spot_demo_mode_enabled_v1',
  demoCustomPhotos: 'spot_demo_custom_photos_v1',
  waitlist: 'spot_waitlist_v1',
  waitlistShares: 'spot_waitlist_shares_v1',
  stats: 'spot_stats_v2',
  statsMeta: 'spot_stats_meta_v1',
  onboarding: 'spot_onboarding_complete_v1',
  onboardingProfile: 'spot_onboarding_profile_v1',
  notifications: 'spot_notifications_v1',
  locationEnabled: 'spot_location_enabled_v1',
  lastKnownLocation: 'spot_last_known_location_v1',
  savedSpots: 'spot_saved_spots_v1',
  placeEvents: 'spot_place_events_v1',
  placePrefs: 'spot_place_prefs_v1',
  placeTags: 'spot_place_tags_v1',
} as const;

let asyncStorageRef: any = null;
let fsRef: any = null;
let fsStoreDir: string | null = null;
let fsInitPromise: Promise<string | null> | null = null;

export function isWeb() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function fileKeyForStorage(key: string) {
  return key.replace(/[^a-z0-9._-]/gi, '_');
}

async function ensureFsStoreDir(): Promise<string | null> {
  if (fsStoreDir) return fsStoreDir;
  if (fsInitPromise) return fsInitPromise;
  fsInitPromise = (async () => {
    try {
      const fsMod: any = await import('expo-file-system');
      const fs: any = fsMod?.default ?? fsMod;
      fsRef = fs;
      const dir = fs?.documentDirectory ? `${fs.documentDirectory}perched-store/` : null;
      if (!dir) return null;
      try {
        await fs.makeDirectoryAsync(dir, { intermediates: true });
      } catch {}
      fsStoreDir = dir;
      return dir;
    } catch {
      return null;
    }
  })();
  return fsInitPromise;
}

async function fsGetItem(key: string): Promise<string | null> {
  const dir = await ensureFsStoreDir();
  if (!dir || !fsRef) return null;
  const path = `${dir}${fileKeyForStorage(key)}.json`;
  try {
    const info = await fsRef.getInfoAsync(path);
    if (!info?.exists) return null;
    return await fsRef.readAsStringAsync(path);
  } catch {
    return null;
  }
}

async function fsSetItem(key: string, value: string): Promise<void> {
  const dir = await ensureFsStoreDir();
  if (!dir || !fsRef) return;
  const path = `${dir}${fileKeyForStorage(key)}.json`;
  try {
    await fsRef.writeAsStringAsync(path, value);
  } catch {}
}

async function fsRemoveItem(key: string): Promise<void> {
  const dir = await ensureFsStoreDir();
  if (!dir || !fsRef) return;
  const path = `${dir}${fileKeyForStorage(key)}.json`;
  try {
    const info = await fsRef.getInfoAsync(path);
    if (!info?.exists) return;
    await fsRef.deleteAsync(path, { idempotent: true });
  } catch {}
}

export async function getAsyncStorage() {
  if (isWeb()) return null;
  if (asyncStorageRef) return asyncStorageRef;
  try {
    const mod = await import('@react-native-async-storage/async-storage');
    const candidate = (mod as any).default || mod;
    try {
      await candidate.getItem('__perched_storage_probe__');
      asyncStorageRef = candidate;
      return asyncStorageRef;
    } catch {}
  } catch {}

  try {
    const dir = await ensureFsStoreDir();
    if (!dir) return null;
    asyncStorageRef = {
      getItem: fsGetItem,
      setItem: fsSetItem,
      removeItem: fsRemoveItem,
    };
    return asyncStorageRef;
  } catch {
    return null;
  }
}

export function readWebJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeWebJson<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function removeWebItem(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {}
}

export async function readNativeJson<T>(key: string, fallback: T): Promise<T> {
  const store = await getAsyncStorage();
  if (!store) return fallback;
  try {
    const raw = await store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function writeNativeJson<T>(key: string, value: T): Promise<void> {
  const store = await getAsyncStorage();
  if (!store) return;
  try {
    await store.setItem(key, JSON.stringify(value));
  } catch {}
}

export async function removeNativeItem(key: string): Promise<void> {
  const store = await getAsyncStorage();
  if (!store) return;
  try {
    if (typeof store.removeItem === 'function') {
      await store.removeItem(key);
      return;
    }
    await store.setItem(key, JSON.stringify(null));
  } catch {}
}

export async function readJsonItem<T>(key: string, fallback: T): Promise<T> {
  if (isWeb()) return readWebJson(key, fallback);
  return readNativeJson(key, fallback);
}

export async function writeJsonItem<T>(key: string, value: T): Promise<void> {
  if (isWeb()) {
    writeWebJson(key, value);
    return;
  }
  await writeNativeJson(key, value);
}

export async function removeStoredItem(key: string): Promise<void> {
  if (isWeb()) {
    removeWebItem(key);
    return;
  }
  await removeNativeItem(key);
}
