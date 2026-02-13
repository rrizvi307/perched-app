/**
 * Business Claim Screen
 *
 * Allows spot owners to claim their business on Perched
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAuth } from '@/contexts/AuthContext';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { claimSpot } from '@/services/businessAnalytics';
import * as Haptics from 'expo-haptics';

export default function BusinessClaimScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const card = useThemeColor({}, 'card');
  const border = useThemeColor({}, 'border');

  const [spotId, setSpotId] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!user?.id) {
      Alert.alert('Error', 'Please sign in to claim a spot');
      return;
    }

    if (!spotId.trim()) {
      Alert.alert('Error', 'Please enter a Spot ID');
      return;
    }

    if (!ownerEmail.trim()) {
      Alert.alert('Error', 'Please enter your business email');
      return;
    }

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    setSubmitting(true);

    try {
      const result = await claimSpot(user.id, spotId.trim(), ownerEmail.trim(), {
        phone: phone.trim() || undefined,
        website: website.trim() || undefined,
      });

      if (result.success) {
        Alert.alert(
          'Claim Submitted!',
          'Your claim has been submitted for verification. We\'ll review it within 24-48 hours and send you an email.',
          [
            {
              text: 'OK',
              onPress: () => router.push('/business' as any),
            },
          ]
        );
      } else {
        Alert.alert('Error', result.error || 'Failed to claim spot');
      }
    } catch (error) {
      console.error('Failed to claim spot:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={24} color={primary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: text }]}>Claim Your Spot</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Info Banner */}
        <View style={[styles.infoBanner, { backgroundColor: card, borderColor: border }]}>
          <IconSymbol name="info.circle.fill" size={24} color={primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.infoBannerTitle, { color: text }]}>How to Find Your Spot ID</Text>
            <Text style={[styles.infoBannerText, { color: muted }]}>
              1. Search for your spot in the Perched app{'\n'}
              2. Open the spot details page{'\n'}
              3. The Spot ID will be shown at the bottom
            </Text>
          </View>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: text }]}>
              Spot ID <Text style={{ color: '#ef4444' }}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: card, color: text, borderColor: border }]}
              placeholder="e.g., spot_abc123xyz"
              placeholderTextColor={muted}
              value={spotId}
              onChangeText={setSpotId}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: text }]}>
              Business Email <Text style={{ color: '#ef4444' }}>*</Text>
            </Text>
            <TextInput
              style={[styles.input, { backgroundColor: card, color: text, borderColor: border }]}
              placeholder="owner@mybusiness.com"
              placeholderTextColor={muted}
              value={ownerEmail}
              onChangeText={setOwnerEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={[styles.helpText, { color: muted }]}>
              We&apos;ll use this to verify ownership
            </Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: text }]}>Business Phone (Optional)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: card, color: text, borderColor: border }]}
              placeholder="(555) 123-4567"
              placeholderTextColor={muted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={[styles.label, { color: text }]}>Website (Optional)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: card, color: text, borderColor: border }]}
              placeholder="https://mybusiness.com"
              placeholderTextColor={muted}
              value={website}
              onChangeText={setWebsite}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        {/* Benefits */}
        <View style={[styles.section, { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.sectionTitle, { color: text }]}>What You&apos;ll Get</Text>
          <View style={styles.benefitsList}>
            <Benefit
              icon="chart.line.uptrend.xyaxis"
              title="Analytics Dashboard"
              description="See check-in trends, peak hours, and user demographics"
              textColor={text}
              mutedColor={muted}
              iconColor={primary}
            />
            <Benefit
              icon="megaphone.fill"
              title="Run Promotions"
              description="Create offers and boost your visibility to nearby users"
              textColor={text}
              mutedColor={muted}
              iconColor={primary}
            />
            <Benefit
              icon="chart.bar.xaxis"
              title="Competitive Insights"
              description="See how you compare to nearby spots"
              textColor={text}
              mutedColor={muted}
              iconColor={primary}
            />
            <Benefit
              icon="bubble.left.and.bubble.right.fill"
              title="Engage with Customers"
              description="Respond to check-ins and build relationships"
              textColor={text}
              mutedColor={muted}
              iconColor={primary}
            />
          </View>
        </View>

        {/* Pricing Preview */}
        <View style={[styles.section, { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.sectionTitle, { color: text }]}>Pricing</Text>
          <View style={styles.pricingGrid}>
            <PricingTier
              name="Basic"
              price="$99"
              period="month"
              features={['1 location', 'Basic analytics', 'Promotions', 'Email support']}
              textColor={text}
              mutedColor={muted}
              borderColor={border}
            />
            <PricingTier
              name="Pro"
              price="$299"
              period="month"
              features={['3 locations', 'Advanced analytics', 'Featured promotions', 'Priority support']}
              recommended
              textColor={text}
              mutedColor={muted}
              borderColor={border}
              primary={primary}
            />
          </View>
          <Text style={[styles.pricingNote, { color: muted }]}>
            Free 14-day trial • Cancel anytime
          </Text>
        </View>

        {/* Submit Button */}
        <Pressable
          onPress={handleSubmit}
          disabled={submitting}
          style={[styles.submitButton, { backgroundColor: submitting ? muted : primary }]}
        >
          {submitting ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <>
              <Text style={styles.submitButtonText}>Submit Claim</Text>
              <IconSymbol name="arrow.right" size={16} color="#FFFFFF" />
            </>
          )}
        </Pressable>

        <Text style={[styles.disclaimer, { color: muted }]}>
          By submitting this claim, you confirm that you are the owner or authorized representative of this business.
          We&apos;ll verify your claim within 24-48 hours.
        </Text>
      </ScrollView>
    </View>
  );
}

