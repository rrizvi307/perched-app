import { canonicalizePlaceSelection, searchPlacesNearbyResponse } from '@/services/googleMaps';
import { logEvent } from '@/services/logEvent';
import { requestForegroundLocation } from '@/services/location';
import { getProviderProxyUserMessage, primeProviderProxyAccess } from '@/services/providerProxy';
import { getPermissionPrimerSeen } from '@/storage/local';
import type { CheckinPlaceInfo } from './checkinComposerState';

type LatLng = {
  lat: number;
  lng: number;
};

type DetectPlaceInput = {
  image?: string | null;
  imageExif?: any;
  allowWithoutImage?: boolean;
  detectionThresholdKm?: number;
  userId?: string | null;
  existingSpot?: string | null;
  existingPlaceInfo?: CheckinPlaceInfo;
};

type ResolvedPlaceSelection =
  | {
      status: 'success';
      resolvedPlace: any;
    }
  | {
      status: 'error';
      postStatusMessage: string;
      toastMessage: string;
      tone: 'warning' | 'error';
    };

export type CheckinPlaceDetectionResult =
  | {
      status: 'skipped';
    }
  | {
      status: 'needs_location_primer';
    }
  | {
      status: 'error';
      detectionError: string;
    }
  | {
      status: 'success';
      detectedPlace: any;
      detectedCandidates: any[];
      autoFill?: {
        placeInfo: any;
        spot: string;
        placeSelectionSource: 'auto';
      };
    };

function dmsToDeg(value: any, ref?: string) {
  if (!value) return null;
  let deg = 0;
  if (Array.isArray(value)) {
    const [d, m, s] = value.map((v) => (typeof v === 'number' ? v : v?.numerator ? v.numerator / v.denominator : Number(v)));
    deg = (d || 0) + (m || 0) / 60 + (s || 0) / 3600;
  } else if (typeof value === 'number') {
    deg = value;
  } else if (typeof value === 'string') {
    deg = Number(value) || 0;
  }
  if (ref === 'S' || ref === 'W') deg *= -1;
  return Number.isFinite(deg) ? deg : null;
}

export function extractLocationFromExif(exif: any): LatLng | null {
  if (!exif) return null;
  const lat = dmsToDeg(exif.GPSLatitude, exif.GPSLatitudeRef);
  const lng = dmsToDeg(exif.GPSLongitude, exif.GPSLongitudeRef);
  if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
  return null;
}

export function distanceKm(a: LatLng, b: LatLng) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDlat = Math.sin(dLat / 2) * Math.sin(dLat / 2);
  const sinDlon = Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(
    Math.sqrt(sinDlat + Math.cos(lat1) * Math.cos(lat2) * sinDlon),
    Math.sqrt(1 - (sinDlat + Math.cos(lat1) * Math.cos(lat2) * sinDlon)),
  );
  return R * c;
}

export function rankDetectedPlaces(origin: LatLng, places: any[]) {
  return places
    .map((place) => {
      const nextDistance = place?.location ? distanceKm(origin, place.location) : Infinity;
      return { ...place, distanceKm: nextDistance };
    })
    .sort((a, b) => (a.distanceKm || 999) - (b.distanceKm || 999));
}

export async function resolveManualCheckinPlaceSelection(place: any): Promise<ResolvedPlaceSelection> {
  try {
    const resolved = await canonicalizePlaceSelection(place);
    if (!resolved?.placeId || !resolved?.location) {
      return {
        status: 'error',
        postStatusMessage: 'Please choose a verified spot with a real location.',
        toastMessage: 'Pick a verified spot from search results.',
        tone: 'warning',
      };
    }

    return {
      status: 'success',
      resolvedPlace: resolved,
    };
  } catch {
    return {
      status: 'error',
      postStatusMessage: 'Unable to verify that spot right now. Try again.',
      toastMessage: 'Unable to verify that spot right now.',
      tone: 'error',
    };
  }
}

