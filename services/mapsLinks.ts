type Coordinates = { lat: number; lng: number };

function isFiniteCoord(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function safeQuery(input: unknown) {
  return typeof input === 'string' ? input.trim() : '';
}

export function buildGoogleMapsUrl(input: {
  coords?: Coordinates | null;
  placeId?: string | null;
  name?: string | null;
}): string | null {
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
