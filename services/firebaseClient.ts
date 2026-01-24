// Lightweight Firebase client wrapper (dynamic import).
// Fill FIREBASE_CONFIG below or load from env. Install `firebase` locally to enable runtime.

import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/storage';
import { CHECKIN_TTL_MS } from '@/services/checkinUtils';
import { spotKey } from '@/services/spotUtils';
import { devLog } from '@/services/logger';
import { normalizePhone } from '@/utils/phone';

export const FIREBASE_CONFIG = {
  apiKey: 'REDACTED',
  authDomain: 'spot-app-ce2d8.firebaseapp.com',
  projectId: 'spot-app-ce2d8',
  storageBucket: 'spot-app-ce2d8.firebasestorage.app',
  messagingSenderId: '1077668570664',
  appId: '1:1077668570664:web:13956d4db5d0124911371d',
  measurementId: 'G-0RTBHQMXT8',
};

function getStorageBucketCandidates() {
  const config = resolveFirebaseConfig();
  const envBucket = (process.env.FIREBASE_STORAGE_BUCKET as string) || (global as any)?.FIREBASE_STORAGE_BUCKET;
  const projectBucketLegacy = config.projectId ? `${config.projectId}.appspot.com` : '';
  const projectBucketModern = config.projectId ? `${config.projectId}.firebasestorage.app` : '';
  const buckets = [envBucket, config.storageBucket, projectBucketLegacy, projectBucketModern].filter((b) => typeof b === 'string' && b.trim().length > 0);
  return Array.from(new Set(buckets));
}


function resolveFirebaseConfig() {
  const envRaw = process.env.FIREBASE_CONFIG as string | undefined;
  let envConfig: any = null;
  if (envRaw) {
    try {
      envConfig = JSON.parse(envRaw);
    } catch {
      envConfig = null;
    }
  }
  const globalConfig = (global as any)?.FIREBASE_CONFIG || null;
  return {
    ...FIREBASE_CONFIG,
    ...(envConfig || {}),
    ...(globalConfig || {}),
  };
}

export function isFirebaseConfigured() {
  // allow overriding via env/global at runtime
  const config = resolveFirebaseConfig();
  const key = (process.env.FIREBASE_API_KEY as string) || (process.env.FIREBASE_APIKEY as string) || (process.env.FIREBASE_CONFIG && (process.env.FIREBASE_CONFIG as any).apiKey) || config.apiKey || (global as any)?.FIREBASE_API_KEY || (global as any)?.FIREBASE_CONFIG?.apiKey;
  if (!key) return false;
  if (typeof key === 'string' && (key.trim() === '' || key.includes('REPLACE_ME'))) return false;
  return true;
}

let _initialized = false;
let _firebaseApp: any = null;
let _initError: any = null;
const checkinsCache = new Map<string, { ts: number; payload: any }>();
const usersByIdCache = new Map<string, { ts: number; payload: any[] }>();
const userFriendsCache = new Map<string, { ts: number; payload: string[] }>();

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function cursorKey(cursor: any) {
  if (!cursor) return 'none';
  try {
    if (typeof cursor.toMillis === 'function') return `ts:${cursor.toMillis()}`;
  } catch {}
  try {
    return JSON.stringify(cursor);
  } catch {
    return String(cursor);
  }
}

function readLocalUsers() {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const rawList = window.localStorage.getItem('spot_users_v1');
    const list = rawList ? JSON.parse(rawList) : [];
    const currentRaw = window.localStorage.getItem('spot_user_v1');
    const current = currentRaw ? JSON.parse(currentRaw) : null;
    const merged = current ? [current, ...list] : list;
    const seen = new Set<string>();
    return merged.filter((u: any) => {
      if (!u || !u.id) return false;
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    });
  } catch {
    return [];
  }
}

function readLocalFriends() {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem('spot_friends_v1');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLocalFriends(data: any) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem('spot_friends_v1', JSON.stringify(data));
  } catch {}
}

function readLocalRequests() {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem('spot_friend_requests_v1');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeLocalRequests(items: any[]) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem('spot_friend_requests_v1', JSON.stringify(items));
  } catch {}
}

export function ensureFirebase() {
  if (_initialized) return _firebaseApp;

  try {
    const firebaseApp = (firebase as any)?.default ?? firebase;
    if (!firebaseApp?.apps?.length) {
      firebaseApp.initializeApp(resolveFirebaseConfig());
    }
    _firebaseApp = firebaseApp;
    _initialized = true;
    return _firebaseApp;
  } catch (e) {
    _initError = e;
    return null;
  }
}

export function getFirebaseInitError() {
  return _initError;
}

