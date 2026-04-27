import {
  STORAGE_KEYS,
  getAsyncStorage,
  isWeb,
  removeStoredItem,
} from './keyValueStore';

let pendingMemory: any[] = [];
let pendingMemoryPreferred = false;
let pendingProfileMemory: any[] = [];

export async function getPendingCheckins() {
  if (isWeb()) {
    if (pendingMemoryPreferred && pendingMemory.length) return pendingMemory;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.pendingCheckins);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return pendingMemory;
    }
  }
  const store = await getAsyncStorage();
  if (store) {
    try {
      const raw = await store.getItem(STORAGE_KEYS.pendingCheckins);
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
      window.localStorage.setItem(STORAGE_KEYS.pendingCheckins, JSON.stringify(list));
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
      await store.setItem(STORAGE_KEYS.pendingCheckins, JSON.stringify(list));
      pendingMemory = list;
      return;
    } catch {}
  }
  pendingMemory = list;
}

export async function pruneInvalidPendingCheckins() {
  const list = await getPendingCheckins();
  const now = Date.now();
  const maxAgeMs = 24 * 60 * 60 * 1000;
  const next = (list || []).filter((it: any) => {
    if (typeof it?.clientId !== 'string' || it.clientId.trim().length === 0) return false;
    if (typeof it?.userId !== 'string' || it.userId.trim().length === 0) return false;
    const queuedAt = typeof it?.queuedAt === 'number' ? it.queuedAt : 0;
    if (!queuedAt) return false;
    if (now - queuedAt > maxAgeMs) return false;
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
      const raw = window.localStorage.getItem(STORAGE_KEYS.pendingProfile);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return pendingProfileMemory;
    }
  }
  const store = await getAsyncStorage();
  if (store) {
    try {
      const raw = await store.getItem(STORAGE_KEYS.pendingProfile);
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
      window.localStorage.setItem(STORAGE_KEYS.pendingProfile, JSON.stringify(next));
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
      await store.setItem(STORAGE_KEYS.pendingProfile, JSON.stringify(next));
      pendingProfileMemory = next;
      return;
    } catch {}
  }
  pendingProfileMemory = next;
}

export async function removePendingProfileUpdate(userId: string) {
  if (!userId) return;
  const list = await getPendingProfileUpdates();
  const next = list.filter((item: any) => item?.userId !== userId);
  if (isWeb()) {
    try {
      window.localStorage.setItem(STORAGE_KEYS.pendingProfile, JSON.stringify(next));
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
      await store.setItem(STORAGE_KEYS.pendingProfile, JSON.stringify(next));
      pendingProfileMemory = next;
      return;
    } catch {}
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
      window.localStorage.setItem(STORAGE_KEYS.pendingCheckins, JSON.stringify(next));
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
      await store.setItem(STORAGE_KEYS.pendingCheckins, JSON.stringify(next));
      pendingMemory = next;
      return;
    } catch {}
  }
  pendingMemory = next;
}

export async function updatePendingCheckin(clientId: string, updates: Record<string, any>) {
  if (!clientId) return;
  const list = await getPendingCheckins();
  const next = list.map((item: any) => (
    item?.clientId === clientId ? { ...item, ...(updates || {}) } : item
  ));
  if (isWeb()) {
    try {
      window.localStorage.setItem(STORAGE_KEYS.pendingCheckins, JSON.stringify(next));
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
      await store.setItem(STORAGE_KEYS.pendingCheckins, JSON.stringify(next));
      pendingMemory = next;
      return;
    } catch {}
  }
  pendingMemory = next;
}

export async function removePendingCheckin(clientId: string) {
  if (!clientId) return;
  const list = await getPendingCheckins();
  const next = list.filter((item: any) => item?.clientId !== clientId);
  if (isWeb()) {
    try {
      window.localStorage.setItem(STORAGE_KEYS.pendingCheckins, JSON.stringify(next));
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
      await store.setItem(STORAGE_KEYS.pendingCheckins, JSON.stringify(next));
      pendingMemory = next;
      return;
    } catch {}
  }
  pendingMemory = next;
}

export async function getLastCheckinAt() {
  if (isWeb()) {
    const raw = window.localStorage.getItem(STORAGE_KEYS.checkinCooldown);
    return raw ? Number(raw) : 0;
  }
  const store = await getAsyncStorage();
  if (store) {
    try {
      const raw = await store.getItem(STORAGE_KEYS.checkinCooldown);
      return raw ? Number(raw) : 0;
    } catch {
      return (global as any)._spot_last_checkin || 0;
    }
  }
  return (global as any)._spot_last_checkin || 0;
}

export async function setLastCheckinAt(ts: number) {
  if (isWeb()) {
    window.localStorage.setItem(STORAGE_KEYS.checkinCooldown, String(ts));
    return;
  }
  const store = await getAsyncStorage();
  if (store) {
    try {
      await store.setItem(STORAGE_KEYS.checkinCooldown, String(ts));
    } catch {}
  }
  (global as any)._spot_last_checkin = ts;
}

export async function saveCheckinDraft(draft: any) {
  if (!draft) return;
  const payload = { ...draft, savedAt: Date.now() };
  if (isWeb()) {
    try {
      window.localStorage.setItem(STORAGE_KEYS.checkinDraft, JSON.stringify(payload));
    } catch {}
    return;
  }
  const store = await getAsyncStorage();
  if (store) {
    try {
      await store.setItem(STORAGE_KEYS.checkinDraft, JSON.stringify(payload));
    } catch {}
  }
}

export async function getCheckinDraft() {
  if (isWeb()) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.checkinDraft);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  const store = await getAsyncStorage();
  if (store) {
    try {
      const raw = await store.getItem(STORAGE_KEYS.checkinDraft);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  return null;
}

export async function clearCheckinDraft() {
  await removeStoredItem(STORAGE_KEYS.checkinDraft);
}

export function resetCheckinQueueStoreMemory() {
  pendingMemory = [];
  pendingMemoryPreferred = false;
  pendingProfileMemory = [];
  try {
    delete (global as any)._spot_last_checkin;
  } catch {}
}
