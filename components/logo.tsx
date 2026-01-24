import { Fonts } from '@/constants/theme';
import { useThemePreference } from '@/contexts/ThemePreferenceContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import React from 'react';
import { Image, StyleSheet, Text, View, useColorScheme } from 'react-native';

const logoMark = require('@/assets/brand/Perched Mark Square.png');

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
  const border = useThemeColor({}, 'border');
  const surface = useThemeColor({}, 'card');
  const { preference } = useThemePreference();
  const systemScheme = useColorScheme() ?? 'light';
  const theme = preference === 'system' ? systemScheme : preference;

  const resolvedVariant: LogoVariant =
    variant === 'auto'
      ? theme === 'dark'
        ? 'lockup'
        : size >= 56
        ? 'wordmark'
        : 'mark'
      : variant;

  if (resolvedVariant === 'mark') {
    const markSize = Math.max(22, Math.round(size));
    return (
      <View style={[styles.wrap, { height: markSize }]}>
        <View
          style={[
            styles.markWrap,
            {
              width: markSize,
              height: markSize,
              borderColor: border,
              borderRadius: Math.round(markSize * 0.22),
              backgroundColor: '#FBFAF8',
            },
          ]}
        >
          <Image
            source={logoMark}
            style={{ width: markSize, height: markSize }}
            resizeMode="contain"
          />
        </View>
      </View>
    );
  }

  if (resolvedVariant === 'lockup') {
    const markSize = Math.max(36, Math.round(size));
    const textSize = Math.max(20, Math.round(markSize * 0.68));
    const gap = Math.max(10, Math.round(markSize * 0.2));
    return (
      <View style={[styles.wrap, { height: markSize }]}>
        <View
          style={[
            styles.markWrap,
            {
              width: markSize,
              height: markSize,
              borderColor: border,
              borderRadius: Math.round(markSize * 0.22),
              backgroundColor: '#FBFAF8',
            },
          ]}
        >
          <Image
            source={logoMark}
            style={{ width: markSize, height: markSize }}
            resizeMode="contain"
          />
        </View>
        <Text style={[styles.word, { color: text, fontSize: textSize, marginLeft: gap }]}>{label}</Text>
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
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: border,
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
  wrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  markWrap: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  word: {
    fontWeight: '700',
    letterSpacing: 0.2,
    fontFamily: (Fonts as any)?.rounded || (Fonts as any)?.sans,
  },
});
