import { sanitizeDiscoveryIntents, type DiscoveryIntent } from '@/services/discoveryIntents';
import { resolvePhotoUri } from '@/services/photoSources';
import {
  toNumericNoiseLevel,
  toNumericOutletAvailability,
  type NumericCheckinScale,
} from '@/services/checkinUtils';

export type CheckinVisibility = 'public' | 'friends' | 'close';
export type CheckinAmbiance =
  | 'cozy'
  | 'modern'
  | 'rustic'
  | 'bright'
  | 'intimate'
  | 'energetic'
  | null;
export type CheckinPlaceSelectionSource = 'auto' | 'manual' | 'prefill' | null;
export type CheckinPlaceInfo = {
  placeId?: string | null;
  name?: string | null;
  location?: { lat: number; lng: number } | null;
} | null;

export type CheckinOutletAvailability =
  | NumericCheckinScale
  | 'plenty'
  | 'some'
  | 'few'
  | 'none'
  | null;

export type CheckinComposerHydration = {
  spot?: string;
  caption?: string;
  image?: string | null;
  captured?: boolean;
  selectedTags?: string[];
  photoTags?: string[];
  visitIntent?: DiscoveryIntent[];
  ambiance?: CheckinAmbiance;
  visibility?: CheckinVisibility;
  placeInfo?: CheckinPlaceInfo;
  placeSelectionSource?: CheckinPlaceSelectionSource;
  noiseLevel?: 1 | 2 | 3 | 4 | 5 | null;
  busyness?: 1 | 2 | 3 | 4 | 5 | null;
  overallVibe?: 1 | 2 | 3 | 4 | 5 | null;
  drinkPrice?: 1 | 2 | 3 | null;
  drinkQuality?: 1 | 2 | 3 | 4 | 5 | null;
  wifiSpeed?: 1 | 2 | 3 | 4 | 5 | null;
  outletAvailability?: CheckinOutletAvailability;
  laptopFriendly?: boolean | null;
  parkingAvailability?: 'yes' | 'limited' | 'no' | null;
  parkingType?: 'lot' | 'street' | 'garage' | null;
};

export type CheckinDraftSnapshot = {
  spot: string;
  caption: string;
  image: string | null;
  selectedTags: string[];
  photoTags: string[];
  visitIntent: DiscoveryIntent[];
  ambiance: CheckinAmbiance;
  placeInfo: CheckinPlaceInfo;
  detectedPlace: CheckinPlaceInfo;
  noiseLevel: 1 | 2 | 3 | 4 | 5 | null;
  busyness: 1 | 2 | 3 | 4 | 5 | null;
  overallVibe: 1 | 2 | 3 | 4 | 5 | null;
  drinkPrice: 1 | 2 | 3 | null;
  drinkQuality: 1 | 2 | 3 | 4 | 5 | null;
  wifiSpeed: 1 | 2 | 3 | 4 | 5 | null;
  outletAvailability: CheckinOutletAvailability;
  laptopFriendly: boolean | null;
  parkingAvailability: 'yes' | 'limited' | 'no' | null;
  parkingType: 'lot' | 'street' | 'garage' | null;
};

type ParsedComposerRouteParams = {
  editId: string | null;
  patch: CheckinComposerHydration;
};

function normalizeVisibility(value: unknown): CheckinVisibility | undefined {
  if (value === 'public' || value === 'friends' || value === 'close') return value;
  return undefined;
}

function normalizeAmbiance(value: unknown): CheckinAmbiance | undefined {
  if (
    value === 'cozy' ||
    value === 'modern' ||
    value === 'rustic' ||
    value === 'bright' ||
    value === 'intimate' ||
    value === 'energetic'
  ) {
    return value;
  }
  if (value === null) return null;
  return undefined;
}

function normalizeLocation(value: unknown): { lat: number; lng: number } | null | undefined {
  if (value == null) return undefined;
  const lat = typeof (value as any)?.lat === 'number' ? (value as any).lat : null;
  const lng = typeof (value as any)?.lng === 'number' ? (value as any).lng : null;
  if (lat === null || lng === null) return null;
  return { lat, lng };
}

