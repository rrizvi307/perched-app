import { useAuth } from '@/contexts/AuthContext';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getOnboardingProfile } from '@/storage/local';
import { reverseGeocodeCity, searchLocations } from '@/services/googleMaps';
import { getForegroundLocationIfPermitted, requestForegroundLocationWithStatus } from '@/services/location';
import { getAndClearReferralCode } from '@/services/deepLinking';
import { trackReferralSignup } from '@/services/shareInvite';
import { findUserByHandle } from '@/services/repositories/profileRepository';
import { getCurrentFirebaseUser, isFirebaseConfigured } from '@/services/repositories/authRepository';
import { devLog } from '@/services/logger';
import type { DiscoveryIntent } from '@/services/discoveryIntents';
import {
  buildSignupLaunchMarketHint,
  buildSignupLocationResults,
  hydrateSignupFromOnboardingProfile,
  resolveDetectedLaunchCity,
  resolveSignupCampusSelection,
  resolveSignupCitySelection,
} from './signupEligibility';
import { deriveSignupFormState, type SignupHandleAvailability } from './signupValidation';
import { submitSignupForm } from './signupSubmission';

type AmbiancePreference =
  | 'cozy'
  | 'modern'
  | 'rustic'
  | 'bright'
  | 'intimate'
  | 'energetic'
  | null;

