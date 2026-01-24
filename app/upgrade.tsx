import { ThemedView } from '@/components/themed-view';
import { Body, H1 } from '@/components/ui/typography';
import { Button } from '@/components/button';
import { tokens } from '@/constants/tokens';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function scorePassword(pw: string) {
  if (!pw) return { label: '', score: 0 };
  let score = 0;
  if (pw.length >= 8) score += 1;
  if (/[A-Z]/.test(pw)) score += 1;
  if (/[0-9]/.test(pw)) score += 1;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  const label = score <= 1 ? 'Weak' : score === 2 ? 'Okay' : score === 3 ? 'Good' : 'Strong';
  return { label, score };
}

export default function UpgradeAccount() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const { register, signInWithEmail, changePassword, deleteAccount, user } = useAuth();
  const color = useThemeColor({}, 'text');
  const border = useThemeColor({}, 'border');
  const background = useThemeColor({}, 'background');
  const danger = useThemeColor({}, 'danger');

  function isValidEmail(e: string) {
    return /\S+@\S+\.\S+/.test(e);
  }

  async function handleUpgrade() {
    setEmailError('');
    setPasswordError('');
    if (!email || !password) {
      if (!email) setEmailError('Email required');
      if (!password) setPasswordError('Password required');
      return;
    }
    if (!isValidEmail(email)) {
      setEmailError('Enter a valid email');
      return;
    }
    if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }
    try {
      await register(email.trim(), password, user?.name || undefined, user?.city || undefined, user?.handle, user?.campusType || 'city', user?.campus || undefined, user?.phone || undefined);
      Alert.alert('Success', 'Account created. Check your email to verify.');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Upgrade failed');
    }
  }

  async function handleSignIn() {
    setEmailError('');
    setPasswordError('');
    if (!email || !password) {
      if (!email) setEmailError('Email required');
      if (!password) setPasswordError('Password required');
      return;
    }
    if (!isValidEmail(email)) {
      setEmailError('Enter a valid email');
      return;
    }
    try {
      await signInWithEmail(email, password);
    } catch (e: any) {
      Alert.alert('Sign in failed', e.message || 'Unable to sign in');
    }
  }


  async function handleChangePassword() {
    if (!newPassword) return Alert.alert('Validation', 'Provide a new password');
    try {
      // attempt with reauth if currentPassword provided
      await changePassword(newPassword, currentPassword || undefined);
      Alert.alert('Success', 'Password changed');
      setNewPassword('');
      setCurrentPassword('');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Unable to change password');
    }
  }

  async function handleDeleteAccount() {
    if (!user) return;
    if (!currentPassword) {
      Alert.alert('Confirm', 'Enter your current password to delete this account.');
      return;
    }
    Alert.alert('Delete account?', 'This will permanently delete your account and check-ins. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAccount(currentPassword);
          } catch (e: any) {
            Alert.alert('Error', e.message || 'Unable to delete account');
          }
        },
      },
    ]);
  }

  const styles = {
    container: { flex: 1, padding: 20 },
    input: { borderWidth: 1, padding: 12, borderRadius: 10, marginTop: 12, fontSize: tokens.type.body.fontSize },
  } as const;

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          showsVerticalScrollIndicator={false}
        >
          <H1 style={{ color }}>Account</H1>
          <Body style={{ color, marginTop: 8 }}>Upgrade anonymous account to an email-password account or sign in.</Body>

          {!user?.email ? (
            <>
              <TextInput
                placeholder="Email"
                value={email}
                onChangeText={(v) => {
                  setEmail(v);
                  setEmailError('');
                }}
                style={[styles.input, { borderColor: border, backgroundColor: background, color }]}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              {emailError ? <Body style={{ color: danger, marginTop: 6 }}>{emailError}</Body> : null}
              <TextInput
                placeholder="Password"
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  setPasswordError('');
                }}
                style={[styles.input, { borderColor: border, backgroundColor: background, color }]}
                secureTextEntry
              />
              {password ? <PasswordMeter pw={password} /> : null}
              {passwordError ? <Body style={{ color: danger, marginTop: 6 }}>{passwordError}</Body> : null}

              <Button onPress={handleUpgrade}>Upgrade Account</Button>
              <View style={{ height: 12 }} />
              <Button onPress={handleSignIn} variant="secondary">
                Sign in with Email
              </Button>
            </>
          ) : (
            <>
              <Body style={{ color, marginTop: 12 }}>Signed in as {user.email}</Body>
              <TextInput
                placeholder="Current password (for sensitive actions)"
                value={currentPassword}
                onChangeText={setCurrentPassword}
                style={[styles.input, { borderColor: border, backgroundColor: background, color }]}
                secureTextEntry
              />
              <TextInput
                placeholder="New password"
                value={newPassword}
                onChangeText={setNewPassword}
                style={[styles.input, { borderColor: border, backgroundColor: background, color }]}
                secureTextEntry
              />
              {newPassword ? (
                <>
                  <PasswordMeter pw={newPassword} />
                  <Body style={{ color, marginTop: 8 }}>{scorePassword(newPassword).label}</Body>
                </>
              ) : null}
              <Button onPress={handleChangePassword}>Change password</Button>
              <View style={{ height: 12 }} />
              <Button onPress={handleDeleteAccount} style={{ backgroundColor: danger }}>
                Delete account
              </Button>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

function PasswordMeter({ pw }: { pw: string }) {
  const { score } = scorePassword(pw);
  const pct = (score / 4) * 100;
  const danger = useThemeColor({}, 'danger');
  const accent = useThemeColor({}, 'accent');
  const primary = useThemeColor({}, 'primary');
  const success = useThemeColor({}, 'success');
  const color = score <= 1 ? danger : score === 2 ? accent : score === 3 ? primary : success;
  const border = useThemeColor({}, 'border');
  return (
    <View style={{ height: 8, backgroundColor: border, borderRadius: 4, marginTop: 8, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color }} />
    </View>
  );
}
