import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useState, useCallback } from 'react';
import { router } from 'expo-router';
import { ThemedView } from '@/components/themed-view';
import { PolishedHeader } from '@/components/ui/polished-header';
import { PolishedCard } from '@/components/ui/polished-card';
import { EmptyState } from '@/components/ui/empty-state';
import SpotImage from '@/components/ui/spot-image';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import { withAlpha } from '@/utils/colors';
import { tokens } from '@/constants/tokens';
import { useAuth } from '@/contexts/AuthContext';
import {
  findUserByEmail,
  findUserByHandle,
  sendFriendRequest,
  getUsersByCampus,
  getUserFriends,
  getOutgoingFriendRequests,
} from '@/services/firebaseClient';
import { logEvent } from '@/services/logEvent';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface UserResult {
  id: string;
  name: string;
  handle?: string;
  photoUrl?: string;
  campus?: string;
  isFriend?: boolean;
  isPending?: boolean;
}

/**
 * Find Friends screen - search by handle/email, see campus suggestions
 */
export default function FindFriendsScreen() {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [campusSuggestions, setCampusSuggestions] = useState<UserResult[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');
  const success = useThemeColor({}, 'success');

  // Load campus suggestions on mount
  useState(() => {
    loadCampusSuggestions();
  });

  const loadCampusSuggestions = async () => {
    if (!user?.id) {
      setLoadingSuggestions(false);
      return;
    }

    try {
      const campus = user.campus || user.campusOrCity;
      if (!campus) {
        setLoadingSuggestions(false);
        return;
      }

      const [campusUsers, currentFriends, outgoingRequests] = await Promise.all([
        getUsersByCampus(campus, 30),
        getUserFriends(user.id),
        getOutgoingFriendRequests(user.id),
      ]);

      const friendSet = new Set(currentFriends);
      const pendingSet = new Set(outgoingRequests.map((r: any) => r.toId));

      const suggestions = campusUsers
        .filter((u: any) => u.id !== user.id)
        .map((u: any) => ({
          id: u.id,
          name: u.name || 'Unknown',
          handle: u.handle,
          photoUrl: u.photoUrl,
          campus: u.campus || u.campusOrCity,
          isFriend: friendSet.has(u.id),
          isPending: pendingSet.has(u.id),
        }));

      setCampusSuggestions(suggestions);
    } catch (error) {
      console.error('Failed to load campus suggestions:', error);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || !user?.id) return;

    setSearching(true);
    setHasSearched(true);

    try {
      const query = searchQuery.trim();
      let foundUser: any = null;

      // Search by handle if starts with @ or doesn't look like email
      if (query.startsWith('@') || !query.includes('@')) {
        foundUser = await findUserByHandle(query.replace(/^@/, ''));
      }

      // If not found by handle and looks like email, search by email
      if (!foundUser && query.includes('@')) {
        foundUser = await findUserByEmail(query);
      }

      // If still not found and didn't start with @, try handle search
      if (!foundUser && !query.startsWith('@') && !query.includes('@')) {
        foundUser = await findUserByHandle(query);
      }

      if (foundUser && foundUser.id !== user.id) {
        const [currentFriends, outgoingRequests] = await Promise.all([
          getUserFriends(user.id),
          getOutgoingFriendRequests(user.id),
        ]);

        const friendSet = new Set(currentFriends);
        const pendingSet = new Set(outgoingRequests.map((r: any) => r.toId));

        setSearchResults([{
          id: foundUser.id,
          name: foundUser.name || 'Unknown',
          handle: foundUser.handle,
          photoUrl: foundUser.photoUrl,
          campus: foundUser.campus || foundUser.campusOrCity,
          isFriend: friendSet.has(foundUser.id),
          isPending: pendingSet.has(foundUser.id),
        }]);
      } else {
        setSearchResults([]);
      }

      void logEvent('friend_search', user.id, { query: query.includes('@') ? 'email' : 'handle' });
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [searchQuery, user?.id]);

  const handleSendRequest = async (targetUser: UserResult) => {
    if (!user?.id || targetUser.isFriend || targetUser.isPending) return;

    setSendingTo(targetUser.id);

    try {
      await sendFriendRequest(user.id, targetUser.id);

      // Update local state
      setSearchResults((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, isPending: true } : u))
      );
      setCampusSuggestions((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, isPending: true } : u))
      );

      void logEvent('friend_request_sent', user.id, { toUserId: targetUser.id, source: 'find_friends' });
    } catch (error) {
      console.error('Failed to send friend request:', error);
      Alert.alert('Error', 'Failed to send friend request. Please try again.');
    } finally {
      setSendingTo(null);
    }
  };

  const renderUserCard = (userResult: UserResult, index: number) => (
    <PolishedCard
      key={userResult.id}
      variant="elevated"
      animated
      delay={index * 50}
      pressable
      onPress={() => router.push(`/profile-view?userId=${userResult.id}`)}
      style={styles.userCard}
    >
      <View style={styles.userContent}>
        {/* Profile Photo */}
        {userResult.photoUrl ? (
          <SpotImage
            source={{ uri: userResult.photoUrl }}
            style={styles.userPhoto}
          />
        ) : (
          <View
            style={[
              styles.userPhoto,
              styles.photoPlaceholder,
              { backgroundColor: border },
            ]}
          >
            <Text style={{ fontSize: 24, color: text }}>
              {userResult.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}

        {/* User Info */}
        <View style={styles.userInfo}>
          <Text style={[styles.userName, { color: text }]} numberOfLines={1}>
            {userResult.name}
          </Text>

          {userResult.handle && (
            <Text style={[styles.userHandle, { color: muted }]} numberOfLines={1}>
              @{userResult.handle}
            </Text>
          )}

          {userResult.campus && (
            <View style={styles.metaRow}>
              <IconSymbol name="building.2.fill" size={12} color={muted} />
              <Text style={[styles.metaText, { color: muted }]} numberOfLines={1}>
                {userResult.campus}
              </Text>
            </View>
          )}
        </View>

        {/* Action Button */}
        {userResult.isFriend ? (
          <View style={[styles.statusBadge, { backgroundColor: withAlpha(success, 0.1) }]}>
            <IconSymbol name="checkmark.circle.fill" size={16} color={success} />
            <Text style={[styles.statusText, { color: success }]}>Friends</Text>
          </View>
        ) : userResult.isPending ? (
          <View style={[styles.statusBadge, { backgroundColor: withAlpha(muted, 0.1) }]}>
            <IconSymbol name="clock.fill" size={16} color={muted} />
            <Text style={[styles.statusText, { color: muted }]}>Pending</Text>
          </View>
        ) : (
          <Pressable
            onPress={() => handleSendRequest(userResult)}
            disabled={sendingTo === userResult.id}
            style={({ pressed }) => [
              styles.addButton,
              { backgroundColor: withAlpha(primary, 0.1), borderColor: primary },
              pressed && { opacity: 0.7 },
            ]}
          >
            {sendingTo === userResult.id ? (
              <ActivityIndicator size="small" color={primary} />
            ) : (
              <IconSymbol name="person.badge.plus" size={20} color={primary} />
            )}
          </Pressable>
        )}
      </View>
    </PolishedCard>
  );

  return (
    <ThemedView style={{ flex: 1 }}>
      <PolishedHeader
        title="Find Friends"
        leftIcon="chevron.left"
        onLeftPress={() => router.back()}
      />

      {/* Search Bar */}
      <View style={[styles.searchContainer, { borderBottomColor: border }]}>
        <View style={[styles.searchInputWrapper, { backgroundColor: card, borderColor: border }]}>
          <IconSymbol name="magnifyingglass" size={18} color={muted} />
          <TextInput
            style={[styles.searchInput, { color: text }]}
            placeholder="Search by @handle or email"
            placeholderTextColor={muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearch}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => { setSearchQuery(''); setSearchResults([]); setHasSearched(false); }}>
              <IconSymbol name="xmark.circle.fill" size={18} color={muted} />
            </Pressable>
          )}
        </View>
        <Pressable
          onPress={handleSearch}
          disabled={searching || !searchQuery.trim()}
          style={[
            styles.searchButton,
            { backgroundColor: primary },
            (!searchQuery.trim() || searching) && { opacity: 0.5 },
          ]}
        >
          {searching ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Text style={styles.searchButtonText}>Search</Text>
          )}
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Search Results */}
        {hasSearched && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: text }]}>Search Results</Text>
            {searchResults.length === 0 ? (
              <EmptyState
                icon="person.slash"
                title="No users found"
                description="Try searching with a different handle or email address."
              />
            ) : (
              searchResults.map((user, index) => renderUserCard(user, index))
            )}
          </View>
        )}

        {/* Campus Suggestions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: text }]}>
            {user?.campus || user?.campusOrCity ? `People at ${user.campus || user.campusOrCity}` : 'Suggestions'}
          </Text>

          {loadingSuggestions ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={primary} />
            </View>
          ) : campusSuggestions.length === 0 ? (
            <EmptyState
              icon="person.2"
              title="No suggestions yet"
              description="Search for friends by their handle or email above."
            />
          ) : (
            campusSuggestions.map((user, index) => renderUserCard(user, index))
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
  },
  searchInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 16,
  },
  searchButton: {
    paddingHorizontal: 20,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: tokens.type.h3.fontSize,
    fontWeight: '700',
    marginBottom: 16,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  userCard: {
    padding: 16,
    marginBottom: 12,
  },
  userContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userPhoto: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginRight: 12,
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: tokens.type.h4.fontSize,
    fontWeight: '700',
    marginBottom: 2,
  },
  userHandle: {
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
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
