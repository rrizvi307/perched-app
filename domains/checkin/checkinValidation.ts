const MIN_GAP_PUBLIC_MS = 10 * 60 * 1000;
const MIN_GAP_OTHER_MS = 5 * 60 * 1000;

type CheckinLocation = {
  lat: number;
  lng: number;
} | null | undefined;

export type CheckinValidationInput = {
  hasImage: boolean;
  userId?: string | null;
  userEmail?: string | null;
  userEmailVerified?: boolean | null;
  spot?: string | null;
  placeId?: string | null;
  location?: CheckinLocation;
  caption?: string | null;
  selectedTags?: string[] | null;
  visibility?: 'public' | 'friends' | 'close' | string | null;
  lastCheckinAt?: number | null;
  now?: number;
  noiseLevel?: unknown;
  busyness?: unknown;
  overallVibe?: unknown;
  wifiSpeed?: unknown;
  outletAvailability?: unknown;
};

export type CheckinValidationResult =
  | {
      ok: true;
      metricsProvided: number;
    }
  | {
      ok: false;
      reason:
        | 'missing_image'
        | 'missing_user'
        | 'email_unverified'
        | 'missing_spot'
        | 'missing_context'
        | 'rate_limited';
      message: string;
      retryInMinutes?: number;
    };

export function getMinimumCheckinGapMs(visibility: CheckinValidationInput['visibility']) {
  return visibility === 'public' ? MIN_GAP_PUBLIC_MS : MIN_GAP_OTHER_MS;
}

export function countProvidedSpotIntel(input: Pick<
  CheckinValidationInput,
  | 'noiseLevel'
  | 'busyness'
  | 'overallVibe'
  | 'wifiSpeed'
  | 'outletAvailability'
>) {
  return [
    input.noiseLevel,
    input.busyness,
    input.overallVibe,
    input.wifiSpeed,
    input.outletAvailability,
  ].filter((value) => value !== null && value !== undefined).length;
}

export function validateCheckinSubmission(input: CheckinValidationInput): CheckinValidationResult {
  if (!input.hasImage) {
    return { ok: false, reason: 'missing_image', message: 'Add a photo to post.' };
  }

  if (!input.userId) {
    return { ok: false, reason: 'missing_user', message: 'Please sign in to post a check-in.' };
  }

  if (input.userEmail && !input.userEmailVerified) {
    return { ok: false, reason: 'email_unverified', message: 'Verify your email before posting.' };
  }

  const spot = typeof input.spot === 'string' ? input.spot.trim() : '';
  const placeId = typeof input.placeId === 'string' ? input.placeId.trim() : '';
  const location = input.location;
  const hasLocation = typeof location?.lat === 'number' && typeof location?.lng === 'number';
  if (!spot || !placeId || !hasLocation) {
    return { ok: false, reason: 'missing_spot', message: 'Please select a spot from lookup.' };
  }

  const trimmedCaption = typeof input.caption === 'string' ? input.caption.trim() : '';
  const selectedTags = Array.isArray(input.selectedTags) ? input.selectedTags.filter(Boolean) : [];
  if (trimmedCaption.length < 3 && selectedTags.length === 0) {
    return { ok: false, reason: 'missing_context', message: 'Add a short caption or select a tag.' };
  }

  const now = typeof input.now === 'number' ? input.now : Date.now();
  const lastCheckinAt = typeof input.lastCheckinAt === 'number' ? input.lastCheckinAt : 0;
  const minimumGapMs = getMinimumCheckinGapMs(input.visibility);
  if (lastCheckinAt && now - lastCheckinAt < minimumGapMs) {
    const retryInMinutes = Math.ceil((minimumGapMs - (now - lastCheckinAt)) / 60000);
    return {
      ok: false,
      reason: 'rate_limited',
      message: `You can post again in about ${retryInMinutes} minute${retryInMinutes === 1 ? '' : 's'}.`,
      retryInMinutes,
    };
  }

  return {
    ok: true,
    metricsProvided: countProvidedSpotIntel(input),
  };
}
