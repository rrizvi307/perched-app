import type { DiscoveryIntent } from '@/services/discoveryIntents';
import { validateLaunchMarketSignup } from '@/services/launchMarkets';
import {
  buildLocalAuthSessionUser,
  persistLocalAuthSession,
  type AuthStorageLike,
  type LocalAuthSessionUser,
} from './authLocal';

type AmbiancePreference =
  | 'cozy'
  | 'modern'
  | 'rustic'
  | 'bright'
  | 'intimate'
  | 'energetic'
  | null;

type RegisterPreferences = {
  coffeeIntents?: DiscoveryIntent[];
  ambiancePreference?: AmbiancePreference;
};

type RegisterInput = {
  email: string;
  password: string;
  name?: string;
  city?: string;
  handle?: string;
  campusType?: 'campus' | 'city';
  campus?: string;
  phone?: string;
  preferences?: RegisterPreferences;
};

type RegisterDeps = {
  isFirebaseConfigured: () => boolean;
  createAccountWithEmail: (input: any) => Promise<{ uid: string; email?: string }>;
  logEvent: (
    event: string,
    userId?: string,
    metadata?: Record<string, unknown>,
  ) => Promise<void> | void;
  storage?: AuthStorageLike | null;
};

export async function registerAuthAccount(
  input: RegisterInput,
  deps: RegisterDeps,
): Promise<LocalAuthSessionUser> {
  const launchMarketValidation = validateLaunchMarketSignup({
    city: input.city,
    campus: input.campus,
  });
  if (!launchMarketValidation.allowed) {
    const error = new Error(launchMarketValidation.message);
    (error as any).code = launchMarketValidation.code;
    throw error;
  }

  if (!deps.isFirebaseConfigured()) {
    const localUser = buildLocalAuthSessionUser({
      id: `local-${Date.now()}`,
      email: input.email,
      name: input.name,
      city: input.city,
      campus: input.campus,
      campusType: input.campusType,
      handle: input.handle,
      phone: input.phone,
      emailVerified: true,
      preferences: input.preferences,
    });
    const persisted = persistLocalAuthSession(localUser, {
      appendToUserList: true,
      storage: deps.storage,
    });
    if (!persisted) {
      throw new Error('Firebase not configured');
    }
    await deps.logEvent('user_registered_local', localUser.id, {
      city: input.city,
      campus: input.campus,
      handle: input.handle,
    });
    return localUser;
  }

  const created = await deps.createAccountWithEmail({
    email: input.email,
    password: input.password,
    name: input.name,
    city: input.city,
    campus: input.campus,
    campusOrCity: (input.campusType || 'city') === 'campus' ? input.campus : input.city,
    handle: input.handle,
    campusType: input.campusType || 'city',
    phone: input.phone,
    coffeeIntents: Array.isArray(input.preferences?.coffeeIntents)
      ? input.preferences?.coffeeIntents.slice(0, 3)
      : [],
    ambiancePreference: input.preferences?.ambiancePreference ?? null,
  } as any);

  const nextUser = buildLocalAuthSessionUser({
    id: created.uid,
    email: created.email || input.email,
    name: input.name,
    city: input.city,
    campus: input.campus,
    campusType: input.campusType,
    handle: input.handle,
    phone: input.phone,
    emailVerified: false,
    preferences: input.preferences,
  });
  await deps.logEvent('user_registered', created.uid, {
    city: input.city,
    campus: input.campus,
    handle: input.handle,
  });
  return nextUser;
}
