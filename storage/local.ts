const KEY = 'spot_checkins_v1';
const CHECKIN_COOLDOWN_KEY = 'spot_checkin_last_v1';
const DEMO_SEED_KEY = 'spot_demo_seeded_v1';
const PERMISSION_KEY = 'spot_permission_seen_v1';
const PENDING_CHECKIN_KEY = 'spot_pending_checkins_v1';
const PENDING_PROFILE_KEY = 'spot_pending_profile_v1';
const CHECKIN_DRAFT_KEY = 'spot_checkin_draft_v1';
const USER_PROFILE_KEY = 'spot_user_profile_v1';
const DEMO_AUTO_APPROVE_KEY = 'spot_demo_auto_approve_v1';
const DEMO_MODE_ENABLED_KEY = 'spot_demo_mode_enabled_v1';

type Checkin = {
  id: string;
  spot?: string;
  spotName?: string;
  spotPlaceId?: string;
  spotLatLng?: { lat: number; lng: number };
  image?: string;
  photoUrl?: string;
  photoPending?: boolean;
  clientId?: string;
  caption?: string;
  userId?: string;
  userHandle?: string;
  visibility?: 'public' | 'friends' | 'close';
  campusOrCity?: string;
  campus?: string;
  city?: string;
  expiresAt?: string;
  createdAt: string;
  tags?: string[];
};

let memory: Checkin[] = [];
const permissionMemory: Record<string, boolean> = {};
let pendingMemory: any[] = [];
let pendingMemoryPreferred = false;
let pendingProfileMemory: any[] = [];
let asyncStorageRef: any = null;
let fsRef: any = null;
let fsStoreDir: string | null = null;
let fsInitPromise: Promise<string | null> | null = null;

