/**
 * Onboarding: Location Permission
 *
 * Explains why location is needed before requesting permission
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { PremiumButton } from '@/components/ui/premium-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/AuthContext';
import { completeOnboardingStep } from '@/services/onboarding';
import { requestForegroundLocation } from '@/services/location';
import { setLocationEnabled, setPermissionPrimerSeen } from '@/storage/local';
import { withAlpha } from '@/utils/colors';
import * as Haptics from 'expo-haptics';

export default function LocationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const card = useThemeColor({}, 'card');
  const border = useThemeColor({}, 'border');

  const [requesting, setRequesting] = useState(false);

  const handleEnableLocation = async () => {
    try {
      setRequesting(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Mark permission primer as seen
      await setPermissionPrimerSeen('location', true);

      // Request location permission
      const location = await requestForegroundLocation();

      if (location) {
        await setLocationEnabled(true);

        // Mark location permission step as complete
        if (user?.id) {
          await completeOnboardingStep(user.id, 'locationPermission');
        }

        // Navigate to campus selection
        router.push('/onboarding/campus');
      } else {
        // Permission denied, but continue onboarding
        if (user?.id) {
          await completeOnboardingStep(user.id, 'locationPermission');
        }
        router.push('/onboarding/campus');
      }
    } catch (error) {
      console.error('Location permission error:', error);
      // Continue anyway
      if (user?.id) {
        await completeOnboardingStep(user.id, 'locationPermission');
      }
      router.push('/onboarding/campus');
    } finally {
      setRequesting(false);
    }
  };

  const handleSkip = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    if (user?.id) {
      await completeOnboardingStep(user.id, 'locationPermission');
    }
    router.push('/onboarding/campus');
  };

  return (
    <View style={[styles.container, { backgroundColor: background, paddingTop: insets.top }]}>
      <View style={styles.content}>
        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.iconContainer, { backgroundColor: withAlpha(primary, 0.15) }]}>
            <IconSymbol name="location.fill" size={64} color={primary} />
          </View>
          <Text style={[styles.title, { color: text }]}>Find Spots Nearby</Text>
          <Text style={[styles.subtitle, { color: muted }]}>
            We need your location to show you the best spots around you
          </Text>
        </View>

        {/* Benefits */}
        <View style={styles.benefits}>
          <Benefit
            icon="map.fill"
            title="Discover nearby spots"
            description="See cafes, libraries, and coworking spaces within walking distance"
            textColor={text}
            mutedColor={muted}
            primary={primary}
          />
          <Benefit
            icon="figure.walk"
            title="Get accurate distances"
            description="Know exactly how far each spot is from you"
            textColor={text}
            mutedColor={muted}
            primary={primary}
          />
          <Benefit
            icon="person.2.fill"
            title="See friends nearby"
            description="Get notified when friends check in at spots near you"
            textColor={text}
            mutedColor={muted}
            primary={primary}
          />
        </View>

        {/* Privacy Notice */}
        <View style={[styles.privacyNotice, { backgroundColor: card, borderColor: border }]}>
          <IconSymbol name="lock.shield.fill" size={20} color={primary} />
          <Text style={[styles.privacyText, { color: muted }]}>
            Your location is only used when you open the app. We never share your location with others.
          </Text>
        </View>
      </View>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <PremiumButton
          onPress={handleEnableLocation}
          variant="primary"
          size="large"
          fullWidth
          loading={requesting}
          icon="location.fill"
        >
          Enable Location
        </PremiumButton>
        <PremiumButton
          onPress={handleSkip}
          variant="ghost"
          size="medium"
          fullWidth
          style={{ marginTop: 12 }}
        >
          Skip for now
        </PremiumButton>
      </View>
    </View>
  );
}

function Benefit({
  icon,
  title,
  description,
  textColor,
  mutedColor,
  primary,
}: {
  icon: string;
  title: string;
  description: string;
  textColor: string;
  mutedColor: string;
  primary: string;
}) {
  return (
    <View style={styles.benefit}>
      <View style={[styles.benefitIcon, { backgroundColor: withAlpha(primary, 0.15) }]}>
        <IconSymbol name={icon as any} size={24} color={primary} />
      </View>
      <View style={styles.benefitText}>
        <Text style={[styles.benefitTitle, { color: textColor }]}>{title}</Text>
        <Text style={[styles.benefitDescription, { color: mutedColor }]}>
          {description}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  hero: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 48,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 17,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  benefits: {
    gap: 20,
    marginBottom: 32,
  },
  benefit: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  benefitIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitText: {
    flex: 1,
  },
  benefitTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  benefitDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  privacyNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  privacyText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 20,
  },
});
