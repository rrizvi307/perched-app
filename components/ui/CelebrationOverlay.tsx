import React, { useEffect } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const PARTICLE_COUNT = 28;
const COLORS = ['#8B5CF6', '#EC4899', '#10B981', '#F59E0B', '#3B82F6', '#F97316'];

type Props = { visible: boolean; onDone?: () => void };

function Particle({ index, onDone }: { index: number; onDone?: () => void }) {
  const y = useSharedValue(SCREEN_H * 0.4);
  const x = useSharedValue(SCREEN_W / 2);
  const opacity = useSharedValue(1);
  const rotate = useSharedValue(0);
  const scale = useSharedValue(0);

  useEffect(() => {
    const angle = (index / PARTICLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.8;
    const radius = 120 + Math.random() * 180;
    const targetX = SCREEN_W / 2 + Math.cos(angle) * radius;
    const targetY = SCREEN_H * 0.4 - Math.sin(angle) * radius * 0.6 + Math.random() * 200;
    const delay = Math.random() * 200;
    const dur = 700 + Math.random() * 500;

    scale.value = withDelay(
      delay,
      withSequence(
        withTiming(1.2, { duration: 150, easing: Easing.out(Easing.back(3)) }),
        withTiming(1, { duration: 100 }),
      ),
    );
    x.value = withDelay(delay, withTiming(targetX, { duration: dur, easing: Easing.out(Easing.cubic) }));
    y.value = withDelay(
      delay,
      withSequence(
        withTiming(targetY - 60, { duration: dur * 0.5, easing: Easing.out(Easing.cubic) }),
        withTiming(targetY + SCREEN_H * 0.3, { duration: dur * 0.8, easing: Easing.in(Easing.quad) }),
      ),
    );
    rotate.value = withDelay(
      delay,
      withTiming(360 * (Math.random() > 0.5 ? 1 : -1), { duration: dur * 1.3 }),
    );
    opacity.value = withDelay(delay + dur * 0.6, withTiming(0, { duration: 500 }));
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (onDone) {
      timer = setTimeout(() => onDone(), 2000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [index, onDone, opacity, rotate, scale, x, y]);

  const style = useAnimatedStyle(() => ({
    position: 'absolute',
    left: x.value,
    top: y.value,
    opacity: opacity.value,
    transform: [
      { scale: scale.value },
      { rotate: `${rotate.value}deg` },
    ],
  }));

  const size = 6 + Math.random() * 6;
  const color = COLORS[index % COLORS.length];
  const isCircle = index % 3 === 0;

  return (
    <Animated.View style={style}>
      <View
        style={{
          width: size,
          height: isCircle ? size : size * 2.5,
          backgroundColor: color,
          borderRadius: isCircle ? size / 2 : 2,
        }}
      />
    </Animated.View>
  );
}

export default function CelebrationOverlay({ visible, onDone }: Props) {
  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: PARTICLE_COUNT }).map((_, i) => (
        <Particle key={i} index={i} onDone={i === 0 ? onDone : undefined} />
      ))}
    </View>
  );
}
