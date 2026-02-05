import { View, Text, StyleSheet } from 'react-native';
import { useEffect, useRef } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useThemeColor } from '@/hooks/use-theme-color';

interface MapLoadingSpinnerProps {
  message?: string;
  size?: number;
}

export function MapLoadingSpinner({ message = 'Loading spots…', size = 48 }: MapLoadingSpinnerProps) {
  const primary = useThemeColor({}, 'primary');
  const muted = useThemeColor({}, 'muted');
  const card = useThemeColor({}, 'card');

  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, {
        duration: 1000,
        easing: Easing.linear,
      }),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View style={[styles.container, { backgroundColor: card }]}>
      <Animated.View
        style={[
          animatedStyle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 3,
            borderColor: 'transparent',
            borderTopColor: primary,
            borderRightColor: primary,
          },
        ]}
      />
      {message && (
        <Text style={[styles.message, { color: muted }]}>
          {message}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  message: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
  },
});