function isWeb() {
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

async function getAsyncStorage() {
  if (isWeb()) return null;
  if (asyncStorageRef) return asyncStorageRef;
  try {
    const mod = await import('@react-native-async-storage/async-storage');
    const candidate = (mod as any).default || mod;
    // Expo Go may have the JS package installed without the native module available.
    // Validate the module once; if it fails, fall back to a FileSystem-backed store.
    try {
      await candidate.getItem('__perched_storage_probe__');
      asyncStorageRef = candidate;
      return asyncStorageRef;
    } catch {
      // fall through to FileSystem store
    }
  } catch {
    // ignore and try filesystem fallback below
  }

  // Fallback to a FileSystem-backed KV store (e.g. Expo Go missing native AsyncStorage).
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

async function readNativeJson<T>(key: string, fallback: T): Promise<T> {
  const store = await getAsyncStorage();
  if (!store) return fallback;
  try {
    const raw = await store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

async function writeNativeJson<T>(key: string, value: T): Promise<void> {
  const store = await getAsyncStorage();
  if (!store) return;
  try {
    await store.setItem(key, JSON.stringify(value));
  } catch {}
}

function pruneHistory(list: Checkin[], maxDays = 30) {
  const cutoff = Date.now() - maxDays * 24 * 60 * 60 * 1000;
  return list.filter((c) => {
    const ms = c?.createdAt ? new Date(c.createdAt).getTime() : 0;
    if (!ms || Number.isNaN(ms)) return true;
    return ms >= cutoff;
  });
}

export async function saveCheckin(item: Omit<Checkin, 'id' | 'createdAt' | 'expiresAt'>) {
  // posts expire by default after 12 hours to keep feed fresh
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  const checkin: Checkin = { id: String(Date.now()), createdAt: new Date().toISOString(), expiresAt, ...item };
  if (isWeb()) {
    try {
      const raw = window.localStorage.getItem(KEY);
      const arr: Checkin[] = raw ? JSON.parse(raw) : [];
      const stored: Checkin = { ...checkin };
      if (typeof stored.image === 'string' && stored.image.startsWith('data:')) {
        delete (stored as any).image;
        if (typeof stored.photoUrl === 'string' && stored.photoUrl.startsWith('data:')) delete (stored as any).photoUrl;
        stored.photoPending = true;
      }
      arr.unshift(stored);
      window.localStorage.setItem(KEY, JSON.stringify(arr));
      window.localStorage.setItem(CHECKIN_COOLDOWN_KEY, String(Date.now()));
    } catch {
      try {
        const raw = window.localStorage.getItem(KEY);
        const arr: Checkin[] = raw ? JSON.parse(raw) : [];
        const slim: Checkin = { ...checkin };
        if (typeof slim.image === 'string' && slim.image.startsWith('data:')) delete slim.image;
        if (typeof slim.photoUrl === 'string' && slim.photoUrl.startsWith('data:')) delete (slim as any).photoUrl;
        arr.unshift(slim);
        window.localStorage.setItem(KEY, JSON.stringify(arr));
        window.localStorage.setItem(CHECKIN_COOLDOWN_KEY, String(Date.now()));
      } catch {
        memory.unshift(checkin);
      }
    }
    try { await recordSpotVisit(checkin.spotName || checkin.spot || '', checkin.spotPlaceId); } catch {}
    return checkin;
  }

  memory.unshift(checkin);
  try {
    const store = await getAsyncStorage();
    if (store) {
      const raw = await store.getItem(KEY);
      const arr: Checkin[] = raw ? JSON.parse(raw) : [];
      arr.unshift(checkin);
      await store.setItem(KEY, JSON.stringify(arr));
      await store.setItem(CHECKIN_COOLDOWN_KEY, String(Date.now()));
    }
  } catch {}
  try { (global as any)._spot_last_checkin = Date.now(); } catch {}
  try { await recordSpotVisit(checkin.spotName || checkin.spot || '', checkin.spotPlaceId); } catch {}
  return checkin;
}

export async function updateCheckinLocalByClientId(clientId: string, updates: Partial<Checkin>): Promise<Checkin | null> {
  if (!clientId) return null;
  const applyUpdates = (list: Checkin[]) => {
    let changed = false;
    const next = list.map((it) => {
      if (it.clientId !== clientId) return it;
      changed = true;
      return { ...it, ...updates };
    });
    return { next, changed };
  };

  if (isWeb()) {
    try {
      const raw = window.localStorage.getItem(KEY);
      const arr: Checkin[] = raw ? JSON.parse(raw) : [];
      const { next, changed } = applyUpdates(arr);
      if (changed) window.localStorage.setItem(KEY, JSON.stringify(next));
      return next.find((it) => it.clientId === clientId) || null;
    } catch {
      return null;
    }
  }

  const store = await getAsyncStorage();
  if (store) {
    try {
      const raw = await store.getItem(KEY);
      const arr: Checkin[] = raw ? JSON.parse(raw) : [];
      const { next, changed } = applyUpdates(arr);
      if (changed) await store.setItem(KEY, JSON.stringify(next));
      memory = next.slice();
      return next.find((it) => it.clientId === clientId) || null;
    } catch {
      // fall through
    }
  }
  const { next } = applyUpdates(memory);
  memory = next;
  return next.find((it) => it.clientId === clientId) || null;
}

export async function updateCheckinLocalById(id: string, updates: Partial<Checkin>): Promise<Checkin | null> {
  if (!id) return null;
  const applyUpdates = (list: Checkin[]) => {
    let changed = false;
    const next = list.map((it) => {
      if (it.id !== id) return it;
      changed = true;
      return { ...it, ...updates };
    });
    return { next, changed };
  };

  if (isWeb()) {
    try {
      const raw = window.localStorage.getItem(KEY);
      const arr: Checkin[] = raw ? JSON.parse(raw) : [];
      const { next, changed } = applyUpdates(arr);
      if (changed) window.localStorage.setItem(KEY, JSON.stringify(next));
      return next.find((it) => it.id === id) || null;
    } catch {
      return null;
    }
  }

  const store = await getAsyncStorage();
  if (store) {
    try {
      const raw = await store.getItem(KEY);
      const arr: Checkin[] = raw ? JSON.parse(raw) : [];
      const { next, changed } = applyUpdates(arr);
      if (changed) await store.setItem(KEY, JSON.stringify(next));
      memory = next.slice();
      return next.find((it) => it.id === id) || null;
    } catch {
      // fall through
    }
  }
  const { next } = applyUpdates(memory);
  memory = next;
  return next.find((it) => it.id === id) || null;
}

export async function removeCheckinLocalById(id: string) {
  if (!id) return;
  if (isWeb()) {
    try {
      const raw = window.localStorage.getItem(KEY);
      const arr: Checkin[] = raw ? JSON.parse(raw) : [];
      const next = arr.filter((c) => String(c.id) !== String(id));
      window.localStorage.setItem(KEY, JSON.stringify(next));
      return;
    } catch {
      return;
    }
  }
  const store = await getAsyncStorage();
  if (store) {
    try {
      const raw = await store.getItem(KEY);
      const arr: Checkin[] = raw ? JSON.parse(raw) : [];
      const next = arr.filter((c) => String(c.id) !== String(id));
      await store.setItem(KEY, JSON.stringify(next));
      memory = next.slice();
      return;
    } catch {
      // fall through
    }
  }
  memory = memory.filter((c) => String(c.id) !== String(id));
}

export async function getCheckins() {
  if (isWeb()) {
    try {
      const raw = window.localStorage.getItem(KEY);
      const arr: Checkin[] = raw ? JSON.parse(raw) : [];
      const pruned = pruneHistory(arr, 30);
      const normalized = pruned.map((c) => {
        if (c.photoUrl && typeof c.photoUrl === 'string' && c.photoUrl.startsWith('http')) {
          return { ...c, image: c.photoUrl };
        }
        return c;
      });
      // persist trimmed list (keep history; don't drop expired live posts)
      window.localStorage.setItem(KEY, JSON.stringify(normalized));
      return normalized as Checkin[];
    } catch {
      memory = pruneHistory(memory, 30);
      return memory as Checkin[];
    }
  }

  const store = await getAsyncStorage();
  if (store) {
    try {
      const raw = await store.getItem(KEY);
      const arr: Checkin[] = raw ? JSON.parse(raw) : [];
      const pruned = pruneHistory(arr, 30);
      const normalized = pruned.map((c) => {
        if (c.photoUrl && typeof c.photoUrl === 'string' && c.photoUrl.startsWith('http')) {
          return { ...c, image: c.photoUrl };
        }
        return c;
      });
      await store.setItem(KEY, JSON.stringify(normalized));
      memory = normalized.slice();
      return normalized as Checkin[];
    } catch {
      // fallback to memory
    }
  }
  memory = pruneHistory(memory, 30).map((c) => {
    if (c.photoUrl && typeof c.photoUrl === 'string' && c.photoUrl.startsWith('http')) {
      return { ...c, image: c.photoUrl };
    }
    return c;
  });
  return memory as Checkin[];
}

async function readUserProfileMap() {
  if (isWeb()) {
    try {
      const raw = window.localStorage.getItem(USER_PROFILE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
  const store = await getAsyncStorage();
  if (!store) return {};
  try {
    const raw = await store.getItem(USER_PROFILE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function writeUserProfileMap(data: Record<string, any>) {
  if (isWeb()) {
    try {
      window.localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(data));
    } catch {}
    return;
  }
  const store = await getAsyncStorage();
  if (!store) return;
  try {
    await store.setItem(USER_PROFILE_KEY, JSON.stringify(data));
  } catch {}
}

export async function saveUserProfile(profile: any) {
  if (!profile?.id) return;
  const map = await readUserProfileMap();
  map[profile.id] = { ...map[profile.id], ...profile };
  await writeUserProfileMap(map);
}

export async function getUserProfile(userId: string) {
  if (!userId) return null;
  const map = await readUserProfileMap();
  return map[userId] || null;
}

export async function getPermissionPrimerSeen(key: string) {
  if (isWeb()) {
    try {
      const raw = window.localStorage.getItem(PERMISSION_KEY);
      const data = raw ? JSON.parse(raw) : {};
      return !!data[key];
    } catch {
      return false;
    }
  }
  if (key in permissionMemory) return !!permissionMemory[key];
  const data = await readNativeJson<Record<string, boolean>>(PERMISSION_KEY, {});
  permissionMemory[key] = !!data[key];
  return !!data[key];
}

export async function setPermissionPrimerSeen(key: string, value = true) {
  if (isWeb()) {
    try {
      const raw = window.localStorage.getItem(PERMISSION_KEY);
      const data = raw ? JSON.parse(raw) : {};
      data[key] = value;
      window.localStorage.setItem(PERMISSION_KEY, JSON.stringify(data));
      return;
    } catch {
      return;
    }
  }
  permissionMemory[key] = value;
  const data = await readNativeJson<Record<string, boolean>>(PERMISSION_KEY, {});
  data[key] = value;
  await writeNativeJson(PERMISSION_KEY, data);
}

export async function getPendingCheckins() {
  if (isWeb()) {
    if (pendingMemoryPreferred && pendingMemory.length) return pendingMemory;
    try {
      const raw = window.localStorage.getItem(PENDING_CHECKIN_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return pendingMemory;
    }
  }
  const store = await getAsyncStorage();
  if (store) {
    try {
      const raw = await store.getItem(PENDING_CHECKIN_KEY);
      const list = raw ? JSON.parse(raw) : [];
      pendingMemory = list;
      return list;
    } catch {
      return pendingMemory;
    }
  }
  return pendingMemory;
}

export async function setPendingCheckins(next: any[]) {
  const list = Array.isArray(next) ? next : [];
  if (isWeb()) {
    try {
      window.localStorage.setItem(PENDING_CHECKIN_KEY, JSON.stringify(list));
      pendingMemoryPreferred = false;
      pendingMemory = list;
      return;
    } catch {
      pendingMemory = list;
      pendingMemoryPreferred = true;
      return;
    }
  }
  const store = await getAsyncStorage();
  if (store) {
    try {
      await store.setItem(PENDING_CHECKIN_KEY, JSON.stringify(list));
      pendingMemory = list;
      return;
    } catch {
      // fall through
    }
  }
  pendingMemory = list;
}

export async function pruneInvalidPendingCheckins() {
  const list = await getPendingCheckins();
  const now = Date.now();
  const MAX_AGE_MS = 24 * 60 * 60 * 1000;
  const next = (list || []).filter((it: any) => {
    if (typeof it?.clientId !== 'string' || it.clientId.trim().length === 0) return false;
    if (typeof it?.userId !== 'string' || it.userId.trim().length === 0) return false;
    const queuedAt = typeof it?.queuedAt === 'number' ? it.queuedAt : 0;
    // Older app versions didn't stamp `queuedAt`; treat those as stale to avoid permanent "finishing upload" banners.
    if (!queuedAt) return false;
    if (queuedAt && now - queuedAt > MAX_AGE_MS) return false;
    const attempts = typeof it?.attempts === 'number' ? it.attempts : 0;
    if (attempts >= 10) return false;
    return true;
  });
  if (next.length !== (list || []).length) {
    await setPendingCheckins(next);
  }
  return { removed: (list || []).length - next.length, count: next.length };
}

export async function getPendingProfileUpdates() {
  if (isWeb()) {
    try {
      const raw = window.localStorage.getItem(PENDING_PROFILE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return pendingProfileMemory;
    }
  }
  const store = await getAsyncStorage();
  if (store) {
    try {
      const raw = await store.getItem(PENDING_PROFILE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      pendingProfileMemory = list;
      return list;
    } catch {
      return pendingProfileMemory;
    }
  }
  return pendingProfileMemory;
}

export async function enqueuePendingProfileUpdate(userId: string, fields: Record<string, any>) {
  if (!userId || !fields) return;
  const list = await getPendingProfileUpdates();
  const sanitized = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
  const next = [
    { userId, fields: sanitized, queuedAt: Date.now() },
    ...list.filter((item: any) => item?.userId !== userId),
  ];
  if (isWeb()) {
    try {
      window.localStorage.setItem(PENDING_PROFILE_KEY, JSON.stringify(next));
      pendingProfileMemory = next;
      return;
    } catch {
      pendingProfileMemory = next;
      return;
    }
  }
  const store = await getAsyncStorage();
  if (store) {
    try {
      await store.setItem(PENDING_PROFILE_KEY, JSON.stringify(next));
      pendingProfileMemory = next;
      return;
    } catch {
      // fall through
    }
  }
  pendingProfileMemory = next;
}

export async function removePendingProfileUpdate(userId: string) {
  if (!userId) return;
  const list = await getPendingProfileUpdates();
  const next = list.filter((item: any) => item?.userId !== userId);
  if (isWeb()) {
    try {
      window.localStorage.setItem(PENDING_PROFILE_KEY, JSON.stringify(next));
      pendingProfileMemory = next;
      return;
    } catch {
      pendingProfileMemory = next;
      return;
    }
  }
  const store = await getAsyncStorage();
  if (store) {
    try {
      await store.setItem(PENDING_PROFILE_KEY, JSON.stringify(next));
      pendingProfileMemory = next;
      return;
    } catch {
      // fall through
    }
  }
  pendingProfileMemory = next;
}

export async function enqueuePendingCheckin(item: any) {
  if (!item) return;
  const payload = { ...item, queuedAt: Date.now() };
  const list = await getPendingCheckins();
  const next = [payload, ...list].filter((v, i, arr) => arr.findIndex((x) => x.clientId === v.clientId) === i);
  if (isWeb()) {
    try {
      window.localStorage.setItem(PENDING_CHECKIN_KEY, JSON.stringify(next));
      pendingMemoryPreferred = false;
      return;
    } catch {
      pendingMemory = next;
      pendingMemoryPreferred = true;
      return;
    }
  }
  const store = await getAsyncStorage();
  if (store) {
    try {
      await store.setItem(PENDING_CHECKIN_KEY, JSON.stringify(next));
      pendingMemory = next;
      return;
    } catch {
      // fall through
    }
  }
  pendingMemory = next;
}

export async function updatePendingCheckin(clientId: string, updates: Record<string, any>) {
  if (!clientId) return;
  const list = await getPendingCheckins();
  const next = list.map((c: any) => {
    if (c?.clientId !== clientId) return c;
    return { ...c, ...(updates || {}) };
  });
  if (isWeb()) {
    try {
      window.localStorage.setItem(PENDING_CHECKIN_KEY, JSON.stringify(next));
      pendingMemoryPreferred = false;
      return;
    } catch {
      pendingMemory = next;
      pendingMemoryPreferred = true;
      return;
    }
  }
  const store = await getAsyncStorage();
  if (store) {
    try {
      await store.setItem(PENDING_CHECKIN_KEY, JSON.stringify(next));
      pendingMemory = next;
      return;
    } catch {
      // fall through
    }
  }
  pendingMemory = next;
}

export async function removePendingCheckin(clientId: string) {
  if (!clientId) return;
  const list = await getPendingCheckins();
  const next = list.filter((c: any) => c.clientId !== clientId);
  if (isWeb()) {
    try {
      window.localStorage.setItem(PENDING_CHECKIN_KEY, JSON.stringify(next));
      if (pendingMemoryPreferred && !next.length) pendingMemoryPreferred = false;
      return;
    } catch {
      pendingMemory = next;
      if (!pendingMemory.length) pendingMemoryPreferred = false;
      return;
    }
  }
  const store = await getAsyncStorage();
  if (store) {
    try {
      await store.setItem(PENDING_CHECKIN_KEY, JSON.stringify(next));
      pendingMemory = next;
      return;
    } catch {
      // fall through
    }
  }
  pendingMemory = next;
}

export async function seedDemoNetwork(currentUserId?: string) {
  try {
    const now = Date.now();
    const SEED_TTL_MS = 6 * 60 * 60 * 1000;
    if (isWeb()) {
      try {
        const raw = window.localStorage.getItem(DEMO_SEED_KEY);
        const last = raw ? Number(raw) : 0;
        if (last && Number.isFinite(last) && now - last < SEED_TTL_MS) return;
      } catch {}
    }
    const demoUsers = [
      { id: 'demo-u1', name: 'Maya Patel', handle: 'mayap', city: 'Houston', campus: 'Rice University', campusOrCity: 'Rice University', campusType: 'campus', email: 'maya@demo.local' },
      { id: 'demo-u2', name: 'Jon Lee', handle: 'jonstudy', city: 'Houston', campus: 'University of Houston', campusOrCity: 'UH', campusType: 'campus', email: 'jon@demo.local' },
      { id: 'demo-u3', name: 'Ava Brooks', handle: 'avab', city: 'Houston', campusOrCity: 'Houston', campusType: 'city', email: 'ava@demo.local' },
      { id: 'demo-u4', name: 'Leo Nguyen', handle: 'leon', city: 'Houston', campus: 'Rice University', campusOrCity: 'Rice University', campusType: 'campus', email: 'leo@demo.local' },
      { id: 'demo-u5', name: 'Sofia Kim', handle: 'sofiak', city: 'Houston', campusOrCity: 'Houston', campusType: 'city', email: 'sofia@demo.local' },
      { id: 'demo-u6', name: 'Noah Johnson', handle: 'noahj', city: 'Houston', campusOrCity: 'Houston', campusType: 'city', email: 'noah@demo.local' },
      { id: 'demo-u7', name: 'Priya Shah', handle: 'priyash', city: 'Houston', campusOrCity: 'Houston', campusType: 'city', email: 'priya@demo.local' },
      { id: 'demo-u8', name: 'Ethan Chen', handle: 'ethanc', city: 'Houston', campusOrCity: 'Houston', campusType: 'city', email: 'ethan@demo.local' },
      { id: 'demo-u9', name: 'Camila Rivera', handle: 'cami', city: 'Houston', campusOrCity: 'Houston', campusType: 'city', email: 'camila@demo.local' },
      { id: 'demo-u10', name: 'Jordan Wells', handle: 'jordanw', city: 'Houston', campusOrCity: 'Houston', campusType: 'city', email: 'jordan@demo.local' },
      { id: 'demo-u11', name: 'Hannah Park', handle: 'hannahp', city: 'Houston', campusOrCity: 'Houston', campusType: 'city', email: 'hannah@demo.local' },
      { id: 'demo-u12', name: 'Omar Hassan', handle: 'omarh', city: 'Houston', campusOrCity: 'Houston', campusType: 'city', email: 'omar@demo.local' },
      { id: 'demo-u13', name: 'Grace Liu', handle: 'gracel', city: 'Houston', campusOrCity: 'Houston', campusType: 'city', email: 'grace@demo.local' },
      { id: 'demo-u14', name: 'Diego Martinez', handle: 'diegom', city: 'Houston', campusOrCity: 'Houston', campusType: 'city', email: 'diego@demo.local' },
      { id: 'demo-u15', name: 'Nina Singh', handle: 'ninasingh', city: 'Houston', campusOrCity: 'Houston', campusType: 'city', email: 'nina@demo.local' },
      { id: 'demo-u16', name: 'Sam Carter', handle: 'samc', city: 'Houston', campusOrCity: 'Houston', campusType: 'city', email: 'sam@demo.local' },
    ];
    const demoAvatars = {
      'demo-u1': 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=240&q=80',
      'demo-u2': 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=240&q=80',
      'demo-u3': 'https://images.unsplash.com/photo-1544723795-3fb6469f5b39?auto=format&fit=crop&w=240&q=80',
      'demo-u4': 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&w=240&q=80',
      'demo-u5': 'https://images.unsplash.com/photo-1524503033411-f7a2b5d17c3f?auto=format&fit=crop&w=240&q=80',
      'demo-u6': 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=240&q=80',
      'demo-u7': 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=240&q=80',
      'demo-u8': 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=240&q=80',
      'demo-u9': 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=240&q=80',
      'demo-u10': 'https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=240&q=80',
      'demo-u11': 'https://images.unsplash.com/photo-1502685104226-ee32379fefbe?auto=format&fit=crop&w=240&q=80',
      'demo-u12': 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=240&q=80',
      'demo-u13': 'https://images.unsplash.com/photo-1547425260-76bcadfb4f2c?auto=format&fit=crop&w=240&q=80',
      'demo-u14': 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=240&q=80',
      'demo-u15': 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=240&q=80',
      'demo-u16': 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=240&q=80',
    };
    let checkins: any[] = [];
    if (isWeb()) {
      const rawList = window.localStorage.getItem('spot_users_v1');
      const list = rawList ? JSON.parse(rawList) : [];
      const merged = [...demoUsers, ...list].filter((u, i, arr) => arr.findIndex((x) => x.id === u.id) === i);
      window.localStorage.setItem('spot_users_v1', JSON.stringify(merged));
      const checkinsRaw = window.localStorage.getItem(KEY);
      checkins = checkinsRaw ? JSON.parse(checkinsRaw) : [];
    } else {
      const store = await getAsyncStorage();
      if (store) {
        const checkinsRaw = await store.getItem(KEY);
        checkins = checkinsRaw ? JSON.parse(checkinsRaw) : [];
      }
    }
    const demoCheckins = [
      {
        id: `demo-c1-${now}`,
        createdAt: new Date(now - 4 * 60 * 1000).toISOString(),
        expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
        userId: 'demo-u1',
        userName: 'Maya Patel',
        userHandle: 'mayap',
        userPhotoUrl: demoAvatars['demo-u1'],
        campus: 'Rice University',
        city: 'Houston',
        spotName: 'Agora Coffee',
        spotPlaceId: 'demo-place-agora',
        spotLatLng: { lat: 29.7172, lng: -95.4018 },
        photoUrl: 'https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?auto=format&fit=crop&w=1400&q=80',
        caption: 'Coffee + laptop for an hour',
        tags: ['Study', 'Wi-Fi', 'Bright'],
        openNow: true,
        visibility: 'public',
      },
      {
        id: `demo-c2-${now}`,
        createdAt: new Date(now - 12 * 60 * 1000).toISOString(),
        expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
        userId: 'demo-u2',
        userName: 'Jon Lee',
        userHandle: 'jonstudy',
        userPhotoUrl: demoAvatars['demo-u2'],
        campus: 'University of Houston',
        city: 'Houston',
        spotName: 'Fondren Library',
        spotPlaceId: 'demo-place-fondren',
        spotLatLng: { lat: 29.7174, lng: -95.4011 },
        photoUrl: 'https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=1400&q=80',
        caption: 'Quiet floor today',
        tags: ['Quiet', 'Study', 'Seating'],
        openNow: false,
        visibility: 'friends',
      },
      {
        id: `demo-c3-${now}`,
        createdAt: new Date(now - 22 * 60 * 1000).toISOString(),
        expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
        userId: 'demo-u3',
        userName: 'Ava Brooks',
        userHandle: 'avab',
        userPhotoUrl: demoAvatars['demo-u3'],
        city: 'Houston',
        spotName: 'Doshi House',
        spotPlaceId: 'demo-place-doshi',
        spotLatLng: { lat: 29.7346, lng: -95.3896 },
        photoUrl: 'https://images.unsplash.com/photo-1529070538774-1843cb3265df?auto=format&fit=crop&w=1400&q=80',
        caption: 'Sunlight + a warm drink',
        tags: ['Bright', 'Social', 'Wi-Fi'],
        openNow: true,
        visibility: 'public',
      },
      {
        id: `demo-c4-${now}`,
        createdAt: new Date(now - 31 * 60 * 1000).toISOString(),
        expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
        userId: 'demo-u4',
        userName: 'Leo Nguyen',
        userHandle: 'leon',
        userPhotoUrl: demoAvatars['demo-u4'],
        campus: 'Rice University',
        city: 'Houston',
        spotName: 'The Nook',
        spotPlaceId: 'demo-place-nook',
        spotLatLng: { lat: 29.7372, lng: -95.3915 },
        photoUrl: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1400&q=80',
        caption: 'Work block with friends',
        tags: ['Coworking', 'Outlets', 'Wi-Fi'],
        openNow: true,
        visibility: 'public',
      },
      {
        id: `demo-c5-${now}`,
        createdAt: new Date(now - 44 * 60 * 1000).toISOString(),
        expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
        userId: 'demo-u5',
        userName: 'Sofia Kim',
        userHandle: 'sofiak',
        userPhotoUrl: demoAvatars['demo-u5'],
        city: 'Houston',
        spotName: 'Common Bond Cafe',
        spotPlaceId: 'demo-place-commonbond',
        spotLatLng: { lat: 29.7396, lng: -95.4012 },
        photoUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1400&q=80',
        caption: 'Pastry break, then back to it',
        tags: ['Social', 'Spacious', 'Wi-Fi'],
        openNow: true,
        visibility: 'public',
      },
      {
        id: `demo-c6-${now}`,
        createdAt: new Date(now - 58 * 60 * 1000).toISOString(),
        expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
        userId: 'demo-u6',
        userName: 'Noah Johnson',
        userHandle: 'noahj',
        userPhotoUrl: demoAvatars['demo-u6'],
        city: 'Houston',
        spotName: 'Downtown Cowork',
        spotPlaceId: 'demo-place-downtowncowork',
        spotLatLng: { lat: 29.7604, lng: -95.3698 },
        photoUrl: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1400&q=80',
        caption: 'Deep work hour',
        tags: ['Coworking', 'Outlets', 'Seating'],
        openNow: true,
        visibility: 'public',
      },
      {
        id: `demo-c7-${now}`,
        createdAt: new Date(now - 73 * 60 * 1000).toISOString(),
        expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
        userId: 'demo-u7',
        userName: 'Priya Shah',
        userHandle: 'priyash',
        userPhotoUrl: demoAvatars['demo-u7'],
        city: 'Houston',
        spotName: 'Siphon Coffee',
        spotPlaceId: 'demo-place-siphon',
        spotLatLng: { lat: 29.7392, lng: -95.3856 },
        photoUrl: 'https://images.unsplash.com/photo-1501139083538-0139583c060f?auto=format&fit=crop&w=1400&q=80',
        caption: 'Coffee and notes',
        tags: ['Study', 'Wi-Fi', 'Spacious'],
        openNow: true,
        visibility: 'friends',
      },
      {
        id: `demo-c8-${now}`,
        createdAt: new Date(now - 88 * 60 * 1000).toISOString(),
        expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
        userId: 'demo-u8',
        userName: 'Ethan Chen',
        userHandle: 'ethanc',
        userPhotoUrl: demoAvatars['demo-u8'],
        city: 'Houston',
        spotName: 'Rice Coffeehouse',
        spotPlaceId: 'demo-place-ricecoffee',
        spotLatLng: { lat: 29.7178, lng: -95.4012 },
        photoUrl: 'https://images.unsplash.com/photo-1517685352821-92cf88aee5a5?auto=format&fit=crop&w=1400&q=80',
        caption: 'Reading + espresso',
        tags: ['Quiet', 'Study', 'Wi-Fi'],
        openNow: true,
        visibility: 'public',
      },
      {
        id: `demo-c9-${now}`,
        createdAt: new Date(now - 102 * 60 * 1000).toISOString(),
        expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
        userId: 'demo-u9',
        userName: 'Camila Rivera',
        userHandle: 'cami',
        userPhotoUrl: demoAvatars['demo-u9'],
        city: 'Houston',
        spotName: 'Agora Coffee',
        spotPlaceId: 'demo-place-agora',
        spotLatLng: { lat: 29.7172, lng: -95.4018 },
        photoUrl: 'https://images.unsplash.com/photo-1482192596544-9eb780fc7f66?auto=format&fit=crop&w=1400&q=80',
        caption: 'Same spot, different day',
        tags: ['Social', 'Bright', 'Wi-Fi'],
        openNow: true,
        visibility: 'public',
      },
      {
        id: `demo-c10-${now}`,
        createdAt: new Date(now - 121 * 60 * 1000).toISOString(),
        expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
        userId: 'demo-u10',
        userName: 'Jordan Wells',
        userHandle: 'jordanw',
        userPhotoUrl: demoAvatars['demo-u10'],
        city: 'Houston',
        spotName: 'The Nook',
        spotPlaceId: 'demo-place-nook',
        spotLatLng: { lat: 29.7372, lng: -95.3915 },
        photoUrl: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?auto=format&fit=crop&w=1400&q=80',
        caption: 'Headphones in',
        tags: ['Study', 'Outlets', 'Wi-Fi'],
        openNow: true,
        visibility: 'public',
      },
      {
        id: `demo-c11-${now}`,
        createdAt: new Date(now - 140 * 60 * 1000).toISOString(),
        expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
        userId: 'demo-u11',
        userName: 'Hannah Park',
        userHandle: 'hannahp',
        userPhotoUrl: demoAvatars['demo-u11'],
        city: 'Houston',
        spotName: 'Midnight Diner',
        spotPlaceId: 'demo-place-midnightdiner',
        spotLatLng: { lat: 29.7568, lng: -95.3667 },
        photoUrl: 'https://images.unsplash.com/photo-1421622548261-c45bfe178854?auto=format&fit=crop&w=1400&q=80',
        caption: 'Late-night catch-up',
        tags: ['Late-night', 'Social', 'Seating'],
        openNow: true,
        visibility: 'friends',
      },
      {
        id: `demo-c12-${now}`,
        createdAt: new Date(now - 158 * 60 * 1000).toISOString(),
        expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
        userId: 'demo-u12',
        userName: 'Omar Hassan',
        userHandle: 'omarh',
        userPhotoUrl: demoAvatars['demo-u12'],
        city: 'Houston',
        spotName: 'Agora Coffee',
        spotPlaceId: 'demo-place-agora',
        spotLatLng: { lat: 29.7172, lng: -95.4018 },
        photoUrl: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1400&q=80',
        caption: 'Quick sprint',
        tags: ['Study', 'Outlets', 'Wi-Fi'],
        openNow: true,
        visibility: 'public',
      },
      {
        id: `demo-c13-${now}`,
        createdAt: new Date(now - 176 * 60 * 1000).toISOString(),
        expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
        userId: 'demo-u13',
        userName: 'Grace Liu',
        userHandle: 'gracel',
        userPhotoUrl: demoAvatars['demo-u13'],
        city: 'Houston',
        spotName: 'Fondren Library',
        spotPlaceId: 'demo-place-fondren',
        spotLatLng: { lat: 29.7174, lng: -95.4011 },
        photoUrl: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=1400&q=80',
        caption: 'Just one more chapter',
        tags: ['Quiet', 'Study', 'Seating'],
        openNow: false,
        visibility: 'public',
      },
      {
        id: `demo-c14-${now}`,
        createdAt: new Date(now - 195 * 60 * 1000).toISOString(),
        expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
        userId: 'demo-u14',
        userName: 'Diego Martinez',
        userHandle: 'diegom',
        userPhotoUrl: demoAvatars['demo-u14'],
        city: 'Houston',
        spotName: 'Bookshop Cafe',
        spotPlaceId: 'demo-place-bookshop',
        spotLatLng: { lat: 29.742, lng: -95.409 },
        photoUrl: 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=1400&q=80',
        caption: 'POV: book + coffee',
        tags: ['Quiet', 'Study', 'Bright'],
        openNow: false,
        visibility: 'public',
      },
      {
        id: `demo-c15-${now}`,
        createdAt: new Date(now - 214 * 60 * 1000).toISOString(),
        expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
        userId: 'demo-u15',
        userName: 'Nina Singh',
        userHandle: 'ninasingh',
        userPhotoUrl: demoAvatars['demo-u15'],
        city: 'Houston',
        spotName: 'Midnight Diner',
        spotPlaceId: 'demo-place-midnightdiner',
        spotLatLng: { lat: 29.7568, lng: -95.3667 },
        photoUrl: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1400&q=80',
        caption: 'Late-night reset',
        tags: ['Late-night', 'Wi-Fi', 'Seating'],
        openNow: true,
        visibility: 'public',
      },
      {
        id: `demo-c16-${now}`,
        createdAt: new Date(now - 238 * 60 * 1000).toISOString(),
        expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
        userId: 'demo-u16',
        userName: 'Sam Carter',
        userHandle: 'samc',
        userPhotoUrl: demoAvatars['demo-u16'],
        city: 'Houston',
        spotName: 'Agora Coffee',
        spotPlaceId: 'demo-place-agora',
        spotLatLng: { lat: 29.7172, lng: -95.4018 },
        photoUrl: 'https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=1400&q=80',
        caption: 'Afternoon desk setup',
        tags: ['Social', 'Wi-Fi', 'Seating'],
        openNow: true,
        visibility: 'public',
      },
    ];
    const isDemoSeedId = (id: any) => {
      const s = String(id || '');
      return s.startsWith('demo-c') || s.startsWith('demo-self-');
    };

    const currentProfile = currentUserId ? await getUserProfile(currentUserId).catch(() => null) : null;
    const currentUser = currentUserId
      ? {
          id: currentUserId,
          name: currentProfile?.name || null,
          handle: currentProfile?.handle || null,
          photoUrl: currentProfile?.photoUrl || null,
          city: currentProfile?.city || null,
          campus: currentProfile?.campus || null,
          campusOrCity: currentProfile?.campusOrCity || null,
          campusType: currentProfile?.campusType || null,
        }
      : null;

    const existingMine = currentUserId ? checkins.filter((c: any) => c?.userId === currentUserId) : [];
    const agoraAnchor = existingMine.find((c: any) => String(c?.spotName || c?.spot || '').toLowerCase().includes('agora'));
    const agoraPlaceId = agoraAnchor?.spotPlaceId || null;
    const agoraLatLng = agoraAnchor?.spotLatLng || null;

    const selfSeed =
      currentUserId && currentUser && !String(currentUserId).startsWith('demo-u')
        ? [
            {
              id: `demo-self-${currentUserId}-${now}-1`,
              createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
              expiresAt: new Date(now + 10 * 60 * 60 * 1000).toISOString(),
              userId: currentUserId,
              userName: currentUser.name || 'You',
              userHandle: currentUser.handle || 'you',
              userPhotoUrl: currentUser.photoUrl || null,
              city: currentUser.city || undefined,
              campus: currentUser.campus || undefined,
              campusOrCity: currentUser.campusOrCity || undefined,
              spotName: 'Agora Coffee',
              spotPlaceId: agoraPlaceId || undefined,
              spotLatLng: agoraLatLng || undefined,
              photoUrl: 'https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?auto=format&fit=crop&w=1400&q=80',
              caption: 'POV: coffee + laptop + one more task',
              tags: ['Study', 'Wi-Fi', 'Outlets'],
              openNow: true,
              visibility: 'public',
            },
            {
              id: `demo-self-${currentUserId}-${now}-2`,
              createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000 - 2 * 60 * 60 * 1000).toISOString(),
              userId: currentUserId,
              userName: currentUser.name || 'You',
              userHandle: currentUser.handle || 'you',
              userPhotoUrl: currentUser.photoUrl || null,
              city: currentUser.city || undefined,
              campus: currentUser.campus || undefined,
              campusOrCity: currentUser.campusOrCity || undefined,
              spotName: 'Agora Coffee',
              spotPlaceId: agoraPlaceId || undefined,
              spotLatLng: agoraLatLng || undefined,
              photoUrl: 'https://images.unsplash.com/photo-1517685352821-92cf88aee5a5?auto=format&fit=crop&w=1400&q=80',
              caption: 'Same table, different chapter',
              tags: ['Quiet', 'Study', 'Seating'],
              openNow: true,
              visibility: 'friends',
            },
            {
              id: `demo-self-${currentUserId}-${now}-3`,
              createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000 - 5 * 60 * 60 * 1000).toISOString(),
              userId: currentUserId,
              userName: currentUser.name || 'You',
              userHandle: currentUser.handle || 'you',
              userPhotoUrl: currentUser.photoUrl || null,
              city: currentUser.city || undefined,
              campus: currentUser.campus || undefined,
              campusOrCity: currentUser.campusOrCity || undefined,
              spotName: 'Bookshop Cafe',
              photoUrl: 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?auto=format&fit=crop&w=1400&q=80',
              caption: 'Book + coffee combo',
              tags: ['Quiet', 'Bright', 'Study'],
              openNow: false,
              visibility: 'public',
            },
            {
              id: `demo-self-${currentUserId}-${now}-4`,
              createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000 - 3 * 60 * 60 * 1000).toISOString(),
              userId: currentUserId,
              userName: currentUser.name || 'You',
              userHandle: currentUser.handle || 'you',
              userPhotoUrl: currentUser.photoUrl || null,
              city: currentUser.city || undefined,
              campus: currentUser.campus || undefined,
              campusOrCity: currentUser.campusOrCity || undefined,
              spotName: 'The Nook',
              photoUrl: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?auto=format&fit=crop&w=1400&q=80',
              caption: 'Headphones in. Focus mode.',
              tags: ['Coworking', 'Outlets', 'Wi-Fi'],
              openNow: true,
              visibility: 'public',
            },
            {
              id: `demo-self-${currentUserId}-${now}-5`,
              createdAt: new Date(now - 4 * 24 * 60 * 60 * 1000 - 4 * 60 * 60 * 1000).toISOString(),
              userId: currentUserId,
              userName: currentUser.name || 'You',
              userHandle: currentUser.handle || 'you',
              userPhotoUrl: currentUser.photoUrl || null,
              city: currentUser.city || undefined,
              campus: currentUser.campus || undefined,
              campusOrCity: currentUser.campusOrCity || undefined,
              spotName: 'Siphon Coffee',
              photoUrl: 'https://images.unsplash.com/photo-1501139083538-0139583c060f?auto=format&fit=crop&w=1400&q=80',
              caption: 'Quick reset between meetings',
              tags: ['Social', 'Spacious', 'Wi-Fi'],
              openNow: true,
              visibility: 'friends',
            },
            {
              id: `demo-self-${currentUserId}-${now}-6`,
              createdAt: new Date(now - 6 * 24 * 60 * 60 * 1000 - 2 * 60 * 60 * 1000).toISOString(),
              userId: currentUserId,
              userName: currentUser.name || 'You',
              userHandle: currentUser.handle || 'you',
              userPhotoUrl: currentUser.photoUrl || null,
              city: currentUser.city || undefined,
              campus: currentUser.campus || undefined,
              campusOrCity: currentUser.campusOrCity || undefined,
              spotName: 'Agora Coffee',
              spotPlaceId: agoraPlaceId || undefined,
              spotLatLng: agoraLatLng || undefined,
              photoUrl: 'https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=1400&q=80',
              caption: 'Afternoon desk setup',
              tags: ['Study', 'Wi-Fi', 'Bright'],
              openNow: true,
              visibility: 'public',
            },
          ]
        : [];

    const filtered = checkins.filter((c: any) => !isDemoSeedId(c?.id));
    const next = [...selfSeed, ...demoCheckins, ...filtered];
    if (isWeb()) {
      window.localStorage.setItem(KEY, JSON.stringify(next));
      try { window.localStorage.setItem(DEMO_SEED_KEY, String(now)); } catch {}
      try { (window as any).__PERCHED_DEMO = true; } catch {}
      try {
        const friendsMap: Record<string, string[]> = {
          'demo-u1': ['demo-u2', 'demo-u4', 'demo-u6', 'demo-u12', 'demo-u16'],
          'demo-u2': ['demo-u1', 'demo-u3', 'demo-u7', 'demo-u12', 'demo-u13'],
          'demo-u3': ['demo-u2', 'demo-u5', 'demo-u8', 'demo-u13', 'demo-u14'],
          'demo-u4': ['demo-u1', 'demo-u5', 'demo-u9', 'demo-u11'],
          'demo-u5': ['demo-u3', 'demo-u4', 'demo-u10', 'demo-u14'],
          'demo-u6': ['demo-u1', 'demo-u7', 'demo-u8', 'demo-u16'],
          'demo-u7': ['demo-u2', 'demo-u6', 'demo-u9', 'demo-u11'],
          'demo-u8': ['demo-u3', 'demo-u6', 'demo-u10', 'demo-u11'],
          'demo-u9': ['demo-u4', 'demo-u7', 'demo-u10', 'demo-u15'],
          'demo-u10': ['demo-u5', 'demo-u8', 'demo-u9', 'demo-u15'],
          'demo-u11': ['demo-u4', 'demo-u7', 'demo-u8', 'demo-u15'],
          'demo-u12': ['demo-u1', 'demo-u2', 'demo-u16'],
          'demo-u13': ['demo-u2', 'demo-u3', 'demo-u14'],
          'demo-u14': ['demo-u3', 'demo-u5', 'demo-u13'],
          'demo-u15': ['demo-u9', 'demo-u10', 'demo-u11'],
          'demo-u16': ['demo-u1', 'demo-u6', 'demo-u12'],
        };
        // If current user is not a demo account, connect them to demo users for demo purposes.
        const demoIds = Object.keys(friendsMap);
        if (currentUserId && !friendsMap[currentUserId]) {
          friendsMap[currentUserId] = demoIds.slice();
          demoIds.forEach((d) => {
            friendsMap[d] = Array.from(new Set([...(friendsMap[d] || []), currentUserId]));
          });
        }
        window.localStorage.setItem('spot_friends_v1', JSON.stringify(friendsMap));
      } catch {}
      try {
        const auto = await getDemoAutoApprove().catch(() => false);
        if (auto) {
          const adjusted = next.map((c: any) => (String(c.id || '').startsWith('demo-c') ? { ...c, approved: true, moderation: { status: 'approved' } } : c));
          window.localStorage.setItem(KEY, JSON.stringify(adjusted));
        }
      } catch {}
    } else {
      const store = await getAsyncStorage();
      if (store) {
        await store.setItem(KEY, JSON.stringify(next));
        try { await store.setItem(DEMO_SEED_KEY, String(now)); } catch {}
        try { (global as any).__PERCHED_DEMO = true; } catch {}
        try {
            const friendsMap: Record<string, string[]> = {
              'demo-u1': ['demo-u2', 'demo-u4', 'demo-u6', 'demo-u12', 'demo-u16'],
              'demo-u2': ['demo-u1', 'demo-u3', 'demo-u7', 'demo-u12', 'demo-u13'],
              'demo-u3': ['demo-u2', 'demo-u5', 'demo-u8', 'demo-u13', 'demo-u14'],
              'demo-u4': ['demo-u1', 'demo-u5', 'demo-u9', 'demo-u11'],
              'demo-u5': ['demo-u3', 'demo-u4', 'demo-u10', 'demo-u14'],
              'demo-u6': ['demo-u1', 'demo-u7', 'demo-u8', 'demo-u16'],
              'demo-u7': ['demo-u2', 'demo-u6', 'demo-u9', 'demo-u11'],
              'demo-u8': ['demo-u3', 'demo-u6', 'demo-u10', 'demo-u11'],
              'demo-u9': ['demo-u4', 'demo-u7', 'demo-u10', 'demo-u15'],
              'demo-u10': ['demo-u5', 'demo-u8', 'demo-u9', 'demo-u15'],
              'demo-u11': ['demo-u4', 'demo-u7', 'demo-u8', 'demo-u15'],
              'demo-u12': ['demo-u1', 'demo-u2', 'demo-u16'],
              'demo-u13': ['demo-u2', 'demo-u3', 'demo-u14'],
              'demo-u14': ['demo-u3', 'demo-u5', 'demo-u13'],
              'demo-u15': ['demo-u9', 'demo-u10', 'demo-u11'],
              'demo-u16': ['demo-u1', 'demo-u6', 'demo-u12'],
            };
            const demoIds = Object.keys(friendsMap);
            if (currentUserId && !friendsMap[currentUserId]) {
              friendsMap[currentUserId] = demoIds.slice();
              demoIds.forEach((d) => {
                friendsMap[d] = Array.from(new Set([...(friendsMap[d] || []), currentUserId]));
              });
            }
          await store.setItem('spot_friends_v1', JSON.stringify(friendsMap));
        } catch {}
        try {
          const auto = await getDemoAutoApprove().catch(() => false);
          if (auto) {
            const raw = await store.getItem(KEY);
            const arr = raw ? JSON.parse(raw) : [];
            const adjusted = arr.map((c: any) => (String(c.id || '').startsWith('demo-c') ? { ...c, approved: true, moderation: { status: 'approved' } } : c));
            await store.setItem(KEY, JSON.stringify(adjusted));
          }
        } catch {}
      } else {
        memory = next;
      }
    }
  } catch {
    // ignore
  }
}

export async function resetDemoNetwork() {
  try {
    if (isWeb()) {
      const raw = window.localStorage.getItem(KEY);
      const arr: Checkin[] = raw ? JSON.parse(raw) : [];
      const filtered = arr.filter((c) => {
        const id = String(c.id || '');
        return !id.startsWith('demo-c') && !id.startsWith('demo-self-');
      });
      window.localStorage.setItem(KEY, JSON.stringify(filtered));
      window.localStorage.removeItem(DEMO_SEED_KEY);
      return;
    }
    const store = await getAsyncStorage();
    if (store) {
      const raw = await store.getItem(KEY);
      const arr: Checkin[] = raw ? JSON.parse(raw) : [];
      const filtered = arr.filter((c) => {
        const id = String(c.id || '');
        return !id.startsWith('demo-c') && !id.startsWith('demo-self-');
      });
      await store.setItem(KEY, JSON.stringify(filtered));
      await store.removeItem(DEMO_SEED_KEY);
      memory = filtered.slice();
      return;
    }
    memory = memory.filter((c) => {
      const id = String(c.id || '');
      return !id.startsWith('demo-c') && !id.startsWith('demo-self-');
    });
  } catch {
    // ignore
  }
}

export async function getLastCheckinAt() {
  if (isWeb()) {
    const raw = window.localStorage.getItem(CHECKIN_COOLDOWN_KEY);
    return raw ? Number(raw) : 0;
  }
  const store = await getAsyncStorage();
  if (store) {
    try {
      const raw = await store.getItem(CHECKIN_COOLDOWN_KEY);
      return raw ? Number(raw) : 0;
    } catch {
      return (global as any)._spot_last_checkin || 0;
    }
  }
  return (global as any)._spot_last_checkin || 0;
}

export async function setLastCheckinAt(ts: number) {
  if (isWeb()) {
    window.localStorage.setItem(CHECKIN_COOLDOWN_KEY, String(ts));
    return;
  }
  const store = await getAsyncStorage();
  if (store) {
    try {
      await store.setItem(CHECKIN_COOLDOWN_KEY, String(ts));
    } catch {}
  }
  (global as any)._spot_last_checkin = ts;
}

export async function clearCheckins() {
  if (isWeb()) {
    window.localStorage.removeItem(KEY);
    return;
  }
  memory = [];
}

export async function saveCheckinDraft(draft: any) {
  if (!draft) return;
  const payload = { ...draft, savedAt: Date.now() };
  if (isWeb()) {
    try {
      window.localStorage.setItem(CHECKIN_DRAFT_KEY, JSON.stringify(payload));
    } catch {}
    return;
  }
  const store = await getAsyncStorage();
  if (store) {
    try {
      await store.setItem(CHECKIN_DRAFT_KEY, JSON.stringify(payload));
      return;
    } catch {}
  }
}

export async function getCheckinDraft() {
  if (isWeb()) {
    try {
      const raw = window.localStorage.getItem(CHECKIN_DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  const store = await getAsyncStorage();
  if (store) {
    try {
      const raw = await store.getItem(CHECKIN_DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  return null;
}

export async function clearCheckinDraft() {
  if (isWeb()) {
    try {
      window.localStorage.removeItem(CHECKIN_DRAFT_KEY);
    } catch {}
    return;
  }
  const store = await getAsyncStorage();
  if (store) {
    try {
      await store.removeItem(CHECKIN_DRAFT_KEY);
    } catch {}
  }
}

const WAITLIST_KEY = 'spot_waitlist_v1';

const WAITLIST_SHARES = 'spot_waitlist_shares_v1';

export async function saveWaitlistEmail(email: string) {
  if (isWeb()) {
    const raw = window.localStorage.getItem(WAITLIST_KEY);
    const arr: string[] = raw ? JSON.parse(raw) : [];
    arr.unshift(email);
    window.localStorage.setItem(WAITLIST_KEY, JSON.stringify(arr));
    return;
  }

  // native fallback - keep in-memory (no persistence)
  try {
    // simple global
    (global as any)._spot_waitlist = (global as any)._spot_waitlist || [];
    (global as any)._spot_waitlist.unshift(email);
  } catch {}
}

export async function recordWaitlistShare(email: string) {
  if (isWeb()) {
    const raw = window.localStorage.getItem(WAITLIST_SHARES);
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};
    map[email] = (map[email] || 0) + 1;
    window.localStorage.setItem(WAITLIST_SHARES, JSON.stringify(map));
    return map[email];
  }

  try {
    (global as any)._spot_waitlist_shares = (global as any)._spot_waitlist_shares || {};
    (global as any)._spot_waitlist_shares[email] = ((global as any)._spot_waitlist_shares[email] || 0) + 1;
    return (global as any)._spot_waitlist_shares[email];
  } catch {
    return 0;
  }
}

const STATS_KEY = 'spot_stats_v2';
const STATS_META_KEY = 'spot_stats_meta_v1';
const ONBOARDING_KEY = 'spot_onboarding_complete_v1';
const ONBOARDING_PROFILE_KEY = 'spot_onboarding_profile_v1';
const NOTIF_KEY = 'spot_notifications_v1';
const LOCATION_ENABLED_KEY = 'spot_location_enabled_v1';
const SAVED_SPOTS_KEY = 'spot_saved_spots_v1';
const PLACE_EVENTS_KEY = 'spot_place_events_v1';
const PLACE_PREFS_KEY = 'spot_place_prefs_v1';
const PLACE_TAGS_KEY = 'spot_place_tags_v1';
const savedSpotListeners = new Set<(spots: any[]) => void>();

export async function recordSpotVisit(spotName: string, spotPlaceId?: string) {
  if (!spotName && !spotPlaceId) return;
  const key = spotPlaceId ? `place:${spotPlaceId}` : `name:${spotName}`;
  if (isWeb()) {
    const raw = window.localStorage.getItem(STATS_KEY);
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};
    map[key] = (map[key] || 0) + 1;
    window.localStorage.setItem(STATS_KEY, JSON.stringify(map));
    if (spotPlaceId) {
      const metaRaw = window.localStorage.getItem(STATS_META_KEY);
      const meta: Record<string, string> = metaRaw ? JSON.parse(metaRaw) : {};
      meta[key] = spotName || meta[key] || 'Unknown';
      window.localStorage.setItem(STATS_META_KEY, JSON.stringify(meta));
    }
    return map[key];
  }
  try {
    (global as any)._spot_stats = (global as any)._spot_stats || {};
    (global as any)._spot_stats[key] = ((global as any)._spot_stats[key] || 0) + 1;
    if (spotPlaceId) {
      (global as any)._spot_stats_meta = (global as any)._spot_stats_meta || {};
      (global as any)._spot_stats_meta[key] = spotName || (global as any)._spot_stats_meta[key] || 'Unknown';
    }
    return (global as any)._spot_stats[key];
  } catch {
    return 0;
  }
}

export async function getTopSpotsLocal(limit = 10) {
  if (isWeb()) {
    const raw = window.localStorage.getItem(STATS_KEY);
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};
    const metaRaw = window.localStorage.getItem(STATS_META_KEY);
    const meta: Record<string, string> = metaRaw ? JSON.parse(metaRaw) : {};
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key]) => meta[key] || key.replace(/^name:/, '').replace(/^place:/, ''));
  }
  const map = (global as any)._spot_stats || {};
  const meta = (global as any)._spot_stats_meta || {};
  return Object.entries(map)
    .sort((a: any, b: any) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => meta[key] || String(key).replace(/^name:/, '').replace(/^place:/, ''));
}

export async function getRecentSpots(limit = 6) {
  const list = await getCheckins();
  const seen = new Set<string>();
  const recent: { name: string; placeId?: string; location?: { lat: number; lng: number } }[] = [];
  list.forEach((c) => {
    const name = c.spotName || c.spot || '';
    const placeId = c.spotPlaceId || '';
    const key = placeId ? `place:${placeId}` : `name:${name}`;
    if (!name || seen.has(key)) return;
    seen.add(key);
    recent.push({
      name,
      placeId: placeId || undefined,
      location: c.spotLatLng,
    });
  });
  return recent.slice(0, limit);
}

export async function getSavedSpots(limit = 20) {
  if (isWeb()) {
    try {
      const raw = window.localStorage.getItem(SAVED_SPOTS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.slice(0, limit) : [];
    } catch {
      return [];
    }
  }
  const list = await readNativeJson<any[]>(SAVED_SPOTS_KEY, []);
  return Array.isArray(list) ? list.slice(0, limit) : [];
}

type PlaceEvent = {
  ts: number;
  userId?: string;
  placeId?: string | null;
  name?: string;
  category?: string;
  event: 'impression' | 'tap' | 'save' | 'checkin' | 'map_open';
};

const DEFAULT_PREFS = ['cafe', 'library', 'coworking', 'campus', 'bookstore', 'other'];
const EVENT_WEIGHTS: Record<PlaceEvent['event'], number> = {
  impression: 0.2,
  tap: 1,
  save: 2,
  checkin: 3,
  map_open: 0.5,
};

function loadPlaceEvents(): PlaceEvent[] {
  if (isWeb()) {
    try {
      const raw = window.localStorage.getItem(PLACE_EVENTS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }
  try {
    const list = (global as any)._spot_place_events || [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function savePlaceEvents(events: PlaceEvent[]) {
  const next = events.slice(0, 500);
  if (isWeb()) {
    try {
      window.localStorage.setItem(PLACE_EVENTS_KEY, JSON.stringify(next));
      return;
    } catch {
      return;
    }
  }
  try {
    (global as any)._spot_place_events = next;
  } catch {}
}

export async function recordPlaceEvent(event: PlaceEvent) {
  if (!event) return;
  const events = loadPlaceEvents();
  events.unshift({ ...event, ts: event.ts || Date.now() });
  savePlaceEvents(events);
}

export async function getUserPreferenceScores(userId?: string) {
  const events = loadPlaceEvents();
  const halfLifeMs = 14 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const scores: Record<string, number> = {};
  DEFAULT_PREFS.forEach((c) => {
    scores[c] = 0;
  });
  events.forEach((e) => {
    if (userId && e.userId && e.userId !== userId) return;
    const category = e.category || 'other';
    const weight = EVENT_WEIGHTS[e.event] || 0.5;
    const age = now - e.ts;
    const decay = Math.pow(0.5, age / halfLifeMs);
    scores[category] = (scores[category] || 0) + weight * decay;
  });
  if (isWeb()) {
    try {
      window.localStorage.setItem(PLACE_PREFS_KEY, JSON.stringify(scores));
    } catch {}
  }
  return scores;
}

export async function getUserPlaceSignals(userId?: string, placeId?: string, name?: string) {
  const events = loadPlaceEvents();
  const key = placeId ? `place:${placeId}` : `name:${name || ''}`;
  const now = Date.now();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  const signals = { views: 0, taps: 0, saves: 0 };
  events.forEach((e) => {
    if (userId && e.userId && e.userId !== userId) return;
    const eventKey = e.placeId ? `place:${e.placeId}` : `name:${e.name || ''}`;
    if (eventKey !== key) return;
    if (now - e.ts > oneWeek) return;
    if (e.event === 'impression') signals.views += 1;
    if (e.event === 'tap') signals.taps += 1;
    if (e.event === 'save') signals.saves += 1;
  });
  return signals;
}

export async function recordPlaceTag(placeId: string | null | undefined, name: string | undefined, tag: string, delta = 1) {
  const key = placeId ? `place:${placeId}` : `name:${name || ''}`;
  if (isWeb()) {
    try {
      const raw = window.localStorage.getItem(PLACE_TAGS_KEY);
      const data = raw ? JSON.parse(raw) : {};
      data[key] = data[key] || {};
      const next = (data[key][tag] || 0) + delta;
      data[key][tag] = Math.max(0, next);
      window.localStorage.setItem(PLACE_TAGS_KEY, JSON.stringify(data));
      return;
    } catch {
      return;
    }
  }
  try {
    (global as any)._spot_place_tags = (global as any)._spot_place_tags || {};
    (global as any)._spot_place_tags[key] = (global as any)._spot_place_tags[key] || {};
    const current = (global as any)._spot_place_tags[key][tag] || 0;
    (global as any)._spot_place_tags[key][tag] = Math.max(0, current + delta);
  } catch {}
}

export async function getPlaceTagScores(placeId?: string, name?: string) {
  const key = placeId ? `place:${placeId}` : `name:${name || ''}`;
  if (isWeb()) {
    try {
      const raw = window.localStorage.getItem(PLACE_TAGS_KEY);
      const data = raw ? JSON.parse(raw) : {};
      return data[key] || {};
    } catch {
      return {};
    }
  }
  try {
    const data = (global as any)._spot_place_tags || {};
    return data[key] || {};
  } catch {
    return {};
  }
}

export async function isSavedSpot(placeId?: string, name?: string) {
  const list = await getSavedSpots(200);
  const key = placeId ? `place:${placeId}` : `name:${name || ''}`;
  return list.some((s: any) => (s.key || '') === key);
}

export async function toggleSavedSpot(spot: { placeId?: string; name?: string }) {
  const placeId = spot.placeId || '';
  const name = spot.name || '';
  const key = placeId ? `place:${placeId}` : `name:${name}`;
  const entry = { key, placeId: placeId || null, name: name || 'Unknown', savedAt: Date.now() };
  if (isWeb()) {
    try {
      const raw = window.localStorage.getItem(SAVED_SPOTS_KEY);
      const list = raw ? JSON.parse(raw) : [];
      const next = Array.isArray(list) ? list.filter((s: any) => s.key !== key) : [];
      const exists = Array.isArray(list) && list.some((s: any) => s.key === key);
      if (!exists) next.unshift(entry);
      window.localStorage.setItem(SAVED_SPOTS_KEY, JSON.stringify(next));
      savedSpotListeners.forEach((cb) => cb(next));
      return !exists;
    } catch {
      return false;
    }
  }
  const list = await readNativeJson<any[]>(SAVED_SPOTS_KEY, []);
  const safeList = Array.isArray(list) ? list : [];
  const next = safeList.filter((s: any) => s.key !== key);
  const exists = safeList.some((s: any) => s.key === key);
  if (!exists) next.unshift(entry);
  await writeNativeJson(SAVED_SPOTS_KEY, next);
  savedSpotListeners.forEach((cb) => cb(next));
  return !exists;
}

export function subscribeSavedSpots(callback: (spots: any[]) => void) {
  savedSpotListeners.add(callback);
  return () => {
    savedSpotListeners.delete(callback);
  };
}

export async function getWaitlistEmails() {
  if (isWeb()) {
    const raw = window.localStorage.getItem(WAITLIST_KEY);
    const arr: string[] = raw ? JSON.parse(raw) : [];
    return arr;
  }

  return (global as any)._spot_waitlist || [];
}

export async function setOnboardingComplete(done: boolean) {
  if (isWeb()) {
    window.localStorage.setItem(ONBOARDING_KEY, JSON.stringify(!!done));
    return;
  }
  await writeNativeJson(ONBOARDING_KEY, !!done);
}

export async function getOnboardingComplete() {
  if (isWeb()) {
    const raw = window.localStorage.getItem(ONBOARDING_KEY);
    return raw ? JSON.parse(raw) : false;
  }
  return await readNativeJson<boolean>(ONBOARDING_KEY, false);
}

export async function setOnboardingProfile(profile: { name?: string; city?: string; campus?: string; campusOrCity?: string; campusType?: 'campus' | 'city' }) {
  if (isWeb()) {
    window.localStorage.setItem(ONBOARDING_PROFILE_KEY, JSON.stringify(profile || {}));
    return;
  }
  await writeNativeJson(ONBOARDING_PROFILE_KEY, profile || {});
}

export async function getOnboardingProfile() {
  if (isWeb()) {
    const raw = window.localStorage.getItem(ONBOARDING_PROFILE_KEY);
    return raw ? JSON.parse(raw) : {};
  }
  return await readNativeJson<Record<string, any>>(ONBOARDING_PROFILE_KEY, {});
}

export async function setNotificationsEnabled(enabled: boolean) {
  if (isWeb()) {
    window.localStorage.setItem(NOTIF_KEY, JSON.stringify(!!enabled));
    return;
  }
  await writeNativeJson(NOTIF_KEY, !!enabled);
}

export async function getNotificationsEnabled() {
  if (isWeb()) {
    const raw = window.localStorage.getItem(NOTIF_KEY);
    return raw ? JSON.parse(raw) : false;
  }
  return await readNativeJson<boolean>(NOTIF_KEY, false);
}

export async function setDemoAutoApprove(enabled: boolean) {
  if (isWeb()) {
    try { window.localStorage.setItem(DEMO_AUTO_APPROVE_KEY, JSON.stringify(!!enabled)); } catch {}
    return;
  }
  await writeNativeJson(DEMO_AUTO_APPROVE_KEY, !!enabled);
}

export async function getDemoAutoApprove() {
  if (isWeb()) {
    try { const raw = window.localStorage.getItem(DEMO_AUTO_APPROVE_KEY); return raw ? JSON.parse(raw) : false; } catch { return false; }
  }
  return await readNativeJson<boolean>(DEMO_AUTO_APPROVE_KEY, false);
}

export async function setDemoModeEnabled(enabled: boolean) {
  try {
    try { (global as any).__PERCHED_DEMO = !!enabled; } catch {}
    try { if (typeof window !== 'undefined') (window as any).__PERCHED_DEMO = !!enabled; } catch {}
    if (isWeb()) {
      try { window.localStorage.setItem(DEMO_MODE_ENABLED_KEY, JSON.stringify(!!enabled)); } catch {}
      return;
    }
    await writeNativeJson(DEMO_MODE_ENABLED_KEY, !!enabled);
  } catch {
    // ignore
  }
}

export async function getDemoModeEnabled() {
  if (isWeb()) {
    try { const raw = window.localStorage.getItem(DEMO_MODE_ENABLED_KEY); return raw ? JSON.parse(raw) : false; } catch { return false; }
  }
  return await readNativeJson<boolean>(DEMO_MODE_ENABLED_KEY, false);
}

export async function setLocationEnabled(enabled: boolean) {
  if (isWeb()) {
    window.localStorage.setItem(LOCATION_ENABLED_KEY, JSON.stringify(!!enabled));
    return;
  }
  await writeNativeJson(LOCATION_ENABLED_KEY, !!enabled);
}

export async function getLocationEnabled() {
  if (isWeb()) {
    const raw = window.localStorage.getItem(LOCATION_ENABLED_KEY);
    // default on for better Explore experience
    return raw ? JSON.parse(raw) : true;
  }
  return await readNativeJson<boolean>(LOCATION_ENABLED_KEY, true);
}
