import { View, StyleSheet, ViewStyle } from 'react-native';
import { useEffect } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useThemeColor } from '@/hooks/use-theme-color';
import { withAlpha } from '@/utils/colors';

interface SkeletonLoaderProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
  variant?: 'default' | 'circular' | 'text';
}

/**
 * Smooth shimmer skeleton loader - feels like Notion/Linear
 */
export function SkeletonLoader({
  width = '100%',
  height = 20,
  borderRadius = 8,
  style,
  variant = 'default',
}: SkeletonLoaderProps) {
  const border = useThemeColor({}, 'border');
  const surface = useThemeColor({}, 'surface');
  const shimmerColor = withAlpha(border, 0.3);

  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 800, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const shapeStyle = variant === 'circular'
    ? { borderRadius: 9999 }
    : variant === 'text'
    ? { borderRadius: 4, height: height * 0.7 }
    : { borderRadius };

  return (
    <View
      style={[
        styles.container,
        {
          width,
          height,
          backgroundColor: shimmerColor,
        },
        shapeStyle,
        style,
      ]}
    >
      <Animated.View
        style={[
          styles.shimmer,
          {
            backgroundColor: withAlpha(surface, 0.5),
          },
          animatedStyle,
        ]}
      />
    </View>
  );
}

/**
 * Pre-built skeleton card for feed items
 */
export function SkeletonFeedCard() {
  return (
    <View style={styles.feedCard}>
      {/* Header */}
      <View style={styles.feedHeader}>
        <SkeletonLoader width={40} height={40} variant="circular" />
        <View style={styles.feedHeaderText}>
          <SkeletonLoader width="60%" height={16} />
          <SkeletonLoader width="40%" height={12} style={{ marginTop: 6 }} />
        </View>
      </View>

      {/* Image */}
      <SkeletonLoader width="100%" height={280} style={{ marginVertical: 12 }} />

      {/* Footer */}
      <View style={styles.feedFooter}>
        <SkeletonLoader width="30%" height={14} />
        <SkeletonLoader width="20%" height={14} />
      </View>
    </View>
  );
}

/**
 * Profile skeleton
 */
export function SkeletonProfile() {
  return (
    <View style={styles.profileSkeleton}>
      <SkeletonLoader width={80} height={80} variant="circular" style={{ alignSelf: 'center' }} />
      <SkeletonLoader width="50%" height={24} style={{ marginTop: 16, alignSelf: 'center' }} />
      <SkeletonLoader width="35%" height={16} style={{ marginTop: 8, alignSelf: 'center' }} />

      <View style={styles.profileStats}>
        {[1, 2, 3].map((i) => (
          <View key={i} style={styles.statItem}>
            <SkeletonLoader width={40} height={28} style={{ alignSelf: 'center' }} />
            <SkeletonLoader width={60} height={14} style={{ marginTop: 6, alignSelf: 'center' }} />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    position: 'relative',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  feedCard: {
    padding: 16,
    marginBottom: 16,
  },
  feedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  feedHeaderText: {
    flex: 1,
    marginLeft: 12,
  },
  feedFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  profileSkeleton: {
    padding: 24,
  },
  profileStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 24,
  },
  statItem: {
    alignItems: 'center',
  },
});
