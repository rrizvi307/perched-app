/**
 * Onboarding: Welcome Screen
 *
 * First screen showing value proposition and getting users excited
 */

import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { PremiumButton } from '@/components/ui/premium-button';
import { useAuth } from '@/contexts/AuthContext';
import { completeOnboardingStep } from '@/services/onboarding';
import * as Haptics from 'expo-haptics';

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');

  const handleContinue = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    // Mark welcome step as complete
    if (user?.id) {
      await completeOnboardingStep(user.id, 'welcome');
    }

    // Navigate to feature tour
    router.push('/onboarding/features');
  };

  return (
    <View style={[styles.container, { backgroundColor: background, paddingTop: insets.top }]}>
      <View style={styles.content}>
        {/* Hero Section */}
        <View style={styles.hero}>
          <Text style={styles.emoji}>☕</Text>
          <Text style={[styles.title, { color: text }]}>
            Welcome to Perched
          </Text>
          <Text style={[styles.subtitle, { color: muted }]}>
            Discover where your friends work & study
          </Text>
        </View>

        {/* Value Props */}
        <View style={styles.valueProps}>
          <ValueProp
            emoji="📍"
            title="Find Great Spots"
            description="Discover cafes, libraries, and coworking spaces with real-time intel"
            textColor={text}
            mutedColor={muted}
          />
          <ValueProp
            emoji="👥"
            title="See Your Friends"
            description="Know where your friends are working right now"
            textColor={text}
            mutedColor={muted}
          />
          <ValueProp
            emoji="🎯"
            title="Share Your Favorites"
            description="Help others find the perfect place to work or study"
            textColor={text}
            mutedColor={muted}
          />
          <ValueProp
            emoji="🔥"
            title="Build Streaks"
            description="Track your visits and earn achievements"
            textColor={text}
            mutedColor={muted}
          />
        </View>
      </View>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <PremiumButton
          onPress={handleContinue}
          variant="primary"
          size="large"
          fullWidth
          icon="arrow.right"
          iconPosition="right"
        >
          Get Started
        </PremiumButton>
        <Text style={[styles.footerText, { color: muted }]}>
          Takes less than 2 minutes
        </Text>
      </View>
    </View>
  );
}

function ValueProp({
  emoji,
  title,
  description,
  textColor,
  mutedColor,
}: {
  emoji: string;
  title: string;
  description: string;
  textColor: string;
  mutedColor: string;
}) {
  return (
    <View style={styles.valueProp}>
      <Text style={styles.valuePropEmoji}>{emoji}</Text>
      <View style={styles.valuePropText}>
        <Text style={[styles.valuePropTitle, { color: textColor }]}>{title}</Text>
        <Text style={[styles.valuePropDescription, { color: mutedColor }]}>
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
  emoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    textAlign: 'center',
    lineHeight: 24,
  },
  valueProps: {
    gap: 24,
  },
  valueProp: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  valuePropEmoji: {
    fontSize: 32,
  },
  valuePropText: {
    flex: 1,
  },
  valuePropTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  valuePropDescription: {
    fontSize: 15,
    lineHeight: 20,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  footerText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
  },
});
