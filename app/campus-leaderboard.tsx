/**
 * Campus Leaderboard Screen
 *
 * Shows per-campus rankings, challenges, and top spots
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAuth } from '@/contexts/AuthContext';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  getCampusById,
  getCampusLeaderboard,
  getCampusStats,
  getCampusChallenges,
  isCampusAmbassador,
  type Campus,
  type CampusStats,
  type CampusChallenge,
} from '@/services/campus';
import { withAlpha } from '@/utils/colors';
import * as Haptics from 'expo-haptics';

export default function CampusLeaderboardScreen() {
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
  const [stats, setStats] = useState<CampusStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [challenges, setChallenges] = useState<CampusChallenge[]>([]);
  const [period, setPeriod] = useState<'week' | 'month' | 'all'>('month');
  const [isAmbassador, setIsAmbassador] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!user?.campus) return;

    try {
      // Get campus info by name (need to match)
      const campusData = getCampusById(user.campus.toLowerCase().replace(/\s+/g, '-'));
      if (!campusData) return;

      setCampus(campusData);

      // Load all data in parallel
      const [statsData, leaderboardData, challengesData, ambassadorStatus] = await Promise.all([
        getCampusStats(campusData.id),
        getCampusLeaderboard(campusData.id, period, 50),
        getCampusChallenges(campusData.id),
        user?.id ? isCampusAmbassador(user.id, campusData.id) : Promise.resolve(false),
      ]);

      setStats(statsData);
      setLeaderboard(leaderboardData);
      setChallenges(challengesData);
      setIsAmbassador(ambassadorStatus);
    } catch (error) {
      console.error('Failed to load campus data:', error);
    }
  }, [user?.campus, period, user?.id]);

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

  const userRank = leaderboard.findIndex(item => item.userId === user?.id);

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
              <Text style={[styles.headerTitle, { color: text }]}>{campus.shortName}</Text>
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
        {/* Campus Stats */}
        {stats && (
          <View style={[styles.statsCard, { backgroundColor: card, borderColor: border }]}>
            <View style={styles.statsGrid}>
              <StatBox
                value={stats.activeUsers}
                label="Active Users"
                textColor={text}
                mutedColor={muted}
                primary={primary}
              />
              <StatBox
                value={stats.totalCheckins}
                label="Check-ins"
                textColor={text}
                mutedColor={muted}
                primary={primary}
              />
            </View>
          </View>
        )}

        {/* Ambassador Badge */}
        {isAmbassador && (
          <View style={[styles.ambassadorBadge, { backgroundColor: withAlpha(primary, 0.15), borderColor: primary }]}>
            <IconSymbol name="star.fill" size={20} color={primary} />
            <Text style={[styles.ambassadorText, { color: primary }]}>Campus Ambassador</Text>
          </View>
        )}

        {/* Period Selector */}
        <View style={styles.periodSelector}>
          {['week', 'month', 'all'].map((p) => (
            <Pressable
              key={p}
              onPress={() => setPeriod(p as any)}
              style={[
                styles.periodButton,
                {
                  backgroundColor: period === p ? primary : card,
                  borderColor: period === p ? primary : border,
                },
              ]}
            >
              <Text
                style={[
                  styles.periodButtonText,
                  { color: period === p ? '#FFFFFF' : text },
                ]}
              >
                {p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'All Time'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* User's Rank */}
        {userRank >= 0 && (
          <View style={[styles.userRankCard, { backgroundColor: withAlpha(primary, 0.1), borderColor: primary }]}>
            <Text style={[styles.userRankLabel, { color: muted }]}>Your Rank</Text>
            <Text style={[styles.userRankValue, { color: primary }]}>#{userRank + 1}</Text>
          </View>
        )}

        {/* Leaderboard */}
        <View style={[styles.leaderboardCard, { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.sectionTitle, { color: text }]}>🏆 Leaderboard</Text>

          {leaderboard.length > 0 ? (
            <View style={styles.leaderboardList}>
              {leaderboard.map((item, index) => (
                <View
                  key={item.userId}
                  style={[
                    styles.leaderboardItem,
                    {
                      backgroundColor: item.userId === user?.id ? withAlpha(primary, 0.05) : 'transparent',
                      borderBottomColor: withAlpha(border, 0.5),
                    },
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
                    {item.checkinCount}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[styles.emptyText, { color: muted }]}>
              No check-ins yet. Be the first!
            </Text>
          )}
        </View>

        {/* Challenges */}
        {challenges.length > 0 && (
          <View style={[styles.challengesCard, { backgroundColor: card, borderColor: border }]}>
            <Text style={[styles.sectionTitle, { color: text }]}>🎯 Active Challenges</Text>

            {challenges.map((challenge) => (
              <View key={challenge.id} style={[styles.challengeItem, { borderColor: border }]}>
                <View style={styles.challengeHeader}>
                  <Text style={[styles.challengeTitle, { color: text }]}>{challenge.title}</Text>
                  <View style={[styles.challengeBadge, { backgroundColor: withAlpha(primary, 0.15) }]}>
                    <Text style={[styles.challengeBadgeText, { color: primary }]}>
                      {challenge.participants}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.challengeDescription, { color: muted }]}>
                  {challenge.description}
                </Text>
                <Text style={[styles.challengeReward, { color: primary }]}>
                  🎁 {challenge.reward}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Top Spots */}
        {stats && stats.topSpots.length > 0 && (
          <View style={[styles.topSpotsCard, { backgroundColor: card, borderColor: border }]}>
            <Text style={[styles.sectionTitle, { color: text }]}>📍 Top Spots</Text>

            {stats.topSpots.map((spot, index) => (
              <View key={spot.placeId} style={styles.spotItem}>
                <Text style={[styles.spotRank, { color: muted }]}>#{index + 1}</Text>
                <Text style={[styles.spotName, { color: text }]} numberOfLines={1}>
                  {spot.name}
                </Text>
                <Text style={[styles.spotCount, { color: primary }]}>
                  {spot.checkinCount}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
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
  statsCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statBox: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
  },
  ambassadorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 16,
  },
  ambassadorText: {
    fontSize: 14,
    fontWeight: '700',
  },
  periodSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  periodButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  userRankCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 16,
  },
  userRankLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  userRankValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  leaderboardCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  leaderboardList: {
    gap: 4,
  },
  leaderboardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderRadius: 8,
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
    fontSize: 15,
    fontWeight: '500',
    marginLeft: 8,
  },
  leaderboardCount: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  challengesCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
  },
  challengeItem: {
    paddingTop: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    marginTop: 8,
  },
  challengeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  challengeTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  challengeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  challengeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  challengeDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  challengeReward: {
    fontSize: 14,
    fontWeight: '600',
  },
  topSpotsCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  spotItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  spotRank: {
    width: 40,
    fontSize: 14,
    fontWeight: '600',
  },
  spotName: {
    flex: 1,
    fontSize: 15,
  },
  spotCount: {
    fontSize: 15,
    fontWeight: '600',
  },
});