async function getBlobFromUri(uri: string): Promise<Blob | null> {
  try {
    const response = await fetch(uri);
    if (response.ok) return await response.blob();
  } catch {}
  try {
    const mod = await import('expo-file-system/legacy');
    const base64 = await mod.readAsStringAsync(uri, { encoding: mod.EncodingType.Base64 });
    const dataUri = `data:image/jpeg;base64,${base64}`;
    const response = await fetch(dataUri);
    if (response.ok) return await response.blob();
  } catch {}
  return null;
}

async function getBase64FromUri(uri: string): Promise<string | null> {
  if (!uri) return null;
  if (uri.startsWith('data:')) {
    return uri;
  }
  try {
    const mod = await import('expo-file-system/legacy');
    const base64 = await mod.readAsStringAsync(uri, { encoding: mod.EncodingType.Base64 });
    return base64 || null;
  } catch {}
  return null;
}

export async function uploadPhotoToStorage(uri: string, userId?: string) {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Firebase not initialized. Run `npm install firebase` and provide config.');

  const storage = fb.storage();
  const resolvedUserId = userId || fb.auth()?.currentUser?.uid || 'anonymous';
  const path = `checkins/${resolvedUserId}/${Date.now()}.jpg`;

  const blob = await getBlobFromUri(uri);
  const base64 = blob ? null : await getBase64FromUri(uri);
  if (!blob && !base64) throw new Error('Unable to read photo for upload.');

  let lastErr: any = null;
  const buckets = getStorageBucketCandidates();
  const refs = buckets.length
    ? buckets.map((bucket) => storage.refFromURL(`gs://${bucket}`).child(path))
    : [storage.ref().child(path)];

  for (const ref of refs) {
    try {
      if (blob) {
        await ref.put(blob, { contentType: blob.type || 'image/jpeg' });
        try {
          if (typeof (blob as any).close === 'function') (blob as any).close();
        } catch {}
      } else if (base64) {
        if (base64.startsWith('data:')) {
          await ref.putString(base64, 'data_url');
        } else {
          await ref.putString(base64, 'base64', { contentType: 'image/jpeg' });
        }
      }
      const downloadURL = await ref.getDownloadURL();
      return downloadURL as string;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Photo upload failed.');
}

export async function createCheckinRemote({ userId, userName, userHandle, userPhotoUrl, spotName, caption, photoUrl, photoPending, campusOrCity, city, campus, visibility, spotPlaceId, spotLatLng, clientId, tags }: any) {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Firebase not initialized.');

  const db = fb.firestore();
  const now = Date.now();
  const createdAt = fb.firestore.Timestamp.fromMillis(now);
  const expiresAt = fb.firestore.Timestamp.fromMillis(now + CHECKIN_TTL_MS);
  const doc = {
    clientId: clientId || null,
    userId,
    userName: userName || null,
    userHandle: userHandle || null,
    userPhotoUrl: userPhotoUrl || null,
    visibility: visibility || 'public',
    spotName,
    spotPlaceId: spotPlaceId || null,
    spotLatLng: spotLatLng || null,
    caption: caption || '',
    tags: Array.isArray(tags) ? tags : [],
    photoUrl: photoUrl || null,
    photoPending: !!photoPending,
    campusOrCity: campusOrCity || city || null,
    city: city || null,
    campus: campus || null,
    createdAt,
    createdAtServer: fb.firestore.FieldValue.serverTimestamp(),
    createdAtMs: now,
    expiresAt,
    approved: false,
    moderation: { status: 'pending' },
  };

  const ref = await db.collection('checkins').add(doc);
  return { id: ref.id, ...doc };
}

const EVENT_WEIGHTS: Record<string, number> = {
  impression: 0.2,
  tap: 1,
  save: 2,
  checkin: 3,
  map_open: 0.5,
};

export async function recordPlaceEventRemote(payload: { userId?: string; placeId?: string | null; name?: string; category?: string; event: string }) {
  const fb = ensureFirebase();
  if (!fb || !payload?.userId) return;
  try {
    const db = fb.firestore();
    const weight = EVENT_WEIGHTS[payload.event] || 0.5;
    const category = payload.category || 'other';
    const placeId = payload.placeId || '';
    const key = spotKey(placeId || undefined, payload.name || 'unknown');
    const now = fb.firestore.FieldValue.serverTimestamp();
    await db.collection('user_place_prefs').doc(payload.userId).set({
      updatedAt: now,
      [`categories.${category}`]: fb.firestore.FieldValue.increment(weight),
      [`events.${payload.event}`]: fb.firestore.FieldValue.increment(1),
    }, { merge: true });
    await db.collection('place_scores').doc(key).set({
      updatedAt: now,
      placeId: placeId || null,
      name: payload.name || null,
      category,
      score: fb.firestore.FieldValue.increment(weight),
      [`events.${payload.event}`]: fb.firestore.FieldValue.increment(1),
    }, { merge: true });
  } catch {
    // ignore remote logging failures
  }
}

export async function getUserPreferenceRemote(userId: string) {
  const fb = ensureFirebase();
  if (!fb || !userId) return null;
  try {
    const doc = await fb.firestore().collection('user_place_prefs').doc(userId).get();
    if (!doc.exists) return null;
    const data = doc.data() || {};
    return (data.categories as Record<string, number>) || null;
  } catch {
    return null;
  }
}

export async function recordPlaceTagRemote(payload: { placeId?: string | null; name?: string; tag: string; delta?: number }) {
  const fb = ensureFirebase();
  if (!fb) return;
  try {
    const db = fb.firestore();
    const delta = typeof payload.delta === 'number' ? payload.delta : 1;
    const key = spotKey(payload.placeId || undefined, payload.name || 'unknown');
    await db.collection('place_tags').doc(key).set({
      [`tags.${payload.tag}`]: fb.firestore.FieldValue.increment(delta),
      updatedAt: fb.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch {
    // ignore
  }
}

export async function getPlaceTagRemote(placeId?: string, name?: string) {
  const fb = ensureFirebase();
  if (!fb) return null;
  try {
    const key = spotKey(placeId || undefined, name || 'unknown');
    const doc = await fb.firestore().collection('place_tags').doc(key).get();
    if (!doc.exists) return null;
    const data = doc.data() || {};
    return data.tags || null;
  } catch {
    return null;
  }
}

export async function recordPlaceTagVoteRemote(payload: { userId: string; placeId?: string | null; name?: string; tag: string; active: boolean }) {
  const fb = ensureFirebase();
  if (!fb || !payload.userId) return;
  try {
    const db = fb.firestore();
    const key = spotKey(payload.placeId || undefined, payload.name || 'unknown');
    await db.collection('place_tag_votes').doc(`${payload.userId}_${key}`).set({
      userId: payload.userId,
      placeKey: key,
      [`votes.${payload.tag}`]: payload.active,
      updatedAt: fb.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  } catch {
    // ignore
  }
}

export async function getPlaceTagVotesRemote(userId: string, placeId?: string, name?: string) {
  const fb = ensureFirebase();
  if (!fb || !userId) return null;
  try {
    const key = spotKey(placeId || undefined, name || 'unknown');
    const doc = await fb.firestore().collection('place_tag_votes').doc(`${userId}_${key}`).get();
    if (!doc.exists) return null;
    const data = doc.data() || {};
    return data.votes || null;
  } catch {
    return null;
  }
}

export async function getCheckinsRemote(limit = 50, startAfter?: any) {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Firebase not initialized.');

  const cacheKey = `${limit}:${cursorKey(startAfter)}`;
  const cached = checkinsCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 10000) {
    return cached.payload;
  }

  const db = fb.firestore();
  let q: any = db.collection('checkins').orderBy('createdAt', 'desc');
  if (startAfter) {
    q = q.startAfter(startAfter);
  }
  q = q.limit(limit);

  const snapshot = await q.get();
  const items: any[] = [];
  snapshot.forEach((doc: any) => {
    items.push({ id: doc.id, ...(doc.data() || {}) });
  });

  // lastCursor is the createdAt value of the last item (useful as a startAfter cursor)
  const lastCursor = items.length ? items[items.length - 1].createdAt : null;
  const payload = { items, lastCursor };
  checkinsCache.set(cacheKey, { ts: Date.now(), payload });
  return payload;
}

export async function getCheckinsForUserRemote(userId: string, limit = 80, startAfter?: any) {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Firebase not initialized.');
  if (!userId) return { items: [], lastCursor: null };

  const cacheKey = `user:${userId}:${limit}:${cursorKey(startAfter)}`;
  const cached = checkinsCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 10000) {
    return cached.payload;
  }

  const db = fb.firestore();
  let q: any = db.collection('checkins').where('userId', '==', userId).orderBy('createdAt', 'desc');
  if (startAfter) q = q.startAfter(startAfter);
  q = q.limit(limit);

  try {
    const snapshot = await q.get();
    const items: any[] = [];
    snapshot.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
    const lastCursor = items.length ? items[items.length - 1].createdAt : null;
    const payload = { items, lastCursor };
    checkinsCache.set(cacheKey, { ts: Date.now(), payload });
    return payload;
  } catch (err: any) {
    const msg = typeof err?.message === 'string' ? err.message.toLowerCase() : '';
    const needsIndex = msg.includes('index') || msg.includes('indexes') || msg.includes('failed_precondition');
    if (!needsIndex) throw err;

    // Fallback for dev/demo environments where the userId+createdAt index isn't configured yet.
    const fallback = await getCheckinsRemote(Math.max(200, limit * 4));
    const items = (fallback?.items || []).filter((c: any) => c?.userId === userId).slice(0, limit);
    const lastCursor = items.length ? items[items.length - 1].createdAt : null;
    const payload = { items, lastCursor };
    checkinsCache.set(cacheKey, { ts: Date.now(), payload });
    return payload;
  }
}

export async function getApprovedCheckinsRemote(limit = 50, startAfter?: any) {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Firebase not initialized.');

  const cacheKey = `approved:${limit}:${cursorKey(startAfter)}`;
  const cached = checkinsCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 10000) {
    return cached.payload;
  }

  const db = fb.firestore();
  let q: any = db.collection('checkins').where('approved', '==', true).orderBy('createdAt', 'desc');
  if (startAfter) q = q.startAfter(startAfter);
  q = q.limit(limit);

  const snapshot = await q.get();
  const items: any[] = [];
  snapshot.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
  const lastCursor = items.length ? items[items.length - 1].createdAt : null;
  const payload = { items, lastCursor };
  checkinsCache.set(cacheKey, { ts: Date.now(), payload });
  return payload;
}

export function subscribeApprovedCheckins(onUpdate: (items: any[]) => void, limit = 40) {
  const fb = ensureFirebase();
  if (!fb) return () => {};
  const db = fb.firestore();
  const q = db.collection('checkins').where('approved', '==', true).orderBy('createdAt', 'desc').limit(limit);
  const unsub = q.onSnapshot((snapshot: any) => {
    const items: any[] = [];
    snapshot.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
    onUpdate(items);
  });
  return unsub;
}

export async function getUsersByIdsCached(ids: string[], ttlMs = 15000) {
  if (!ids || ids.length === 0) return [];
  const key = ids.slice().sort().join('|');
  const cached = usersByIdCache.get(key);
  if (cached && Date.now() - cached.ts < ttlMs) return cached.payload;
  const payload = await getUsersByIds(ids);
  usersByIdCache.set(key, { ts: Date.now(), payload });
  return payload;
}

export async function getUserFriendsCached(userId: string, ttlMs = 15000) {
  if (!userId) return [];
  const cached = userFriendsCache.get(userId);
  if (cached && Date.now() - cached.ts < ttlMs) return cached.payload;
  const payload = await getUserFriends(userId);
  userFriendsCache.set(userId, { ts: Date.now(), payload });
  return payload;
}

export function subscribeCheckins(onUpdate: (items: any[]) => void, limit = 40) {
  const fb = ensureFirebase();
  if (!fb) return () => {};

  const db = fb.firestore();
  const q = db.collection('checkins').orderBy('createdAt', 'desc').limit(limit);
  const unsub = q.onSnapshot((snapshot: any) => {
    const items: any[] = [];
    snapshot.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
    onUpdate(items);
  });

  return unsub;
}

export async function getCheckinByClientId(clientId: string) {
  if (!clientId) return null;
  const fb = ensureFirebase();
  if (!fb) return null;
  try {
    const db = fb.firestore();
    const q = await db.collection('checkins').where('clientId', '==', clientId).limit(1).get();
    if (q.empty) return null;
    const doc = q.docs[0];
    return { id: doc.id, data: doc.data() || {} };
  } catch {
    return null;
  }
}

export async function getCheckinById(checkinId: string) {
  if (!checkinId) return null;
  const fb = ensureFirebase();
  if (!fb) return null;
  try {
    const doc = await fb.firestore().collection('checkins').doc(checkinId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...(doc.data() || {}) };
  } catch {
    return null;
  }
}

export async function deleteCheckinRemote(checkinId: string) {
  if (!checkinId) return false;
  const fb = ensureFirebase();
  if (!fb) return false;
  try {
    await fb.firestore().collection('checkins').doc(checkinId).delete();
    return true;
  } catch {
    return false;
  }
}

export async function updateCheckinRemote(checkinId: string, fields: Record<string, any>) {
  const fb = ensureFirebase();
  if (!fb || !checkinId) return;
  try {
    const db = fb.firestore();
    await db.collection('checkins').doc(checkinId).set(fields, { merge: true });
  } catch {
    // ignore
  }
}

// Subscribe to checkins for a specific set of user IDs (handles Firestore 'in' batching)
export function subscribeCheckinsForUsers(userIds: string[], onUpdate: (items: any[]) => void, limit = 50) {
  const fb = ensureFirebase();
  if (!fb) return () => {};
  if (!userIds || userIds.length === 0) return () => {};
  const db = fb.firestore();
  const unsubs: Array<() => void> = [];

  // Firestore 'in' supports up to 10 values — batch if needed
  for (let i = 0; i < userIds.length; i += 10) {
    const batch = userIds.slice(i, i + 10);
    const q = db.collection('checkins').where('userId', 'in', batch).orderBy('createdAt', 'desc').limit(limit);
    const unsub = q.onSnapshot((snapshot: any) => {
      const items: any[] = [];
      snapshot.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
      onUpdate(items);
    });
    unsubs.push(unsub);
  }

  return () => unsubs.forEach((u) => u());
}

// Subscribe to approved checkins for a specific set of user IDs (handles Firestore 'in' batching)
export function subscribeApprovedCheckinsForUsers(userIds: string[], onUpdate: (items: any[]) => void, limit = 50) {
  const fb = ensureFirebase();
  if (!fb) return () => {};
  if (!userIds || userIds.length === 0) return () => {};
  const db = fb.firestore();
  const unsubs: Array<() => void> = [];

  // Firestore 'in' supports up to 10 values — batch if needed
  for (let i = 0; i < userIds.length; i += 10) {
    const batch = userIds.slice(i, i + 10);
    const q = db.collection('checkins').where('userId', 'in', batch).where('approved', '==', true).orderBy('createdAt', 'desc').limit(limit);
    const unsub = q.onSnapshot((snapshot: any) => {
      const items: any[] = [];
      snapshot.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
      onUpdate(items);
    });
    unsubs.push(unsub);
  }

  return () => unsubs.forEach((u) => u());
}

function readLocalBlocked() {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem('spot_blocked_v1');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLocalBlocked(data: any) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem('spot_blocked_v1', JSON.stringify(data));
  } catch {}
}

function readLocalPushTokens() {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem('spot_push_tokens_v1');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLocalPushTokens(data: any) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem('spot_push_tokens_v1', JSON.stringify(data));
  } catch {}
}

export async function getUserFriends(userId: string) {
  const fb = ensureFirebase();
  if (!fb) {
    const map = readLocalFriends();
    return normalizeStringArray(map[userId]);
  }
  const db = fb.firestore();
  try {
    const doc = await db.collection('users').doc(userId).get();
    if (!doc.exists) return [];
    const data = doc.data() || {};
    return normalizeStringArray(data.friends);
  } catch (e) {
    return [];
  }
}

export async function getCloseFriends(userId: string) {
  const fb = ensureFirebase();
  if (!fb) return [];
  const db = fb.firestore();
  try {
    const doc = await db.collection('users').doc(userId).get();
    if (!doc.exists) return [];
    const data = doc.data() || {};
    return normalizeStringArray(data.closeFriends);
  } catch (e) {
    return [];
  }
}

export async function followUserRemote(currentUserId: string, targetUserId: string) {
  const fb = ensureFirebase();
  if (!fb) {
    const map = readLocalFriends();
    const current = new Set(map[currentUserId] || []);
    current.add(targetUserId);
    map[currentUserId] = Array.from(current);
    writeLocalFriends(map);
    return;
  }
  const db = fb.firestore();
  const ref = db.collection('users').doc(currentUserId);
  await ref.set({ friends: fb.firestore.FieldValue.arrayUnion(targetUserId) }, { merge: true });
}

export async function unfollowUserRemote(currentUserId: string, targetUserId: string) {
  const fb = ensureFirebase();
  if (!fb) {
    const map = readLocalFriends();
    map[currentUserId] = (map[currentUserId] || []).filter((id: string) => id !== targetUserId);
    writeLocalFriends(map);
    return;
  }
  const db = fb.firestore();
  const ref = db.collection('users').doc(currentUserId);
  await ref.set({ friends: fb.firestore.FieldValue.arrayRemove(targetUserId) }, { merge: true });
}

export async function setCloseFriendRemote(currentUserId: string, targetUserId: string, makeClose: boolean) {
  const fb = ensureFirebase();
  if (!fb) return;
  const db = fb.firestore();
  const ref = db.collection('users').doc(currentUserId);
  if (makeClose) {
    await ref.set({ closeFriends: fb.firestore.FieldValue.arrayUnion(targetUserId), friends: fb.firestore.FieldValue.arrayUnion(targetUserId) }, { merge: true });
  } else {
    await ref.set({ closeFriends: fb.firestore.FieldValue.arrayRemove(targetUserId) }, { merge: true });
  }
}

export async function createUserRemote({ userId, name, city, campus, campusOrCity, campusType, handle, email, photoUrl, phone }: any) {
  const fb = ensureFirebase();
  if (!fb) return;

  const sanitizeFields = (fields: Record<string, any>) =>
    Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));

  const db = fb.firestore();
  const normalizedPhone = normalizePhone(phone || '');
  const payload = sanitizeFields({
    name,
    city: city || null,
    campus: campus || null,
    campusOrCity: campusOrCity || city || null,
    campusType: campusType || null,
    handle: handle || null,
    email: email || null,
    phone: phone || null,
    phoneNormalized: normalizedPhone || null,
    photoUrl: photoUrl || null,
    createdAt: fb.firestore.FieldValue.serverTimestamp(),
  });
  await db.collection('users').doc(userId).set(payload);
}

