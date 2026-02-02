import { ThemedView } from '@/components/themed-view';
import { Atmosphere } from '@/components/ui/atmosphere';
import { IconSymbol } from '@/components/ui/icon-symbol';
import SegmentedControl from '@/components/ui/segmented-control';
import SpotImage from '@/components/ui/spot-image';
import { Body, H1, Label } from '@/components/ui/typography';
import { tokens } from '@/constants/tokens';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { formatCheckinTime, formatTimeRemaining, isCheckinExpired, toMillis } from '@/services/checkinUtils';
import { isDemoMode } from '@/services/demoMode';
import { subscribeCheckinEvents } from '@/services/feedEvents';
import { getCheckinsForUserRemote } from '@/services/firebaseClient';
import { getCheckins, seedDemoNetwork } from '@/storage/local';
import { withAlpha } from '@/utils/colors';
import { gapStyle } from '@/utils/layout';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function createdAtMs(checkin: any) {
  return toMillis(checkin?.createdAt) || 0;
}

function resolvePhoto(checkin: any) {
  return checkin?.photoUrl || checkin?.photoURL || checkin?.imageUrl || checkin?.imageURL || checkin?.image || null;
}

function formatWhen(createdAt: any) {
  const ms = toMillis(createdAt) || 0;
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return formatCheckinTime(createdAt);
  }
}

