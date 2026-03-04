import { ThemedView } from '@/components/themed-view';
import { Atmosphere } from '@/components/ui/atmosphere';
import SpotImage from '@/components/ui/spot-image';
import { SkeletonLoader } from '@/components/ui/skeleton-loader';
import { Body, H1, Label } from '@/components/ui/typography';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import {
  getCheckinsForUserRemote,
  getIncomingFriendRequests,
  getOutgoingFriendRequests,
  getUserFriendsCached,
  getUsersByIds,
  sendFriendRequest,
  findUserByHandle,
} from '@/services/firebaseClient';
import { formatCheckinClock, toMillis } from '@/services/checkinUtils';
import { resolvePhotoUri } from '@/services/photoSources';
import { getCheckins } from '@/storage/local';
import { gapStyle } from '@/utils/layout';
import { withAlpha } from '@/utils/colors';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

function createdAtMs(value: any) {
  return toMillis(value?.createdAt) || toMillis(value?.timestamp) || 0;
}

function dayKey(value: any) {
  const ms = toMillis(value?.createdAt) || toMillis(value?.timestamp) || 0;
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function mergeUniqueCheckins(existing: any[], incoming: any[]) {
  // Keep one canonical record per check-in so local + remote hydration
  // never duplicates a user's history on profile pages.
  const map = new Map<string, any>();
  const keyFor = (item: any) => {
    if (item?.id) return `id:${item.id}`;
    if (item?.clientId) return `client:${item.clientId}`;
    return `sig:${item?.userId || 'anon'}:${item?.spotPlaceId || item?.spotName || item?.spot || 'spot'}:${createdAtMs(item)}`;
  };
  const upsert = (item: any) => {
    const key = keyFor(item);
    const prev = map.get(key);
    if (!prev || createdAtMs(item) >= createdAtMs(prev)) {
      map.set(key, item);
    }
  };
  existing.forEach(upsert);
  incoming.forEach(upsert);
  return Array.from(map.values()).sort((a, b) => createdAtMs(b) - createdAtMs(a));
}

export default function ProfileView() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');
  const primary = useThemeColor({}, 'primary');

  const uidParam = typeof params.uid === 'string' ? params.uid : '';
  const userIdParam = typeof params.userId === 'string' ? params.userId : '';
  const uid = uidParam || userIdParam;
  const handle = typeof params.handle === 'string' ? params.handle.replace(/^@/, '') : '';

  const [profile, setProfile] = useState<any | null>(null);
  const [checkins, setCheckins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [relationship, setRelationship] = useState<'none' | 'friend' | 'outgoing' | 'incoming'>('none');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        if (uid) {
          const res = await getUsersByIds([uid]);
          setProfile(res?.[0] || null);
        } else if (handle) {
          const res = await findUserByHandle(handle);
          setProfile(res || null);
        } else {
          setProfile(null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [uid, handle]);

  useEffect(() => {
    (async () => {
      if (!profile?.id) return;
      try {
        const res = await getCheckinsForUserRemote(profile.id, 240);
        const remote = Array.isArray(res) ? res : (res?.items ?? []);
        let merged = remote;
        if (user?.id && profile.id === user.id) {
          const local = await getCheckins();
          const mineLocal = (local || []).filter((item: any) => item?.userId === user.id);
          merged = mergeUniqueCheckins(remote, mineLocal);
        } else {
          merged = mergeUniqueCheckins(remote, []);
        }
        setCheckins(merged);
      } catch {
        if (user?.id && profile?.id === user.id) {
          try {
            const local = await getCheckins();
            const mineLocal = (local || []).filter((item: any) => item?.userId === user.id);
            setCheckins(mergeUniqueCheckins(mineLocal, []));
            return;
          } catch {}
        }
        setCheckins([]);
      }
    })();
  }, [profile?.id, user?.id]);

  useEffect(() => {
    (async () => {
      if (!user?.id || !profile?.id || user.id === profile.id) {
        setRelationship('none');
        return;
      }
      try {
        const [friends, outgoing, incoming] = await Promise.all([
          getUserFriendsCached(user.id, 0),
          getOutgoingFriendRequests(user.id),
          getIncomingFriendRequests(user.id),
        ]);
        if ((friends || []).includes(profile.id)) {
          setRelationship('friend');
          return;
        }
        if ((outgoing || []).some((request: any) => request?.toId === profile.id)) {
          setRelationship('outgoing');
          return;
        }
        if ((incoming || []).some((request: any) => request?.fromId === profile.id)) {
          setRelationship('incoming');
          return;
        }
        setRelationship('none');
      } catch {
        setRelationship('none');
      }
    })();
  }, [user?.id, profile?.id]);

  const canAdd = !!(user && profile && user.id !== profile.id);
  const displayName = profile?.name || profile?.handle || 'Perched user';
  const locationBits = [profile?.city, profile?.campus].filter(Boolean);
  const locationTag = locationBits.length ? locationBits.join(' - ') : profile?.campusOrCity || '';
  const tagline = locationTag ? `${locationTag}${profile?.handle ? ` - @${profile.handle}` : ''}` : profile?.handle ? `@${profile.handle}` : '';
  const isOwnProfile = !!(user?.id && profile?.id && user.id === profile.id);

  const totalCheckins = checkins.length;
  const uniqueSpots = useMemo(() => {
    const set = new Set<string>();
    checkins.forEach((c: any) => {
      const key = c?.spotPlaceId || c?.spotName || c?.spot || '';
      if (key) set.add(String(key));
    });
    return set.size;
  }, [checkins]);

  const streak = useMemo(() => {
    const keys = new Set<string>();
    checkins.forEach((c: any) => {
      const key = dayKey(c);
      if (key) keys.add(key);
    });
    const today = new Date();
    let count = 0;
    for (let i = 0; i < 365; i += 1) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
      if (!keys.has(key)) break;
      count += 1;
    }
    return count;
  }, [checkins]);

  const badges = useMemo(() => {
    const list: string[] = [];
    if (streak >= 7) list.push(`${streak}-day streak`);
    if (totalCheckins >= 25) list.push('Regular');
    if (uniqueSpots >= 10) list.push('Explorer');
    if (totalCheckins >= 100) list.push('Legend');
    return list;
  }, [streak, totalCheckins, uniqueSpots]);

  const visibleCheckins = useMemo(() => checkins.slice(0, 40), [checkins]);
  const topSpots = useMemo(() => {
    const counts = new Map<string, number>();
    checkins.forEach((item: any) => {
      const name = String(item?.spotName || item?.spot || '').trim();
      if (!name) return;
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name, count]) => ({ name, count }));
  }, [checkins]);
  const memberSince = useMemo(() => {
    const ms = toMillis(profile?.createdAt) || toMillis(profile?.joinedAt);
    if (!ms) return '';
    return new Date(ms).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  }, [profile?.createdAt, profile?.joinedAt]);
  const lastCheckinAt = visibleCheckins.length ? formatCheckinClock(visibleCheckins[0]?.createdAt || visibleCheckins[0]?.timestamp) : '';

  return (
    <ThemedView style={styles.container}>
      <Atmosphere variant="cool" />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View
          style={[
            styles.heroCard,
            {
              borderColor: withAlpha(primary, 0.35),
              backgroundColor: withAlpha(primary, 0.08),
            },
          ]}
        >
          <Label style={{ color: muted, marginBottom: 6 }}>Profile</Label>
          <H1 style={{ color: text }}>{displayName}</H1>
          {tagline ? <Body style={{ color: muted, marginTop: 4 }}>{tagline}</Body> : null}
          <View style={[styles.metaRow, gapStyle(8)]}>
            {memberSince ? (
              <View style={[styles.metaChip, { borderColor: border, backgroundColor: withAlpha(card, 0.75) }]}>
                <Text style={{ color: text, fontSize: 12, fontWeight: '600' }}>Member since {memberSince}</Text>
              </View>
            ) : null}
            {lastCheckinAt ? (
              <View style={[styles.metaChip, { borderColor: border, backgroundColor: withAlpha(card, 0.75) }]}>
                <Text style={{ color: text, fontSize: 12, fontWeight: '600' }}>Last check-in: {lastCheckinAt}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {isOwnProfile ? (
          <Pressable onPress={() => router.push('/(tabs)/profile')} style={[styles.cta, { backgroundColor: primary }]}>
            <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Open full profile</Text>
          </Pressable>
        ) : null}

        {profile && canAdd ? (
          <Pressable
            onPress={async () => {
              if (!user || !profile || requesting) return;
              if (relationship === 'friend' || relationship === 'outgoing') return;
              if (relationship === 'incoming') {
                router.push('/(tabs)/friends');
                return;
              }
              setRequesting(true);
              try {
                await sendFriendRequest(user.id, profile.id);
                setRelationship('outgoing');
              } finally {
                setRequesting(false);
              }
            }}
            style={[
              styles.cta,
              {
                backgroundColor: primary,
                opacity: requesting || relationship === 'friend' || relationship === 'outgoing' ? 0.6 : 1,
              },
            ]}
            disabled={requesting || relationship === 'friend' || relationship === 'outgoing'}
          >
            <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>
              {relationship === 'friend'
                ? 'Friends'
                : relationship === 'outgoing'
                ? 'Request sent'
                : relationship === 'incoming'
                ? 'Respond in Friends'
                : requesting
                ? 'Sending...'
                : 'Add friend'}
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.statRow}>
          <View style={[styles.statCard, { borderColor: withAlpha(border, 0.8), backgroundColor: withAlpha(card, 0.9) }]}>
            <Text style={{ color: text, fontWeight: '800', fontSize: 18 }}>{totalCheckins}</Text>
            <Text style={{ color: muted, fontSize: 12 }}>Check-ins</Text>
          </View>
          <View style={[styles.statCard, { borderColor: withAlpha(border, 0.8), backgroundColor: withAlpha(card, 0.9) }]}>
            <Text style={{ color: text, fontWeight: '800', fontSize: 18 }}>{uniqueSpots}</Text>
            <Text style={{ color: muted, fontSize: 12 }}>Spots</Text>
          </View>
          <View style={[styles.statCard, { borderColor: withAlpha(border, 0.8), backgroundColor: withAlpha(card, 0.9) }]}>
            <Text style={{ color: text, fontWeight: '800', fontSize: 18 }}>{streak}</Text>
            <Text style={{ color: muted, fontSize: 12 }}>Streak</Text>
          </View>
        </View>

        {badges.length ? (
          <View style={{ marginTop: 14 }}>
            <Text style={{ color: muted, marginBottom: 6 }}>Badges</Text>
            <View style={[styles.badgeWrap, gapStyle(8)]}>
              {badges.map((badge) => (
                <View key={badge} style={[styles.badge, { borderColor: border, backgroundColor: card }]}>
                  <Text style={{ color: text, fontSize: 12, fontWeight: '700' }}>{badge}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {topSpots.length ? (
          <View style={{ marginTop: 14 }}>
            <Text style={{ color: muted, marginBottom: 6 }}>Top spots</Text>
            <View style={[styles.badgeWrap, gapStyle(8)]}>
              {topSpots.map((spot) => (
                <View key={`${spot.name}-${spot.count}`} style={[styles.badge, { borderColor: border, backgroundColor: withAlpha(card, 0.85) }]}>
                  <Text style={{ color: text, fontSize: 12, fontWeight: '700' }}>
                    {spot.name} · {spot.count}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={{ height: 10 }} />
        {loading ? (
          <View style={{ marginTop: 4 }}>
            <SkeletonLoader width="55%" height={18} />
            <SkeletonLoader width="40%" height={16} style={{ marginTop: 8 }} />
            <SkeletonLoader width="100%" height={84} style={{ marginTop: 16, borderRadius: 14 }} />
          </View>
        ) : null}

        {!loading && !profile ? (
          <View>
            <Body style={{ color: muted }}>Profile not found.</Body>
            <Pressable onPress={() => router.push('/(tabs)/feed')} style={[styles.cta, { backgroundColor: primary }]}>
              <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Go home</Text>
            </Pressable>
          </View>
        ) : null}

        {visibleCheckins.length ? (
          <View style={{ marginTop: 16 }}>
            <Text style={{ color: muted, marginBottom: 6 }}>Posts</Text>
            {visibleCheckins.map((c) => {
              const photo = resolvePhotoUri(c);
              const cid = String(c?.id || c?.clientId || '');
              const placeId = String(c?.spotPlaceId || '');
              const placeName = String(c?.spotName || c?.spot || '');
              return (
                <Pressable
                  key={cid || `${placeName}-${createdAtMs(c)}`}
                  onPress={() => {
                    if (!cid) return;
                    router.push(`/checkin-detail?cid=${encodeURIComponent(cid)}` as any);
                  }}
                  style={[styles.feedRow, { borderColor: border, backgroundColor: card }]}
                >
                  {photo ? (
                    <SpotImage source={photo} style={styles.feedThumb} />
                  ) : (
                    <View style={[styles.feedThumb, { backgroundColor: border }]} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: text, fontWeight: '600' }}>{placeName || 'Spot'}</Text>
                    <Text style={{ color: muted }}>{c?.caption || 'Checked in'}</Text>
                    <Text style={{ color: muted, marginTop: 4 }}>{formatCheckinClock(c?.createdAt || c?.timestamp)}</Text>
                  </View>
                  {placeId || placeName ? (
                    <Pressable
                      onPress={() => router.push(`/spot?placeId=${encodeURIComponent(placeId)}&name=${encodeURIComponent(placeName)}`)}
                      style={[styles.spotButton, { borderColor: border }]}
                    >
                      <Text style={{ color: text, fontWeight: '700', fontSize: 12 }}>Spot</Text>
                    </Pressable>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : profile ? (
          <Body style={{ color: muted, marginTop: 12 }}>No check-ins yet.</Body>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 36 },
  heroCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
  },
  metaChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  cta: { paddingVertical: 12, borderRadius: 14, alignItems: 'center', marginTop: 12 },
  statRow: {
    flexDirection: 'row',
    marginTop: 12,
    ...gapStyle(8),
  },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  feedRow: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    ...gapStyle(10),
  },
  feedThumb: { width: 56, height: 56, borderRadius: 10 },
  spotButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
});
