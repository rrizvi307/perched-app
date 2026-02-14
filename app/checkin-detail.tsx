import { ThemedView } from '@/components/themed-view';
import { Atmosphere } from '@/components/ui/atmosphere';
import { IconSymbol } from '@/components/ui/icon-symbol';
import SpotImage from '@/components/ui/spot-image';
import { Body, H1, Label } from '@/components/ui/typography';
import { tokens } from '@/constants/tokens';
import { useToast } from '@/contexts/ToastContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAuth } from '@/contexts/AuthContext';
import { ReactionBar } from '@/components/ui/reaction-bar';
import { getReactions, ReactionType } from '@/services/social';
import { shareCheckin } from '@/services/shareInvite';
import { formatCheckinTime, formatTimeRemaining, toMillis } from '@/services/checkinUtils';
import { publishCheckin } from '@/services/feedEvents';
import { deleteCheckinRemote, getCheckinById, isFirebaseConfigured } from '@/services/firebaseClient';
import { getCheckins, removeCheckinLocalByClientId, removeCheckinLocalById } from '@/storage/local';
import { withAlpha } from '@/utils/colors';
import { gapStyle } from '@/utils/layout';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function resolvePhoto(checkin: any) {
  return checkin?.photoUrl || checkin?.photoURL || checkin?.imageUrl || checkin?.imageURL || checkin?.image || null;
}

function formatWhen(createdAt: any) {
  const ms = toMillis(createdAt) || 0;
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return formatCheckinTime(createdAt);
  }
}

