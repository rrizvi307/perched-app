import MapView, { Marker, PROVIDER_GOOGLE } from '@/components/map/index';
import { ThemedView } from '@/components/themed-view';
import SpotImage from '@/components/ui/spot-image';
import {
  FilterBottomSheet,
  isIntelV1Enabled,
} from '@/components/ui/FilterBottomSheet';
import { Atmosphere } from '@/components/ui/atmosphere';
import SpotListItem from '@/components/ui/spot-list-item';
import { SpotIntelligence } from '@/components/ui/SpotIntelligence';
import { Body, H1, Label } from '@/components/ui/typography';
import { IconSymbol } from '@/components/ui/icon-symbol';
import SegmentedControl from '@/components/ui/segmented-control';
import StatusBanner from '@/components/ui/status-banner';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useToast } from '@/contexts/ToastContext';
import {
  ensureFirebase,
  getBlockedUsers,
  getCheckinsRemote,
  getUserFriendsCached,
} from '@/services/firebaseClient';
import {
  CLIENT_FILTERS,
  DEFAULT_FILTERS,
  FIRESTORE_FILTERS,
  FilterState,
  MAX_FIRESTORE_FILTERS,
  getActiveFilterCount,
  hasActiveFilters,
  normalizeQueryFilters,
} from '@/services/filterPolicy';
import { requestForegroundLocation } from '@/services/location';
import { normalizeSpotForExplore, normalizeSpotsForExplore } from '@/services/spotNormalizer';
import { spotKey } from '@/services/spotUtils';
import { syncPendingCheckins } from '@/services/syncPending';
import {
  getCheckins,
  getLocationEnabled,
  getPermissionPrimerSeen,
  seedDemoNetwork,
  setPermissionPrimerSeen,
} from '@/storage/local';
import { withAlpha } from '@/utils/colors';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { distanceBetween, geohashQueryBounds } from 'geofire-common';
import * as Linking from 'expo-linking';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { DEMO_USER_IDS, isDemoMode } from '@/services/demoMode';

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function formatDistance(distanceKm?: number) {
  if (distanceKm === undefined || distanceKm === Infinity) return '';
  const miles = distanceKm * 0.621371;
  const walkMinutes = Math.max(1, Math.round((distanceKm / 5) * 60));
  if (miles < 0.1) return '< 1 min walk';
  return `${miles.toFixed(1)} mi · ${walkMinutes} min walk`;
}

function describeSpot(name?: string, address?: string) {
  const hay = `${name || ''} ${address || ''}`.toLowerCase();
  if (hay.includes('library')) return 'Library';
  if (hay.includes('cowork')) return 'Coworking';
  if (hay.includes('cafe') || hay.includes('coffee')) return 'Cafe';
  if (hay.includes('campus') || hay.includes('university') || hay.includes('college')) return 'Campus spot';
  return 'Spot';
}

function buildSpotTags(spot: any) {
  const tags: string[] = [];
  if (spot.openNow === true) tags.push('Open now');
  if (spot.openNow === false) tags.push('Closed now');
  if (spot?.intel?.goodForStudying) tags.push('Good for studying');
  if (spot?.intel?.goodForMeetings) tags.push('Good for meetings');
  if (spot?.display?.noise) tags.push(String(spot.display.noise));
  return Array.from(new Set(tags)).slice(0, 3);
}

function aggregateSpotMetrics(checkins: any[]) {
  const now = Date.now();
  const twoHoursMs = 2 * 60 * 60 * 1000;
  const noiseValues: number[] = [];
  const busynessValues: number[] = [];
  const hereNowUsers = new Set<string>();

  checkins.forEach((item) => {
    const noise = typeof item.noiseLevel === 'number'
      ? item.noiseLevel
      : item.noiseLevel === 'quiet'
        ? 2
        : item.noiseLevel === 'moderate'
          ? 3
          : item.noiseLevel === 'loud' || item.noiseLevel === 'lively'
            ? 4
            : null;
    const busy = typeof item.busyness === 'number'
      ? item.busyness
      : item.busyness === 'empty'
        ? 1
        : item.busyness === 'some'
          ? 3
          : item.busyness === 'packed'
            ? 5
            : null;

    if (typeof noise === 'number') noiseValues.push(noise);
    if (typeof busy === 'number') busynessValues.push(busy);

    const ts = item.createdAt?.seconds
      ? item.createdAt.seconds * 1000
      : typeof item.createdAt === 'number'
        ? item.createdAt
        : typeof item.timestamp === 'number'
          ? item.timestamp
          : Date.parse(item.createdAt || item.timestamp || '');

    if (ts && now - ts <= twoHoursMs && item.userId) {
      hereNowUsers.add(item.userId);
    }
  });

  return {
    avgNoiseLevel: noiseValues.length
      ? Math.round((noiseValues.reduce((sum, value) => sum + value, 0) / noiseValues.length) * 10) / 10
      : null,
    avgBusyness: busynessValues.length
      ? Math.round((busynessValues.reduce((sum, value) => sum + value, 0) / busynessValues.length) * 10) / 10
      : null,
    hereNowCount: hereNowUsers.size,
  };
}

