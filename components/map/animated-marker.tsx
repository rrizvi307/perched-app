import { Marker } from '@/components/map/index';
import type { MapMarkerProps as MarkerProps } from 'react-native-maps';

interface AnimatedMarkerProps extends MarkerProps {
  delay?: number;
  animationType?: 'drop' | 'fade' | 'none';
}

// Note: Reanimated marker animation is complex with react-native-maps
// This is a placeholder that sets up the infrastructure
// For best results, use opacity/transform animations on custom marker views

export function AnimatedMarker({
  delay: _delay = 0,
  animationType: _animationType = 'drop',
  ...markerProps
}: AnimatedMarkerProps) {
  // Placeholder component: keep API surface while deferring animation to custom marker views.
  return <Marker {...markerProps} />;
}

// Export marker animation timing helper
export function getMarkerDelay(index: number, _total: number): number {
  // Stagger animation: first markers appear quickly, rest cascade
  const baseDelay = Math.min(index * 50, 500);
  return baseDelay;
}
