import { ThemedView } from '@/components/themed-view';
import { Atmosphere } from '@/components/ui/atmosphere';
import SpotImage from '@/components/ui/spot-image';
import { Body, H1, Label } from '@/components/ui/typography';
import { PolishedHeader } from '@/components/ui/polished-header';
import { PremiumButton } from '@/components/ui/premium-button';
import { PolishedCard } from '@/components/ui/polished-card';
import ScoreBreakdownSheet from '@/components/ui/ScoreBreakdownSheet';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { gapStyle } from '@/utils/layout';
import { getCheckinsRemote, getPlaceTagVotesRemote, getUserFriendsCached, getUsersByIdsCached, recordPlaceEventRemote, recordPlaceTagRemote, recordPlaceTagVoteRemote, sendFriendRequest } from '@/services/firebaseClient';
import { getMapsKey, getPlaceDetails } from '@/services/googleMaps';
import { isSavedSpot, recordPlaceEvent, recordPlaceTag, toggleSavedSpot } from '@/storage/local';
import { classifySpotCategory, normalizeSpotName, spotKey } from '@/services/spotUtils';
import { formatCheckinClock, formatTimeRemaining, isCheckinExpired } from '@/services/checkinUtils';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import { logEvent } from '@/services/logEvent';
import { useToast } from '@/contexts/ToastContext';
import { buildPlaceIntelligence, PlaceIntelligence } from '@/services/placeIntelligence';
import { runAfterInteractions } from '@/services/performance';

const TAG_VOTES_KEY = 'spot_tag_votes_v1';
const TAG_VARIANT_KEY = 'spot_tag_variant_v1';
const TAG_VARIANTS = {
  core5: ['Quiet', 'Wi-Fi', 'Outlets', 'Seating', 'Late-night'],
  full7: ['Quiet', 'Wi-Fi', 'Outlets', 'Seating', 'Bright', 'Spacious', 'Late-night'],
} as const;

