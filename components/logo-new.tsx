import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from 'react-native-svg';
import { Fonts } from '@/constants/theme';
import { useThemeColor } from '@/hooks/use-theme-color';
import { withAlpha } from '@/utils/colors';

type LogoVariant = 'mark' | 'lockup' | 'wordmark';

interface NewLogoProps {
  size?: number;
  variant?: LogoVariant;
  animated?: boolean;
}

/**
 * Brand new Perched logo with vibrant purple/pink gradient
 * Represents a location pin + a bird perched on it
 * Modern, minimal, Instagram/TikTok-inspired
 */
export default function NewLogo({ size = 40, variant = 'mark', animated = false }: NewLogoProps) {
  const primary = useThemeColor({}, 'primary');
  const accent = useThemeColor({}, 'accent');
  const text = useThemeColor({}, 'text');
  const isDark = useThemeColor({}, 'background') === '#000000';

  // Logo mark: Modern bird perched on location pin
  const LogoMark = ({ size }: { size: number }) => (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        {/* Purple to Pink gradient (Instagram-inspired) */}
        <LinearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor={primary} stopOpacity="1" />
          <Stop offset="100%" stopColor={accent} stopOpacity="1" />
        </LinearGradient>

        {/* Glow effect for dark mode */}
        {isDark && (
          <LinearGradient id="glowGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={primary} stopOpacity="0.3" />
            <Stop offset="100%" stopColor={accent} stopOpacity="0.3" />
          </LinearGradient>
        )}
      </Defs>

      {/* Glow circle in dark mode */}
      {isDark && (
        <Circle cx="50" cy="50" r="45" fill="url(#glowGradient)" />
      )}

      {/* Location pin base */}
      <Path
        d="M 50 20 C 38 20 28 30 28 42 C 28 50 32 57 40 64 L 50 75 L 60 64 C 68 57 72 50 72 42 C 72 30 62 20 50 20 Z"
        fill="url(#logoGradient)"
        stroke={isDark ? withAlpha(primary, 0.5) : 'transparent'}
        strokeWidth="1"
      />

      {/* Bird perched on top - simplified elegant design */}
      <Path
        d="M 50 15 L 45 20 L 42 18 L 45 15 L 50 12 L 55 15 L 58 18 L 55 20 Z"
        fill={isDark ? '#FFFFFF' : '#FFFFFF'}
        opacity="0.95"
      />

      {/* Bird's wing */}
      <Path
        d="M 45 17 C 43 19 41 20 39 19 L 42 16 Z"
        fill={isDark ? withAlpha('#FFFFFF', 0.8) : withAlpha('#FFFFFF', 0.8)}
      />

      {/* Inner circle/heart of location */}
      <Circle
        cx="50"
        cy="42"
        r="8"
        fill="#FFFFFF"
        opacity="0.9"
      />

      {/* Small heart shape in center */}
      <Path
        d="M 50 38 L 47 41 L 50 44 L 53 41 Z"
        fill="url(#logoGradient)"
      />
    </Svg>
  );

  if (variant === 'mark') {
    return (
      <View style={[styles.container, { width: size, height: size }]}>
        <LogoMark size={size} />
      </View>
    );
  }

  if (variant === 'lockup') {
    const textSize = Math.round(size * 0.6);
    return (
      <View style={styles.lockup}>
        <LogoMark size={size} />
        <Text
          style={[
            styles.wordmark,
            {
              fontSize: textSize,
              color: isDark ? primary : text,
              marginLeft: size * 0.25,
            },
          ]}
        >
          Perched
        </Text>
      </View>
    );
  }

  // Wordmark only
  const textSize = Math.round(size * 0.5);
  return (
    <Text
      style={[
        styles.wordmark,
        {
          fontSize: textSize,
          color: isDark ? primary : text,
        },
      ]}
    >
      Perched
    </Text>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wordmark: {
    fontWeight: '800',
    letterSpacing: 0.5,
    fontFamily: (Fonts as any)?.rounded || (Fonts as any)?.sans,
  },
});
