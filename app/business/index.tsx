/**
 * Business Dashboard - Overview
 *
 * Main dashboard for coffee shop owners and coworking spaces
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAuth } from '@/contexts/AuthContext';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  getBusinessSpots,
  getBusinessAnalytics,
  type BusinessSpot,
  type BusinessAnalytics,
} from '@/services/businessAnalytics';
import { getSpotPromotions, type Promotion } from '@/services/promotions';
import { withAlpha } from '@/utils/colors';
import * as Haptics from 'expo-haptics';

export default function BusinessDashboard() {
  const router = useRouter();
  const { user } = useAuth();

  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const card = useThemeColor({}, 'card');
  const border = useThemeColor({}, 'border');
  const success = '#10b981';
  const warning = '#f59e0b';
  const danger = '#ef4444';

  const [businessSpots, setBusinessSpots] = useState<BusinessSpot[]>([]);
  const [selectedSpot, setSelectedSpot] = useState<BusinessSpot | null>(null);
  const [analytics, setAnalytics] = useState<BusinessAnalytics | null>(null);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter'>('month');

  const loadData = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const spots = await getBusinessSpots(user.id);
      setBusinessSpots(spots);

      if (spots.length > 0 && !selectedSpot) {
        setSelectedSpot(spots[0]);
      }
    } catch (error) {
      console.error('Failed to load business data:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id, selectedSpot]);

  const loadSpotData = useCallback(async () => {
    if (!selectedSpot) return;

    try {
      const [analyticsData, promotionsData] = await Promise.all([
        getBusinessAnalytics(selectedSpot.id, period),
        getSpotPromotions(selectedSpot.id, true),
      ]);

      setAnalytics(analyticsData);
      setPromotions(promotionsData);
    } catch (error) {
      console.error('Failed to load spot data:', error);
    }
  }, [selectedSpot, period]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (selectedSpot) {
      void loadSpotData();
    }
  }, [selectedSpot, loadSpotData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    await loadSpotData();
    setRefreshing(false);
  };

  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: background }]}>
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: text }]}>Please sign in to access Business Dashboard</Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={primary} size="large" />
          <Text style={[styles.loadingText, { color: muted }]}>Loading dashboard...</Text>
        </View>
      </View>
    );
  }

  if (businessSpots.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: background }]}>
        <View style={styles.emptyContainer}>
          <IconSymbol name="building.2.fill" size={64} color={muted} />
          <Text style={[styles.emptyTitle, { color: text }]}>No Business Spots</Text>
          <Text style={[styles.emptySubtitle, { color: muted }]}>
            Claim your coffee shop or coworking space to get started
          </Text>
          <Pressable
            onPress={() => router.push('/business/claim' as any)}
            style={[styles.claimButton, { backgroundColor: primary }]}
          >
            <Text style={styles.claimButtonText}>Claim Your Spot</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const activePromotions = promotions.filter(p => p.status === 'active').length;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: background }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} />}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: card, borderBottomColor: border }]}>
        <View>
          <Text style={[styles.headerTitle, { color: text }]}>Business Dashboard</Text>
          <Text style={[styles.headerSubtitle, { color: muted }]}>{selectedSpot?.name}</Text>
        </View>
        <Pressable
          onPress={() => router.push('/business/settings' as any)}
          style={[styles.settingsButton, { backgroundColor: withAlpha(primary, 0.1) }]}
        >
          <IconSymbol name="gear" size={20} color={primary} />
        </Pressable>
      </View>

      {/* Spot Selector */}
      {businessSpots.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.spotSelector}>
          {businessSpots.map(spot => (
            <Pressable
              key={spot.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedSpot(spot);
              }}
              style={[
                styles.spotChip,
                {
                  backgroundColor: selectedSpot?.id === spot.id ? primary : card,
                  borderColor: border,
                },
              ]}
            >
              <Text
                style={[
                  styles.spotChipText,
                  { color: selectedSpot?.id === spot.id ? '#FFFFFF' : text },
                ]}
              >
                {spot.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* Period Selector */}
      <View style={styles.periodSelector}>
        {(['week', 'month', 'quarter'] as const).map(p => (
          <Pressable
            key={p}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setPeriod(p);
            }}
            style={[
              styles.periodButton,
              {
                backgroundColor: period === p ? primary : card,
                borderColor: border,
              },
            ]}
          >
            <Text style={[styles.periodButtonText, { color: period === p ? '#FFFFFF' : text }]}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Key Metrics */}
      {analytics && (
        <>
          <View style={styles.metricsGrid}>
            <MetricCard
              icon="chart.bar.fill"
              label="Total Check-ins"
              value={analytics.totalCheckins.toString()}
              trend={analytics.trend}
              trendPercent={analytics.trendPercent}
              iconColor={primary}
              backgroundColor={card}
              textColor={text}
              mutedColor={muted}
              borderColor={border}
              successColor={success}
              dangerColor={danger}
            />
            <MetricCard
              icon="person.2.fill"
              label="Unique Visitors"
              value={analytics.uniqueVisitors.toString()}
              iconColor={primary}
              backgroundColor={card}
              textColor={text}
              mutedColor={muted}
              borderColor={border}
            />
            <MetricCard
              icon="arrow.triangle.2.circlepath"
              label="Repeat Visitors"
              value={analytics.repeatVisitors.toString()}
              subtitle={`${Math.round((analytics.repeatVisitors / Math.max(1, analytics.uniqueVisitors)) * 100)}% rate`}
              iconColor={primary}
              backgroundColor={card}
              textColor={text}
              mutedColor={muted}
              borderColor={border}
            />
            <MetricCard
              icon="calendar"
              label="Avg Per Day"
              value={analytics.avgCheckinsPerDay.toFixed(1)}
              iconColor={primary}
              backgroundColor={card}
              textColor={text}
              mutedColor={muted}
              borderColor={border}
            />
          </View>

          {/* Ratings Overview */}
          <View style={[styles.section, { backgroundColor: card, borderColor: border }]}>
            <Text style={[styles.sectionTitle, { color: text }]}>Average Ratings</Text>
            <View style={styles.ratingsGrid}>
              <RatingBar
                label="WiFi"
                icon="wifi"
                value={analytics.ratings.avgWifi}
                textColor={text}
                mutedColor={muted}
                primary={primary}
              />
              <RatingBar
                label="Noise"
                icon="speaker.wave.2.fill"
                value={analytics.ratings.avgNoise}
                textColor={text}
                mutedColor={muted}
                primary={primary}
              />
              <RatingBar
                label="Busyness"
                icon="person.2.fill"
                value={analytics.ratings.avgBusyness}
                textColor={text}
                mutedColor={muted}
                primary={primary}
              />
              <RatingBar
                label="Outlets"
                icon="bolt.fill"
                value={analytics.ratings.avgOutlets}
                textColor={text}
                mutedColor={muted}
                primary={primary}
              />
            </View>
            <Text style={[styles.ratingCount, { color: muted }]}>
              Based on {analytics.ratings.ratingCount} ratings
            </Text>
          </View>

          {/* Peak Hours */}
          <View style={[styles.section, { backgroundColor: card, borderColor: border }]}>
            <Text style={[styles.sectionTitle, { color: text }]}>Peak Hours</Text>
            <View style={styles.peakHoursContainer}>
              {analytics.peakHours.slice(0, 5).map((peak, index) => (
                <View key={index} style={styles.peakHourRow}>
                  <Text style={[styles.peakHourTime, { color: text }]}>
                    {formatHour(peak.hour)}
                  </Text>
                  <View style={styles.peakHourBar}>
                    <View
                      style={[
                        styles.peakHourBarFill,
                        {
                          backgroundColor: primary,
                          width: `${(peak.count / analytics.peakHours[0].count) * 100}%`,
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.peakHourCount, { color: muted }]}>{peak.count}</Text>
                </View>
              ))}
            </View>
            <View style={styles.peakDays}>
              <View>
                <Text style={[styles.peakDayLabel, { color: muted }]}>Busiest</Text>
                <Text style={[styles.peakDayValue, { color: text }]}>{analytics.busiestDay}</Text>
              </View>
              <View>
                <Text style={[styles.peakDayLabel, { color: muted }]}>Quietest</Text>
                <Text style={[styles.peakDayValue, { color: text }]}>{analytics.quietestDay}</Text>
              </View>
            </View>
          </View>

          {/* Sentiment */}
          <View style={[styles.section, { backgroundColor: card, borderColor: border }]}>
            <Text style={[styles.sectionTitle, { color: text }]}>User Sentiment</Text>
            <View style={styles.sentimentBar}>
              <View
                style={[
                  styles.sentimentSegment,
                  {
                    backgroundColor: success,
                    width: `${(analytics.sentiment.positive / Math.max(1, analytics.sentiment.positive + analytics.sentiment.neutral + analytics.sentiment.negative)) * 100}%`,
                  },
                ]}
              />
              <View
                style={[
                  styles.sentimentSegment,
                  {
                    backgroundColor: warning,
                    width: `${(analytics.sentiment.neutral / Math.max(1, analytics.sentiment.positive + analytics.sentiment.neutral + analytics.sentiment.negative)) * 100}%`,
                  },
                ]}
              />
              <View
                style={[
                  styles.sentimentSegment,
                  {
                    backgroundColor: danger,
                    width: `${(analytics.sentiment.negative / Math.max(1, analytics.sentiment.positive + analytics.sentiment.neutral + analytics.sentiment.negative)) * 100}%`,
                  },
                ]}
              />
            </View>
            <View style={styles.sentimentLegend}>
              <View style={styles.sentimentLegendItem}>
                <View style={[styles.sentimentDot, { backgroundColor: success }]} />
                <Text style={[styles.sentimentLegendText, { color: text }]}>
                  Positive ({analytics.sentiment.positive})
                </Text>
              </View>
              <View style={styles.sentimentLegendItem}>
                <View style={[styles.sentimentDot, { backgroundColor: warning }]} />
                <Text style={[styles.sentimentLegendText, { color: text }]}>
                  Neutral ({analytics.sentiment.neutral})
                </Text>
              </View>
              <View style={styles.sentimentLegendItem}>
                <View style={[styles.sentimentDot, { backgroundColor: danger }]} />
                <Text style={[styles.sentimentLegendText, { color: text }]}>
                  Negative ({analytics.sentiment.negative})
                </Text>
              </View>
            </View>
            {analytics.sentiment.topKeywords.length > 0 && (
              <View style={styles.keywords}>
                <Text style={[styles.keywordsLabel, { color: muted }]}>Top Keywords:</Text>
                <View style={styles.keywordsList}>
                  {analytics.sentiment.topKeywords.slice(0, 5).map((keyword, index) => (
                    <View key={index} style={[styles.keywordChip, { backgroundColor: withAlpha(primary, 0.1), borderColor: primary }]}>
                      <Text style={[styles.keywordText, { color: primary }]}>{keyword}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        </>
      )}

      {/* Quick Actions */}
      <View style={styles.actionsGrid}>
        <ActionButton
          icon="chart.line.uptrend.xyaxis"
          label="Analytics"
          onPress={() => router.push('/business/analytics' as any)}
          backgroundColor={card}
          textColor={text}
          iconColor={primary}
          borderColor={border}
        />
        <ActionButton
          icon="megaphone.fill"
          label="Promotions"
          badge={activePromotions > 0 ? activePromotions.toString() : undefined}
          onPress={() => router.push('/business/promotions' as any)}
          backgroundColor={card}
          textColor={text}
          iconColor={primary}
          borderColor={border}
        />
        <ActionButton
          icon="chart.bar.xaxis"
          label="Competitive"
          onPress={() => router.push('/business/competitive' as any)}
          backgroundColor={card}
          textColor={text}
          iconColor={primary}
          borderColor={border}
        />
        <ActionButton
          icon="bubble.left.and.bubble.right.fill"
          label="Responses"
          onPress={() => router.push('/business/responses' as any)}
          backgroundColor={card}
          textColor={text}
          iconColor={primary}
          borderColor={border}
        />
      </View>
    </ScrollView>
  );
}

function MetricCard({
  icon,
  label,
  value,
  subtitle,
  trend,
  trendPercent,
  iconColor,
  backgroundColor,
  textColor,
  mutedColor,
  borderColor,
  successColor,
  dangerColor,
}: {
  icon: string;
  label: string;
  value: string;
  subtitle?: string;
  trend?: 'up' | 'down' | 'stable';
  trendPercent?: number;
  iconColor: string;
  backgroundColor: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  successColor?: string;
  dangerColor?: string;
}) {
  return (
    <View style={[styles.metricCard, { backgroundColor, borderColor }]}>
      <IconSymbol name={icon as any} size={24} color={iconColor} />
      <Text style={[styles.metricLabel, { color: mutedColor }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: textColor }]}>{value}</Text>
      {subtitle && <Text style={[styles.metricSubtitle, { color: mutedColor }]}>{subtitle}</Text>}
      {trend && trendPercent !== undefined && (
        <View style={styles.metricTrend}>
          <IconSymbol
            name={trend === 'up' ? 'arrow.up.right' : trend === 'down' ? 'arrow.down.right' : 'arrow.right'}
            size={12}
            color={
              trend === 'up'
                ? successColor || mutedColor
                : trend === 'down'
                  ? dangerColor || mutedColor
                  : mutedColor
            }
          />
          <Text
            style={[
              styles.metricTrendText,
              {
                color:
                  trend === 'up'
                    ? successColor || mutedColor
                    : trend === 'down'
                      ? dangerColor || mutedColor
                      : mutedColor,
              },
            ]}
          >
            {Math.abs(trendPercent)}%
          </Text>
        </View>
      )}
    </View>
  );
}

function RatingBar({
  label,
  icon,
  value,
  textColor,
  mutedColor,
  primary,
}: {
  label: string;
  icon: string;
  value: number;
  textColor: string;
  mutedColor: string;
  primary: string;
}) {
  return (
    <View style={styles.ratingBarContainer}>
      <View style={styles.ratingBarHeader}>
        <IconSymbol name={icon as any} size={14} color={mutedColor} />
        <Text style={[styles.ratingBarLabel, { color: textColor }]}>{label}</Text>
      </View>
      <View style={styles.ratingBarProgress}>
        <View style={[styles.ratingBarTrack, { backgroundColor: withAlpha(primary, 0.2) }]}>
          <View
            style={[styles.ratingBarFill, { backgroundColor: primary, width: `${(value / 5) * 100}%` }]}
          />
        </View>
        <Text style={[styles.ratingBarValue, { color: textColor }]}>{value.toFixed(1)}</Text>
      </View>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  badge,
  onPress,
  backgroundColor,
  textColor,
  iconColor,
  borderColor,
}: {
  icon: string;
  label: string;
  badge?: string;
  onPress: () => void;
  backgroundColor: string;
  textColor: string;
  iconColor: string;
  borderColor: string;
}) {
  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={[styles.actionButton, { backgroundColor, borderColor }]}
    >
      <IconSymbol name={icon as any} size={28} color={iconColor} />
      <Text style={[styles.actionButtonLabel, { color: textColor }]}>{label}</Text>
      {badge && (
        <View style={[styles.actionBadge, { backgroundColor: iconColor }]}>
          <Text style={styles.actionBadgeText}>{badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

function formatHour(hour: number): string {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:00 ${ampm}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 15,
  },
  claimButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  claimButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
  },
  headerSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotSelector: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  spotChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  spotChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  periodSelector: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  periodButtonText: {
    fontSize: 13,
    fontWeight: '700',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 16,
  },
  metricCard: {
    width: '48%',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 6,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  metricValue: {
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 32,
  },
  metricSubtitle: {
    fontSize: 11,
  },
  metricTrend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  metricTrendText: {
    fontSize: 12,
    fontWeight: '700',
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 16,
  },
  ratingsGrid: {
    gap: 12,
  },
  ratingBarContainer: {
    gap: 6,
  },
  ratingBarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ratingBarLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  ratingBarProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ratingBarTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  ratingBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  ratingBarValue: {
    fontSize: 14,
    fontWeight: '700',
    width: 32,
    textAlign: 'right',
  },
  ratingCount: {
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  peakHoursContainer: {
    gap: 10,
  },
  peakHourRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  peakHourTime: {
    fontSize: 13,
    fontWeight: '600',
    width: 80,
  },
  peakHourBar: {
    flex: 1,
    height: 24,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  peakHourBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  peakHourCount: {
    fontSize: 13,
    fontWeight: '600',
    width: 40,
    textAlign: 'right',
  },
  peakDays: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  peakDayLabel: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 4,
  },
  peakDayValue: {
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  sentimentBar: {
    flexDirection: 'row',
    height: 32,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 12,
  },
  sentimentSegment: {
    height: '100%',
  },
  sentimentLegend: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 8,
  },
  sentimentLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sentimentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sentimentLegendText: {
    fontSize: 12,
    fontWeight: '600',
  },
  keywords: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  keywordsLabel: {
    fontSize: 12,
    marginBottom: 8,
  },
  keywordsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  keywordChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  keywordText: {
    fontSize: 11,
    fontWeight: '600',
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },
  actionButton: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    position: 'relative',
  },
  actionButtonLabel: {
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  actionBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  actionBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
});
