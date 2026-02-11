import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { purchasePremium } from '@/services/premium';

export default function PremiumUpgradeScreen() {
  const [loading, setLoading] = useState(false);

  const handlePurchase = async (productId: 'monthly' | 'yearly') => {
    setLoading(true);
    try {
      const success = await purchasePremium(productId);
      if (success) {
        Alert.alert('Welcome to Premium!', 'All features unlocked.');
        router.back();
      } else {
        Alert.alert('Purchase Unavailable', 'Please verify your App Store sandbox account and try again.');
      }
    } catch {
      Alert.alert('Purchase Failed', 'Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Unlock Premium</Text>
      <Text style={styles.subtitle}>Get the most out of Perched</Text>

      <View style={styles.features}>
        <FeatureItem icon="✓" text="Advanced filters (WiFi ≥4, Quiet, etc.)" />
        <FeatureItem icon="✓" text="Ad-free experience" />
        <FeatureItem icon="✓" text="Exclusive leaderboards" />
        <FeatureItem icon="✓" text="Custom spot lists" />
        <FeatureItem icon="✓" text="Export check-in history" />
      </View>

      <TouchableOpacity
        style={styles.pricingCard}
        onPress={() => handlePurchase('yearly')}
        disabled={loading}
        activeOpacity={0.9}
      >
        <Text style={styles.pricingBadge}>BEST VALUE</Text>
        <Text style={styles.pricingTitle}>Annual</Text>
        <Text style={styles.pricingPrice}>$49.99/year</Text>
        <Text style={styles.pricingSavings}>Save 17% vs monthly</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.pricingCard, styles.pricingCardSecondary]}
        onPress={() => handlePurchase('monthly')}
        disabled={loading}
        activeOpacity={0.9}
      >
        <Text style={styles.pricingTitle}>Monthly</Text>
        <Text style={styles.pricingPrice}>$4.99/month</Text>
      </TouchableOpacity>

      <Text style={styles.disclaimer}>7-day free trial. Cancel anytime. Auto-renewal.</Text>

      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.skipLink}>Maybe Later</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function FeatureItem({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.featureItem}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: 20, paddingBottom: 32 },
  title: { fontSize: 32, fontWeight: '800', textAlign: 'center', marginTop: 40, color: '#111827' },
  subtitle: { fontSize: 18, textAlign: 'center', color: '#6B7280', marginTop: 8 },
  features: { marginTop: 36 },
  featureItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  featureIcon: { fontSize: 20, marginRight: 12, color: '#10B981', fontWeight: '700' },
  featureText: { fontSize: 16, color: '#1F2937' },
  pricingCard: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 20,
    marginTop: 20,
    borderWidth: 2,
    borderColor: '#10B981',
  },
  pricingCardSecondary: { borderColor: '#E5E7EB' },
  pricingBadge: {
    backgroundColor: '#10B981',
    color: '#FFFFFF',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  pricingTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  pricingPrice: { fontSize: 28, fontWeight: '800', marginTop: 8, color: '#111827' },
  pricingSavings: { fontSize: 14, color: '#10B981', marginTop: 4, fontWeight: '600' },
  disclaimer: { fontSize: 12, color: '#6B7280', textAlign: 'center', marginTop: 20 },
  skipLink: { fontSize: 16, color: '#2563EB', textAlign: 'center', marginTop: 16, fontWeight: '600' },
});
