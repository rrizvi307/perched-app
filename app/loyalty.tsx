/**
 * Loyalty Cards Screen
 *
 * Shows user's loyalty cards from partner spots
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
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAuth } from '@/contexts/AuthContext';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  getUserLoyaltyCards,
  redeemLoyaltyReward,
  type LoyaltyCard,
} from '@/services/partnerProgram';
import { withAlpha } from '@/utils/colors';
import * as Haptics from 'expo-haptics';

export default function LoyaltyScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const card = useThemeColor({}, 'card');
  const border = useThemeColor({}, 'border');
  const success = '#10b981';

  const [loyaltyCards, setLoyaltyCards] = useState<LoyaltyCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [redeeming, setRedeeming] = useState<string | null>(null);

  const loadLoyaltyCards = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const cards = await getUserLoyaltyCards(user.id);
      setLoyaltyCards(cards);
    } catch (error) {
      console.error('Failed to load loyalty cards:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadLoyaltyCards();
  }, [loadLoyaltyCards]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadLoyaltyCards();
    setRefreshing(false);
  };

  const handleRedeem = async (card: LoyaltyCard) => {
    if (card.rewardsEarned <= card.rewardsRedeemed) {
      Alert.alert('No Rewards Available', 'Keep checking in to earn more rewards!');
      return;
    }

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    Alert.alert(
      'Redeem Reward?',
      'Show this to the staff to claim your reward. This will use 1 of your available rewards.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Redeem',
          onPress: async () => {
            setRedeeming(card.id);

            try {
              const result = await redeemLoyaltyReward(user!.id, card.partnerId, card.id);

              if (result.success) {
                Alert.alert(
                  'Reward Redeemed!',
                  'Show this confirmation to the staff to claim your reward.',
                  [{ text: 'OK', onPress: () => loadLoyaltyCards() }]
                );
              } else {
                Alert.alert('Error', result.error || 'Failed to redeem reward');
              }
            } catch {
              Alert.alert('Error', 'An unexpected error occurred');
            } finally {
              setRedeeming(null);
            }
          },
        },
      ]
    );
  };

  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: background }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol name="chevron.left" size={24} color={primary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: text }]}>Loyalty Cards</Text>
        </View>
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: text }]}>Please sign in to view loyalty cards</Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: background }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <IconSymbol name="chevron.left" size={24} color={primary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: text }]}>Loyalty Cards</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={primary} size="large" />
          <Text style={[styles.loadingText, { color: muted }]}>Loading cards...</Text>
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
        <Text style={[styles.headerTitle, { color: text }]}>Loyalty Cards</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} />}
      >
        {loyaltyCards.length === 0 ? (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIcon, { backgroundColor: withAlpha(primary, 0.1) }]}>
              <IconSymbol name="creditcard.fill" size={48} color={primary} />
            </View>
            <Text style={[styles.emptyTitle, { color: text }]}>No Loyalty Cards Yet</Text>
            <Text style={[styles.emptySubtitle, { color: muted }]}>
              Check in at partner spots to start earning rewards!
            </Text>
            <Pressable
              onPress={() => router.push('/(tabs)/explore' as any)}
              style={[styles.exploreButton, { backgroundColor: primary }]}
            >
              <Text style={styles.exploreButtonText}>Explore Partner Spots</Text>
              <IconSymbol name="arrow.right" size={16} color="#FFFFFF" />
            </Pressable>
          </View>
        ) : (
          <>
            {/* Info Banner */}
            <View style={[styles.infoBanner, { backgroundColor: card, borderColor: border }]}>
              <IconSymbol name="info.circle.fill" size={20} color={primary} />
              <Text style={[styles.infoBannerText, { color: muted }]}>
                Check in at partner spots to fill your cards and earn free rewards!
              </Text>
            </View>

            {/* Loyalty Cards */}
            <View style={styles.cardsGrid}>
              {loyaltyCards.map(loyaltyCard => (
                <LoyaltyCardComponent
                  key={loyaltyCard.id}
                  card={loyaltyCard}
                  onRedeem={() => handleRedeem(loyaltyCard)}
                  redeeming={redeeming === loyaltyCard.id}
                  textColor={text}
                  mutedColor={muted}
                  primary={primary}
                  cardColor={card}
                  borderColor={border}
                  successColor={success}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function LoyaltyCardComponent({
  card,
  onRedeem,
  redeeming,
  textColor,
  mutedColor,
  primary,
  cardColor,
  borderColor,
  successColor,
}: {
  card: LoyaltyCard;
  onRedeem: () => void;
  redeeming: boolean;
  textColor: string;
  mutedColor: string;
  primary: string;
  cardColor: string;
  borderColor: string;
  successColor: string;
}) {
  const progress = (card.checkins / card.checkinsRequired) * 100;
  const availableRewards = card.rewardsEarned - card.rewardsRedeemed;
  const isComplete = card.checkins >= card.checkinsRequired;

  return (
    <View style={[styles.loyaltyCard, { backgroundColor: cardColor, borderColor }]}>
      {/* Header */}
      <View style={styles.loyaltyCardHeader}>
        <View style={[styles.loyaltyCardIcon, { backgroundColor: withAlpha(primary, 0.15) }]}>
          <IconSymbol name="cup.and.saucer.fill" size={24} color={primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.loyaltyCardName, { color: textColor }]}>{card.spotName}</Text>
          <Text style={[styles.loyaltyCardProgress, { color: mutedColor }]}>
            {card.checkins} / {card.checkinsRequired} check-ins
          </Text>
        </View>
        {availableRewards > 0 && (
          <View style={[styles.rewardBadge, { backgroundColor: successColor }]}>
            <Text style={styles.rewardBadgeText}>{availableRewards}</Text>
          </View>
        )}
      </View>

      {/* Progress Bar */}
      <View style={[styles.progressBar, { backgroundColor: withAlpha(primary, 0.2) }]}>
        <View
          style={[
            styles.progressBarFill,
            {
              backgroundColor: isComplete ? successColor : primary,
              width: `${Math.min(100, progress)}%`,
            },
          ]}
        />
      </View>

      {/* Stamps */}
      <View style={styles.stamps}>
        {Array.from({ length: card.checkinsRequired }).map((_, index) => (
          <View
            key={index}
            style={[
              styles.stamp,
              {
                backgroundColor: index < card.checkins ? withAlpha(primary, 0.2) : 'transparent',
                borderColor: index < card.checkins ? primary : borderColor,
              },
            ]}
          >
            {index < card.checkins && (
              <IconSymbol name="checkmark" size={12} color={primary} />
            )}
          </View>
        ))}
      </View>

      {/* Redeem Button */}
      {availableRewards > 0 ? (
        <Pressable
          onPress={onRedeem}
          disabled={redeeming}
          style={[styles.redeemButton, { backgroundColor: successColor }]}
        >
          {redeeming ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Text style={styles.redeemButtonText}>Redeem Reward</Text>
              <IconSymbol name="gift.fill" size={16} color="#FFFFFF" />
            </>
          )}
        </Pressable>
      ) : isComplete ? (
        <View style={[styles.completeMessage, { backgroundColor: withAlpha(successColor, 0.15) }]}>
          <IconSymbol name="checkmark.circle.fill" size={16} color={successColor} />
          <Text style={[styles.completeMessageText, { color: successColor }]}>
            Card complete! Visit to claim your reward
          </Text>
        </View>
      ) : (
        <View style={[styles.encouragementMessage, { backgroundColor: withAlpha(primary, 0.1) }]}>
          <Text style={[styles.encouragementMessageText, { color: mutedColor }]}>
            {card.checkinsRequired - card.checkins} more check-ins to go!
          </Text>
        </View>
      )}
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
  content: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 15,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 16,
  },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  exploreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  exploreButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  infoBanner: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  infoBannerText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  cardsGrid: {
    gap: 16,
  },
  loyaltyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 16,
  },
  loyaltyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loyaltyCardIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loyaltyCardName: {
    fontSize: 16,
    fontWeight: '700',
  },
  loyaltyCardProgress: {
    fontSize: 13,
    marginTop: 2,
  },
  rewardBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  rewardBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  stamps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stamp: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  redeemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  redeemButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  completeMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  completeMessageText: {
    fontSize: 13,
    fontWeight: '700',
  },
  encouragementMessage: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  encouragementMessageText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