export default function CheckinDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const { user } = useAuth();

  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');
  const primary = useThemeColor({}, 'primary');
  const danger = useThemeColor({}, 'danger');
  const highlight = withAlpha(primary, 0.12);

  const cid = typeof params.cid === 'string'
    ? params.cid
    : typeof params.id === 'string'
      ? params.id
      : '';
  const [item, setItem] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [reactions, setReactions] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      if (!cid) return;
      setLoading(true);
      try {
        const local = await getCheckins();
        const foundLocal = local.find((c: any) => String(c?.id || '') === cid || String(c?.clientId || '') === cid) || null;
        if (foundLocal) {
          setItem(foundLocal);
          // Load reactions
          try {
            const reactionData = await getReactions(cid);
            setReactions(reactionData);
          } catch (error) {
            console.error('Failed to load reactions:', error);
          }
          return;
        }
        if (isFirebaseConfigured()) {
          const remote = await getCheckinById(cid);
          setItem(remote || null);
          // Load reactions
          if (remote) {
            try {
              const reactionData = await getReactions(cid);
              setReactions(reactionData);
            } catch (error) {
              console.error('Failed to load reactions:', error);
            }
          }
          return;
        }
        setItem(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [cid]);

  const title = item?.spotName || item?.spot || 'Check-in';
  const photo = resolvePhoto(item);
  const tags = Array.isArray(item?.tags) ? item.tags.filter(Boolean).slice(0, 8) : [];
  const whereBits = [item?.city, item?.campus].filter(Boolean);
  const where = whereBits.length ? whereBits.join(' · ') : item?.campusOrCity || '';
  const when = formatWhen(item?.createdAt);
  const remaining = item ? formatTimeRemaining(item) : '';
  const visibility = typeof item?.visibility === 'string' ? item.visibility : '';
  const canDelete = !!item;

  const spotLink = useMemo(() => {
    const placeId = typeof item?.spotPlaceId === 'string' ? item.spotPlaceId : '';
    const name = typeof (item?.spotName || item?.spot) === 'string' ? (item.spotName || item.spot) : '';
    if (!placeId && !name) return null;
    const parts: string[] = [];
    if (placeId) parts.push(`placeId=${encodeURIComponent(placeId)}`);
    if (name) parts.push(`name=${encodeURIComponent(name)}`);
    return `/spot?${parts.join('&')}`;
  }, [item?.spotPlaceId, item?.spotName, item?.spot]);

  const reactionCounts = useMemo(() => {
    const counts: Record<ReactionType, number> = {} as any;
    reactions.forEach((r: any) => {
      if (r.type) {
        counts[r.type as ReactionType] = (counts[r.type as ReactionType] || 0) + 1;
      }
    });
    return counts;
  }, [reactions]);

  const userReaction = useMemo(() => {
    if (!user?.id) return null;
    const userReactionObj = reactions.find((r: any) => r.userId === user.id);
    return userReactionObj?.type || null;
  }, [reactions, user?.id]);

  const handleReactionChange = async () => {
    // Reload reactions after change
    try {
      const reactionData = await getReactions(cid);
      setReactions(reactionData);
    } catch (error) {
      console.error('Failed to reload reactions:', error);
    }
  };

  async function doDelete() {
    if (!item || deleting) return;
    const run = async () => {
      setDeleting(true);
      try {
        const id = String(item.id || '');
        const clientId = typeof item?.clientId === 'string' ? item.clientId : '';
        let remoteOk = true;
        if (isFirebaseConfigured() && id && !id.startsWith('demo-self-') && !id.startsWith('demo-c') && !id.startsWith('local-')) {
          remoteOk = await deleteCheckinRemote(id);
        }
        if (!remoteOk) throw new Error('Remote delete failed');
        if (id) await removeCheckinLocalById(id);
        if (clientId) await removeCheckinLocalByClientId(clientId);
        publishCheckin({ id, clientId: clientId || null, deleted: true });
        showToast('Deleted check-in.', 'success');
        router.back();
      } catch {
        showToast('Unable to delete right now. Check Firebase rules + connection.', 'error');
      } finally {
        setDeleting(false);
      }
    };

    if (Platform.OS === 'web') {
      if (confirm('Delete this check-in?')) await run();
      return;
    }
    Alert.alert('Delete check-in', 'This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void run() },
    ]);
  }

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
          <Text style={{ color: muted, fontWeight: '600', marginLeft: 4 }}>Back</Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        <Label style={{ color: muted, marginBottom: 8 }}>Check-in</Label>
        <H1 style={{ color: text, marginBottom: 10 }}>{title}</H1>

        {loading ? <Body style={{ color: muted }}>Loading…</Body> : null}
        {!loading && !item ? <Body style={{ color: muted }}>Not found.</Body> : null}

        {item ? (
          <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
            {photo ? (
              <SpotImage source={photo} style={styles.image} />
            ) : (
              <View style={[styles.image, { backgroundColor: withAlpha(border, 0.3), alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: muted, fontWeight: '600' }}>Photo unavailable</Text>
              </View>
            )}

            <View style={styles.meta}>
              <View style={[styles.row, gapStyle(10)]}>
                {when ? <Text style={{ color: muted, fontWeight: '600' }}>{when}</Text> : null}
                {remaining ? <Text style={{ color: muted, fontWeight: '600' }}>{remaining}</Text> : null}
              </View>
              {where ? <Text style={{ color: muted, marginTop: 6 }}>{where}</Text> : null}
              {visibility ? <Text style={{ color: muted, marginTop: 6, fontWeight: '600' }}>{visibility.toUpperCase()}</Text> : null}
              {item?.caption ? <Text style={{ color: text, marginTop: 10, lineHeight: 20 }}>{String(item.caption)}</Text> : null}

              {tags.length ? (
                <View style={[styles.tagWrap, { marginTop: 12 }, gapStyle(8)]}>
                  {tags.map((t: string) => (
                    <View key={t} style={[styles.tag, { borderColor: withAlpha(border, 0.7), backgroundColor: withAlpha(border, 0.25) }]}>
                      <Text style={{ color: muted, fontWeight: '700', fontSize: 12 }}>{t}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {user && item && (
                <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: withAlpha(border, 0.3) }}>
                  <ReactionBar
                    checkinId={cid}
                    userId={user.id || ''}
                    userName={user.name || ''}
                    userHandle={user.handle}
                    initialCounts={reactionCounts}
                    userReaction={userReaction}
                    onReactionChange={handleReactionChange}
                  />
                </View>
              )}

              <View style={{ height: 14 }} />

              <View style={[styles.actions, gapStyle(10)]}>
                {/* Share button */}
                <Pressable
                  onPress={async () => {
                    const result = await shareCheckin(
                      cid,
                      title,
                      user?.name || 'Someone',
                      photo
                    );
                    if (result.success) {
                      showToast('Check-in shared!', 'success');
                    }
                  }}
                  style={({ pressed }) => [
                    styles.actionButton,
                    { borderColor: primary, backgroundColor: pressed ? withAlpha(primary, 0.15) : card },
                  ]}
                >
                  <IconSymbol name="square.and.arrow.up" size={18} color={primary} />
                  <Text style={{ color: primary, fontWeight: '800', marginLeft: 6 }}>Share</Text>
                </Pressable>

                {spotLink ? (
	                  <Pressable
	                    onPress={() => router.push(spotLink as any)}
	                    style={({ pressed }) => [
	                      styles.actionButton,
	                      { borderColor: border, backgroundColor: pressed ? highlight : card },
	                    ]}
	                  >
                    <Text style={{ color: text, fontWeight: '800' }}>View spot</Text>
                  </Pressable>
                ) : null}

                {canDelete ? (
                  <Pressable
                    onPress={doDelete}
                    disabled={deleting}
                    style={({ pressed }) => [
                      styles.actionButton,
                      {
                        borderColor: withAlpha(danger, 0.35),
                        backgroundColor: pressed ? withAlpha(danger, 0.12) : card,
                        opacity: deleting ? 0.6 : 1,
                      },
                    ]}
                  >
                    <Text style={{ color: danger, fontWeight: '800' }}>{deleting ? 'Deleting…' : 'Delete'}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { paddingHorizontal: tokens.space.s20 },
  backButton: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  content: { paddingHorizontal: tokens.space.s20, paddingBottom: 50 },
  card: { borderWidth: 1, borderRadius: 22, overflow: 'hidden' },
  image: { width: '100%', height: 320 },
  meta: { padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap' },
  actionButton: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
});
