import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useState } from 'react';
import { router } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { PolishedHeader } from '@/components/ui/polished-header';
import { CampusSelector } from '@/components/ui/campus-selector';
import { PolishedCard } from '@/components/ui/polished-card';
import { PremiumButton } from '@/components/ui/premium-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import { withAlpha } from '@/utils/colors';

interface Campus {
  id: string;
  name: string;
  shortName?: string;
  location: string;
  domain: string;
  verified?: boolean;
  studentCount?: number;
}

/**
 * Campus sync/onboarding screen
 * Helps users connect with their university community
 */
export default function CampusSyncScreen() {
  const [selectedCampus, setSelectedCampus] = useState<Campus | null>(null);
  const [verificationMethod, setVerificationMethod] = useState<'email' | 'manual' | null>(null);

  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const success = useThemeColor({}, 'success');

  const handleSaveCampus = async () => {
    if (!selectedCampus) return;

    // TODO: Save campus to user profile
    console.log('Saving campus:', selectedCampus);
    router.back();
  };

  return (
    <ThemedView style={{ flex: 1 }}>
      <PolishedHeader
        title="University Sync"
      />

      {!selectedCampus ? (
        // Campus Selection
        <CampusSelector
          onSelect={(campus) => setSelectedCampus(campus)}
          selectedCampus={selectedCampus || undefined}
        />
      ) : (
        // Verification Method Selection
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Selected Campus */}
          <PolishedCard variant="elevated" animated style={styles.selectedCard}>
            <View style={styles.selectedHeader}>
              <View
                style={[
                  styles.campusIconLarge,
                  { backgroundColor: withAlpha(primary, 0.1) },
                ]}
              >
                <IconSymbol name="building.2.fill" size={32} color={primary} />
              </View>
              <View style={styles.selectedInfo}>
                <View style={styles.nameRow}>
                  <Text style={[styles.selectedName, { color: text }]}>
                    {selectedCampus.name}
                  </Text>
                  {selectedCampus.verified && (
                    <IconSymbol name="checkmark.seal.fill" size={20} color={success} />
                  )}
                </View>
                <Text style={[styles.selectedLocation, { color: muted }]}>
                  {selectedCampus.location}
                </Text>
              </View>
            </View>

            <PremiumButton
              onPress={() => setSelectedCampus(null)}
              variant="ghost"
              size="small"
              icon="arrow.left.arrow.right"
              style={{ marginTop: 16 }}
            >
              Change Campus
            </PremiumButton>
          </PolishedCard>

          {/* Verification Methods */}
          <Text style={[styles.sectionTitle, { color: text }]}>Verify Your Campus</Text>
          <Text style={[styles.sectionDescription, { color: muted }]}>
            Choose how you&apos;d like to verify your university affiliation
          </Text>

          {/* Email Verification */}
          <PolishedCard
            variant="elevated"
            animated
            delay={100}
            pressable
            onPress={() => setVerificationMethod('email')}
            style={[
              styles.methodCard,
              verificationMethod === 'email' ? {
                borderColor: primary,
                borderWidth: 2,
              } : undefined,
            ] as any}
          >
            <View style={styles.methodContent}>
              <View
                style={[
                  styles.methodIcon,
                  { backgroundColor: withAlpha(primary, 0.1) },
                ]}
              >
                <IconSymbol name="envelope.fill" size={24} color={primary} />
              </View>
              <View style={styles.methodInfo}>
                <Text style={[styles.methodTitle, { color: text }]}>
                  Email Verification
                </Text>
                <Text style={[styles.methodDescription, { color: muted }]}>
                  Verify using your {selectedCampus.domain} email address
                </Text>
                <View style={styles.methodBadge}>
                  <IconSymbol name="checkmark.circle.fill" size={12} color={success} />
                  <Text style={[styles.methodBadgeText, { color: success }]}>
                    Recommended
                  </Text>
                </View>
              </View>
              {verificationMethod === 'email' && (
                <IconSymbol name="checkmark.circle.fill" size={24} color={primary} />
              )}
            </View>
          </PolishedCard>

          {/* Manual Verification */}
          <PolishedCard
            variant="elevated"
            animated
            delay={150}
            pressable
            onPress={() => setVerificationMethod('manual')}
            style={[
              styles.methodCard,
              verificationMethod === 'manual' ? {
                borderColor: primary,
                borderWidth: 2,
              } : undefined,
            ] as any}
          >
            <View style={styles.methodContent}>
              <View
                style={[
                  styles.methodIcon,
                  { backgroundColor: withAlpha(muted, 0.1) },
                ]}
              >
                <IconSymbol name="person.text.rectangle" size={24} color={muted} />
              </View>
              <View style={styles.methodInfo}>
                <Text style={[styles.methodTitle, { color: text }]}>
                  Skip for Now
                </Text>
                <Text style={[styles.methodDescription, { color: muted }]}>
                  You can verify later to unlock campus features
                </Text>
              </View>
              {verificationMethod === 'manual' && (
                <IconSymbol name="checkmark.circle.fill" size={24} color={primary} />
              )}
            </View>
          </PolishedCard>

          {/* Benefits */}
          <PolishedCard variant="flat" animated delay={200} style={styles.benefitsCard}>
            <Text style={[styles.benefitsTitle, { color: text }]}>
              Campus Benefits
            </Text>
            <View style={styles.benefitsList}>
              {[
                'Connect with students at your university',
                'Discover popular study spots on campus',
                'See real-time activity from classmates',
                'Join campus-exclusive groups',
              ].map((benefit, index) => (
                <View key={index} style={styles.benefitItem}>
                  <IconSymbol name="checkmark.circle.fill" size={16} color={success} />
                  <Text style={[styles.benefitText, { color: muted }]}>{benefit}</Text>
                </View>
              ))}
            </View>
          </PolishedCard>

          {/* Continue Button */}
          <PremiumButton
            onPress={handleSaveCampus}
            variant="primary"
            size="large"
            fullWidth
            disabled={!verificationMethod}
            style={{ marginTop: 8 }}
          >
            {verificationMethod === 'email' ? 'Send Verification Email' : 'Continue'}
          </PremiumButton>
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  selectedCard: {
    padding: 20,
    marginBottom: 32,
  },
  selectedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  campusIconLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  selectedInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  selectedName: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.2,
    flex: 1,
  },
  selectedLocation: {
    fontSize: 15,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 20,
  },
  methodCard: {
    padding: 16,
    marginBottom: 12,
  },
  methodContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  methodIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  methodInfo: {
    flex: 1,
  },
  methodTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
  },
  methodDescription: {
    fontSize: 14,
    lineHeight: 18,
    marginBottom: 8,
  },
  methodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  methodBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  benefitsCard: {
    padding: 20,
    marginTop: 20,
  },
  benefitsTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 16,
  },
  benefitsList: {
    gap: 12,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  benefitText: {
    fontSize: 15,
    lineHeight: 20,
    flex: 1,
  },
});
