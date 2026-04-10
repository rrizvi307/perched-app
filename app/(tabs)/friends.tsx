import React, { useState, useCallback, useEffect, useRef } from 'react';
import * as Contacts from 'expo-contacts';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '@/constants/tokens';
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
  getSocialGraphSnapshotSecure,
  getUserFriendsCached,
  getUsersByCampus,
  getOutgoingFriendRequests,
  findUserByEmail,
  findUserByPhone,
  getIncomingFriendRequests,
  acceptFriendRequest,
  declineFriendRequest,
  getUsersByIdsCached,
  unfollowUserRemote,
  getBlockedUsers,
} from '@/services/firebaseClient';
import { didFriendRequestResolveToFriendship } from '@/services/friendship';
import { devLog } from '@/services/logger';
import { useFocusEffect } from '@react-navigation/native';

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

interface ContactEntry {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  matchedUser?: FriendUser | null;
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
  const [outgoingReqs, setOutgoingReqs] = useState<FriendRequest[]>([]);
  const [outgoingIds, setOutgoingIds] = useState<Set<string>>(new Set());
  const [suggestions, setSuggestions] = useState<FriendUser[]>([]);
  const [contactEntries, setContactEntries] = useState<ContactEntry[]>([]);
  const [contactsExpanded, setContactsExpanded] = useState(false);
  const [syncingContacts, setSyncingContacts] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FriendUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const isSearchActive = searchQuery.trim().length > 0;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const friendIdSetRef = useRef<Set<string>>(new Set());
  const blockedIdSetRef = useRef<Set<string>>(new Set());

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
        // Load blocked users to filter them out of all lists.
        try {
          const blocked = await getBlockedUsers(user.id);
          blockedIdSetRef.current = new Set(blocked);
        } catch {}
        const isBlocked = (id: string) => blockedIdSetRef.current.has(id);

        const campus = user.campus || user.campusOrCity;
        const secureSnapshot = await getSocialGraphSnapshotSecure(campus, 10);
        if (secureSnapshot) {
          const secureFriendIds = secureSnapshot.friends || [];
          const secureIncoming = secureSnapshot.incomingRequests || [];
          const secureOutgoing = secureSnapshot.outgoingRequests || [];
          const profileMap: Record<string, FriendUser> = {};

          (secureSnapshot.users || []).forEach((profile: any) => {
            if (!profile?.id) return;
            profileMap[profile.id] = {
              id: profile.id,
              name: profile.name || 'Unknown',
              handle: profile.handle,
              photoUrl: profile.photoUrl || profile.avatarUrl,
              campus: profile.campus || profile.campusOrCity,
            };
          });

          friendIdSetRef.current = new Set(secureFriendIds);
          setOutgoingIds(new Set(secureOutgoing.map((request: any) => request.toId)));
          setFriends(secureFriendIds.map((id) => profileMap[id]).filter((f) => f && !isBlocked(f.id)));
          setIncomingReqs(
            secureIncoming
              .filter((request: any) => !isBlocked(request.fromId))
              .map((request: any) => ({
                id: request.id,
                fromId: request.fromId,
                toId: request.toId,
                user: profileMap[request.fromId],
              })),
          );
          setOutgoingReqs(
            secureOutgoing.map((request: any) => ({
              id: request.id,
              fromId: request.fromId,
              toId: request.toId,
              user: profileMap[request.toId],
            })),
          );
          setSuggestions(
            (secureSnapshot.suggestions || [])
              .filter((profile: any) => !isBlocked(profile.id))
              .map((profile: any) => ({
                id: profile.id,
                name: profile.name || 'Unknown',
                handle: profile.handle,
                photoUrl: profile.photoUrl || profile.avatarUrl,
                campus: profile.campus || profile.campusOrCity,
              })),
          );
          return;
        }

        const [friendIds, incoming, outgoing] = await Promise.all([
          getUserFriendsCached(user.id),
          getIncomingFriendRequests(user.id),
          getOutgoingFriendRequests(user.id),
        ]);

        const ids: string[] = friendIds || [];
        friendIdSetRef.current = new Set(ids);
        setOutgoingIds(new Set((outgoing || []).map((r: any) => r.toId)));

