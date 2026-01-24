import { ThemedView } from '@/components/themed-view';
import { Atmosphere } from '@/components/ui/atmosphere';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { H1, Label } from '@/components/ui/typography';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useThemePreference } from '@/contexts/ThemePreferenceContext';
import { tokens } from '@/constants/tokens';
import { useThemeColor } from '@/hooks/use-theme-color';
import { clearPushToken, isFirebaseConfigured, savePushToken } from '@/services/firebaseClient';
import { requestForegroundLocation } from '@/services/location';
import { clearNotificationHandlers, registerForPushNotificationsAsync } from '@/services/notifications';
import { getDemoAutoApprove, getDemoModeEnabled, getLocationEnabled, getNotificationsEnabled, resetDemoNetwork, setDemoAutoApprove, setDemoModeEnabled, setLocationEnabled, setNotificationsEnabled } from '@/storage/local';
import { resetAndReseedDemo, setGlobalDemoMode } from '@/services/demoMode';
import { withAlpha } from '@/utils/colors';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import * as ExpoLinking from 'expo-linking';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { showToast } = useToast();
  const { preference, setPreference } = useThemePreference();
  const insets = useSafeAreaInsets();

  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');
  const primary = useThemeColor({}, 'primary');
  const danger = useThemeColor({}, 'danger');
  const highlight = withAlpha(primary, 0.1);

  const appVersion = (Constants.expoConfig as any)?.version || '1.0.0';
  const extra = ((Constants.expoConfig as any)?.extra || {}) as Record<string, any>;
  const supportEmail = (extra.SUPPORT_EMAIL as string) || 'perchedappteam@gmail.com';
  const instagramUrl = (extra.INSTAGRAM_URL as string) || 'https://instagram.com/perchedapp';
  const tiktokUrl = (extra.TIKTOK_URL as string) || 'https://tiktok.com/@perchedapp';

  const [notificationsEnabled, setNotificationsEnabledState] = useState(false);
  const [locationEnabled, setLocationEnabledState] = useState(true);
  const [demoAutoApprove, setDemoAutoApproveState] = useState(false);
  const [demoEnabled, setDemoEnabledState] = useState(false);
  const [showDemoTools, setShowDemoTools] = useState(false);
  const demoTapRef = useRef<{ count: number; lastAt: number }>({ count: 0, lastAt: 0 });
  const fbAvailable = isFirebaseConfigured();
  const locationToggleInFlight = useRef(false);
  const lastLocationFailureAt = useRef<number>(0);
  const lastOpenSettingsAt = useRef<number>(0);

  useEffect(() => {
    (async () => {
      try {
        const enabled = await getNotificationsEnabled();
        setNotificationsEnabledState(!!enabled);
        const locEnabled = await getLocationEnabled();
        setLocationEnabledState(!!locEnabled);
        const auto = await getDemoAutoApprove().catch(() => false);
        setDemoAutoApproveState(!!auto);
        const demoOn = await getDemoModeEnabled().catch(() => false);
        setDemoEnabledState(!!demoOn);
      } catch {}
    })();
  }, []);

  const appearanceLabel = useMemo(() => {
    if (preference === 'system') return 'System';
    if (preference === 'light') return 'Light';
    return 'Dark';
  }, [preference]);

  function cycleTheme() {
    const order: ('system' | 'light' | 'dark')[] = ['system', 'light', 'dark'];
    const idx = order.indexOf(preference);
    const next = order[(idx + 1) % order.length];
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
      } catch {}
    } else {
      try {
        await clearPushToken(user.id);
      } catch {}
    }
  }

  async function toggleLocation() {
    if (locationToggleInFlight.current) return;
    locationToggleInFlight.current = true;
    const next = !locationEnabled;
    try {
      if (!next) {
        setLocationEnabledState(false);
        await setLocationEnabled(false);
        showToast('Location off.', 'info');
        return;
      }
      try {
        const pos = await requestForegroundLocation();
        if (pos) {
          setLocationEnabledState(true);
          await setLocationEnabled(true);
          showToast('Location on.', 'success');
          return;
        }
      } catch {}
      setLocationEnabledState(false);
      await setLocationEnabled(false);
      const now = Date.now();
      if (now - lastLocationFailureAt.current > 5000) {
        lastLocationFailureAt.current = now;
        showToast('Location unavailable. Enable it in iOS Settings.', 'warning');
      }
      if (now - lastOpenSettingsAt.current > 5000) {
        lastOpenSettingsAt.current = now;
        try {
          await ExpoLinking.openSettings();
        } catch {}
      }
    } finally {
      locationToggleInFlight.current = false;
    }
  }

  async function inviteFriends() {
    try {
      const message = user?.handle
        ? `Join me on Perched — @${user.handle}\nDownload: https://perched.app`
        : 'Join me on Perched.\nDownload: https://perched.app';
      await Share.share({ message });
    } catch {}
  }

  async function shareProfile() {
    if (!user) return;
    const handle = user.handle ? `@${user.handle}` : user.email || 'Perched user';
    const deepLink = ExpoLinking.createURL('/profile-view', {
      queryParams: { uid: user.id, handle: user.handle || '' },
    });
    const message = `${handle} on Perched. Add me as a friend!\n${deepLink}`;
    try {
      await Share.share({ message });
    } catch {}
  }

  return (
    <ThemedView style={styles.container}>
      <Atmosphere />
      <View style={[styles.topBar, { paddingTop: Math.max(12, insets.top + 10) }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.backButton, pressed ? { opacity: 0.7 } : null]}
        >
          <IconSymbol name="chevron.left" size={22} color={muted} />
          <Text style={{ color: muted, fontWeight: '600', marginLeft: 4 }}>Profile</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Label style={{ color: muted, marginBottom: 8 }}>Settings</Label>
        <H1 style={{ color: text, marginBottom: 10 }}>Settings</H1>

        {!fbAvailable ? (
          <View style={[styles.notice, { borderColor: withAlpha(primary, 0.35), backgroundColor: withAlpha(primary, 0.12) }]}>
            <Text style={{ color: primary, fontWeight: '700' }}>Demo mode</Text>
            <Text style={{ color: muted, marginTop: 6 }}>Some settings won’t sync until Firebase is fully configured.</Text>
          </View>
        ) : null}

        <View style={[styles.card, { borderColor: border, backgroundColor: card }]}>
          <SettingRow
            label="Account & security"
            value={!user ? 'Not signed in' : user.email ? user.email : user.phone ? user.phone : 'Account'}
            onPress={() => router.push('/upgrade')}
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
          {!fbAvailable ? (
            <SettingToggleRow
              label="Auto-approve demo posts"
              value={demoAutoApprove ? 'On' : 'Off'}
              enabled={demoAutoApprove}
              onToggle={async () => {
                const next = !demoAutoApprove;
                setDemoAutoApproveState(next);
                try { await setDemoAutoApprove(next); } catch {}
                showToast(next ? 'Demo posts auto-approved.' : 'Demo posts will require approval.', 'info');
              }}
              borderColor={border}
              highlight={highlight}
              textColor={text}
              mutedColor={muted}
            />
          ) : null}
        </View>

        <View style={{ height: 14 }} />

        <View style={[styles.card, { borderColor: border, backgroundColor: card }]}>
          <SettingRow
            label="Invite friends"
            value="Share"
            onPress={inviteFriends}
            borderColor={border}
            highlight={highlight}
            textColor={text}
            mutedColor={muted}
          />
          <SettingRow
            label="Share profile"
            value="Share"
            onPress={shareProfile}
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
            value="Help"
            onPress={() => router.push('/support')}
            borderColor={border}
            highlight={highlight}
            textColor={text}
            mutedColor={muted}
          />
        </View>

        <View style={{ height: 14 }} />

        <View style={[styles.card, { borderColor: border, backgroundColor: card }]}>
          <SettingRow
            label="Follow on Instagram"
            value="@perchedapp"
            onPress={() => ExpoLinking.openURL(instagramUrl)}
            borderColor={border}
            highlight={highlight}
            textColor={text}
            mutedColor={muted}
          />
          <SettingRow
            label="Follow on TikTok"
            value="@perchedapp"
            onPress={() => ExpoLinking.openURL(tiktokUrl)}
            borderColor={border}
            highlight={highlight}
            textColor={text}
            mutedColor={muted}
          />
          <SettingRow
            label="Email"
            value={supportEmail}
            onPress={() => ExpoLinking.openURL(`mailto:${supportEmail}`)}
            borderColor={border}
            highlight={highlight}
            textColor={text}
            mutedColor={muted}
          />
        </View>

        <View style={{ height: 18 }} />

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
            { borderColor: withAlpha(danger, 0.35), backgroundColor: pressed ? withAlpha(danger, 0.12) : card },
          ]}
        >
          <Text style={{ color: danger, fontWeight: '700' }}>Sign out</Text>
        </Pressable>

        <View style={{ height: 12 }} />
        <Pressable
          onPress={() => {
            const now = Date.now();
            const within = now - demoTapRef.current.lastAt < 1500;
            demoTapRef.current.lastAt = now;
            demoTapRef.current.count = within ? demoTapRef.current.count + 1 : 1;
            if (demoTapRef.current.count >= 7) {
              demoTapRef.current.count = 0;
              setShowDemoTools((p) => !p);
            }
          }}
          style={({ pressed }) => [pressed ? { opacity: 0.7 } : null]}
        >
          <Text style={{ color: muted, fontSize: 12, textAlign: 'center' }}>Version {appVersion}</Text>
        </Pressable>
        {showDemoTools ? (
          <>
            <View style={{ height: 14 }} />
            <View style={[styles.card, { borderColor: border, backgroundColor: card }]}>
              <SettingToggleRow
                label="Film-ready demo mode"
                value={demoEnabled ? 'On' : 'Off'}
                enabled={demoEnabled}
                onToggle={async () => {
                  const next = !demoEnabled;
                  showToast(next ? 'Demo mode enabled.' : 'Demo mode disabled.', 'info');
                  setDemoEnabledState(next);
                  try {
                    await setDemoModeEnabled(next);
                    if (next) {
                      await resetAndReseedDemo(user?.id);
                    } else {
                      setGlobalDemoMode(false);
                    }
                  } catch {}
                }}
                borderColor={border}
                highlight={highlight}
                textColor={text}
                mutedColor={muted}
              />
              <SettingRow
                label="Refresh demo content"
                value="Run"
                onPress={async () => {
                  showToast('Refreshing demo content…', 'info');
                  try {
                    await setDemoModeEnabled(true);
                    setDemoEnabledState(true);
                    await resetAndReseedDemo(user?.id);
                  } catch {}
                }}
                borderColor={border}
                highlight={highlight}
                textColor={text}
                mutedColor={muted}
              />
              <SettingRow
                label="Clear demo content"
                value="Clear"
                onPress={async () => {
                  showToast('Clearing demo content…', 'info');
                  try {
                    await resetDemoNetwork();
                  } catch {}
                }}
                borderColor={border}
                highlight={highlight}
                textColor={text}
                mutedColor={muted}
              />
            </View>
          </>
        ) : null}
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
      style={({ pressed }) => [
        styles.row,
        { borderColor },
        pressed ? { backgroundColor: highlight } : null,
      ]}
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
      style={({ pressed }) => [
        styles.row,
        { borderColor },
        pressed ? { backgroundColor: highlight } : null,
      ]}
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
  topBar: { paddingHorizontal: 16, paddingBottom: 6 },
  backButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
  notice: { borderWidth: 1, padding: 12, borderRadius: 16, marginBottom: 12 },
  card: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  row: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dangerRow: { borderWidth: 1, paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
