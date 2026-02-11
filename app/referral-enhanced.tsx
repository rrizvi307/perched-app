/**
 * Enhanced Referral Screen
 *
 * Double-sided incentives, leaderboard, and social sharing
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAuth } from '@/contexts/AuthContext';
import { PremiumButton } from '@/components/ui/premium-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { ShareCard } from '@/components/ui/share-card';
import { withAlpha } from '@/utils/colors';
import { generateReferralCode } from '@/services/shareInvite';
import { getReferralStats, getReferralLeaderboard, type ReferralStats } from '@/services/referralRewards';
import * as Haptics from 'expo-haptics';

export default function EnhancedReferralScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const card = useThemeColor({}, 'card');
  const border = useThemeColor({}, 'border');

  const [referralCode, setReferralCode] = useState<string>('');
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);

  useEffect(() => {
    loadData();
  }, [user?.id]);

  const loadData = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);

      // Load referral code and stats
      const [code, userStats, leaderboardData] = await Promise.all([
        Promise.resolve(generateReferralCode(user.id, (user as any)?.handle)),
        getReferralStats(user.id),
        getReferralLeaderboard(10),
      ]);

      setReferralCode(code);
      setStats(userStats);
      setLeaderboard(leaderboardData);
    } catch (error) {
      console.error('Failed to load referral data:', error);
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

  const handleShare = () => {
    setShowShareCard(!showShareCard);
  };

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: border }]}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={24} color={primary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: text }]}>Invite Friends</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={primary} />
        }
      >
        {/* Rewards Explainer */}
        <View style={[styles.rewardsCard, { backgroundColor: withAlpha(primary, 0.1), borderColor: primary }]}>
          <Text style={[styles.rewardsTitle, { color: primary }]}>🎁 Double Rewards!</Text>
          <View style={styles.rewardsList}>
            <RewardItem
              icon="gift.fill"
              title="You get 1 week premium"
              description="For each friend who makes 3 check-ins"
              textColor={text}
              mutedColor={muted}
              primary={primary}
            />
            <RewardItem
              icon="sparkles"
              title="They get 3 days free"
              description="Instant premium trial when they sign up"
              textColor={text}
              mutedColor={muted}
              primary={primary}
            />
          </View>
        </View>

        {/* Stats */}
        {stats && (
          <View style={[styles.statsCard, { backgroundColor: card, borderColor: border }]}>
            <Text style={[styles.sectionTitle, { color: text }]}>Your Stats</Text>
            <View style={styles.statsGrid}>
              <StatBox
                value={stats.successfulReferrals}
                label="Successful"
                textColor={text}
                mutedColor={muted}
                primary={primary}
              />
              <StatBox
                value={stats.pendingReferrals}
                label="Pending"
                textColor={text}
                mutedColor={muted}
                primary={primary}
              />
              <StatBox
                value={`${stats.totalPremiumEarned}d`}
                label="Premium Earned"
                textColor={text}
                mutedColor={muted}
                primary={primary}
              />
              <StatBox
                value={stats.currentMonthReferrals}
                label="This Month"
                textColor={text}
                mutedColor={muted}
                primary={primary}
              />
            </View>
          </View>
        )}

        {/* Share Card */}
        {showShareCard && (
          <ShareCard
            type="referral"
            title="Join me on Perched!"
            subtitle="Get 3 days of premium free"
            emoji="☕"
            referralCode={referralCode}
            onShare={() => {
              // Track share event
              console.log('Shared referral');
            }}
          />
        )}

        {/* Share Button */}
        <PremiumButton
          onPress={handleShare}
          variant="primary"
          size="large"
          fullWidth
          icon="square.and.arrow.up"
        >
          Share Your Code
        </PremiumButton>

        {/* Referral Code Display */}
        <View style={[styles.codeCard, { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.codeLabel, { color: muted }]}>Your referral code</Text>
          <Text style={[styles.code, { color: primary }]}>{referralCode}</Text>
          <Text style={[styles.codeHint, { color: muted }]}>
            Share this code with friends or use the button above
          </Text>
        </View>

        {/* Leaderboard */}
        <View style={[styles.leaderboardCard, { backgroundColor: card, borderColor: border }]}>
          <View style={styles.leaderboardHeader}>
            <Text style={[styles.sectionTitle, { color: text }]}>🏆 Top Referrers</Text>
            <Text style={[styles.leaderboardSubtitle, { color: muted }]}>This month</Text>
          </View>

          {leaderboard.length > 0 ? (
            <View style={styles.leaderboardList}>
              {leaderboard.slice(0, 10).map((item, index) => (
                <View
                  key={item.userId}
                  style={[
                    styles.leaderboardItem,
                    { borderBottomColor: withAlpha(border, 0.5) },
                  ]}
                >
                  <View style={styles.leaderboardRank}>
                    {index < 3 ? (
                      <Text style={styles.leaderboardMedal}>
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                      </Text>
                    ) : (
                      <Text style={[styles.leaderboardRankNumber, { color: muted }]}>
                        #{index + 1}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.leaderboardName, { color: text }]} numberOfLines={1}>
                    {item.userName}
                    {item.userId === user?.id && ' (You)'}
                  </Text>
                  <Text style={[styles.leaderboardCount, { color: primary }]}>
                    {item.successfulReferrals}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.emptyText, { color: muted }]}>
              No referrals yet this month. Be the first!
            </Text>
          )}
        </View>

        {/* How It Works */}
        <View style={[styles.howItWorksCard, { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.sectionTitle, { color: text }]}>How It Works</Text>
          <View style={styles.stepsList}>
            <Step
              number={1}
              title="Share your code"
              description="Send your referral code to friends via text, social media, or the share button"
              textColor={text}
              mutedColor={muted}
              primary={primary}
            />
            <Step
              number={2}
              title="They sign up"
              description="Your friend creates an account and gets 3 days of premium free"
              textColor={text}
              mutedColor={muted}
              primary={primary}
            />
            <Step
              number={3}
              title="You both win!"
              description="After they make 3 check-ins, you get 1 week of premium"
              textColor={text}
              mutedColor={muted}
              primary={primary}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function RewardItem({
  icon,
  title,
  description,
  textColor,
  mutedColor,
  primary,
}: {
  icon: string;
  title: string;
  description: string;
  textColor: string;
  mutedColor: string;
  primary: string;
}) {
  return (
    <View style={styles.rewardItem}>
      <IconSymbol name={icon as any} size={20} color={primary} />
      <View style={styles.rewardItemText}>
        <Text style={[styles.rewardItemTitle, { color: textColor }]}>{title}</Text>
        <Text style={[styles.rewardItemDescription, { color: mutedColor }]}>
          {description}
        </Text>
      </View>
    </View>
  );
}

function StatBox({
  value,
  label,
  textColor,
  mutedColor,
  primary,
}: {
  value: string | number;
  label: string;
  textColor: string;
  mutedColor: string;
  primary: string;
}) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, { color: primary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: mutedColor }]}>{label}</Text>
    </View>
  );
}

function Step({
  number,
  title,
  description,
  textColor,
  mutedColor,
  primary,
}: {
  number: number;
  title: string;
  description: string;
  textColor: string;
  mutedColor: string;
  primary: string;
}) {
  return (
    <View style={styles.step}>
      <View style={[styles.stepNumber, { backgroundColor: withAlpha(primary, 0.15) }]}>
        <Text style={[styles.stepNumberText, { color: primary }]}>{number}</Text>
      </View>
      <View style={styles.stepText}>
        <Text style={[styles.stepTitle, { color: textColor }]}>{title}</Text>
        <Text style={[styles.stepDescription, { color: mutedColor }]}>{description}</Text>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
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
  rewardsCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    marginBottom: 20,
  },
  rewardsTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 16,
    textAlign: 'center',
  },
  rewardsList: {
    gap: 12,
  },
  rewardItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  rewardItemText: {
    flex: 1,
  },
  rewardItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  rewardItemDescription: {
    fontSize: 14,
  },
  statsCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statBox: {
    flex: 1,
    minWidth: '45%',
    alignItems: 'center',
    padding: 16,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    textAlign: 'center',
  },
  codeCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 20,
    marginBottom: 20,
    alignItems: 'center',
  },
  codeLabel: {
    fontSize: 14,
    marginBottom: 8,
  },
  code: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 3,
    marginBottom: 8,
  },
  codeHint: {
    fontSize: 12,
    textAlign: 'center',
  },
  leaderboardCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  leaderboardHeader: {
    marginBottom: 16,
  },
  leaderboardSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  leaderboardList: {
    gap: 4,
  },
  leaderboardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  leaderboardRank: {
    width: 40,
    alignItems: 'center',
  },
  leaderboardMedal: {
    fontSize: 20,
  },
  leaderboardRankNumber: {
    fontSize: 14,
    fontWeight: '600',
  },
  leaderboardName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8,
  },
  leaderboardCount: {
    fontSize: 18,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  howItWorksCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  stepsList: {
    gap: 20,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    fontSize: 16,
    fontWeight: '800',
  },
  stepText: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  stepDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
});
