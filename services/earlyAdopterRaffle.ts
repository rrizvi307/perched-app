import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCheckins } from '@/storage/local';
import { ensureFirebase, getCheckinsForUserRemote } from './firebaseClient';

const DAY_MS = 24 * 60 * 60 * 1000;
const RAFFLE_ENTRY_KEY_PREFIX = '@perched_weekly_raffle_entry';
export const EARLY_ADOPTER_WEEKLY_TARGET = 3;

export type WeeklyRaffleProgress = {
  weekKey: string;
  weekStartMs: number;
  weekEndMs: number;
  postsThisWeek: number;
  target: number;
  remaining: number;
  qualified: boolean;
  entered: boolean;
  enteredNow: boolean;
  entryId: string;
};

function toMillis(value: any): number {
  if (!value) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value?.toMillis === 'function') {
    try {
      return value.toMillis();
    } catch {}
  }
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function getWeekWindow(now = Date.now()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const dayOffsetFromMonday = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - dayOffsetFromMonday);
  const weekStartMs = start.getTime();
  const weekEndMs = weekStartMs + 7 * DAY_MS - 1;
  const weekKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
  return { weekKey, weekStartMs, weekEndMs };
}

function getEntryId(userId: string, weekKey: string) {
  return `${userId}_${weekKey}`;
}

function getEntryStorageKey(userId: string, weekKey: string) {
  return `${RAFFLE_ENTRY_KEY_PREFIX}:${userId}:${weekKey}`;
}

function checkinKey(item: any) {
  if (item?.id) return `id:${item.id}`;
  if (item?.clientId) return `client:${item.clientId}`;
  return `sig:${item?.userId || 'anon'}:${item?.spotPlaceId || item?.spotName || item?.spot || 'spot'}:${toMillis(item?.createdAt || item?.timestamp)}`;
}

async function countWeeklyPosts(userId: string, weekStartMs: number, weekEndMs: number) {
  const local = await getCheckins().catch(() => []);
  const seen = new Set<string>();
  let count = 0;
  (local || []).forEach((item: any) => {
    if (item?.userId !== userId) return;
    const ts = toMillis(item?.createdAt || item?.timestamp);
    if (!ts || ts < weekStartMs || ts > weekEndMs) return;
    const key = checkinKey(item);
    if (seen.has(key)) return;
    seen.add(key);
    count += 1;
  });

  try {
    let cursor: any = undefined;
    let page = 0;
    while (page < 5) {
      const response = await getCheckinsForUserRemote(userId, 80, cursor);
      const batch = Array.isArray(response) ? response : (response?.items || []);
      if (!batch.length) break;
      for (const item of batch) {
        const ts = toMillis(item?.createdAt || item?.timestamp);
        if (!ts || ts < weekStartMs || ts > weekEndMs) continue;
        const key = checkinKey(item);
        if (seen.has(key)) continue;
        seen.add(key);
        count += 1;
      }
      const oldestTs = toMillis(batch[batch.length - 1]?.createdAt || batch[batch.length - 1]?.timestamp);
      if (batch.length < 80 || (oldestTs && oldestTs < weekStartMs)) break;
      cursor = response?.lastCursor;
      page += 1;
    }
  } catch {}

  return count;
}

async function isEnteredLocal(userId: string, weekKey: string) {
  try {
    const raw = await AsyncStorage.getItem(getEntryStorageKey(userId, weekKey));
    return raw === '1';
  } catch {
    return false;
  }
}

async function markEnteredLocal(userId: string, weekKey: string) {
  try {
    await AsyncStorage.setItem(getEntryStorageKey(userId, weekKey), '1');
  } catch {}
}

async function isEnteredRemote(entryId: string) {
  try {
    const fb = ensureFirebase();
    if (!fb) return false;
    const doc = await fb.firestore().collection('weeklyRaffleEntries').doc(entryId).get();
    return doc.exists;
  } catch {
    return false;
  }
}

async function resolveWeeklyProgress(userId: string, attemptEntry: boolean): Promise<WeeklyRaffleProgress> {
  const { weekKey, weekStartMs, weekEndMs } = getWeekWindow();
  const postsThisWeek = await countWeeklyPosts(userId, weekStartMs, weekEndMs);
  const target = EARLY_ADOPTER_WEEKLY_TARGET;
  const remaining = Math.max(0, target - postsThisWeek);
  const qualified = postsThisWeek >= target;
  const entryId = getEntryId(userId, weekKey);

  let entered = await isEnteredLocal(userId, weekKey);
  if (!entered) {
    entered = await isEnteredRemote(entryId);
    if (entered) {
      await markEnteredLocal(userId, weekKey);
    }
  }

  let enteredNow = false;
  if (attemptEntry && qualified && entered) {
    enteredNow = !(await isEnteredLocal(userId, weekKey));
    if (enteredNow) {
      await markEnteredLocal(userId, weekKey);
    }
  }

  return {
    weekKey,
    weekStartMs,
    weekEndMs,
    postsThisWeek,
    target,
    remaining,
    qualified,
    entered,
    enteredNow,
    entryId,
  };
}

export async function getWeeklyRaffleProgress(userId: string): Promise<WeeklyRaffleProgress | null> {
  if (!userId) return null;
  return resolveWeeklyProgress(userId, false);
}

export async function trackWeeklyRaffleProgress(userId: string): Promise<WeeklyRaffleProgress | null> {
  if (!userId) return null;
  return resolveWeeklyProgress(userId, true);
}