export async function detectCheckinPlace(input: DetectPlaceInput): Promise<CheckinPlaceDetectionResult> {
  if (!input.image && !input.allowWithoutImage) {
    return { status: 'skipped' };
  }

  try {
    const exifLocation = input.image ? extractLocationFromExif(input.imageExif) : null;
    const currentLocation =
      exifLocation || (await requestForegroundLocation({ ignoreCache: true, preferFresh: true }));

    await primeProviderProxyAccess(true);

    try {
      const isDemo =
        (typeof window !== 'undefined' && (window as any).__PERCHED_DEMO) ||
        (global as any).__PERCHED_DEMO;
      if (isDemo) {
        const top = {
          placeId: 'demo-place-agora',
          name: 'Agora Coffee',
          location: { lat: 29.7172, lng: -95.4018 },
          distanceKm: 0.02,
        } as any;
        const detectedPlace = { ...top, source: exifLocation ? 'photo' : 'gps' };
        await logEvent('place_detected', input.userId ?? undefined, {
          success: true,
          source: exifLocation ? 'photo' : 'gps',
          distanceKm: top.distanceKm,
        });
        const shouldAutoFill =
          !input.existingSpot &&
          !input.existingPlaceInfo &&
          typeof top.distanceKm === 'number' &&
          top.distanceKm <= (input.detectionThresholdKm ?? 0.2);
        return {
          status: 'success',
          detectedPlace,
          detectedCandidates: [top],
          autoFill: shouldAutoFill
            ? {
                placeInfo: top,
                spot: top.name,
                placeSelectionSource: 'auto',
              }
            : undefined,
        };
      }
    } catch {}

    if (!currentLocation) {
      const seenLocationPrimer = await getPermissionPrimerSeen('location');
      if (!seenLocationPrimer) {
        return { status: 'needs_location_primer' };
      }

      await logEvent('place_detected', input.userId ?? undefined, { success: false, reason: 'no_location' });
      return {
        status: 'error',
        detectionError: 'Location unavailable. Check Settings -> Privacy -> Location.',
      };
    }

    const primary = await searchPlacesNearbyResponse(currentLocation.lat, currentLocation.lng, 220, 'general');
    let results = [...primary.places];

    if (results.length < 3) {
      const fallback = await searchPlacesNearbyResponse(currentLocation.lat, currentLocation.lng, 800, 'general');
      const seenIds = new Set(results.map((place) => place.placeId));
      fallback.places.forEach((place) => {
        if (!seenIds.has(place.placeId)) results.push(place);
      });
      if (!results.length && (primary.status === 'error' || fallback.status === 'error')) {
        const failure = primary.status === 'error' ? primary : fallback;
        const code = failure.diagnostics?.errorCode;
        return {
          status: 'error',
          detectionError:
            code === 'client_provider_error'
              ? 'Spot search is temporarily unavailable.'
              : getProviderProxyUserMessage(code, 'places'),
        };
      }
    }

    if (!results.length) {
      await logEvent('place_detected', input.userId ?? undefined, { success: false, reason: 'no_results' });
      return {
        status: 'error',
        detectionError: 'No nearby spots found. Try searching by name.',
      };
    }

    const ranked = rankDetectedPlaces(currentLocation, results);
    const top = ranked[0];
    const detectedPlace = { ...top, source: exifLocation ? 'photo' : 'gps' };

    await logEvent('place_detected', input.userId ?? undefined, {
      success: true,
      source: exifLocation ? 'photo' : 'gps',
      distanceKm: top.distanceKm,
    });

    const shouldAutoFill =
      !input.existingSpot &&
      !input.existingPlaceInfo &&
      typeof top.distanceKm === 'number' &&
      top.distanceKm <= (input.detectionThresholdKm ?? 0.2);

    return {
      status: 'success',
      detectedPlace,
      detectedCandidates: ranked.slice(0, 4),
      autoFill: shouldAutoFill
        ? {
            placeInfo: top,
            spot: top.name,
            placeSelectionSource: 'auto',
          }
        : undefined,
    };
  } catch (error: any) {
    const raw = error?.message || '';
    const detectionError = /api key|not authorized|referer|key/i.test(raw)
      ? 'Places API blocked. Check key restrictions.'
      : 'Unable to detect location.';
    await logEvent('place_detected', input.userId ?? undefined, { success: false, reason: 'error' });
    return {
      status: 'error',
      detectionError,
    };
  }
}
