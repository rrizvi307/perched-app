import type { SimpleLocation } from './location';

type LaunchCity = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
  aliases?: string[];
};

type LaunchCampus = {
  id: string;
  name: string;
  city: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
  aliases?: string[];
};

export type LaunchLocationOptionType = 'city' | 'campus';

export const LAUNCH_MARKET_SIGNUP_MESSAGE =
  'Perched is currently available only in Houston, Austin, and select nearby universities.';

export const LAUNCH_MARKET_LOCATION_REQUIRED_MESSAGE =
  'Turn on location so we can confirm you are in one of the current launch markets before creating your account.';

const LAUNCH_CITIES: LaunchCity[] = [
  {
    id: 'houston',
    name: 'Houston',
    latitude: 29.7604,
    longitude: -95.3698,
    radiusKm: 85,
    aliases: ['Houston, TX'],
  },
  {
    id: 'austin',
    name: 'Austin',
    latitude: 30.2672,
    longitude: -97.7431,
    radiusKm: 60,
    aliases: ['Austin, TX'],
  },
];

const LAUNCH_CAMPUSES: LaunchCampus[] = [
  {
    id: 'rice',
    name: 'Rice University',
    city: 'Houston',
    latitude: 29.7174,
    longitude: -95.4018,
    radiusKm: 4,
    aliases: ['Rice'],
  },
  {
    id: 'university-of-houston',
    name: 'University of Houston',
    city: 'Houston',
    latitude: 29.7199,
    longitude: -95.3422,
    radiusKm: 4,
    aliases: ['UH'],
  },
  {
    id: 'houston-community-college',
    name: 'Houston Community College',
    city: 'Houston',
    latitude: 29.7353,
    longitude: -95.3774,
    radiusKm: 4,
    aliases: ['HCC'],
  },
  {
    id: 'texas-southern',
    name: 'Texas Southern University',
    city: 'Houston',
    latitude: 29.7211,
    longitude: -95.3595,
    radiusKm: 4,
  },
  {
    id: 'st-thomas-houston',
    name: 'University of St. Thomas (Houston)',
    city: 'Houston',
    latitude: 29.7382,
    longitude: -95.3917,
    radiusKm: 4,
    aliases: ['University of St. Thomas'],
  },
  {
    id: 'uh-downtown',
    name: 'University of Houston Downtown',
    city: 'Houston',
    latitude: 29.7667,
    longitude: -95.3593,
    radiusKm: 4,
  },
  {
    id: 'houston-baptist',
    name: 'Houston Baptist University',
    city: 'Houston',
    latitude: 29.6934,
    longitude: -95.5155,
    radiusKm: 5,
    aliases: ['Houston Christian University'],
  },
  {
    id: 'baylor-college-of-medicine',
    name: 'Baylor College of Medicine',
    city: 'Houston',
    latitude: 29.7098,
    longitude: -95.3985,
    radiusKm: 4,
  },
  {
    id: 'ut-health-houston',
    name: 'University of Texas Health Science Center',
    city: 'Houston',
    latitude: 29.7115,
    longitude: -95.4016,
    radiusKm: 4,
    aliases: ['UTHealth Houston'],
  },
  {
    id: 'ut-austin',
    name: 'University of Texas at Austin',
    city: 'Austin',
    latitude: 30.2849,
    longitude: -97.7341,
    radiusKm: 5,
    aliases: ['UT Austin'],
  },
  {
    id: 'texas-state',
    name: 'Texas State University',
    city: 'San Marcos',
    latitude: 29.8893,
    longitude: -97.9382,
    radiusKm: 5,
  },
  {
    id: 'sam-houston-state',
    name: 'Sam Houston State University',
    city: 'Huntsville',
    latitude: 30.7140,
    longitude: -95.5478,
    radiusKm: 5,
  },
  {
    id: 'texas-am',
    name: 'Texas A&M University',
    city: 'College Station',
    latitude: 30.6187,
    longitude: -96.3365,
    radiusKm: 6,
    aliases: ['Texas AM University', 'Texas A and M University'],
  },
  {
    id: 'texas-am-galveston',
    name: 'Texas A&M University - Galveston',
    city: 'Galveston',
    latitude: 29.3097,
    longitude: -94.7923,
    radiusKm: 5,
    aliases: ['Texas AM University - Galveston', 'Texas A and M University - Galveston'],
  },
];

