import { Fonts } from '@/constants/theme';
import { useThemePreference } from '@/contexts/ThemePreferenceContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import React from 'react';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from 'react-native-svg';

type LogoVariant = 'auto' | 'wordmark' | 'mark' | 'lockup';

/**
 * Modern Perched Logo - Clean, minimal, vibrant
 * Concept: Stylized "P" that also looks like a location pin with a perch
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

  // Modern gradient colors - purple to pink
  const gradientStart = '#8B5CF6'; // Vibrant purple
  const gradientEnd = '#EC4899';   // Hot pink

  // Modern SVG Logo Mark Component
  const LogoMarkSVG = ({ size }: { size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="modernGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={gradientStart} stopOpacity="1" />
          <Stop offset="100%" stopColor={gradientEnd} stopOpacity="1" />
        </LinearGradient>
      </Defs>

      {/* Modern location pin shape - rounder, cleaner */}
      <Path
        d="M 50 15 C 35 15 23 27 23 42 C 23 52 28 60 38 69 L 50 82 L 62 69 C 72 60 77 52 77 42 C 77 27 65 15 50 15 Z"
        fill="url(#modernGradient)"
      />

      {/* Inner circle - white */}
      <Circle cx="50" cy="40" r="14" fill="#FFFFFF" opacity="0.95" />

      {/* Stylized "P" inside that looks like a perch/branch */}
      <Path
        d="M 46 32 L 46 48 M 46 32 C 46 32 54 32 54 37 C 54 42 46 42 46 42"
        stroke={gradientEnd}
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Small dot accent - represents "perching" */}
      <Circle cx="54" cy="37" r="2" fill={gradientEnd} />
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
