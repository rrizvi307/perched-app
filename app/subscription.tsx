/**
 * Subscription Management Screen
 *
 * View and manage premium subscription
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { usePremium } from '@/hooks/use-premium';
import { withAlpha } from '@/utils/colors';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { PremiumButton } from '@/components/ui/premium-button';
import { cancelPremiumSubscription, PRICING } from '@/services/premium';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import * as Haptics from 'expo-haptics';

export default function SubscriptionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { showToast } = useToast();

  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const card = useThemeColor({}, 'card');
  const border = useThemeColor({}, 'border');

  const {
    premiumStatus,
    loading,
    isPremium,
    daysRemaining,
    expirationDate,
    isReferralPremium,
    isPurchasedPremium,
    willAutoRenew,
  } = usePremium();

  const [cancelling, setCancelling] = useState(false);

  const handleBack = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    router.back();
  };

  const handleUpgrade = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    router.push('/premium-upgrade');
  };

  const handleCancelSubscription = async () => {
    if (!user?.id) return;

    try {
      setCancelling(true);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await cancelPremiumSubscription(user.id);
      showToast('Subscription cancelled. Access until ' + expirationDate, 'success');
    } catch (error) {
      showToast('Failed to cancel subscription', 'error');
    } finally {
      setCancelling(false);
    }
  };

  const premiumFeatures = [
    { icon: 'slider.horizontal.3', title: 'Advanced Filters', included: true },
    { icon: 'list.bullet.rectangle', title: 'Custom Lists', included: true },
    { icon: 'arrow.down.doc', title: 'Export History', included: true },
    { icon: 'sparkles', title: 'Ad-Free Experience', included: true },
    { icon: 'chart.bar', title: 'Exclusive Leaderboards', included: true },
    { icon: 'person.badge.shield.checkmark', title: 'Priority Support', included: true },
  ];

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: background }]}>
        <ActivityIndicator size="large" color={primary} style={styles.loader} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={24} color={primary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: text }]}>Subscription</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Status Card */}
        <View style={[styles.statusCard, { backgroundColor: card, borderColor: border }]}>
          <Text style={styles.statusEmoji}>{isPremium ? '✨' : '👋'}</Text>
          <Text style={[styles.statusTitle, { color: text }]}>
            {isPremium ? 'Premium Active' : 'Free Plan'}
          </Text>

          {isPremium && (
            <>
              <Text style={[styles.statusSubtitle, { color: muted }]}>
                {isReferralPremium && 'From referral rewards'}
                {isPurchasedPremium && `${premiumStatus?.period === 'annual' ? 'Annual' : 'Monthly'} subscription`}
              </Text>

              {daysRemaining !== null && (
                <View style={[styles.expirationBadge, { backgroundColor: withAlpha(primary, 0.15) }]}>
                  <IconSymbol name="clock" size={14} color={primary} />
                  <Text style={[styles.expirationText, { color: primary }]}>
                    {daysRemaining} days remaining
                  </Text>
                </View>
              )}

              {expirationDate && (
                <Text style={[styles.expirationDate, { color: muted }]}>
                  {willAutoRenew ? 'Renews' : 'Expires'} on {expirationDate}
                </Text>
              )}
            </>
          )}

          {!isPremium && (
            <Text style={[styles.statusSubtitle, { color: muted }]}>
              Upgrade to unlock all features
            </Text>
          )}
        </View>

        {/* Features List */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: text }]}>Premium Features</Text>
          <View style={styles.featuresList}>
            {premiumFeatures.map((feature, index) => (
              <View key={index} style={styles.featureRow}>
                <View style={[styles.featureIconBox, { backgroundColor: withAlpha(primary, 0.15) }]}>
                  <IconSymbol name={feature.icon as any} size={18} color={primary} />
                </View>
                <Text style={[styles.featureTitle, { color: text }]}>{feature.title}</Text>
                {isPremium ? (
                  <IconSymbol name="checkmark.circle.fill" size={20} color={primary} />
                ) : (
                  <IconSymbol name="lock.fill" size={16} color={muted} />
                )}
              </View>
            ))}
          </View>
        </View>

        {/* Pricing */}
        {!isPremium && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: text }]}>Pricing</Text>

            <View style={[styles.pricingCard, { backgroundColor: card, borderColor: primary }]}>
              <View style={styles.pricingRow}>
                <View>
                  <Text style={[styles.pricingTitle, { color: text }]}>Annual</Text>
                  <Text style={[styles.pricingPrice, { color: primary }]}>
                    {PRICING.annual.displayPrice}/year
                  </Text>
                  <Text style={[styles.pricingSavings, { color: primary }]}>
                    {PRICING.annual.savings}
                  </Text>
                </View>
                <View style={[styles.recommendedBadge, { backgroundColor: primary }]}>
                  <Text style={styles.recommendedText}>BEST</Text>
                </View>
              </View>
            </View>

            <View style={[styles.pricingCard, { backgroundColor: card, borderColor: border }]}>
              <View style={styles.pricingRow}>
                <View>
                  <Text style={[styles.pricingTitle, { color: text }]}>Monthly</Text>
                  <Text style={[styles.pricingPrice, { color: text }]}>
                    {PRICING.monthly.displayPrice}/month
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          {!isPremium && (
            <PremiumButton onPress={handleUpgrade} variant="primary" size="large" fullWidth>
              Upgrade to Premium
            </PremiumButton>
          )}

          {isPremium && isPurchasedPremium && willAutoRenew && (
            <PremiumButton
              onPress={handleCancelSubscription}
              variant="ghost"
              size="medium"
              fullWidth
              loading={cancelling}
            >
              Cancel Subscription
            </PremiumButton>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: muted }]}>
            Questions? Email support@perched.app
          </Text>
        </View>
      </ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loader: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  statusCard: {
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 32,
  },
  statusEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  statusTitle: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  statusSubtitle: {
    fontSize: 15,
    marginBottom: 12,
  },
  expirationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginBottom: 8,
  },
  expirationText: {
    fontSize: 14,
    fontWeight: '600',
  },
  expirationDate: {
    fontSize: 13,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  featuresList: {
    gap: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  pricingCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    marginBottom: 12,
  },
  pricingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pricingTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  pricingPrice: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 2,
  },
  pricingSavings: {
    fontSize: 14,
    fontWeight: '600',
  },
  recommendedBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  recommendedText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  actions: {
    gap: 12,
    marginBottom: 24,
  },
  footer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  footerText: {
    fontSize: 13,
    textAlign: 'center',
  },
});
