/**
 * Campus Ambassador Badge
 *
 * Visual badge displayed on ambassador profiles
 */

import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { IconSymbol } from './icon-symbol';
import { withAlpha } from '@/utils/colors';
import * as Haptics from 'expo-haptics';

interface CampusAmbassadorBadgeProps {
  variant?: 'default' | 'compact' | 'full';
  rank?: number; // Ambassador rank (1 = top ambassador)
  campusName?: string;
  onPress?: () => void;
}

export function CampusAmbassadorBadge({
  variant = 'default',
  rank,
  campusName,
  onPress,
}: CampusAmbassadorBadgeProps) {
  const primary = useThemeColor({}, 'primary');
  const muted = useThemeColor({}, 'muted');

  const handlePress = async () => {
    if (onPress) {
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      } catch {}
      onPress();
    }
  };

  if (variant === 'compact') {
    return (
      <Pressable
        onPress={handlePress}
        disabled={!onPress}
        style={[styles.compactBadge, { backgroundColor: withAlpha(primary, 0.15), borderColor: primary }]}
      >
        <IconSymbol name="star.fill" size={12} color={primary} />
        <Text style={[styles.compactText, { color: primary }]}>Ambassador</Text>
      </Pressable>
    );
  }

  if (variant === 'full') {
    return (
      <Pressable
        onPress={handlePress}
        disabled={!onPress}
        style={[styles.fullBadge, { backgroundColor: withAlpha(primary, 0.1), borderColor: primary }]}
      >
        <View style={[styles.fullIcon, { backgroundColor: withAlpha(primary, 0.2) }]}>
          <IconSymbol name="star.fill" size={24} color={primary} />
        </View>
        <View style={styles.fullContent}>
          <View style={styles.fullHeader}>
            <Text style={[styles.fullTitle, { color: primary }]}>Campus Ambassador</Text>
            {rank && rank <= 10 && (
              <View style={[styles.rankBadge, { backgroundColor: withAlpha(primary, 0.2) }]}>
                <Text style={[styles.rankText, { color: primary }]}>#{rank}</Text>
              </View>
            )}
          </View>
          {campusName && (
            <Text style={[styles.fullSubtitle, { color: muted }]}>{campusName}</Text>
          )}
          <Text style={[styles.fullDescription, { color: muted }]}>
            Trusted community leader helping students discover great places
          </Text>
        </View>
        {onPress && <IconSymbol name="chevron.right" size={16} color={muted} />}
      </Pressable>
    );
  }

  // Default variant
  return (
    <Pressable
      onPress={handlePress}
      disabled={!onPress}
      style={[styles.defaultBadge, { backgroundColor: withAlpha(primary, 0.15), borderColor: primary }]}
    >
      <IconSymbol name="star.fill" size={16} color={primary} />
      <View style={styles.defaultContent}>
        <Text style={[styles.defaultTitle, { color: primary }]}>Campus Ambassador</Text>
        {rank && rank <= 10 && (
          <Text style={[styles.defaultRank, { color: primary }]}>Rank #{rank}</Text>
        )}
      </View>
      {onPress && <IconSymbol name="chevron.right" size={14} color={primary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  compactBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  compactText: {
    fontSize: 11,
    fontWeight: '700',
  },
  defaultBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  defaultContent: {
    flex: 1,
  },
  defaultTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  defaultRank: {
    fontSize: 12,
    fontWeight: '600',
  },
  fullBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
  },
  fullIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullContent: {
    flex: 1,
  },
  fullHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  fullTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  rankBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  rankText: {
    fontSize: 12,
    fontWeight: '800',
  },
  fullSubtitle: {
    fontSize: 14,
    marginBottom: 8,
  },
  fullDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
});
