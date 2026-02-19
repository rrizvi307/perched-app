type Coordinates = { lat: number; lng: number };

type MapsInput = {
  coords?: Coordinates | null;
  placeId?: string | null;
  name?: string | null;
};

export type OpenInMapsResult =
  | { opened: true; reason: 'opened' }
  | { opened: false; reason: 'cancelled' | 'no_destination' | 'open_failed' };

function isFiniteCoord(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function safeQuery(input: unknown) {
  return typeof input === 'string' ? input.trim() : '';
}

export function buildGoogleMapsUrl(input: MapsInput): string | null {
  const lat = input.coords?.lat;
  const lng = input.coords?.lng;
  if (isFiniteCoord(lat) && isFiniteCoord(lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
  }

  const placeId = safeQuery(input.placeId);
  if (placeId) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`place_id:${placeId}`)}`;
  }

  const name = safeQuery(input.name);
  if (name) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`;
  }

  return null;
}

export function buildAppleMapsUrl(input: MapsInput): string | null {
  const lat = input.coords?.lat;
  const lng = input.coords?.lng;
  if (isFiniteCoord(lat) && isFiniteCoord(lng)) {
    const q = safeQuery(input.name);
    const params = [`ll=${lat},${lng}`];
    if (q) params.push(`q=${encodeURIComponent(q)}`);
    return `https://maps.apple.com/?${params.join('&')}`;
  }

  const name = safeQuery(input.name);
  if (name) {
    return `https://maps.apple.com/?q=${encodeURIComponent(name)}`;
  }

  return null;
}

export async function openInMaps(input: MapsInput): Promise<OpenInMapsResult> {
  // Lazy-require react-native to keep pure URL builders testable without RN transform
  const { ActionSheetIOS, Platform } = require('react-native');
  const { openExternalLink } = require('./externalLinks');

  const googleUrl = buildGoogleMapsUrl(input);
  const appleUrl = buildAppleMapsUrl(input);

  if (!appleUrl && !googleUrl) {
    return { opened: false, reason: 'no_destination' };
  }

  // iOS: explicitly offer Apple Maps (Guideline 4 design compliance).
  if (Platform.OS === 'ios' && appleUrl) {
    if (ActionSheetIOS?.showActionSheetWithOptions) {
      return await new Promise<OpenInMapsResult>((resolve) => {
        const hasGoogle = !!googleUrl;
        const options = hasGoogle
          ? ['Apple Maps', 'Google Maps', 'Cancel']
          : ['Apple Maps', 'Cancel'];
        const cancelButtonIndex = options.length - 1;
        ActionSheetIOS.showActionSheetWithOptions(
          { options, cancelButtonIndex },
          (index: number) => {
            if (index === 0) {
              void openExternalLink(appleUrl)
                .then((opened: boolean) => resolve(opened ? { opened: true, reason: 'opened' } : { opened: false, reason: 'open_failed' }))
                .catch(() => resolve({ opened: false, reason: 'open_failed' }));
              return;
            }
            if (hasGoogle && index === 1 && googleUrl) {
              void openExternalLink(googleUrl)
                .then((opened: boolean) => resolve(opened ? { opened: true, reason: 'opened' } : { opened: false, reason: 'open_failed' }))
                .catch(() => resolve({ opened: false, reason: 'open_failed' }));
              return;
            }
            resolve({ opened: false, reason: 'cancelled' });
          },
        );
      });
    }

    // Fallback: if action sheet is unavailable, prefer native Apple Maps.
    const opened = await openExternalLink(appleUrl);
    return opened ? { opened: true, reason: 'opened' } : { opened: false, reason: 'open_failed' };
  }

  // Non-iOS fallback.
  if (googleUrl) {
    const opened = await openExternalLink(googleUrl);
    return opened ? { opened: true, reason: 'opened' } : { opened: false, reason: 'open_failed' };
  }
  if (appleUrl) {
    const opened = await openExternalLink(appleUrl);
    return opened ? { opened: true, reason: 'opened' } : { opened: false, reason: 'open_failed' };
  }

  return { opened: false, reason: 'no_destination' };
}
