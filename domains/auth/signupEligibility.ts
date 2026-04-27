import {
  findLaunchCampus,
  findLaunchCity,
  getLaunchLocationOptions,
  getLaunchMarketSignupMessage,
  isLaunchCity,
} from '@/services/launchMarkets';
import type { DiscoveryIntent } from '@/services/discoveryIntents';

type AmbiancePreference =
  | 'cozy'
  | 'modern'
  | 'rustic'
  | 'bright'
  | 'intimate'
  | 'energetic'
  | null;

function isAmbiancePreference(value: unknown): value is NonNullable<AmbiancePreference> {
  return (
    value === 'cozy' ||
    value === 'modern' ||
    value === 'rustic' ||
    value === 'bright' ||
    value === 'intimate' ||
    value === 'energetic'
  );
}

export function buildSignupLaunchMarketHint() {
  return `${getLaunchMarketSignupMessage()} We will ask for your location before creating your account so we can confirm the launch market.`;
}

export function resolveDetectedLaunchCity(detectedCity: string | null | undefined) {
  if (!detectedCity) {
    return {
      city: '',
      cityQuery: '',
      launchMarketNotice: null,
    };
  }

  if (!isLaunchCity(detectedCity)) {
    return {
      city: '',
      cityQuery: detectedCity,
      launchMarketNotice: `${getLaunchMarketSignupMessage()} We will open more markets soon.`,
    };
  }

  const matchedCity = findLaunchCity(detectedCity);
  const resolvedCity = matchedCity?.name || detectedCity;
  return {
    city: resolvedCity,
    cityQuery: resolvedCity,
    launchMarketNotice: null,
  };
}

export function buildSignupLocationResults(
  type: 'city' | 'campus',
  query: string,
  remoteNames: string[],
) {
  const fallback = getLaunchLocationOptions(type, query).slice(0, 8);

  if (!remoteNames.length) {
    return fallback;
  }

  if (type === 'city') {
    const names = Array.from(
      new Set(remoteNames.filter((name) => isLaunchCity(name)).map((name) => findLaunchCity(name)?.name || name)),
    );
    return names.length ? names : fallback;
  }

  const names = Array.from(
    new Set(
      remoteNames
        .map((name) => findLaunchCampus(name))
        .filter(Boolean)
        .map((campus) => campus?.name as string),
    ),
  );
  return names.length ? names : fallback;
}

export function resolveSignupCitySelection(option: string) {
  return findLaunchCity(option)?.name || option;
}

export function resolveSignupCampusSelection(option: string) {
  const matchedCampus = findLaunchCampus(option);
  return {
    campus: matchedCampus?.name || option,
    city: matchedCampus?.city || null,
  };
}

export function hydrateSignupFromOnboardingProfile(profile: Record<string, any>) {
  const next: {
    name?: string;
    city?: string;
    cityQuery?: string;
    campus?: string;
    campusQuery?: string;
    coffeeIntentsPref?: DiscoveryIntent[];
    ambiancePreference?: AmbiancePreference;
  } = {};

  if (typeof profile?.name === 'string' && profile.name.trim().length) {
    next.name = profile.name;
  }

  const matchedProfileCity = findLaunchCity(
    profile?.city || (profile?.campusType === 'city' ? profile?.campusOrCity : undefined),
  );
  if (matchedProfileCity) {
    next.city = matchedProfileCity.name;
    next.cityQuery = matchedProfileCity.name;
  }

  const matchedProfileCampus = findLaunchCampus(
    profile?.campus || (profile?.campusType === 'campus' ? profile?.campusOrCity : undefined),
  );
  if (matchedProfileCampus) {
    next.campus = matchedProfileCampus.name;
    next.campusQuery = matchedProfileCampus.name;
    if (!matchedProfileCity) {
      next.city = matchedProfileCampus.city;
      next.cityQuery = matchedProfileCampus.city;
    }
  }

  if (Array.isArray(profile?.coffeeIntents)) {
    next.coffeeIntentsPref = profile.coffeeIntents.slice(0, 3);
  }

  if (isAmbiancePreference(profile?.ambiancePreference)) {
    next.ambiancePreference = profile.ambiancePreference;
  }

  return next;
}
