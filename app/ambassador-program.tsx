/**
 * Campus Ambassador Program Screen
 *
 * Shows program benefits, requirements, and application
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAuth } from '@/contexts/AuthContext';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { PremiumButton } from '@/components/ui/premium-button';
import { CampusAmbassadorBadge } from '@/components/ui/campus-ambassador-badge';
import { getCampusById } from '@/services/campus';
import {
  checkAmbassadorEligibility,
  submitAmbassadorApplication,
  getAmbassadorApplication,
  getAmbassadorProfile,
  getCampusAmbassadors,
  type AmbassadorApplication,
  type AmbassadorProfile,
} from '@/services/ambassadorProgram';
import { withAlpha } from '@/utils/colors';
import * as Haptics from 'expo-haptics';
import { useToast } from '@/contexts/ToastContext';

export default function AmbassadorProgramScreen() {
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

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [eligible, setEligible] = useState(false);
  const [requirements, setRequirements] = useState<any>(null);
  const [application, setApplication] = useState<AmbassadorApplication | null>(null);
  const [profile, setProfile] = useState<AmbassadorProfile | null>(null);
  const [topAmbassadors, setTopAmbassadors] = useState<any[]>([]);
  const [motivationStatement, setMotivationStatement] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, [user?.id, user?.campus]);

  const loadData = async () => {
    if (!user?.id || !user?.campus) return;

    try {
      setLoading(true);

      const campus = getCampusById(user.campus.toLowerCase().replace(/\s+/g, '-'));
      if (!campus) return;

      // Check eligibility
      const eligibilityResult = await checkAmbassadorEligibility(user.id);
      setEligible(eligibilityResult.eligible);
      setRequirements(eligibilityResult.requirements);

      // Get application status
      const app = await getAmbassadorApplication(user.id, campus.id);
      setApplication(app);

      // If approved, get profile
      if (app?.status === 'approved') {
        const prof = await getAmbassadorProfile(user.id, campus.id);
        setProfile(prof);
      }

      // Get top ambassadors
      const ambassadors = await getCampusAmbassadors(campus.id, 5);
      setTopAmbassadors(ambassadors);
    } catch (error) {
      console.error('Failed to load ambassador data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleBack = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    router.back();
  };

  const handleSubmitApplication = async () => {
    if (!user?.id || !user?.campus) return;

    if (motivationStatement.trim().length < 50) {
      showToast('Please write at least 50 characters explaining why you want to be an ambassador', 'warning');
      return;
    }

    try {
      setSubmitting(true);

      const campus = getCampusById(user.campus.toLowerCase().replace(/\s+/g, '-'));
      if (!campus) return;

      const result = await submitAmbassadorApplication(
        user.id,
        campus.id,
        motivationStatement.trim()
      );

      if (result.success) {
        showToast('Application submitted! We\'ll review it soon.', 'success');
        await loadData();
        setMotivationStatement('');
      } else {
        showToast(result.error || 'Failed to submit application', 'error');
      }
    } catch (error) {
      showToast('Failed to submit application', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // If user is already an ambassador
  if (profile) {
    return (
      <View style={[styles.container, { backgroundColor: background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: border }]}>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <IconSymbol name="chevron.left" size={24} color={primary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: text }]}>Ambassador</Text>
          <View style={styles.backButton} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={primary} />
          }
        >
          {/* Ambassador Badge */}
          <CampusAmbassadorBadge variant="full" rank={profile.rank || undefined} campusName={profile.campusName} />

          {/* Stats */}
          <View style={[styles.statsCard, { backgroundColor: card, borderColor: border }]}>
            <Text style={[styles.sectionTitle, { color: text }]}>Your Impact</Text>
            <View style={styles.statsGrid}>
              <StatBox value={profile.stats.referrals} label="Referrals" textColor={text} mutedColor={muted} primary={primary} />
              <StatBox value={profile.stats.events} label="Events" textColor={text} mutedColor={muted} primary={primary} />
              <StatBox value={profile.stats.impact} label="Impact Score" textColor={text} mutedColor={muted} primary={primary} />
            </View>
          </View>

          {/* Perks */}
          <View style={[styles.perksCard, { backgroundColor: card, borderColor: border }]}>
            <Text style={[styles.sectionTitle, { color: text }]}>Your Perks</Text>
            <PerkItem icon="star.fill" title="Premium Access" description="Lifetime premium features" active={profile.perks.premiumAccess} textColor={text} mutedColor={muted} primary={primary} />
            <PerkItem icon="sparkles" title="Early Access" description="Try new features first" active={profile.perks.earlyFeatures} textColor={text} mutedColor={muted} primary={primary} />
            <PerkItem icon="headphones" title="Direct Support" description="Priority help from our team" active={profile.perks.directSupport} textColor={text} mutedColor={muted} primary={primary} />
            <PerkItem icon="badge" title="Exclusive Badge" description="Stand out in the community" active={profile.perks.exclusiveBadge} textColor={text} mutedColor={muted} primary={primary} />
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: border }]}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={24} color={primary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: text }]}>Ambassador Program</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={primary} />
        }
      >
        {/* Hero */}
        <View style={[styles.heroCard, { backgroundColor: withAlpha(primary, 0.1), borderColor: primary }]}>
          <Text style={styles.heroEmoji}>⭐</Text>
          <Text style={[styles.heroTitle, { color: text }]}>Become a Campus Ambassador</Text>
          <Text style={[styles.heroSubtitle, { color: muted }]}>
            Lead your campus community and get exclusive perks
          </Text>
        </View>

        {/* Application Status */}
        {application && (
          <View style={[styles.statusCard, { backgroundColor: card, borderColor: border }]}>
            <View style={styles.statusHeader}>
              <IconSymbol
                name={application.status === 'approved' ? 'checkmark.circle.fill' : application.status === 'pending' ? 'clock.fill' : 'xmark.circle.fill'}
                size={24}
                color={application.status === 'approved' ? primary : muted}
              />
              <Text style={[styles.statusTitle, { color: text }]}>
                Application {application.status.charAt(0).toUpperCase() + application.status.slice(1)}
              </Text>
            </View>
            <Text style={[styles.statusDescription, { color: muted }]}>
              {application.status === 'pending' ? 'We\'re reviewing your application. This usually takes 1-3 days.' : application.status === 'approved' ? 'Congratulations! You\'re now a Campus Ambassador.' : 'Your application was not approved this time. You can reapply after improving your stats.'}
            </Text>
          </View>
        )}

        {/* Requirements */}
        {!application && requirements && (
          <View style={[styles.requirementsCard, { backgroundColor: card, borderColor: border }]}>
            <Text style={[styles.sectionTitle, { color: text }]}>Requirements</Text>
            <RequirementItem
              icon="person.2.fill"
              title="Successful Referrals"
              current={requirements.currentReferrals}
              target={requirements.minReferrals}
              met={requirements.currentReferrals >= requirements.minReferrals}
              textColor={text}
              mutedColor={muted}
              primary={primary}
            />
            <RequirementItem
              icon="checkmark.circle.fill"
              title="Total Check-ins"
              current={requirements.currentCheckins}
              target={requirements.minCheckins}
              met={requirements.currentCheckins >= requirements.minCheckins}
              textColor={text}
              mutedColor={muted}
              primary={primary}
            />
            <RequirementItem
              icon="flame.fill"
              title="Current Streak"
              current={requirements.currentStreak}
              target={requirements.minStreak}
              met={requirements.currentStreak >= requirements.minStreak}
              textColor={text}
              mutedColor={muted}
              primary={primary}
            />
          </View>
        )}

        {/* Application Form */}
        {eligible && !application && (
          <View style={[styles.applicationCard, { backgroundColor: card, borderColor: border }]}>
            <Text style={[styles.sectionTitle, { color: text }]}>Apply Now</Text>
            <Text style={[styles.inputLabel, { color: text }]}>Why do you want to be an ambassador?</Text>
            <TextInput
              value={motivationStatement}
              onChangeText={setMotivationStatement}
              placeholder="Tell us why you'd be a great campus ambassador..."
              placeholderTextColor={muted}
              multiline
              numberOfLines={6}
              style={[styles.textInput, { backgroundColor: background, borderColor: border, color: text }]}
            />
            <Text style={[styles.characterCount, { color: muted }]}>
              {motivationStatement.length} / 50 minimum
            </Text>
            <PremiumButton
              onPress={handleSubmitApplication}
              variant="primary"
              size="large"
              fullWidth
              disabled={submitting || motivationStatement.trim().length < 50}
              icon="paperplane.fill"
            >
              {submitting ? 'Submitting...' : 'Submit Application'}
            </PremiumButton>
          </View>
        )}

        {/* Benefits */}
        <View style={[styles.benefitsCard, { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.sectionTitle, { color: text }]}>Ambassador Benefits</Text>
          <BenefitItem icon="star.fill" title="Lifetime Premium" description="Free premium access forever" textColor={text} mutedColor={muted} primary={primary} />
          <BenefitItem icon="sparkles" title="Early Features" description="Test new features before anyone else" textColor={text} mutedColor={muted} primary={primary} />
          <BenefitItem icon="gift.fill" title="Exclusive Swag" description="Ambassador merch and goodies" textColor={text} mutedColor={muted} primary={primary} />
          <BenefitItem icon="person.badge.plus.fill" title="Leadership Role" description="Shape your campus community" textColor={text} mutedColor={muted} primary={primary} />
          <BenefitItem icon="trophy.fill" title="Recognition" description="Special badge and profile highlight" textColor={text} mutedColor={muted} primary={primary} />
        </View>

        {/* Top Ambassadors */}
        {topAmbassadors.length > 0 && (
          <View style={[styles.topCard, { backgroundColor: card, borderColor: border }]}>
            <Text style={[styles.sectionTitle, { color: text }]}>Top Ambassadors</Text>
            {topAmbassadors.map((amb) => (
              <View key={amb.userId} style={[styles.ambassadorItem, { borderBottomColor: withAlpha(border, 0.5) }]}>
                <Text style={[styles.ambassadorRank, { color: primary }]}>#{amb.rank}</Text>
                <View style={styles.ambassadorInfo}>
                  <Text style={[styles.ambassadorName, { color: text }]}>{amb.name}</Text>
                  <Text style={[styles.ambassadorStats, { color: muted }]}>
                    {amb.stats.referrals} referrals · {amb.stats.impact} impact
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function StatBox({ value, label, textColor, mutedColor, primary }: any) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, { color: primary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: mutedColor }]}>{label}</Text>
    </View>
  );
}

function PerkItem({ icon, title, description, active, textColor, mutedColor, primary }: any) {
  return (
    <View style={styles.perkItem}>
      <IconSymbol name={icon} size={20} color={active ? primary : mutedColor} />
      <View style={styles.perkText}>
        <Text style={[styles.perkTitle, { color: textColor }]}>{title}</Text>
        <Text style={[styles.perkDescription, { color: mutedColor }]}>{description}</Text>
      </View>
      {active && <IconSymbol name="checkmark.circle.fill" size={16} color={primary} />}
    </View>
  );
}

function RequirementItem({ icon, title, current, target, met, textColor, mutedColor, primary }: any) {
  return (
    <View style={styles.requirementItem}>
      <IconSymbol name={icon} size={20} color={met ? primary : mutedColor} />
      <View style={styles.requirementText}>
        <Text style={[styles.requirementTitle, { color: textColor }]}>{title}</Text>
        <Text style={[styles.requirementProgress, { color: met ? primary : mutedColor }]}>
          {current} / {target}
        </Text>
      </View>
      <IconSymbol name={met ? 'checkmark.circle.fill' : 'circle'} size={20} color={met ? primary : mutedColor} />
    </View>
  );
}

function BenefitItem({ icon, title, description, textColor, mutedColor, primary }: any) {
  return (
    <View style={styles.benefitItem}>
      <View style={[styles.benefitIcon, { backgroundColor: withAlpha(primary, 0.15) }]}>
        <IconSymbol name={icon} size={18} color={primary} />
      </View>
      <View style={styles.benefitText}>
        <Text style={[styles.benefitTitle, { color: textColor }]}>{title}</Text>
        <Text style={[styles.benefitDescription, { color: mutedColor }]}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20 },
  heroCard: { padding: 32, borderRadius: 20, borderWidth: 2, marginBottom: 20, alignItems: 'center' },
  heroEmoji: { fontSize: 64, marginBottom: 12 },
  heroTitle: { fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  heroSubtitle: { fontSize: 16, textAlign: 'center', lineHeight: 22 },
  statusCard: { padding: 20, borderRadius: 16, borderWidth: 1, marginBottom: 20 },
  statusHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  statusTitle: { fontSize: 18, fontWeight: '700' },
  statusDescription: { fontSize: 14, lineHeight: 20 },
  requirementsCard: { padding: 20, borderRadius: 16, borderWidth: 1, marginBottom: 20 },
  sectionTitle: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  requirementItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'transparent' },
  requirementText: { flex: 1 },
  requirementTitle: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  requirementProgress: { fontSize: 13, fontWeight: '600' },
  applicationCard: { padding: 20, borderRadius: 16, borderWidth: 1, marginBottom: 20 },
  inputLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  textInput: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, textAlignVertical: 'top', marginBottom: 8 },
  characterCount: { fontSize: 12, marginBottom: 16, textAlign: 'right' },
  statsCard: { padding: 20, borderRadius: 16, borderWidth: 1, marginBottom: 20 },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-around' },
  statBox: { alignItems: 'center' },
  statValue: { fontSize: 28, fontWeight: '800', marginBottom: 4 },
  statLabel: { fontSize: 12 },
  perksCard: { padding: 20, borderRadius: 16, borderWidth: 1, marginBottom: 20 },
  perkItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  perkText: { flex: 1 },
  perkTitle: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  perkDescription: { fontSize: 13 },
  benefitsCard: { padding: 20, borderRadius: 16, borderWidth: 1, marginBottom: 20 },
  benefitItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  benefitIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  benefitText: { flex: 1 },
  benefitTitle: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  benefitDescription: { fontSize: 13 },
  topCard: { padding: 20, borderRadius: 16, borderWidth: 1, marginBottom: 20 },
  ambassadorItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  ambassadorRank: { fontSize: 18, fontWeight: '800', width: 40 },
  ambassadorInfo: { flex: 1 },
  ambassadorName: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  ambassadorStats: { fontSize: 12 },
});