function buildSpotsFromCheckins(items: any[], focus: { lat: number; lng: number } | null) {
  const grouped: Record<string, any> = {};

  items.forEach((item) => {
    const name = item.spotName || item.spot || 'Unknown';
    const key = spotKey(item.spotPlaceId, name);

    if (!grouped[key]) {
      grouped[key] = {
        key,
        name,
        count: 0,
        example: item,
        openNow: typeof item.openNow === 'boolean' ? item.openNow : undefined,
        _checkins: [],
      };
    }

    grouped[key].count += 1;
    grouped[key]._checkins.push(item);
    if (typeof item.openNow === 'boolean') grouped[key].openNow = item.openNow;
  });

  const spots = Object.values(grouped).map((spot: any) => {
    const metrics = aggregateSpotMetrics(spot._checkins || []);
    const coords = spot.example?.spotLatLng || spot.example?.location;
    const distance =
      focus && typeof coords?.lat === 'number' && typeof coords?.lng === 'number'
        ? haversine(focus, { lat: coords.lat, lng: coords.lng })
        : Infinity;

    return {
      ...spot,
      ...metrics,
      distance,
    };
  });

  spots.sort((a: any, b: any) => {
    const distA = a.distance ?? Infinity;
    const distB = b.distance ?? Infinity;
    if (distA !== distB) return distA - distB;
    return (b.count || 0) - (a.count || 0);
  });

  return spots;
}

