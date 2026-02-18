import { ThemedView } from '@/components/themed-view';
import { Atmosphere } from '@/components/ui/atmosphere';
import { H1, Label } from '@/components/ui/typography';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useThemePreference } from '@/contexts/ThemePreferenceContext';
import { tokens } from '@/constants/tokens';
import { useThemeColor } from '@/hooks/use-theme-color';
import { clearPushToken, deleteAccountAndData, isFirebaseConfigured, savePushToken } from '@/services/firebaseClient';
import { requestForegroundLocation } from '@/services/location';
import { clearNotificationHandlers, registerForPushNotificationsAsync } from '@/services/notifications';
import { getLocationEnabled, getNotificationsEnabled, setLocationEnabled, setNotificationsEnabled } from '@/storage/local';
import { withAlpha } from '@/utils/colors';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import * as ExpoLinking from 'expo-linking';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { showToast } = useToast();
  const { preference, setPreference } = useThemePreference();

  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');
  const primary = useThemeColor({}, 'primary');
  const danger = useThemeColor({}, 'danger');
  const highlight = withAlpha(primary, 0.1);

  const extra = ((Constants.expoConfig as any)?.extra || {}) as Record<string, any>;
  const supportEmail = (extra.SUPPORT_EMAIL as string) || 'perchedappteam@gmail.com';

  const [notificationsEnabled, setNotificationsEnabledState] = useState(false);
  const [locationEnabled, setLocationEnabledState] = useState(true);
  const fbAvailable = isFirebaseConfigured();
  const locationToggleInFlight = useRef(false);

  useEffect(() => {
    void (async () => {
      try {
        const notifications = await getNotificationsEnabled();
        const location = await getLocationEnabled();
        setNotificationsEnabledState(!!notifications);
        setLocationEnabledState(!!location);
      } catch {
        setNotificationsEnabledState(false);
        setLocationEnabledState(true);
      }
    })();
  }, []);

  const appearanceLabel = useMemo(() => {
    if (preference === 'system') return 'System';
    if (preference === 'light') return 'Light';
    return 'Dark';
  }, [preference]);

  function cycleTheme() {
    const order: ('system' | 'light' | 'dark')[] = ['system', 'light', 'dark'];
    const currentIndex = order.indexOf(preference);
    const next = order[(currentIndex + 1) % order.length];
    setPreference(next);
  }

  async function toggleNotifications() {
    const next = !notificationsEnabled;
    setNotificationsEnabledState(next);
    await setNotificationsEnabled(next);

    if (!fbAvailable || !user) return;

    if (next) {
      try {
        await clearNotificationHandlers();
        const token = await registerForPushNotificationsAsync();
        if (token) await savePushToken(user.id, token);
      } catch {
        showToast('Unable to enable notifications right now.', 'warning');
      }
    } else {
      try {
        await clearPushToken(user.id);
      } catch {}
    }
  }

  async function toggleLocation() {
    if (locationToggleInFlight.current) return;
    locationToggleInFlight.current = true;

    try {
      const next = !locationEnabled;
      if (!next) {
        setLocationEnabledState(false);
        await setLocationEnabled(false);
        showToast('Location off.', 'info');
        return;
      }

      const pos = await requestForegroundLocation({ ignoreCache: true }).catch(() => null);
      if (!pos) {
        setLocationEnabledState(false);
        await setLocationEnabled(false);
        showToast('Location unavailable. Enable it in system settings.', 'warning');
        await ExpoLinking.openSettings().catch(() => {});
        return;
      }

      setLocationEnabledState(true);
      await setLocationEnabled(true);
      showToast('Location on.', 'success');
    } finally {
      locationToggleInFlight.current = false;
    }
  }

  async function runDeleteAccount(password?: string) {
    if (!user) return;
    if (!fbAvailable) {
      showToast('Firebase not configured. Unable to delete account.', 'error');
      return;
    }

    try {
      showToast('Deleting account…', 'info');
      await deleteAccountAndData({ password });
      await signOut().catch(() => {});
      showToast('Account deleted.', 'success');
      router.replace('/signin');
    } catch (error: any) {
      if (error?.code === 'auth/requires-recent-login') {
        showToast('Please sign in again before deleting your account.', 'warning');
        return;
      }
      showToast('Unable to delete account right now.', 'error');
    }
  }

  function confirmDeleteAccount() {
    if (!user) return;

    Alert.alert(
      'Delete account?',
      'This permanently deletes your account and check-ins. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (user.email) {
              Alert.prompt(
                'Confirm password',
                'Enter your password to delete your account.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: (value?: string) => void runDeleteAccount(value || undefined),
                  },
                ],
                'secure-text'
              );
              return;
            }
            void runDeleteAccount();
          },
        },
      ]
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Atmosphere />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Label style={{ color: muted, marginBottom: 8 }}>Settings</Label>
        <H1 style={{ color: text, marginBottom: 10 }}>Settings</H1>

        <View style={[styles.card, { borderColor: border, backgroundColor: card }]}> 
          <SettingRow
            label="Account"
            value={!user ? 'Not signed in' : user.email || user.phone || 'Signed in'}
            onPress={() => router.push(user ? '/upgrade' : '/signin')}
            borderColor={border}
            highlight={highlight}
            textColor={text}
            mutedColor={muted}
          />
          <SettingRow
            label="Appearance"
            value={appearanceLabel}
            onPress={cycleTheme}
            borderColor={border}
            highlight={highlight}
            textColor={text}
            mutedColor={muted}
          />
          <SettingToggleRow
            label="Notifications"
            value={notificationsEnabled ? 'On' : 'Off'}
            enabled={notificationsEnabled}
            onToggle={toggleNotifications}
            borderColor={border}
            highlight={highlight}
            textColor={text}
            mutedColor={muted}
          />
          <SettingToggleRow
            label="Location"
            value={locationEnabled ? 'On' : 'Off'}
            enabled={locationEnabled}
            onToggle={toggleLocation}
            borderColor={border}
            highlight={highlight}
            textColor={text}
            mutedColor={muted}
          />
        </View>

        <View style={{ height: 14 }} />

        <View style={[styles.card, { borderColor: border, backgroundColor: card }]}> 
          <SettingRow
            label="Privacy Policy"
            value="View"
            onPress={() => router.push('/privacy')}
            borderColor={border}
            highlight={highlight}
            textColor={text}
            mutedColor={muted}
          />
          <SettingRow
            label="Terms of Service"
            value="View"
            onPress={() => router.push('/terms')}
            borderColor={border}
            highlight={highlight}
            textColor={text}
            mutedColor={muted}
          />
          <SettingRow
            label="Support"
            value={supportEmail}
            onPress={() => router.push('/support')}
            borderColor={border}
            highlight={highlight}
            textColor={text}
            mutedColor={muted}
          />
        </View>

        <View style={{ height: 18 }} />

        {user ? (
          <>
            <Pressable
              onPress={async () => {
                try {
                  await signOut();
                  showToast('Signed out.', 'success');
                  router.replace('/signin');
                } catch {
                  showToast('Unable to sign out.', 'error');
                }
              }}
              style={({ pressed }) => [
                styles.dangerRow,
                {
                  borderColor: withAlpha(danger, 0.35),
                  backgroundColor: pressed ? withAlpha(danger, 0.12) : card,
                },
              ]}
            >
              <Text style={{ color: danger, fontWeight: '700' }}>Sign out</Text>
            </Pressable>

            <View style={{ height: 12 }} />
            <Pressable
              onPress={confirmDeleteAccount}
              style={({ pressed }) => [
                styles.dangerRow,
                {
                  borderColor: withAlpha(danger, 0.35),
                  backgroundColor: pressed ? withAlpha(danger, 0.12) : card,
                },
              ]}
            >
              <Text style={{ color: danger, fontWeight: '700' }}>Delete account</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={() => router.push('/signin')}
            style={({ pressed }) => [
              styles.dangerRow,
              {
                borderColor: withAlpha(primary, 0.35),
                backgroundColor: pressed ? withAlpha(primary, 0.12) : card,
              },
            ]}
          >
            <Text style={{ color: primary, fontWeight: '700' }}>Sign in</Text>
          </Pressable>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </ThemedView>
  );
}

