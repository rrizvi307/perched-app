import { ThemedView } from '@/components/themed-view';
import { Atmosphere } from '@/components/ui/atmosphere';
import { Body, H1, Label } from '@/components/ui/typography';
import { useAuth } from '@/contexts/AuthContext';
import { useKeyboardHeight, useKeyboardVisible } from '@/hooks/use-keyboard-visible';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getLocationOptions } from '@/constants/locations';
import { reverseGeocodeCity, searchLocations } from '@/services/googleMaps';
import Logo from '@/components/logo';
import { confirmPhoneAuth, findUserByHandle, getWebRecaptchaVerifier, isFirebaseConfigured, startPhoneAuth, updateUserRemote, FIREBASE_CONFIG } from '@/services/firebaseClient';
import { devLog } from '@/services/logger';
import { getOnboardingProfile } from '@/storage/local';
import { withAlpha } from '@/utils/colors';
import { gapStyle } from '@/utils/layout';
import { normalizePhone } from '@/utils/phone';
import { getForegroundLocationIfPermitted } from '@/services/location';
import { useEffect, useRef, useState } from 'react';
import { useRootNavigationState, useRouter } from 'expo-router';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SignUp() {
  const insets = useSafeAreaInsets();
  const [authMode, setAuthMode] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [campus, setCampus] = useState('');
  const [handle, setHandle] = useState('');
  const [loading, setLoading] = useState(false);
  const [handleAvailability, setHandleAvailability] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [cityQuery, setCityQuery] = useState('');
  const [cityTouched, setCityTouched] = useState(false);
  const [cityResults, setCityResults] = useState<string[]>([]);
  const [cityLoading, setCityLoading] = useState(false);
  const [campusQuery, setCampusQuery] = useState('');
  const [campusTouched, setCampusTouched] = useState(false);
  const [campusResults, setCampusResults] = useState<string[]>([]);
  const [campusLoading, setCampusLoading] = useState(false);
  const [detectingCity, setDetectingCity] = useState(false);
  const [geoBias, setGeoBias] = useState<{ lat: number; lng: number } | null>(null);
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
  const passwordYRef = useRef(0);
  const cityYRef = useRef(0);

  function validateEmail(e: string) {
    return /\S+@\S+\.\S+/.test(e);
  }

  const normalizedHandle = handle.trim().replace(/^@/, '').toLowerCase();
  const isEmailValid = validateEmail(email);
  const isPasswordValid = password.length >= 6;
  const normalizedPhone = phone.trim() ? normalizePhone(phone.trim()) : null;
  const isPhoneValid = !!normalizedPhone;
  const isHandleValid = !!normalizedHandle && normalizedHandle.length >= 3 && /^[a-z0-9_.]{3,20}$/.test(normalizedHandle);
  const isCityValid = !!city;
  const handleReady = handleAvailability !== 'checking' && handleAvailability !== 'taken' && handleAvailability !== 'invalid';
  const canSubmitEmail = isEmailValid && isPasswordValid && isHandleValid && isCityValid && handleReady && !loading;
  const canSubmitPhone = isPhoneValid && isHandleValid && isCityValid && handleReady && !!verificationId && smsCode.trim().length >= 4 && !verifyingCode;
  const canSubmit = authMode === 'email' ? canSubmitEmail : canSubmitPhone;
  const submitting = authMode === 'email' ? loading : verifyingCode;

  const supportsPhoneAuth = Platform.OS === 'web' || !!RecaptchaModal;
  const { height } = useWindowDimensions();
  const keyboardVisible = useKeyboardVisible();
  const keyboardHeight = useKeyboardHeight();
  const compactHeader = keyboardVisible && Platform.OS !== 'web';
  const logoSize = compactHeader ? 44 : height < 740 ? 56 : 72;
  const titleSize = compactHeader ? 30 : height < 740 ? 36 : undefined;
  const extraScrollPad = Platform.OS === 'ios' ? Math.max(28, keyboardHeight + 28) : 28;
  const scrollToField = (fieldY: number) => {
    if (Platform.OS !== 'ios') return;
    const y = Math.max(0, fieldY - 90);
    setTimeout(() => scrollRef.current?.scrollTo({ y, animated: true }), 140);
  };

  function getRecaptchaVerifier() {
    if (Platform.OS === 'web') {
      if (!recaptchaVerifier.current) {
        recaptchaVerifier.current = getWebRecaptchaVerifier('recaptcha-container-signup');
      }
      return recaptchaVerifier.current;
    }
    return recaptchaVerifier.current;
  }

  async function sendCode() {
    setAuthError(null);
    if (!fbAvailable) {
      setAuthError('Phone sign-up needs Firebase enabled.');
      return;
    }
    if (!isPhoneValid) {
      setAuthError('Enter a valid phone number with area code.');
      return;
    }
    if (!normalizedPhone) {
      setAuthError('Enter a valid phone number with area code.');
      return;
    }
    if (!supportsPhoneAuth) {
      setAuthError("Phone verification isn't available on this device yet. Use email for now.");
      return;
    }
    const verifier = getRecaptchaVerifier();
    if (!verifier) {
      setAuthError('Unable to initialize phone verification.');
      return;
    }
    setSendingCode(true);
    try {
      const res = await startPhoneAuth(normalizedPhone, verifier);
      setVerificationId(res.verificationId);
      setSmsCode('');
      setAuthError(null);
    } catch (e: any) {
      devLog('phone auth start error', e);
      setAuthError(e?.message || 'Unable to send code.');
    } finally {
      setSendingCode(false);
    }
  }

  async function doRegister() {
    setAuthError(null);
    if (!isHandleValid) return alert('Choose a handle (3-20 chars, letters/numbers/underscore/period).');
    if (handleAvailability === 'taken') return alert('That handle is taken.');
    if (handleAvailability === 'checking') return alert('Still checking handle availability. Try again in a moment.');
    if (!isCityValid) return alert('Please select a city.');

    if (authMode === 'phone') {
      if (!fbAvailable) {
        setAuthError('Phone sign-up needs Firebase enabled.');
        return;
      }
      if (!isPhoneValid) {
        setAuthError('Enter a valid phone number with area code.');
        return;
      }
      if (!normalizedPhone) {
        setAuthError('Enter a valid phone number with area code.');
        return;
      }
      if (!verificationId) {
        setAuthError('Send the verification code first.');
        return;
      }
      if (!smsCode.trim()) {
        setAuthError('Enter the verification code.');
        return;
      }
      setVerifyingCode(true);
      try {
        let existing = null;
        try {
          existing = await findUserByHandle(normalizedHandle);
        } catch (e) {
          devLog('handle check skipped', e);
        }
        if (existing) {
          setAuthError('That handle is taken.');
          return;
        }
        const authUser = await confirmPhoneAuth(verificationId, smsCode.trim());
        const uid = authUser?.uid;
        if (!uid) throw new Error('Unable to verify phone');
        const campusType = campus ? 'campus' : 'city';
        await updateUserRemote(uid, {
          name: name || null,
          city: city || null,
          campus: campus || null,
          campusOrCity: campusType === 'campus' ? campus : city,
          campusType,
          handle: normalizedHandle,
          phone: normalizedPhone,
        });
        await refreshUser?.();
      } catch (e: any) {
        devLog('phone register error', e);
        setAuthError(e?.message || 'Unable to verify phone.');
      } finally {
        setVerifyingCode(false);
      }
      return;
    }

    if (!isEmailValid) return alert('Enter a valid email');
    if (!isPasswordValid) return alert('Password must be at least 6 characters');
    if (phone.trim() && !isPhoneValid) return alert('Enter a valid phone number (include area code).');
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
      try {
        existing = await withTimeout(findUserByHandle(normalizedHandle), 6000, 'Checking handle');
      } catch (e) {
        devLog('handle check skipped', e);
      }
      if (existing) {
        alert('That handle is taken.');
        setLoading(false);
        return;
      }
      const campusType = campus ? 'campus' : 'city';
      await register(email.trim(), password, name || undefined, city || undefined, normalizedHandle, campusType, campus || undefined, normalizedPhone || undefined);
    } catch (e) {
      devLog('register error', e);
      const msg = (e as any)?.message || String(e);
      alert('Unable to register: ' + msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const profile = await getOnboardingProfile();
        if (profile?.name && !name) setName(profile.name);
        if (profile?.city && !city) setCity(profile.city);
        if (profile?.campus && !campus) setCampus(profile.campus);
        if (!city && profile?.campusType === 'city' && profile?.campusOrCity) setCity(profile.campusOrCity);
        if (!campus && profile?.campusType === 'campus' && profile?.campusOrCity) setCampus(profile.campusOrCity);
      } catch {}
    })();
  }, [campus, city, name]);

  useEffect(() => {
    if (city && !cityTouched) setCityQuery(city);
  }, [city, cityTouched]);

  useEffect(() => {
    if (campus && !campusTouched) setCampusQuery(campus);
  }, [campus, campusTouched]);

  useEffect(() => {
    (async () => {
      const pos = await getForegroundLocationIfPermitted();
      if (pos) setGeoBias(pos);
    })().catch(() => {});
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    try {
      const req = eval('require');
      const mod = req('expo-firebase-recaptcha');
      if (mod?.FirebaseRecaptchaVerifierModal) {
        setRecaptchaModal(() => mod.FirebaseRecaptchaVerifierModal);
      }
    } catch {}
  }, []);

  useEffect(() => {
    setAuthError(null);
    setVerificationId('');
    setSmsCode('');
    setSendingCode(false);
    setVerifyingCode(false);
  }, [authMode]);

  useEffect(() => {
    let cancelled = false;
    if (!geoBias || cityTouched || city) return;
    setDetectingCity(true);
    (async () => {
      const detected = await reverseGeocodeCity(geoBias.lat, geoBias.lng);
      if (cancelled || !detected || cityTouched || city) return;
      setCity(detected);
      setCityQuery(detected);
    })()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setDetectingCity(false);
      });
    return () => {
      cancelled = true;
    };
  }, [geoBias, cityTouched, city]);

  useEffect(() => {
    let alive = true;
    if (!cityQuery.trim()) {
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
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [cityQuery, geoBias]);

  useEffect(() => {
    let alive = true;
    if (!campusQuery.trim()) {
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
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [campusQuery, geoBias]);

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
        if (existing) {
          setHandleAvailability('taken');
        } else {
          setHandleAvailability('available');
        }
      } catch {
        if (!cancelled) setHandleAvailability('idle');
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [normalizedHandle]);

  useEffect(() => {
    if (!rootNavigationState?.key || !user) return;
    if (user.email && !user.emailVerified) {
      router.replace('/verify');
      return;
    }
    router.replace('/(tabs)/feed');
  }, [user, rootNavigationState?.key, router]);

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
          <View style={{ width: '100%', alignItems: 'center' }}>
            <Logo size={logoSize} variant="mark" label="Perched" />
            <H1 style={{ color, marginTop: 10, ...(titleSize ? { fontSize: titleSize, lineHeight: Math.round(titleSize * 1.2) } : null) }}>Create account</H1>
          </View>
          {!compactHeader ? (
            <Body style={{ color, marginTop: 12 }}>
              {authMode === 'email'
                ? 'We will email a verification link to confirm your address. It can take a minute — check spam just in case.'
                : 'We will text a verification code to confirm your number.'}
            </Body>
          ) : null}

          <View style={{ height: 18 }} />

          {!fbAvailable ? (
            <View style={{ padding: 12, borderRadius: 14, backgroundColor: withAlpha(accent, 0.14), borderWidth: 1, borderColor: withAlpha(accent, 0.3), marginBottom: 12 }}>
              <Text style={{ color: accent, fontWeight: '600' }}>Server auth not configured — create account will save locally</Text>
            </View>
          ) : null}

        <View style={styles.modeRow}>
          <Pressable
            onPress={() => setAuthMode('email')}
            style={[styles.modeButton, { borderColor: border }, authMode === 'email' ? { backgroundColor: primary } : null]}
          >
            <Text style={{ color: authMode === 'email' ? '#FFFFFF' : color, fontWeight: '700' }}>Email</Text>
          </Pressable>
          <Pressable
            onPress={() => setAuthMode('phone')}
            style={[styles.modeButton, { borderColor: border }, authMode === 'phone' ? { backgroundColor: primary } : null]}
          >
            <Text style={{ color: authMode === 'phone' ? '#FFFFFF' : color, fontWeight: '700' }}>Phone</Text>
          </Pressable>
        </View>

        {RecaptchaModal ? <RecaptchaModal ref={recaptchaVerifier} firebaseConfig={FIREBASE_CONFIG} /> : null}
        {Platform.OS === 'web' ? (
          <View nativeID="recaptcha-container-signup" id="recaptcha-container-signup" style={{ height: 0 }} />
        ) : null}

        {authMode === 'email' ? (
          <>
            <Label>Email</Label>
            <TextInput
              placeholder="you@school.edu"
              placeholderTextColor={muted}
              value={email}
              onChangeText={setEmail}
              style={[styles.input, { borderColor: border, backgroundColor: card, color }]}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Label>Password</Label>
            <TextInput
              placeholder="At least 6 characters"
              placeholderTextColor={muted}
              value={password}
              onChangeText={setPassword}
              style={[styles.input, { borderColor: border, backgroundColor: card, color }]}
              secureTextEntry
              onLayout={(e) => {
                passwordYRef.current = e.nativeEvent.layout.y || 0;
              }}
              onFocus={() => scrollToField(passwordYRef.current)}
            />
            {!isPasswordValid && password.length > 0 ? (
              <Text style={{ color: danger, marginBottom: 8 }}>Use at least 6 characters.</Text>
            ) : (
              <Text style={{ color: muted, marginBottom: 8 }}>Use at least 6 characters.</Text>
            )}

            <Label>Phone (optional)</Label>
            <TextInput
              placeholder="+1 555 123 4567"
              placeholderTextColor={muted}
              value={phone}
              onChangeText={setPhone}
              style={[styles.input, { borderColor: border, backgroundColor: card, color }]}
              keyboardType="phone-pad"
            />
            <Text style={{ color: muted, marginBottom: 8 }}>Add your number so friends can find you.</Text>
          </>
        ) : (
          <>
            <Label>Phone number</Label>
            <TextInput
              placeholder="+1 555 123 4567"
              placeholderTextColor={muted}
              value={phone}
              onChangeText={setPhone}
              style={[styles.input, { borderColor: border, backgroundColor: card, color }]}
              keyboardType="phone-pad"
              autoCapitalize="none"
            />
            {!supportsPhoneAuth ? (
              <Text style={{ color: muted, marginBottom: 8 }}>Phone verification is available on web for now.</Text>
            ) : null}
            <Pressable
              onPress={sendCode}
              style={[styles.inlineButton, { borderColor: border }, (sendingCode || !supportsPhoneAuth) ? { opacity: 0.6 } : null]}
              disabled={sendingCode || !supportsPhoneAuth}
            >
              <Text style={{ color: primary, fontWeight: '700' }}>{sendingCode ? 'Sending...' : verificationId ? 'Resend code' : 'Send code'}</Text>
            </Pressable>
            {verificationId ? (
              <>
                <Label>Verification code</Label>
                <TextInput
                  placeholder="123456"
                  placeholderTextColor={muted}
                  value={smsCode}
                  onChangeText={setSmsCode}
                  style={[styles.input, { borderColor: border, backgroundColor: card, color }]}
                  keyboardType="number-pad"
                />
              </>
            ) : null}
          </>
        )}

        {authError ? <Text style={{ color: danger, marginBottom: 8 }}>{authError}</Text> : null}

        <Label>Username</Label>
        <TextInput
          placeholder="@handle"
          placeholderTextColor={muted}
          value={handle}
          onChangeText={setHandle}
          style={[styles.input, { borderColor: border, backgroundColor: card, color }]}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
        />
        {handleAvailability === 'checking' ? (
          <Text style={{ color: muted, marginBottom: 8 }}>Checking handle...</Text>
        ) : handleAvailability === 'available' ? (
          <Text style={{ color: success, marginBottom: 8 }}>Handle available</Text>
        ) : handleAvailability === 'taken' ? (
          <Text style={{ color: danger, marginBottom: 8 }}>Handle taken</Text>
        ) : handleAvailability === 'invalid' ? (
          <Text style={{ color: danger, marginBottom: 8 }}>Use 3-20 letters, numbers, underscores, or periods.</Text>
        ) : (
          <Text style={{ color: muted, marginBottom: 8 }}>Looks like: @studyqueen</Text>
        )}

        <Label>Name</Label>
        <TextInput
          placeholder="Your full name (optional)"
          placeholderTextColor={muted}
          value={name}
          onChangeText={setName}
          style={[styles.input, { borderColor: border, backgroundColor: card, color }]}
          maxLength={40}
        />

        <Label>City</Label>
        <TextInput
          placeholder="Search cities"
          placeholderTextColor={muted}
          value={cityQuery}
          onChangeText={(text) => {
            setCityTouched(true);
            setCityQuery(text);
          }}
          style={[styles.input, { borderColor: border, backgroundColor: card, color }]}
          onLayout={(e) => {
            cityYRef.current = e.nativeEvent.layout.y || 0;
          }}
          onFocus={() => scrollToField(cityYRef.current)}
        />
        {detectingCity && !city ? <Text style={{ color: muted, marginBottom: 8 }}>Detecting your city...</Text> : null}
        {cityLoading ? <Text style={{ color: muted, marginBottom: 8 }}>Searching...</Text> : null}
        {cityQuery.trim().length ? (
          <View style={[styles.suggestionList, { borderColor: border, backgroundColor: card }]}>
            {(cityResults.length ? cityResults : getLocationOptions('city', cityQuery).slice(0, 8)).map((option) => (
              <Pressable
                key={option}
                onPress={() => {
                  setCity(option);
                  setCityQuery(option);
                  setCityTouched(true);
                }}
                style={({ pressed }) => [
                  styles.locationRow,
                  { borderColor: border, backgroundColor: pressed ? highlight : 'transparent' },
                ]}
              >
                <Text style={{ color, fontWeight: '600' }}>{option}</Text>
              </Pressable>
            ))}
            {!cityResults.length && !cityLoading ? (
              <Text style={{ color: muted, marginTop: 8 }}>No matches yet.</Text>
            ) : null}
          </View>
        ) : (
          <Text style={{ color: muted, marginBottom: 8 }}>Start typing to see matches.</Text>
        )}
        {geoBias && !cityQuery.trim().length ? (
          <Pressable
            onPress={async () => {
              setDetectingCity(true);
              const detected = await reverseGeocodeCity(geoBias.lat, geoBias.lng);
              setDetectingCity(false);
              if (!detected) return;
              setCityTouched(true);
              setCity(detected);
              setCityQuery(detected);
            }}
            style={[styles.inlineButton, { borderColor: border }]}
          >
            <Text style={{ color: primary, fontWeight: '600' }}>Use current city</Text>
          </Pressable>
        ) : null}
        {!isCityValid ? (
          <Text style={{ color: muted, marginBottom: 8 }}>Choose a city to personalize your feed.</Text>
        ) : null}

        <Label>Campus (optional)</Label>
        <TextInput
          placeholder="Search campuses"
          placeholderTextColor={muted}
          value={campusQuery}
          onChangeText={(text) => {
            setCampusTouched(true);
            setCampusQuery(text);
          }}
          style={[styles.input, { borderColor: border, backgroundColor: card, color }]}
        />
        {campusLoading ? <Text style={{ color: muted, marginBottom: 8 }}>Searching...</Text> : null}
        {campusQuery.trim().length ? (
          <View style={[styles.suggestionList, { borderColor: border, backgroundColor: card }]}>
            {(campusResults.length ? campusResults : getLocationOptions('campus', campusQuery).slice(0, 8)).map((option) => (
              <Pressable
                key={option}
                onPress={() => {
                  setCampus(option);
                  setCampusQuery(option);
                  setCampusTouched(true);
                }}
                style={({ pressed }) => [
                  styles.locationRow,
                  { borderColor: border, backgroundColor: pressed ? highlight : 'transparent' },
                ]}
              >
                <Text style={{ color, fontWeight: '600' }}>{option}</Text>
              </Pressable>
            ))}
            {!campusResults.length && !campusLoading ? (
              <Text style={{ color: muted, marginTop: 8 }}>No matches yet.</Text>
            ) : null}
          </View>
        ) : (
          <Text style={{ color: muted, marginBottom: 8 }}>Add a campus to meet classmates.</Text>
        )}

        <Pressable
          onPress={doRegister}
          style={[styles.primaryButton, { backgroundColor: primary }, (!canSubmit || submitting) ? { opacity: 0.5 } : null]}
          disabled={!canSubmit || submitting}
        >
          <Text style={styles.primaryText}>
            {submitting
              ? 'Creating...'
              : !canSubmit
                ? 'Complete details'
                : authMode === 'phone'
                  ? 'Verify & create'
                  : 'Create account'}
          </Text>
        </Pressable>
        <View style={{ height: 12 }} />
        <Text style={{ color: muted, fontSize: 12 }}>
          By continuing you agree to our{' '}
          <Text onPress={() => router.push('/terms')} style={{ color: primary, fontWeight: '600' }}>Terms</Text>
          {' '}and{' '}
          <Text onPress={() => router.push('/privacy')} style={{ color: primary, fontWeight: '600' }}>Privacy Policy</Text>.
        </Text>
        <View style={{ height: 12 }} />
          <Pressable onPress={() => router.push('/signin')}>
            <Text style={{ color: primary, fontWeight: '600' }}>Already have an account? Sign in</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  scroll: { paddingHorizontal: 20 },
  input: { borderWidth: 1, padding: 12, borderRadius: 14, marginBottom: 12 },
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
  modeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, ...gapStyle(10) },
  modeButton: { flex: 1, paddingVertical: 10, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  inlineButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  primaryButton: {
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#FFFFFF', fontWeight: '700' },
});
