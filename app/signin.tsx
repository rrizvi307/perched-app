import { ThemedView } from '@/components/themed-view';
import { Atmosphere } from '@/components/ui/atmosphere';
import Logo from '@/components/logo';
import { Body, H1, Label } from '@/components/ui/typography';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useKeyboardHeight, useKeyboardVisible } from '@/hooks/use-keyboard-visible';
import { confirmPhoneAuth, getWebRecaptchaVerifier, isFirebaseConfigured, startPhoneAuth, FIREBASE_CONFIG } from '@/services/firebaseClient';
import { devLog } from '@/services/logger';
import { withAlpha } from '@/utils/colors';
import { gapStyle } from '@/utils/layout';
import { normalizePhone } from '@/utils/phone';
import { useRootNavigationState, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SignIn() {
  const insets = useSafeAreaInsets();
  const [authMode, setAuthMode] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { signInWithEmail, createDemoUser, user } = useAuth();
  const fbAvailable = isFirebaseConfigured();
  const passwordRef = useRef<TextInput>(null);
  const recaptchaVerifier = useRef<any>(null);
  const [RecaptchaModal, setRecaptchaModal] = useState<any>(null);
  const color = useThemeColor({}, 'text');
  const primary = useThemeColor({}, 'primary');
  const accent = useThemeColor({}, 'accent');
  const danger = useThemeColor({}, 'danger');
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');
  const background = useThemeColor({}, 'background');
  const primaryTextColor = '#FFFFFF';
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const muted = useThemeColor({}, 'muted');
  const isWeb = Platform.OS === 'web';
  const { height } = useWindowDimensions();
  const keyboardVisible = useKeyboardVisible();
  const keyboardHeight = useKeyboardHeight();
  const scrollRef = useRef<ScrollView>(null);
  const cardYRef = useRef(0);
  const passwordYRef = useRef(0);
  const phoneCodeYRef = useRef(0);
  const normalizedPhone = phone.trim() ? normalizePhone(phone.trim()) : null;
  const isPhoneValid = !!normalizedPhone;
  const supportsPhoneAuth = Platform.OS === 'web' || !!RecaptchaModal;
  const submitting = authMode === 'email' ? loading : verifyingCode;
  const compactHeader = keyboardVisible && Platform.OS !== 'web';
  const logoSize = compactHeader ? 44 : height < 740 ? 56 : 72;
  const titleSize = compactHeader ? 36 : height < 740 ? 44 : undefined;
  const extraScrollPad = Platform.OS === 'ios' ? Math.max(28, keyboardHeight + 28) : 28;
  const scrollToField = (fieldY: number) => {
    if (Platform.OS !== 'ios') return;
    const y = Math.max(0, cardYRef.current + fieldY - 80);
    // let the keyboard animation begin, then scroll
    setTimeout(() => scrollRef.current?.scrollTo({ y, animated: true }), 140);
  };

  React.useEffect(() => {
    if (Platform.OS === 'web') return;
    try {
      const req = eval('require');
      const mod = req('expo-firebase-recaptcha');
      if (mod?.FirebaseRecaptchaVerifierModal) {
        setRecaptchaModal(() => mod.FirebaseRecaptchaVerifierModal);
      }
    } catch {}
  }, []);

  React.useEffect(() => {
    setError(null);
    setVerificationId('');
    setSmsCode('');
    setSendingCode(false);
    setVerifyingCode(false);
  }, [authMode]);

  function getRecaptchaVerifier() {
    if (Platform.OS === 'web') {
      if (!recaptchaVerifier.current) {
        recaptchaVerifier.current = getWebRecaptchaVerifier('recaptcha-container-signin');
      }
      return recaptchaVerifier.current;
    }
    return recaptchaVerifier.current;
  }

  async function sendCode() {
    setError(null);
    if (!fbAvailable) {
      setError('Phone sign-in needs Firebase enabled.');
      return;
    }
    if (!isPhoneValid) {
      setError('Enter a valid phone number with area code.');
      return;
    }
    if (!normalizedPhone) {
      setError('Enter a valid phone number with area code.');
      return;
    }
    if (!supportsPhoneAuth) {
      setError("Phone verification isn't available on this device yet. Use email for now.");
      return;
    }
    const verifier = getRecaptchaVerifier();
    if (!verifier) {
      setError('Unable to initialize phone verification.');
      return;
    }
    setSendingCode(true);
    try {
      const res = await startPhoneAuth(normalizedPhone, verifier);
      setVerificationId(res.verificationId);
      setSmsCode('');
      setError(null);
    } catch (e: any) {
      devLog('phone auth start error', e);
      setError(e?.message || 'Unable to send code.');
    } finally {
      setSendingCode(false);
    }
  }

  async function doSignIn() {
    setError(null);
    if (authMode === 'phone') {
      if (!verificationId) {
        setError('Send the verification code first.');
        return;
      }
      if (!smsCode.trim()) {
        setError('Enter the verification code.');
        return;
      }
      setVerifyingCode(true);
      try {
        await confirmPhoneAuth(verificationId, smsCode.trim());
        setError(null);
      } catch (e: any) {
        devLog('signin phone error', e);
        setError(e?.message || 'Sign in failed');
      } finally {
        setVerifyingCode(false);
      }
      return;
    }

    setLoading(true);
    try {
      if (!email || !password) {
        setError('Please enter email and password');
        setLoading(false);
        return;
      }
      await signInWithEmail(email.trim(), password);
      setError(null);
    } catch (e: any) {
      devLog('signin error', e);
      const code = e?.code || '';
      const msg = code === 'auth/user-not-found' ? 'That account does not exist.' : code === 'auth/wrong-password' ? 'Incorrect password.' : e?.message || 'Sign in failed';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function useDemoAccount() {
    try {
      await createDemoUser(email || undefined);
    } catch (e) {
      devLog('demo sign-in failed', e);
      setError('Unable to sign in with demo account');
    }
  }

  React.useEffect(() => {
    if (!rootNavigationState?.key || !user) return;
    if (user.email && !user.emailVerified) {
      router.replace('/verify');
      return;
    }
    router.replace('/(tabs)/feed');
  }, [user, rootNavigationState?.key, router]);

  return (
    <ThemedView style={[styles.container, { backgroundColor: background }]}>
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
          <View style={styles.header}>
            <Logo size={logoSize} variant="mark" label="Perched" />
            <H1 style={{ color, marginBottom: 4, ...(titleSize ? { fontSize: titleSize, lineHeight: Math.round(titleSize * 1.1) } : null) }}>Perched</H1>
            {!compactHeader ? (
              <Body style={{ color, marginTop: 2, textAlign: 'center', maxWidth: 420 }}>
                Perched helps you share where you work or study and discover new spots nearby.
              </Body>
            ) : null}
          </View>

          <View
            onLayout={(e) => {
              cardYRef.current = e.nativeEvent.layout.y || 0;
            }}
            style={[styles.card, { backgroundColor: card, borderColor: border }]}
          >
            <View style={styles.createBlock}>
              <Text style={{ color: muted, fontWeight: '600' }}>New here?</Text>
              <Pressable onPress={() => router.push('/signup')} style={[styles.secondary, { borderColor: border }]}>
                <Text style={{ color: primary, fontWeight: '700' }}>Create account</Text>
              </Pressable>
            </View>
            <Label style={{ color, marginBottom: 6, opacity: 1 }}>Sign In</Label>
            {!fbAvailable ? (
              <View style={{ padding: 12, borderRadius: 10, backgroundColor: withAlpha(accent, 0.14), borderWidth: 1, borderColor: withAlpha(accent, 0.3), marginBottom: 12 }}>
                <Text style={{ color: accent, fontWeight: '600' }}>Demo mode — server auth not configured</Text>
                <Text style={{ color: accent, marginTop: 6 }}>Create an account will store locally in your browser. Use the demo button to sign in quickly.</Text>
                <View style={{ height: 8 }} />
                <Pressable onPress={useDemoAccount} style={{ padding: 8, borderRadius: 8, backgroundColor: accent, alignItems: 'center', marginTop: 6 }}>
                  <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Use demo account</Text>
                </Pressable>
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
              <View nativeID="recaptcha-container-signin" id="recaptcha-container-signin" style={{ height: 0 }} />
            ) : null}
            {authMode === 'email' ? (
              <>
                <View style={styles.fieldGroup}>
                  <Label style={{ color, opacity: 1 }}>Email</Label>
                  <TextInput
                    placeholder="Email"
                    placeholderTextColor={muted}
                    value={email}
                    onChangeText={setEmail}
                    style={[styles.input, { fontSize: 18, borderColor: border, backgroundColor: background, color }]}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    returnKeyType="next"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    onFocus={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
                    onKeyPress={(e) => {
                      if (!isWeb) return;
                      if (e.nativeEvent.key === 'Enter') passwordRef.current?.focus();
                    }}
                  />
                </View>
                <View
                  style={styles.fieldGroup}
                  onLayout={(e) => {
                    passwordYRef.current = e.nativeEvent.layout.y || 0;
                  }}
                >
                  <Label style={{ color, opacity: 1 }}>Password</Label>
                  <View style={styles.passwordRow}>
                    <TextInput
                      ref={passwordRef}
                      placeholder="Password"
                      placeholderTextColor={muted}
                      value={password}
                      onChangeText={setPassword}
                      style={[styles.input, styles.passwordInput, { fontSize: 18, borderColor: border, backgroundColor: background, color }]}
                      secureTextEntry={!showPassword}
                      returnKeyType="done"
                      onSubmitEditing={doSignIn}
                      onFocus={() => scrollToField(passwordYRef.current)}
                      onKeyPress={(e) => {
                        if (!isWeb) return;
                        if (e.nativeEvent.key === 'Enter') doSignIn();
                      }}
                    />
                    <Pressable onPress={() => setShowPassword((s) => !s)} style={[styles.passwordToggle, { borderColor: border }]}>
                      <Text style={{ color: primary, fontWeight: '600' }}>{showPassword ? 'Hide' : 'Show'}</Text>
                    </Pressable>
                  </View>
                </View>
              </>
            ) : (
              <>
                <View style={styles.fieldGroup}>
                  <Label style={{ color, opacity: 1 }}>Phone number</Label>
                  <TextInput
                    placeholder="+1 555 123 4567"
                    placeholderTextColor={muted}
                    value={phone}
                    onChangeText={setPhone}
                    style={[styles.input, { fontSize: 18, borderColor: border, backgroundColor: background, color }]}
                    keyboardType="phone-pad"
                    autoCapitalize="none"
                    returnKeyType="send"
                    onSubmitEditing={sendCode}
                  />
                  {!supportsPhoneAuth ? (
                    <Text style={{ color: muted, marginTop: 6 }}>Phone verification is available on web for now.</Text>
                  ) : null}
                  <Pressable
                    onPress={sendCode}
                    style={[styles.inlineButton, { borderColor: border }, (sendingCode || !supportsPhoneAuth) ? { opacity: 0.6 } : null]}
                    disabled={sendingCode || !supportsPhoneAuth}
                  >
                    <Text style={{ color: primary, fontWeight: '700' }}>{sendingCode ? 'Sending...' : verificationId ? 'Resend code' : 'Send code'}</Text>
                  </Pressable>
                </View>
                {verificationId ? (
                  <View
                    style={styles.fieldGroup}
                    onLayout={(e) => {
                      phoneCodeYRef.current = e.nativeEvent.layout.y || 0;
                    }}
                  >
                    <Label style={{ color, opacity: 1 }}>Verification code</Label>
                    <TextInput
                      placeholder="123456"
                      placeholderTextColor={muted}
                      value={smsCode}
                      onChangeText={setSmsCode}
                      style={[styles.input, { fontSize: 18, borderColor: border, backgroundColor: background, color }]}
                      keyboardType="number-pad"
                      returnKeyType="done"
                      onSubmitEditing={doSignIn}
                      onFocus={() => scrollToField(phoneCodeYRef.current)}
                    />
                  </View>
                ) : null}
              </>
            )}
            {authMode === 'email' ? (
              <Pressable onPress={() => router.push('/reset')} style={{ alignSelf: 'flex-start', marginTop: 6 }}>
                <Text style={{ color: primary, fontWeight: '600' }}>Forgot password?</Text>
              </Pressable>
            ) : null}

            {error ? <Body style={{ color: danger, marginTop: 8 }}>{error}</Body> : null}

            <Pressable onPress={doSignIn} style={[styles.primary, { backgroundColor: primary }, submitting ? { opacity: 0.6 } : undefined]} disabled={submitting}>
              <Text style={[styles.primaryText, { color: primaryTextColor }]}>{submitting ? 'Signing in...' : authMode === 'phone' ? 'Verify & sign in' : 'Sign in'}</Text>
            </Pressable>
            <View style={{ height: 10 }} />
            <Text style={{ color: muted, fontSize: 12 }}>
              By continuing you agree to our{' '}
              <Text onPress={() => router.push('/terms')} style={{ color: primary, fontWeight: '600' }}>Terms</Text>
              {' '}and{' '}
              <Text onPress={() => router.push('/privacy')} style={{ color: primary, fontWeight: '600' }}>Privacy Policy</Text>.
            </Text>

          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  input: { borderWidth: 1, padding: 14, borderRadius: 14, marginTop: 6, width: '100%' },
  primary: { height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginTop: 16, paddingHorizontal: 22, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 14, elevation: 4 },
  primaryText: { fontSize: 17, fontWeight: '700' },
  scroll: { paddingHorizontal: 20, alignItems: 'center' },
  header: { width: '100%', maxWidth: 720, alignItems: 'center', marginBottom: 14 },
  card: { width: '100%', maxWidth: 540, marginTop: 6, borderRadius: 20, padding: 20, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 14, elevation: 6, alignItems: 'stretch' },
  createBlock: { width: '100%', alignItems: 'center', marginBottom: 12 },
  secondary: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, borderWidth: 1, marginTop: 8 },
  linkRow: { width: '100%', alignItems: 'center', marginTop: 10 },
  fieldGroup: { width: '100%', maxWidth: 420, alignSelf: 'stretch', marginBottom: 12 },
  passwordRow: { flexDirection: 'row', alignItems: 'center', ...gapStyle(8) },
  passwordInput: { flex: 1 },
  passwordToggle: { paddingHorizontal: 12, paddingVertical: 12, borderRadius: 12, borderWidth: 1, marginTop: 6 },
  modeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, ...gapStyle(10) },
  modeButton: { flex: 1, paddingVertical: 10, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  inlineButton: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, marginTop: 8 },
});
