import { toMillis } from '@/services/checkinUtils';
import { ensureFirebase, getCheckinsForSpotRemote } from '@/services/firebaseClient';
import { normalizeSpotName } from '@/services/spotUtils';

export type SpotLocation = { lat: number; lng: number };

export type SpotIdentityInput = {
  placeId?: string | null;
  name?: string | null;
  location?: SpotLocation | null;
};

export type SpotTimelineRequest = SpotIdentityInput & {
  limit?: number;
  seedCheckins?: any[];
  aliasNames?: string[];
};

export type SpotTimelineResult = {
  items: any[];
  source: 'place_id' | 'alias' | 'seed' | 'none';
};

function toFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function readSpotLocation(input: any): SpotLocation | null {
  const direct = input?.location;
  const example = input?.example?.spotLatLng || input?.example?.location;
  const fallback = input?.spotLatLng;
  const candidate = direct || example || fallback || null;
  const lat = toFiniteNumber(candidate?.lat);
  const lng = toFiniteNumber(candidate?.lng);
  if (lat === null || lng === null) return null;
  return { lat, lng };
}

export function readSpotName(input: any): string {
  const raw = input?.name || input?.spotName || input?.spot || input?.example?.spotName || '';
  return typeof raw === 'string' ? raw.trim() : '';
}

export function readSpotPlaceId(input: any): string {
  const raw =
    input?.placeId ||
    input?.spotPlaceId ||
    input?.example?.spotPlaceId ||
    input?.example?.placeId ||
    input?.googlePlaceId ||
    '';
  return typeof raw === 'string' ? raw.trim() : '';
}

function toLocationBucket(location?: SpotLocation | null) {
  if (!location) return '';
  return `${location.lat.toFixed(3)}:${location.lng.toFixed(3)}`;
}

export function buildSpotAliasKey(name?: string | null, location?: SpotLocation | null) {
  const normalized = normalizeSpotName(name || '');
  if (!normalized) return '';
  const bucket = toLocationBucket(location);
  return bucket ? `alias:${normalized}@${bucket}` : `alias:${normalized}`;
}

export function getCanonicalSpotKey(input: any) {
  const placeId = readSpotPlaceId(input);
  if (placeId) return `place:${placeId}`;
  const aliasKey = buildSpotAliasKey(readSpotName(input), readSpotLocation(input));
  if (aliasKey) return aliasKey;
  return `name:${normalizeSpotName(readSpotName(input) || 'unknown') || 'unknown'}`;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceKm(a?: SpotLocation | null, b?: SpotLocation | null) {
  if (!a || !b) return Infinity;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const hav =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 6371 * 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav));
}

export function isSameSpotAlias(
  candidate: SpotIdentityInput,
  target: SpotIdentityInput,
  maxDistanceKm = 0.75,
) {
  const candidateName = normalizeSpotName(candidate?.name || '');
  const targetName = normalizeSpotName(target?.name || '');
  if (!candidateName || !targetName || candidateName !== targetName) return false;
  const candidateLocation = candidate?.location || null;
  const targetLocation = target?.location || null;
  if (!candidateLocation || !targetLocation) return true;
  return distanceKm(candidateLocation, targetLocation) <= maxDistanceKm;
}

export function matchesSpotIdentity(checkin: any, target: SpotIdentityInput) {
  const targetPlaceId = typeof target.placeId === 'string' ? target.placeId.trim() : '';
  const checkinPlaceId = readSpotPlaceId(checkin);
  if (targetPlaceId && checkinPlaceId) {
    return targetPlaceId === checkinPlaceId;
  }
  return isSameSpotAlias(
    {
      placeId: checkinPlaceId || null,
      name: readSpotName(checkin),
      location: readSpotLocation(checkin),
    },
    target,
  );
}

function newerCheckin(a: any, b: any) {
  return (toMillis(b?.createdAt || b?.timestamp) || 0) - (toMillis(a?.createdAt || a?.timestamp) || 0);
}