export default function Explore() {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const demoMode = isDemoMode();

  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');
  const primary = useThemeColor({}, 'primary');
  const accent = useThemeColor({}, 'accent');
  const success = useThemeColor({}, 'success');
  const highlight = withAlpha(primary, 0.12);

  const [query, setQuery] = useState('');
  const deferredQuery = React.useDeferredValue(query);

  const [scope, setScope] = useState<'everyone' | 'friends' | 'campus'>('everyone');
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);

  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [mapFocus, setMapFocus] = useState<{ lat: number; lng: number } | null>(null);
  const [locBusy, setLocBusy] = useState(false);

  const [spots, setSpots] = useState<any[]>([]);
  const [intelSpots, setIntelSpots] = useState<any[]>([]);
  const [intelFetched, setIntelFetched] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const [status, setStatus] = useState<{ message: string; tone: 'info' | 'warning' | 'error' | 'success' } | null>(null);

  const [friendIds, setFriendIds] = useState<string[]>(() => (demoMode ? [...DEMO_USER_IDS] : []));
  const [blockedIds, setBlockedIds] = useState<string[]>([]);

  const [selectedSpot, setSelectedSpot] = useState<any | null>(null);

  const slowQueryNoticeRef = useRef(false);
  const mapViewRef = useRef<any>(null);

  const campusKey = user?.campus || null;
  const rawIntelFlag = (Constants.expoConfig as any)?.extra?.INTEL_V1_ENABLED;
  const intelV1Enabled = useMemo(() => {
    if (rawIntelFlag === true || rawIntelFlag === 'true' || rawIntelFlag === 1 || rawIntelFlag === '1') return true;
    return isIntelV1Enabled();
  }, [rawIntelFlag]);

  const friendIdsKey = useMemo(() => friendIds.slice().sort().join(','), [friendIds]);
  const blockedIdsKey = useMemo(() => blockedIds.slice().sort().join(','), [blockedIds]);
  const friendIdSet = useMemo(() => new Set(friendIdsKey ? friendIdsKey.split(',').filter(Boolean) : []), [friendIdsKey]);
  const blockedIdSet = useMemo(() => new Set(blockedIdsKey ? blockedIdsKey.split(',').filter(Boolean) : []), [blockedIdsKey]);

  const mapCenter = useMemo(() => {
    if (mapFocus) return mapFocus;
    if (loc) return loc;
    return { lat: 29.7604, lng: -95.3698 };
  }, [mapFocus, loc]);

  const mapKey = (Constants.expoConfig as any)?.extra?.GOOGLE_MAPS_API_KEY || null;
  const hasMapKey = !!mapKey;
  const canShowInteractiveMap = typeof MapView === 'function' && (!Platform.OS || Platform.OS !== 'web' || hasMapKey);

  const activeFilterCount = useMemo(() => getActiveFilterCount(filters), [filters]);
  const hasActiveFilterState = useMemo(() => hasActiveFilters(filters), [filters]);

  const passesScope = useCallback(
    (item: any) => {
      if (scope === 'friends') {
        if (!user) return false;
        return friendIdSet.has(item.userId);
      }
      if (scope === 'campus') {
        if (!campusKey) return false;
        return item.campus === campusKey || item.campusOrCity === campusKey;
      }
      return true;
    },
    [scope, user, friendIdSet, campusKey]
  );

  const applyFirestoreFilters = useCallback(
    (queryRef: any, nextFilters: FilterState) => {
      let next = queryRef;

      if (nextFilters.openNow) {
        next = next.where('intel.isOpenNow', '==', true);
      }

      if (nextFilters.priceLevel.length > 0) {
        next = next.where('intel.priceLevel', 'in', nextFilters.priceLevel);
      }

      if (nextFilters.goodForStudying) {
        next = next.where('intel.goodForStudying', '==', true);
      }

      if (nextFilters.goodForMeetings) {
        next = next.where('intel.goodForMeetings', '==', true);
      }

      return next;
    },
    []
  );

  const fetchNearbySpots = useCallback(
    async (userLat: number, userLng: number, radiusMiles: number, nextFilters: FilterState) => {
      const fb = ensureFirebase();
      if (!fb) return [] as any[];

      const db = fb.firestore();
      const { normalized: safeFilters, downgraded, activeFirestoreFilters } = normalizeQueryFilters(nextFilters);
      const radiusMeters = Math.max(0.5, Math.min(5, radiusMiles)) * 1609.34;
      const bounds = geohashQueryBounds([userLat, userLng], radiusMeters);
      const merged = new Map<string, any>();

      if (downgraded.length > 0 && !slowQueryNoticeRef.current) {
        slowQueryNoticeRef.current = true;
        showToast(
          `Optimized query mode: max ${MAX_FIRESTORE_FILTERS}/${FIRESTORE_FILTERS.length} Firestore filters, ${CLIENT_FILTERS.length} client-side filters.`,
          'info'
        );
      } else if (downgraded.length === 0 && slowQueryNoticeRef.current) {
        slowQueryNoticeRef.current = false;
      }

      try {
        const snapshots = await Promise.all(
          bounds.map((bound) => {
            let query: any = db.collection('spots').orderBy('geoHash').startAt(bound[0]).endAt(bound[1]);
            query = applyFirestoreFilters(query, safeFilters);
            return query.limit(140).get();
          })
        );

        snapshots.forEach((snapshot: any) => {
          snapshot.docs.forEach((doc: any) => {
            if (!merged.has(doc.id)) {
              merged.set(doc.id, { id: doc.id, ...doc.data() });
            }
          });
        });
      } catch {
        const fallback = await db.collection('spots').limit(260).get();
        fallback.docs.forEach((doc: any) => {
          if (!merged.has(doc.id)) {
            merged.set(doc.id, { id: doc.id, ...doc.data() });
          }
        });
      }

      const normalized = normalizeSpotsForExplore(Array.from(merged.values()))
        .map((spot: any) => {
          const lat = typeof spot?.lat === 'number' ? spot.lat : spot?.location?.lat;
          const lng = typeof spot?.lng === 'number' ? spot.lng : spot?.location?.lng;
          if (typeof lat !== 'number' || typeof lng !== 'number') return null;

          const distanceKm = distanceBetween([userLat, userLng], [lat, lng]);
          const distanceMeters = distanceKm * 1000;
          if (distanceMeters > radiusMeters) return null;

          const displayNoise = String(spot?.display?.noise || spot?.live?.noise || spot?.intel?.inferredNoise || '').toLowerCase();
          const displayBusyness = String(spot?.display?.busyness || spot?.live?.busyness || '').toLowerCase();
          const rating = typeof spot?.intel?.avgRating === 'number' ? spot.intel.avgRating : spot?.rating || 0;

          if (safeFilters.noiseLevel !== 'any' && displayNoise !== safeFilters.noiseLevel) return null;
          if (safeFilters.notCrowded && displayBusyness === 'packed') return null;
          if (safeFilters.highRated && rating < 4) return null;
          if (safeFilters.goodForStudying && spot?.intel?.goodForStudying !== true) return null;
          if (safeFilters.goodForMeetings && spot?.intel?.goodForMeetings !== true) return null;

          return {
            ...spot,
            distance: distanceKm,
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => (a.distance || Infinity) - (b.distance || Infinity));

      if (activeFirestoreFilters.length > MAX_FIRESTORE_FILTERS) {
        showToast('Some filters were applied client-side for speed.', 'info');
      }

      return normalized as any[];
    },
    [applyFirestoreFilters, showToast]
  );

  useEffect(() => {
    if (!intelV1Enabled || !loc) {
      setIntelSpots([]);
      setIntelFetched(false);
      return;
    }

    let active = true;
    void (async () => {
      try {
        const results = await fetchNearbySpots(loc.lat, loc.lng, filters.distance, filters);
        if (!active) return;
        setIntelSpots(results);
        setIntelFetched(true);
      } catch {
        if (!active) return;
        setIntelSpots([]);
        setIntelFetched(true);
      }
    })();

    return () => {
      active = false;
    };
  }, [intelV1Enabled, loc, filters, fetchNearbySpots]);

  useEffect(() => {
    void (async () => {
      if (!user) return;
      try {
        const ids = await getUserFriendsCached(user.id);
        setFriendIds(ids?.length ? ids : demoMode ? [...DEMO_USER_IDS] : []);
        const blocked = await getBlockedUsers(user.id);
        setBlockedIds(blocked || []);
      } catch {
        setFriendIds(demoMode ? [...DEMO_USER_IDS] : []);
        setBlockedIds([]);
      }
    })();
  }, [user, demoMode]);

  useEffect(() => {
    void (async () => {
      const enabled = await getLocationEnabled().catch(() => true);
      if (!enabled) return;
      const seen = await getPermissionPrimerSeen('location').catch(() => true);
      if (!seen) return;
      const current = await requestForegroundLocation();
      if (current) {
        setLoc(current);
        setMapFocus(current);
      }
    })();
  }, []);

  useEffect(() => {
    let active = true;

    void (async () => {
      setRefreshing(true);
      setLoading(true);

      try {
        if (demoMode) {
          await seedDemoNetwork(user?.id);
          const local = await getCheckins();
          const scoped = (local || []).filter((item: any) => {
            if (user && blockedIdSet.has(item.userId)) return false;
            if (!passesScope(item)) return false;
            if (item.visibility === 'friends' && (!user || !friendIdSet.has(item.userId))) return false;
            if (item.visibility === 'close' && (!user || !friendIdSet.has(item.userId))) return false;
            return true;
          });

          if (!active) return;
          setSpots(buildSpotsFromCheckins(scoped, loc || mapFocus || null));
          setStatus(null);
          setLoading(false);
          return;
        }

        const remote = await getCheckinsRemote(260);
        const items = (remote.items || []).filter((item: any) => {
          if (user && blockedIdSet.has(item.userId)) return false;
          if (!passesScope(item)) return false;
          if (item.visibility === 'friends' && (!user || !friendIdSet.has(item.userId))) return false;
          if (item.visibility === 'close' && (!user || !friendIdSet.has(item.userId))) return false;
          return true;
        });

        if (!active) return;
        setSpots(buildSpotsFromCheckins(items, loc || mapFocus || null));
        setStatus(null);
        setLoading(false);
        void syncPendingCheckins(1);
      } catch {
        const local = await getCheckins();
        const fallback = (local || []).filter((item: any) => {
          if (user && blockedIdSet.has(item.userId)) return false;
          if (!passesScope(item)) return false;
          if (item.visibility === 'friends' && (!user || !friendIdSet.has(item.userId))) return false;
          if (item.visibility === 'close' && (!user || !friendIdSet.has(item.userId))) return false;
          return true;
        });

        if (!active) return;
        setSpots(buildSpotsFromCheckins(fallback, loc || mapFocus || null));
        setStatus({ message: 'Offline. Showing saved data.', tone: 'warning' });
      } finally {
        setRefreshing(false);
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [
    demoMode,
    refreshToken,
    user,
    loc,
    mapFocus,
    passesScope,
    friendIdSet,
    blockedIdSet,
  ]);

  useEffect(() => {
    if (!loc && !mapFocus) return;
    const focus = mapFocus || loc;
    if (!focus) return;

    setSpots((prev) => {
      const next = prev.map((spot) => {
        const coords = spot.example?.spotLatLng || spot.example?.location;
        if (typeof coords?.lat !== 'number' || typeof coords?.lng !== 'number') {
          return { ...spot, distance: Infinity };
        }
        return { ...spot, distance: haversine(focus, coords) };
      });
      next.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
      return next;
    });
  }, [loc, mapFocus]);

  const displaySpots = useMemo(() => {
    if (intelV1Enabled && intelFetched) return normalizeSpotsForExplore(intelSpots);
    return normalizeSpotsForExplore(spots);
  }, [intelV1Enabled, intelFetched, intelSpots, spots]);

  const filteredSpots = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();

    const list = displaySpots.filter((spot) => {
      const name = String(spot?.name || '').toLowerCase();
      if (q && !name.includes(q)) return false;

      const maxDistanceKm = Math.max(0.5, Math.min(5, filters.distance)) * 1.60934;
      if (typeof spot?.distance === 'number' && spot.distance !== Infinity && spot.distance > maxDistanceKm) return false;

      if (filters.openNow && spot?.openNow !== true) return false;

      if (filters.priceLevel.length > 0) {
        const priceLevel = spot?.intel?.priceLevel || spot?.priceLevel || spot?.metadata?.priceLevel;
        if (!priceLevel || !filters.priceLevel.includes(priceLevel)) return false;
      }

      const noiseLabel = String(spot?.display?.noise || spot?.live?.noise || spot?.intel?.inferredNoise || '').toLowerCase();
      if (filters.noiseLevel !== 'any' && noiseLabel !== filters.noiseLevel) return false;

      if (filters.notCrowded) {
        const busyness = String(spot?.display?.busyness || spot?.live?.busyness || '').toLowerCase();
        const busyScore = typeof spot?.avgBusyness === 'number' ? spot.avgBusyness : 3;
        if (busyness === 'packed' || busyScore > 3.5) return false;
      }

      if (filters.highRated) {
        const rating = typeof spot?.intel?.avgRating === 'number' ? spot.intel.avgRating : spot?.rating || 0;
        if (rating < 4) return false;
      }

      if (filters.goodForStudying && spot?.intel?.goodForStudying !== true) return false;
      if (filters.goodForMeetings && spot?.intel?.goodForMeetings !== true) return false;

      return true;
    });

    list.sort((a: any, b: any) => {
      const distA = a.distance ?? Infinity;
      const distB = b.distance ?? Infinity;
      if (distA !== distB) return distA - distB;
      return (b.count || 0) - (a.count || 0);
    });

    return list;
  }, [displaySpots, deferredQuery, filters]);

  const maxSpotCount = useMemo(() => Math.max(1, ...spots.map((spot) => spot.count || 0)), [spots]);
  const listData = useMemo(() => (deferredQuery.trim() ? filteredSpots : filteredSpots.slice(0, 12)), [filteredSpots, deferredQuery]);
  const markerSpots = useMemo(() => filteredSpots.slice(0, 24), [filteredSpots]);
  const mapPreview = useMemo(() => {
    if (!mapKey || !mapCenter) return null;
    const center = `${mapCenter.lat},${mapCenter.lng}`;
    return `https://maps.googleapis.com/maps/api/staticmap?center=${center}&zoom=13&size=900x360&scale=2&key=${mapKey}`;
  }, [mapKey, mapCenter]);

  const listKeyExtractor = useCallback((item: any) => {
    if (item?.key) return item.key;
    const placeId = item?.example?.spotPlaceId || item?.placeId || item?.example?.placeId;
    return spotKey(placeId, item?.name || 'spot');
  }, []);

  const handleRegionChange = useCallback((region: any) => {
    if (typeof region?.latitude !== 'number' || typeof region?.longitude !== 'number') return;
    const next = { lat: region.latitude, lng: region.longitude };
    setMapFocus((prev) => {
      if (!prev) return next;
      return haversine(prev, next) < 0.12 ? prev : next;
    });
  }, []);

  const handleLocateMe = useCallback(async () => {
    if (locBusy) return;
    setLocBusy(true);

    try {
      const enabled = await getLocationEnabled().catch(() => true);
      if (!enabled) {
        showToast('Location is off. Turn it on in Settings.', 'warning');
        router.push('/settings');
        return;
      }

      await setPermissionPrimerSeen('location', true).catch(() => {});
      const current = await requestForegroundLocation({ ignoreCache: true });
      if (!current) {
        showToast('Location unavailable. Check Settings permissions.', 'warning');
        await Linking.openSettings().catch(() => {});
        return;
      }

      setLoc(current);
      setMapFocus(current);
      if (mapViewRef.current?.animateToRegion) {
        mapViewRef.current.animateToRegion(
          {
            latitude: current.lat,
            longitude: current.lng,
            latitudeDelta: 0.03,
            longitudeDelta: 0.03,
          },
          350
        );
      }
      showToast('Location updated.', 'success');
    } finally {
      setLocBusy(false);
    }
  }, [locBusy, showToast, router]);

  const openSpotSheet = useCallback((spot: any) => {
    setSelectedSpot(normalizeSpotForExplore(spot));
  }, []);

  const closeSpotSheet = useCallback(() => {
    setSelectedSpot(null);
  }, []);

  const spotTagsMap = useMemo(() => {
    const map = new Map<string, string[]>();
    filteredSpots.forEach((spot) => {
      const key = spotKey(spot?.example?.spotPlaceId || spot?.placeId, spot?.name || 'spot');
      map.set(key, buildSpotTags(spot));
    });
    return map;
  }, [filteredSpots]);

  return (
    <ThemedView style={styles.container}>
      <Atmosphere variant="cool" />

      <FlatList
        data={listData}
        keyExtractor={listKeyExtractor}
        contentContainerStyle={styles.listContent}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={8}
        removeClippedSubviews={Platform.OS !== 'web'}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => setRefreshToken((prev) => prev + 1)} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Label style={{ color: muted, marginBottom: 8 }}>Discover</Label>
            <H1 style={{ color: text }}>Find your perfect spot.</H1>
            <Body style={{ color: muted }}>Fast, simple discovery with real-time and inferred intelligence.</Body>

            <View style={{ height: 12 }} />
            <TextInput
              placeholder="Search spots"
              placeholderTextColor={muted}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              style={[styles.searchInput, { borderColor: border, backgroundColor: card, color: text }]}
            />

            {status ? <StatusBanner message={status.message} tone={status.tone} /> : null}

            {user ? (
              <View style={styles.scopeRow}>
                <SegmentedControl
                  value={scope}
                  activeColor={accent}
                  onChange={(next) => {
                    if (next === 'campus' && !campusKey) return;
                    setScope(next as 'everyone' | 'friends' | 'campus');
                  }}
                  options={[
                    { key: 'everyone', label: 'Everyone' },
                    { key: 'campus', label: 'Campus', disabled: !campusKey },
                    { key: 'friends', label: 'Friends' },
                  ]}
                />
                <Text style={{ color: muted, marginTop: 6, fontSize: 12 }}>
                  {scope === 'friends' ? 'Friends only' : scope === 'campus' ? 'Campus only' : 'Everyone'}
                </Text>
              </View>
            ) : null}

            <View style={styles.filterActionRow}>
              <Pressable
                onPress={() => setShowFilters(true)}
                style={({ pressed }) => [
                  styles.filterButton,
                  { borderColor: border, backgroundColor: pressed ? highlight : card },
                ]}
              >
                <IconSymbol name="line.3.horizontal.decrease.circle.fill" size={18} color={primary} />
                <Text style={{ color: text, fontWeight: '700', marginLeft: 8 }}>Filters</Text>
                {hasActiveFilterState ? (
                  <View style={[styles.filterBadge, { backgroundColor: primary }]}>
                    <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                  </View>
                ) : null}
              </Pressable>

              <View style={[styles.intelBadge, { borderColor: withAlpha(primary, 0.3), backgroundColor: withAlpha(primary, 0.08) }]}>
                <Text style={{ color: primary, fontSize: 11, fontWeight: '700' }}>
                  {intelV1Enabled ? 'INTEL ON' : 'INTEL OFF'}
                </Text>
              </View>
            </View>

            <Text style={{ color: muted, fontSize: 12, marginTop: 8 }}>
              {filteredSpots.length
                ? `Showing ${filteredSpots.length} spot${filteredSpots.length === 1 ? '' : 's'}`
                : 'No spots match current filters.'}
            </Text>

            {canShowInteractiveMap ? (
              <View style={[styles.mapCard, { backgroundColor: card, borderColor: border }]}> 
                {loading ? (
                  <View pointerEvents="none" style={[styles.mapLoading, { backgroundColor: card }]}> 
                    <ActivityIndicator color={primary} />
                    <Text style={{ color: muted, marginTop: 6 }}>Loading spots…</Text>
                  </View>
                ) : null}
                <MapView
                  ref={mapViewRef}
                  provider={hasMapKey ? PROVIDER_GOOGLE : undefined}
                  style={styles.map}
                  initialRegion={{
                    latitude: mapCenter.lat,
                    longitude: mapCenter.lng,
                    latitudeDelta: 0.05,
                    longitudeDelta: 0.05,
                  }}
                  onRegionChangeComplete={handleRegionChange}
                  showsUserLocation
                  showsMyLocationButton
                >
                  {loc ? (
                    <Marker
                      key="you"
                      coordinate={{ latitude: loc.lat, longitude: loc.lng }}
                      title="You"
                      pinColor={primary}
                    />
                  ) : null}

                  {markerSpots.map((spot) => {
                    const coords = spot?.example?.spotLatLng || spot?.example?.location || spot?.location;
                    if (typeof coords?.lat !== 'number' || typeof coords?.lng !== 'number') return null;
                    const markerKey = spotKey(spot?.example?.spotPlaceId || spot?.placeId, spot?.name || 'spot');
                    return (
                      <Marker
                        key={markerKey}
                        coordinate={{ latitude: coords.lat, longitude: coords.lng }}
                        title={spot.name}
                        description={spot.description || `${spot.count || 0} check-ins`}
                        pinColor={spot.hereNowCount ? success : primary}
                        onPress={() => openSpotSheet(spot)}
                      />
                    );
                  })}
                </MapView>
              </View>
            ) : mapPreview ? (
              <View style={[styles.mapCard, { backgroundColor: card, borderColor: border }]}> 
                <SpotImage source={{ uri: mapPreview }} style={styles.mapImage} />
              </View>
            ) : (
              <View style={[styles.mapCard, { backgroundColor: card, borderColor: border, alignItems: 'center', justifyContent: 'center' }]}> 
                <Text style={{ color: muted }}>Map unavailable.</Text>
              </View>
            )}

            <View style={styles.mapOverlayRow}>
              <Pressable
                onPress={handleLocateMe}
                disabled={locBusy}
                style={({ pressed }) => [
                  styles.mapOverlayChip,
                  { borderColor: border, backgroundColor: pressed ? highlight : card },
                  locBusy ? { opacity: 0.6 } : null,
                ]}
              >
                <IconSymbol name="location.fill" size={16} color={loc ? primary : muted} />
              </Pressable>
            </View>
          </View>
        }
        renderItem={({ item, index }) => {
          const key = spotKey(item?.example?.spotPlaceId || item?.placeId, item?.name || 'spot');
          const tags = spotTagsMap.get(key) || [];
          return (
            <SpotListItem
              item={item}
              index={index}
              tags={tags}
              friendCount={0}
              subtitle={item?.hereNowCount ? `${item.hereNowCount} here now` : `${item?.count || 0} check-ins`}
              mapKey={mapKey}
              maxSpotCount={maxSpotCount}
              showRanks={!deferredQuery.trim()}
              onPress={() => openSpotSheet(item)}
              describeSpot={describeSpot}
              formatDistance={formatDistance}
            />
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <View style={[styles.emptyState, { borderColor: border, backgroundColor: card }]}> 
              <Text style={{ color: text, fontWeight: '700', marginBottom: 6 }}>No spots yet</Text>
              <Text style={{ color: muted, marginBottom: 10 }}>Be the first to add a check-in and light up the map.</Text>
              <Pressable onPress={() => router.push('/checkin')} style={[styles.emptyCta, { backgroundColor: primary }]}> 
                <View style={styles.ctaRow}>
                  <IconSymbol name="plus" size={18} color="#FFFFFF" />
                  <Text style={{ color: '#FFFFFF', fontWeight: '700', marginLeft: 8 }}>New check-in</Text>
                </View>
              </Pressable>
            </View>
          ) : null
        }
      />

      <TouchableOpacity
        onPress={() => router.push('/checkin')}
        accessibilityLabel="New check-in"
        style={[styles.fab, { backgroundColor: primary, borderColor: border }]}
        activeOpacity={0.85}
      >
        <IconSymbol name="plus" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {selectedSpot ? (
        <Pressable style={styles.sheetBackdrop} onPress={closeSpotSheet}>
          <Pressable
            style={[styles.sheetCard, { backgroundColor: card, borderColor: border }]}
            onPress={(event: any) => event?.stopPropagation?.()}
          >
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color: text }]}>{selectedSpot.name}</Text>
            <Text style={{ color: muted, marginTop: 6 }}>
              {selectedSpot.description || describeSpot(selectedSpot.name, selectedSpot.example?.address)}
              {selectedSpot.distance !== undefined ? ` · ${formatDistance(selectedSpot.distance)}` : ''}
            </Text>

            <SpotIntelligence
              intel={selectedSpot?.intel}
              display={selectedSpot?.display}
              liveCheckinCount={selectedSpot?.live?.checkinCount || selectedSpot?.checkinCount || selectedSpot?.count || 0}
              containerStyle={[styles.intelSection, { borderColor: border, backgroundColor: withAlpha(primary, 0.05) }]}
            />

            {selectedSpot?.intel?.avgRating ? (
              <Text style={{ color: muted, marginTop: 8 }}>
                {`${selectedSpot.intel.avgRating.toFixed(1)} ★`}
              </Text>
            ) : null}

            <View style={styles.sheetActions}>
              <Pressable
                onPress={() => {
                  try {
                    const placeId = selectedSpot?.example?.spotPlaceId || selectedSpot?.placeId || '';
                    const name = selectedSpot?.name || '';
                    router.push(`/checkin?spot=${encodeURIComponent(name)}&placeId=${encodeURIComponent(placeId)}`);
                    closeSpotSheet();
                  } catch {}
                }}
                style={[styles.sheetButton, { backgroundColor: primary }]}
              >
                <View style={styles.ctaRow}>
                  <IconSymbol name="plus" size={16} color="#FFFFFF" />
                  <Text style={{ color: '#FFFFFF', fontWeight: '700', marginLeft: 6 }}>New check-in</Text>
                </View>
              </Pressable>

              <Pressable
                onPress={() => {
                  try {
                    const placeId = selectedSpot?.example?.spotPlaceId || selectedSpot?.placeId;
                    const name = selectedSpot?.name || 'Spot';
                    const coords = selectedSpot?.example?.spotLatLng || selectedSpot?.example?.location || selectedSpot?.location;
                    const url = placeId
                      ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`
                      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          coords ? `${coords.lat},${coords.lng}` : name
                        )}`;
                    if (Platform.OS === 'web') {
                      window.open(url, '_blank', 'noopener');
                    } else {
                      Linking.openURL(url);
                    }
                  } catch {}
                }}
                style={[styles.sheetButton, { backgroundColor: highlight, borderColor: border }]}
              >
                <Text style={{ color: text, fontWeight: '700' }}>Open maps</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => {
                try {
                  const placeId = selectedSpot?.example?.spotPlaceId || selectedSpot?.placeId || '';
                  router.push(`/spot?placeId=${encodeURIComponent(placeId)}&name=${encodeURIComponent(selectedSpot.name || '')}`);
                  closeSpotSheet();
                } catch {}
              }}
              style={[styles.sheetLink, { borderColor: border }]}
            >
              <Text style={{ color: primary, fontWeight: '700' }}>View spot</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      ) : null}

      <FilterBottomSheet
        visible={showFilters}
        currentFilters={filters}
        onDismiss={() => setShowFilters(false)}
        onApply={(next) => {
          setFilters(next);
          setShowFilters(false);
        }}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  listContent: { paddingHorizontal: 20, paddingBottom: 140 },
  header: { paddingTop: 20, paddingBottom: 16, paddingHorizontal: 20 },
  searchInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 10,
  },
  scopeRow: {
    marginTop: 10,
    marginBottom: 10,
  },
  filterActionRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterBadge: {
    marginLeft: 8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  intelBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  mapCard: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: 16,
  },
  map: {
    width: '100%',
    height: 240,
  },
  mapImage: {
    width: '100%',
    height: 200,
  },
  mapLoading: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
  },
  mapOverlayRow: {
    flexDirection: 'row',
    marginTop: 10,
    flexWrap: 'wrap',
  },
  mapOverlayChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  emptyState: {
    marginTop: 10,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  emptyCta: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  sheetBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: withAlpha('#000000', 0.2),
    justifyContent: 'flex-end',
  },
  sheetCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 18,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: withAlpha('#000000', 0.2),
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  intelSection: {
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  sheetActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
  },
  sheetButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 10,
    marginBottom: 10,
  },
  sheetLink: {
    marginTop: 12,
    borderWidth: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
});