export default function SpotDetail() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');
  const primary = useThemeColor({}, 'primary');
  const accent = useThemeColor({}, 'accent');
  const { showToast } = useToast();
  const isWeb = Platform.OS === 'web';
  const placeId = typeof params.placeId === 'string' ? params.placeId : '';
  const nameParam = typeof params.name === 'string' ? params.name : '';
  const [place, setPlace] = useState<any | null>(null);
  const [checkins, setCheckins] = useState<any[]>([]);
  const [friendsHere, setFriendsHere] = useState<any[]>([]);
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [peopleHere, setPeopleHere] = useState<any[]>([]);
  const [reactions, setReactions] = useState<Record<string, number>>({});
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tagVotes, setTagVotes] = useState<Record<string, boolean>>({});
  const [tagVariant, setTagVariant] = useState<keyof typeof TAG_VARIANTS>('core5');
  const [intelligence, setIntelligence] = useState<PlaceIntelligence | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const displayName = place?.name || nameParam || 'Spot';
  const coords = place?.location || checkins.find((c) => c.spotLatLng)?.spotLatLng || checkins.find((c) => c.location)?.location;
  const category = classifySpotCategory(displayName, place?.types);
  const normalizedName = normalizeSpotName(displayName);
  const placeKey = spotKey(placeId || undefined, displayName || 'unknown');
  const friendIdSet = useMemo(() => new Set(friendIds), [friendIds]);
  const canTag = useMemo(() => {
    if (!user) return false;
    return checkins.some((c) => {
      const name = c.spotName || c.spot || '';
      return c.userId === user.id && spotKey(c.spotPlaceId, name) === placeKey;
    });
  }, [checkins, placeKey, user]);
  const visibleCheckins = useMemo(() => {
    return checkins.filter((c) => {
      if (isCheckinExpired(c)) return false;
      if (!c.visibility) return true;
      if (c.visibility === 'public') return true;
      if (!user) return false;
      if (c.userId === user.id) return true;
      if (c.visibility === 'friends' || c.visibility === 'close') {
        return friendIdSet.has(c.userId);
      }
      return true;
    });
  }, [checkins, friendIdSet, user]);
  const aggregatedTagScores = useMemo(() => {
    const scores: Record<string, number> = {};
    visibleCheckins.forEach((c: any) => {
      if (!Array.isArray(c?.tags)) return;
      c.tags.forEach((tag: any) => {
        const normalized = String(tag || '').trim();
        if (!normalized) return;
        scores[normalized] = (scores[normalized] || 0) + 1;
      });
    });
    return scores;
  }, [visibleCheckins]);
  const mapsUrl = useMemo(() => {
    if (placeId) {
      // Prefer a place_id-based URL so the Maps app opens the business listing (reviews, hours, etc).
      return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`;
    }
    const hasName = displayName && displayName.trim() && displayName.trim().toLowerCase() !== 'spot';
    const query = hasName
      ? coords
        ? `${displayName} ${coords.lat},${coords.lng}`
        : displayName
      : coords
      ? `${coords.lat},${coords.lng}`
      : '';
    return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
  }, [placeId, coords, displayName]);

  function formatTime(input: string | { seconds?: number } | undefined) {
    return formatCheckinClock(input);
  }

  useEffect(() => {
    (async () => {
      if (placeId) {
        try {
          const details = await getPlaceDetails(placeId);
          if (details) setPlace(details);
        } catch {}
      }
    })();
  }, [placeId]);

  function persistTagVotes(nextVotes: Record<string, boolean>) {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(TAG_VOTES_KEY);
        const data = raw ? JSON.parse(raw) : {};
        data[placeKey] = nextVotes;
        window.localStorage.setItem(TAG_VOTES_KEY, JSON.stringify(data));
        return;
      }
    } catch {}
    try {
      (global as any)._spot_tag_votes = (global as any)._spot_tag_votes || {};
      (global as any)._spot_tag_votes[placeKey] = nextVotes;
    } catch {}
  }

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(TAG_VOTES_KEY);
        const data = raw ? JSON.parse(raw) : {};
        setTagVotes(data[placeKey] || {});
        return;
      }
    } catch {}
    try {
      const data = (global as any)._spot_tag_votes || {};
      setTagVotes(data[placeKey] || {});
    } catch {}
  }, [placeKey]);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(TAG_VARIANT_KEY);
        if (raw === 'core5' || raw === 'full7') {
          setTagVariant(raw);
          return;
        }
        const assigned = Math.random() < 0.5 ? 'core5' : 'full7';
        window.localStorage.setItem(TAG_VARIANT_KEY, assigned);
        setTagVariant(assigned);
        return;
      }
    } catch {}
    try {
      const assigned = (global as any)._spot_tag_variant || (Math.random() < 0.5 ? 'core5' : 'full7');
      (global as any)._spot_tag_variant = assigned;
      setTagVariant(assigned);
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      if (!user?.id) return;
      try {
        const remoteVotes = await getPlaceTagVotesRemote(user.id, placeId || undefined, displayName);
        if (remoteVotes) {
          setTagVotes((prev) => ({ ...remoteVotes, ...prev }));
        }
      } catch {}
    })();
  }, [user?.id, placeId, displayName]);

  useEffect(() => {
    (async () => {
      try {
        const ok = await isSavedSpot(placeId || '', nameParam || '');
        setSaved(ok);
      } catch {}
    })();
  }, [placeId, nameParam]);

  useEffect(() => {
    (async () => {
      try {
        const res = await getCheckinsRemote(80);
        const items = (res.items || []).filter((it: any) => !isCheckinExpired(it));
        const targetKey = spotKey(placeId || undefined, nameParam || '');
        const filtered = items.filter((it: any) => {
          const name = it.spotName || it.spot || '';
          return spotKey(it.spotPlaceId, name) === targetKey;
        });
        setCheckins(filtered);
      } catch {
        setCheckins([]);
      }
    })();
  }, [placeId, nameParam]);

  useEffect(() => {
    (async () => {
      if (!user) return;
      try {
        const ids = await getUserFriendsCached(user.id);
        setFriendIds(ids || []);
        if (!ids.length) {
          setFriendsHere([]);
          return;
        }
        const now = Date.now();
        const TWO_HOURS = 2 * 60 * 60 * 1000;
        const activeIds = Array.from(new Set(
          visibleCheckins
            .filter((c) => {
              const created = c.createdAt?.seconds ? c.createdAt.seconds * 1000 : new Date(c.createdAt).getTime();
              return now - created < TWO_HOURS;
            })
            .map((c) => c.userId)
            .filter((id: string) => ids.includes(id))
        ));
        const profiles = await getUsersByIdsCached(activeIds);
        setFriendsHere(profiles || []);
      } catch {
        setFriendsHere([]);
      }
    })();
  }, [user, visibleCheckins]);

  useEffect(() => {
    const now = Date.now();
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    const userIds = Array.from(new Set(
      visibleCheckins
        .filter((c) => {
          const created = c.createdAt?.seconds ? c.createdAt.seconds * 1000 : new Date(c.createdAt).getTime();
          return now - created < TWO_HOURS;
        })
        .map((c) => c.userId)
        .filter(Boolean)
    ));
    const nonFriendIds = userIds.filter((id: string) => id !== user?.id && !friendIdSet.has(id));
    if (!nonFriendIds.length) {
      setPeopleHere([]);
      return;
    }
    (async () => {
      const profiles = await getUsersByIdsCached(nonFriendIds.slice(0, 6));
      setPeopleHere(profiles || []);
    })();
  }, [visibleCheckins, friendIdSet, user]);

  useEffect(() => {
    let active = true;
    void runAfterInteractions(async () => {
      try {
        const payload = await buildPlaceIntelligence({
          placeName: displayName,
          placeId: placeId || undefined,
          location: coords || undefined,
          openNow: place?.openNow,
          types: place?.types,
          checkins: visibleCheckins,
          tagScores: aggregatedTagScores,
          inferred: place?.intel
            ? {
                noise: place.intel.inferredNoise ?? null,
                noiseConfidence: place.intel.inferredNoiseConfidence,
                hasWifi: place.intel.hasWifi,
                wifiConfidence: place.intel.wifiConfidence,
                goodForStudying: place.intel.goodForStudying,
              }
            : null,
        });
        if (active) setIntelligence(payload);
      } catch {
        if (active) setIntelligence(null);
      }
    });
    return () => {
      active = false;
    };
  }, [displayName, placeId, coords, place?.openNow, place?.types, place?.intel, visibleCheckins, aggregatedTagScores]);

  const mapUrl = useMemo(() => {
    if (!coords) return null;
    const key = getMapsKey();
    if (!key) return null;
    const center = `${coords.lat},${coords.lng}`;
    return `https://maps.googleapis.com/maps/api/staticmap?center=${center}&zoom=15&size=800x350&scale=2&markers=color:red%7C${center}&key=${key}`;
  }, [coords]);

  const recentCheckins = visibleCheckins.slice(0, 6);
  const densityBars = useMemo(() => {
    const now = Date.now();
    const TWELVE_HOURS = 12 * 60 * 60 * 1000;
    const bucketCount = 6;
    const bucketSize = TWELVE_HOURS / bucketCount;
    const buckets = new Array(bucketCount).fill(0);
    visibleCheckins.forEach((c) => {
      const created = c.createdAt?.seconds ? c.createdAt.seconds * 1000 : new Date(c.createdAt).getTime();
      const age = now - created;
      if (age < 0 || age > TWELVE_HOURS) return;
      const idx = Math.min(bucketCount - 1, Math.floor(age / bucketSize));
      buckets[idx] += 1;
    });
    const max = Math.max(1, ...buckets);
    return buckets.map((b) => Math.max(0.1, b / max));
  }, [visibleCheckins]);

  return (
    <ThemedView style={styles.container}>
      <Atmosphere variant="cool" />
      <PolishedHeader
        leftIcon="chevron.left"
        onLeftPress={() => router.back()}
        rightIcon="square.and.arrow.up"
        onRightPress={async () => {
          try {
            await Share.share({
              title: displayName,
              message: `Check out ${displayName} on Perched!${mapsUrl ? `\n${mapsUrl}` : ''}`,
            });
          } catch {}
        }}
        blurred
      />
      <Label style={{ color: muted, marginBottom: 8 }}>Spot</Label>
      <H1 style={{ color: text }}>{displayName}</H1>
      {normalizedName ? null : null}
      <View style={{ height: 12 }} />
      {intelligence ? (
        <PolishedCard variant="elevated" style={{ ...styles.intelCard, borderColor: border }}>
          <Text style={{ color: muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.1 }}>Smart snapshot</Text>
          <View style={styles.intelRow}>
            <Pressable onPress={() => setShowBreakdown(true)} style={styles.intelItem}>
              <Text style={{ color: text, fontWeight: '800', fontSize: 22 }}>{intelligence.workScore}</Text>
              <Text style={{ color: muted, fontSize: 12 }}>Work score</Text>
            </Pressable>
            <View style={styles.intelItem}>
              <Text style={{ color: text, fontWeight: '700', textTransform: 'capitalize' }}>{intelligence.crowdLevel}</Text>
              <Text style={{ color: muted, fontSize: 12 }}>Crowd now</Text>
            </View>
            <View style={styles.intelItem}>
              <Text style={{ color: text, fontWeight: '700', textTransform: 'capitalize' }}>{intelligence.bestTime}</Text>
              <Text style={{ color: muted, fontSize: 12 }}>Best time</Text>
            </View>
          </View>
          {intelligence.highlights.length ? (
            <View style={styles.intelChipRow}>
              {intelligence.highlights.map((item) => (
                <View key={`hl-${item}`} style={[styles.intelChip, { borderColor: border }]}>
                  <Text style={{ color: text, fontSize: 12, fontWeight: '600' }}>{item}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {intelligence.useCases.length ? (
            <View style={styles.useCaseRow}>
              {intelligence.useCases.map((item) => (
                <View key={`uc-${item}`} style={[styles.useCaseChip, { borderColor: border }]}>
                  <Text style={{ color: text, fontSize: 12, fontWeight: '600' }}>{item}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {intelligence.crowdForecast.length ? (
            <View style={styles.forecastRow}>
              {intelligence.crowdForecast.slice(0, 4).map((point) => {
                const tone = point.level === 'low'
                  ? '#22C55E'
                  : point.level === 'high'
                  ? '#F97316'
                  : point.level === 'moderate'
                  ? '#F59E0B'
                  : muted;
                return (
                  <View key={`fc-${point.offsetHours}`} style={[styles.forecastChip, { borderColor: border }]}>
                    <Text style={{ color: muted, fontSize: 11, fontWeight: '700' }}>{point.label}</Text>
                    <Text style={{ color: tone, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' }}>{point.level}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}
          <Text style={{ color: muted, marginTop: 8, fontSize: 12 }}>
            Confidence: {Math.round((intelligence.confidence || 0) * 100)}%
          </Text>
          {intelligence.externalSignals.length ? (
            <Text style={{ color: muted, marginTop: 8, fontSize: 12 }}>
              External signals: {intelligence.externalSignals.map((s) => s.source).join(' + ')}
            </Text>
          ) : null}
        </PolishedCard>
      ) : null}
      <Text style={{ color: muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, marginTop: 12, marginBottom: 8 }}>
        Tags from the community
      </Text>
      <View style={styles.tagRow}>
        {TAG_VARIANTS[tagVariant].map((tag) => (
          <Pressable
            key={`tag-${tag}`}
            onPress={() => {
              if (!canTag) {
                showToast('Tap in here first to add tags.', 'info');
                return;
              }
              const eventPayload = { placeId: placeId || null, name: displayName, tag };
              const isActive = !!tagVotes[tag];
              const nextVotes = { ...tagVotes, [tag]: !isActive };
              setTagVotes(nextVotes);
              persistTagVotes(nextVotes);
              const delta = isActive ? -1 : 1;
              recordPlaceTag(eventPayload.placeId, eventPayload.name, tag, delta);
              recordPlaceTagRemote({ ...eventPayload, delta });
              if (user?.id) {
                recordPlaceTagVoteRemote({ userId: user.id, placeId: eventPayload.placeId, name: eventPayload.name, tag, active: !isActive });
              }
              showToast(isActive ? `${tag} removed` : `${tag} added`, 'success');
            }}
            style={[
              styles.tagChip,
              {
                borderColor: border,
                backgroundColor: tagVotes[tag] ? accent : 'transparent',
                opacity: tagVotes[tag] ? 0.85 : 1,
              },
            ]}
          >
            <Text style={{ color: tagVotes[tag] ? '#FFFFFF' : text, fontWeight: '600' }}>
              {tag}
            </Text>
          </Pressable>
        ))}
      </View>
      {mapUrl ? (
        <Pressable
          onPress={() => {
            try {
              if (!mapsUrl) return;
              if (Platform.OS === 'web') {
                window.open(mapsUrl, '_blank', 'noopener');
              } else {
                Linking.openURL(mapsUrl);
              }
            } catch {}
          }}
        >
          <SpotImage source={{ uri: mapUrl }} style={styles.map} />
        </Pressable>
      ) : (
        <View style={[styles.map, { backgroundColor: card, borderColor: border }]} />
      )}
      <View style={{ height: 10 }} />
      <View style={styles.densityRow}>
        {densityBars.map((h, i) => (
          <View key={`bar-${i}`} style={[styles.densityBar, { backgroundColor: border }]}>
            <View style={[styles.densityFill, { backgroundColor: primary, flex: h }]} />
          </View>
        ))}
      </View>
      <Text style={{ color: muted, marginTop: 6 }}>Past 12 hours</Text>
      <View style={{ height: 12 }} />
      <PremiumButton
        onPress={() => {
          const name = encodeURIComponent(displayName);
          const lat = typeof coords?.lat === 'number' ? `&lat=${coords.lat}` : '';
          const lng = typeof coords?.lng === 'number' ? `&lng=${coords.lng}` : '';
          router.push(`/checkin?spot=${name}${lat}${lng}&placeId=${encodeURIComponent(placeId || '')}`);
        }}
        variant="primary"
        size="large"
        icon="plus.circle.fill"
        fullWidth
      >
        Tap in here
      </PremiumButton>
      <View style={styles.actionRow}>
        {coords ? (
	          <Pressable
	            onPress={() => {
	              const eventPayload = { event: 'map_open' as const, ts: Date.now(), userId: user?.id, placeId: placeId || null, name: displayName, category };
	              recordPlaceEvent(eventPayload);
	              recordPlaceEventRemote(eventPayload);
	              if (!mapsUrl) return;
              if (Platform.OS === 'web') {
                window.open(mapsUrl, '_blank', 'noopener');
              } else {
                Linking.openURL(mapsUrl);
              }
            }}
            style={[styles.secondary, { borderColor: border }]}
          >
            <Text style={{ color: text, fontWeight: '700' }}>Open in Maps</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={async () => {
            if (saving) return;
            setSaving(true);
            try {
	              const next = await toggleSavedSpot({ placeId: placeId || undefined, name: displayName });
	              setSaved(next);
	              if (next) {
	                const eventPayload = { event: 'save' as const, ts: Date.now(), userId: user?.id, placeId: placeId || null, name: displayName, category };
	                recordPlaceEvent(eventPayload);
	                recordPlaceEventRemote(eventPayload);
	              }
            } finally {
              setSaving(false);
            }
          }}
          style={[styles.secondary, { borderColor: border, backgroundColor: saved ? primary : 'transparent' }]}
        >
          <Text style={{ color: saved ? '#FFFFFF' : text, fontWeight: '700' }}>{saved ? 'Saved' : 'Save'}</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            const deepLink = ExpoLinking.createURL('/spot', { queryParams: { placeId: placeId || '', name: displayName } });
            const message = `${displayName}\n${deepLink}`;
            Share.share({ message });
          }}
          style={[styles.secondary, { borderColor: border }]}
        >
          <Text style={{ color: text, fontWeight: '700' }}>Share spot</Text>
        </Pressable>
      </View>

      {friendsHere.length ? (
        <View style={{ marginTop: 16 }}>
          <Text style={{ color: muted, marginBottom: 6 }}>Friends here now</Text>
          {friendsHere.map((f) => (
            <View key={f.id} style={[styles.row, { borderColor: border, backgroundColor: card }]}>
              <Text style={{ color: text, fontWeight: '600' }}>{f.name || 'Friend'}</Text>
              <Text style={{ color: muted }}>{f.handle ? `@${f.handle}` : f.email || ''}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {peopleHere.length ? (
        <View style={{ marginTop: 16 }}>
          <Text style={{ color: muted, marginBottom: 6 }}>People here now</Text>
          {peopleHere.map((p) => (
            <View key={p.id} style={[styles.row, { borderColor: border, backgroundColor: card }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: text, fontWeight: '600' }}>{p.name || 'Student'}</Text>
                <Text style={{ color: muted }}>{p.handle ? `@${p.handle}` : p.email || ''}</Text>
              </View>
              <Pressable
                onPress={() => user && sendFriendRequest(user.id, p.id)}
                style={[styles.addButton, { backgroundColor: primary }]}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Add</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {recentCheckins.length ? (
        <View style={{ marginTop: 16 }}>
          <Text style={{ color: muted, marginBottom: 6 }}>Recent check-ins</Text>
          {recentCheckins.map((c) => {
            const remaining = formatTimeRemaining(c);
            const candidate = c.photoUrl || (c as any).photoURL || (c as any).imageUrl || (c as any).imageURL || c.image;
            const photo = typeof candidate === 'string' && isWeb && (candidate.startsWith('file:') || candidate.startsWith('blob:'))
              ? c.image
              : candidate;
            return (
            <View key={c.id} style={[styles.feedRow, { borderColor: border, backgroundColor: card }]}>
              {photo ? (
                <SpotImage source={{ uri: photo }} style={styles.feedThumb} />
              ) : (
                <View style={[styles.feedThumb, { backgroundColor: border }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={{ color: text, fontWeight: '600' }}>{c.userName || 'Someone'}</Text>
                <Text style={{ color: muted }}>{c.caption || 'Checked in'}</Text>
                <Text style={{ color: muted, marginTop: 4 }}>{formatTime(c.createdAt)}</Text>
                {remaining ? <Text style={{ color: muted, marginTop: 2 }}>{remaining}</Text> : null}
              </View>
              <Pressable
                onPress={async () => {
                  setReactions((prev) => ({ ...prev, [c.id]: (prev[c.id] || 0) + 1 }));
                  await logEvent('checkin_reacted', user?.id, { checkinId: c.id, spot: displayName, reaction: 'wave' });
                }}
                style={[styles.reaction, { borderColor: border }]}
              >
                <Text style={{ color: text }}>👋 {reactions[c.id] || 0}</Text>
              </Pressable>
            </View>
          );
          })}
        </View>
      ) : (
        <Body style={{ color: muted, marginTop: 12 }}>No recent check-ins yet.</Body>
      )}

      {intelligence ? (
        <ScoreBreakdownSheet
          visible={showBreakdown}
          intelligence={intelligence}
          checkinCount={visibleCheckins.length}
          onDismiss={() => setShowBreakdown(false)}
        />
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  intelCard: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 12,
    marginBottom: 4,
  },
  intelRow: { flexDirection: 'row', marginTop: 10, ...gapStyle(10) },
  intelItem: { flex: 1, alignItems: 'flex-start' },
  intelChipRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, ...gapStyle(8) },
  intelChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  useCaseRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8, ...gapStyle(8) },
  useCaseChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  forecastRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, ...gapStyle(8) },
  forecastChip: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 7,
    minWidth: 62,
  },
  map: {
    width: '100%',
    height: 220,
    borderRadius: 18,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 3,
  },
  cta: { paddingVertical: 12, borderRadius: 14, alignItems: 'center' },
  actionRow: { flexDirection: 'row', marginTop: 10, flexWrap: 'wrap', ...gapStyle(10) },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6, ...gapStyle(8) },
  tagChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  secondary: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
  row: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8 },
  feedRow: { borderWidth: 1, borderRadius: 14, padding: 10, marginBottom: 8, flexDirection: 'row', ...gapStyle(10) },
  feedThumb: { width: 56, height: 56, borderRadius: 10 },
  addButton: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  densityRow: { flexDirection: 'row', ...gapStyle(6) },
  densityBar: { flex: 1, height: 40, borderRadius: 8, overflow: 'hidden' },
  densityFill: { width: '100%', borderRadius: 8 },
  reaction: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, alignSelf: 'flex-start' },
});
