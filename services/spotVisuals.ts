import { resolvePhotoUri } from './photoSources';
import type { PlaceIntelligence } from './placeIntelligence';

export type SpotVisualSource = 'community' | 'provider' | 'map' | 'none';

export type SpotVisualResult = {
  uri: string | null;
  source: SpotVisualSource;
};

type ResolveSpotVisualInput = {
  checkins?: any[];
  intelligence?: Pick<PlaceIntelligence, 'providerPhotos'> | null;
  fallbackMapUrl?: string | null;
};

function getCommunityVisual(checkins?: any[]): string | null {
  if (!Array.isArray(checkins)) return null;
  for (const checkin of checkins) {
    const uri = resolvePhotoUri(checkin);
    if (uri) return uri;
  }
  return null;
}

function getProviderVisual(intelligence?: Pick<PlaceIntelligence, 'providerPhotos'> | null): string | null {
  const photos = Array.isArray(intelligence?.providerPhotos) ? intelligence.providerPhotos : [];
  for (const photo of photos) {
    const url = typeof photo?.url === 'string' ? photo.url.trim() : '';
    if (url.startsWith('https://')) return url;
  }
  return null;
}

export function resolveSpotVisual(input: ResolveSpotVisualInput): SpotVisualResult {
  const community = getCommunityVisual(input.checkins);
  if (community) {
    return { uri: community, source: 'community' };
  }

  const provider = getProviderVisual(input.intelligence);
  if (provider) {
    return { uri: provider, source: 'provider' };
  }

  const fallbackMapUrl = typeof input.fallbackMapUrl === 'string' ? input.fallbackMapUrl.trim() : '';
  if (fallbackMapUrl) {
    return { uri: fallbackMapUrl, source: 'map' };
  }

  return { uri: null, source: 'none' };
}
