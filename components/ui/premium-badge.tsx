/**
 * Premium Badge
 *
 * Shows premium status badge
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { IconSymbol } from './icon-symbol';

interface PremiumBadgeProps {
  size?: 'small' | 'medium' | 'large';
}

export function PremiumBadge({ size = 'medium' }: PremiumBadgeProps) {
  const primary = useThemeColor({}, 'primary');

  const sizeConfig = {
    small: {
      paddingVertical: 2,
      paddingHorizontal: 6,
      fontSize: 10,
      iconSize: 10,
    },
    medium: {
      paddingVertical: 4,
      paddingHorizontal: 8,
      fontSize: 11,
      iconSize: 12,
    },
    large: {
      paddingVertical: 6,
      paddingHorizontal: 10,
      fontSize: 12,
      iconSize: 14,
    },
  }[size];

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: primary,
          paddingVertical: sizeConfig.paddingVertical,
          paddingHorizontal: sizeConfig.paddingHorizontal,
        },
      ]}
    >
      <IconSymbol name="sparkles" size={sizeConfig.iconSize} color="#FFFFFF" />
      <Text style={[styles.text, { fontSize: sizeConfig.fontSize }]}>PREMIUM</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 6,
  },
  text: {
    color: '#FFFFFF',
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