function SettingRow({
  label,
  value,
  onPress,
  borderColor,
  highlight,
  textColor,
  mutedColor,
}: {
  label: string;
  value?: string;
  onPress: () => void;
  borderColor: string;
  highlight: string;
  textColor: string;
  mutedColor: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderColor }, pressed ? { backgroundColor: highlight } : null]}
    >
      <Text style={{ color: textColor, fontWeight: '600' }}>{label}</Text>
      <Text style={{ color: mutedColor }}>{value || '›'}</Text>
    </Pressable>
  );
}

function SettingToggleRow({
  label,
  value,
  enabled,
  onToggle,
  borderColor,
  highlight,
  textColor,
  mutedColor,
}: {
  label: string;
  value?: string;
  enabled: boolean;
  onToggle: () => void;
  borderColor: string;
  highlight: string;
  textColor: string;
  mutedColor: string;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={({ pressed }) => [styles.row, { borderColor }, pressed ? { backgroundColor: highlight } : null]}
    >
      <View style={{ flex: 1, paddingRight: tokens.space.s12 }}>
        <Text style={{ color: textColor, fontWeight: '600' }}>{label}</Text>
        {value ? <Text style={{ color: mutedColor, marginTop: 2 }}>{value}</Text> : null}
      </View>
      <Switch value={enabled} onValueChange={onToggle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  card: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dangerRow: {
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