function Benefit({
  icon,
  title,
  description,
  textColor,
  mutedColor,
  iconColor,
}: {
  icon: string;
  title: string;
  description: string;
  textColor: string;
  mutedColor: string;
  iconColor: string;
}) {
  return (
    <View style={styles.benefit}>
      <View style={[styles.benefitIcon, { backgroundColor: `${iconColor}20` }]}>
        <IconSymbol name={icon as any} size={20} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.benefitTitle, { color: textColor }]}>{title}</Text>
        <Text style={[styles.benefitDescription, { color: mutedColor }]}>{description}</Text>
      </View>
    </View>
  );
}

function PricingTier({
  name,
  price,
  period,
  features,
  recommended,
  textColor,
  mutedColor,
  borderColor,
  primary,
}: {
  name: string;
  price: string;
  period: string;
  features: string[];
  recommended?: boolean;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  primary?: string;
}) {
  return (
    <View
      style={[
        styles.pricingTier,
        {
          borderColor: recommended ? primary : borderColor,
          borderWidth: recommended ? 2 : 1,
        },
      ]}
    >
      {recommended && (
        <View style={[styles.recommendedBadge, { backgroundColor: primary }]}>
          <Text style={styles.recommendedBadgeText}>RECOMMENDED</Text>
        </View>
      )}
      <Text style={[styles.pricingName, { color: textColor }]}>{name}</Text>
      <View style={styles.pricingPrice}>
        <Text style={[styles.pricingPriceValue, { color: textColor }]}>{price}</Text>
        <Text style={[styles.pricingPricePeriod, { color: mutedColor }]}>/{period}</Text>
      </View>
      <View style={styles.pricingFeatures}>
        {features.map((feature, index) => (
          <View key={index} style={styles.pricingFeature}>
            <IconSymbol name="checkmark.circle.fill" size={14} color={primary || textColor} />
            <Text style={[styles.pricingFeatureText, { color: textColor }]}>{feature}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  content: {
    padding: 16,
  },
  infoBanner: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 24,
  },
  infoBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  infoBannerText: {
    fontSize: 12,
    lineHeight: 18,
  },
  form: {
    gap: 20,
    marginBottom: 24,
  },
  formGroup: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 15,
  },
  helpText: {
    fontSize: 12,
  },
  section: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 16,
  },
  benefitsList: {
    gap: 16,
  },
  benefit: {
    flexDirection: 'row',
    gap: 12,
  },
  benefitIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  benefitDescription: {
    fontSize: 12,
    lineHeight: 17,
  },
  pricingGrid: {
    gap: 12,
  },
  pricingTier: {
    borderRadius: 12,
    padding: 16,
    position: 'relative',
  },
  recommendedBadge: {
    position: 'absolute',
    top: -10,
    right: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  recommendedBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  pricingName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  pricingPrice: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  pricingPriceValue: {
    fontSize: 32,
    fontWeight: '800',
  },
  pricingPricePeriod: {
    fontSize: 14,
  },
  pricingFeatures: {
    gap: 8,
  },
  pricingFeature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pricingFeatureText: {
    fontSize: 13,
  },
  pricingNote: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  disclaimer: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: 'center',
  },
});
