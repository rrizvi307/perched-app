/**
 * Paywall Modal
 *
 * Beautiful premium upgrade modal with pricing and benefits
 */

import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable, ScrollView } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { withAlpha } from '@/utils/colors';
import { IconSymbol } from './icon-symbol';
import { PremiumButton } from './premium-button';
import { PRICING } from '@/services/premium';
import * as Haptics from 'expo-haptics';

interface PaywallModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectPlan: (period: 'monthly' | 'annual') => void;
  feature?: string;
}

export function PaywallModal({ visible, onClose, onSelectPlan, feature }: PaywallModalProps) {
  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const card = useThemeColor({}, 'card');
  const border = useThemeColor({}, 'border');

  const handleClose = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    onClose();
  };

  const handleSelectPlan = async (period: 'monthly' | 'annual') => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    onSelectPlan(period);
  };

  const premiumFeatures = [
    {
      icon: 'slider.horizontal.3',
      title: 'Advanced Filters',
      description: 'Filter by opening hours, WiFi speed 4+, and more',
    },
    {
      icon: 'list.bullet.rectangle',
      title: 'Custom Lists',
      description: 'Create and save custom spot collections',
    },
    {
      icon: 'arrow.down.doc',
      title: 'Export History',
      description: 'Export your check-in history as CSV',
    },
    {
      icon: 'sparkles',
      title: 'Ad-Free Experience',
      description: 'Enjoy Perched without any interruptions',
    },
    {
      icon: 'chart.bar',
      title: 'Exclusive Leaderboards',
      description: 'Compete on premium-only leaderboards',
    },
    {
      icon: 'person.badge.shield.checkmark',
      title: 'Priority Support',
      description: 'Get help faster with priority customer support',
    },
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.container, { backgroundColor: background }]}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <IconSymbol name="xmark" size={20} color={muted} />
          </Pressable>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          {/* Title */}
          <View style={styles.titleSection}>
            <Text style={[styles.emoji, { fontSize: 48 }]}>✨</Text>
            <Text style={[styles.title, { color: text }]}>Upgrade to Premium</Text>
            {feature && (
              <Text style={[styles.featureLabel, { color: muted }]}>
                {feature} requires premium
              </Text>
            )}
          </View>

          {/* Features */}
          <View style={styles.featuresSection}>
            {premiumFeatures.map((feat, index) => (
              <View
                key={index}
                style={[styles.featureItem, { backgroundColor: card, borderColor: border }]}
              >
                <View style={[styles.featureIcon, { backgroundColor: withAlpha(primary, 0.15) }]}>
                  <IconSymbol name={feat.icon as any} size={20} color={primary} />
                </View>
                <View style={styles.featureText}>
                  <Text style={[styles.featureTitle, { color: text }]}>{feat.title}</Text>
                  <Text style={[styles.featureDescription, { color: muted }]}>
                    {feat.description}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* Pricing */}
          <View style={styles.pricingSection}>
            {/* Annual Plan (Recommended) */}
            <Pressable
              onPress={() => handleSelectPlan('annual')}
              style={[
                styles.pricingCard,
                styles.recommendedCard,
                { backgroundColor: card, borderColor: primary },
              ]}
            >
              <View style={[styles.recommendedBadge, { backgroundColor: primary }]}>
                <Text style={styles.recommendedText}>BEST VALUE</Text>
              </View>
              <View style={styles.pricingHeader}>
                <Text style={[styles.pricingTitle, { color: text }]}>Annual</Text>
                <View style={styles.pricingRow}>
                  <Text style={[styles.pricingPrice, { color: primary }]}>
                    {PRICING.annual.displayPrice}
                  </Text>
                  <Text style={[styles.pricingPeriod, { color: muted }]}>/year</Text>
                </View>
                <Text style={[styles.pricingSavings, { color: primary }]}>
                  {PRICING.annual.savings}
                </Text>
              </View>
            </Pressable>

            {/* Monthly Plan */}
            <Pressable
              onPress={() => handleSelectPlan('monthly')}
              style={[styles.pricingCard, { backgroundColor: card, borderColor: border }]}
            >
              <View style={styles.pricingHeader}>
                <Text style={[styles.pricingTitle, { color: text }]}>Monthly</Text>
                <View style={styles.pricingRow}>
                  <Text style={[styles.pricingPrice, { color: text }]}>
                    {PRICING.monthly.displayPrice}
                  </Text>
                  <Text style={[styles.pricingPeriod, { color: muted }]}>/month</Text>
                </View>
              </View>
            </Pressable>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: muted }]}>
              Cancel anytime. Premium access until end of period.
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  closeButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  emoji: {
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  featureLabel: {
    fontSize: 15,
    textAlign: 'center',
  },
  featuresSection: {
    gap: 12,
    marginBottom: 32,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  featureDescription: {
    fontSize: 14,
  },
  pricingSection: {
    gap: 12,
    marginBottom: 24,
  },
  pricingCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    position: 'relative',
  },
  recommendedCard: {
    borderWidth: 2,
  },
  recommendedBadge: {
    position: 'absolute',
    top: -12,
    left: '50%',
    transform: [{ translateX: -45 }],
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  recommendedText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  pricingHeader: {
    alignItems: 'center',
  },
  pricingTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  pricingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  pricingPrice: {
    fontSize: 32,
    fontWeight: '800',
  },
  pricingPeriod: {
    fontSize: 16,
    marginLeft: 4,
  },
  pricingSavings: {
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    textAlign: 'center',
  },
});