export async function updateUserRemote(userId: string, fields: any) {
  const fb = ensureFirebase();
  if (!fb) return;
  const sanitizeFields = (input: Record<string, any>) =>
    Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
  const db = fb.firestore();
  const normalizedPhone = fields?.phone ? normalizePhone(fields.phone) : undefined;
  const payload = sanitizeFields({
    ...fields,
    phoneNormalized: normalizedPhone ?? fields?.phoneNormalized,
    updatedAt: fb.firestore.FieldValue.serverTimestamp(),
  });
  await db.collection('users').doc(userId).set(payload, { merge: true });
}

export async function findUserByEmail(email: string) {
  const fb = ensureFirebase();
  if (!fb) {
    const users = readLocalUsers();
    return users.find((u: any) => (u.email || '').toLowerCase() === email.toLowerCase()) || null;
  }
  const db = fb.firestore();
  const q = await db.collection('users').where('email', '==', email).limit(1).get();
  if (q.empty) return null;
  const doc = q.docs[0];
  return { id: doc.id, ...(doc.data() || {}) };
}

export async function findUserByPhone(phone: string) {
  const fb = ensureFirebase();
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  if (!fb) {
    const users = readLocalUsers();
    return users.find((u: any) => normalizePhone(u.phone || '') === normalized) || null;
  }
  const db = fb.firestore();
  const q = await db.collection('users').where('phoneNormalized', '==', normalized).limit(1).get();
  if (q.empty) return null;
  const doc = q.docs[0];
  return { id: doc.id, ...(doc.data() || {}) };
}

