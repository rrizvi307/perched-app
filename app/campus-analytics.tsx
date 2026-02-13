/**
 * Campus Analytics Screen
 *
 * Shows campus trends, insights, and activity patterns
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAuth } from '@/contexts/AuthContext';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { getCampusById, getCampusStats, type Campus, type CampusStats } from '@/services/campus';
import { withAlpha } from '@/utils/colors';
import * as Haptics from 'expo-haptics';

interface CampusAnalytics {
  growthRate: number; // Weekly growth percentage
  peakHours: { hour: number; count: number }[];
  topCategories: { category: string; count: number; percentage: number }[];
  weeklyTrend: { day: string; count: number }[];
  userEngagement: {
    avgCheckinsPerUser: number;
    avgSessionTime: number;
    returnRate: number;
  };
}

export default function CampusAnalyticsScreen() {
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
  const [analytics, setAnalytics] = useState<CampusAnalytics | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!user?.campus) return;

    try {
      // Get campus info
      const campusData = getCampusById(user.campus.toLowerCase().replace(/\s+/g, '-'));
      if (!campusData) return;

      setCampus(campusData);

      // Load campus stats
      const statsData = await getCampusStats(campusData.id);
      setStats(statsData);

      // Generate mock analytics (in production, fetch from Firebase)
      const mockAnalytics: CampusAnalytics = {
        growthRate: 12.5,
        peakHours: [
          { hour: 8, count: 45 },
          { hour: 12, count: 78 },
          { hour: 14, count: 92 },
          { hour: 16, count: 65 },
          { hour: 18, count: 43 },
        ],
        topCategories: [
          { category: 'Coffee Shops', count: 245, percentage: 45 },
          { category: 'Libraries', count: 178, percentage: 32 },
          { category: 'Coworking', count: 89, percentage: 16 },
          { category: 'Other', count: 38, percentage: 7 },
        ],
        weeklyTrend: [
          { day: 'Mon', count: 120 },
          { day: 'Tue', count: 135 },
          { day: 'Wed', count: 142 },
          { day: 'Thu', count: 148 },
          { day: 'Fri', count: 125 },
          { day: 'Sat', count: 85 },
          { day: 'Sun', count: 75 },
        ],
        userEngagement: {
          avgCheckinsPerUser: 3.8,
          avgSessionTime: 45, // minutes
          returnRate: 68, // percentage
        },
      };
      setAnalytics(mockAnalytics);
    } catch (error) {
      console.error('Failed to load campus analytics:', error);
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

  if (!user?.campus) {
    return (
      <View style={[styles.container, { backgroundColor: background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: border }]}>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <IconSymbol name="chevron.left" size={24} color={primary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: text }]}>Analytics</Text>
          <View style={styles.backButton} />
        </View>
        <View style={styles.emptyContainer}>
          <IconSymbol name="chart.bar.fill" size={64} color={muted} />
          <Text style={[styles.emptyTitle, { color: text }]}>No Campus Set</Text>
          <Text style={[styles.emptyDescription, { color: muted }]}>
            Add your campus in Profile to view analytics and insights.
          </Text>
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
              <Text style={[styles.headerTitle, { color: text }]}>Analytics</Text>
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
        {/* Key Metrics */}
        {stats && (
          <View style={[styles.metricsCard, { backgroundColor: card, borderColor: border }]}>
            <Text style={[styles.sectionTitle, { color: text }]}>📊 Key Metrics</Text>
            <View style={styles.metricsGrid}>
              <MetricBox
                value={stats.activeUsers}
                label="Active Users"
                change={analytics?.growthRate}
                textColor={text}
                mutedColor={muted}
                primary={primary}
              />
              <MetricBox
                value={stats.totalCheckins}
                label="Check-ins"
                change={8.2}
                textColor={text}
                mutedColor={muted}
                primary={primary}
              />
              <MetricBox
                value={analytics?.userEngagement.avgCheckinsPerUser.toFixed(1)}
                label="Avg Per User"
                textColor={text}
                mutedColor={muted}
                primary={primary}
              />
              <MetricBox
                value={`${analytics?.userEngagement.returnRate}%`}
                label="Return Rate"
                textColor={text}
                mutedColor={muted}
                primary={primary}
              />
            </View>
          </View>
        )}

        {/* Weekly Trend */}
        {analytics && (
          <View style={[styles.trendCard, { backgroundColor: card, borderColor: border }]}>
            <Text style={[styles.sectionTitle, { color: text }]}>📈 Weekly Activity</Text>
            <View style={styles.chartContainer}>
              {analytics.weeklyTrend.map((day, index) => {
                const maxCount = Math.max(...analytics.weeklyTrend.map(d => d.count));
                const heightPercentage = (day.count / maxCount) * 100;

                return (
                  <View key={day.day} style={styles.barContainer}>
                    <View style={styles.barWrapper}>
                      <View
                        style={[
                          styles.bar,
                          {
                            height: `${heightPercentage}%`,
                            backgroundColor: primary,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[styles.barLabel, { color: muted }]}>{day.day}</Text>
                    <Text style={[styles.barValue, { color: text }]}>{day.count}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Peak Hours */}
        {analytics && (
          <View style={[styles.peakHoursCard, { backgroundColor: card, borderColor: border }]}>
            <Text style={[styles.sectionTitle, { color: text }]}>⏰ Peak Hours</Text>
            <Text style={[styles.subtitle, { color: muted }]}>When your campus is most active</Text>
            {analytics.peakHours.map((hour) => {
              const maxCount = Math.max(...analytics.peakHours.map(h => h.count));
              const widthPercentage = (hour.count / maxCount) * 100;

              return (
                <View key={hour.hour} style={styles.hourRow}>
                  <Text style={[styles.hourLabel, { color: text }]}>
                    {hour.hour === 12 ? '12 PM' : hour.hour > 12 ? `${hour.hour - 12} PM` : `${hour.hour} AM`}
                  </Text>
                  <View style={[styles.hourBarContainer, { backgroundColor: withAlpha(border, 0.3) }]}>
                    <View
                      style={[
                        styles.hourBar,
                        {
                          width: `${widthPercentage}%`,
                          backgroundColor: primary,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.hourCount, { color: primary }]}>{hour.count}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Top Categories */}
        {analytics && (
          <View style={[styles.categoriesCard, { backgroundColor: card, borderColor: border }]}>
            <Text style={[styles.sectionTitle, { color: text }]}>🏷️ Popular Spot Types</Text>
            {analytics.topCategories.map((category, index) => (
              <View key={category.category} style={styles.categoryRow}>
                <View style={styles.categoryInfo}>
                  <Text style={[styles.categoryName, { color: text }]}>{category.category}</Text>
                  <View style={[styles.categoryBar, { backgroundColor: withAlpha(border, 0.3) }]}>
                    <View
                      style={[
                        styles.categoryBarFill,
                        {
                          width: `${category.percentage}%`,
                          backgroundColor: primary,
                        },
                      ]}
                    />
                  </View>
                </View>
                <View style={styles.categoryStats}>
                  <Text style={[styles.categoryCount, { color: primary }]}>{category.count}</Text>
                  <Text style={[styles.categoryPercentage, { color: muted }]}>{category.percentage}%</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Top Spots */}
        {stats && stats.topSpots.length > 0 && (
          <View style={[styles.topSpotsCard, { backgroundColor: card, borderColor: border }]}>
            <Text style={[styles.sectionTitle, { color: text }]}>🔥 Trending Spots</Text>
            {stats.topSpots.slice(0, 5).map((spot, index) => (
              <View key={spot.placeId} style={[styles.spotRow, { borderBottomColor: withAlpha(border, 0.5) }]}>
                <Text style={[styles.spotRank, { color: primary }]}>#{index + 1}</Text>
                <View style={styles.spotInfo}>
                  <Text style={[styles.spotName, { color: text }]} numberOfLines={1}>
                    {spot.name}
                  </Text>
                  <View style={[styles.spotBar, { backgroundColor: withAlpha(border, 0.3) }]}>
                    <View
                      style={[
                        styles.spotBarFill,
                        {
                          width: `${(spot.checkinCount / stats.topSpots[0].checkinCount) * 100}%`,
                          backgroundColor: primary,
                        },
                      ]}
                    />
                  </View>
                </View>
                <Text style={[styles.spotCount, { color: primary }]}>{spot.checkinCount}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Insights */}
        <View style={[styles.insightsCard, { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.sectionTitle, { color: text }]}>💡 Insights</Text>

          <InsightItem
            icon="arrow.up.right"
            title="Campus Growing Fast"
            description={`Your campus has grown ${analytics?.growthRate}% this week`}
            textColor={text}
            mutedColor={muted}
            primary={primary}
          />

          <InsightItem
            icon="clock.fill"
            title="Busiest Time"
            description="Most activity happens around 2 PM on weekdays"
            textColor={text}
            mutedColor={muted}
            primary={primary}
          />

          <InsightItem
            icon="heart.fill"
            title="High Engagement"
            description={`${analytics?.userEngagement.returnRate}% of users return within a week`}
            textColor={text}
            mutedColor={muted}
            primary={primary}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function MetricBox({ value, label, change, textColor, mutedColor, primary }: any) {
  return (
    <View style={styles.metricBox}>
      <Text style={[styles.metricValue, { color: primary }]}>{value}</Text>
      {change !== undefined && (
        <View style={styles.metricChange}>
          <IconSymbol name="arrow.up" size={10} color={primary} />
          <Text style={[styles.metricChangeText, { color: primary }]}>+{change}%</Text>
        </View>
      )}
      <Text style={[styles.metricLabel, { color: mutedColor }]}>{label}</Text>
    </View>
  );
}

function InsightItem({ icon, title, description, textColor, mutedColor, primary }: any) {
  return (
    <View style={styles.insightItem}>
      <View style={[styles.insightIcon, { backgroundColor: withAlpha(primary, 0.15) }]}>
        <IconSymbol name={icon} size={18} color={primary} />
      </View>
      <View style={styles.insightText}>
        <Text style={[styles.insightTitle, { color: textColor }]}>{title}</Text>
        <Text style={[styles.insightDescription, { color: mutedColor }]}>{description}</Text>
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
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  campusEmoji: { fontSize: 20 },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20 },
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontSize: 24, fontWeight: '800', marginTop: 16, marginBottom: 8 },
  emptyDescription: { fontSize: 16, textAlign: 'center', lineHeight: 24 },
  metricsCard: { padding: 20, borderRadius: 16, borderWidth: 1, marginBottom: 20 },
  sectionTitle: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  subtitle: { fontSize: 14, marginBottom: 12, marginTop: -8 },
  metricsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricBox: { flex: 1, minWidth: '45%', alignItems: 'center', padding: 16 },
  metricValue: { fontSize: 28, fontWeight: '800', marginBottom: 4 },
  metricChange: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 4 },
  metricChangeText: { fontSize: 11, fontWeight: '700' },
  metricLabel: { fontSize: 12, textAlign: 'center' },
  trendCard: { padding: 20, borderRadius: 16, borderWidth: 1, marginBottom: 20 },
  chartContainer: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 160 },
  barContainer: { flex: 1, alignItems: 'center' },
  barWrapper: { height: 120, width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: 20, borderRadius: 4 },
  barLabel: { fontSize: 11, marginTop: 6, fontWeight: '600' },
  barValue: { fontSize: 10, marginTop: 2 },
  peakHoursCard: { padding: 20, borderRadius: 16, borderWidth: 1, marginBottom: 20 },
  hourRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  hourLabel: { width: 60, fontSize: 13, fontWeight: '600' },
  hourBarContainer: { flex: 1, height: 24, borderRadius: 6, overflow: 'hidden' },
  hourBar: { height: '100%', borderRadius: 6 },
  hourCount: { width: 40, fontSize: 13, fontWeight: '700', textAlign: 'right' },
  categoriesCard: { padding: 20, borderRadius: 16, borderWidth: 1, marginBottom: 20 },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  categoryInfo: { flex: 1 },
  categoryName: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  categoryBar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  categoryBarFill: { height: '100%', borderRadius: 4 },
  categoryStats: { alignItems: 'flex-end' },
  categoryCount: { fontSize: 16, fontWeight: '700' },
  categoryPercentage: { fontSize: 11, marginTop: 2 },
  topSpotsCard: { padding: 20, borderRadius: 16, borderWidth: 1, marginBottom: 20 },
  spotRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1 },
  spotRank: { fontSize: 16, fontWeight: '800', width: 32 },
  spotInfo: { flex: 1 },
  spotName: { fontSize: 14, fontWeight: '600', marginBottom: 6 },
  spotBar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  spotBarFill: { height: '100%', borderRadius: 3 },
  spotCount: { fontSize: 14, fontWeight: '700' },
  insightsCard: { padding: 20, borderRadius: 16, borderWidth: 1, marginBottom: 20 },
  insightItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  insightIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  insightText: { flex: 1 },
  insightTitle: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  insightDescription: { fontSize: 13, lineHeight: 18 },
});
