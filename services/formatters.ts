type TimestampLike =
  | number
  | Date
  | { seconds?: number; nanoseconds?: number }
  | { toMillis: () => number }
  | null
  | undefined;

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function toMillis(value: TimestampLike): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (value && typeof value === 'object') {
    if ('toMillis' in value && typeof value.toMillis === 'function') {
      const ms = value.toMillis();
      return Number.isFinite(ms) ? ms : null;
    }
    if ('seconds' in value && typeof value.seconds === 'number') {
      const nanos = typeof value.nanoseconds === 'number' ? value.nanoseconds : 0;
      return value.seconds * 1000 + Math.floor(nanos / 1_000_000);
    }
  }
  return null;
}

function pluralize(value: number, unit: string): string {
  return `${value} ${unit}${value === 1 ? '' : 's'} ago`;
}

export function formatTimeAgo(value: TimestampLike): string {
  const timestamp = toMillis(value);
  if (!timestamp) return 'unknown';

  const now = Date.now();
  const diff = Math.max(0, now - timestamp);

  if (diff < MINUTE_MS) return 'just now';
  if (diff < HOUR_MS) return pluralize(Math.floor(diff / MINUTE_MS), 'minute');
  if (diff < DAY_MS) return pluralize(Math.floor(diff / HOUR_MS), 'hour');

  const days = Math.floor(diff / DAY_MS);
  if (days === 1) return 'yesterday';
  if (days < 7) return pluralize(days, 'day');

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return pluralize(weeks, 'week');

  const months = Math.floor(days / 30);
  if (months < 12) return pluralize(months, 'month');

  const years = Math.floor(days / 365);
  return pluralize(years, 'year');
}

export function isStale(value: TimestampLike, days = 30): boolean {
  const timestamp = toMillis(value);
  if (!timestamp) return false;
  return Date.now() - timestamp > days * DAY_MS;
}
