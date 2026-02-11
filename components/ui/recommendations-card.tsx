/**
 * Recommendations Card
 *
 * Displays personalized spot recommendations with AI-powered insights
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAuth } from '@/contexts/AuthContext';
import { IconSymbol } from './icon-symbol';
import {
  getPersonalizedRecommendations,
  getCollaborativeRecommendations,
  type SpotRecommendation,
} from '@/services/recommendations';
import { withAlpha } from '@/utils/colors';
import * as Haptics from 'expo-haptics';

interface RecommendationsCardProps {
  userLocation: { lat: number; lng: number } | null;
  context?: {
    timeOfDay?: 'morning' | 'afternoon' | 'evening';
    weather?: 'sunny' | 'rainy' | 'cloudy';
  };
  onSpotPress?: (placeId: string, name: string) => void;
  variant?: 'personalized' | 'collaborative';
  currentSpotId?: string;
}

export function RecommendationsCard({
  userLocation,
  context,
  onSpotPress,
  variant = 'personalized',
  currentSpotId,
}: RecommendationsCardProps) {
  const router = useRouter();
  const { user } = useAuth();

  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const card = useThemeColor({}, 'card');
  const border = useThemeColor({}, 'border');

  const [recommendations, setRecommendations] = useState<SpotRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadRecommendations();
  }, [user?.id, userLocation, variant, currentSpotId]);

  const loadRecommendations = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      setError(null);

      let recs: SpotRecommendation[] = [];

      if (variant === 'collaborative') {
        recs = await getCollaborativeRecommendations(user.id, currentSpotId, 5);
      } else if (userLocation) {
        recs = await getPersonalizedRecommendations(user.id, userLocation, context);
      }

      setRecommendations(recs);
    } catch (err) {
      console.error('Failed to load recommendations:', err);
      setError('Failed to load recommendations');
    } finally {
      setLoading(false);
    }
  };

  const handleSpotPress = async (rec: SpotRecommendation) => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    if (onSpotPress) {
      onSpotPress(rec.placeId, rec.name);
    } else {
      router.push(
        `/checkin?spot=${encodeURIComponent(rec.name)}&placeId=${encodeURIComponent(rec.placeId)}` as any
      );
    }
  };

  if (!user) return null;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: card, borderColor: border }]}>
        <View style={styles.header}>
          <IconSymbol name="sparkles" size={20} color={primary} />
          <Text style={[styles.title, { color: text }]}>
            {variant === 'collaborative' ? 'You Might Also Like' : 'Recommended for You'}
          </Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={primary} />
          <Text style={[styles.loadingText, { color: muted }]}>Finding great spots...</Text>
        </View>
      </View>
    );
  }

  if (error || recommendations.length === 0) {
    return null; // Don't show if no recommendations
  }

  return (
    <View style={[styles.container, { backgroundColor: card, borderColor: border }]}>
      <View style={styles.header}>
        <IconSymbol name="sparkles" size={20} color={primary} />
        <Text style={[styles.title, { color: text }]}>
          {variant === 'collaborative' ? 'You Might Also Like' : 'Recommended for You'}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {recommendations.map((rec) => (
          <Pressable
            key={rec.placeId}
            onPress={() => handleSpotPress(rec)}
            style={[styles.recommendationCard, { backgroundColor: background, borderColor: border }]}
          >
            {/* Score Badge */}
            <View style={[styles.scoreBadge, { backgroundColor: withAlpha(primary, 0.15) }]}>
              <Text style={[styles.scoreText, { color: primary }]}>{Math.round(rec.score)}%</Text>
              <Text style={[styles.scoreLabel, { color: primary }]}>match</Text>
            </View>

            {/* Spot Name */}
            <Text style={[styles.spotName, { color: text }]} numberOfLines={2}>
              {rec.name}
            </Text>

            {/* Predictions */}
            {(rec.predictedBusyness || rec.predictedNoise) && (
              <View style={styles.predictions}>
                {rec.predictedBusyness && (
                  <View style={styles.prediction}>
                    <IconSymbol name="person.2.fill" size={12} color={muted} />
                    <Text style={[styles.predictionText, { color: muted }]}>
                      {getBusynessLabel(rec.predictedBusyness)}
                    </Text>
                  </View>
                )}
                {rec.predictedNoise && (
                  <View style={styles.prediction}>
                    <IconSymbol name="speaker.wave.2.fill" size={12} color={muted} />
                    <Text style={[styles.predictionText, { color: muted }]}>
                      {getNoiseLabel(rec.predictedNoise)}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Best Time */}
            {rec.bestTimeToVisit && (
              <View style={[styles.bestTime, { backgroundColor: withAlpha(primary, 0.1) }]}>
                <IconSymbol name="clock.fill" size={10} color={primary} />
                <Text style={[styles.bestTimeText, { color: primary }]}>
                  Best: {rec.bestTimeToVisit}
                </Text>
              </View>
            )}

            {/* Reasons */}
            {rec.reasons.length > 0 && (
              <View style={styles.reasons}>
                {rec.reasons.slice(0, 2).map((reason, index) => (
                  <View key={index} style={styles.reasonRow}>
                    <IconSymbol name="checkmark.circle.fill" size={10} color={primary} />
                    <Text style={[styles.reasonText, { color: muted }]} numberOfLines={1}>
                      {reason}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* CTA */}
            <View style={[styles.ctaButton, { backgroundColor: primary }]}>
              <Text style={styles.ctaText}>Check In</Text>
              <IconSymbol name="arrow.right" size={12} color="#FFFFFF" />
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function getBusynessLabel(level: number): string {
  if (level <= 2) return 'Quiet';
  if (level <= 3.5) return 'Moderate';
  return 'Busy';
}

function getNoiseLabel(level: number): string {
  if (level <= 2) return 'Quiet';
  if (level <= 3.5) return 'Moderate';
  return 'Lively';
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
  },
  scrollContent: {
    gap: 12,
    paddingRight: 16,
  },
  recommendationCard: {
    width: 200,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  scoreBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignItems: 'center',
  },
  scoreText: {
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 18,
  },
  scoreLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    lineHeight: 10,
  },
  spotName: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 10,
    paddingRight: 50, // Space for score badge
    minHeight: 38,
  },
  predictions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  prediction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  predictionText: {
    fontSize: 11,
    fontWeight: '600',
  },
  bestTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  bestTimeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  reasons: {
    gap: 4,
    marginBottom: 12,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reasonText: {
    fontSize: 11,
    flex: 1,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
