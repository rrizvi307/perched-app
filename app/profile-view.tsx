import { ThemedView } from '@/components/themed-view';
import { Atmosphere } from '@/components/ui/atmosphere';
import SpotImage from '@/components/ui/spot-image';
import { Body, H1, Label } from '@/components/ui/typography';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { gapStyle } from '@/utils/layout';
import { findUserByHandle, getCheckinsForUserRemote, getUsersByIds, sendFriendRequest } from '@/services/firebaseClient';
import { formatCheckinClock, formatTimeRemaining, isCheckinExpired } from '@/services/checkinUtils';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function ProfileView() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');
  const primary = useThemeColor({}, 'primary');
  const uid = typeof params.uid === 'string' ? params.uid : '';
  const handle = typeof params.handle === 'string' ? params.handle.replace(/^@/, '') : '';
  const [profile, setProfile] = useState<any | null>(null);
  const [checkins, setCheckins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);

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
        const res = await getCheckinsForUserRemote(profile.id, 80);
        const items = (res.items || []).filter((c: any) => !isCheckinExpired(c));
        setCheckins(items);
      } catch {
        setCheckins([]);
      }
    })();
  }, [profile?.id]);

  const canAdd = !!(user && profile && user.id !== profile.id);
  const displayName = profile?.name || profile?.handle || 'Perched user';
  const locationBits = [profile?.city, profile?.campus].filter(Boolean);
  const locationTag = locationBits.length ? locationBits.join(' · ') : profile?.campusOrCity || '';
  const tagline = locationTag ? `${locationTag}${profile?.handle ? ` · @${profile.handle}` : ''}` : profile?.handle ? `@${profile.handle}` : '';
  const visibleCheckins = useMemo(() => checkins.slice(0, 6), [checkins]);

  return (
    <ThemedView style={styles.container}>
      <Atmosphere variant="cool" />
      <Label style={{ color: muted, marginBottom: 8 }}>Profile</Label>
      <H1 style={{ color: text }}>{displayName}</H1>
      {tagline ? <Body style={{ color: muted }}>{tagline}</Body> : null}
      <View style={{ height: 12 }} />
      {loading ? <Body style={{ color: muted }}>Loading profile…</Body> : null}
      {!loading && !profile ? (
        <View>
          <Body style={{ color: muted }}>Profile not found.</Body>
          <Pressable onPress={() => router.push('/(tabs)/feed')} style={[styles.cta, { backgroundColor: primary }]}>
            <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Go home</Text>
          </Pressable>
        </View>
      ) : null}
      {profile && canAdd ? (
        <Pressable
          onPress={async () => {
            if (!user || !profile || requesting) return;
            setRequesting(true);
            try {
              await sendFriendRequest(user.id, profile.id);
            } finally {
              setRequesting(false);
            }
          }}
          style={[styles.cta, { backgroundColor: primary, opacity: requesting ? 0.6 : 1 }]}
          disabled={requesting}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{requesting ? 'Sending…' : 'Add friend'}</Text>
        </Pressable>
      ) : null}
      {visibleCheckins.length ? (
        <View style={{ marginTop: 16 }}>
          <Text style={{ color: muted, marginBottom: 6 }}>Recent check-ins</Text>
          {visibleCheckins.map((c) => {
            const remaining = formatTimeRemaining(c);
            const photo = c.photoUrl || (c as any).photoURL || (c as any).imageUrl || (c as any).imageURL || c.image;
            return (
              <View key={c.id} style={[styles.feedRow, { borderColor: border, backgroundColor: card }]}>
                {photo ? (
                  <SpotImage source={{ uri: photo }} style={styles.feedThumb} />
                ) : (
                  <View style={[styles.feedThumb, { backgroundColor: border }]} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: text, fontWeight: '600' }}>{c.spotName || c.spot || 'Spot'}</Text>
                  <Text style={{ color: muted }}>{c.caption || 'Checked in'}</Text>
                  <Text style={{ color: muted, marginTop: 4 }}>{formatCheckinClock(c.createdAt)}</Text>
                  {remaining ? <Text style={{ color: muted, marginTop: 2 }}>{remaining}</Text> : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : profile ? (
        <Body style={{ color: muted, marginTop: 12 }}>No recent check-ins yet.</Body>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  cta: { paddingVertical: 12, borderRadius: 14, alignItems: 'center', marginTop: 12 },
  feedRow: { borderWidth: 1, borderRadius: 14, padding: 10, marginBottom: 8, flexDirection: 'row', ...gapStyle(10) },
  feedThumb: { width: 56, height: 56, borderRadius: 10 },
});