export default function MyPostsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const focusId = typeof params.focus === 'string' ? params.focus : '';
  const sectionParam = typeof params.section === 'string' ? params.section : '';

  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');
  const primary = useThemeColor({}, 'primary');
  const highlight = withAlpha(primary, 0.12);

  const listRef = useRef<FlatList<any> | null>(null);
  const didFocusRef = useRef(false);

  const [segment, setSegment] = useState<'live' | 'expired'>(sectionParam === 'expired' ? 'expired' : 'live');
  const [items, setItems] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setRefreshing(true);
    try {
      if (isDemoMode()) {
        try {
          await seedDemoNetwork(user.id);
        } catch {}
        const local = await getCheckins();
        setItems(local.filter((c: any) => c?.userId === user.id));
        return;
      }
      const res = await getCheckinsForUserRemote(user.id, 240);
      const remote = Array.isArray(res) ? res : (res?.items ?? []);
      const local = await getCheckins();
      const mineLocal = local.filter((c: any) => c?.userId === user.id);
      const keyOf = (c: any) => c?.clientId || c?.id;
      const remoteKeys = new Set(remote.map(keyOf));
      const merged = [...remote, ...mineLocal.filter((c: any) => !remoteKeys.has(keyOf(c)))];
      setItems(merged);
    } catch {
      const local = await getCheckins();
      setItems(local.filter((c: any) => c?.userId === user.id));
    } finally {
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const unsub = subscribeCheckinEvents((it: any) => {
      const incomingClientId = it?.clientId;
      const incomingId = it?.id;
      if (!incomingClientId && !incomingId) return;

      setItems((prev) => {
        const matches = (p: any) => (incomingClientId && p?.clientId === incomingClientId) || (incomingId && p?.id === incomingId);
        const idx = prev.findIndex(matches);

        if (it?.deleted) {
          if (idx < 0) return prev;
          const next = prev.slice();
          next.splice(idx, 1);
          return next;
        }

        if (idx >= 0) {
          const next = prev.slice();
          next[idx] = { ...next[idx], ...it };
          return next;
        }

        if (user?.id && it?.userId && it.userId !== user.id) return prev;
        return [it, ...prev];
      });
    });
    return () => {
      unsub();
    };
  }, [user?.id]);

  const sorted = useMemo(() => (items || []).slice().sort((a: any, b: any) => createdAtMs(b) - createdAtMs(a)), [items]);
  const now = Date.now();
  const live = useMemo(() => sorted.filter((c: any) => !isCheckinExpired(c, now)), [sorted, now]);
  const expired = useMemo(() => sorted.filter((c: any) => isCheckinExpired(c, now)), [sorted, now]);
  const data = segment === 'expired' ? expired : live;

  useEffect(() => {
    if (!focusId || didFocusRef.current) return;
    const focusItem = sorted.find((c: any) => String(c?.id || '') === focusId);
    if (!focusItem) return;
    const focusExpired = isCheckinExpired(focusItem, now);
    const nextSeg = focusExpired ? 'expired' : 'live';
    if (segment !== nextSeg) setSegment(nextSeg);
  }, [focusId, now, segment, sorted]);

  useEffect(() => {
    if (!focusId || didFocusRef.current) return;
    const focusIndex = data.findIndex((c: any) => String(c?.id || '') === focusId);
    if (focusIndex < 0) return;
    didFocusRef.current = true;
    requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToIndex({ index: focusIndex, animated: false, viewPosition: 0.2 });
      } catch {
        // ignore
      }
    });
  }, [data, focusId]);

  if (!user) return <Redirect href="/signin" />;

  return (
    <ThemedView style={styles.container}>
      <Atmosphere variant="cool" />
      <View style={[styles.topBar, { paddingTop: Math.max(tokens.space.s12, insets.top + 10) }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => [styles.backButton, pressed ? { opacity: 0.7 } : null]}
        >
          <IconSymbol name="chevron.left" size={22} color={muted} />
          <Text style={{ color: muted, fontWeight: '600', marginLeft: 4 }}>Profile</Text>
        </Pressable>
      </View>

      <FlatList
        ref={(r) => {
          listRef.current = r;
        }}
        data={data}
        keyExtractor={(item) => String(item?.id || item?.clientId || Math.random())}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
        ListHeaderComponent={
          <View style={{ paddingBottom: 10 }}>
            <Label style={{ color: muted, marginBottom: 8 }}>Your check-ins</Label>
            <H1 style={{ color: text, marginBottom: 12 }}>All posts</H1>
            <SegmentedControl
              value={segment}
              onChange={(next) => setSegment(next === 'expired' ? 'expired' : 'live')}
              options={[
                { key: 'live', label: `Live${live.length ? ` (${live.length})` : ''}` },
                { key: 'expired', label: `Expired${expired.length ? ` (${expired.length})` : ''}` },
              ]}
              maxWidth={420}
            />
          </View>
        }
        ListEmptyComponent={
          <View style={{ paddingTop: 24 }}>
            <Body style={{ color: muted }}>{segment === 'expired' ? 'No expired check-ins yet.' : 'No live check-ins yet.'}</Body>
          </View>
        }
        onScrollToIndexFailed={(info) => {
          try {
            const approx = Math.max(0, info.averageItemLength * info.index - 40);
            listRef.current?.scrollToOffset({ offset: approx, animated: false });
          } catch {}
        }}
        renderItem={({ item }) => {
          const photo = resolvePhoto(item);
          const isFocused = focusId && String(item?.id || '') === focusId;
          const remaining = formatTimeRemaining(item);
          const when = formatWhen(item?.createdAt);
          const tags = Array.isArray(item?.tags) ? item.tags.filter(Boolean).slice(0, 4) : [];
          const whereBits = [item?.city, item?.campus].filter(Boolean);
          const where = whereBits.length ? whereBits.join(' · ') : item?.campusOrCity || '';
          const cid = String(item?.id || item?.clientId || '');
          return (
            <Pressable
              onPress={() => {
                if (!cid) return;
                router.push(`/checkin-detail?cid=${encodeURIComponent(cid)}` as any);
              }}
              style={({ pressed }) => [
                styles.card,
                {
                  borderColor: isFocused ? withAlpha(primary, 0.5) : border,
                  backgroundColor: card,
                  opacity: pressed ? 0.92 : 1,
                },
              ]}
            >
              {photo ? (
                <SpotImage source={photo} style={styles.image} />
              ) : (
                <View style={[styles.image, { backgroundColor: withAlpha(border, 0.3), alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ color: muted, fontWeight: '600' }}>Photo unavailable</Text>
                </View>
              )}
              <View style={styles.meta}>
                <View style={[styles.row, gapStyle(10)]}>
                  <Text style={{ color: text, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                    {item?.spotName || item?.spot || 'Spot'}
                  </Text>
                  {remaining ? <Text style={{ color: muted, fontWeight: '600' }}>{remaining}</Text> : null}
                </View>
                <View style={[styles.row, { marginTop: 6 }, gapStyle(10)]}>
                  {when ? <Text style={{ color: muted, fontWeight: '600' }}>{when}</Text> : null}
                  {where ? <Text style={{ color: muted, fontWeight: '600' }} numberOfLines={1}>{where}</Text> : null}
                </View>
                {item?.caption ? <Text style={{ color: muted, marginTop: 6 }}>{item.caption}</Text> : null}
                {tags.length ? (
                  <View style={[styles.tagWrap, { marginTop: 10 }, gapStyle(8)]}>
                    {tags.map((t: string) => (
                      <View key={t} style={[styles.tag, { borderColor: withAlpha(border, 0.7), backgroundColor: withAlpha(border, 0.25) }]}>
                        <Text style={{ color: muted, fontWeight: '700', fontSize: 12 }}>{t}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {isFocused ? (
                  <View style={[styles.focusPill, { borderColor: withAlpha(primary, 0.35), backgroundColor: highlight }]}>
                    <Text style={{ color: primary, fontWeight: '700' }}>Selected</Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { paddingHorizontal: tokens.space.s20 },
  backButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  content: { paddingHorizontal: tokens.space.s20, paddingBottom: 60 },
  card: {
    borderWidth: 1,
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 14,
  },
  image: { width: '100%', height: 230 },
  meta: { padding: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  focusPill: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
