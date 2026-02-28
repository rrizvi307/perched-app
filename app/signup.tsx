import { ThemedView } from '@/components/themed-view';
import { Atmosphere } from '@/components/ui/atmosphere';
import { Body, H1, Label } from '@/components/ui/typography';
import { useAuth } from '@/contexts/AuthContext';
import { useKeyboardHeight, useKeyboardVisible } from '@/hooks/use-keyboard-visible';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getLocationOptions } from '@/constants/locations';
import { reverseGeocodeCity, searchLocations } from '@/services/googleMaps';
import Logo from '@/components/logo';
import {
  confirmPhoneAuth,
  findUserByHandle,
  getWebRecaptchaVerifier,
  isFirebaseConfigured,
  linkAnonymousWithEmail,
  startPhoneAuth,
  updateUserRemote,
  FIREBASE_CONFIG,
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

  // Phone verification
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [sendingCode, setSendingCode] = useState(false);

  // Account security — email optional, password only required if email provided
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  // Profile
  const [handle, setHandle] = useState('');
  const [name, setName] = useState('');
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

  const { register, user, refreshUser } = useAuth();
  const fbAvailable = isFirebaseConfigured();
  const color = useThemeColor({}, 'text');
  const primary = useThemeColor({}, 'primary');
  const accent = useThemeColor({}, 'accent');
  const success = useThemeColor({}, 'success');
  const danger = useThemeColor({}, 'danger');
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');
  const muted = useThemeColor({}, 'muted');
  const highlight = withAlpha(primary, 0.1);
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const recaptchaVerifier = useRef<any>(null);
  const [RecaptchaModal, setRecaptchaModal] = useState<any>(null);
  const scrollRef = useRef<ScrollView>(null);

  // ── Validation ──────────────────────────────────────────────────────────────
  function validateEmail(e: string) {
    return /\S+@\S+\.\S+/.test(e);
  }
  const normalizedPhone = phone.trim() ? normalizePhone(phone.trim()) : null;
  const isPhoneValid = !!normalizedPhone;
  const isEmailProvided = email.trim().length > 0;
  const isEmailValid = !isEmailProvided || validateEmail(email.trim());
  const isPasswordValid = !isEmailProvided || password.length >= 6;
  const passwordsMatch = !isEmailProvided || password === passwordConfirm;
  // Strip any @ the user might type, keep lowercase
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
  const phoneVerified = !!verificationId && smsCode.trim().length >= 4;
  const canSubmit =
    isPhoneValid &&
    phoneVerified &&
    isEmailValid &&
    isPasswordValid &&
    passwordsMatch &&
    isHandleValid &&
    isCityValid &&
    handleReady &&
    !loading;

  const supportsPhoneAuth = Platform.OS === 'web' || !!RecaptchaModal;

  const { height } = useWindowDimensions();
  const keyboardVisible = useKeyboardVisible();
  const keyboardHeight = useKeyboardHeight();
  const compactHeader = keyboardVisible && Platform.OS !== 'web';
  const logoSize = compactHeader ? 44 : height < 740 ? 56 : 72;
  const titleSize = compactHeader ? 30 : height < 740 ? 36 : undefined;
  const extraScrollPad = Platform.OS === 'ios' ? Math.max(28, keyboardHeight + 28) : 28;

  function getRecaptchaVerifier() {
    if (Platform.OS === 'web') {
      if (!recaptchaVerifier.current) {
        recaptchaVerifier.current = getWebRecaptchaVerifier('recaptcha-container-signup');
      }
      return recaptchaVerifier.current;
    }
    return recaptchaVerifier.current;
  }

  // ── Send SMS code ────────────────────────────────────────────────────────────
  async function sendCode() {
    setAuthError(null);
    if (!isPhoneValid) {
      setAuthError('Enter a valid phone number with country code.');
      return;
    }
    if (!fbAvailable) {
      setAuthError('Server not configured — phone verification unavailable in this build.');
      return;
    }
    const verifier = getRecaptchaVerifier();
    if (!verifier) {
      setAuthError('Unable to initialize verification. Please refresh and try again.');
      return;
    }
    setSendingCode(true);
    try {
      const res = await startPhoneAuth(normalizedPhone!, verifier);
      setVerificationId(res.verificationId);
      setSmsCode('');
      setAuthError(null);
    } catch (e: any) {
      devLog('sendCode error', e);
      setAuthError(e?.message || 'Unable to send code. Check your number and try again.');
    } finally {
      setSendingCode(false);
    }
  }

  // ── Create account ───────────────────────────────────────────────────────────
  async function doRegister() {
    setAuthError(null);

    if (!isPhoneValid) return setAuthError('Enter a valid phone number.');
    if (!verificationId) return setAuthError('Tap "Send verification code" first.');
    if (smsCode.trim().length < 4) return setAuthError('Enter the verification code from your text.');
    if (!isHandleValid) return setAuthError('Choose a username (3–20 chars, letters/numbers/underscore/period).');
    if (handleAvailability === 'taken') return setAuthError('That username is taken — pick a different one.');
    if (handleAvailability === 'checking') return setAuthError('Still checking username — try again in a moment.');
    if (!isCityValid) return setAuthError('Select your city.');
    if (isEmailProvided && !validateEmail(email.trim())) return setAuthError('Enter a valid email address.');
    if (isEmailProvided && password.length < 6) return setAuthError('Password must be at least 6 characters.');
    if (isEmailProvided && password !== passwordConfirm) return setAuthError('Passwords do not match.');

    // Local/dev fallback — no Firebase
    if (!fbAvailable) {
      setLoading(true);
      try {
        const campusType = campus ? 'campus' : 'city';
        await register(
          email.trim() || `phone-${normalizedPhone}@local`,
          password || 'phone-auth',
          name || undefined,
          city,
          normalizedHandle,
          campusType,
          campus || undefined,
          normalizedPhone!,
          { coffeeIntents: coffeeIntentsPref.slice(0, 3), ambiancePreference },
        );
      } catch (e: any) {
        setAuthError(e?.message || 'Unable to create account.');
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      // 1. Confirm phone → creates / signs in Firebase phone auth account
      const authUser = await confirmPhoneAuth(verificationId, smsCode.trim());
      const uid = authUser?.uid;
      if (!uid) throw new Error('Unable to verify phone number.');

      // 2. Save profile to Firestore
      const campusType = campus ? 'campus' : 'city';
      await updateUserRemote(uid, {
        name: name.trim() || null,
        city: city || null,
        campus: campus || null,
        campusOrCity: campusType === 'campus' ? campus : city,
        campusType,
        handle: normalizedHandle,
        phone: normalizedPhone,
        email: email.trim() || null,
        coffeeIntents: coffeeIntentsPref.slice(0, 3),
        ambiancePreference,
      });

      // 3. Link email + password if provided (non-blocking — user can add later)
      if (isEmailProvided && password.length >= 6) {
        try {
          await linkAnonymousWithEmail({ email: email.trim(), password });
        } catch (e: any) {
          devLog('email link (non-fatal):', e?.code, e?.message);
        }
      }

      // 4. Referral tracking
      if (referralCode) void trackReferralSignup(uid, referralCode);

      // 5. Sync user state
      await refreshUser?.();
    } catch (e: any) {
      devLog('doRegister error', e);
      const code = e?.code || '';
      const msg =
        code === 'auth/invalid-verification-code'
          ? 'Invalid code — check your text and try again.'
          : code === 'auth/code-expired'
            ? 'Code expired — tap "Resend code" to get a new one.'
            : code === 'auth/session-expired'
              ? 'Session expired — tap "Resend code" to get a new one.'
              : e?.message || 'Unable to create account. Please try again.';
      setAuthError(msg);
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
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // GPS bias for city search
  useEffect(() => {
    (async () => {
      const pos = await getForegroundLocationIfPermitted();
      if (pos) setGeoBias(pos);
    })().catch(() => {});
  }, []);

  // Auto-detect city from GPS (only when dropdown is closed and city hasn't been manually changed)
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

  // Load RecaptchaModal on native
  useEffect(() => {
    if (Platform.OS === 'web') return;
    try {
      const req = eval('require');
      const mod = req('expo-firebase-recaptcha');
      if (mod?.FirebaseRecaptchaVerifierModal) setRecaptchaModal(() => mod.FirebaseRecaptchaVerifierModal);
    } catch {}
  }, []);

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
  }, [normalizedHandle]);

  // Navigate once user is set (phone users skip email verification gate)
  useEffect(() => {
    if (!rootNavigationState?.key || !user) return;
    // Only redirect to /verify for email-only accounts (legacy path, no phone)
    if (user.email && !user.emailVerified && !user.phone) {
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
              paddingTop: Math.max(20, insets.top + 16),
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
                marginTop: 10,
                ...(titleSize
                  ? { fontSize: titleSize, lineHeight: Math.round(titleSize * 1.2) }
                  : null),
              }}
            >
              Create account
            </H1>
          </View>
          {!compactHeader ? (
            <Body style={{ color, marginTop: 8, marginBottom: 4 }}>
              We'll text a code to verify your number.
            </Body>
          ) : null}

          <View style={{ height: 16 }} />

          {!fbAvailable ? (
            <View style={[styles.infoBox, { backgroundColor: withAlpha(accent, 0.12), borderColor: withAlpha(accent, 0.3) }]}>
              <Text style={{ color: accent, fontWeight: '600' }}>
                Server auth not configured — account will save locally
              </Text>
            </View>
          ) : null}

          {RecaptchaModal ? (
            <RecaptchaModal ref={recaptchaVerifier} firebaseConfig={FIREBASE_CONFIG} />
          ) : null}
          {Platform.OS === 'web' ? (
            <View nativeID="recaptcha-container-signup" id="recaptcha-container-signup" style={{ height: 0 }} />
          ) : null}

          {/* ─── PHONE VERIFICATION ─────────────────────────────────────────── */}
          <Label>Phone number</Label>
          <TextInput
            placeholder="+1 (713) 555-0123"
            placeholderTextColor={muted}
            value={phone}
            onChangeText={(t) => {
              setPhone(t);
              // Reset verification if phone number changes
              setVerificationId('');
              setSmsCode('');
              setAuthError(null);
            }}
            style={[
              styles.input,
              { borderColor: verificationId ? success : border, backgroundColor: card, color },
            ]}
            keyboardType="phone-pad"
            autoCapitalize="none"
          />
          {phone.trim() && !isPhoneValid ? (
            <Text style={[styles.hint, { color: danger }]}>
              Include country code, e.g. +1 713 555 0123
            </Text>
          ) : (
            <Text style={[styles.hint, { color: muted }]}>
              Required — lets friends find you by number
            </Text>
          )}

          <Pressable
            onPress={sendCode}
            style={[
              styles.inlineButton,
              { borderColor: primary },
              !isPhoneValid || sendingCode ? { opacity: 0.45 } : null,
            ]}
            disabled={!isPhoneValid || sendingCode}
          >
            <Text style={{ color: primary, fontWeight: '700' }}>
              {sendingCode ? 'Sending...' : verificationId ? 'Resend code' : 'Send verification code'}
            </Text>
          </Pressable>

          {verificationId ? (
            <>
              <Label>Verification code</Label>
              <TextInput
                placeholder="6-digit code"
                placeholderTextColor={muted}
                value={smsCode}
                onChangeText={setSmsCode}
                style={[styles.input, { borderColor: border, backgroundColor: card, color }]}
                keyboardType="number-pad"
                maxLength={6}
              />
              <Text style={[styles.hint, { color: muted }]}>
                Check your texts for the code we sent.
              </Text>
            </>
          ) : null}

          {/* ─── EMAIL (optional) ───────────────────────────────────────────── */}
          <View style={{ marginTop: 8 }}>
            <Label>
              Email{' '}
              <Text style={{ color: muted, fontWeight: '400', fontSize: 13 }}>
                (optional — for account recovery)
              </Text>
            </Label>
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
            {isEmailProvided && !validateEmail(email.trim()) ? (
              <Text style={[styles.hint, { color: danger }]}>Enter a valid email address.</Text>
            ) : null}
          </View>

          {/* ─── PASSWORD (only when email is provided) ─────────────────────── */}
          {isEmailProvided ? (
            <>
              <Label>Password</Label>
              <TextInput
                placeholder="At least 6 characters"
                placeholderTextColor={muted}
                value={password}
                onChangeText={setPassword}
                style={[styles.input, { borderColor: border, backgroundColor: card, color }]}
                secureTextEntry
              />
              {password.length > 0 && password.length < 6 ? (
                <Text style={[styles.hint, { color: danger }]}>Use at least 6 characters.</Text>
              ) : (
                <Text style={[styles.hint, { color: muted }]}>Min 6 characters.</Text>
              )}

              <Label>Confirm password</Label>
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
              />
              {passwordConfirm.length > 0 && password !== passwordConfirm ? (
                <Text style={[styles.hint, { color: danger }]}>Passwords don't match.</Text>
              ) : passwordConfirm.length > 0 && password === passwordConfirm ? (
                <Text style={[styles.hint, { color: success }]}>Passwords match.</Text>
              ) : (
                <Text style={[styles.hint, { color: muted }]}>Re-enter your password.</Text>
              )}
            </>
          ) : null}

          {/* ─── USERNAME ───────────────────────────────────────────────────── */}
          <Label>Username</Label>
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
            <Text style={{ color: muted, fontWeight: '600', paddingLeft: 12, fontSize: 16 }}>
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
          ) : (
            <Text style={[styles.hint, { color: muted }]}>e.g. @studyqueen</Text>
          )}

          {/* ─── NAME (optional) ────────────────────────────────────────────── */}
          <Label>
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

          {/* ─── CITY ───────────────────────────────────────────────────────── */}
          <Label>City</Label>
          <TextInput
            placeholder="Search cities..."
            placeholderTextColor={muted}
            value={cityQuery}
            onChangeText={(text) => {
              setCityQuery(text);
              setCityDropdownOpen(true);
              setCity(''); // clear confirmed selection while typing
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
                <Text style={{ color: muted, marginVertical: 8 }}>
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
          <Label>
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
              setCampus(''); // clear confirmed selection while typing
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
                <Text style={{ color: muted, marginVertical: 8 }}>
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
                { backgroundColor: withAlpha(danger, 0.1), borderColor: withAlpha(danger, 0.3), marginTop: 4 },
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

          <View style={{ height: 12 }} />
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
          <View style={{ height: 12 }} />
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
  scroll: { paddingHorizontal: 20 },
  input: { borderWidth: 1, padding: 12, borderRadius: 14, marginBottom: 4 },
  hint: { fontSize: 13, marginBottom: 10 },
  infoBox: { padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    marginBottom: 4,
    overflow: 'hidden',
  },
  handleInput: {
    flex: 1,
    padding: 12,
    fontSize: 16,
  },
  locationRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  suggestionList: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10,
  },
  inlineButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    alignItems: 'center',
  },
  primaryButton: {
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
});
