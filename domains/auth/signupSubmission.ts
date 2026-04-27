import { getLaunchMarketLocationRequiredMessage, getLaunchMarketSignupMessage, validateLaunchMarketSignup } from '@/services/launchMarkets';
import type { DiscoveryIntent } from '@/services/discoveryIntents';
import type { SimpleLocation } from '@/services/location';
import type { SignupHandleAvailability } from './signupValidation';

type AmbiancePreference =
  | 'cozy'
  | 'modern'
  | 'rustic'
  | 'bright'
  | 'intimate'
  | 'energetic'
  | null;

type SignupRegisterPreferences = {
  coffeeIntents?: DiscoveryIntent[];
  ambiancePreference?: AmbiancePreference;
};

type SignupRegisterFn = (
  email: string,
  password: string,
  name?: string,
  city?: string,
  handle?: string,
  campusType?: 'campus' | 'city',
  campus?: string,
  phone?: string,
  preferences?: SignupRegisterPreferences,
) => Promise<void>;

export type SignupSubmissionInput = {
  email: string;
  password: string;
  name: string;
  city: string;
  campus: string;
  normalizedHandle: string;
  normalizedPhone: string | null;
  coffeeIntentsPref: DiscoveryIntent[];
  ambiancePreference: AmbiancePreference;
  isEmailValid: boolean;
  isPasswordValid: boolean;
  passwordsMatch: boolean;
  isHandleValid: boolean;
  isCityValid: boolean;
  handleAvailability: SignupHandleAvailability;
  canCheckHandleAvailability: boolean;
};

export type SignupSubmissionDeps = {
  findUserByHandle: (handle: string) => Promise<any>;
  requestForegroundLocationWithStatus: (options?: {
    ignoreCache?: boolean;
    preferFresh?: boolean;
  }) => Promise<{ coords: SimpleLocation | null }>;
  register: SignupRegisterFn;
  log?: (label: string, value: unknown) => void;
};

export type SignupSubmissionResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      authError: string;
    };

export function mapSignupRegistrationError(error: any) {
  const code = String(error?.code || '');
  if (code === 'auth/email-already-in-use') return 'That email is already in use.';
  if (code === 'auth/invalid-email') return 'Enter a valid email address.';
  if (code === 'auth/weak-password') return 'Password must be at least 6 characters.';
  if (code === 'auth/username-taken') return 'That username is taken. Pick a different one.';
  if (code === 'auth/username-check-failed') return 'Unable to verify that username right now. Please try again.';
  if (code === 'verification/custom-mailer-required') {
    return 'We could not send your verification email. Please try again.';
  }
  if (code === 'auth/launch-market-restricted' || code === 'auth/outside-launch-market') {
    return error?.message || getLaunchMarketSignupMessage();
  }
  if (code === 'network-request-failed' || code === 'functions/unavailable' || code === 'unavailable') {
    return 'Unable to create your account right now. Check your connection and try again.';
  }
  return error?.message ? `Unable to register: ${String(error.message)}` : 'Unable to register right now.';
}

export async function withAsyncTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out. Check your network or Firebase setup.`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function submitSignupForm(
  input: SignupSubmissionInput,
  deps: SignupSubmissionDeps,
): Promise<SignupSubmissionResult> {
  if (!input.isEmailValid) return { ok: false, authError: 'Enter a valid email address.' };
  if (!input.isPasswordValid) return { ok: false, authError: 'Password must be at least 6 characters.' };
  if (!input.passwordsMatch) return { ok: false, authError: 'Passwords do not match.' };
  if (!input.isHandleValid) {
    return {
      ok: false,
      authError: 'Choose a username (3-20 chars, letters/numbers/underscore/period).',
    };
  }
  if (input.handleAvailability === 'taken') {
    return { ok: false, authError: 'That username is taken - pick a different one.' };
  }
  if (input.handleAvailability === 'checking') {
    return { ok: false, authError: 'Still checking username - try again in a moment.' };
  }
  if (!input.isCityValid) {
    return { ok: false, authError: 'Select your city.' };
  }

  try {
    if (input.canCheckHandleAvailability) {
      try {
        const existing = await withAsyncTimeout(
          deps.findUserByHandle(input.normalizedHandle),
          6000,
          'Checking handle',
        );
        if (existing) {
          return { ok: false, authError: 'That username is taken.' };
        }
      } catch (error) {
        deps.log?.('handle check skipped', error);
      }
    }

    const locationGate = await deps.requestForegroundLocationWithStatus({
      ignoreCache: true,
      preferFresh: true,
    });
    if (!locationGate.coords) {
      return { ok: false, authError: getLaunchMarketLocationRequiredMessage() };
    }

    const launchMarketValidation = validateLaunchMarketSignup({
      city: input.city,
      campus: input.campus,
      deviceLocation: locationGate.coords,
    });
    if (!launchMarketValidation.allowed) {
      return { ok: false, authError: launchMarketValidation.message };
    }

    const resolvedCity = launchMarketValidation.city || input.city;
    const resolvedCampus = launchMarketValidation.campus || input.campus;
    const campusType = resolvedCampus ? 'campus' : 'city';

    await deps.register(
      input.email.trim(),
      input.password,
      input.name || undefined,
      resolvedCity || undefined,
      input.normalizedHandle,
      campusType,
      resolvedCampus || undefined,
      input.normalizedPhone || undefined,
      {
        coffeeIntents: input.coffeeIntentsPref.slice(0, 3),
        ambiancePreference: input.ambiancePreference,
      },
    );

    return { ok: true };
  } catch (error) {
    deps.log?.('register error', error);
    return { ok: false, authError: mapSignupRegistrationError(error) };
  }
}
