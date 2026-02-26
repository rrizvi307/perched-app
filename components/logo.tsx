import { Fonts } from '@/constants/theme';
import { useThemePreference } from '@/contexts/ThemePreferenceContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import React from 'react';
import { Image, Platform, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SvgXml } from 'react-native-svg';

type LogoVariant = 'auto' | 'wordmark' | 'mark' | 'lockup';

const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="106 101 320 320">
  <defs>
    <linearGradient id="brandGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#8B5CF6;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#EC4899;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="brandGradDark" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#7C3AED;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#DB2777;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="brandGradLight" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#A78BFA;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#F472B6;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="steamGrad" x1="0%" y1="100%" x2="0%" y2="0%">
      <stop offset="0%" style="stop-color:#A78BFA;stop-opacity:0.6" />
      <stop offset="100%" style="stop-color:#A78BFA;stop-opacity:0" />
    </linearGradient>
  </defs>
  <path d="M 175 255 L 190 365 Q 193 383, 211 383 L 331 383 Q 349 383, 352 365 L 367 255 Z" fill="url(#brandGrad)" opacity="0.15"/>
  <path d="M 175 255 L 190 365 Q 193 383, 211 383 L 331 383 Q 349 383, 352 365 L 367 255 Z" fill="none" stroke="url(#brandGrad)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M 367 280 Q 408 280, 408 315 Q 408 348, 367 348" fill="none" stroke="url(#brandGrad)" stroke-width="8" stroke-linecap="round"/>
  <line x1="193" y1="282" x2="349" y2="282" stroke="url(#brandGradLight)" stroke-width="3" opacity="0.35" stroke-linecap="round"/>
  <ellipse cx="271" cy="390" rx="115" ry="13" fill="none" stroke="url(#brandGrad)" stroke-width="6" opacity="0.45"/>
  <path d="M 240 245 Q 234 218, 242 190 Q 250 162, 238 135" fill="none" stroke="url(#steamGrad)" stroke-width="4" stroke-linecap="round" opacity="0.5"/>
  <path d="M 275 240 Q 268 208, 277 178 Q 286 148, 272 120" fill="none" stroke="url(#steamGrad)" stroke-width="4" stroke-linecap="round" opacity="0.6"/>
  <path d="M 310 243 Q 306 215, 313 188 Q 320 160, 308 134" fill="none" stroke="url(#steamGrad)" stroke-width="4" stroke-linecap="round" opacity="0.45"/>
  <ellipse cx="200" cy="222" rx="38" ry="29" fill="url(#brandGrad)" transform="rotate(10, 200, 222)"/>
  <circle cx="235" cy="195" r="21" fill="url(#brandGrad)"/>
  <circle cx="244" cy="191" r="5.5" fill="#FFFFFF"/>
  <circle cx="245.5" cy="189.5" r="2.2" fill="#1a1a2e"/>
  <polygon points="256,193 275,199 256,205" fill="#FBBF24"/>
  <path d="M 170 215 Q 190 198, 212 208 Q 192 212, 176 228 Z" fill="#7C3AED" opacity="0.6"/>
  <path d="M 164 223 Q 186 204, 208 216 Q 188 220, 170 236 Z" fill="#7C3AED" opacity="0.4"/>
  <path d="M 164 222 L 130 200 L 150 230 Z" fill="#EC4899" opacity="0.8"/>
  <path d="M 164 228 L 124 214 L 148 238 Z" fill="#DB2777" opacity="0.65"/>
  <path d="M 164 234 L 128 230 L 152 248 Z" fill="#8B5CF6" opacity="0.55"/>
  <path d="M 192 248 L 189 255" stroke="#FBBF24" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M 183 254 L 196 254" stroke="#FBBF24" stroke-width="2" stroke-linecap="round"/>
  <path d="M 210 245 L 212 255" stroke="#FBBF24" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M 205 254 L 219 254" stroke="#FBBF24" stroke-width="2" stroke-linecap="round"/>
</svg>`;

// Web fallback PNG (react-native-svg gradient rendering can be spotty on web)
const MARK_IMAGE = require('../assets/brand/perched-mark.png');

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
    Platform.OS === 'web'
      ? <Image source={MARK_IMAGE} style={{ width: s, height: s }} resizeMode="contain" />
      : <SvgXml xml={MARK_SVG} width={s} height={s} />
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
