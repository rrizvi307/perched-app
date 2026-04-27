import { countProvidedSpotIntel } from './checkinValidation';
import type { CheckinPlaceInfo, CheckinVisibility } from './checkinComposerState';

type CheckinDetectedPlace = {
  source?: 'photo' | 'gps';
  distanceKm?: number;
} & NonNullable<CheckinPlaceInfo>;

export type CheckinMetricsSummary = {
  completed: number;
  total: number;
  percentage: number;
  message: string;
  isComplete: boolean;
};

export type CheckinSubmitState = {
  disabled: boolean;
  label: string;
  accessibilityLabel: string;
  showPlusIcon: boolean;
};

export function buildCheckinVisibilityNote(visibility: CheckinVisibility) {
  if (visibility === 'friends') return 'Only friends can see this check-in.';
  if (visibility === 'close') return 'Only close friends can see the exact spot.';
  return 'Anyone can see this check-in.';
}

export function buildCheckinDetectionLabel(detectedPlace: CheckinDetectedPlace | null) {
  if (!detectedPlace) return null;
  const source = detectedPlace.source === 'photo' ? 'Photo GPS' : 'Near you';
  const distance =
    typeof detectedPlace.distanceKm === 'number'
      ? ` · ${Math.round(detectedPlace.distanceKm * 1000)}m`
      : '';
  return `${source}${distance}`;
}

export function buildCheckinMetricsSummary(input: {
  noiseLevel: unknown;
  busyness: unknown;
  overallVibe: unknown;
  wifiSpeed: unknown;
  outletAvailability: unknown;
}): CheckinMetricsSummary {
  const total = 5;
  const completed = countProvidedSpotIntel(input);
  const percentage = Math.round((completed / total) * 100);

  let message = 'Share a quick pulse so people know what this spot feels like right now';
  if (completed > 0 && percentage === 100) {
    message = 'Thanks for helping the community!';
  } else if (completed > 0) {
    const remaining = total - completed;
    message = remaining === 1 ? 'One more metric to go' : `${remaining} more to go`;
  }

  return {
    completed,
    total,
    percentage,
    message,
    isComplete: percentage === 100,
  };
}

export function buildCheckinSubmitState(input: {
  loading: boolean;
  resolvingPlaceSelection: boolean;
  spot: string;
  activePlace: CheckinPlaceInfo;
}): CheckinSubmitState {
  const hasVerifiedSpot =
    !!input.spot &&
    !!input.activePlace?.placeId &&
    !!input.activePlace?.location;

  if (input.loading) {
    return {
      disabled: true,
      label: 'Posting...',
      accessibilityLabel: 'Posting check-in',
      showPlusIcon: false,
    };
  }

  if (input.resolvingPlaceSelection) {
    return {
      disabled: true,
      label: 'Verifying spot...',
      accessibilityLabel: 'Verifying spot',
      showPlusIcon: false,
    };
  }

  if (!hasVerifiedSpot) {
    return {
      disabled: true,
      label: 'Select a verified spot',
      accessibilityLabel: 'Select a verified spot before posting',
      showPlusIcon: false,
    };
  }

  return {
    disabled: false,
    label: 'Post check-in',
    accessibilityLabel: 'Post check-in',
    showPlusIcon: true,
  };
}

export function buildCheckinStaticMapUrl(
  coords?: { lat: number; lng: number } | null,
  key?: string | null,
  size = '200x140',
) {
  if (!coords || !key) return null;
  const center = `${coords.lat},${coords.lng}`;
  return `https://maps.googleapis.com/maps/api/staticmap?center=${center}&zoom=15&size=${size}&scale=2&markers=color:red%7C${center}&key=${key}`;
}
