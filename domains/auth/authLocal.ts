import type { DiscoveryIntent } from '@/services/discoveryIntents';

type AmbiancePreference =
  | 'cozy'
  | 'modern'
  | 'rustic'
  | 'bright'
  | 'intimate'
  | 'energetic'
  | null;

export type AuthStorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

export type LocalAuthSessionUser = {
  id: string;
  email?: string;
  name?: string;
  city?: string;
  campus?: string;
  campusOrCity?: string;
  campusType?: 'campus' | 'city';
  handle?: string;
  phone?: string;
  photoUrl?: string | null;
  emailVerified?: boolean;
  coffeeIntents?: DiscoveryIntent[];
  ambiancePreference?: AmbiancePreference;
};

type BuildLocalAuthUserInput = {
  id: string;
  email?: string;
  name?: string;
  city?: string;
  campus?: string;
  campusType?: 'campus' | 'city';
  handle?: string;
  phone?: string;
  photoUrl?: string | null;
  emailVerified?: boolean;
  preferences?: {
    coffeeIntents?: DiscoveryIntent[];
    ambiancePreference?: AmbiancePreference;
  };
};

const LOCAL_AUTH_SESSION_KEY = 'spot_user_v1';
const LOCAL_AUTH_USER_LIST_KEY = 'spot_users_v1';

function getStorage(storage?: AuthStorageLike | null) {
  if (storage) return storage;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {}
  return null;
}

export function buildLocalAuthSessionUser(input: BuildLocalAuthUserInput): LocalAuthSessionUser {
  const campusType = input.campusType || 'city';
  const campusOrCity = campusType === 'campus' ? input.campus : input.city;
  return {
    id: input.id,
    email: input.email,
    name: input.name,
    city: input.city,
    campus: input.campus,
    campusOrCity: campusOrCity || undefined,
    campusType,
    handle: input.handle,
    phone: input.phone,
    photoUrl: input.photoUrl ?? null,
    emailVerified: input.emailVerified ?? false,
    coffeeIntents: Array.isArray(input.preferences?.coffeeIntents)
      ? input.preferences?.coffeeIntents.slice(0, 3)
      : [],
    ambiancePreference: input.preferences?.ambiancePreference ?? null,
  };
}

export function createLocalDemoAuthSession(input?: {
  email?: string;
  name?: string;
}): LocalAuthSessionUser {
  const ts = Date.now();
  return buildLocalAuthSessionUser({
    id: `local-${ts}`,
    email: (input?.email && input.email.trim()) || `demo+${ts}@local`,
    name: input?.name || 'Demo User',
    city: 'Houston',
    campusType: 'city',
    handle: `demo${ts.toString().slice(-4)}`,
    emailVerified: true,
  });
}

export function loadLocalAuthSession(storage?: AuthStorageLike | null): LocalAuthSessionUser | null {
  const target = getStorage(storage);
  if (!target) return null;
  try {
    const raw = target.getItem(LOCAL_AUTH_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function persistLocalAuthSession(
  user: LocalAuthSessionUser,
  options?: {
    appendToUserList?: boolean;
    storage?: AuthStorageLike | null;
  },
) {
  const target = getStorage(options?.storage);
  if (!target) return false;

  try {
    target.setItem(LOCAL_AUTH_SESSION_KEY, JSON.stringify(user));
    if (options?.appendToUserList) {
      try {
        const rawList = target.getItem(LOCAL_AUTH_USER_LIST_KEY);
        const list = rawList ? JSON.parse(rawList) : [];
        list.push({
          id: user.id,
          email: user.email,
          name: user.name,
          handle: user.handle,
          city: user.city,
          campus: user.campus,
          campusOrCity: user.campusOrCity,
          campusType: user.campusType,
          phone: user.phone,
          createdAt: Date.now(),
        });
        target.setItem(LOCAL_AUTH_USER_LIST_KEY, JSON.stringify(list));
      } catch {}
    }
    return true;
  } catch {
    return false;
  }
}

export function clearLocalAuthSession(storage?: AuthStorageLike | null) {
  const target = getStorage(storage);
  if (!target) return false;
  try {
    target.removeItem(LOCAL_AUTH_SESSION_KEY);
    return true;
  } catch {
    return false;
  }
}

export function findLocalAuthSessionByEmail(
  email: string,
  storage?: AuthStorageLike | null,
): LocalAuthSessionUser | null {
  const session = loadLocalAuthSession(storage);
  if (!session?.email) return null;
  return session.email.trim().toLowerCase() === email.trim().toLowerCase() ? session : null;
}
