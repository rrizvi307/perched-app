import { ThemedView } from '@/components/themed-view';
import { Body, H1, Label } from '@/components/ui/typography';
import { useToast } from '@/contexts/ToastContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { openExternalLink } from '@/services/externalLinks';
import Ionicons from '@expo/vector-icons/Ionicons';
import Constants from 'expo-constants';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function Support() {
  const insets = useSafeAreaInsets();
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const card = useThemeColor({}, 'card');
  const border = useThemeColor({}, 'border');
  const primary = useThemeColor({}, 'primary');
  const { showToast } = useToast();
  const supportEmail = ((Constants.expoConfig as any)?.extra?.SUPPORT_EMAIL as string) || 'perchedappteam@gmail.com';
  const instagramUrl = ((Constants.expoConfig as any)?.extra?.INSTAGRAM_URL as string) || '';
  const tiktokUrl = ((Constants.expoConfig as any)?.extra?.TIKTOK_URL as string) || '';

  async function openLinkWithFeedback(url: string, label: string) {
    const opened = await openExternalLink(url);
    if (!opened) {
      showToast(`Unable to open ${label}.`, 'warning');
    }
    return opened;
  }

  async function emailSupport(subject: string) {
    if (!supportEmail) {
      showToast('Support email is not configured.', 'warning');
      return;
    }
    const mailto = `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}`;
    await openLinkWithFeedback(mailto, 'email app');
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: Math.max(insets.top + 12, 20) }]}>
      <Label style={{ color: muted, marginBottom: 8 }}>Support</Label>
      <H1 style={{ color: text }}>We're here to help</H1>
      <Body style={{ color: muted, marginTop: 6 }}>
        Reach out if something feels off or you want help with your account.
      </Body>

      <View style={{ height: 20 }} />

      {/* Email section */}
      <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
        <Text style={{ color: text, fontWeight: '700', fontSize: 16, marginBottom: 10 }}>Contact Us</Text>
        <Text style={{ color: muted, fontSize: 13, marginBottom: 14 }}>{supportEmail}</Text>

        <Pressable
          onPress={() => emailSupport('Support request - Perched')}
          style={({ pressed }) => [
            styles.fullButton,
            { backgroundColor: primary, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Ionicons name="mail-outline" size={18} color="#FFFFFF" />
          <Text style={styles.fullButtonText}>Email Us</Text>
        </Pressable>

        <Pressable
          onPress={() => emailSupport('Account deletion request - Perched')}
          style={({ pressed }) => [
            styles.linkButton,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Text style={{ color: muted, fontSize: 13, textDecorationLine: 'underline' }}>
            Request Account Deletion
          </Text>
        </Pressable>
      </View>

      {/* Social section */}
      {(instagramUrl || tiktokUrl) ? (
        <View style={[styles.card, { backgroundColor: card, borderColor: border, marginTop: 12 }]}>
          <Text style={{ color: text, fontWeight: '700', fontSize: 16, marginBottom: 12 }}>Follow Us</Text>

          {instagramUrl ? (
            <Pressable
              onPress={() => { void openLinkWithFeedback(instagramUrl, 'Instagram'); }}
              style={({ pressed }) => [
                styles.socialButton,
                { borderColor: border, opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <Ionicons name="logo-instagram" size={20} color={text} />
              <Text style={{ color: text, fontWeight: '600', marginLeft: 10, fontSize: 15 }}>Instagram</Text>
            </Pressable>
          ) : null}

          {tiktokUrl ? (
            <Pressable
              onPress={() => { void openLinkWithFeedback(tiktokUrl, 'TikTok'); }}
              style={({ pressed }) => [
                styles.socialButton,
                { borderColor: border, marginTop: instagramUrl ? 8 : 0, opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <Ionicons name="logo-tiktok" size={20} color={text} />
              <Text style={{ color: text, fontWeight: '600', marginLeft: 10, fontSize: 15 }}>TikTok</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16 },
  fullButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    width: '100%',
  },
  fullButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
    marginLeft: 8,
  },
  linkButton: {
    alignItems: 'center',
    marginTop: 14,
    paddingVertical: 4,
  },
  socialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
});