        const incomingFromIds = (incoming || []).map((r: any) => r.fromId);
        const outgoingToIds = (outgoing || []).map((r: any) => r.toId);
        const allProfileIds = Array.from(new Set([...ids, ...incomingFromIds, ...outgoingToIds]));
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
        setOutgoingReqs(
          (outgoing || []).map((r: any) => ({
            id: r.id,
            fromId: r.fromId,
            toId: r.toId,
            user: profileMap[r.toId],
          })),
        );

        if (campus) {
          try {
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
          } catch (error) {
            devLog('friends suggestions load error', error);
            setSuggestions([]);
          }
        } else {
          setSuggestions([]);
        }
      } catch (err) {
        devLog('friends load error', err);
        if (!silent) showToast('Failed to load friends', 'error');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [showToast, user?.id, user?.campus, user?.campusOrCity],
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return undefined;
      void loadData(true);
      return undefined;
    }, [loadData, user?.id]),
  );

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
    try {
      const result = await sendFriendRequest(user.id, target.id);
      if (didFriendRequestResolveToFriendship(result)) {
        friendIdSetRef.current.add(target.id);
        setOutgoingIds((prev) => {
          const next = new Set(prev);
          next.delete(target.id);
          return next;
        });
        setOutgoingReqs((prev) => prev.filter((request) => request.toId !== target.id));
        setIncomingReqs((prev) => prev.filter((request) => request.fromId !== target.id));
        setFriends((prev) => (prev.some((friend) => friend.id === target.id) ? prev : [target, ...prev]));
        setSuggestions((prev) => prev.filter((entry) => entry.id !== target.id));
        showToast(result?.alreadyFriends ? 'Already friends' : 'You are now friends', 'success');
        return;
      }

      setOutgoingIds((prev) => new Set(prev).add(target.id));
      setOutgoingReqs((prev) => (
        prev.some((request) => request.toId === target.id)
          ? prev
          : [{ id: result?.id || `${user.id}_${target.id}`, fromId: user.id, toId: target.id, user: target }, ...prev]
      ));
      setSuggestions((prev) => prev.filter((entry) => entry.id !== target.id));
      showToast('Friend request sent', 'success');
    } catch (err: any) {
      const msg = err?.message || 'Could not send request';
      showToast(msg.length > 80 ? 'Could not send request' : msg, 'error');
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
    const toDigits = (value: string) => String(value || '').replace(/\D/g, '');
    const toFriendUser = (u: any): FriendUser => ({
      id: u.id,
      name: u.name || 'Unknown',
      handle: u.handle,
      photoUrl: u.photoUrl,
      campus: u.campus || u.campusOrCity,
    });
    try {
      setSyncingContacts(true);
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        showToast('Contacts permission denied. Enable it in Settings.', 'error');
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers],
      });
      const contacts = (data || [])
        .map((contact: any, index: number) => {
          const phones = Array.isArray(contact?.phoneNumbers)
            ? contact.phoneNumbers
                .map((p: any) => (typeof p?.number === 'string' ? p.number.trim() : ''))
                .filter(Boolean)
            : [];
          const emails = Array.isArray(contact?.emails)
            ? contact.emails
                .map((e: any) => (typeof e?.email === 'string' ? e.email.trim().toLowerCase() : ''))
                .filter((value: string) => value.includes('@'))
            : [];
          const name = (contact?.name || '').trim() || (emails[0]?.split('@')?.[0] || phones[0] || `Contact ${index + 1}`);
          return {
            id: String(contact?.id || `contact-${index}`),
            name,
            phones,
            emails,
          };
        })
        .filter((contact: any) => contact.name || contact.phones.length > 0 || contact.emails.length > 0);

      if (!contacts.length) {
        setContactEntries([]);
        showToast('No contacts found on this device.', 'info');
        return;
      }

      const uniqueEmails = Array.from(new Set(contacts.flatMap((c: any) => c.emails))).slice(0, 300);
      const uniquePhones = Array.from(new Set(contacts.flatMap((c: any) => c.phones.map((p: string) => toDigits(p)).filter(Boolean)))).slice(0, 300);

      const emailMatchMap = new Map<string, FriendUser>();
      const phoneMatchMap = new Map<string, FriendUser>();

      await Promise.all(
        uniqueEmails.map(async (email) => {
          try {
            const found = await findUserByEmail(email);
            if (found?.id && found.id !== user?.id) {
              emailMatchMap.set(email, toFriendUser(found));
            }
          } catch {}
        })
      );
      await Promise.all(
        uniquePhones.map(async (phoneDigits) => {
          try {
            const found = await findUserByPhone(phoneDigits);
            if (found?.id && found.id !== user?.id) {
              phoneMatchMap.set(phoneDigits, toFriendUser(found));
            }
          } catch {}
        })
      );

      const entries: ContactEntry[] = contacts.map((contact: any, index: number) => {
        const firstMatchedEmail = contact.emails.find((email: string) => emailMatchMap.has(email));
        const firstMatchedPhone = contact.phones
          .map((phone: string) => toDigits(phone))
          .find((digits: string) => phoneMatchMap.has(digits));
        const matchedUser = firstMatchedEmail
          ? emailMatchMap.get(firstMatchedEmail) || null
          : firstMatchedPhone
            ? phoneMatchMap.get(firstMatchedPhone) || null
            : null;
        return {
          id: `${contact.id}-${index}`,
          name: contact.name,
          phone: contact.phones[0] || undefined,
          email: contact.emails[0] || undefined,
          matchedUser,
        };
      });

      entries.sort((a, b) => {
        const aMatched = !!a.matchedUser;
        const bMatched = !!b.matchedUser;
        if (aMatched !== bMatched) return aMatched ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      setContactEntries(entries);
      setContactsExpanded(false);
      const matchedCount = entries.filter((entry) => !!entry.matchedUser).length;
      const inviteCount = entries.length - matchedCount;
      showToast(`Synced ${entries.length} contacts • ${matchedCount} on Perched • ${inviteCount} to invite`, 'success');
    } catch (err) {
      devLog('contacts sync failed', err);
      showToast('Unable to access contacts', 'error');
    } finally {
      setSyncingContacts(false);
    }
  };

  const handleInviteContact = async (contact: ContactEntry) => {
    markBusy(contact.id);
    try {
      const mention = contact.name ? `${contact.name}, ` : '';
      const message = `${mention}join me on Perched to share coffee spots and check-ins.\nDownload: https://perched.app`;
      await Share.share({ message });
      showToast('Invite sheet opened.', 'success');
    } catch {
      showToast('Unable to open invite right now.', 'warning');
    } finally {
      clearBusy(contact.id);
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
      <View style={[styles.row, { borderBottomColor: border }]}>
        <Pressable style={styles.rowLeft} onPress={() => navigateToProfile(item.id)}>
          {renderAvatar(item, 48)}
          <View style={styles.rowInfo}>
            <Text style={[styles.rowName, { color: text }]} numberOfLines={1}>{item.name}</Text>
            {item.handle ? <Text style={[styles.rowHandle, { color: muted }]} numberOfLines={1}>@{item.handle}</Text> : null}
            {item.campus ? <Text style={[styles.rowCampus, { color: muted }]} numberOfLines={1}>{item.campus}</Text> : null}
          </View>
        </Pressable>
        {relation === 'friend' ? (
          <View style={[styles.badge, { backgroundColor: withAlpha(success, 0.12) }]}>
            <Text style={[styles.badgeText, { color: success }]}>Friends</Text>
          </View>
        ) : relation === 'pending' ? (
          <View style={[styles.badge, { backgroundColor: withAlpha(muted, 0.12) }]}>
            <Text style={[styles.badgeText, { color: muted }]}>Pending</Text>
          </View>
        ) : relation === 'incoming' ? (
          <View style={[styles.badge, { backgroundColor: withAlpha(primary, 0.12) }]}>
            <Text style={[styles.badgeText, { color: primary }]}>Requested you</Text>
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
        ) : relation === 'incoming' ? (
          <View style={[styles.badge, { backgroundColor: withAlpha(primary, 0.12) }]}>
            <Text style={[styles.badgeText, { color: primary }]}>Requested you</Text>
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

  const renderContactRow = (entry: ContactEntry) => {
    const matched = entry.matchedUser || null;
    const relation = matched ? getRelation(matched.id) : null;
    const busy = busyIds.has(entry.id) || (matched ? busyIds.has(matched.id) : false);

    return (
      <View key={entry.id} style={[styles.row, { borderBottomColor: border }]}>
        {matched ? (
          <Pressable style={styles.rowLeft} onPress={() => navigateToProfile(matched.id)}>
            {renderAvatar(matched, 44)}
            <View style={styles.rowInfo}>
              <Text style={[styles.rowName, { color: text }]} numberOfLines={1}>{entry.name}</Text>
              <Text style={[styles.rowHandle, { color: muted }]} numberOfLines={1}>
                @{matched.handle || matched.name}
              </Text>
            </View>
          </Pressable>
        ) : (
          <View style={styles.rowLeft}>
            <View style={[styles.avatar, styles.avatarPlaceholder, { width: 44, height: 44, borderRadius: 22, backgroundColor: withAlpha(primary, 0.12) }]}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: primary }}>
                {(entry.name || '?').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.rowInfo}>
              <Text style={[styles.rowName, { color: text }]} numberOfLines={1}>{entry.name}</Text>
              <Text style={[styles.rowHandle, { color: muted }]} numberOfLines={1}>
                {entry.phone || entry.email || 'Invite to Perched'}
              </Text>
            </View>
          </View>
        )}

        {matched ? (
          relation === 'friend' ? (
            <View style={[styles.badge, { backgroundColor: withAlpha(success, 0.12) }]}>
              <Text style={[styles.badgeText, { color: success }]}>Friends</Text>
            </View>
          ) : relation === 'pending' ? (
            <View style={[styles.badge, { backgroundColor: withAlpha(muted, 0.12) }]}>
              <Text style={[styles.badgeText, { color: muted }]}>Pending</Text>
            </View>
          ) : relation === 'incoming' ? (
            <View style={[styles.badge, { backgroundColor: withAlpha(primary, 0.12) }]}>
              <Text style={[styles.badgeText, { color: primary }]}>Requested you</Text>
            </View>
          ) : busy ? (
            <ActivityIndicator size="small" color={primary} />
          ) : (
            <Pressable
              onPress={() => handleSendRequest(matched)}
              style={({ pressed }) => [
                styles.addBtn,
                { backgroundColor: withAlpha(primary, 0.1), borderColor: primary },
                pressed && { opacity: 0.7 },
              ]}
            >
              <IconSymbol name="person.badge.plus" size={18} color={primary} />
            </Pressable>
          )
        ) : (
          <Pressable
            disabled={busy}
            onPress={() => handleInviteContact(entry)}
            style={({ pressed }) => [
              styles.inviteBtn,
              { borderColor: primary, backgroundColor: withAlpha(primary, 0.08) },
              (busy || pressed) ? { opacity: 0.7 } : null,
            ]}
          >
            {busy ? <ActivityIndicator size="small" color={primary} /> : <Text style={{ color: primary, fontWeight: '700' }}>Invite</Text>}
          </Pressable>
        )}
      </View>
    );
  };

  /* ─── list header / footer / empty ─── */

  const ListHeader = () => (
    <View>
      {!isSearchActive && outgoingReqs.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: text }]}>
              Pending Sent ({outgoingReqs.length})
            </Text>
          </View>
          <View style={styles.pendingChipRow}>
            {outgoingReqs.slice(0, 4).map((req) => {
              const target = req.user || { id: req.toId, name: 'Pending user' };
              return (
                <Pressable
                  key={req.id}
                  onPress={() => navigateToProfile(target.id)}
                  style={[styles.pendingChip, { borderColor: border, backgroundColor: card }]}
                >
                  {renderAvatar(target, 28)}
                  <Text style={{ color: text, fontWeight: '600', maxWidth: 120 }} numberOfLines={1}>
                    {target.name}
                  </Text>
                  <Text style={{ color: muted, fontSize: 12 }}>Pending</Text>
                </Pressable>
              );
            })}
            {outgoingReqs.length > 4 ? (
              <View style={[styles.pendingChipMore, { borderColor: border }]}>
                <Text style={{ color: muted, fontWeight: '700' }}>+{outgoingReqs.length - 4}</Text>
              </View>
            ) : null}
          </View>
        </View>
      )}

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
    if (isSearchActive) return null;
    const matchedContacts = contactEntries.filter((entry) => !!entry.matchedUser).length;
    const visibleContacts = contactsExpanded ? contactEntries : contactEntries.slice(0, 12);

    const hasSuggestions = suggestions.length > 0;
    const hasContacts = contactEntries.length > 0;
    if (!hasSuggestions && !hasContacts) return null;

    return (
      <View>
        {hasSuggestions ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: text }]}>
                Suggested{user?.campus ? ` at ${user.campus}` : ''}
              </Text>
            </View>
            {suggestions.map(renderSuggestionRow)}
          </View>
        ) : null}

        {hasContacts ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: text }]}>Contacts ({contactEntries.length})</Text>
              {syncingContacts ? <ActivityIndicator size="small" color={primary} /> : null}
            </View>
            <Text style={[styles.contactsMeta, { color: muted }]}>
              {matchedContacts} on Perched • {contactEntries.length - matchedContacts} to invite
            </Text>
            {visibleContacts.map(renderContactRow)}
            {contactEntries.length > 12 ? (
              <Pressable
                onPress={() => setContactsExpanded((prev) => !prev)}
                style={({ pressed }) => [
                  styles.showMoreBtn,
                  { borderColor: border, backgroundColor: pressed ? withAlpha(primary, 0.08) : card },
                ]}
              >
                <Text style={{ color: primary, fontWeight: '700' }}>
                  {contactsExpanded ? 'Show less contacts' : `Show all contacts (${contactEntries.length})`}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
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
      <FlatList
        data={listData}
        keyExtractor={(item) => item.id}
        renderItem={isSearchActive ? renderSearchRow : renderFriendRow}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={ListFooter}
        ListEmptyComponent={ListEmpty}
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="none"
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
    paddingHorizontal: tokens.space.s16,
    paddingVertical: tokens.space.s10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: tokens.space.s10,
  },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    borderRadius: tokens.radius.r10,
    paddingHorizontal: tokens.space.s10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: tokens.space.s6,
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
  section: { marginTop: tokens.space.s4 },
  pendingChipRow: {
    paddingHorizontal: tokens.space.s16,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.space.s8,
  },
  pendingChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.r16,
    paddingVertical: tokens.space.s8,
    paddingHorizontal: tokens.space.s10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.s8,
  },
  pendingChipMore: {
    minWidth: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.s6,
    paddingHorizontal: tokens.space.s16,
    paddingTop: tokens.space.s14,
    paddingBottom: tokens.space.s6,
  },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  contactsMeta: {
    fontSize: 12,
    paddingHorizontal: tokens.space.s16,
    paddingBottom: tokens.space.s6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: tokens.space.s16,
    paddingVertical: tokens.space.s10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  avatar: { marginRight: tokens.space.s12 },
  avatarPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '600' },
  rowHandle: { fontSize: 13, marginTop: 1 },
  rowCampus: { fontSize: 12, marginTop: tokens.space.s2 },
  requestActions: { flexDirection: 'row', gap: tokens.space.s8 },
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
  inviteBtn: {
    minWidth: 84,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    paddingHorizontal: tokens.space.s12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.s4,
    paddingHorizontal: tokens.space.s10,
    paddingVertical: tokens.space.s6,
    borderRadius: tokens.radius.r14,
  },
  badgeText: { fontSize: 12, fontWeight: '600' },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: tokens.space.s60,
    paddingHorizontal: tokens.space.s32,
    gap: tokens.space.s8,
  },
  showMoreBtn: {
    marginHorizontal: tokens.space.s16,
    marginTop: tokens.space.s10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: tokens.radius.r12,
    paddingVertical: tokens.space.s10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginTop: tokens.space.s8 },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
