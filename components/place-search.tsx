import { Body, H2, Label } from '@/components/ui/typography';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { tokens } from '@/constants/tokens';
import { useThemeColor } from '@/hooks/use-theme-color';
import {
  searchPlacesResponse,
  searchPlacesNearbyResponse,
  searchPlacesWithBiasResponse,
  type PlaceSearchResponse,
} from '@/services/googleMaps';
import { devLog } from '@/services/logger';
import { isDemoMode } from '@/services/demoMode';
import { getRecentSpots, getTopSpotsLocal } from '@/storage/local';
import { requestForegroundLocation } from '@/services/location';
import { getProviderProxyUserMessage } from '@/services/providerProxy';
import { haversine } from '@/utils/geo';
import React, { useEffect, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { geocodeAsync, reverseGeocodeAsync, type LocationGeocodedAddress } from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function formatDistance(distanceKm?: number) {
  if (distanceKm === undefined || distanceKm === Infinity) return '';
  const miles = distanceKm * 0.621371;
  return `${Math.round(miles * 10) / 10} mi`;
}

function buildFallbackResults(query: string, nearby: any[], recents: any[], topSpots: string[]) {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const fromNearby = nearby
    .filter((r) => (r?.name || '').toLowerCase().includes(needle))
    .map((r) => ({
      placeId: r.placeId || '',
      name: r.name,
      address: r.address,
      location: r.location,
      distanceKm: r.distanceKm,
    }))
    .filter((r) => r.placeId && r.name);

  const fromRecents = recents
    .filter((r) => (r?.name || '').toLowerCase().includes(needle))
    .map((r) => ({
      placeId: r.placeId || '',
      name: r.name,
      location: r.location,
      distanceKm: r.distanceKm,
    }))
    .filter((r) => r.placeId && r.name);

  if (!isDemoMode()) {
    const merged = [...fromNearby, ...fromRecents];
    const byId = new Map<string, any>();
    merged.forEach((item) => {
      const id = item.placeId || item.name;
      if (!byId.has(id)) byId.set(id, item);
    });
    return Array.from(byId.values()).slice(0, 8);
  }

  const fromTop = topSpots
    .filter((name) => String(name || '').toLowerCase().includes(needle))
    .map((name) => ({ placeId: `top:${name}`, name }));

  const merged = [...fromNearby, ...fromRecents, ...fromTop];
  const byId = new Map<string, any>();
  merged.forEach((item) => {
    const id = item.placeId || item.name;
    if (!byId.has(id)) byId.set(id, item);
  });
  return Array.from(byId.values()).slice(0, 8);
}

function slugifyPlacePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildSyntheticPlaceId(name: string, lat: number, lng: number) {
  const slug = slugifyPlacePart(name) || 'place';
  return `native:${slug}:${lat.toFixed(4)}:${lng.toFixed(4)}`;
}

function formatReverseAddress(address: LocationGeocodedAddress | null | undefined) {
  if (!address) return undefined;
  if (typeof address.formattedAddress === 'string' && address.formattedAddress.trim()) {
    return address.formattedAddress.trim();
  }
  const streetLine = [address.streetNumber, address.street]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(' ');
  const localityLine = [address.city, address.region, address.postalCode]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .join(', ');
  const composed = [streetLine, localityLine].filter(Boolean).join(', ');
  return composed || undefined;
}

async function searchPlacesWithNativeGeocoder(
  query: string,
  loc: { lat: number; lng: number } | null,
  limit = 8,
) {
  if (Platform.OS === 'web') return [];
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  try {
    const geocoded = await geocodeAsync(trimmed);
    if (!Array.isArray(geocoded) || !geocoded.length) return [];

    const unique = new Map<
      string,
      { lat: number; lng: number; distanceKm: number }
    >();

    geocoded.forEach((item) => {
      if (
        typeof item?.latitude !== 'number' ||
        !Number.isFinite(item.latitude) ||
        typeof item?.longitude !== 'number' ||
        !Number.isFinite(item.longitude)
      ) {
        return;
      }
      const key = `${item.latitude.toFixed(4)}:${item.longitude.toFixed(4)}`;
      if (unique.has(key)) return;
      const distanceKm = loc
        ? haversine(loc, { lat: item.latitude, lng: item.longitude })
        : Infinity;
      unique.set(key, { lat: item.latitude, lng: item.longitude, distanceKm });
    });

    const ranked = Array.from(unique.values())
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, Math.max(1, Math.min(limit, 6)));

    const enriched = await Promise.all(
      ranked.map(async (item) => {
        let address: LocationGeocodedAddress | null = null;
        try {
          const reversed = await reverseGeocodeAsync({
            latitude: item.lat,
            longitude: item.lng,
          });
          address = Array.isArray(reversed) && reversed.length ? reversed[0] : null;
        } catch {}

        const resolvedName =
          (typeof address?.name === 'string' && address.name.trim()) || trimmed;

        return {
          placeId: buildSyntheticPlaceId(resolvedName, item.lat, item.lng),
          name: resolvedName,
          address: formatReverseAddress(address),
          location: { lat: item.lat, lng: item.lng },
          distanceKm: item.distanceKm,
        };
      }),
    );

    return enriched.filter((item) => item.placeId && item.name);
  } catch (error) {
    devLog('native place geocoder error', error);
    return [];
  }
}

