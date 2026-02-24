import { ThemedView } from '@/components/themed-view';
import { Body, H1, Label } from '@/components/ui/typography';
import { useToast } from '@/contexts/ToastContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { openExternalLink } from '@/services/externalLinks';
import { gapStyle } from '@/utils/layout';
import Constants from 'expo-constants';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function Support() {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const card = useThemeColor({}, 'card');
  const border = useThemeColor({}, 'border');
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

  async function emailFeatureRequest() {
    if (!supportEmail) {
      showToast('Support email is not configured.', 'warning');
      return;
    }

    const subject = 'Feature request - Perched';
    const body = [
      'What problem are you trying to solve?',
      '',
      'What feature would you like?',
      '',
      'How would you use it?',
      '',
      'How often would you use it?',
      '',
      'Any examples from other apps?',
      '',
      'Device + OS (optional):',
      'App version (optional):',
    ].join('\n');
    const mailto = `mailto:${supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    await openLinkWithFeedback(mailto, 'email app');
  }

  function ActionButton({
    label,
    icon,
    onPress,
  }: {
    label: string;
    icon: ComponentProps<typeof FontAwesome5>['name'];
    onPress: () => void;
  }) {
    return (
      <Pressable
        hitSlop={8}
        onPress={onPress}
        style={({ pressed }) => [
          styles.actionButton,
          { borderColor: border, backgroundColor: pressed ? card : 'transparent' },
          pressed ? { opacity: 0.7 } : null,
        ]}
      >
        <FontAwesome5 name={icon} size={14} color={text} />
        <Text style={{ color: text, fontWeight: '700', fontSize: 13 }}>{label}</Text>
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
          <View style={styles.actionRow}>
            <ActionButton label="Support" icon="life-ring" onPress={() => emailSupport('Support request')} />
            <ActionButton label="Report Bug" icon="bug" onPress={() => emailSupport('Bug report')} />
            <ActionButton label="Feature Request" icon="lightbulb" onPress={() => emailFeatureRequest()} />
            <ActionButton label="Delete Account" icon="user-slash" onPress={() => emailSupport('Account deletion request')} />
          </View>
        ) : null}
      </View>
      {(instagramUrl || tiktokUrl) ? (
        <View style={[styles.card, { backgroundColor: card, borderColor: border, marginTop: 12 }]}>
          <Text style={{ color: text, fontWeight: '700' }}>Follow</Text>
          <View style={styles.actionRow}>
            {instagramUrl ? (
              <ActionButton label="Instagram" icon="instagram" onPress={() => { void openLinkWithFeedback(instagramUrl, 'Instagram'); }} />
            ) : null}
            {tiktokUrl ? (
              <ActionButton label="TikTok" icon="tiktok" onPress={() => { void openLinkWithFeedback(tiktokUrl, 'TikTok'); }} />
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
  actionRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 10, ...gapStyle(10) },
  actionButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    ...gapStyle(8),
  },
});
