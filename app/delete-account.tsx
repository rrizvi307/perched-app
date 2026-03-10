import { ThemedView } from '@/components/themed-view';
import { Atmosphere } from '@/components/ui/atmosphere';
import { Body, H1, Label } from '@/components/ui/typography';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { withAlpha } from '@/utils/colors';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function mapDeletionError(error: any) {
  const code = String(error?.code || '');
  if (code === 'auth/wrong-password') return 'Current password is incorrect.';
  if (code === 'auth/weak-password') return 'Choose a stronger password before retrying this action.';
  if (code === 'auth/requires-recent-login') return 'Please sign in again, then retry account deletion.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Wait a bit, then try again.';
  return error?.message || 'Unable to delete your account right now.';
}

export default function DeleteAccountScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, deleteAccount } = useAuth();
  const { showToast } = useToast();

  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');
  const background = useThemeColor({}, 'background');
  const primary = useThemeColor({}, 'primary');
  const danger = useThemeColor({}, 'danger');

  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  const confirmationTarget = useMemo(() => {
    return user?.email?.trim() || 'DELETE';
  }, [user?.email]);
  const requiresPassword = !!user?.email;
  const confirmationLabel = requiresPassword ? 'Type your email to confirm' : 'Type DELETE to confirm';
  const confirmationHint = requiresPassword ? confirmationTarget : 'DELETE';
  const confirmationMatches = confirmation.trim() === confirmationTarget;
  const canDelete = confirmationMatches && (!requiresPassword || password.length > 0) && !deleting;

  async function handleDelete() {
    if (!user) {
      router.replace('/signin');
      return;
    }
    if (!confirmationMatches) {
      showToast(`Confirmation must exactly match ${confirmationHint}.`, 'warning');
      return;
    }
    if (requiresPassword && !password) {
      showToast('Enter your current password to continue.', 'warning');
      return;
    }

    try {
      setDeleting(true);
      await deleteAccount(requiresPassword ? password : undefined);
      showToast('Account deleted.', 'success');
      router.replace('/signin');
    } catch (error) {
      showToast(mapDeletionError(error), 'error');
    } finally {
      setDeleting(false);
    }
  }

  if (!user) {
    return (
      <ThemedView style={styles.container}>
        <Atmosphere />
        <View style={[styles.emptyState, { paddingTop: insets.top + 24 }]}>
          <H1 style={{ color: text }}>Delete account</H1>
          <Body style={{ color: muted, marginTop: 8 }}>
            Sign in first, then return here to manage account deletion.
          </Body>
          <Pressable
            onPress={() => router.replace('/signin')}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: primary, opacity: pressed ? 0.88 : 1, marginTop: 18 },
            ]}
          >
            <Text style={styles.primaryButtonText}>Go to sign in</Text>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Atmosphere />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            paddingTop: Math.max(insets.top + 16, 24),
            paddingBottom: insets.bottom + 28,
            paddingHorizontal: 20,
            flexGrow: 1,
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
          showsVerticalScrollIndicator={false}
        >
          <Label style={{ color: muted, marginBottom: 8 }}>Account</Label>
          <H1 style={{ color: text }}>Delete account</H1>
          <Body style={{ color: muted, marginTop: 6 }}>
            This permanently removes your profile, check-ins, and friend graph data from Perched.
          </Body>

          <View
            style={[
              styles.warningCard,
              {
                backgroundColor: card,
                borderColor: withAlpha(danger, 0.35),
              },
            ]}
          >
            <Text style={{ color: danger, fontWeight: '700', marginBottom: 10 }}>Before you continue</Text>
            <Text style={[styles.warningText, { color: text }]}>This action is permanent and cannot be undone.</Text>
            <Text style={[styles.warningText, { color: text }]}>Your public profile and uploaded content will be removed.</Text>
            <Text style={[styles.warningText, { color: text }]}>Access to the current account will end immediately.</Text>
          </View>

          <View style={[styles.formCard, { backgroundColor: card, borderColor: border }]}>
            <Label style={{ color: text }}>{confirmationLabel}</Label>
            <TextInput
              placeholder={confirmationHint}
              placeholderTextColor={muted}
              autoCapitalize="none"
              autoCorrect={false}
              value={confirmation}
              onChangeText={setConfirmation}
              style={[
                styles.input,
                {
                  borderColor: confirmation.length > 0 && !confirmationMatches ? danger : border,
                  backgroundColor: background,
                  color: text,
                },
              ]}
            />
            <Body style={{ color: muted, marginTop: 8 }}>
              Signed in as {user.email || user.handle || user.id}
            </Body>

            {requiresPassword ? (
              <>
                <View style={{ height: 16 }} />
                <Label style={{ color: text }}>Current password</Label>
                <TextInput
                  placeholder="Enter your current password"
                  placeholderTextColor={muted}
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  style={[styles.input, { borderColor: border, backgroundColor: background, color: text }]}
                />
              </>
            ) : null}

            <View style={{ height: 18 }} />

            <Pressable
              onPress={handleDelete}
              disabled={!canDelete}
              style={({ pressed }) => [
                styles.deleteButton,
                {
                  backgroundColor: danger,
                  opacity: !canDelete ? 0.45 : pressed ? 0.88 : 1,
                },
              ]}
            >
              <Text style={styles.deleteButtonText}>
                {deleting ? 'Deleting account...' : 'Delete account permanently'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [
                styles.secondaryButton,
                { borderColor: border, backgroundColor: pressed ? withAlpha(primary, 0.08) : 'transparent' },
              ]}
            >
              <Text style={{ color: text, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  emptyState: { flex: 1, paddingHorizontal: 20 },
  warningCard: {
    marginTop: 18,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  warningText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 6,
  },
  formCard: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    marginTop: 8,
  },
  deleteButton: {
    minHeight: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
});
