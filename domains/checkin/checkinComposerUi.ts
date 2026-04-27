import type { DiscoveryIntent } from '@/services/discoveryIntents';
import type {
  CheckinAmbiance,
  CheckinOutletAvailability,
  CheckinPlaceInfo,
  CheckinPlaceSelectionSource,
  CheckinVisibility,
} from './checkinComposerState';

export type CheckinStatusTone = 'info' | 'warning' | 'error' | 'success';

export type CheckinPostStatus =
  | {
      message: string;
      tone: CheckinStatusTone;
    }
  | null;

export type CheckinComposerScreenPatch = {
  spot?: string;
  caption?: string;
  image?: string | null;
  imageExif?: any | null;
  captured?: boolean;
  selectedTags?: string[];
  photoTags?: string[];
  visitIntent?: DiscoveryIntent[];
  ambiance?: CheckinAmbiance;
  placeInfo?: CheckinPlaceInfo;
  placeSelectionSource?: CheckinPlaceSelectionSource;
  detectedPlace?: any | null;
  detectedCandidates?: any[];
  detecting?: boolean;
  detectionError?: string | null;
  postStatus?: CheckinPostStatus;
  pendingRemote?: any | null;
  placeModal?: boolean;
  visibility?: CheckinVisibility;
  isEditMode?: boolean;
  editId?: string | null;
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

export function toggleBoundedSelection<T>(current: T[], value: T, max: number) {
  if (current.includes(value)) {
    return {
      next: current.filter((entry) => entry !== value),
      limitReached: false,
    };
  }

  if (current.length >= max) {
    return {
      next: current,
      limitReached: true,
    };
  }

  return {
    next: [...current, value],
    limitReached: false,
  };
}

export function createCheckinComposerResetPatch(): CheckinComposerScreenPatch {
  return {
    spot: '',
    caption: '',
    image: null,
    imageExif: null,
    captured: false,
    selectedTags: [],
    photoTags: [],
    visitIntent: [],
    ambiance: null,
    placeInfo: null,
    placeSelectionSource: null,
    detectedPlace: null,
    detectedCandidates: [],
    detecting: false,
    detectionError: null,
    postStatus: null,
    pendingRemote: null,
    placeModal: false,
    visibility: 'public',
    isEditMode: false,
    editId: null,
    noiseLevel: null,
    busyness: null,
    overallVibe: null,
    drinkPrice: null,
    drinkQuality: null,
    wifiSpeed: null,
    outletAvailability: null,
    laptopFriendly: null,
    parkingAvailability: null,
    parkingType: null,
  };
}

export function createCheckinPhotoClearedPatch(
  placeSelectionSource: CheckinPlaceSelectionSource,
): CheckinComposerScreenPatch {
  const patch: CheckinComposerScreenPatch = {
    image: null,
    imageExif: null,
    captured: false,
    detectedCandidates: [],
    detectionError: null,
    detecting: false,
  };

  if (placeSelectionSource === 'auto' || placeSelectionSource === null) {
    patch.placeInfo = null;
    patch.placeSelectionSource = null;
    patch.detectedPlace = null;
    patch.spot = '';
  }

  return patch;
}

export function createCheckinPhotoReplacementPatch(
  placeSelectionSource: CheckinPlaceSelectionSource,
): CheckinComposerScreenPatch {
  const patch: CheckinComposerScreenPatch = {
    detectedCandidates: [],
    detectionError: null,
    detecting: false,
  };

  if (placeSelectionSource === 'auto' || placeSelectionSource === null) {
    patch.placeInfo = null;
    patch.placeSelectionSource = null;
    patch.detectedPlace = null;
    patch.spot = '';
  }

  return patch;
}
