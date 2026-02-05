import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useState, useEffect } from 'react';
import { router } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { PolishedHeader } from '@/components/ui/polished-header';
import { FriendRequestCard } from '@/components/ui/friend-request-card';
import { PolishedCard } from '@/components/ui/polished-card';
import { EmptyState } from '@/components/ui/empty-state';
import { SkeletonLoader } from '@/components/ui/skeleton-loader';
import SpotImage from '@/components/ui/spot-image';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import { withAlpha } from '@/utils/colors';
import { tokens } from '@/constants/tokens';
import { getDemoFriendRequests, getDemoFriendSuggestions } from '@/services/demoDataManager';
import { isDemoMode } from '@/services/demoMode';

interface FriendRequest {
  id: string;
  fromUser: {
    id: string;
    name: string;
    handle?: string;
    photoUrl?: string;
    campus?: string;
    mutualFriends?: number;
  };
  timestamp: Date;
}

interface FriendSuggestion {
  id: string;
  name: string;
  handle?: string;
  photoUrl?: string;
  campus?: string;
  mutualFriends: number;
  reason?: string;
}

/**
 * Silicon Valley-grade friends management screen
 * Friend requests, suggestions with social proof, mutual connections
 */
export default function FriendsScreen() {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [suggestions, setSuggestions] = useState<FriendSuggestion[]>([]);
  const [selectedTab, setSelectedTab] = useState<'requests' | 'suggestions'>('requests');

  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const border = useThemeColor({}, 'border');

  useEffect(() => {
    loadFriendData();
  }, []);

  const loadFriendData = async () => {
    setLoading(true);
    try {
      const isDemo = await isDemoMode();

      if (isDemo) {
        // Load demo data
        setTimeout(() => {
          const demoRequests = getDemoFriendRequests();
          const demoSuggestions = getDemoFriendSuggestions();

          setRequests(demoRequests);
          setSuggestions(demoSuggestions);
          setLoading(false);
        }, 800);
      } else {
        // TODO: Load real friend requests and suggestions from Firebase
        setTimeout(() => {
          setRequests([]);
          setSuggestions([]);
          setLoading(false);
        }, 800);
      }
    } catch (error) {
      console.error('Failed to load friend data:', error);
      setLoading(false);
    }
  };

  const handleAcceptRequest = async (id: string) => {
    // TODO: Implement accept logic
    console.log('Accepting request:', id);
    setRequests((prev) => prev.filter((req) => req.id !== id));
  };

  const handleDeclineRequest = async (id: string) => {
    // TODO: Implement decline logic
    console.log('Declining request:', id);
    setRequests((prev) => prev.filter((req) => req.id !== id));
  };

  const handleAddFriend = async (userId: string) => {
    // TODO: Implement add friend logic
    console.log('Adding friend:', userId);
  };

  return (
    <ThemedView style={{ flex: 1 }}>
      <PolishedHeader
        title="Friends"
        leftIcon="chevron.left"
        onLeftPress={() => router.back()}
        rightIcon="person.badge.plus"
        onRightPress={() => {
          // TODO: Navigate to find friends screen
        }}
      />

      {/* Tab Selector */}
      <View style={[styles.tabContainer, { borderBottomColor: border }]}>
        <Pressable
          onPress={() => setSelectedTab('requests')}
          style={[
            styles.tab,
            selectedTab === 'requests' && {
              borderBottomColor: primary,
              borderBottomWidth: 2,
            },
          ]}
        >
          <Text
            style={[
              styles.tabText,
              { color: selectedTab === 'requests' ? primary : muted },
            ]}
          >
            Requests
            {requests.length > 0 && (
              <View
                style={[
                  styles.badge,
                  { backgroundColor: primary, marginLeft: 8 },
                ]}
              >
                <Text style={styles.badgeText}>{requests.length}</Text>
              </View>
            )}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setSelectedTab('suggestions')}
          style={[
            styles.tab,
            selectedTab === 'suggestions' && {
              borderBottomColor: primary,
              borderBottomWidth: 2,
            },
          ]}
        >
          <Text
            style={[
              styles.tabText,
              { color: selectedTab === 'suggestions' ? primary : muted },
            ]}
          >
            Suggestions
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          // Loading state
          <>
            {[1, 2, 3].map((i) => (
              <View key={i} style={styles.skeletonCard}>
                <View style={styles.skeletonHeader}>
                  <SkeletonLoader width={56} height={56} variant="circular" />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <SkeletonLoader width="60%" height={18} />
                    <SkeletonLoader
                      width="40%"
                      height={14}
                      style={{ marginTop: 8 }}
                    />
                    <SkeletonLoader
                      width="50%"
                      height={12}
                      style={{ marginTop: 8 }}
                    />
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
                  <SkeletonLoader width="48%" height={44} />
                  <SkeletonLoader width="48%" height={44} />
                </View>
              </View>
            ))}
          </>
        ) : selectedTab === 'requests' ? (
          // Friend Requests Tab
          <>
            {requests.length === 0 ? (
              <EmptyState
                icon="person.2.fill"
                title="No friend requests"
                description="When someone sends you a friend request, it will appear here."
                actionLabel="Find friends"
                onAction={() => {
                  // TODO: Navigate to find friends
                }}
              />
            ) : (
              <>
                {requests.map((request, index) => (
                  <FriendRequestCard
                    key={request.id}
                    id={request.id}
                    fromUser={request.fromUser}
                    onAccept={handleAcceptRequest}
                    onDecline={handleDeclineRequest}
                    animated
                    delay={index * 50}
                  />
                ))}
              </>
            )}
          </>
        ) : (
          // Suggestions Tab
          <>
            {suggestions.length === 0 ? (
              <EmptyState
                icon="sparkles"
                title="No suggestions yet"
                description="We'll suggest friends based on your campus, check-ins, and mutual connections."
              />
            ) : (
              <>
                {suggestions.map((suggestion, index) => (
                  <SuggestionCard
                    key={suggestion.id}
                    suggestion={suggestion}
                    onAdd={handleAddFriend}
                    delay={index * 50}
                  />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

/**
 * Friend suggestion card with mutual friends and reason
 */
function SuggestionCard({
  suggestion,
  onAdd,
  delay = 0,
}: {
  suggestion: FriendSuggestion;
  onAdd: (userId: string) => void;
  delay?: number;
}) {
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const border = useThemeColor({}, 'border');
  const success = useThemeColor({}, 'success');

  const handleAdd = async () => {
    setAdding(true);
    try {
      await onAdd(suggestion.id);
      setAdded(true);
    } catch (error) {
      console.error('Failed to add friend:', error);
    } finally {
      setAdding(false);
    }
  };

  return (
    <PolishedCard
      variant="elevated"
      animated
      delay={delay}
      pressable={false}
      style={styles.suggestionCard}
    >
      <View style={styles.suggestionContent}>
        {/* Profile Photo */}
        {suggestion.photoUrl ? (
          <SpotImage
            source={{ uri: suggestion.photoUrl }}
            style={styles.suggestionPhoto}
          />
        ) : (
          <View
            style={[
              styles.suggestionPhoto,
              styles.photoPlaceholder,
              { backgroundColor: border },
            ]}
          >
            <Text style={{ fontSize: 24, color: text }}>
              {suggestion.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}

        {/* User Info */}
        <View style={styles.suggestionInfo}>
          <Text style={[styles.suggestionName, { color: text }]} numberOfLines={1}>
            {suggestion.name}
          </Text>

          {suggestion.handle && (
            <Text style={[styles.suggestionHandle, { color: muted }]} numberOfLines={1}>
              @{suggestion.handle}
            </Text>
          )}

          {suggestion.campus && (
            <View style={styles.metaRow}>
              <IconSymbol name="building.2.fill" size={12} color={muted} />
              <Text style={[styles.metaText, { color: muted }]} numberOfLines={1}>
                {suggestion.campus}
              </Text>
            </View>
          )}

          {suggestion.mutualFriends > 0 && (
            <View style={styles.metaRow}>
              <IconSymbol name="person.2.fill" size={12} color={primary} />
              <Text style={[styles.metaText, { color: primary }]}>
                {suggestion.mutualFriends} mutual friend
                {suggestion.mutualFriends !== 1 ? 's' : ''}
              </Text>
            </View>
          )}

          {suggestion.reason && (
            <View
              style={[
                styles.reasonBadge,
                { backgroundColor: withAlpha(primary, 0.1) },
              ]}
            >
              <Text style={[styles.reasonText, { color: primary }]}>
                {suggestion.reason}
              </Text>
            </View>
          )}
        </View>

        {/* Add Button */}
        {added ? (
          <View style={styles.addedIndicator}>
            <IconSymbol name="checkmark.circle.fill" size={24} color={success} />
          </View>
        ) : (
          <Pressable
            onPress={handleAdd}
            disabled={adding}
            style={({ pressed }) => [
              styles.addButton,
              { backgroundColor: withAlpha(primary, 0.1), borderColor: primary },
              pressed && { opacity: 0.7 },
            ]}
          >
            <IconSymbol
              name={adding ? 'hourglass' : 'person.badge.plus'}
              size={20}
              color={primary}
            />
          </Pressable>
        )}
      </View>
    </PolishedCard>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    paddingHorizontal: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  skeletonCard: {
    padding: 16,
    marginBottom: 12,
  },
  skeletonHeader: {
    flexDirection: 'row',
  },
  suggestionCard: {
    padding: 16,
    marginBottom: 12,
  },
  suggestionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  suggestionPhoto: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginRight: 12,
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionInfo: {
    flex: 1,
  },
  suggestionName: {
    fontSize: tokens.type.h4.fontSize,
    fontWeight: '700',
    marginBottom: 2,
  },
  suggestionHandle: {
    fontSize: 14,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  metaText: {
    fontSize: 13,
    fontWeight: '500',
  },
  reasonBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 8,
  },
  reasonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  addedIndicator: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
