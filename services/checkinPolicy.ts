import { isCloudDemoCheckin, isDemoUserId } from '@/services/demoMode';
import { resolvePhotoUri } from '@/services/photoSources';
import { ensureFirebase } from '@/services/firebaseClient';

type CheckinLike = Record<string, any>;

function isSeededId(id: string) {
  return (
    id.startsWith('demo-c') ||
    id.startsWith('demo-self-') ||
    id.startsWith('demo-checkin-') ||
    id.startsWith('demo-cloud-') ||
    id.startsWith('beta-public-')
  );
}

export function isSeededCheckin(item: CheckinLike): boolean {
  if (!item || typeof item !== 'object') return false;
  if (item.__betaSeed === true || item.__demo === true || item.__demoCloudSeed === true) return true;
  const id = typeof item.id === 'string' ? item.id : '';
  if (id && isSeededId(id)) return true;
  const userId = typeof item.userId === 'string' ? item.userId : '';
  if (userId && isDemoUserId(userId)) return true;
  if (isCloudDemoCheckin(item)) return true;
  return false;
}

export function applySeededFallback(items: CheckinLike[], minRealCount = 3): CheckinLike[] {
  const list = Array.isArray(items) ? items : [];
  const real = list.filter((item) => !isSeededCheckin(item));
  if (real.length >= minRealCount) return real;
  const seeded = list.filter((item) => isSeededCheckin(item));
  return [...real, ...seeded];
}

async function resolveGsUrl(gsUrl: string): Promise<string | null> {
  try {
    const fb = ensureFirebase();
    if (!fb) return null;
    const ref = fb.storage().refFromURL(gsUrl);
    const url = await ref.getDownloadURL();
    return typeof url === 'string' && url.length ? url : null;
  } catch {
    return null;
  }
}

export async function normalizeCheckinPhoto(item: CheckinLike): Promise<CheckinLike> {
  const next = { ...item };
  const resolved = resolvePhotoUri(next);
  if (!next.photoUrl && resolved) {
    next.photoUrl = resolved;
  }
  if (typeof next.photoUrl === 'string') {
    const trimmed = next.photoUrl.trim();
    if (trimmed.startsWith('gs://')) {
      const resolvedUrl = await resolveGsUrl(trimmed);
      if (resolvedUrl) next.photoUrl = resolvedUrl;
    } else if (trimmed.startsWith('http://')) {
      next.photoUrl = `https://${trimmed.slice('http://'.length)}`;
    }
  }
  if (next.photoUrl && !next.image) {
    next.image = next.photoUrl;
  }
  return next;
}

export async function normalizeCheckins(items: CheckinLike[]): Promise<CheckinLike[]> {
  const list = Array.isArray(items) ? items : [];
  return Promise.all(list.map((item) => normalizeCheckinPhoto(item)));
}