export default function PlaceSearch({ visible, onClose, onSelect }: { visible: boolean; onClose: () => void; onSelect: (place: any) => void | Promise<void> }) {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [recents, setRecents] = useState<any[]>([]);
  const [topSpots, setTopSpots] = useState<string[]>([]);
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null); 
  const [nearby, setNearby] = useState<any[]>([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
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
      setNearbyError(null);
      setLoading(false);
    }
  }, [visible]);

  function getSearchErrorMessage(response: PlaceSearchResponse | null, fallbackMessage: string) {
    const code = response?.diagnostics?.errorCode;
    if (code === 'client_provider_error') return fallbackMessage;
    if (typeof code === 'string') {
      return getProviderProxyUserMessage(code, 'places');
    }
    return fallbackMessage;
  }

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
        setNearbyError(null);
        const response = await searchPlacesNearbyResponse(loc.lat, loc.lng, 1200, 'study');
        const results = response.places;
        if (response.status === 'error') {
          setNearbyError(getSearchErrorMessage(response, 'Nearby suggestions are temporarily unavailable.'));
        } else if (!results.length) {
          setNearbyError('No nearby spots found right now. Try searching by name.');
        }
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
      const primary = loc
        ? await searchPlacesWithBiasResponse(q, loc.lat, loc.lng, 12000, 8)
        : await searchPlacesResponse(q, 8);
      if (primary.places.length) {
        setResults(primary.places);
        setError(null);
        return;
      }

      if (loc) {
        const globalResults = await searchPlacesResponse(q, 8);
        if (globalResults.places.length) {
          setResults(globalResults.places);
          setError(null);
          return;
        }
        if (primary.status === 'error' || globalResults.status === 'error') {
          setError(
            getSearchErrorMessage(
              primary.status === 'error' ? primary : globalResults,
              'Unable to search places.',
            ),
          );
        }
      }

      const nativeResults = await searchPlacesWithNativeGeocoder(q, loc, 8);
      if (nativeResults.length) {
        setResults(nativeResults);
        setError(null);
        return;
      }

      const fallback = buildFallbackResults(q, nearby, recents, topSpots);
      setResults(fallback);
      setError(
        fallback.length
          ? null
          : primary.status === 'error'
            ? getSearchErrorMessage(primary, 'Unable to search places.')
            : 'No results found.',
      );
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Unable to search places.';
      const lowered = raw.toLowerCase();
      const message =
        lowered.includes('api key') || lowered.includes('not authorized') || lowered.includes('referer')
          ? 'Maps API key rejected. Enable Places API and allow this platform in key restrictions.'
          : raw;
      devLog('place search error', e);
      const nativeResults = await searchPlacesWithNativeGeocoder(q, loc, 8);
      if (nativeResults.length) {
        setResults(nativeResults);
        setError(null);
        return;
      }
      const fallback = buildFallbackResults(q, nearby, recents, topSpots);
      setResults(fallback);
      setError(fallback.length ? null : message);
    } finally {
      setLoading(false);
    }
  }, [loc, nearby, q, recents, topSpots]);

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
    try {
      await Promise.resolve(onSelect(place));
      onClose();
    } catch {}
  }

  async function resolveAndSelect(name: string) {
    try {
      setLoading(true);
      setError(null);
      const localRecent = recents.find(
        (item) =>
          typeof item?.placeId === 'string' &&
          item.placeId &&
          String(item?.name || '').trim().toLowerCase() === name.trim().toLowerCase(),
      );
      if (localRecent) {
        await handleSelect({
          placeId: localRecent.placeId,
          name: localRecent.name,
          location: localRecent.location,
        });
        return;
      }

      const res = loc
        ? await searchPlacesWithBiasResponse(name, loc.lat, loc.lng, 12000, 1)
        : await searchPlacesResponse(name, 1);
      if (res.places.length) {
        await handleSelect(res.places[0]);
        return;
      }
      if (loc) {
        const globalResults = await searchPlacesResponse(name, 1);
        if (globalResults.places.length) {
          await handleSelect(globalResults.places[0]);
          return;
        }
        if (res.status === 'error' || globalResults.status === 'error') {
          setError(
            getSearchErrorMessage(
              res.status === 'error' ? res : globalResults,
              'Unable to verify spot. Try searching again.',
            ),
          );
        }
      }
      const nativeResults = await searchPlacesWithNativeGeocoder(name, loc, 1);
      if (nativeResults.length) {
        await handleSelect(nativeResults[0]);
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
      <View
        style={[
          styles.container,
          { backgroundColor: bg, paddingTop: Math.max(insets.top, tokens.space.s12) },
        ]}
      >
        <Pressable onPress={onClose} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Back">
          <IconSymbol name="chevron.left" size={18} color={primary} />
          <Text style={[styles.backLabel, { color: primary }]}>Back</Text>
        </Pressable>
        <Label style={{ color: muted, marginBottom: tokens.space.s8 }}>Find a spot</Label>
        <H2 style={{ color: text }}>Search places</H2>
        <View style={{ height: tokens.space.s12 }} />
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
          <Pressable onPress={() => { setQ(''); setResults([]); }} style={{ alignSelf: 'flex-start', marginTop: tokens.space.s8 }}>
            <Text style={{ color: primary, fontWeight: '600' }}>Clear</Text>
          </Pressable>
        ) : null}
        <View style={{ height: tokens.space.s12 }} />
        {loading ? <Text style={{ color: muted, marginBottom: tokens.space.s8 }}>Searching…</Text> : null}
        {error ? <Text style={{ color: danger, marginBottom: tokens.space.s8 }}>{error}</Text> : null}
        <Pressable onPress={doSearch} style={[styles.searchButton, { backgroundColor: primary }]} disabled={loading || q.trim().length < 2}>
          <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{loading ? 'Searching…' : 'Search'}</Text>
        </Pressable>
        <View style={{ height: tokens.space.s12 }} />
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
              <View style={{ marginBottom: tokens.space.s12 }}>
                {nearbyLoading ? <Text style={{ color: muted, marginBottom: tokens.space.s8 }}>Finding nearby spots…</Text> : null}
                {nearbyError ? <Text style={{ color: danger, marginBottom: tokens.space.s8 }}>{nearbyError}</Text> : null}
                {nearby.length ? (
                  <View style={{ marginBottom: tokens.space.s12 }}>
                    <Label style={{ color: muted, marginBottom: tokens.space.s6 }}>Nearby suggestions</Label>
                    {nearby.map((r) => (
                      <Pressable
                        key={`nearby-${r.placeId}`}
                        onPress={() => { void handleSelect(r); }}
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
                  <View style={{ marginBottom: tokens.space.s12 }}>
                    <Label style={{ color: muted, marginBottom: tokens.space.s6 }}>Recent spots</Label>
                    {recents.map((r) => (
                      <Pressable
                        key={`recent-${r.placeId || r.name}`}
                        onPress={() => {
                          if (r.placeId) {
                            void handleSelect({
                              placeId: r.placeId,
                              name: r.name,
                              location: r.location,
                            });
                          } else {
                            void resolveAndSelect(r.name);
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
            <Pressable onPress={() => { void handleSelect(item); }} style={[styles.row, { borderColor: border, backgroundColor: card }]}>
              <Body style={{ color: text }}>{item.name}</Body>
              {item.address ? <Body style={{ color: muted }}>{item.address}</Body> : null}
            </Pressable>
          )}
        />
        {!q.trim() && topSpots.length ? (
          <View style={{ marginTop: tokens.space.s4 }}>
            <Label style={{ color: muted, marginBottom: tokens.space.s6 }}>Top picks</Label>
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
          <Text style={{ color: muted, marginTop: tokens.space.s8 }}>Type at least 2 letters to search.</Text>
        ) : null}
        <View style={{ height: tokens.space.s12 }} />
        <Pressable onPress={onClose} style={[styles.close, { borderColor: border, backgroundColor: card }]}>
          <Text style={{ color: primary, fontWeight: '600' }}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: tokens.space.s20,
    paddingBottom: tokens.space.s20,
  },
  backButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.space.s6,
    marginBottom: tokens.space.s12,
  },
  backLabel: { fontSize: 16, fontWeight: '700' },
  input: { borderWidth: 1, padding: tokens.space.s12, borderRadius: tokens.radius.r14 },
  searchButton: { padding: tokens.space.s12, borderRadius: tokens.radius.r14, alignItems: 'center' },
  row: { padding: tokens.space.s12, borderWidth: 1, borderRadius: tokens.radius.r16, marginBottom: tokens.space.s10 },
  close: { padding: tokens.space.s12, borderWidth: 1, borderRadius: tokens.radius.r14, alignItems: 'center' },
});
