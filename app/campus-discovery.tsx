/**
 * Campus Discovery Screen
 *
 * Shows top spots, popular places, and trending locations for a campus
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAuth } from '@/contexts/AuthContext';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { PremiumButton } from '@/components/ui/premium-button';
import {
  getCampusById,
  getCampusStats,
  type Campus,
  type CampusStats,
} from '@/services/campus';
import { withAlpha } from '@/utils/colors';
import * as Haptics from 'expo-haptics';

export default function CampusDiscoveryScreen() {
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
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!user?.campus) return;

    try {
      // Get campus info by name
      const campusData = getCampusById(user.campus.toLowerCase().replace(/\s+/g, '-'));
      if (!campusData) return;

      setCampus(campusData);

      // Load campus stats
      const statsData = await getCampusStats(campusData.id);
      setStats(statsData);
    } catch (error) {
      console.error('Failed to load campus discovery data:', error);
    }
  }, [user?.campus]);

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

  const handleSpotPress = (spot: { placeId: string; name: string }) => {
    // Navigate to spot detail or check-in
    router.push(`/checkin?spot=${encodeURIComponent(spot.name)}&placeId=${encodeURIComponent(spot.placeId)}` as any);
  };

  if (!user?.campus) {
    return (
      <View style={[styles.container, { backgroundColor: background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: border }]}>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <IconSymbol name="chevron.left" size={24} color={primary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: text }]}>Campus Discovery</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.emptyContainer}>
          <IconSymbol name="building.2.fill" size={64} color={muted} />
          <Text style={[styles.emptyTitle, { color: text }]}>No Campus Set</Text>
          <Text style={[styles.emptyDescription, { color: muted }]}>
            Add your campus in Profile to discover top spots and connect with your campus community.
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
        {/* Campus Info */}
        {campus && (
          <View style={[styles.campusCard, { backgroundColor: withAlpha(primary, 0.1), borderColor: primary }]}>
            <Text style={styles.campusEmojiLarge}>{campus.emoji}</Text>
            <Text style={[styles.campusName, { color: text }]}>{campus.name}</Text>
            <Text style={[styles.campusLocation, { color: muted }]}>
              {campus.city}, {campus.state}
            </Text>
            {campus.studentCount && (
              <Text style={[styles.campusStudents, { color: muted }]}>
                {campus.studentCount.toLocaleString()} students
              </Text>
            )}
          </View>
        )}

        {/* Campus Stats */}
        {stats && (
          <View style={[styles.statsCard, { backgroundColor: card, borderColor: border }]}>
            <Text style={[styles.sectionTitle, { color: text }]}>📊 Campus Activity</Text>
            <View style={styles.statsGrid}>
              <StatBox
                value={stats.activeUsers}
                label="Active Users"
                subtitle="Last 7 days"
                textColor={text}
                mutedColor={muted}
                primary={primary}
              />
              <StatBox
                value={stats.totalCheckins}
                label="Total Check-ins"
                subtitle="All time"
                textColor={text}
                mutedColor={muted}
                primary={primary}
              />
            </View>
          </View>
        )}

        {/* Top Spots */}
        {stats && stats.topSpots.length > 0 && (
          <View style={[styles.topSpotsCard, { backgroundColor: card, borderColor: border }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: text }]}>📍 Top Spots</Text>
              <Text style={[styles.sectionSubtitle, { color: muted }]}>
                Most popular places on campus
              </Text>
            </View>

            {stats.topSpots.map((spot, index) => (
              <Pressable
                key={spot.placeId}
                onPress={() => handleSpotPress(spot)}
                style={[
                  styles.spotItem,
                  {
                    backgroundColor: index === 0 ? withAlpha(primary, 0.05) : 'transparent',
                    borderBottomColor: withAlpha(border, 0.5),
                  },
                ]}
              >
                <View style={styles.spotRank}>
                  {index < 3 ? (
                    <Text style={styles.spotMedal}>
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉'}
                    </Text>
                  ) : (
                    <Text style={[styles.spotRankNumber, { color: muted }]}>
                      #{index + 1}
                    </Text>
                  )}
                </View>
                <View style={styles.spotInfo}>
                  <Text style={[styles.spotName, { color: text }]} numberOfLines={1}>
                    {spot.name}
                  </Text>
                  <Text style={[styles.spotCheckins, { color: muted }]}>
                    {spot.checkinCount} check-ins
                  </Text>
                </View>
                <IconSymbol name="chevron.right" size={16} color={muted} />
              </Pressable>
            ))}
          </View>
        )}

        {/* Quick Actions */}
        <View style={[styles.actionsCard, { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.sectionTitle, { color: text }]}>Explore More</Text>

          <Pressable
            onPress={() => router.push('/campus-leaderboard' as any)}
            style={[styles.actionButton, { borderColor: border }]}
          >
            <View style={styles.actionIcon}>
              <IconSymbol name="trophy.fill" size={20} color={primary} />
            </View>
            <View style={styles.actionText}>
              <Text style={[styles.actionTitle, { color: text }]}>Campus Leaderboard</Text>
              <Text style={[styles.actionDescription, { color: muted }]}>
                See top users and compete
              </Text>
            </View>
            <IconSymbol name="chevron.right" size={16} color={muted} />
          </Pressable>

          <Pressable
            onPress={() => router.push('/(tabs)/explore' as any)}
            style={[styles.actionButton, { borderColor: border }]}
          >
            <View style={styles.actionIcon}>
              <IconSymbol name="map.fill" size={20} color={primary} />
            </View>
            <View style={styles.actionText}>
              <Text style={[styles.actionTitle, { color: text }]}>Explore Map</Text>
              <Text style={[styles.actionDescription, { color: muted }]}>
                Find spots near you
              </Text>
            </View>
            <IconSymbol name="chevron.right" size={16} color={muted} />
          </Pressable>

          <Pressable
            onPress={() => router.push('/(tabs)/feed' as any)}
            style={[styles.actionButton, { borderColor: border, borderBottomWidth: 0 }]}
          >
            <View style={styles.actionIcon}>
              <IconSymbol name="person.2.fill" size={20} color={primary} />
            </View>
            <View style={styles.actionText}>
              <Text style={[styles.actionTitle, { color: text }]}>Campus Feed</Text>
              <Text style={[styles.actionDescription, { color: muted }]}>
                See what&apos;s happening now
              </Text>
            </View>
            <IconSymbol name="chevron.right" size={16} color={muted} />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function StatBox({
  value,
  label,
  subtitle,
  textColor,
  mutedColor,
  primary,
}: {
  value: string | number;
  label: string;
  subtitle?: string;
  textColor: string;
  mutedColor: string;
  primary: string;
}) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, { color: primary }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: textColor }]}>{label}</Text>
      {subtitle && <Text style={[styles.statSubtitle, { color: mutedColor }]}>{subtitle}</Text>}
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
  campusCard: {
    padding: 32,
    borderRadius: 20,
    borderWidth: 2,
    marginBottom: 20,
    alignItems: 'center',
  },
  campusEmojiLarge: {
    fontSize: 64,
    marginBottom: 12,
  },
  campusName: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },
  campusLocation: {
    fontSize: 16,
    marginBottom: 8,
  },
  campusStudents: {
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
  sectionHeader: {
    marginBottom: 16,
  },
  sectionSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statBox: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  statSubtitle: {
    fontSize: 11,
    marginTop: 2,
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
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderRadius: 8,
  },
  spotRank: {
    width: 40,
    alignItems: 'center',
  },
  spotMedal: {
    fontSize: 24,
  },
  spotRankNumber: {
    fontSize: 16,
    fontWeight: '700',
  },
  spotInfo: {
    flex: 1,
    marginLeft: 12,
  },
  spotName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  spotCheckins: {
    fontSize: 13,
  },
  actionsCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 20,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  actionIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: {
    flex: 1,
    marginLeft: 8,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  actionDescription: {
    fontSize: 13,
  },
});
