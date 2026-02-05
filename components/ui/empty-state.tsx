import { View, Text, StyleSheet } from 'react-native';
import { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { IconSymbol } from './icon-symbol';
import { PremiumButton } from './premium-button';
import { useThemeColor } from '@/hooks/use-theme-color';
import { tokens } from '@/constants/tokens';

interface EmptyStateProps {
  icon: string;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

/**
 * Beautiful empty state with smooth entrance animation
 * Inspired by Linear and Notion
 */
export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: EmptyStateProps) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');

  const iconScale = useSharedValue(0.5);
  const iconOpacity = useSharedValue(0);
  const contentY = useSharedValue(20);
  const contentOpacity = useSharedValue(0);

  useEffect(() => {
    // Bounce icon in
    iconOpacity.value = withTiming(1, { duration: 200 });
    iconScale.value = withSequence(
      withSpring(1.2, { damping: 8, stiffness: 100 }),
      withSpring(1, { damping: 12, stiffness: 150 })
    );

    // Slide content up
    contentY.value = withDelay(
      150,
      withTiming(0, { duration: 400, easing: Easing.out(Easing.ease) })
    );
    contentOpacity.value = withDelay(
      150,
      withTiming(1, { duration: 400, easing: Easing.out(Easing.ease) })
    );
  }, []);

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
    transform: [{ scale: iconScale.value }],
  }));

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentY.value }],
  }));

  return (
    <View style={styles.container}>
      {/* Icon */}
      <Animated.View style={[styles.iconContainer, iconAnimatedStyle]}>
        <IconSymbol name={icon as any} size={56} color={primary} />
      </Animated.View>

      {/* Content */}
      <Animated.View style={[styles.content, contentAnimatedStyle]}>
        <Text style={[styles.title, { color: text }]}>{title}</Text>
        {description && (
          <Text style={[styles.description, { color: muted }]}>
            {description}
          </Text>
        )}

        {/* Actions */}
        {actionLabel && onAction && (
          <View style={styles.actions}>
            <PremiumButton
              onPress={onAction}
              variant="primary"
              size="medium"
            >
              {actionLabel}
            </PremiumButton>

            {secondaryLabel && onSecondary && (
              <PremiumButton
                onPress={onSecondary}
                variant="ghost"
                size="medium"
              >
                {secondaryLabel}
              </PremiumButton>
            )}
          </View>
        )}
      </Animated.View>
    </View>
  );
}

/**
 * Pre-built empty states for common scenarios
 */
export function EmptyFeed({ onCheckin }: { onCheckin: () => void }) {
  return (
    <EmptyState
      icon="photo.on.rectangle.angled"
      title="No check-ins yet"
      description="Start sharing your favorite spots and see what your friends are up to."
      actionLabel="Check in now"
      onAction={onCheckin}
      secondaryLabel="Find friends"
      onSecondary={() => {/* Navigate to explore */}}
    />
  );
}

export function EmptySearch() {
  return (
    <EmptyState
      icon="magnifyingglass"
      title="No results found"
      description="Try adjusting your search or filters to find what you're looking for."
    />
  );
}

export function EmptySpots({ onExplore }: { onExplore: () => void }) {
  return (
    <EmptyState
      icon="map.fill"
      title="Discover spots nearby"
      description="Find coffee shops, libraries, and coworking spaces perfect for you."
      actionLabel="Explore map"
      onAction={onExplore}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    minHeight: 400,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  content: {
    alignItems: 'center',
    maxWidth: 320,
  },
  title: {
    fontSize: tokens.type.h2.fontSize,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: tokens.type.body.fontSize,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  actions: {
    flexDirection: 'column',
    gap: 12,
    width: '100%',
  },
});
