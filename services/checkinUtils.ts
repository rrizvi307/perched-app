export const CHECKIN_TTL_MS = 12 * 60 * 60 * 1000;

export function toMillis(input: any): number | null {
  if (!input) return null;
  if (typeof input === 'number') return input;
  if (typeof input === 'string') {
    const ms = new Date(input).getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof input === 'object') {
    if (typeof input.toDate === 'function') {
      const ms = input.toDate().getTime();
      return Number.isNaN(ms) ? null : ms;
    }
    if (typeof input.seconds === 'number') {
      return input.seconds * 1000;
    }
  }
  return null;
}

export function getCheckinExpiryMs(checkin: { expiresAt?: any; createdAt?: any }) {
  const expiresMs = toMillis(checkin?.expiresAt);
  if (expiresMs) return expiresMs;
  const createdMs = toMillis(checkin?.createdAt);
  if (!createdMs) return null;
  return createdMs + CHECKIN_TTL_MS;
}

export function isCheckinExpired(checkin: { expiresAt?: any; createdAt?: any }, now = Date.now()) {
  const expires = getCheckinExpiryMs(checkin);
  if (!expires) return false;
  return expires <= now;
}

export function formatCheckinTime(input: any) {
  const ms = toMillis(input);
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '';
  }
}

export function formatCheckinClock(input: any) {
  const ms = toMillis(input);
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function formatTimeRemaining(checkin: { expiresAt?: any; createdAt?: any }, now = Date.now()) {
  const expires = getCheckinExpiryMs(checkin);
  if (!expires) return '';
  const diff = expires - now;
  if (diff <= 0) return 'Expired';
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const mins = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
  if (hours >= 1) return `Expires in ${hours}h ${mins}m`;
  return `Expires in ${Math.max(1, mins)}m`;
}
