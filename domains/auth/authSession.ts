import type { DiscoveryIntent } from '@/services/discoveryIntents';

type AuthAmbiancePreference =
  | 'cozy'
  | 'modern'
  | 'rustic'
  | 'bright'
  | 'intimate'
  | 'energetic'
  | null;

type AuthSourceUser = {
  uid: string;
  email?: string | null;
  emailVerified?: boolean | null;
  phoneNumber?: string | null;
  photoURL?: string | null;
};

export type AuthSessionUser = {
  id: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  handle?: string;
  city?: string;
  campus?: string;
  campusOrCity?: string;
  campusType?: 'campus' | 'city';
  phone?: string;
  photoUrl?: string | null;
  coffeeIntents?: DiscoveryIntent[];
  ambiancePreference?: AuthAmbiancePreference;
};

export function normalizeAuthLocationFields(data: any) {
  const city =
    data?.city ||
    (data?.campusType === 'city' ? data?.campusOrCity : undefined) ||
    (!data?.campusType && data?.campusOrCity ? data.campusOrCity : undefined);
  const campus = data?.campus || (data?.campusType === 'campus' ? data?.campusOrCity : undefined);
  return { city, campus, campusOrCity: data?.campusOrCity, campusType: data?.campusType };
}

export async function loadRemoteAuthProfileState(db: any, userId: string) {
  const [publicDoc, privateDoc] = await Promise.all([
    db.collection('publicProfiles').doc(userId).get(),
    db.collection('userPrivate').doc(userId).get(),
  ]);
  const legacyDoc =
    publicDoc.exists && privateDoc.exists
      ? null
      : await db.collection('users').doc(userId).get();
  const publicData = publicDoc.exists ? publicDoc.data() || {} : {};
  const privateData = {
    ...(legacyDoc?.exists ? legacyDoc.data() || {} : {}),
    ...(privateDoc.exists ? privateDoc.data() || {} : {}),
  };
  return { publicData, privateData };
}

export function buildAuthUserFromCached(authUser: AuthSourceUser, cached: any): AuthSessionUser {
  const cachedLoc = normalizeAuthLocationFields(cached || {});
  return {
    id: authUser.uid,
    email: authUser.email || undefined,
    emailVerified: !!authUser.emailVerified,
    name: cached?.name,
    handle: cached?.handle,
    city: cachedLoc.city ?? cached?.city,
    campus: cachedLoc.campus ?? cached?.campus,
    campusOrCity: cachedLoc.campusOrCity ?? cached?.campusOrCity,
    campusType: cachedLoc.campusType ?? cached?.campusType,
    phone: cached?.phone || authUser.phoneNumber || undefined,
    photoUrl: cached?.photoUrl || authUser.photoURL || null,
    coffeeIntents: Array.isArray(cached?.coffeeIntents) ? cached.coffeeIntents : [],
    ambiancePreference: cached?.ambiancePreference ?? null,
  };
}

export function buildAuthUserFromRemote(input: {
  authUser: AuthSourceUser;
  cached: any;
  publicData: any;
  privateData: any;
}): AuthSessionUser {
  const { authUser, cached, publicData, privateData } = input;
  const loc = normalizeAuthLocationFields({ ...(cached || {}), ...(publicData || {}) });
  return {
    id: authUser.uid,
    email: authUser.email || undefined,
    emailVerified: !!authUser.emailVerified,
    name: publicData?.name ?? cached?.name,
    handle: publicData?.handle ?? cached?.handle,
    city: loc.city ?? cached?.city,
    campus: loc.campus ?? cached?.campus,
    campusOrCity: loc.campusOrCity ?? cached?.campusOrCity,
    campusType: loc.campusType ?? cached?.campusType,
    phone: privateData?.phone || authUser.phoneNumber || cached?.phone || undefined,
    photoUrl: publicData?.photoUrl || publicData?.avatarUrl || cached?.photoUrl || authUser.photoURL || null,
    coffeeIntents: Array.isArray(publicData?.coffeeIntents)
      ? publicData.coffeeIntents
      : Array.isArray(cached?.coffeeIntents)
        ? cached.coffeeIntents
        : [],
    ambiancePreference: publicData?.ambiancePreference ?? cached?.ambiancePreference ?? null,
  };
}

export function buildAuthProfileBackfill(input: {
  cached: any;
  publicData: any;
  privateData: any;
  email?: string | null;
}) {
  const { cached, publicData, privateData, email } = input;
  if (!cached) return {};
  const backfill: Record<string, any> = {};
  if (!publicData?.name && cached?.name) backfill.name = cached.name;
  if (!publicData?.handle && cached?.handle) backfill.handle = cached.handle;
  if (!publicData?.city && cached?.city) backfill.city = cached.city;
  if (!publicData?.campus && cached?.campus) backfill.campus = cached.campus;
  if (!publicData?.campusOrCity && cached?.campusOrCity) backfill.campusOrCity = cached.campusOrCity;
  if (!publicData?.campusType && cached?.campusType) backfill.campusType = cached.campusType;
  if (!privateData?.phone && cached?.phone) backfill.phone = cached.phone;
  if (!publicData?.photoUrl && cached?.photoUrl) backfill.photoUrl = cached.photoUrl;
  if (!Array.isArray(publicData?.coffeeIntents) && Array.isArray(cached?.coffeeIntents)) {
    backfill.coffeeIntents = cached.coffeeIntents.slice(0, 3);
  }
  if (publicData?.ambiancePreference === undefined && cached?.ambiancePreference) {
    backfill.ambiancePreference = cached.ambiancePreference;
  }
  if (!privateData?.email && email) backfill.email = email;
  return backfill;
}
