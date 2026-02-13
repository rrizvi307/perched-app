/**
 * Campus Challenges Screen
 *
 * Shows active campus challenges, user progress, and rewards
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAuth } from '@/contexts/AuthContext';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { PremiumButton } from '@/components/ui/premium-button';
import { getCampusById, type Campus, type CampusChallenge } from '@/services/campus';
import {
  getUserChallengeProgress,
  getChallengeRewards,
  type ChallengeProgress,
  type ChallengeReward,
} from '@/services/campusChallenges';
import { withAlpha } from '@/utils/colors';
import * as Haptics from 'expo-haptics';

export default function CampusChallengesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const card = useThemeColor({}, 'card');
  const border = useThemeColor({}, 'border');

  const [campus, setCampus] = useState<Campus | null>(null);
  const [challenges, setChallenges] = useState<{ challenge: CampusChallenge; progress: ChallengeProgress | null }[]>([]);
  const [rewards, setRewards] = useState<ChallengeReward[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!user?.id || !user?.campus) return;

    try {
      // Get campus info
      const campusData = getCampusById(user.campus.toLowerCase().replace(/\s+/g, '-'));
      if (!campusData) return;

      setCampus(campusData);

      // Load challenges and progress
      const challengesData = await getUserChallengeProgress(user.id, campusData.id);
      setChallenges(challengesData);

      // Load rewards
      const rewardsData = await getChallengeRewards(user.id);
      setRewards(rewardsData);
    } catch (error) {
      console.error('Failed to load campus challenges:', error);
    }
  }, [user?.id, user?.campus]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

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

  const getChallengeIcon = (type: CampusChallenge['type']) => {
    switch (type) {
      case 'visit_spots':
        return 'map.fill';
      case 'check_ins':
        return 'checkmark.circle.fill';
      case 'streak':
        return 'flame.fill';
      case 'social':
        return 'person.2.fill';
      default:
        return 'star.fill';
    }
  };

  const formatTimeRemaining = (endDate: number) => {
    const now = Date.now();
    const remaining = endDate - now;

    if (remaining < 0) return 'Ended';

    const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 0) return `${days}d ${hours}h left`;
    if (hours > 0) return `${hours}h left`;
    return 'Ending soon';
  };

  const getProgressPercentage = (progress: ChallengeProgress | null, target: number) => {
    if (!progress) return 0;
    return Math.min((progress.progress / target) * 100, 100);
  };

  if (!user?.campus) {
    return (
      <View style={[styles.container, { backgroundColor: background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: border }]}>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <IconSymbol name="chevron.left" size={24} color={primary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: text }]}>Campus Challenges</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.emptyContainer}>
          <IconSymbol name="target" size={64} color={muted} />
          <Text style={[styles.emptyTitle, { color: text }]}>No Campus Set</Text>
          <Text style={[styles.emptyDescription, { color: muted }]}>
            Add your campus in Profile to participate in campus challenges and win rewards.
          </Text>
          <PremiumButton
            onPress={() => router.push('/(tabs)/profile' as any)}
            variant="primary"
            size="medium"
            icon="person.fill"
            style={{ marginTop: 20 }}
          >
            Go to Profile
          </PremiumButton>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: border }]}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={24} color={primary} />
        </Pressable>
        <View style={styles.headerCenter}>
          {campus && (
            <>
              <Text style={styles.campusEmoji}>{campus.emoji}</Text>
              <Text style={[styles.headerTitle, { color: text }]}>Challenges</Text>
            </>
          )}
        </View>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={primary} />
        }
      >
        {/* Rewards Summary */}
        {rewards.length > 0 && (
          <View style={[styles.rewardsCard, { backgroundColor: withAlpha(primary, 0.1), borderColor: primary }]}>
            <View style={styles.rewardsHeader}>
              <IconSymbol name="gift.fill" size={20} color={primary} />
              <Text style={[styles.rewardsTitle, { color: primary }]}>Rewards Earned</Text>
            </View>
            <View style={styles.rewardsGrid}>
              {rewards.filter(r => r.type === 'premium').length > 0 && (
                <View style={styles.rewardItem}>
                  <Text style={[styles.rewardValue, { color: primary }]}>
                    {rewards.filter(r => r.type === 'premium').reduce((sum, r) => sum + (typeof r.value === 'number' ? r.value : 0), 0)}d
                  </Text>
                  <Text style={[styles.rewardLabel, { color: text }]}>Premium</Text>
                </View>
              )}
              {rewards.filter(r => r.type === 'xp').length > 0 && (
                <View style={styles.rewardItem}>
                  <Text style={[styles.rewardValue, { color: primary }]}>
                    {rewards.filter(r => r.type === 'xp').reduce((sum, r) => sum + (typeof r.value === 'number' ? r.value : 0), 0)}
                  </Text>
                  <Text style={[styles.rewardLabel, { color: text }]}>XP</Text>
                </View>
              )}
              {rewards.filter(r => r.type === 'badge').length > 0 && (
                <View style={styles.rewardItem}>
                  <Text style={[styles.rewardValue, { color: primary }]}>
                    {rewards.filter(r => r.type === 'badge').length}
                  </Text>
                  <Text style={[styles.rewardLabel, { color: text }]}>Badges</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Active Challenges */}
        <View style={[styles.challengesCard, { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.sectionTitle, { color: text }]}>🎯 Active Challenges</Text>

          {challenges.length > 0 ? (
            challenges.map(({ challenge, progress }) => {
              const percentage = getProgressPercentage(progress, challenge.target);
              const isCompleted = progress?.completed || false;

              return (
                <View
                  key={challenge.id}
                  style={[
                    styles.challengeItem,
                    {
                      backgroundColor: isCompleted ? withAlpha(primary, 0.05) : 'transparent',
                      borderColor: border,
                    },
                  ]}
                >
                  <View style={styles.challengeHeader}>
                    <View style={styles.challengeTitleRow}>
                      <View style={[styles.challengeIcon, { backgroundColor: withAlpha(primary, 0.15) }]}>
                        <IconSymbol name={getChallengeIcon(challenge.type) as any} size={18} color={primary} />
                      </View>
                      <View style={styles.challengeTitleText}>
                        <Text style={[styles.challengeTitle, { color: text }]}>{challenge.title}</Text>
                        <Text style={[styles.challengeTime, { color: muted }]}>
                          {formatTimeRemaining(challenge.endDate)}
                        </Text>
                      </View>
                      {isCompleted && (
                        <View style={[styles.completedBadge, { backgroundColor: withAlpha(primary, 0.15) }]}>
                          <IconSymbol name="checkmark" size={14} color={primary} />
                        </View>
                      )}
                    </View>
                  </View>

                  <Text style={[styles.challengeDescription, { color: muted }]}>
                    {challenge.description}
                  </Text>

                  {/* Progress Bar */}
                  <View style={styles.progressSection}>
                    <View style={[styles.progressBar, { backgroundColor: withAlpha(border, 0.3) }]}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${percentage}%`, backgroundColor: primary },
                        ]}
                      />
                    </View>
                    <Text style={[styles.progressText, { color: muted }]}>
                      {progress?.progress || 0} / {challenge.target}
                    </Text>
                  </View>

                  {/* Reward */}
                  <View style={styles.rewardRow}>
                    <IconSymbol name="gift.fill" size={14} color={primary} />
                    <Text style={[styles.rewardText, { color: primary }]}>
                      {challenge.reward}
                    </Text>
                  </View>

                  {/* Participants */}
                  <Text style={[styles.participantsText, { color: muted }]}>
                    {challenge.participants} participating
                  </Text>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyChallenges}>
              <IconSymbol name="target" size={48} color={muted} />
              <Text style={[styles.emptyText, { color: muted }]}>
                No active challenges right now.
              </Text>
              <Text style={[styles.emptySubtext, { color: muted }]}>
                Check back soon for new challenges!
              </Text>
            </View>
          )}
        </View>

        {/* Info Card */}
        <View style={[styles.infoCard, { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.sectionTitle, { color: text }]}>How Challenges Work</Text>
          <View style={styles.infoList}>
            <View style={styles.infoItem}>
              <IconSymbol name="1.circle.fill" size={20} color={primary} />
              <Text style={[styles.infoText, { color: text }]}>
                Complete activities to make progress
              </Text>
            </View>
            <View style={styles.infoItem}>
              <IconSymbol name="2.circle.fill" size={20} color={primary} />
              <Text style={[styles.infoText, { color: text }]}>
                Reach the target before time runs out
              </Text>
            </View>
            <View style={styles.infoItem}>
              <IconSymbol name="3.circle.fill" size={20} color={primary} />
              <Text style={[styles.infoText, { color: text }]}>
                Earn premium time, XP, and badges
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
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
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  campusEmoji: {
    fontSize: 20,
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
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '800',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  rewardsCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    marginBottom: 20,
  },
  rewardsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  rewardsTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  rewardsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  rewardItem: {
    alignItems: 'center',
  },
  rewardValue: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
  },
  rewardLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  challengesCard: {
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
  challengeItem: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  challengeHeader: {
    marginBottom: 12,
  },
  challengeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  challengeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeTitleText: {
    flex: 1,
  },
  challengeTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  challengeTime: {
    fontSize: 12,
  },
  completedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  progressSection: {
    marginBottom: 12,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
  },
  rewardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  rewardText: {
    fontSize: 14,
    fontWeight: '600',
  },
  participantsText: {
    fontSize: 12,
  },
  emptyChallenges: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
  },
  infoCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  infoList: {
    gap: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
});
