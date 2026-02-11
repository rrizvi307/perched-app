/**
 * Onboarding: Feature Tour
 *
 * Swipeable carousel showcasing key features
 */

import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Dimensions, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { PremiumButton } from '@/components/ui/premium-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/AuthContext';
import { completeOnboardingStep } from '@/services/onboarding';
import { withAlpha } from '@/utils/colors';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const FEATURES = [
  {
    id: 'metrics',
    emoji: '📊',
    title: 'Real-Time Spot Intel',
    description: 'See WiFi speed, noise level, busyness, and outlets at every spot—updated in real-time by the community.',
    icon: 'chart.bar.fill',
  },
  {
    id: 'social',
    emoji: '👥',
    title: 'Friends Feed',
    description: 'Know where your friends are right now. See their recent check-ins and discover new spots together.',
    icon: 'person.2.fill',
  },
  {
    id: 'streaks',
    emoji: '🔥',
    title: 'Streaks & Achievements',
    description: 'Build daily streaks, earn badges, and level up. Make discovering great places a habit.',
    icon: 'flame.fill',
  },
  {
    id: 'impact',
    emoji: '✨',
    title: 'Community Impact',
    description: "Every check-in helps others find the perfect spot. See how many people you've helped!",
    icon: 'sparkles',
  },
];

export default function FeaturesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const flatListRef = useRef<FlatList>(null);

  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const card = useThemeColor({}, 'card');

  const [currentIndex, setCurrentIndex] = useState(0);

  const handleContinue = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    // Mark feature tour as complete
    if (user?.id) {
      await completeOnboardingStep(user.id, 'featureTour');
    }

    // Navigate to location permission screen
    router.push('/onboarding/location');
  };

  const handleSkip = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    handleContinue();
  };

  const handleNext = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    if (currentIndex < FEATURES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      handleContinue();
    }
  };

  const renderFeature = ({ item }: { item: typeof FEATURES[0] }) => (
    <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
      <View style={styles.slideContent}>
        <View style={[styles.iconContainer, { backgroundColor: withAlpha(primary, 0.15) }]}>
          <Text style={styles.emoji}>{item.emoji}</Text>
        </View>
        <Text style={[styles.featureTitle, { color: text }]}>{item.title}</Text>
        <Text style={[styles.featureDescription, { color: muted }]}>{item.description}</Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={[styles.headerTitle, { color: text }]}>How it works</Text>
        <Pressable onPress={handleSkip}>
          <Text style={[styles.skipText, { color: primary }]}>Skip</Text>
        </Pressable>
      </View>

      {/* Feature Carousel */}
      <FlatList
        ref={flatListRef}
        data={FEATURES}
        renderItem={renderFeature}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => {
          const index = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          setCurrentIndex(index);
        }}
        keyExtractor={(item) => item.id}
      />

      {/* Pagination Dots */}
      <View style={styles.pagination}>
        {FEATURES.map((_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              {
                backgroundColor: index === currentIndex ? primary : withAlpha(muted, 0.3),
                width: index === currentIndex ? 24 : 8,
              },
            ]}
          />
        ))}
      </View>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <PremiumButton
          onPress={handleNext}
          variant="primary"
          size="large"
          fullWidth
          icon={currentIndex === FEATURES.length - 1 ? 'arrow.right' : undefined}
          iconPosition="right"
        >
          {currentIndex === FEATURES.length - 1 ? 'Continue' : 'Next'}
        </PremiumButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  skipText: {
    fontSize: 16,
    fontWeight: '600',
  },
  slide: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  slideContent: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  emoji: {
    fontSize: 64,
  },
  featureTitle: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 16,
  },
  featureDescription: {
    fontSize: 17,
    textAlign: 'center',
    lineHeight: 24,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 24,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
});
