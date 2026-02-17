import { Fonts } from '@/constants/theme';
import { useThemePreference } from '@/contexts/ThemePreferenceContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import React from 'react';
import { Image, StyleSheet, Text, View, useColorScheme } from 'react-native';

type LogoVariant = 'auto' | 'wordmark' | 'mark' | 'lockup';
const MARK_IMAGE = require('../assets/brand/perched-mark-slim.png');

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

  const LogoMark = ({ size: s }: { size: number }) => (
    <Image source={MARK_IMAGE} style={{ width: s, height: s }} resizeMode="contain" />
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
        <LogoMark size={markSize} />
      </View>
    );
  }

  if (resolvedVariant === 'lockup') {
    const markSize = Math.max(40, Math.round(size));
    const textSize = Math.max(20, Math.round(markSize * 0.6));
    const gap = Math.max(12, Math.round(markSize * 0.25));
    return (
      <View style={[styles.wrap, { height: markSize, flexDirection: 'row', alignItems: 'center' }]}>
        <LogoMark size={markSize} />
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
