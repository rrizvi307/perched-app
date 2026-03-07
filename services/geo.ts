export type LatLng = { lat: number; lng: number };

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function readLatLng(value: unknown): LatLng | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const lat = toFiniteNumber(record.lat ?? record.latitude);
  const lng = toFiniteNumber(record.lng ?? record.longitude);
  if (lat === null || lng === null) return null;
  return { lat, lng };
}

export function readEntityLatLng(value: unknown): LatLng | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return (
    readLatLng(record.location) ||
    readLatLng(record.spotLatLng) ||
    readLatLng(record.coords) ||
    readLatLng(record)
  );
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 6371 * (2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}
