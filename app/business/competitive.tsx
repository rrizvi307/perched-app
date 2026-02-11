/**
 * Competitive Intelligence Screen
 *
 * Shows how your spot compares to nearby competitors
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAuth } from '@/contexts/AuthContext';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  getBusinessSpots,
  getCompetitiveIntelligence,
  type CompetitiveIntelligence,
  type BusinessSpot,
} from '@/services/businessAnalytics';
import { withAlpha } from '@/utils/colors';

export default function CompetitiveIntelligenceScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const card = useThemeColor({}, 'card');
  const border = useThemeColor({}, 'border');
  const success = '#10b981';
  const danger = '#ef4444';

  const [businessSpots, setBusinessSpots] = useState<BusinessSpot[]>([]);
  const [selectedSpot, setSelectedSpot] = useState<BusinessSpot | null>(null);
  const [intelligence, setIntelligence] = useState<CompetitiveIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [radius, setRadius] = useState<number>(2);

  useEffect(() => {
    loadData();
  }, [user?.id]);

  useEffect(() => {
    if (selectedSpot) {
      loadIntelligence();
    }
  }, [selectedSpot, radius]);

  const loadData = async () => {
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
  };

  const loadIntelligence = async () => {
    if (!selectedSpot) return;

    try {
      setLoading(true);
      const data = await getCompetitiveIntelligence(selectedSpot.id, radius);
      setIntelligence(data);
    } catch (error) {
      console.error('Failed to load competitive intelligence:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadIntelligence();
    setRefreshing(false);
  };

  if (!user || businessSpots.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: background }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol name="chevron.left" size={24} color={primary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: text }]}>Competitive Intelligence</Text>
        </View>
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: muted }]}>No business spots found</Text>
        </View>
      </View>
    );
  }

  if (loading && !intelligence) {
    return (
      <View style={[styles.container, { backgroundColor: background }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol name="chevron.left" size={24} color={primary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: text }]}>Competitive Intelligence</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={primary} size="large" />
          <Text style={[styles.loadingText, { color: muted }]}>Loading competitive data...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={24} color={primary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: text }]}>Competitive Intelligence</Text>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} />}
      >
        {/* Spot Selector */}
        {businessSpots.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.spotSelector}>
            {businessSpots.map(spot => (
              <Pressable
                key={spot.id}
                onPress={() => setSelectedSpot(spot)}
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

        {/* Radius Selector */}
        <View style={styles.radiusSelector}>
          <Text style={[styles.radiusSelectorLabel, { color: muted }]}>Search Radius:</Text>
          {[1, 2, 5].map(r => (
            <Pressable
              key={r}
              onPress={() => setRadius(r)}
              style={[
                styles.radiusButton,
                {
                  backgroundColor: radius === r ? primary : card,
                  borderColor: border,
                },
              ]}
            >
              <Text style={[styles.radiusButtonText, { color: radius === r ? '#FFFFFF' : text }]}>
                {r}km
              </Text>
            </Pressable>
          ))}
        </View>

        {intelligence && (
          <>
            {/* Your Ranking */}
            <View style={[styles.section, { backgroundColor: card, borderColor: border }]}>
              <Text style={[styles.sectionTitle, { color: text }]}>Your Rankings</Text>
              <View style={styles.rankingsGrid}>
                <RankingCard
                  icon="chart.bar.fill"
                  label="Check-ins"
                  rank={intelligence.ranking.byCheckins}
                  total={intelligence.competitors.length + 1}
                  iconColor={primary}
                  backgroundColor={background}
                  textColor={text}
                  mutedColor={muted}
                  borderColor={border}
                  successColor={success}
                />
                <RankingCard
                  icon="wifi"
                  label="WiFi Quality"
                  rank={intelligence.ranking.byWifi}
                  total={intelligence.competitors.length + 1}
                  iconColor={primary}
                  backgroundColor={background}
                  textColor={text}
                  mutedColor={muted}
                  borderColor={border}
                  successColor={success}
                />
                <RankingCard
                  icon="person.2.fill"
                  label="Unique Visitors"
                  rank={intelligence.ranking.byVisitors}
                  total={intelligence.competitors.length + 1}
                  iconColor={primary}
                  backgroundColor={background}
                  textColor={text}
                  mutedColor={muted}
                  borderColor={border}
                  successColor={success}
                />
              </View>
            </View>

            {/* Your Spot Overview */}
            <View style={[styles.section, { backgroundColor: card, borderColor: border }]}>
              <Text style={[styles.sectionTitle, { color: text }]}>Your Spot</Text>
              <View style={[styles.spotCard, { backgroundColor: withAlpha(primary, 0.1), borderColor: primary }]}>
                <View style={styles.spotCardHeader}>
                  <Text style={[styles.spotCardName, { color: text }]}>{intelligence.yourSpot.spotName}</Text>
                  <View style={[styles.spotBadge, { backgroundColor: primary }]}>
                    <Text style={styles.spotBadgeText}>You</Text>
                  </View>
                </View>
                <View style={styles.spotMetrics}>
                  <SpotMetric
                    label="Check-ins"
                    value={intelligence.yourSpot.checkins.toString()}
                    icon="chart.bar.fill"
                    textColor={text}
                    mutedColor={muted}
                  />
                  <SpotMetric
                    label="Visitors"
                    value={intelligence.yourSpot.uniqueVisitors.toString()}
                    icon="person.2.fill"
                    textColor={text}
                    mutedColor={muted}
                  />
                  <SpotMetric
                    label="WiFi"
                    value={intelligence.yourSpot.avgWifi.toFixed(1)}
                    icon="wifi"
                    textColor={text}
                    mutedColor={muted}
                  />
                  <SpotMetric
                    label="Noise"
                    value={intelligence.yourSpot.avgNoise.toFixed(1)}
                    icon="speaker.wave.2.fill"
                    textColor={text}
                    mutedColor={muted}
                  />
                </View>
              </View>
            </View>

            {/* Competitors */}
            <View style={[styles.section, { backgroundColor: card, borderColor: border }]}>
              <Text style={[styles.sectionTitle, { color: text }]}>
                Nearby Competitors ({intelligence.competitors.length})
              </Text>
              {intelligence.competitors.length === 0 ? (
                <View style={styles.noCompetitors}>
                  <IconSymbol name="checkmark.circle.fill" size={48} color={success} />
                  <Text style={[styles.noCompetitorsTitle, { color: text }]}>
                    You&apos;re the only one!
                  </Text>
                  <Text style={[styles.noCompetitorsSubtitle, { color: muted }]}>
                    No competitors found within {radius}km
                  </Text>
                </View>
              ) : (
                <View style={styles.competitorsList}>
                  {intelligence.competitors.map((competitor, index) => (
                    <View
                      key={competitor.spotId}
                      style={[styles.competitorCard, { backgroundColor: background, borderColor: border }]}
                    >
                      <View style={styles.competitorHeader}>
                        <View style={styles.competitorRank}>
                          <Text style={[styles.competitorRankText, { color: muted }]}>#{index + 2}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.competitorName, { color: text }]}>
                            {competitor.spotName}
                          </Text>
                          <Text style={[styles.competitorDistance, { color: muted }]}>
                            {competitor.distance}km away
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.comparisonBadge,
                            {
                              backgroundColor:
                                competitor.checkins > intelligence.yourSpot.checkins
                                  ? withAlpha(danger, 0.15)
                                  : withAlpha(success, 0.15),
                            },
                          ]}
                        >
                          <IconSymbol
                            name={
                              competitor.checkins > intelligence.yourSpot.checkins
                                ? 'arrow.up'
                                : 'arrow.down'
                            }
                            size={12}
                            color={
                              competitor.checkins > intelligence.yourSpot.checkins ? danger : success
                            }
                          />
                        </View>
                      </View>
                      <View style={styles.competitorMetrics}>
                        <CompetitorMetric
                          label="Check-ins"
                          yourValue={intelligence.yourSpot.checkins}
                          theirValue={competitor.checkins}
                          textColor={text}
                          mutedColor={muted}
                          successColor={success}
                          dangerColor={danger}
                        />
                        <CompetitorMetric
                          label="Visitors"
                          yourValue={intelligence.yourSpot.uniqueVisitors}
                          theirValue={competitor.uniqueVisitors}
                          textColor={text}
                          mutedColor={muted}
                          successColor={success}
                          dangerColor={danger}
                        />
                        <CompetitorMetric
                          label="WiFi"
                          yourValue={parseFloat(intelligence.yourSpot.avgWifi.toFixed(1))}
                          theirValue={parseFloat(competitor.avgWifi.toFixed(1))}
                          textColor={text}
                          mutedColor={muted}
                          successColor={success}
                          dangerColor={danger}
                          higherIsBetter
                        />
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Insights */}
            <View style={[styles.section, { backgroundColor: card, borderColor: border }]}>
              <Text style={[styles.sectionTitle, { color: text }]}>Insights & Recommendations</Text>
              <View style={styles.insightsList}>
                {intelligence.ranking.byCheckins === 1 && (
                  <InsightCard
                    icon="trophy.fill"
                    title="Market Leader"
                    description="You have the most check-ins in your area! Keep up the great work."
                    iconColor="#f59e0b"
                    backgroundColor={withAlpha('#f59e0b', 0.1)}
                    textColor={text}
                    mutedColor={muted}
                  />
                )}
                {intelligence.ranking.byWifi === 1 && (
                  <InsightCard
                    icon="wifi"
                    title="Best WiFi"
                    description="Your WiFi quality is rated highest in the area."
                    iconColor={success}
                    backgroundColor={withAlpha(success, 0.1)}
                    textColor={text}
                    mutedColor={muted}
                  />
                )}
                {intelligence.yourSpot.avgWifi < 3.5 && (
                  <InsightCard
                    icon="wifi.exclamationmark"
                    title="WiFi Needs Improvement"
                    description="Consider upgrading your WiFi. Many competitors have better ratings."
                    iconColor={danger}
                    backgroundColor={withAlpha(danger, 0.1)}
                    textColor={text}
                    mutedColor={muted}
                  />
                )}
                {intelligence.competitors.some(c => c.checkins > intelligence.yourSpot.checkins * 1.5) && (
                  <InsightCard
                    icon="megaphone.fill"
                    title="Boost Visibility"
                    description="Some competitors are getting significantly more traffic. Consider running promotions."
                    iconColor={primary}
                    backgroundColor={withAlpha(primary, 0.1)}
                    textColor={text}
                    mutedColor={muted}
                  />
                )}
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function RankingCard({
  icon,
  label,
  rank,
  total,
  iconColor,
  backgroundColor,
  textColor,
  mutedColor,
  borderColor,
  successColor,
}: {
  icon: string;
  label: string;
  rank: number;
  total: number;
  iconColor: string;
  backgroundColor: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  successColor: string;
}) {
  const isTop3 = rank <= 3;

  return (
    <View style={[styles.rankingCard, { backgroundColor, borderColor }]}>
      <IconSymbol name={icon as any} size={20} color={iconColor} />
      <Text style={[styles.rankingLabel, { color: mutedColor }]}>{label}</Text>
      <View style={styles.rankingValue}>
        <Text style={[styles.rankingRank, { color: isTop3 ? successColor : textColor }]}>
          #{rank}
        </Text>
        <Text style={[styles.rankingTotal, { color: mutedColor }]}>of {total}</Text>
      </View>
    </View>
  );
}

function SpotMetric({
  label,
  value,
  icon,
  textColor,
  mutedColor,
}: {
  label: string;
  value: string;
  icon: string;
  textColor: string;
  mutedColor: string;
}) {
  return (
    <View style={styles.spotMetric}>
      <IconSymbol name={icon as any} size={14} color={mutedColor} />
      <Text style={[styles.spotMetricValue, { color: textColor }]}>{value}</Text>
      <Text style={[styles.spotMetricLabel, { color: mutedColor }]}>{label}</Text>
    </View>
  );
}

function CompetitorMetric({
  label,
  yourValue,
  theirValue,
  higherIsBetter = true,
  textColor,
  mutedColor,
  successColor,
  dangerColor,
}: {
  label: string;
  yourValue: number;
  theirValue: number;
  higherIsBetter?: boolean;
  textColor: string;
  mutedColor: string;
  successColor: string;
  dangerColor: string;
}) {
  const diff = yourValue - theirValue;
  const isWinning = higherIsBetter ? diff > 0 : diff < 0;

  return (
    <View style={styles.competitorMetric}>
      <Text style={[styles.competitorMetricLabel, { color: mutedColor }]}>{label}</Text>
      <View style={styles.competitorMetricValues}>
        <Text style={[styles.competitorMetricValue, { color: textColor }]}>
          {theirValue}
        </Text>
        <Text
          style={[
            styles.competitorMetricDiff,
            { color: isWinning ? successColor : dangerColor },
          ]}
        >
          {diff > 0 ? '+' : ''}{diff.toFixed(0)}
        </Text>
      </View>
    </View>
  );
}

function InsightCard({
  icon,
  title,
  description,
  iconColor,
  backgroundColor,
  textColor,
  mutedColor,
}: {
  icon: string;
  title: string;
  description: string;
  iconColor: string;
  backgroundColor: string;
  textColor: string;
  mutedColor: string;
}) {
  return (
    <View style={[styles.insightCard, { backgroundColor }]}>
      <IconSymbol name={icon as any} size={24} color={iconColor} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.insightTitle, { color: textColor }]}>{title}</Text>
        <Text style={[styles.insightDescription, { color: mutedColor }]}>{description}</Text>
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
  },
  emptyText: {
    fontSize: 15,
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
  radiusSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  radiusSelectorLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginRight: 4,
  },
  radiusButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
  },
  radiusButtonText: {
    fontSize: 13,
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
  rankingsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  rankingCard: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    alignItems: 'center',
    gap: 6,
  },
  rankingLabel: {
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  rankingValue: {
    alignItems: 'center',
    marginTop: 4,
  },
  rankingRank: {
    fontSize: 24,
    fontWeight: '800',
  },
  rankingTotal: {
    fontSize: 11,
  },
  spotCard: {
    borderRadius: 12,
    borderWidth: 2,
    padding: 16,
  },
  spotCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  spotCardName: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  spotBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  spotBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  spotMetrics: {
    flexDirection: 'row',
    gap: 16,
  },
  spotMetric: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  spotMetricValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  spotMetricLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  competitorsList: {
    gap: 12,
  },
  competitorCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
  },
  competitorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  competitorRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  competitorRankText: {
    fontSize: 12,
    fontWeight: '800',
  },
  competitorName: {
    fontSize: 14,
    fontWeight: '700',
  },
  competitorDistance: {
    fontSize: 12,
    marginTop: 2,
  },
  comparisonBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  competitorMetrics: {
    flexDirection: 'row',
    gap: 16,
  },
  competitorMetric: {
    flex: 1,
  },
  competitorMetricLabel: {
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 4,
  },
  competitorMetricValues: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  competitorMetricValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  competitorMetricDiff: {
    fontSize: 11,
    fontWeight: '700',
  },
  noCompetitors: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  noCompetitorsTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  noCompetitorsSubtitle: {
    fontSize: 13,
  },
  insightsList: {
    gap: 12,
  },
  insightCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 10,
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  insightDescription: {
    fontSize: 12,
    lineHeight: 17,
  },
});
