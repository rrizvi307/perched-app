import { ThemedView } from '@/components/themed-view';
import { Atmosphere } from '@/components/ui/atmosphere';
import { tokens } from '@/constants/tokens';
import { Body, H1, Label } from '@/components/ui/typography';
import { useAuth } from '@/contexts/AuthContext';
import { useKeyboardHeight, useKeyboardVisible } from '@/hooks/use-keyboard-visible';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getLocationOptions } from '@/constants/locations';
import { reverseGeocodeCity, searchLocations } from '@/services/googleMaps';
import Logo from '@/components/logo';
import {
  findUserByHandle,
  getCurrentFirebaseUser,
  isFirebaseConfigured,
} from '@/services/firebaseClient';
import { devLog } from '@/services/logger';
import { getOnboardingProfile } from '@/storage/local';
import { withAlpha } from '@/utils/colors';
import { normalizePhone } from '@/utils/phone';
import { getForegroundLocationIfPermitted } from '@/services/location';
import { getAndClearReferralCode } from '@/services/deepLinking';
import { trackReferralSignup } from '@/services/shareInvite';
import type { DiscoveryIntent } from '@/services/discoveryIntents';
import { useEffect, useRef, useState } from 'react';
import { useRootNavigationState, useRouter } from 'expo-router';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SignUp() {
  const insets = useSafeAreaInsets();
  // iOS can force the strong-password sheet over these fields during signup.
  const manualPasswordEntryProps =
    Platform.OS === 'ios'
      ? ({ textContentType: 'oneTimeCode', autoComplete: 'off' } as const)
      : ({ autoComplete: 'off', importantForAutofill: 'no' } as const);

  // Account
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  // Profile
  const [handle, setHandle] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('Houston');
  const [campus, setCampus] = useState('');

  // Submission state
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [handleAvailability, setHandleAvailability] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle');

  // City search
  const [cityQuery, setCityQuery] = useState('Houston');
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const [cityResults, setCityResults] = useState<string[]>([]);
  const [cityLoading, setCityLoading] = useState(false);
  const [detectingCity, setDetectingCity] = useState(false);

  // Campus search
  const [campusQuery, setCampusQuery] = useState('');
  const [campusDropdownOpen, setCampusDropdownOpen] = useState(false);
  const [campusResults, setCampusResults] = useState<string[]>([]);
  const [campusLoading, setCampusLoading] = useState(false);

  const [geoBias, setGeoBias] = useState<{ lat: number; lng: number } | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [coffeeIntentsPref, setCoffeeIntentsPref] = useState<DiscoveryIntent[]>([]);
  const [ambiancePreference, setAmbiancePreference] = useState<
    'cozy' | 'modern' | 'rustic' | 'bright' | 'intimate' | 'energetic' | null
  >(null);

  const { register, user } = useAuth();
  const fbAvailable = isFirebaseConfigured();
  const color = useThemeColor({}, 'text');
  const primary = useThemeColor({}, 'primary');
  const accent = useThemeColor({}, 'accent');
  const success = useThemeColor({}, 'success');
  const danger = useThemeColor({}, 'danger');
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');
  const muted = useThemeColor({}, 'muted');
  const fieldLabelStyle = { color, opacity: 1, marginBottom: 6 } as const;
  const highlight = withAlpha(primary, 0.1);
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const scrollRef = useRef<ScrollView>(null);

  // ── Validation ──────────────────────────────────────────────────────────────
  function validateEmail(e: string) {
    return /\S+@\S+\.\S+/.test(e);
  }
  const isEmailValid = validateEmail(email.trim());
  const isPasswordValid = password.length >= 6;
  const passwordsMatch = password === passwordConfirm;
  const normalizedPhone = phone.trim() ? normalizePhone(phone.trim()) : null;
  const normalizedHandle = handle.trim().toLowerCase().replace(/^@+/, '');
  const isHandleValid =
    !!normalizedHandle &&
    normalizedHandle.length >= 3 &&
    /^[a-z0-9_.]{3,20}$/.test(normalizedHandle);
  const isCityValid = !!city;
  const handleReady =
    handleAvailability !== 'checking' &&
    handleAvailability !== 'taken' &&
    handleAvailability !== 'invalid';
  const canCheckHandleAvailability = !!getCurrentFirebaseUser()?.uid;
  const canSubmit =
    isEmailValid &&
    isPasswordValid &&
    passwordsMatch &&
    isHandleValid &&
    isCityValid &&
    handleReady &&
    !loading;

  const { height } = useWindowDimensions();
  const keyboardVisible = useKeyboardVisible();
  const keyboardHeight = useKeyboardHeight();
  const compactHeader = keyboardVisible && Platform.OS !== 'web';
  const logoSize = compactHeader ? 44 : height < 740 ? 56 : 72;
  const titleSize = compactHeader ? 30 : height < 740 ? 36 : undefined;
  const extraScrollPad = Platform.OS === 'ios' ? Math.max(28, keyboardHeight + 28) : 28;

  function mapRegistrationError(error: any) {
    const code = String(error?.code || '');
    if (code === 'auth/email-already-in-use') return 'That email is already in use.';
    if (code === 'auth/invalid-email') return 'Enter a valid email address.';
    if (code === 'auth/weak-password') return 'Password must be at least 6 characters.';
    if (code === 'auth/username-taken') return 'That username is taken. Pick a different one.';
    if (code === 'auth/username-check-failed') return 'Unable to verify that username right now. Please try again.';
    if (code === 'verification/custom-mailer-required') {
      return 'We could not send your verification email. Please try again.';
    }
    if (code === 'network-request-failed' || code === 'functions/unavailable' || code === 'unavailable') {
      return 'Unable to create your account right now. Check your connection and try again.';
    }
    return error?.message ? `Unable to register: ${String(error.message)}` : 'Unable to register right now.';
  }

  // ── Create account ───────────────────────────────────────────────────────────
  async function doRegister() {
    setAuthError(null);

    if (!isEmailValid) return setAuthError('Enter a valid email address.');
    if (!isPasswordValid) return setAuthError('Password must be at least 6 characters.');
    if (!passwordsMatch) return setAuthError('Passwords do not match.');
    if (!isHandleValid) return setAuthError('Choose a username (3–20 chars, letters/numbers/underscore/period).');
    if (handleAvailability === 'taken') return setAuthError('That username is taken — pick a different one.');
    if (handleAvailability === 'checking') return setAuthError('Still checking username — try again in a moment.');
    if (!isCityValid) return setAuthError('Select your city.');

    setLoading(true);
    const withTimeout = async <T,>(promise: Promise<T>, ms: number, label: string) => {
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
    };
    try {
      let existing = null;
      if (canCheckHandleAvailability) {
        try {
          existing = await withTimeout(findUserByHandle(normalizedHandle), 6000, 'Checking handle');
        } catch (e) {
          devLog('handle check skipped', e);
        }
      }
      if (existing) {
        setAuthError('That username is taken.');
        setLoading(false);
        return;
      }
      const campusType = campus ? 'campus' : 'city';
      await register(
        email.trim(),
        password,
        name || undefined,
        city || undefined,
        normalizedHandle,
        campusType,
        campus || undefined,
        normalizedPhone || undefined,
        {
          coffeeIntents: coffeeIntentsPref.slice(0, 3),
          ambiancePreference,
        },
      );
    } catch (e) {
      devLog('register error', e);
      setAuthError(mapRegistrationError(e));
    } finally {
      setLoading(false);
    }
  }

  // ── Effects ──────────────────────────────────────────────────────────────────

  // Load onboarding profile (run once on mount)
  useEffect(() => {
    (async () => {
      try {
        const profile = await getOnboardingProfile();
        if (profile?.name) setName(profile.name);
        if (profile?.city) {
          setCity(profile.city);
          setCityQuery(profile.city);
        } else if (profile?.campusType === 'city' && profile?.campusOrCity) {
          setCity(profile.campusOrCity);
          setCityQuery(profile.campusOrCity);
        }
        if (profile?.campus) {
          setCampus(profile.campus);
          setCampusQuery(profile.campus);
        } else if (profile?.campusType === 'campus' && profile?.campusOrCity) {
          setCampus(profile.campusOrCity);
          setCampusQuery(profile.campusOrCity);
        }
        if (Array.isArray(profile?.coffeeIntents)) setCoffeeIntentsPref(profile.coffeeIntents.slice(0, 3));
        if (typeof profile?.ambiancePreference === 'string') setAmbiancePreference(profile.ambiancePreference);
      } catch {}
    })();
  }, []);

  // GPS bias for city search
  useEffect(() => {
    (async () => {
      const pos = await getForegroundLocationIfPermitted();
      if (pos) setGeoBias(pos);
    })().catch(() => {});
  }, []);

  // Auto-detect city from GPS
  useEffect(() => {
    let cancelled = false;
    if (!geoBias || cityDropdownOpen) return;
    setDetectingCity(true);
    (async () => {
      const detected = await reverseGeocodeCity(geoBias.lat, geoBias.lng);
      if (cancelled || !detected) return;
      setCity(detected);
      setCityQuery(detected);
    })()
      .catch(() => {})
      .finally(() => { if (!cancelled) setDetectingCity(false); });
    return () => { cancelled = true; };
  }, [geoBias]); // eslint-disable-line react-hooks/exhaustive-deps

  // Referral code
  useEffect(() => {
    (async () => {
      const code = await getAndClearReferralCode();
      if (code) { setReferralCode(code); devLog('Referral code:', code); }
    })();
  }, []);

  const referralTrackedRef = useRef(false);
  useEffect(() => {
    if (user?.id && referralCode && !referralTrackedRef.current) {
      referralTrackedRef.current = true;
      void trackReferralSignup(user.id, referralCode);
    }
  }, [user?.id, referralCode]);

  // City search (only fires when dropdown is open)
  useEffect(() => {
    let alive = true;
    if (!cityDropdownOpen || !cityQuery.trim()) {
      setCityResults([]);
      setCityLoading(false);
      return;
    }
    const timer = setTimeout(async () => {
      setCityLoading(true);
      try {
        const remote = await searchLocations(cityQuery, 'city', 8, geoBias || undefined);
        const names = remote.map((r) => r.name);
        const fallback = getLocationOptions('city', cityQuery).slice(0, 8);
        if (alive) setCityResults(names.length ? names : fallback);
      } catch {
        if (alive) setCityResults(getLocationOptions('city', cityQuery).slice(0, 8));
      } finally {
        if (alive) setCityLoading(false);
      }
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [cityQuery, cityDropdownOpen, geoBias]);

  // Campus search (only fires when dropdown is open)
  useEffect(() => {
    let alive = true;
    if (!campusDropdownOpen || !campusQuery.trim()) {
      setCampusResults([]);
      setCampusLoading(false);
      return;
    }
    const timer = setTimeout(async () => {
      setCampusLoading(true);
      try {
        const remote = await searchLocations(campusQuery, 'campus', 8, geoBias || undefined);
        const names = remote.map((r) => r.name);
        const fallback = getLocationOptions('campus', campusQuery).slice(0, 8);
        if (alive) setCampusResults(names.length ? names : fallback);
      } catch {
        if (alive) setCampusResults(getLocationOptions('campus', campusQuery).slice(0, 8));
      } finally {
        if (alive) setCampusLoading(false);
      }
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [campusQuery, campusDropdownOpen, geoBias]);

  // Handle availability check
  useEffect(() => {
    let cancelled = false;
    if (!normalizedHandle) {
      setHandleAvailability('idle');
      return () => { cancelled = true; };
    }
    if (!/^[a-z0-9_.]{3,20}$/.test(normalizedHandle)) {
      setHandleAvailability('invalid');
      return () => { cancelled = true; };
    }
    if (!canCheckHandleAvailability) {
      setHandleAvailability('idle');
      return () => { cancelled = true; };
    }
    setHandleAvailability('checking');
    const id = setTimeout(async () => {
      try {
        const existing = await findUserByHandle(normalizedHandle);
        if (cancelled) return;
        setHandleAvailability(existing ? 'taken' : 'available');
      } catch {
        if (!cancelled) setHandleAvailability('idle');
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(id); };
  }, [canCheckHandleAvailability, normalizedHandle]);

  // Navigate once user is set
  useEffect(() => {
    if (!rootNavigationState?.key || !user) return;
    if (user.email && !user.emailVerified) {
      router.replace('/verify');
      return;
    }
    router.replace('/(tabs)/feed');
  }, [user, rootNavigationState?.key, router]);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <ThemedView style={styles.container}>
      <Atmosphere />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: Math.max(tokens.space.s20, insets.top + tokens.space.s16),
              paddingBottom: insets.bottom + extraScrollPad,
              flexGrow: 1,
            },
          ]}
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={{ width: '100%', alignItems: 'center' }}>
            <Logo size={logoSize} variant="mark" label="Perched" />
            <H1
              style={{
                color,
                marginTop: tokens.space.s10,
                ...(titleSize
                  ? { fontSize: titleSize, lineHeight: Math.round(titleSize * 1.2) }
                  : null),
              }}
            >
              Create account
            </H1>
          </View>
          {!compactHeader ? (
            <Body style={{ color, marginTop: tokens.space.s8, marginBottom: tokens.space.s4 }}>
              Sign up with your email to get started.
            </Body>
          ) : null}

          <View style={{ height: tokens.space.s16 }} />

          {!fbAvailable ? (
            <View style={[styles.infoBox, { backgroundColor: withAlpha(accent, 0.12), borderColor: withAlpha(accent, 0.3) }]}>
              <Text style={{ color: accent, fontWeight: '600' }}>
                Server auth not configured — account will save locally
              </Text>
            </View>
          ) : null}

          {/* ─── EMAIL ──────────────────────────────────────────────────────── */}
          <Label style={fieldLabelStyle}>Email</Label>
          <TextInput
            placeholder="you@email.com"
            placeholderTextColor={muted}
            value={email}
            onChangeText={setEmail}
            style={[styles.input, { borderColor: border, backgroundColor: card, color }]}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {email.trim().length > 0 && !isEmailValid ? (
            <Text style={[styles.hint, { color: danger }]}>Enter a valid email address.</Text>
          ) : null}

          {/* ─── PASSWORD ───────────────────────────────────────────────────── */}
          <Label style={fieldLabelStyle}>Password</Label>
          <TextInput
            placeholder="At least 6 characters"
            placeholderTextColor={muted}
            value={password}
            onChangeText={setPassword}
            style={[styles.input, { borderColor: border, backgroundColor: card, color }]}
            secureTextEntry
            {...manualPasswordEntryProps}
          />
          {password.length > 0 && password.length < 6 ? (
            <Text style={[styles.hint, { color: danger }]}>Use at least 6 characters.</Text>
          ) : (
            <Text style={[styles.hint, { color: muted }]}>Min 6 characters.</Text>
          )}

          <Label style={fieldLabelStyle}>Confirm password</Label>
          <TextInput
            placeholder="Re-enter your password"
            placeholderTextColor={muted}
            value={passwordConfirm}
            onChangeText={setPasswordConfirm}
            style={[
              styles.input,
              {
                borderColor:
                  passwordConfirm.length > 0 && password !== passwordConfirm ? danger : border,
                backgroundColor: card,
                color,
              },
            ]}
            secureTextEntry
            {...manualPasswordEntryProps}
          />
          {passwordConfirm.length > 0 && password !== passwordConfirm ? (
            <Text style={[styles.hint, { color: danger }]}>Passwords don&apos;t match.</Text>
          ) : passwordConfirm.length > 0 && password === passwordConfirm ? (
            <Text style={[styles.hint, { color: success }]}>Passwords match.</Text>
          ) : null}

          {/* ─── USERNAME ───────────────────────────────────────────────────── */}
          <Label style={fieldLabelStyle}>Username</Label>
          <View
            style={[
              styles.handleRow,
              {
                borderColor:
                  handleAvailability === 'available'
                    ? success
                    : handleAvailability === 'taken' || handleAvailability === 'invalid'
                      ? danger
                      : border,
                backgroundColor: card,
              },
            ]}
          >
            <Text style={{ color: muted, fontWeight: '600', paddingLeft: tokens.space.s12, fontSize: 16 }}>
              @
            </Text>
            <TextInput
              placeholder="yourhandle"
              placeholderTextColor={muted}
              value={handle}
              onChangeText={(t) => setHandle(t.replace(/^@+/, '').toLowerCase())}
              style={[styles.handleInput, { color }]}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
            />
          </View>
          {handleAvailability === 'checking' ? (
            <Text style={[styles.hint, { color: muted }]}>Checking...</Text>
          ) : handleAvailability === 'available' ? (
            <Text style={[styles.hint, { color: success }]}>@{normalizedHandle} is available</Text>
          ) : handleAvailability === 'taken' ? (
            <Text style={[styles.hint, { color: danger }]}>@{normalizedHandle} is taken</Text>
          ) : handleAvailability === 'invalid' ? (
            <Text style={[styles.hint, { color: danger }]}>
              3–20 letters, numbers, underscores, or periods only.
            </Text>
          ) : !canCheckHandleAvailability && fbAvailable ? (
            <Text style={[styles.hint, { color: muted }]}>Availability is checked when you create your account.</Text>
          ) : (
            <Text style={[styles.hint, { color: muted }]}>e.g. @studyqueen</Text>
          )}

          {/* ─── NAME (optional) ────────────────────────────────────────────── */}
          <Label style={fieldLabelStyle}>
            Name{' '}
            <Text style={{ color: muted, fontWeight: '400', fontSize: 13 }}>(optional)</Text>
          </Label>
          <TextInput
            placeholder="Your name"
            placeholderTextColor={muted}
            value={name}
            onChangeText={setName}
            style={[styles.input, { borderColor: border, backgroundColor: card, color }]}
            maxLength={40}
          />

          {/* ─── PHONE (optional — for friend discovery) ────────────────────── */}
          <Label style={fieldLabelStyle}>
            Phone{' '}
            <Text style={{ color: muted, fontWeight: '400', fontSize: 13 }}>(optional)</Text>
          </Label>
          <TextInput
            placeholder="+1 (713) 555-0123"
            placeholderTextColor={muted}
            value={phone}
            onChangeText={setPhone}
            style={[styles.input, { borderColor: border, backgroundColor: card, color }]}
            keyboardType="phone-pad"
          />
          <Text style={[styles.hint, { color: muted }]}>
            Lets friends find you by phone number.
          </Text>

          {/* ─── CITY ───────────────────────────────────────────────────────── */}
          <Label style={fieldLabelStyle}>City</Label>
          <TextInput
            placeholder="Search cities..."
            placeholderTextColor={muted}
            value={cityQuery}
            onChangeText={(text) => {
              setCityQuery(text);
              setCityDropdownOpen(true);
              setCity('');
            }}
            onFocus={() => {
              if (cityQuery.trim()) setCityDropdownOpen(true);
            }}
            style={[
              styles.input,
              { borderColor: city ? success : border, backgroundColor: card, color },
            ]}
          />
          {detectingCity && !city ? (
            <Text style={[styles.hint, { color: muted }]}>Detecting your city...</Text>
          ) : null}
          {cityLoading ? (
            <Text style={[styles.hint, { color: muted }]}>Searching...</Text>
          ) : null}
          {cityDropdownOpen && cityQuery.trim().length > 0 ? (
            <View style={[styles.suggestionList, { borderColor: border, backgroundColor: card }]}>
              {(cityResults.length
                ? cityResults
                : getLocationOptions('city', cityQuery).slice(0, 8)
              ).map((option) => (
                <Pressable
                  key={option}
                  onPress={() => {
                    setCity(option);
                    setCityQuery(option);
                    setCityDropdownOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.locationRow,
                    { borderColor: border, backgroundColor: pressed ? highlight : 'transparent' },
                  ]}
                >
                  <Text style={{ color, fontWeight: '600' }}>{option}</Text>
                </Pressable>
              ))}
              {!cityResults.length &&
              !cityLoading &&
              getLocationOptions('city', cityQuery).length === 0 ? (
                <Text style={{ color: muted, marginVertical: tokens.space.s8 }}>
                  No matches — try a different city name.
                </Text>
              ) : null}
            </View>
          ) : null}
          {geoBias && !cityDropdownOpen ? (
            <Pressable
              onPress={async () => {
                setDetectingCity(true);
                const detected = await reverseGeocodeCity(geoBias.lat, geoBias.lng);
                setDetectingCity(false);
                if (!detected) return;
                setCity(detected);
                setCityQuery(detected);
                setCityDropdownOpen(false);
              }}
              style={[styles.inlineButton, { borderColor: border }]}
            >
              <Text style={{ color: primary, fontWeight: '600' }}>Use my current city</Text>
            </Pressable>
          ) : null}
          {!isCityValid && !cityDropdownOpen ? (
            <Text style={[styles.hint, { color: muted }]}>
              Select your city to personalize your feed.
            </Text>
          ) : null}

          {/* ─── UNIVERSITY (optional) ──────────────────────────────────────── */}
          <Label style={fieldLabelStyle}>
            University{' '}
            <Text style={{ color: muted, fontWeight: '400', fontSize: 13 }}>(optional)</Text>
          </Label>
          <TextInput
            placeholder="Search universities..."
            placeholderTextColor={muted}
            value={campusQuery}
            onChangeText={(text) => {
              setCampusQuery(text);
              setCampusDropdownOpen(true);
              setCampus('');
            }}
            onFocus={() => {
              if (campusQuery.trim()) setCampusDropdownOpen(true);
            }}
            style={[
              styles.input,
              { borderColor: campus ? success : border, backgroundColor: card, color },
            ]}
          />
          {campusLoading ? (
            <Text style={[styles.hint, { color: muted }]}>Searching...</Text>
          ) : null}
          {campusDropdownOpen && campusQuery.trim().length > 0 ? (
            <View style={[styles.suggestionList, { borderColor: border, backgroundColor: card }]}>
              {(campusResults.length
                ? campusResults
                : getLocationOptions('campus', campusQuery).slice(0, 8)
              ).map((option) => (
                <Pressable
                  key={option}
                  onPress={() => {
                    setCampus(option);
                    setCampusQuery(option);
                    setCampusDropdownOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.locationRow,
                    { borderColor: border, backgroundColor: pressed ? highlight : 'transparent' },
                  ]}
                >
                  <Text style={{ color, fontWeight: '600' }}>{option}</Text>
                </Pressable>
              ))}
              {!campusResults.length &&
              !campusLoading &&
              getLocationOptions('campus', campusQuery).length === 0 ? (
                <Text style={{ color: muted, marginVertical: tokens.space.s8 }}>
                  No matches — try a different university name.
                </Text>
              ) : null}
            </View>
          ) : campus ? null : (
            <Text style={[styles.hint, { color: muted }]}>
              Add your campus to connect with classmates.
            </Text>
          )}

          {/* ─── ERROR BOX ──────────────────────────────────────────────────── */}
          {authError ? (
            <View
              style={[
                styles.infoBox,
                { backgroundColor: withAlpha(danger, 0.1), borderColor: withAlpha(danger, 0.3), marginTop: tokens.space.s4 },
              ]}
            >
              <Text style={{ color: danger, fontWeight: '500' }}>{authError}</Text>
            </View>
          ) : null}

          {/* ─── SUBMIT ─────────────────────────────────────────────────────── */}
          <Pressable
            onPress={doRegister}
            style={[
              styles.primaryButton,
              { backgroundColor: primary },
              !canSubmit || loading ? { opacity: 0.5 } : null,
            ]}
            disabled={!canSubmit || loading}
          >
            <Text style={styles.primaryText}>
              {loading ? 'Creating account...' : 'Create account'}
            </Text>
          </Pressable>

          <View style={{ height: tokens.space.s12 }} />
          <Text style={{ color: muted, fontSize: 12 }}>
            By continuing you agree to our{' '}
            <Text onPress={() => router.push('/terms')} style={{ color: primary, fontWeight: '600' }}>
              Terms
            </Text>
            {' '}and{' '}
            <Text onPress={() => router.push('/privacy')} style={{ color: primary, fontWeight: '600' }}>
              Privacy Policy
            </Text>
            .
          </Text>
          <View style={{ height: tokens.space.s12 }} />
          <Pressable onPress={() => router.push('/signin')}>
            <Text style={{ color: primary, fontWeight: '600' }}>
              Already have an account? Sign in
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  scroll: { paddingHorizontal: tokens.space.s20 },
  input: { borderWidth: 1, padding: tokens.space.s12, borderRadius: tokens.radius.r14, marginBottom: tokens.space.s4 },
  hint: { fontSize: 13, marginBottom: tokens.space.s10 },
  infoBox: { padding: tokens.space.s12, borderRadius: tokens.radius.r12, borderWidth: 1, marginBottom: tokens.space.s12 },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: tokens.radius.r14,
    marginBottom: tokens.space.s4,
    overflow: 'hidden',
  },
  handleInput: {
    flex: 1,
    padding: tokens.space.s12,
    fontSize: 16,
  },
  locationRow: {
    paddingVertical: tokens.space.s10,
    borderBottomWidth: 1,
  },
  suggestionList: {
    borderWidth: 1,
    borderRadius: tokens.radius.r14,
    paddingHorizontal: tokens.space.s10,
    paddingVertical: tokens.space.s6,
    marginBottom: tokens.space.s10,
  },
  inlineButton: {
    paddingHorizontal: tokens.space.s14,
    paddingVertical: tokens.space.s10,
    borderRadius: tokens.radius.r12,
    borderWidth: 1,
    marginBottom: tokens.space.s10,
    alignItems: 'center',
  },
  primaryButton: {
    height: 54,
    borderRadius: tokens.radius.r18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: tokens.space.s8,
  },
  primaryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
});