function mergeCheckinArrays(existing: any[], incoming: any[]) {
  const merged = new Map<string, any>();
  const keyFor = (item: any) =>
    item?.id ||
    item?.clientId ||
    `${item?.userId || 'anon'}:${readSpotPlaceId(item) || readSpotName(item) || 'spot'}:${toMillis(item?.createdAt || item?.timestamp) || 0}`;

  [...existing, ...incoming].forEach((item) => {
    const key = keyFor(item);
    const current = merged.get(key);
    if (!current || newerCheckin(item, current) < 0) {
      merged.set(key, item);
    }
  });

  return Array.from(merged.values()).sort(newerCheckin);
}

function findExistingSpotKey(grouped: Map<string, any>, candidate: SpotIdentityInput) {
  const directKey = getCanonicalSpotKey(candidate);
  if (grouped.has(directKey)) return directKey;

  for (const [key, existing] of grouped.entries()) {
    if (isSameSpotAlias(existing, candidate)) {
      return key;
    }
  }

  return directKey;
}

export function groupSpotCheckins(items: any[]) {
  const grouped = new Map<string, any>();

  items.forEach((item) => {
    const candidate = {
      placeId: readSpotPlaceId(item),
      name: readSpotName(item),
      location: readSpotLocation(item),
    };
    const key = findExistingSpotKey(grouped, candidate);
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        key,
        placeId: candidate.placeId || '',
        name: candidate.name || 'Unknown',
        location: candidate.location,
        count: 1,
        example: item,
        _checkins: [item],
      });
      return;
    }

    const nextCheckins = mergeCheckinArrays(existing._checkins || [], [item]);
    const nextExample = nextCheckins[0] || existing.example || item;
    grouped.set(key, {
      ...existing,
      placeId: existing.placeId || candidate.placeId || '',
      name: existing.name || candidate.name || 'Unknown',
      location: existing.location || candidate.location || null,
      count: nextCheckins.length,
      example: nextExample,
      _checkins: nextCheckins,
    });
  });

  return Array.from(grouped.values()).map((spot) => ({
    ...spot,
    count: Array.isArray(spot._checkins) ? spot._checkins.length : spot.count || 0,
    example: Array.isArray(spot._checkins) && spot._checkins.length ? spot._checkins[0] : spot.example,
  }));
}

export function mergeSpotSummaries(primary: any[], secondary: any[]) {
  const merged = new Map<string, any>();

  const upsert = (incoming: any) => {
    const incomingKey = findExistingSpotKey(merged, {
      placeId: readSpotPlaceId(incoming),
      name: readSpotName(incoming),
      location: readSpotLocation(incoming),
    });
    const existing = merged.get(incomingKey);

    if (!existing) {
      merged.set(incomingKey, {
        ...incoming,
        key: incomingKey,
      });
      return;
    }

    const existingCheckins = Array.isArray(existing?._checkins) ? existing._checkins : [];
    const incomingCheckins = Array.isArray(incoming?._checkins) ? incoming._checkins : [];
    const nextCheckins = mergeCheckinArrays(existingCheckins, incomingCheckins);
    const nextExample =
      nextCheckins[0] ||
      existing.example ||
      incoming.example ||
      existing;

    merged.set(incomingKey, {
      ...incoming,
      ...existing,
      ...incoming,
      key: incomingKey,
      placeId: readSpotPlaceId(existing) || readSpotPlaceId(incoming),
      name: readSpotName(existing) || readSpotName(incoming) || 'Unknown',
      location: readSpotLocation(existing) || readSpotLocation(incoming),
      example: nextExample,
      _checkins: nextCheckins,
      count: Math.max(
        nextCheckins.length,
        existing?.count || 0,
        incoming?.count || 0,
      ),
      latestCheckinAt: Math.max(
        toMillis(existing?.latestCheckinAt) || 0,
        toMillis(incoming?.latestCheckinAt) || 0,
        toMillis(nextCheckins[0]?.createdAt || nextCheckins[0]?.timestamp) || 0,
      ) || null,
    });
  };

  primary.forEach(upsert);
  secondary.forEach(upsert);

  return Array.from(merged.values());
}

