import { ThemedView } from '@/components/themed-view';
import { Atmosphere } from '@/components/ui/atmosphere';
import { Body, H1, Label } from '@/components/ui/typography';
import { useThemeColor } from '@/hooks/use-theme-color';
import Constants from 'expo-constants';
import { ScrollView, StyleSheet, View } from 'react-native';

export default function PrivacyPolicy() {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const supportEmail = ((((Constants.expoConfig as any)?.extra) || {}).SUPPORT_EMAIL as string) || 'perchedappteam@gmail.com';

  return (
    <ThemedView style={styles.container}>
      <Atmosphere />
      <ScrollView contentContainerStyle={styles.content}>
        <Label style={{ color: muted, marginBottom: 8 }}>Privacy</Label>
        <H1 style={{ color: text }}>Privacy Policy</H1>

        <Body style={{ color: text, fontWeight: '700', marginTop: 16 }}>What we collect</Body>
        <Body style={{ color: muted }}>
          We collect information you provide when creating an account (email address), posting check-ins (photos, captions, tags, utility ratings), and using social features (friend connections, reactions, comments).
        </Body>

        <Body style={{ color: text, fontWeight: '700', marginTop: 16 }}>Location data</Body>
        <Body style={{ color: muted }}>
          Precise location is used to show nearby spots, detect your current venue during check-in, and calculate distances. Location data is associated with your check-ins at the visibility level you choose (public, friends, or close friends). We do not track your location in the background.
        </Body>

        <Body style={{ color: text, fontWeight: '700', marginTop: 16 }}>Photos</Body>
        <Body style={{ color: muted }}>
          Check-in photos are stored in Firebase Storage and displayed to users according to your visibility settings. EXIF metadata may be used locally to detect your venue but is not stored on our servers.
        </Body>

        <Body style={{ color: text, fontWeight: '700', marginTop: 16 }}>Contacts</Body>
        <Body style={{ color: muted }}>
          If you choose to sync contacts for friend discovery, contact data is processed on-device to find matching Perched users. Raw contact data is not uploaded or stored on our servers.
        </Body>

        <Body style={{ color: text, fontWeight: '700', marginTop: 16 }}>Analytics and crash reporting</Body>
        <Body style={{ color: muted }}>
          With your consent, we use Sentry for crash reporting and Firebase Analytics for usage analytics. These services collect device identifiers, app interaction data, and crash logs to help us fix bugs and improve the app. No analytics data is shared with advertisers. You can enable or disable analytics at any time in Settings.
        </Body>

        <Body style={{ color: text, fontWeight: '700', marginTop: 16 }}>Third-party services</Body>
        <Body style={{ color: muted }}>
          We use Firebase (authentication, database, storage), Google Maps (place search, venue detection), and Sentry (error tracking). These services process data according to their own privacy policies. We do not sell your data to third parties.
        </Body>

        <Body style={{ color: text, fontWeight: '700', marginTop: 16 }}>Data retention</Body>
        <Body style={{ color: muted }}>
          Your data is retained as long as your account is active. When you delete your account, all associated data (profile, check-ins, photos, social connections) is permanently removed from our systems.
        </Body>

        <Body style={{ color: text, fontWeight: '700', marginTop: 16 }}>Your rights</Body>
        <Body style={{ color: muted }}>
          You can delete your account and all associated data at any time from Settings. You can also remove individual check-ins or change your visibility preferences. To request a copy of your data or ask questions about this policy, contact us at the address below.
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
