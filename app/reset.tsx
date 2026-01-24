import { ThemedView } from '@/components/themed-view';
import { Body, H1, Label } from '@/components/ui/typography';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ResetPassword() {
  const { resetPassword } = useAuth();
  const insets = useSafeAreaInsets();
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');
  const primary = useThemeColor({}, 'primary');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!email) return;
    try {
      setLoading(true);
      await resetPassword(email.trim());
      setStatus('If that email exists, a reset link has been sent.');
    } catch (e: any) {
      setStatus(e?.message || 'Unable to request reset.');
    } finally {
      setLoading(false);
    }
  }

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
          <Label style={{ color: muted, marginBottom: 8 }}>Account</Label>
          <H1 style={{ color: text }}>Reset password</H1>
          <Body style={{ color: muted, marginTop: 6 }}>Enter your email and we’ll send a reset link.</Body>
          <View style={{ height: 12 }} />
          <TextInput
            placeholder="you@school.edu"
            placeholderTextColor={muted}
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (status) setStatus(null);
            }}
            keyboardType="email-address"
            autoCapitalize="none"
            style={[styles.input, { borderColor: border, backgroundColor: card, color: text }]}
          />
          <View style={{ height: 10 }} />
          <Pressable onPress={submit} style={[styles.button, { backgroundColor: primary }]} disabled={loading}>
            <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{loading ? 'Sending…' : 'Send reset link'}</Text>
          </Pressable>
          {status ? <Body style={{ color: muted, marginTop: 10 }}>{status}</Body> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  input: { borderWidth: 1, padding: 12, borderRadius: 12 },
  button: { paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
});
