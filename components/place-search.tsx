import { Body, H2, Label } from '@/components/ui/typography';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getMapsKey, searchPlaces, searchPlacesNearby } from '@/services/googleMaps';
import { devLog } from '@/services/logger';
import { isDemoMode } from '@/services/demoMode';
import { getRecentSpots, getTopSpotsLocal } from '@/storage/local';
import { requestForegroundLocation } from '@/services/location';
import React, { useEffect, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDlat = Math.sin(dLat / 2) * Math.sin(dLat / 2);
  const sinDlon = Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(sinDlat + Math.cos(lat1) * Math.cos(lat2) * sinDlon), Math.sqrt(1 - (sinDlat + Math.cos(lat1) * Math.cos(lat2) * sinDlon)));
  return R * c;
}

function formatDistance(distanceKm?: number) {
  if (distanceKm === undefined || distanceKm === Infinity) return '';
  const miles = distanceKm * 0.621371;
  return `${Math.round(miles * 10) / 10} mi`;
}

export default function PlaceSearch({ visible, onClose, onSelect }: { visible: boolean; onClose: () => void; onSelect: (place: any) => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [recents, setRecents] = useState<any[]>([]);
  const [topSpots, setTopSpots] = useState<string[]>([]);
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null); 
  const [nearby, setNearby] = useState<any[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const bg = useThemeColor({}, 'background');
  const border = useThemeColor({}, 'border');
  const primary = useThemeColor({}, 'primary');
  const danger = useThemeColor({}, 'danger');
  const text = useThemeColor({}, 'text');
  const card = useThemeColor({}, 'card');
  const muted = useThemeColor({}, 'muted');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setQ('');
      setResults([]);
      setError(null);
      setLoading(false);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        const pos = await requestForegroundLocation();
        if (pos) setLoc(pos);
      } catch {}
    })();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    (async () => {
      try {
        const recent = await getRecentSpots(6);
        if (loc) {
          const enriched = recent.map((r) => {
            if (!r.location) return { ...r, distanceKm: Infinity };
            return { ...r, distanceKm: haversine(loc, r.location) };
          }).sort((a, b) => (a.distanceKm || 9999) - (b.distanceKm || 9999));
          setRecents(enriched);
        } else {
          setRecents(recent);
        }
        const top = await getTopSpotsLocal(6);
        setTopSpots(top);
      } catch {
        setRecents([]);
        setTopSpots([]);
      }
    })();
  }, [visible, loc]);

  useEffect(() => {
    if (!visible || !loc) return;
    if (q.trim().length) return;
    let alive = true;
    (async () => {
      try {
        setNearbyLoading(true);
        const results = await searchPlacesNearby(loc.lat, loc.lng, 1200, 'study');
        if (!alive) return;
        const enriched = results.map((r) => {
          if (!r.location) return { ...r, distanceKm: Infinity };
          return { ...r, distanceKm: haversine(loc, r.location) };
        }).sort((a, b) => (a.distanceKm || 9999) - (b.distanceKm || 9999));
        setNearby(enriched.slice(0, 8));
      } catch {
        if (alive) setNearby([]);
      } finally {
        if (alive) setNearbyLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [visible, loc, q]);

  const doSearch = React.useCallback(async () => {
    if (!q) return;
    try {
      setLoading(true);
      setError(null);
      const key = getMapsKey();
      if (!key) {
        if (isDemoMode()) {
          const needle = q.trim().toLowerCase();
          const fromRecents = recents
            .filter((r) => (r?.name || '').toLowerCase().includes(needle))
            .map((r) => ({ placeId: r.placeId || `recent:${r.name}`, name: r.name, location: r.location }));
          const fromTop = topSpots
            .filter((name) => String(name || '').toLowerCase().includes(needle))
            .map((name) => ({ placeId: `top:${name}`, name }));
          const merged = [...fromRecents, ...fromTop].filter((it) => it?.name);
          const byId = new Map<string, any>();
          merged.forEach((it) => {
            const id = it.placeId || it.name;
            if (!byId.has(id)) byId.set(id, it);
          });
          const next = Array.from(byId.values()).slice(0, 8);
          setResults(next);
          setError(next.length ? null : 'No results found.');
          return;
        }
        setError('Google Maps API key missing.');
        setResults([]);
        return;
      }
      const res = await searchPlaces(q, 8);
      setResults(res);
      setError(res.length ? null : 'No results found.');
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Unable to search places.';
      const lowered = raw.toLowerCase();
      const message =
        lowered.includes('api key') || lowered.includes('not authorized') || lowered.includes('referer')
          ? 'Maps API key rejected. Enable Places API and allow this platform in key restrictions.'
          : raw;
      devLog('place search error', e);
      setError(message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [q, recents, topSpots]);

  useEffect(() => {
    if (!visible) return;
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const id = setTimeout(() => {
      if (q.trim().length >= 2) void doSearch();
    }, 350);
    return () => clearTimeout(id);
  }, [q, visible, doSearch]);

  async function handleSelect(place: any) {
    onSelect(place);
    onClose();
  }

  async function resolveAndSelect(name: string) {
    try {
      setLoading(true);
      setError(null);
      const res = await searchPlaces(name, 1);
      if (res.length) {
        await handleSelect(res[0]);
        return;
      }
      setError('Unable to verify spot. Try searching again.');
    } catch {
      setError('Unable to verify spot. Try searching again.');
    } finally {
      setLoading(false);
    }
  }


  return (
    <Modal visible={visible} animationType="slide">
      <View style={[styles.container, { backgroundColor: bg }]}>
        <Label style={{ color: muted, marginBottom: 8 }}>Find a spot</Label>
        <H2 style={{ color: text }}>Search places</H2>
        <View style={{ height: 12 }} />
        <TextInput
          placeholder="Search places"
          value={q}
          onChangeText={(val) => {
            setQ(val);
            if (error) setError(null);
          }}
          placeholderTextColor={muted}
          style={[styles.input, { borderColor: border, backgroundColor: card, color: text }]}
          onSubmitEditing={doSearch}
        />
        {q ? (
          <Pressable onPress={() => { setQ(''); setResults([]); }} style={{ alignSelf: 'flex-start', marginTop: 8 }}>
            <Text style={{ color: primary, fontWeight: '600' }}>Clear</Text>
          </Pressable>
        ) : null}
        <View style={{ height: 12 }} />
        {loading ? <Text style={{ color: muted, marginBottom: 8 }}>Searching…</Text> : null}
        {error ? <Text style={{ color: danger, marginBottom: 8 }}>{error}</Text> : null}
        <Pressable onPress={doSearch} style={[styles.searchButton, { backgroundColor: primary }]} disabled={loading || q.trim().length < 2}>
          <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{loading ? 'Searching…' : 'Search'}</Text>
        </Pressable>
        <View style={{ height: 12 }} />
        <FlatList
          data={results}
          keyExtractor={(i) => i.placeId || i.name}
          initialNumToRender={8}
          maxToRenderPerBatch={10}
          windowSize={7}
          updateCellsBatchingPeriod={50}
          removeClippedSubviews={Platform.OS !== 'web'}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            !q.trim() ? (
              <View style={{ marginBottom: 12 }}>
                {nearbyLoading ? <Text style={{ color: muted, marginBottom: 8 }}>Finding nearby spots…</Text> : null}
                {nearby.length ? (
                  <View style={{ marginBottom: 12 }}>
                    <Label style={{ color: muted, marginBottom: 6 }}>Nearby suggestions</Label>
                    {nearby.map((r) => (
                      <Pressable
                        key={`nearby-${r.placeId}`}
                        onPress={() => handleSelect(r)}
                        style={[styles.row, { borderColor: border, backgroundColor: card }]}
                      >
                        <Body style={{ color: text }}>{r.name}</Body>
                        <Body style={{ color: muted }}>
                          Nearby{typeof r.distanceKm === 'number' && r.distanceKm !== Infinity ? ` · ${formatDistance(r.distanceKm)}` : ''}
                        </Body>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                {recents.length ? (
                  <View style={{ marginBottom: 12 }}>
                    <Label style={{ color: muted, marginBottom: 6 }}>Recent spots</Label>
                    {recents.map((r) => (
                      <Pressable
                        key={`recent-${r.placeId || r.name}`}
                        onPress={() => {
                          if (r.placeId) {
                            handleSelect({
                              placeId: r.placeId,
                              name: r.name,
                              location: r.location,
                            });
                          } else {
                            resolveAndSelect(r.name);
                          }
                        }}
                        style={[styles.row, { borderColor: border, backgroundColor: card }]}
                      >
                        <Body style={{ color: text }}>{r.name}</Body>
                        <Body style={{ color: muted }}>
                          Recent{typeof r.distanceKm === 'number' && r.distanceKm !== Infinity ? ` · ${formatDistance(r.distanceKm)}` : ''}
                        </Body>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => { onSelect(item); onClose(); }} style={[styles.row, { borderColor: border, backgroundColor: card }]}>
              <Body style={{ color: text }}>{item.name}</Body>
              {item.address ? <Body style={{ color: muted }}>{item.address}</Body> : null}
            </Pressable>
          )}
        />
        {!q.trim() && topSpots.length ? (
          <View style={{ marginTop: 4 }}>
            <Label style={{ color: muted, marginBottom: 6 }}>Top picks</Label>
            {topSpots.map((name) => (
              <Pressable
                key={`top-${name}`}
                onPress={() => resolveAndSelect(name)}
                style={[styles.row, { borderColor: border, backgroundColor: card }]}
              >
                <Body style={{ color: text }}>{name}</Body>
                <Body style={{ color: muted }}>Most visited</Body>
              </Pressable>
            ))}
          </View>
        ) : null}
        {!results.length && !nearby.length && !loading && !nearbyLoading && !error && q.trim().length < 2 ? (
          <Text style={{ color: muted, marginTop: 8 }}>Type at least 2 letters to search.</Text>
        ) : null}
        <View style={{ height: 12 }} />
        <Pressable onPress={onClose} style={[styles.close, { borderColor: border, backgroundColor: card }]}>
          <Text style={{ color: primary, fontWeight: '600' }}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  input: { borderWidth: 1, padding: 12, borderRadius: 14 },
  searchButton: { padding: 12, borderRadius: 14, alignItems: 'center' },
  row: { padding: 12, borderWidth: 1, borderRadius: 16, marginBottom: 10 },
  close: { padding: 12, borderWidth: 1, borderRadius: 14, alignItems: 'center' },
});
