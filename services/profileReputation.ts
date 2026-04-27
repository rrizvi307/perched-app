import type { UserStats } from './gamification';

export type ProfileBadgeId =
  | 'consistent'
  | 'regular'
  | 'explorer'
  | 'campus_regular'
  | 'tastemaker'
  | 'neighborhood_expert';

export type ProfileReputationBadge = {
  id: ProfileBadgeId;
  label: string;
  detail: string;
};

export type ProfileReputationSummary = {
  badges: ProfileReputationBadge[];
  trustSignals: string[];
  topQualities: string[];
  favoriteSpot: { name: string; count: number } | null;
  contributionSummary: string;
};

function toMillis(value: any): number {
  if (!value) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value?.toMillis === 'function') {
    try {
      return value.toMillis();
    } catch {
      return 0;
    }
  }
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeLabel(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function toTitleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function buildTopTagSummary(checkins: any[]) {
  const counts = new Map<string, number>();
  checkins.forEach((checkin) => {
    const tags = Array.isArray(checkin?.tags) ? checkin.tags : [];
    tags.forEach((tag: unknown) => {
      const normalized = normalizeLabel(tag).toLowerCase();
      if (!normalized) return;
      counts.set(normalized, (counts.get(normalized) || 0) + 1);
    });
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => toTitleCase(tag));
}

function buildFavoriteSpot(checkins: any[]) {
  const counts = new Map<string, number>();
  checkins.forEach((checkin) => {
    const name = normalizeLabel(checkin?.spotName || checkin?.spot);
    if (!name) return;
    counts.set(name, (counts.get(name) || 0) + 1);
  });
  const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
  return top ? { name: top[0], count: top[1] } : null;
}

function countRecentCheckins(checkins: any[], days: number) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return checkins.filter((checkin) => toMillis(checkin?.createdAt || checkin?.timestamp) >= cutoff).length;
}

export function buildProfileReputationSummary(input: {
  user?: { city?: string | null; campus?: string | null } | null;
  checkins: any[];
  stats?: Partial<UserStats> | null;
}): ProfileReputationSummary {
  const checkins = Array.isArray(input.checkins) ? input.checkins : [];
  const totalCheckins = input.stats?.totalCheckins ?? checkins.length;
  const uniqueSpots = input.stats?.uniqueSpots ?? new Set(
    checkins.map((checkin) => normalizeLabel(checkin?.spotPlaceId || checkin?.spotName || checkin?.spot)).filter(Boolean),
  ).size;
  const streakDays = input.stats?.streakDays ?? 0;
  const recent30 = countRecentCheckins(checkins, 30);
  const topQualities = buildTopTagSummary(checkins);
  const favoriteSpot = buildFavoriteSpot(checkins);
  const areaLabel = normalizeLabel(input.user?.campus || input.user?.city);

  const badges: ProfileReputationBadge[] = [];
  if (streakDays >= 7) {
    badges.push({
      id: 'consistent',
      label: 'Consistent',
      detail: `${streakDays}-day streak`,
    });
  }
  if (totalCheckins >= 12) {
    badges.push({
      id: 'regular',
      label: 'Regular',
      detail: `${totalCheckins} check-ins shared`,
    });
  }
  if (uniqueSpots >= 8) {
    badges.push({
      id: 'explorer',
      label: 'Explorer',
      detail: `${uniqueSpots} different spots`,
    });
  }
  if (areaLabel && totalCheckins >= 8) {
    badges.push({
      id: input.user?.campus ? 'campus_regular' : 'neighborhood_expert',
      label: input.user?.campus ? 'Campus Regular' : 'Neighborhood Expert',
      detail: areaLabel,
    });
  }
  if (topQualities.length >= 2 && totalCheckins >= 10) {
    badges.push({
      id: 'tastemaker',
      label: 'Tastemaker',
      detail: `Known for ${topQualities.slice(0, 2).join(' and ')}`,
    });
  }

  const trustSignals = [
    `${totalCheckins} check-ins across ${uniqueSpots} spots`,
    recent30 > 0 ? `${recent30} check-ins in the last 30 days` : null,
    favoriteSpot ? `Usually posts from ${favoriteSpot.name}` : null,
    areaLabel ? `Most active around ${areaLabel}` : null,
    topQualities.length ? `Known for ${topQualities.join(', ')}` : null,
  ].filter((signal): signal is string => !!signal);

  return {
    badges: badges.slice(0, 4),
    trustSignals: trustSignals.slice(0, 4),
    topQualities,
    favoriteSpot,
    contributionSummary:
      recent30 >= 8
        ? 'Active contributor with recent signal'
        : totalCheckins >= 12
          ? 'Established community signal'
          : 'Building community signal',
  };
}
