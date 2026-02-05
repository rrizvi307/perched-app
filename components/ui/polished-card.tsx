import { View, StyleSheet, Pressable, ViewStyle, PressableProps } from 'react-native';
import { ReactNode } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useThemeColor } from '@/hooks/use-theme-color';

interface PolishedCardProps extends Omit<PressableProps, 'style'> {
  children: ReactNode;
  variant?: 'default' | 'elevated' | 'outlined' | 'flat';
  pressable?: boolean;
  animated?: boolean;
  delay?: number;
  style?: ViewStyle;
}

/**
 * Premium card component with smooth animations and elevated design
 * Inspired by Linear, Notion, and Superhuman
 */
export function PolishedCard({
  children,
  variant = 'default',
  pressable = true,
  animated = true,
  delay = 0,
  style,
  ...pressableProps
}: PolishedCardProps) {
  const card = useThemeColor({}, 'card');
  const border = useThemeColor({}, 'border');

  const scale = useSharedValue(animated ? 0.95 : 1);
  const opacity = useSharedValue(animated ? 0 : 1);

  // Entrance animation
  React.useEffect(() => {
    if (animated) {
      setTimeout(() => {
        opacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) });
        scale.value = withSpring(1, { damping: 15, stiffness: 150 });
      }, delay);
    }
  }, [animated, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  // Get variant styles
  const variantStyles = React.useMemo(() => {
    switch (variant) {
      case 'elevated':
        return {
          backgroundColor: card,
          borderWidth: 0,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.08,
          shadowRadius: 12,
          elevation: 4,
        };
      case 'outlined':
        return {
          backgroundColor: card,
          borderWidth: 1.5,
          borderColor: border,
          shadowColor: 'transparent',
        };
      case 'flat':
        return {
          backgroundColor: card,
          borderWidth: 0,
          shadowColor: 'transparent',
        };
      default:
        return {
          backgroundColor: card,
          borderWidth: 1,
          borderColor: border,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.04,
          shadowRadius: 8,
          elevation: 2,
        };
    }
  }, [variant, card, border]);

  if (!pressable) {
    return (
      <Animated.View style={[styles.card, variantStyles, animatedStyle, style]}>
        {children}
      </Animated.View>
    );
  }

  return (
    <Pressable {...pressableProps}>
      {({ pressed }) => (
        <Animated.View
          style={[
            styles.card,
            variantStyles,
            animatedStyle,
            pressed && styles.pressed,
            style,
          ]}
        >
          {children}
        </Animated.View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
});

// Add React import
import * as React from 'react';