export async function findUserByHandle(handle: string) {
  const fb = ensureFirebase();
  if (!handle) return null;
  const normalized = handle.replace(/^@/, '').toLowerCase();
  if (!fb) {
    const users = readLocalUsers();
    return users.find((u: any) => (u.handle || '').toLowerCase() === normalized) || null;
  }
  const db = fb.firestore();
  const q = await db.collection('users').where('handle', '==', normalized).limit(1).get();
  if (q.empty) return null;
  const doc = q.docs[0];
  return { id: doc.id, ...(doc.data() || {}) };
}
export async function getUsersByIds(userIds: string[]) {
  const fb = ensureFirebase();
  if (!fb) {
    const users = readLocalUsers();
    const set = new Set(userIds || []);
    return users.filter((u: any) => set.has(u.id));
  }
  if (!userIds || userIds.length === 0) return [];
  const db = fb.firestore();
  const items: any[] = [];
  for (let i = 0; i < userIds.length; i += 10) {
    const batch = userIds.slice(i, i + 10);
    const snap = await db.collection('users').where(fb.firestore.FieldPath.documentId(), 'in', batch).get();
    snap.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
  }
  return items;
}

export async function getUsersByCampus(campusOrCity: string, limit = 10) {
  const fb = ensureFirebase();
  if (!campusOrCity) return [];
  if (!fb) {
    const users = readLocalUsers();
    return users.filter((u: any) => (u.campus || u.campusOrCity) === campusOrCity).slice(0, limit);
  }
  const db = fb.firestore();
  const [snapCampus, snapLegacy] = await Promise.all([
    db.collection('users').where('campus', '==', campusOrCity).limit(limit).get(),
    db.collection('users').where('campusOrCity', '==', campusOrCity).limit(limit).get(),
  ]);
  const items: any[] = [];
  snapCampus.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
  snapLegacy.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
  const seen = new Set<string>();
  return items.filter((u) => {
    if (!u?.id || seen.has(u.id)) return false;
    seen.add(u.id);
    return true;
  });
}

