import { ThemedView } from '@/components/themed-view';
import { Atmosphere } from '@/components/ui/atmosphere';
import { Body, H1, Label } from '@/components/ui/typography';
import { useThemeColor } from '@/hooks/use-theme-color';
import { ScrollView, StyleSheet, View } from 'react-native';

export default function PrivacyPolicy() {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');

  return (
    <ThemedView style={styles.container}>
      <Atmosphere />
      <ScrollView contentContainerStyle={styles.content}>
        <Label style={{ color: muted, marginBottom: 8 }}>Privacy</Label>
        <H1 style={{ color: text }}>Privacy Policy</H1>
        <Body style={{ color: muted }}>
          We only collect the information you provide (account, check-ins, photos) to power the app.
        </Body>
        <Body style={{ color: muted }}>
          Location data is used to show nearby spots and never shared outside of your chosen visibility.
        </Body>
        <Body style={{ color: muted }}>
          You can delete your account or remove content anytime from Settings.
        </Body>
        <View style={{ height: 16 }} />
        <Body style={{ color: muted }}>
          Questions? Email perchedappteam@gmail.com or contact us in-app.
        </Body>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  content: { padding: 20 },
});
