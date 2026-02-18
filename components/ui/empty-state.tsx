import { Pressable, View, Text, StyleSheet } from 'react-native';
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
import { useThemeColor } from '@/hooks/use-theme-color';
import { tokens } from '@/constants/tokens';

interface EmptyStateProps {
  icon: string;
  title: string;
  message?: string;
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
  message,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: EmptyStateProps) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const border = useThemeColor({}, 'border');

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
  }, [contentOpacity, contentY, iconOpacity, iconScale]);

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
    transform: [{ scale: iconScale.value }],
  }));

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
    transform: [{ translateY: contentY.value }],
  }));
  const bodyText = message ?? description;
  const emojiIcon = /\p{Extended_Pictographic}/u.test(icon);

  return (
    <View style={styles.container}>
      {/* Icon */}
      <Animated.View style={[styles.iconContainer, iconAnimatedStyle]}>
        {emojiIcon ? (
          <Text style={{ fontSize: 56 }}>{icon}</Text>
        ) : (
          <IconSymbol name={icon as any} size={56} color={primary} />
        )}
      </Animated.View>

      {/* Content */}
      <Animated.View style={[styles.content, contentAnimatedStyle]}>
        <Text style={[styles.title, { color: text }]}>{title}</Text>
        {bodyText && (
          <Text style={[styles.description, { color: muted }]}>
            {bodyText}
          </Text>
        )}

        {/* Actions */}
        {actionLabel && onAction && (
          <View style={styles.actions}>
            <Pressable
              onPress={onAction}
              style={({ pressed }) => [
                styles.primaryAction,
                { backgroundColor: primary },
                pressed ? { opacity: 0.86 } : null,
              ]}
            >
              <Text style={styles.primaryActionText}>{actionLabel}</Text>
            </Pressable>

            {secondaryLabel && onSecondary && (
              <Pressable
                onPress={onSecondary}
                style={({ pressed }) => [
                  styles.secondaryAction,
                  { borderColor: border },
                  pressed ? { opacity: 0.72 } : null,
                ]}
              >
                <Text style={[styles.secondaryActionText, { color: text }]}>{secondaryLabel}</Text>
              </Pressable>
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
export function EmptyFeed({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon="📍"
      title="Your feed is waiting"
      message="Check in to your favorite work spot and see what friends are up to"
      actionLabel="Make your first check-in"
      onAction={onAction}
    />
  );
}

export function EmptySpots({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon="🗺️"
      title="No spots nearby"
      message="Be the first to discover and rate work spots in this area"
      actionLabel="Explore the map"
      onAction={onAction}
    />
  );
}

export function EmptySearch({ onAction }: { onAction?: () => void }) {
  return (
    <EmptyState
      icon="🔍"
      title="No matches"
      message="Try adjusting your filters or searching a different area"
      actionLabel="Clear filters"
      onAction={onAction}
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
  primaryAction: {
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: tokens.type.body.fontSize,
    fontWeight: '700',
  },
  secondaryAction: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: 'transparent',
  },
  secondaryActionText: {
    fontSize: tokens.type.body.fontSize,
    fontWeight: '600',
  },
});
