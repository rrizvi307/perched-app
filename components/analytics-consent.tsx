import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { withAlpha } from '@/utils/colors';
import { seedAnalyticsConsent, isConsentPending, setAnalyticsConsent } from '@/services/analyticsConsent';
import { initSentry } from '@/services/sentry';
import { initAnalytics } from '@/services/analytics';

/**
 * First-launch consent dialog for analytics & crash reporting.
 * Shows once, then never again. Choice is stored in AsyncStorage.
 */
export function AnalyticsConsentDialog() {
  const [visible, setVisible] = useState(false);

  const bg = useThemeColor({}, 'background');
  const card = useThemeColor({}, 'card');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const border = useThemeColor({}, 'border');

  useEffect(() => {
    void (async () => {
      await seedAnalyticsConsent();
      if (isConsentPending()) {
        setVisible(true);
      }
    })();
  }, []);

  async function respond(granted: boolean) {
    await setAnalyticsConsent(granted);
    setVisible(false);
    if (granted) {
      initSentry();
      initAnalytics();
    }
  }

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible>
      <View style={[styles.overlay, { backgroundColor: withAlpha(bg, 0.7) }]}>
        <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.title, { color: text }]}>Help improve Perched</Text>
          <Text style={[styles.body, { color: muted }]}>
            We use anonymous analytics and crash reports to fix bugs and improve the app. No personal data is sold or shared with advertisers.
          </Text>
          <Text style={[styles.body, { color: muted }]}>
            You can change this anytime in Settings.
          </Text>
          <View style={styles.actions}>
            <Pressable
              onPress={() => respond(false)}
              style={[styles.button, { borderColor: border }]}
            >
              <Text style={[styles.buttonText, { color: muted }]}>No thanks</Text>
            </Pressable>
            <Pressable
              onPress={() => respond(true)}
              style={[styles.button, styles.primaryButton, { backgroundColor: primary }]}
            >
              <Text style={[styles.buttonText, { color: '#fff' }]}>Allow</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 380,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  primaryButton: {
    borderWidth: 0,
  },
  buttonText: {
    fontWeight: '700',
    fontSize: 15,
  },
});
