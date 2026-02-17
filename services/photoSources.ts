const PHOTO_URL_FIELDS = ['photoUrl', 'photoURL', 'imageUrl', 'imageURL', 'image'] as const;

function isLikelyPath(value: string) {
  return value.startsWith('/') || value.startsWith('./') || value.startsWith('../');
}

export function isPhotoUriRenderable(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const candidate = value.trim();
  if (!candidate) return false;
  if (candidate === 'null' || candidate === 'undefined' || candidate === '[object Object]') return false;
  if (candidate.startsWith('https://')) return true;
  if (candidate.startsWith('http://')) return false; // iOS ATS blocks many insecure URLs.
  if (candidate.startsWith('file://')) return true;
  if (candidate.startsWith('blob:')) return true;
  if (candidate.startsWith('data:')) return true;
  if (candidate.startsWith('content://')) return true;
  if (candidate.startsWith('ph://')) return true;
  if (candidate.startsWith('assets-library://')) return true;
  if (isLikelyPath(candidate)) return true;
  return false;
}

function readField(source: any, field: string): string | null {
  const value = source?.[field];
  return typeof value === 'string' ? value.trim() : null;
}

export function listPhotoCandidates(source: any): string[] {
  const candidates = PHOTO_URL_FIELDS
    .map((field) => readField(source, field))
    .filter((value): value is string => typeof value === 'string' && value.length > 0);
  return Array.from(new Set(candidates));
}

export function resolvePhotoUri(source: any): string | null {
  const candidates = listPhotoCandidates(source);
  for (const candidate of candidates) {
    if (isPhotoUriRenderable(candidate)) return candidate;
  }
  return null;
}

export function findInvalidPhotoSeeds(items: any[]): Array<{ id: string; uri: string }> {
  const invalid: Array<{ id: string; uri: string }> = [];
  items.forEach((item: any, index) => {
    const id = String(item?.id || item?.spotName || item?.name || `seed-${index}`);
    const candidate = resolvePhotoUri(item);
    if (!candidate) {
      const raw = listPhotoCandidates(item)[0];
      if (raw) invalid.push({ id, uri: raw });
      return;
    }
    if (!candidate.startsWith('https://') && !candidate.startsWith('file://') && !candidate.startsWith('blob:') && !candidate.startsWith('data:') && !candidate.startsWith('content://') && !candidate.startsWith('ph://') && !candidate.startsWith('assets-library://') && !isLikelyPath(candidate)) {
      invalid.push({ id, uri: candidate });
    }
  });
  return invalid;
}
