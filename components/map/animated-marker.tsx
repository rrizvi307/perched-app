import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Marker } from '@/components/map/index';
import type { MarkerProps } from 'react-native-maps';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withSpring,
  withDelay,
  Easing,
} from 'react-native-reanimated';

interface AnimatedMarkerProps extends MarkerProps {
  delay?: number;
  animationType?: 'drop' | 'fade' | 'none';
}

// Note: Reanimated marker animation is complex with react-native-maps
// This is a placeholder that sets up the infrastructure
// For best results, use opacity/transform animations on custom marker views

export function AnimatedMarker({
  delay = 0,
  animationType = 'drop',
  ...markerProps
}: AnimatedMarkerProps) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(animationType === 'drop' ? -30 : 0);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withSpring(1, {
        damping: 15,
        stiffness: 100,
      })
    );

    if (animationType === 'drop') {
      translateY.value = withDelay(
        delay,
        withSpring(0, {
          damping: 12,
          stiffness: 80,
        })
      );
    }
  }, [delay, animationType]);

  // For now, return standard Marker
  // Custom marker views with animation will be implemented in marker customization
  return <Marker {...markerProps} />;
}

// Export marker animation timing helper
export function getMarkerDelay(index: number, total: number): number {
  // Stagger animation: first markers appear quickly, rest cascade
  const baseDelay = Math.min(index * 50, 500);
  return baseDelay;
}
