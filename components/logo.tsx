import { Fonts } from '@/constants/theme';
import { useThemePreference } from '@/contexts/ThemePreferenceContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import React from 'react';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Circle, Ellipse, Line, Polygon } from 'react-native-svg';

type LogoVariant = 'auto' | 'wordmark' | 'mark' | 'lockup';

/**
 * Perched Logo - Bird perched on branch in purple palette
 */
export default function Logo({
  size = 28,
  variant = 'auto',
  label = 'Perched',
}: {
  size?: number;
  variant?: LogoVariant;
  label?: string;
}) {
  const text = useThemeColor({}, 'text');
  const surface = useThemeColor({}, 'card');
  const { preference } = useThemePreference();
  const colorScheme = useColorScheme();
  const theme = preference === 'system' ? (colorScheme ?? 'light') : preference;

  // Brand colors - purple palette
  const gradientEnd = '#EC4899';   // Hot pink

  // Bird SVG Logo Mark Component
  const LogoMarkSVG = ({ size: s }: { size: number }) => (
    <Svg width={s} height={s} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="bodyGrad" x1="20%" y1="0%" x2="80%" y2="100%">
          <Stop offset="0%" stopColor="#EDE9FE" stopOpacity="1" />
          <Stop offset="100%" stopColor="#DDD6FE" stopOpacity="1" />
        </LinearGradient>
        <LinearGradient id="wingGrad" x1="20%" y1="0%" x2="80%" y2="100%">
          <Stop offset="0%" stopColor="#C4B5FD" stopOpacity="1" />
          <Stop offset="100%" stopColor="#A78BFA" stopOpacity="1" />
        </LinearGradient>
      </Defs>

      {/* Branch */}
      <Line x1="15" y1="72" x2="85" y2="62" stroke="#4C1D95" strokeWidth="3" strokeLinecap="round" />
      <Line x1="68" y1="65" x2="78" y2="56" stroke="#4C1D95" strokeWidth="2.2" strokeLinecap="round" />

      {/* Bird body */}
      <Ellipse cx="45" cy="48" rx="17" ry="14" fill="url(#bodyGrad)" rotation={-8} origin="45,48" />

      {/* Bird head */}
      <Circle cx="55" cy="34" r="10" fill="url(#bodyGrad)" />

      {/* Wing */}
      <Ellipse cx="37" cy="50" rx="13" ry="9" fill="url(#wingGrad)" rotation={-15} origin="37,50" />

      {/* Tail */}
      <Polygon points="22,52 13,44 16,56" fill={gradientEnd} />

      {/* Beak */}
      <Polygon points="67,32 73,34 67,36" fill={gradientEnd} />

      {/* Eye */}
      <Circle cx="59" cy="32" r="2" fill="#FFFFFF" />

      {/* Legs */}
      <Line x1="45" y1="64" x2="42" y2="70" stroke="#4C1D95" strokeWidth="1.5" strokeLinecap="round" />
      <Line x1="51" y1="63" x2="49" y2="69" stroke="#4C1D95" strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );

  const resolvedVariant: LogoVariant =
    variant === 'auto'
      ? theme === 'dark'
        ? 'lockup'
        : size >= 56
        ? 'wordmark'
        : 'mark'
      : variant;

  if (resolvedVariant === 'mark') {
    const markSize = Math.max(32, Math.round(size));
    return (
      <View style={[styles.wrap, { height: markSize }]}>
        <LogoMarkSVG size={markSize} />
      </View>
    );
  }

  if (resolvedVariant === 'lockup') {
    const markSize = Math.max(40, Math.round(size));
    const textSize = Math.max(20, Math.round(markSize * 0.6));
    const gap = Math.max(12, Math.round(markSize * 0.25));
    return (
      <View style={[styles.wrap, { height: markSize, flexDirection: 'row', alignItems: 'center' }]}>
        <LogoMarkSVG size={markSize} />
        <Text
          style={[
            styles.word,
            {
              color: theme === 'dark' ? gradientEnd : text,
              fontSize: textSize,
              marginLeft: gap,
            }
          ]}
        >
          {label}
        </Text>
      </View>
    );
  }

  // Wordmark variant
  const textSize = Math.max(18, Math.round(size));
  const showBackdrop = theme === 'dark';
  const padX = showBackdrop ? Math.max(10, Math.round(textSize * 0.5)) : 0;
  const padY = showBackdrop ? Math.max(6, Math.round(textSize * 0.3)) : 0;
  return (
    <View
      style={[
        styles.wrap,
        showBackdrop
          ? {
              paddingHorizontal: padX,
              paddingVertical: padY,
              borderRadius: Math.round((textSize + padY * 2) / 2),
              borderWidth: 2,
              borderColor: gradientEnd,
              backgroundColor: surface,
            }
          : null,
      ]}
    >
      <Text style={[styles.word, { color: text, fontSize: textSize }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  word: {
    fontWeight: '800',
    letterSpacing: 0.5,
    fontFamily: (Fonts as any)?.rounded || (Fonts as any)?.sans,
  },
});
