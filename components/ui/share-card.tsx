/**
 * Share Card Generator
 *
 * Creates beautiful cards optimized for Instagram Stories, Twitter, etc.
 */

import React from 'react';
import { View, Text, StyleSheet, Share, Platform } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { PremiumButton } from './premium-button';
import { IconSymbol } from './icon-symbol';
import { withAlpha } from '@/utils/colors';
import * as Haptics from 'expo-haptics';

export type ShareCardType = 'streak' | 'achievement' | 'referral' | 'checkin' | 'milestone';

interface ShareCardProps {
  type: ShareCardType;
  title: string;
  subtitle?: string;
  emoji?: string;
  stats?: {
    label: string;
    value: string | number;
  }[];
  referralCode?: string;
  onShare?: () => void;
}

export function ShareCard({
  type,
  title,
  subtitle,
  emoji,
  stats,
  referralCode,
  onShare,
}: ShareCardProps) {
  const primary = useThemeColor({}, 'primary');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const card = useThemeColor({}, 'card');

  const handleShare = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      let message = '';
      let url = 'https://perched.app'; // TODO: Replace with actual app URL

      switch (type) {
        case 'streak':
          message = `🔥 I just hit a ${title} on Perched! Join me in discovering great places to work and study.`;
          break;
        case 'achievement':
          message = `${emoji} ${title}! ${subtitle || ''} Check out Perched to track your own progress.`;
          break;
        case 'referral':
          message = `Hey! I'm using Perched to find the best cafes and study spots. Join me and get 3 days of premium free!`;
          if (referralCode) {
            url = `https://perched.app/invite/${referralCode}`;
          }
          break;
        case 'checkin':
          message = `Just checked in at ${title}! ${subtitle || ''} Find your perfect spot on Perched.`;
          break;
        case 'milestone':
          message = `🎉 ${title}! ${subtitle || ''} Celebrating on Perched.`;
          break;
      }

      const shareOptions: any = {
        message: `${message}\n\n${url}`,
      };

      if (Platform.OS === 'ios') {
        shareOptions.url = url;
      }

      await Share.share(shareOptions);

      onShare?.();
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: card }]}>
      {/* Card Content */}
      <View style={[styles.card, { backgroundColor: withAlpha(primary, 0.1) }]}>
        {emoji && <Text style={styles.emoji}>{emoji}</Text>}
        <Text style={[styles.title, { color: text }]}>{title}</Text>
        {subtitle && <Text style={[styles.subtitle, { color: muted }]}>{subtitle}</Text>}

        {stats && stats.length > 0 && (
          <View style={styles.stats}>
            {stats.map((stat, index) => (
              <View key={index} style={styles.stat}>
                <Text style={[styles.statValue, { color: primary }]}>{stat.value}</Text>
                <Text style={[styles.statLabel, { color: muted }]}>{stat.label}</Text>
              </View>
            ))}
          </View>
        )}

        {referralCode && (
          <View style={[styles.referralCode, { backgroundColor: card }]}>
            <Text style={[styles.referralCodeLabel, { color: muted }]}>Your invite code</Text>
            <Text style={[styles.referralCodeValue, { color: primary }]}>{referralCode}</Text>
          </View>
        )}

        {/* Branding */}
        <View style={styles.branding}>
          <IconSymbol name="bird" size={16} color={primary} />
          <Text style={[styles.brandingText, { color: primary }]}>Perched</Text>
        </View>
      </View>

      {/* Share Button */}
      <PremiumButton
        onPress={handleShare}
        variant="primary"
        size="medium"
        fullWidth
        icon="square.and.arrow.up"
        style={{ marginTop: 16 }}
      >
        Share
      </PremiumButton>
    </View>
  );
}

/**
 * Generate shareable text for different card types
 */
export function generateShareText(
  type: ShareCardType,
  data: {
    title: string;
    subtitle?: string;
    emoji?: string;
    referralCode?: string;
  }
): string {
  const { title, subtitle, emoji, referralCode } = data;
  const baseUrl = 'https://perched.app'; // TODO: Replace with actual URL
  const inviteUrl = referralCode ? `${baseUrl}/invite/${referralCode}` : baseUrl;

  switch (type) {
    case 'streak':
      return `🔥 I just hit a ${title} on Perched! Discovering great places to work and study every day. Join me: ${inviteUrl}`;

    case 'achievement':
      return `${emoji} ${title}! ${subtitle || ''} Tracking my work spot adventures on Perched. ${inviteUrl}`;

    case 'referral':
      return `Hey! I'm using Perched to find the best cafes, libraries, and study spots. Join me and get 3 days of premium free with code ${referralCode}! ${inviteUrl}`;

    case 'checkin':
      return `Just checked in at ${title}! ${subtitle || ''} Find your perfect work spot on Perched. ${inviteUrl}`;

    case 'milestone':
      return `🎉 ${title}! ${subtitle || ''} Celebrating my Perched journey. ${inviteUrl}`;

    default:
      return `Check out Perched - discover where your friends work and study! ${inviteUrl}`;
  }
}

/**
 * Share to specific platform
 */
export async function shareToPlatform(
  platform: 'instagram' | 'twitter' | 'copy',
  text: string
): Promise<void> {
  try {
    if (platform === 'copy') {
      // Copy to clipboard
      // TODO: Use Clipboard API
      await Share.share({ message: text });
    } else {
      // Native share
      await Share.share({ message: text });
    }
  } catch (error) {
    console.error(`Failed to share to ${platform}:`, error);
  }
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    borderRadius: 20,
  },
  card: {
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
  },
  emoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  stats: {
    flexDirection: 'row',
    gap: 32,
    marginTop: 16,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  referralCode: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  referralCodeLabel: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 4,
  },
  referralCodeValue: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 2,
  },
  branding: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 20,
  },
  brandingText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