export async function sendFriendRequest(fromId: string, toId: string) {
  const fb = ensureFirebase();
  if (!fb) {
    if (!fromId || !toId || fromId === toId) return null;
    const requests = readLocalRequests();
    const requestId = `${fromId}_${toId}`;
    if (!requests.find((r: any) => r.id === requestId)) {
      requests.push({ id: requestId, fromId, toId, status: 'pending', createdAt: Date.now() });
      writeLocalRequests(requests);
    }
    return { id: requestId, fromId, toId, status: 'pending' };
  }
  if (!fromId || !toId || fromId === toId) return null;
  const db = fb.firestore();
  const requestId = `${fromId}_${toId}`;
  const ref = db.collection('friendRequests').doc(requestId);
  await ref.set(
    {
      fromId,
      toId,
      status: 'pending',
      createdAt: fb.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { id: requestId, fromId, toId, status: 'pending' };
}

export async function getIncomingFriendRequests(userId: string) {
  const fb = ensureFirebase();
  if (!fb) {
    const requests = readLocalRequests();
    return requests.filter((r: any) => r.toId === userId && r.status === 'pending');
  }
  const db = fb.firestore();
  const snap = await db.collection('friendRequests').where('toId', '==', userId).where('status', '==', 'pending').get();
  const items: any[] = [];
  snap.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
  return items;
}

export async function getOutgoingFriendRequests(userId: string) {
  const fb = ensureFirebase();
  if (!fb) {
    const requests = readLocalRequests();
    return requests.filter((r: any) => r.fromId === userId && r.status === 'pending');
  }
  const db = fb.firestore();
  const snap = await db.collection('friendRequests').where('fromId', '==', userId).where('status', '==', 'pending').get();
  const items: any[] = [];
  snap.forEach((doc: any) => items.push({ id: doc.id, ...(doc.data() || {}) }));
  return items;
}

export async function acceptFriendRequest(requestId: string, fromId: string, toId: string) {
  const fb = ensureFirebase();
  if (!fb) {
    const map = readLocalFriends();
    const current = new Set(map[toId] || []);
    current.add(fromId);
    map[toId] = Array.from(current);
    const other = new Set(map[fromId] || []);
    other.add(toId);
    map[fromId] = Array.from(other);
    writeLocalFriends(map);
    const requests = readLocalRequests().filter((r: any) => r.id !== requestId);
    writeLocalRequests(requests);
    return;
  }
  const db = fb.firestore();
  await db.collection('users').doc(toId).set({ friends: fb.firestore.FieldValue.arrayUnion(fromId) }, { merge: true });
  await db.collection('users').doc(fromId).set({ friends: fb.firestore.FieldValue.arrayUnion(toId) }, { merge: true });
  await db.collection('friendRequests').doc(requestId).delete();
}

export async function declineFriendRequest(requestId: string) {
  const fb = ensureFirebase();
  if (!fb) {
    const requests = readLocalRequests().filter((r: any) => r.id !== requestId);
    writeLocalRequests(requests);
    return;
  }
  const db = fb.firestore();
  await db.collection('friendRequests').doc(requestId).delete();
}

export async function reportUserRemote(reporterId: string | undefined, targetUserId: string, reason?: string) {
  const fb = ensureFirebase();
  if (!fb) {
    devLog('reportUserRemote (local):', { reporterId, targetUserId, reason });
    return;
  }
  const db = fb.firestore();
  await db.collection('userReports').add({
    reporterId: reporterId || null,
    targetUserId,
    reason: reason || null,
    createdAt: fb.firestore.FieldValue.serverTimestamp(),
  });
}

export async function blockUserRemote(currentUserId: string, targetUserId: string) {
  const fb = ensureFirebase();
  if (!fb) {
    const map = readLocalBlocked();
    const set = new Set(map[currentUserId] || []);
    set.add(targetUserId);
    map[currentUserId] = Array.from(set);
    writeLocalBlocked(map);
    return;
  }
  const db = fb.firestore();
  await db.collection('users').doc(currentUserId).set({ blocked: fb.firestore.FieldValue.arrayUnion(targetUserId) }, { merge: true });
}

export async function unblockUserRemote(currentUserId: string, targetUserId: string) {
  const fb = ensureFirebase();
  if (!fb) {
    const map = readLocalBlocked();
    map[currentUserId] = (map[currentUserId] || []).filter((id: string) => id !== targetUserId);
    writeLocalBlocked(map);
    return;
  }
  const db = fb.firestore();
  await db.collection('users').doc(currentUserId).set({ blocked: fb.firestore.FieldValue.arrayRemove(targetUserId) }, { merge: true });
}

export async function getBlockedUsers(currentUserId: string) {
  const fb = ensureFirebase();
  if (!fb) {
    const map = readLocalBlocked();
    return normalizeStringArray(map[currentUserId]);
  }
  const db = fb.firestore();
  const doc = await db.collection('users').doc(currentUserId).get();
  if (!doc.exists) return [];
  const data = doc.data() || {};
  return normalizeStringArray(data.blocked);
}

export async function savePushToken(userId: string, token: string) {
  const fb = ensureFirebase();
  if (!fb) {
    const map = readLocalPushTokens();
    map[userId] = token;
    writeLocalPushTokens(map);
    return;
  }
  const db = fb.firestore();
  await db.collection('users').doc(userId).set({ pushToken: token, updatedAt: fb.firestore.FieldValue.serverTimestamp() }, { merge: true });
}

export async function clearPushToken(userId: string) {
  const fb = ensureFirebase();
  if (!fb) {
    const map = readLocalPushTokens();
    delete map[userId];
    writeLocalPushTokens(map);
    return;
  }
  const db = fb.firestore();
  await db.collection('users').doc(userId).set({ pushToken: fb.firestore.FieldValue.delete() }, { merge: true });
}

// Auth helpers
export async function linkAnonymousWithEmail({ email, password }: { email: string; password: string }) {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Firebase not initialized.');

  const auth = fb.auth();
  const user = auth.currentUser;
  if (!user) throw new Error('No authenticated user to link.');

  const cred = fb.auth.EmailAuthProvider.credential(email, password);
  const res = await user.linkWithCredential(cred);
  return res.user;
}

export async function signInWithEmail({ email, password }: { email: string; password: string }) {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Firebase not initialized.');
  const auth = fb.auth();
  const res = await auth.signInWithEmailAndPassword(email, password);
  return res.user;
}

export async function createAccountWithEmail({ email, password, name, city, campus, campusOrCity, handle, campusType, phone }: any) {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Firebase not initialized.');
  const auth = fb.auth();
  const res = await auth.createUserWithEmailAndPassword(email, password);
  const uid = res.user.uid;
  // send verification email (non-blocking)
  try {
    if (typeof res.user.sendEmailVerification === 'function') {
      const actionUrl =
        (process.env.FIREBASE_ACTION_URL as string) ||
        ((global as any)?.FIREBASE_ACTION_URL as string) ||
        undefined;
      const actionCodeSettings = actionUrl ? { url: actionUrl, handleCodeInApp: true } : undefined;
      // @ts-ignore
      void res.user.sendEmailVerification(actionCodeSettings);
    }
  } catch (e) {
    // ignore
  }
  // create profile doc in background for faster UX
  void createUserRemote({ userId: uid, name, city, campus, campusOrCity, campusType, handle, email, phone, photoUrl: res.user.photoURL || null });
  return res.user;
}

export function getWebRecaptchaVerifier(containerId: string, size: 'invisible' | 'normal' = 'invisible') {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Firebase not initialized.');
  if (typeof window === 'undefined' || typeof document === 'undefined') throw new Error('Recaptcha requires web');
  let el = document.getElementById(containerId);
  if (!el) {
    el = document.createElement('div');
    el.id = containerId;
    el.style.display = 'none';
    document.body.appendChild(el);
  }
  const verifier = new fb.auth.RecaptchaVerifier(containerId, { size });
  try {
    if (typeof verifier.render === 'function') verifier.render();
  } catch {}
  return verifier;
}

export async function startPhoneAuth(phone: string, verifier: any) {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Firebase not initialized.');
  const normalized = normalizePhone(phone);
  if (!normalized) throw new Error('Invalid phone number');
  const res = await fb.auth().signInWithPhoneNumber(normalized, verifier);
  return { verificationId: res.verificationId };
}

export async function confirmPhoneAuth(verificationId: string, code: string) {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Firebase not initialized.');
  const credential = fb.auth.PhoneAuthProvider.credential(verificationId, code);
  const res = await fb.auth().signInWithCredential(credential);
  return res.user;
}

export async function sendVerificationEmail(actionUrl?: string) {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Firebase not initialized.');
  const auth = fb.auth();
  const user = auth.currentUser;
  if (!user) throw new Error('No authenticated user to send verification to');
  try {
    const fallbackUrl =
      actionUrl ||
      (process.env.FIREBASE_ACTION_URL as string) ||
      ((global as any)?.FIREBASE_ACTION_URL as string) ||
      undefined;
    const actionCodeSettings = fallbackUrl ? { url: fallbackUrl, handleCodeInApp: true } : undefined;
    // @ts-ignore
    if (typeof user.sendEmailVerification === 'function') await user.sendEmailVerification(actionCodeSettings);
  } catch (e) {
    throw e;
  }
}

export async function sendPasswordResetEmail(email: string) {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Firebase not initialized.');
  const auth = fb.auth();
  await auth.sendPasswordResetEmail(email);
}

export async function updateCurrentUserPassword(newPassword: string) {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Firebase not initialized.');
  const user = fb.auth().currentUser;
  if (!user) throw new Error('No authenticated user');
  await user.updatePassword(newPassword);
}

export async function deleteCurrentUser() {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Firebase not initialized.');
  const user = fb.auth().currentUser;
  if (!user) throw new Error('No authenticated user');
  await user.delete();
}

export async function reauthenticateCurrentUser({ email, password }: { email: string; password: string }) {
  const fb = ensureFirebase();
  if (!fb) throw new Error('Firebase not initialized.');
  const user = fb.auth().currentUser;
  if (!user) throw new Error('No authenticated user');
  const cred = fb.auth.EmailAuthProvider.credential(email, password);
  // modern API name may be reauthenticateWithCredential
  if (typeof user.reauthenticateWithCredential === 'function') {
    await user.reauthenticateWithCredential(cred);
  } else if (typeof user.reauthenticate === 'function') {
    await user.reauthenticate(cred);
  } else {
    throw new Error('Reauthentication not supported in this Firebase SDK');
  }
}