function normalizeMarketName(value?: string | null) {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\(.*?\)/g, ' ')
    .replace(/,\s*tx\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesNormalizedName(value: string | null | undefined, name: string, aliases?: string[]) {
  const normalized = normalizeMarketName(value);
  if (!normalized) return false;
  if (normalized === normalizeMarketName(name)) return true;
  return (aliases || []).some((alias) => normalized === normalizeMarketName(alias));
}

function haversineDistanceKm(a: SimpleLocation, b: SimpleLocation) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const calc =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(calc), Math.sqrt(1 - calc));
}

function dedupe(values: string[]) {
  return Array.from(new Set(values));
}

export function getLaunchLocationOptions(type: LaunchLocationOptionType, query: string) {
  const list = type === 'city' ? LAUNCH_CITIES.map((item) => item.name) : LAUNCH_CAMPUSES.map((item) => item.name);
  const normalizedQuery = normalizeMarketName(query);
  if (!normalizedQuery) return list;
  return list.filter((name) => normalizeMarketName(name).includes(normalizedQuery));
}

export function getLaunchMarketSignupMessage() {
  return LAUNCH_MARKET_SIGNUP_MESSAGE;
}

export function getLaunchMarketLocationRequiredMessage() {
  return LAUNCH_MARKET_LOCATION_REQUIRED_MESSAGE;
}

export function findLaunchCity(city?: string | null) {
  return LAUNCH_CITIES.find((item) => matchesNormalizedName(city, item.name, item.aliases)) || null;
}

export function findLaunchCampus(campus?: string | null) {
  return LAUNCH_CAMPUSES.find((item) => matchesNormalizedName(campus, item.name, item.aliases)) || null;
}

export function isLaunchCity(city?: string | null) {
  return !!findLaunchCity(city);
}

export function isLaunchCampus(campus?: string | null) {
  return !!findLaunchCampus(campus);
}

export function isWithinLaunchMarket(location?: SimpleLocation | null) {
  if (!location) return false;
  const cityMatch = LAUNCH_CITIES.some((item) => (
    haversineDistanceKm(location, { lat: item.latitude, lng: item.longitude }) <= item.radiusKm
  ));
  if (cityMatch) return true;
  return LAUNCH_CAMPUSES.some((item) => (
    haversineDistanceKm(location, { lat: item.latitude, lng: item.longitude }) <= item.radiusKm
  ));
}

export function validateLaunchMarketSignup(input: {
  city?: string | null;
  campus?: string | null;
  deviceLocation?: SimpleLocation | null;
}) {
  const campusMatch = findLaunchCampus(input.campus);
  const cityMatch = findLaunchCity(input.city);

  if (input.campus && !campusMatch) {
    return {
      allowed: false,
      code: 'auth/launch-market-restricted',
      message: LAUNCH_MARKET_SIGNUP_MESSAGE,
    } as const;
  }

  if (!campusMatch && !cityMatch) {
    return {
      allowed: false,
      code: 'auth/launch-market-restricted',
      message: LAUNCH_MARKET_SIGNUP_MESSAGE,
    } as const;
  }

  if (input.deviceLocation && !isWithinLaunchMarket(input.deviceLocation)) {
    return {
      allowed: false,
      code: 'auth/outside-launch-market',
      message: `${LAUNCH_MARKET_SIGNUP_MESSAGE} We will open more markets soon.`,
    } as const;
  }

  return {
    allowed: true,
    code: null,
    message: null,
    city: cityMatch?.name ?? campusMatch?.city ?? input.city ?? null,
    campus: campusMatch?.name ?? input.campus ?? null,
  } as const;
}

export function getLaunchMarketSummary() {
  return dedupe([
    ...LAUNCH_CITIES.map((item) => item.name),
    ...LAUNCH_CAMPUSES.map((item) => item.name),
  ]);
}
