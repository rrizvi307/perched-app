import { Fonts } from '@/constants/theme';
import { useThemePreference } from '@/contexts/ThemePreferenceContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import React from 'react';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from 'react-native-svg';

type LogoVariant = 'auto' | 'wordmark' | 'mark' | 'lockup';

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
  const primary = useThemeColor({}, 'primary');
  const accent = useThemeColor({}, 'accent');
  const { preference } = useThemePreference();
  const systemScheme = useColorScheme() ?? 'light';
  const theme = preference === 'system' ? systemScheme : preference;

  // SVG Logo Mark Component
  const LogoMarkSVG = ({ size }: { size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <LinearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={primary} stopOpacity="1" />
          <Stop offset="100%" stopColor={accent} stopOpacity="1" />
        </LinearGradient>
      </Defs>

      {/* Location pin base with gradient */}
      <Path
        d="M 50 20 C 38 20 28 30 28 42 C 28 50 32 57 40 64 L 50 75 L 60 64 C 68 57 72 50 72 42 C 72 30 62 20 50 20 Z"
        fill="url(#logoGradient)"
      />

      {/* White center circle */}
      <Circle cx="50" cy="42" r="10" fill="#FFFFFF" opacity="0.95" />

      {/* Small heart/location dot */}
      <Circle cx="50" cy="42" r="4" fill={primary} />

      {/* Bird perched on top - simplified */}
      <Path
        d="M 50 12 L 44 18 L 50 15 L 56 18 Z"
        fill="#FFFFFF"
      />

      {/* Bird wing */}
      <Path
        d="M 44 17 C 42 18 40 18 38 17"
        stroke="#FFFFFF"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
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
              color: theme === 'dark' ? primary : text,
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
              borderColor: primary,
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
    letterSpacing: 0.3,
    fontFamily: (Fonts as any)?.rounded || (Fonts as any)?.sans,
  },
});