function uniqueNames(names: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return names
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => {
      if (!value) return false;
      const normalized = normalizeSpotName(value);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

async function queryCheckinsByExactField(
  db: any,
  field: 'spotName' | 'spot',
  value: string,
  limit: number,
) {
  let publicSnapshot: any;
  try {
    publicSnapshot = await db
      .collection('checkins')
      .where(field, '==', value)
      .where('visibility', '==', 'public')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
  } catch {
    try {
      publicSnapshot = await db
        .collection('checkins')
        .where(field, '==', value)
        .where('visibility', '==', 'public')
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();
    } catch {
      publicSnapshot = await db
        .collection('checkins')
        .where(field, '==', value)
        .where('visibility', '==', 'public')
        .limit(limit)
        .get();
    }
  }

  return publicSnapshot.docs.map((doc: any) => ({ id: doc.id, ...(doc.data() || {}) }));
}

async function queryOwnCheckinsByExactField(
  db: any,
  field: 'spotName' | 'spot',
  value: string,
  userId: string,
  limit: number,
) {
  try {
    const snapshot = await db
      .collection('checkins')
      .where(field, '==', value)
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc: any) => ({ id: doc.id, ...(doc.data() || {}) }));
  } catch {
    try {
      const snapshot = await db
        .collection('checkins')
        .where(field, '==', value)
        .where('userId', '==', userId)
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get();
      return snapshot.docs.map((doc: any) => ({ id: doc.id, ...(doc.data() || {}) }));
    } catch {
      return [];
    }
  }
}

export async function loadSpotTimeline({
  placeId,
  name,
  location,
  limit = 240,
  seedCheckins = [],
  aliasNames = [],
}: SpotTimelineRequest): Promise<SpotTimelineResult> {
  const target: SpotIdentityInput = {
    placeId: placeId || '',
    name: name || '',
    location: location || null,
  };
  let mergedItems = mergeCheckinArrays([], seedCheckins);
  let source: SpotTimelineResult['source'] = mergedItems.length ? 'seed' : 'none';

  if (placeId) {
    try {
      const remote = await getCheckinsForSpotRemote(placeId, limit);
      if (Array.isArray(remote?.items) && remote.items.length) {
        mergedItems = mergeCheckinArrays(mergedItems, remote.items);
        source = 'place_id';
      }
    } catch {}
  }

  const namesToQuery = uniqueNames([name, ...aliasNames]);
  if (namesToQuery.length) {
    try {
      const fb = ensureFirebase();
      const db = fb?.firestore?.();
      const currentUserId = fb?.auth?.()?.currentUser?.uid || '';
      if (db) {
        const exactMatches = await Promise.all(
          namesToQuery.flatMap((value) => [
            queryCheckinsByExactField(db, 'spotName', value, limit),
            queryCheckinsByExactField(db, 'spot', value, limit),
            currentUserId ? queryOwnCheckinsByExactField(db, 'spotName', value, currentUserId, limit) : Promise.resolve([]),
            currentUserId ? queryOwnCheckinsByExactField(db, 'spot', value, currentUserId, limit) : Promise.resolve([]),
          ]),
        );
        const flatMatches = exactMatches.flat();
        if (flatMatches.length) {
          mergedItems = mergeCheckinArrays(mergedItems, flatMatches);
          if (source === 'none' || source === 'seed') source = 'alias';
        }
      }
    } catch {}
  }

  const filtered = mergedItems
    .filter((item) => matchesSpotIdentity(item, target))
    .sort(newerCheckin)
    .slice(0, limit);

  return {
    items: filtered,
    source: filtered.length ? source : 'none',
  };
}

export function filterVisibleSpotCheckins(checkins: any[], viewerId?: string | null, friendIdSet?: Set<string>) {
  return checkins.filter((item) => {
    const visibility = item?.visibility;
    if (!visibility || visibility === 'public') return true;
    if (!viewerId) return false;
    if (item?.userId === viewerId) return true;
    if (visibility === 'friends' || visibility === 'close') {
      return !!friendIdSet?.has(item?.userId);
    }
    return true;
  });
}