export function useSignupController() {
  const { register, user } = useAuth();
  const fbAvailable = isFirebaseConfigured();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [handle, setHandle] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('Houston');
  const [campus, setCampus] = useState('');
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [launchMarketNotice, setLaunchMarketNotice] = useState<string | null>(null);
  const [handleAvailability, setHandleAvailability] = useState<SignupHandleAvailability>('idle');
  const [cityQuery, setCityQuery] = useState('Houston');
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const [cityOptions, setCityOptions] = useState<string[]>([]);
  const [cityLoading, setCityLoading] = useState(false);
  const [detectingCity, setDetectingCity] = useState(false);
  const [campusQuery, setCampusQuery] = useState('');
  const [campusDropdownOpen, setCampusDropdownOpen] = useState(false);
  const [campusOptions, setCampusOptions] = useState<string[]>([]);
  const [campusLoading, setCampusLoading] = useState(false);
  const [geoBias, setGeoBias] = useState<{ lat: number; lng: number } | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [coffeeIntentsPref, setCoffeeIntentsPref] = useState<DiscoveryIntent[]>([]);
  const [ambiancePreference, setAmbiancePreference] = useState<AmbiancePreference>(null);

  const canCheckHandleAvailability = !!getCurrentFirebaseUser()?.uid;
  const referralTrackedRef = useRef(false);

  const formState = useMemo(
    () =>
      deriveSignupFormState({
        email,
        password,
        passwordConfirm,
        handle,
        phone,
        city,
        loading,
        handleAvailability,
      }),
    [city, email, handle, handleAvailability, loading, password, passwordConfirm, phone],
  );

  const launchMarketHint = useMemo(() => buildSignupLaunchMarketHint(), []);

  const applyDetectedCity = useCallback(async (coords: { lat: number; lng: number }) => {
    const detected = await reverseGeocodeCity(coords.lat, coords.lng);
    if (!detected) return;
    const resolved = resolveDetectedLaunchCity(detected);
    setLaunchMarketNotice(resolved.launchMarketNotice);
    setCity(resolved.city);
    setCityQuery(resolved.cityQuery);
    setCityDropdownOpen(false);
  }, []);

  const onHandleChange = useCallback((value: string) => {
    setHandle(value.replace(/^@+/, '').toLowerCase());
  }, []);

  const onCityChange = useCallback((value: string) => {
    setCityQuery(value);
    setCityDropdownOpen(true);
    setCity('');
    setLaunchMarketNotice(null);
  }, []);

  const onCityFocus = useCallback(() => {
    if (cityQuery.trim()) {
      setCityDropdownOpen(true);
    }
  }, [cityQuery]);

  const selectCityOption = useCallback((option: string) => {
    const resolvedCity = resolveSignupCitySelection(option);
    setCity(resolvedCity);
    setCityQuery(resolvedCity);
    setCityDropdownOpen(false);
    setLaunchMarketNotice(null);
  }, []);

  const onCampusChange = useCallback((value: string) => {
    setCampusQuery(value);
    setCampusDropdownOpen(true);
    setCampus('');
    setLaunchMarketNotice(null);
  }, []);

  const onCampusFocus = useCallback(() => {
    if (campusQuery.trim()) {
      setCampusDropdownOpen(true);
    }
  }, [campusQuery]);

  const selectCampusOption = useCallback((option: string) => {
    const resolved = resolveSignupCampusSelection(option);
    setCampus(resolved.campus);
    setCampusQuery(resolved.campus);
    if (resolved.city) {
      setCity(resolved.city);
      setCityQuery(resolved.city);
    }
    setCampusDropdownOpen(false);
    setLaunchMarketNotice(null);
  }, []);

  const applyCurrentCity = useCallback(async () => {
    if (!geoBias) return;
    setDetectingCity(true);
    try {
      await applyDetectedCity(geoBias);
    } finally {
      setDetectingCity(false);
    }
  }, [applyDetectedCity, geoBias]);

  const submit = useCallback(async () => {
    setAuthError(null);
    setLoading(true);
    try {
      const result = await submitSignupForm(
        {
          email,
          password,
          name,
          city,
          campus,
          normalizedHandle: formState.normalizedHandle,
          normalizedPhone: formState.normalizedPhone,
          coffeeIntentsPref,
          ambiancePreference,
          isEmailValid: formState.isEmailValid,
          isPasswordValid: formState.isPasswordValid,
          passwordsMatch: formState.passwordsMatch,
          isHandleValid: formState.isHandleValid,
          isCityValid: formState.isCityValid,
          handleAvailability,
          canCheckHandleAvailability,
        },
        {
          findUserByHandle,
          requestForegroundLocationWithStatus,
          register,
          log: devLog,
        },
      );
      if (!result.ok) {
        setAuthError(result.authError);
      }
    } finally {
      setLoading(false);
    }
  }, [
    ambiancePreference,
    canCheckHandleAvailability,
    campus,
    city,
    coffeeIntentsPref,
    email,
    formState.isCityValid,
    formState.isEmailValid,
    formState.isHandleValid,
    formState.isPasswordValid,
    formState.normalizedHandle,
    formState.normalizedPhone,
    formState.passwordsMatch,
    handleAvailability,
    name,
    password,
    register,
  ]);

  useEffect(() => {
    void (async () => {
      try {
        const profile = await getOnboardingProfile();
        const hydrated = hydrateSignupFromOnboardingProfile(profile);
        if (hydrated.name) setName(hydrated.name);
        if (hydrated.city) setCity(hydrated.city);
        if (hydrated.cityQuery) setCityQuery(hydrated.cityQuery);
        if (hydrated.campus) setCampus(hydrated.campus);
        if (hydrated.campusQuery) setCampusQuery(hydrated.campusQuery);
        if (Array.isArray(hydrated.coffeeIntentsPref)) setCoffeeIntentsPref(hydrated.coffeeIntentsPref);
        if (hydrated.ambiancePreference !== undefined) setAmbiancePreference(hydrated.ambiancePreference);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      const pos = await getForegroundLocationIfPermitted();
      if (pos) setGeoBias(pos);
    })().catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!geoBias || cityDropdownOpen) return;
    setDetectingCity(true);
    void (async () => {
      await applyDetectedCity(geoBias);
    })()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setDetectingCity(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyDetectedCity, cityDropdownOpen, geoBias]);

  useEffect(() => {
    void (async () => {
      const code = await getAndClearReferralCode();
      if (code) {
        setReferralCode(code);
        devLog('Referral code:', code);
      }
    })();
  }, []);

  useEffect(() => {
    if (user?.id && referralCode && !referralTrackedRef.current) {
      referralTrackedRef.current = true;
      void trackReferralSignup(user.id, referralCode);
    }
  }, [user?.id, referralCode]);

  useEffect(() => {
    let alive = true;
    if (!cityDropdownOpen || !cityQuery.trim()) {
      setCityOptions([]);
      setCityLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setCityLoading(true);
      try {
        const remote = await searchLocations(cityQuery, 'city', 8, geoBias || undefined);
        if (alive) {
          setCityOptions(buildSignupLocationResults('city', cityQuery, remote.map((result) => result.name)));
        }
      } catch {
        if (alive) {
          setCityOptions(buildSignupLocationResults('city', cityQuery, []));
        }
      } finally {
        if (alive) setCityLoading(false);
      }
    }, 250);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [cityDropdownOpen, cityQuery, geoBias]);

  useEffect(() => {
    let alive = true;
    if (!campusDropdownOpen || !campusQuery.trim()) {
      setCampusOptions([]);
      setCampusLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setCampusLoading(true);
      try {
        const remote = await searchLocations(campusQuery, 'campus', 8, geoBias || undefined);
        if (alive) {
          setCampusOptions(buildSignupLocationResults('campus', campusQuery, remote.map((result) => result.name)));
        }
      } catch {
        if (alive) {
          setCampusOptions(buildSignupLocationResults('campus', campusQuery, []));
        }
      } finally {
        if (alive) setCampusLoading(false);
      }
    }, 250);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [campusDropdownOpen, campusQuery, geoBias]);

  useEffect(() => {
    let cancelled = false;
    if (!formState.normalizedHandle) {
      setHandleAvailability('idle');
      return () => {
        cancelled = true;
      };
    }
    if (!formState.isHandleValid) {
      setHandleAvailability('invalid');
      return () => {
        cancelled = true;
      };
    }
    if (!canCheckHandleAvailability) {
      setHandleAvailability('idle');
      return () => {
        cancelled = true;
      };
    }

    setHandleAvailability('checking');
    const id = setTimeout(async () => {
      try {
        const existing = await findUserByHandle(formState.normalizedHandle);
        if (cancelled) return;
        setHandleAvailability(existing ? 'taken' : 'available');
      } catch {
        if (!cancelled) setHandleAvailability('idle');
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [canCheckHandleAvailability, formState.isHandleValid, formState.normalizedHandle]);

  return {
    ambiancePreference,
    authError,
    canCheckHandleAvailability,
    campus,
    campusDropdownOpen,
    campusLoading,
    campusOptions,
    campusQuery,
    city,
    cityDropdownOpen,
    cityLoading,
    cityOptions,
    cityQuery,
    detectingCity,
    email,
    fbAvailable,
    geoBias,
    handle,
    handleAvailability,
    launchMarketHint,
    launchMarketNotice,
    loading,
    name,
    onCampusChange,
    onCampusFocus,
    onCityChange,
    onCityFocus,
    onHandleChange,
    password,
    passwordConfirm,
    phone,
    selectCampusOption,
    selectCityOption,
    setCampusDropdownOpen,
    setEmail,
    setName,
    setPassword,
    setPasswordConfirm,
    setPhone,
    submit,
    applyCurrentCity,
    ...formState,
  };
}
