/**
 * Onboarding: Complete
 *
 * Final screen celebrating completion and directing to first actions
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { PremiumButton } from '@/components/ui/premium-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/AuthContext';
import { updateOnboardingProgress } from '@/services/onboarding';
import { withAlpha } from '@/utils/colors';
import * as Haptics from 'expo-haptics';

export default function CompleteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');

  const handleGetStarted = async () => {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Mark onboarding as fully completed
      if (user?.id) {
        await updateOnboardingProgress(user.id, {
          completed: true,
          completedAt: Date.now(),
        });
      }

      // Navigate to main app (explore tab)
      router.replace('/(tabs)/explore');
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
      router.replace('/(tabs)/explore');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: background, paddingTop: insets.top }]}>
      <View style={styles.content}>
        {/* Success Animation */}
        <View style={styles.hero}>
          <View style={[styles.successCircle, { backgroundColor: withAlpha(primary, 0.15) }]}>
            <IconSymbol name="checkmark.circle.fill" size={80} color={primary} />
          </View>
          <Text style={[styles.title, { color: text }]}>You&apos;re all set!</Text>
          <Text style={[styles.subtitle, { color: muted }]}>
            Ready to discover amazing places and see where your friends are working
          </Text>
        </View>

        {/* Next Steps */}
        <View style={styles.nextSteps}>
          <Text style={[styles.nextStepsTitle, { color: text }]}>What&apos;s next?</Text>

          <NextStep
            icon="map.fill"
            title="Explore nearby spots"
            description="Find cafes, libraries, and coworking spaces with real-time intel"
            textColor={text}
            mutedColor={muted}
            primary={primary}
          />
          <NextStep
            icon="square.and.pencil"
            title="Make your first check-in"
            description="Share where you're working and help the community"
            textColor={text}
            mutedColor={muted}
            primary={primary}
          />
          <NextStep
            icon="person.2.fill"
            title="Add your friends"
            description="See where they're working and discover spots together"
            textColor={text}
            mutedColor={muted}
            primary={primary}
          />
        </View>
      </View>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <PremiumButton
          onPress={handleGetStarted}
          variant="primary"
          size="large"
          fullWidth
          icon="arrow.right"
          iconPosition="right"
        >
          Start Exploring
        </PremiumButton>
      </View>
    </View>
  );
}

function NextStep({
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
    <View style={styles.nextStep}>
      <View style={[styles.nextStepIcon, { backgroundColor: withAlpha(primary, 0.15) }]}>
        <IconSymbol name={icon as any} size={24} color={primary} />
      </View>
      <View style={styles.nextStepText}>
        <Text style={[styles.nextStepTitle, { color: textColor }]}>{title}</Text>
        <Text style={[styles.nextStepDescription, { color: mutedColor }]}>
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
    marginTop: 60,
    marginBottom: 48,
  },
  successCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 17,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  nextSteps: {
    gap: 20,
  },
  nextStepsTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  nextStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  nextStepIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextStepText: {
    flex: 1,
  },
  nextStepTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  nextStepDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 20,
  },
});
