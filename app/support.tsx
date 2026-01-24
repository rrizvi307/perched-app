import { ThemedView } from '@/components/themed-view';
import { Body, H1, Label } from '@/components/ui/typography';
import { useThemeColor } from '@/hooks/use-theme-color';
import { gapStyle } from '@/utils/layout';
import Constants from 'expo-constants';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';

export default function Support() {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const card = useThemeColor({}, 'card');
  const border = useThemeColor({}, 'border');
  const supportEmail = ((Constants.expoConfig as any)?.extra?.SUPPORT_EMAIL as string) || '';
  const instagramUrl = ((Constants.expoConfig as any)?.extra?.INSTAGRAM_URL as string) || '';
  const tiktokUrl = ((Constants.expoConfig as any)?.extra?.TIKTOK_URL as string) || '';

  async function emailSupport(subject: string) {
    if (!supportEmail) return;
    const mailto = `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}`;
    try {
      await Linking.openURL(mailto);
    } catch {}
  }

  function SocialIcon({ label, onPress }: { label: string; onPress: () => void }) {
    return (
      <Pressable onPress={onPress} style={[styles.iconButton, { borderColor: border }]}>
        <Text style={{ color: text, fontWeight: '800', letterSpacing: 1 }}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Label style={{ color: muted, marginBottom: 8 }}>Support</Label>
      <H1 style={{ color: text }}>We’re here to help</H1>
      <Body style={{ color: muted, marginTop: 6 }}>
        Reach out if something feels off or you want help with your account.
      </Body>
      <View style={{ height: 16 }} />
      <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
        <Text style={{ color: text, fontWeight: '700' }}>Email</Text>
        <Text style={{ color: muted, marginTop: 6 }}>{supportEmail || 'Add SUPPORT_EMAIL in app.json'}</Text>
        {supportEmail ? (
          <>
            <View style={styles.iconRow}>
              <SocialIcon label="@" onPress={() => emailSupport('Support request')} />
              <Pressable onPress={() => emailSupport('Support request')} style={styles.iconLabel}>
                <Text style={{ color: muted }}>Support</Text>
              </Pressable>
              <SocialIcon label="BUG" onPress={() => emailSupport('Bug report')} />
              <Pressable onPress={() => emailSupport('Bug report')} style={styles.iconLabel}>
                <Text style={{ color: muted }}>Report bug</Text>
              </Pressable>
              <SocialIcon label="DEL" onPress={() => emailSupport('Account deletion request')} />
              <Pressable onPress={() => emailSupport('Account deletion request')} style={styles.iconLabel}>
                <Text style={{ color: muted }}>Delete</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </View>
      {(instagramUrl || tiktokUrl) ? (
        <View style={[styles.card, { backgroundColor: card, borderColor: border, marginTop: 12 }]}>
          <Text style={{ color: text, fontWeight: '700' }}>Follow</Text>
          <View style={styles.iconRow}>
            {instagramUrl ? (
              <>
                <SocialIcon label="IG" onPress={() => Linking.openURL(instagramUrl)} />
                <Pressable onPress={() => Linking.openURL(instagramUrl)} style={styles.iconLabel}>
                  <Text style={{ color: muted }}>Instagram</Text>
                </Pressable>
              </>
            ) : null}
            {tiktokUrl ? (
              <>
                <SocialIcon label="TT" onPress={() => Linking.openURL(tiktokUrl)} />
                <Pressable onPress={() => Linking.openURL(tiktokUrl)} style={styles.iconLabel}>
                  <Text style={{ color: muted }}>TikTok</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: card, borderColor: border, marginTop: 12 }]}>
          <Text style={{ color: text, fontWeight: '700' }}>Follow</Text>
          <Text style={{ color: muted, marginTop: 6 }}>Add social links in app.json to show here.</Text>
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14 },
  iconRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 10, ...gapStyle(10) },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLabel: { paddingRight: 10 },
});
