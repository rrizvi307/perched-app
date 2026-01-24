import { ThemedView } from '@/components/themed-view';
import { Atmosphere } from '@/components/ui/atmosphere';
import { Body, H1, Label } from '@/components/ui/typography';
import { useThemeColor } from '@/hooks/use-theme-color';
import { ScrollView, StyleSheet, View } from 'react-native';

export default function TermsOfService() {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');

  return (
    <ThemedView style={styles.container}>
      <Atmosphere />
      <ScrollView contentContainerStyle={styles.content}>
        <Label style={{ color: muted, marginBottom: 8 }}>Terms</Label>
        <H1 style={{ color: text }}>Terms of Service</H1>
        <Body style={{ color: muted }}>
          By using Perched, you agree to behave respectfully and avoid sharing harmful or unlawful content.
        </Body>
        <Body style={{ color: muted }}>
          You own the content you post, and you grant Perched a license to display it for app features.
        </Body>
        <Body style={{ color: muted }}>
          We may remove content or suspend accounts that violate community guidelines.
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
