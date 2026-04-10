import { ThemedView } from '@/components/themed-view';
import { Atmosphere } from '@/components/ui/atmosphere';
import { Body, H1, Label } from '@/components/ui/typography';
import { useThemeColor } from '@/hooks/use-theme-color';
import Constants from 'expo-constants';
import { ScrollView, StyleSheet, View } from 'react-native';

export default function TermsOfService() {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const supportEmail = ((((Constants.expoConfig as any)?.extra) || {}).SUPPORT_EMAIL as string) || 'perchedappteam@gmail.com';

  return (
    <ThemedView style={styles.container}>
      <Atmosphere />
      <ScrollView contentContainerStyle={styles.content}>
        <Label style={{ color: muted, marginBottom: 8 }}>Terms</Label>
        <H1 style={{ color: text }}>Terms of Service</H1>

        <Body style={{ color: text, fontWeight: '700', marginTop: 16 }}>Acceptance</Body>
        <Body style={{ color: muted }}>
          By creating an account or using Perched, you agree to these terms. If you do not agree, do not use the app.
        </Body>

        <Body style={{ color: text, fontWeight: '700', marginTop: 16 }}>Your content</Body>
        <Body style={{ color: muted }}>
          You own the content you post (photos, check-ins, comments). By posting, you grant Perched a non-exclusive, worldwide, royalty-free license to display, distribute, and promote your content within the app and related marketing materials. You may delete your content at any time.
        </Body>

        <Body style={{ color: text, fontWeight: '700', marginTop: 16 }}>Acceptable use</Body>
        <Body style={{ color: muted }}>
          You agree to behave respectfully and not post content that is harmful, harassing, misleading, illegal, or violates the rights of others. You must not use the app to spam, impersonate others, or collect data about other users without their consent.
        </Body>

        <Body style={{ color: text, fontWeight: '700', marginTop: 16 }}>Moderation</Body>
        <Body style={{ color: muted }}>
          We may remove content, restrict features, or suspend accounts that violate these terms or our community guidelines, at our sole discretion and without prior notice.
        </Body>

        <Body style={{ color: text, fontWeight: '700', marginTop: 16 }}>Third-party services</Body>
        <Body style={{ color: muted }}>
          Perched integrates with third-party services including Google Maps, Firebase, and others. Your use of these services is subject to their respective terms. We are not responsible for the availability or accuracy of third-party data.
        </Body>

        <Body style={{ color: text, fontWeight: '700', marginTop: 16 }}>Limitation of liability</Body>
        <Body style={{ color: muted }}>
          Perched is provided &quot;as is&quot; without warranties of any kind. We are not liable for any indirect, incidental, or consequential damages arising from your use of the app. Our total liability is limited to the amount you have paid us in the twelve months preceding any claim.
        </Body>

        <Body style={{ color: text, fontWeight: '700', marginTop: 16 }}>Intellectual property</Body>
        <Body style={{ color: muted }}>
          The Perched name, logo, design, and underlying code are owned by Perched. You may not copy, modify, or distribute any part of the app without written permission.
        </Body>

        <Body style={{ color: text, fontWeight: '700', marginTop: 16 }}>Disputes</Body>
        <Body style={{ color: muted }}>
          These terms are governed by the laws of the State of Texas. Any disputes will be resolved in the courts of Harris County, Texas.
        </Body>

        <Body style={{ color: text, fontWeight: '700', marginTop: 16 }}>Changes</Body>
        <Body style={{ color: muted }}>
          We may update these terms from time to time. Continued use of the app after changes constitutes acceptance.
        </Body>

        <View style={{ height: 16 }} />
        <Body style={{ color: muted }}>
          Questions? Email {supportEmail} or contact us in-app.
        </Body>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  content: { padding: 20 },
});