export function hydrateComposerFromSource(
  source: any,
  options?: {
    placeSelectionSource?: CheckinPlaceSelectionSource;
    fallbackSpot?: string;
  },
): CheckinComposerHydration {
  const patch: CheckinComposerHydration = {};
  const nextSpot =
    typeof source?.spotName === 'string' && source.spotName.trim().length
      ? source.spotName
      : typeof source?.spot === 'string' && source.spot.trim().length
        ? source.spot
        : options?.fallbackSpot || '';
  if (nextSpot) patch.spot = nextSpot;

  if (typeof source?.caption === 'string') patch.caption = source.caption;

  const resolvedPhoto = resolvePhotoUri(source);
  if (resolvedPhoto) {
    patch.image = resolvedPhoto;
    patch.captured = true;
  }

  if (Array.isArray(source?.tags)) patch.selectedTags = source.tags.filter(Boolean);
  if (Array.isArray(source?.photoTags)) patch.photoTags = source.photoTags.filter(Boolean).slice(0, 3);
  if (Array.isArray(source?.visitIntent)) patch.visitIntent = sanitizeDiscoveryIntents(source.visitIntent);

  const ambiance = normalizeAmbiance(source?.ambiance);
  if (ambiance !== undefined) patch.ambiance = ambiance;

  const visibility = normalizeVisibility(source?.visibility);
  if (visibility) patch.visibility = visibility;

  const placeId =
    typeof source?.spotPlaceId === 'string' && source.spotPlaceId.trim().length
      ? source.spotPlaceId
      : typeof source?.placeId === 'string' && source.placeId.trim().length
        ? source.placeId
        : undefined;
  const location = normalizeLocation(source?.spotLatLng ?? source?.location);
  if (placeId || location) {
    patch.placeInfo = {
      placeId: placeId || undefined,
      name: nextSpot || source?.name || undefined,
      location: location ?? undefined,
    };
    patch.placeSelectionSource = options?.placeSelectionSource ?? 'manual';
  }

  const convertedNoise = toNumericNoiseLevel(source?.noiseLevel ?? null);
  if (convertedNoise) patch.noiseLevel = convertedNoise;
  if (typeof source?.busyness === 'number') patch.busyness = source.busyness;
  if (typeof source?.overallVibe === 'number') patch.overallVibe = source.overallVibe;
  if (typeof source?.drinkPrice === 'number') patch.drinkPrice = source.drinkPrice;
  if (typeof source?.drinkQuality === 'number') patch.drinkQuality = source.drinkQuality;
  if (typeof source?.wifiSpeed === 'number') patch.wifiSpeed = source.wifiSpeed;
  const normalizedOutletAvailability = toNumericOutletAvailability(source?.outletAvailability);
  if (normalizedOutletAvailability !== null) patch.outletAvailability = normalizedOutletAvailability;
  if (typeof source?.laptopFriendly === 'boolean') patch.laptopFriendly = source.laptopFriendly;
  if (
    source?.parkingAvailability === 'yes' ||
    source?.parkingAvailability === 'limited' ||
    source?.parkingAvailability === 'no'
  ) {
    patch.parkingAvailability = source.parkingAvailability;
  }
  if (
    source?.parkingType === 'lot' ||
    source?.parkingType === 'street' ||
    source?.parkingType === 'garage'
  ) {
    patch.parkingType = source.parkingType;
  }

  return patch;
}

export function buildComposerDraftPayload(snapshot: CheckinDraftSnapshot) {
  return {
    spot: snapshot.spot,
    caption: snapshot.caption,
    image: snapshot.image,
    tags: snapshot.selectedTags,
    photoTags: snapshot.photoTags,
    visitIntent: snapshot.visitIntent,
    ambiance: snapshot.ambiance,
    placeId: snapshot.placeInfo?.placeId || snapshot.detectedPlace?.placeId,
    location: snapshot.placeInfo?.location || snapshot.detectedPlace?.location,
    noiseLevel: snapshot.noiseLevel,
    busyness: snapshot.busyness,
    overallVibe: snapshot.overallVibe,
    drinkPrice: snapshot.drinkPrice,
    drinkQuality: snapshot.drinkQuality,
    wifiSpeed: snapshot.wifiSpeed,
    outletAvailability: snapshot.outletAvailability,
    laptopFriendly: snapshot.laptopFriendly,
    parkingAvailability: snapshot.parkingAvailability,
    parkingType: snapshot.parkingType,
  };
}

export function hasComposerDraftContent(snapshot: CheckinDraftSnapshot) {
  return !!(
    snapshot.spot.trim().length ||
    snapshot.caption.trim().length ||
    snapshot.image ||
    snapshot.selectedTags.length ||
    snapshot.photoTags.length ||
    snapshot.visitIntent.length ||
    snapshot.ambiance ||
    snapshot.placeInfo ||
    snapshot.detectedPlace
  );
}

export function parseComposerRouteParams(params: Record<string, unknown>, currentSpot = ''): ParsedComposerRouteParams {
  const patch: CheckinComposerHydration = {};
  const prefillSpot = typeof params?.spot === 'string' ? params.spot : '';
  if (prefillSpot && !currentSpot) {
    patch.spot = prefillSpot;
  }

  const prefillPlaceId = typeof params?.placeId === 'string' ? params.placeId.trim() : '';
  const lat = typeof params?.lat === 'string' ? Number(params.lat) : null;
  const lng = typeof params?.lng === 'string' ? Number(params.lng) : null;
  const hasLatLng = Number.isFinite(lat) && Number.isFinite(lng);

  if (prefillPlaceId || hasLatLng) {
    patch.placeInfo = {
      placeId: prefillPlaceId || undefined,
      name: prefillSpot || undefined,
      location: hasLatLng ? { lat: lat as number, lng: lng as number } : undefined,
    };
    patch.placeSelectionSource = 'prefill';
  }

  return {
    editId: typeof params?.editId === 'string' ? params.editId : null,
    patch,
  };
}
