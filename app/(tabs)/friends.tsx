import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/themed-view';
import SpotImage from '@/components/ui/spot-image';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useToast } from '@/contexts/ToastContext';
import { withAlpha } from '@/utils/colors';
import {
  searchUsers,
  sendFriendRequest,
  getUserFriendsCached,
  getUsersByCampus,
  getOutgoingFriendRequests,
  getIncomingFriendRequests,
  acceptFriendRequest,
  declineFriendRequest,
  getUsersByIdsCached,
  unfollowUserRemote,
} from '@/services/firebaseClient';
import { devLog } from '@/services/logger';

interface FriendUser {
  id: string;
  name: string;
  handle?: string;
  photoUrl?: string;
  campus?: string;
}

interface FriendRequest {
  id: string;
  fromId: string;
  toId: string;
  user?: FriendUser;
}

export default function FriendsScreen() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');
  const success = useThemeColor({}, 'success');
  const danger = useThemeColor({}, 'danger');

  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [incomingReqs, setIncomingReqs] = useState<FriendRequest[]>([]);
  const [outgoingIds, setOutgoingIds] = useState<Set<string>>(new Set());
  const [suggestions, setSuggestions] = useState<FriendUser[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FriendUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const isSearchActive = searchQuery.trim().length > 0;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const friendIdSetRef = useRef<Set<string>>(new Set());

  const markBusy = (id: string) =>
    setBusyIds((prev) => new Set(prev).add(id));
  const clearBusy = (id: string) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  /* ─── data loading ─── */

  const loadData = useCallback(
    async (silent = false) => {
      if (!user?.id) return;
      if (!silent) setLoading(true);

      try {
        const [friendIds, incoming, outgoing] = await Promise.all([
          getUserFriendsCached(user.id),
          getIncomingFriendRequests(user.id),
          getOutgoingFriendRequests(user.id),
        ]);

        const ids: string[] = friendIds || [];
        friendIdSetRef.current = new Set(ids);
        setOutgoingIds(new Set((outgoing || []).map((r: any) => r.toId)));

        const incomingFromIds = (incoming || []).map((r: any) => r.fromId);
        const allProfileIds = Array.from(new Set([...ids, ...incomingFromIds]));
        const profiles = allProfileIds.length ? await getUsersByIdsCached(allProfileIds) : [];
        const profileMap: Record<string, FriendUser> = {};
        (profiles || []).forEach((p: any) => {
          profileMap[p.id] = {
            id: p.id,
            name: p.name || 'Unknown',
            handle: p.handle,
            photoUrl: p.photoUrl,
            campus: p.campus || p.campusOrCity,
          };
        });

        setFriends(ids.map((id) => profileMap[id]).filter(Boolean));
        setIncomingReqs(
          (incoming || []).map((r: any) => ({
            id: r.id,
            fromId: r.fromId,
            toId: r.toId,
            user: profileMap[r.fromId],
          })),
        );

        const campus = user.campus || user.campusOrCity;
        if (campus) {
          const campusUsers = await getUsersByCampus(campus, 30);
          const outgoingSet = new Set((outgoing || []).map((r: any) => r.toId));
          const filtered = campusUsers
            .filter(
              (u: any) =>
                u.id !== user.id &&
                !friendIdSetRef.current.has(u.id) &&
                !outgoingSet.has(u.id),
            )
            .slice(0, 10)
            .map((u: any) => ({
              id: u.id,
              name: u.name || 'Unknown',
              handle: u.handle,
              photoUrl: u.photoUrl,
              campus: u.campus || u.campusOrCity,
            }));
          setSuggestions(filtered);
        }
      } catch (err) {
        devLog('friends load error', err);
        if (!silent) showToast('Failed to load friends', 'error');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.id, user?.campus, user?.campusOrCity],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void loadData(true);
  }, [loadData]);

  /* ─── debounced search ─── */

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchUsers(q, 15);
        setSearchResults(
          results
            .filter((u: any) => u.id !== user?.id)
            .map((u: any) => ({
              id: u.id,
              name: u.name || 'Unknown',
              handle: u.handle,
              photoUrl: u.photoUrl,
              campus: u.campus || u.campusOrCity,
            })),
        );
      } catch (err) {
        devLog('friend search error', err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, user?.id]);

  /* ─── actions ─── */

  const handleAccept = async (req: FriendRequest) => {
    markBusy(req.id);
    setIncomingReqs((prev) => prev.filter((r) => r.id !== req.id));
    if (req.user) setFriends((prev) => [req.user!, ...prev]);

    try {
      await acceptFriendRequest(req.id, req.fromId, req.toId);
      friendIdSetRef.current.add(req.fromId);
      showToast('Friend request accepted', 'success');
    } catch {
      setIncomingReqs((prev) => [req, ...prev]);
      if (req.user) setFriends((prev) => prev.filter((f) => f.id !== req.user!.id));
      showToast('Could not accept request', 'error');
    } finally {
      clearBusy(req.id);
    }
  };

  const handleDecline = async (req: FriendRequest) => {
    markBusy(req.id);
    setIncomingReqs((prev) => prev.filter((r) => r.id !== req.id));
    try {
      await declineFriendRequest(req.id);
    } catch {
      setIncomingReqs((prev) => [req, ...prev]);
      showToast('Could not decline request', 'error');
    } finally {
      clearBusy(req.id);
    }
  };

  const handleSendRequest = async (target: FriendUser) => {
    if (!user?.id) return;
    markBusy(target.id);
    setOutgoingIds((prev) => new Set(prev).add(target.id));
    try {
      await sendFriendRequest(user.id, target.id);
      showToast('Friend request sent', 'success');
    } catch {
      setOutgoingIds((prev) => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
      showToast('Could not send request', 'error');
    } finally {
      clearBusy(target.id);
    }
  };

  const handleRemoveFriend = (friend: FriendUser) => {
    if (!user?.id) return;
    Alert.alert('Remove Friend', `Remove ${friend.name} from your friends?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          markBusy(friend.id);
          setFriends((prev) => prev.filter((f) => f.id !== friend.id));
          friendIdSetRef.current.delete(friend.id);
          try {
            await unfollowUserRemote(user.id, friend.id);
            showToast('Friend removed', 'info');
          } catch {
            setFriends((prev) => [...prev, friend]);
            friendIdSetRef.current.add(friend.id);
            showToast('Could not remove friend', 'error');
          } finally {
            clearBusy(friend.id);
          }
        },
      },
    ]);
  };

  const handleSyncContacts = async () => {
    try {
      const req: any = eval('require');
      const Contacts = req('expo-contacts');
      if (!Contacts?.requestPermissionsAsync) {
        showToast('Contacts unavailable on this build', 'error');
        return;
      }
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        showToast('Contacts permission denied', 'error');
        return;
      }
      const fields = [Contacts.Fields.Emails];
      if (Contacts.Fields.PhoneNumbers) fields.push(Contacts.Fields.PhoneNumbers);
      const { data } = await Contacts.getContactsAsync({ fields });
      const emails: string[] = (data || [])
        .flatMap((c: any) => (c.emails || []).map((e: any) => e.email))
        .filter((v: any): v is string => typeof v === 'string' && v.includes('@'));
      const unique = Array.from(new Set(emails)).slice(0, 30);
      if (unique.length === 0) {
        showToast('No email contacts found', 'info');
        return;
      }
      const matched = new Map<string, FriendUser>();
      await Promise.all(
        unique.map(async (email) => {
          try {
            const results = await searchUsers(email, 3);
            results.forEach((u: any) => {
              if (u.id !== user?.id && !matched.has(u.id)) {
                matched.set(u.id, {
                  id: u.id,
                  name: u.name || 'Unknown',
                  handle: u.handle,
                  photoUrl: u.photoUrl,
                  campus: u.campus || u.campusOrCity,
                });
              }
            });
          } catch {}
        }),
      );
      if (matched.size === 0) {
        showToast('No matches found in contacts', 'info');
      } else {
        setSearchResults(Array.from(matched.values()));
        setSearchQuery('Contacts');
        showToast(`Found ${matched.size} contact(s) on Perched`, 'success');
      }
    } catch (err) {
      devLog('contacts sync failed', err);
      showToast('Unable to sync contacts', 'error');
    }
  };

  const navigateToProfile = (userId: string) => {
    router.push(`/profile-view?uid=${encodeURIComponent(userId)}`);
  };

  const getRelation = (id: string): 'friend' | 'pending' | 'incoming' | null => {
    if (friendIdSetRef.current.has(id)) return 'friend';
    if (outgoingIds.has(id)) return 'pending';
    if (incomingReqs.some((r) => r.fromId === id)) return 'incoming';
    return null;
  };

  /* ─── render helpers ─── */

  const renderAvatar = (u: FriendUser, size = 48) => {
    if (u.photoUrl) {
      return (
        <SpotImage
          source={{ uri: u.photoUrl }}
          style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}
        />
      );
    }
    return (
      <View
        style={[
          styles.avatar,
          styles.avatarPlaceholder,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: withAlpha(primary, 0.12) },
        ]}
      >
        <Text style={{ fontSize: size * 0.42, fontWeight: '700', color: primary }}>
          {(u.name || '?').charAt(0).toUpperCase()}
        </Text>
      </View>
    );
  };

  const renderRequestRow = (req: FriendRequest) => {
    const u = req.user || { id: req.fromId, name: 'Unknown' };
    const busy = busyIds.has(req.id);
    return (
      <View key={req.id} style={[styles.row, { borderBottomColor: border }]}>
        <Pressable style={styles.rowLeft} onPress={() => navigateToProfile(u.id)}>
          {renderAvatar(u, 48)}
          <View style={styles.rowInfo}>
            <Text style={[styles.rowName, { color: text }]} numberOfLines={1}>{u.name}</Text>
            {u.handle ? <Text style={[styles.rowHandle, { color: muted }]} numberOfLines={1}>@{u.handle}</Text> : null}
          </View>
        </Pressable>
        <View style={styles.requestActions}>
          <Pressable
            disabled={busy}
            onPress={() => handleAccept(req)}
            style={({ pressed }) => [styles.actionBtn, { backgroundColor: success }, pressed && { opacity: 0.7 }]}
          >
            <IconSymbol name="checkmark.circle.fill" size={18} color="#FFF" />
          </Pressable>
          <Pressable
            disabled={busy}
            onPress={() => handleDecline(req)}
            style={({ pressed }) => [styles.actionBtn, { backgroundColor: danger }, pressed && { opacity: 0.7 }]}
          >
            <IconSymbol name="xmark.circle.fill" size={18} color="#FFF" />
          </Pressable>
        </View>
      </View>
    );
  };

  const renderFriendRow = ({ item }: { item: FriendUser }) => (
    <Pressable
      style={[styles.row, { borderBottomColor: border }]}
      onPress={() => navigateToProfile(item.id)}
      onLongPress={() => handleRemoveFriend(item)}
    >
      <View style={styles.rowLeft}>
        {renderAvatar(item, 48)}
        <View style={styles.rowInfo}>
          <Text style={[styles.rowName, { color: text }]} numberOfLines={1}>{item.name}</Text>
          {item.handle ? <Text style={[styles.rowHandle, { color: muted }]} numberOfLines={1}>@{item.handle}</Text> : null}
          {item.campus ? <Text style={[styles.rowCampus, { color: muted }]} numberOfLines={1}>{item.campus}</Text> : null}
        </View>
      </View>
    </Pressable>
  );

  const renderSearchRow = ({ item }: { item: FriendUser }) => {
    const relation = getRelation(item.id);
    const busy = busyIds.has(item.id);
    return (
      <Pressable style={[styles.row, { borderBottomColor: border }]} onPress={() => navigateToProfile(item.id)}>
        <View style={styles.rowLeft}>
          {renderAvatar(item, 48)}
          <View style={styles.rowInfo}>
            <Text style={[styles.rowName, { color: text }]} numberOfLines={1}>{item.name}</Text>
            {item.handle ? <Text style={[styles.rowHandle, { color: muted }]} numberOfLines={1}>@{item.handle}</Text> : null}
            {item.campus ? <Text style={[styles.rowCampus, { color: muted }]} numberOfLines={1}>{item.campus}</Text> : null}
          </View>
        </View>
        {relation === 'friend' ? (
          <View style={[styles.badge, { backgroundColor: withAlpha(success, 0.12) }]}>
            <Text style={[styles.badgeText, { color: success }]}>Friends</Text>
          </View>
        ) : relation === 'pending' ? (
          <View style={[styles.badge, { backgroundColor: withAlpha(muted, 0.12) }]}>
            <Text style={[styles.badgeText, { color: muted }]}>Pending</Text>
          </View>
        ) : busy ? (
          <ActivityIndicator size="small" color={primary} />
        ) : (
          <Pressable
            onPress={() => handleSendRequest(item)}
            style={({ pressed }) => [
              styles.addBtn,
              { backgroundColor: withAlpha(primary, 0.1), borderColor: primary },
              pressed && { opacity: 0.7 },
            ]}
          >
            <IconSymbol name="person.badge.plus" size={18} color={primary} />
          </Pressable>
        )}
      </Pressable>
    );
  };

  const renderSuggestionRow = (item: FriendUser) => {
    const relation = getRelation(item.id);
    const busy = busyIds.has(item.id);
    return (
      <View key={item.id} style={[styles.row, { borderBottomColor: border }]}>
        <Pressable style={styles.rowLeft} onPress={() => navigateToProfile(item.id)}>
          {renderAvatar(item, 44)}
          <View style={styles.rowInfo}>
            <Text style={[styles.rowName, { color: text }]} numberOfLines={1}>{item.name}</Text>
            {item.handle ? <Text style={[styles.rowHandle, { color: muted }]} numberOfLines={1}>@{item.handle}</Text> : null}
          </View>
        </Pressable>
        {relation === 'friend' ? (
          <View style={[styles.badge, { backgroundColor: withAlpha(success, 0.12) }]}>
            <Text style={[styles.badgeText, { color: success }]}>Friends</Text>
          </View>
        ) : relation === 'pending' ? (
          <View style={[styles.badge, { backgroundColor: withAlpha(muted, 0.12) }]}>
            <Text style={[styles.badgeText, { color: muted }]}>Sent</Text>
          </View>
        ) : busy ? (
          <ActivityIndicator size="small" color={primary} />
        ) : (
          <Pressable
            onPress={() => handleSendRequest(item)}
            style={({ pressed }) => [
              styles.addBtn,
              { backgroundColor: withAlpha(primary, 0.1), borderColor: primary },
              pressed && { opacity: 0.7 },
            ]}
          >
            <IconSymbol name="person.badge.plus" size={18} color={primary} />
          </Pressable>
        )}
      </View>
    );
  };

  /* ─── list header / footer / empty ─── */

  const ListHeader = () => (
    <View>
      <View style={[styles.searchBar, { backgroundColor: card, borderBottomColor: border }]}>
        <View style={[styles.searchField, { backgroundColor: withAlpha(muted, 0.08), borderColor: border }]}>
          <IconSymbol name="magnifyingglass" size={16} color={muted} />
          <TextInput
            style={[styles.searchInput, { color: text }]}
            placeholder="Search name, @handle, or email..."
            placeholderTextColor={muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => { setSearchQuery(''); setSearchResults([]); }} hitSlop={8}>
              <IconSymbol name="xmark.circle.fill" size={16} color={muted} />
            </Pressable>
          )}
        </View>
        <Pressable onPress={handleSyncContacts} style={styles.syncBtn} hitSlop={6}>
          <IconSymbol name="phone.fill" size={18} color={primary} />
        </Pressable>
      </View>

      {!isSearchActive && incomingReqs.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: text }]}>
              Friend Requests ({incomingReqs.length})
            </Text>
          </View>
          {incomingReqs.map(renderRequestRow)}
        </View>
      )}

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: text }]}>
          {isSearchActive
            ? 'Search Results'
            : `My Friends${friends.length > 0 ? ` (${friends.length})` : ''}`}
        </Text>
        {isSearching && <ActivityIndicator size="small" color={primary} style={{ marginLeft: 8 }} />}
      </View>
    </View>
  );

  const ListFooter = () => {
    if (isSearchActive || suggestions.length === 0) return null;
    return (
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: text }]}>
            Suggested{user?.campus ? ` at ${user.campus}` : ''}
          </Text>
        </View>
        {suggestions.map(renderSuggestionRow)}
      </View>
    );
  };

  const ListEmpty = () => {
    if (loading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={primary} />
        </View>
      );
    }
    if (isSearchActive && !isSearching) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyTitle, { color: text }]}>No results</Text>
          <Text style={[styles.emptyDesc, { color: muted }]}>Try a different name, @handle, or email.</Text>
        </View>
      );
    }
    if (!isSearchActive) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyTitle, { color: text }]}>No friends yet</Text>
          <Text style={[styles.emptyDesc, { color: muted }]}>
            Search above or sync your contacts to find people you know.
          </Text>
        </View>
      );
    }
    return null;
  };

  const listData = isSearchActive ? searchResults : friends;

  return (
    <ThemedView style={{ flex: 1 }}>
      <FlatList
        data={listData}
        keyExtractor={(item) => item.id}
        renderItem={isSearchActive ? renderSearchRow : renderFriendRow}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        ListEmptyComponent={ListEmpty}
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshing={refreshing}
        onRefresh={handleRefresh}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    borderRadius: 10,
    paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    height: 40,
    paddingVertical: 0,
  },
  syncBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { marginTop: 4 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  avatar: { marginRight: 12 },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '600' },
  rowHandle: { fontSize: 13, marginTop: 1 },
  rowCampus: { fontSize: 12, marginTop: 2 },
  requestActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  badgeText: { fontSize: 12, fontWeight: '600' },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
    gap: 8,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginTop: 8 },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
