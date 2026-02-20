import MapView, { Marker, PROVIDER_GOOGLE } from '@/components/map/index';
import { ThemedView } from '@/components/themed-view';
import SpotImage from '@/components/ui/spot-image';
import {
  FilterBottomSheet,
  isIntelV1Enabled,
} from '@/components/ui/FilterBottomSheet';
import { Atmosphere } from '@/components/ui/atmosphere';
import { SkeletonLoader } from '@/components/ui/skeleton-loader';
import ScoreBreakdownSheet from '@/components/ui/ScoreBreakdownSheet';
import SpotListItem from '@/components/ui/spot-list-item';
import { SpotIntelligence } from '@/components/ui/SpotIntelligence';
import { RecommendationsCard } from '@/components/ui/recommendations-card';
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
import { buildPlaceIntelligence, type PlaceIntelligence } from '@/services/placeIntelligence';
import { openInMaps } from '@/services/mapsLinks';
import { spotKey } from '@/services/spotUtils';
import { syncPendingCheckins } from '@/services/syncPending';
import {
  DISCOVERY_INTENT_FILTER_OPTIONS,
  getDiscoveryIntentMeta,
  inferIntentsFromCheckin,
  normalizeDiscoveryIntent,
  scoreSpotForIntent,
  type DiscoveryIntentFilter,
} from '@/services/discoveryIntents';
import { applyParsedQueryBoost, parseCoffeeQuery } from '@/services/vibeSearch';
import { deriveVibeScoresFromSpot, intentToVibe } from '@/services/vibeScoring';
import {
  getCheckins,
  getLastKnownLocation,
  getLocationEnabled,
  saveLastKnownLocation,
  setPermissionPrimerSeen,
} from '@/storage/local';
import { withAlpha } from '@/utils/colors';
import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ExpoLinking from 'expo-linking';
import { distanceBetween, geohashQueryBounds } from 'geofire-common';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  InteractionManager,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { DEMO_USER_IDS, isCloudDemoCheckin, isDemoMode } from '@/services/demoMode';
import { endPerfMark, markPerfEvent, startPerfMark } from '@/services/perfMarks';
import { trackScreenLoad } from '@/services/perfMonitor';

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

const EXPLORE_REMOTE_CHECKIN_LIMIT = 140;
const EXPLORE_SPOT_QUERY_LIMIT = 90;
const EXPLORE_SPOT_FALLBACK_LIMIT = 140;

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

function getWorkScoreColor(score: number) {
  if (score >= 78) return '#22C55E';
  if (score >= 62) return '#F59E0B';
  return '#F97316';
}

function getCrowdLevelColor(level: PlaceIntelligence['crowdLevel'], muted: string) {
  if (level === 'low') return '#22C55E';
  if (level === 'moderate') return '#F59E0B';
  if (level === 'high') return '#F97316';
  return muted;
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
  const wifiValues: number[] = [];
  const drinkQualityValues: number[] = [];
  const outletCounts: Record<string, number> = {};
  const intentScores: Record<string, number> = {};
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
    if (typeof item.wifiSpeed === 'number') wifiValues.push(item.wifiSpeed);
    if (typeof item.drinkQuality === 'number') drinkQualityValues.push(item.drinkQuality);
    if (typeof item.outletAvailability === 'string') {
      const normalizedOutlet = item.outletAvailability.trim().toLowerCase();
      if (normalizedOutlet) outletCounts[normalizedOutlet] = (outletCounts[normalizedOutlet] || 0) + 1;
    }

    const intents = inferIntentsFromCheckin(item);
    intents.forEach((intent) => {
      const key = String(intent).trim();
      if (!key) return;
      intentScores[key] = (intentScores[key] || 0) + 1;
    });

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
    avgWifiSpeed: wifiValues.length
      ? Math.round((wifiValues.reduce((sum, value) => sum + value, 0) / wifiValues.length) * 10) / 10
      : null,
    avgDrinkQuality: drinkQualityValues.length
      ? Math.round((drinkQualityValues.reduce((sum, value) => sum + value, 0) / drinkQualityValues.length) * 10) / 10
      : null,
    topOutletAvailability: Object.entries(outletCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    intentScores,
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
  const [selectedIntent, setSelectedIntent] = useState<DiscoveryIntentFilter>('any');
  const parsedQuery = useMemo(() => parseCoffeeQuery(deferredQuery), [deferredQuery]);
  const rankingIntent = useMemo<DiscoveryIntentFilter>(() => {
    if (selectedIntent !== 'any') return selectedIntent;
    const onboardingIntent = Array.isArray(user?.coffeeIntents) ? user.coffeeIntents[0] : null;
    const normalizedOnboardingIntent = normalizeDiscoveryIntent(onboardingIntent);
    if (normalizedOnboardingIntent) return normalizedOnboardingIntent;
    if (parsedQuery.suggestedIntent) return parsedQuery.suggestedIntent;
    return 'any';
  }, [selectedIntent, user?.coffeeIntents, parsedQuery.suggestedIntent]);

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
  const [isFocused, setIsFocused] = useState(true);

  const [friendIds, setFriendIds] = useState<string[]>(() => (demoMode ? [...DEMO_USER_IDS] : []));
  const [blockedIds, setBlockedIds] = useState<string[]>([]);

  const [selectedSpot, setSelectedSpot] = useState<any | null>(null);
  const [selectedIntelState, setSelectedIntelState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [breakdownSpotKey, setBreakdownSpotKey] = useState<string | null>(null);

  const slowQueryNoticeRef = useRef(false);
  const mapViewRef = useRef<any>(null);
  const screenLoadStopRef = useRef<(() => Promise<void>) | null>(null);
  const firstItemMarkedRef = useRef(false);
  const firstScrollMarkedRef = useRef(false);
  const viewabilityConfigRef = useRef({ itemVisiblePercentThreshold: 50 });
  const onViewableItemsChangedRef = useRef((info: any) => {
    if (firstItemMarkedRef.current) return;
    const visibleCount = Array.isArray(info?.viewableItems) ? info.viewableItems.length : 0;
    if (!visibleCount) return;
    firstItemMarkedRef.current = true;
    void markPerfEvent('explore_first_item_rendered', { visibleCount });
    const stop = screenLoadStopRef.current;
    screenLoadStopRef.current = null;
    if (stop) void stop();
  });

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
    return { lat: 39.83, lng: -98.58 };
  }, [mapFocus, loc]);

  const mapKey = (Constants.expoConfig as any)?.extra?.GOOGLE_MAPS_API_KEY || null;
  const hasMapKey = !!mapKey;
  const canShowInteractiveMap = typeof MapView === 'function' && (!Platform.OS || Platform.OS !== 'web' || hasMapKey);

  const activeFilterCount = useMemo(() => getActiveFilterCount(filters), [filters]);
  const hasActiveFilterState = useMemo(() => hasActiveFilters(filters), [filters]);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => {
        setIsFocused(false);
      };
    }, [])
  );

  useEffect(() => {
    const markId = startPerfMark('screen_explore_mount');
    let active = true;
    void trackScreenLoad('explore').then((stop) => {
      if (active) {
        screenLoadStopRef.current = stop;
      } else {
        void stop();
      }
    });
    void markPerfEvent('screen_explore_mounted');
    return () => {
      active = false;
      void endPerfMark(markId, true);
      const stop = screenLoadStopRef.current;
      screenLoadStopRef.current = null;
      if (stop) void stop();
    };
  }, []);

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
            return query.limit(EXPLORE_SPOT_QUERY_LIMIT).get();
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
        const fallback = await db.collection('spots').limit(EXPLORE_SPOT_FALLBACK_LIMIT).get();
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
    if (!isFocused) return;
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
  }, [isFocused, intelV1Enabled, loc, filters, fetchNearbySpots]);

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
    if (!isFocused) return;
    let active = true;
    const loadMarkId = startPerfMark('explore_load_latest');
    let loadOk = true;

    void (async () => {
      setRefreshing(true);
      setLoading(true);

      try {
        const fetchMarkId = startPerfMark('explore_fetch_checkins');
        let remote: any;
        try {
          remote = await getCheckinsRemote(EXPLORE_REMOTE_CHECKIN_LIMIT);
          void endPerfMark(fetchMarkId, true, { limit: EXPLORE_REMOTE_CHECKIN_LIMIT });
        } catch (error) {
          void endPerfMark(fetchMarkId, false, { limit: EXPLORE_REMOTE_CHECKIN_LIMIT, error: String(error) });
          throw error;
        }
        const items = (remote.items || []).filter((item: any) => {
          if (!demoMode && item?.userId && DEMO_USER_IDS.includes(item.userId)) return false;
          if (demoMode && isCloudDemoCheckin(item) && !item?.photoPending && !item?.photoUrl) return false;
          if (user && blockedIdSet.has(item.userId)) return false;
          if (!passesScope(item)) return false;
          if (item.visibility === 'friends' && (!user || !friendIdSet.has(item.userId))) return false;
          if (item.visibility === 'close' && (!user || !friendIdSet.has(item.userId))) return false;
          return true;
        });

        const focus = loc || mapFocus || mapCenter;
        const nearbyThresholdKm = 40;
        const remoteSpots = buildSpotsFromCheckins(items, focus);
        const hasNearbyRemote = remoteSpots.some(
          (spot: any) => typeof spot?.distance === 'number' && spot.distance !== Infinity && spot.distance <= nearbyThresholdKm
        );

        if (!active) return;
        setSpots(remoteSpots);
        setStatus(null);
        // If remote is empty or only far-away data, try local + nearby spots fallback.
        // In demo mode, avoid local demo fallbacks to keep cloud as source of truth.
        if (items.length === 0 || !hasNearbyRemote) {
          if (demoMode) {
            if (active) {
              setStatus({ message: 'No cloud demo data found yet. Seed demo check-ins in Firebase.', tone: 'warning' });
            }
            return;
          }
          const local = await getCheckins();
          const localScoped = (local || []).filter((item: any) => {
            if (!demoMode && item?.userId && DEMO_USER_IDS.includes(item.userId)) return false;
            if (user && blockedIdSet.has(item.userId)) return false;
            if (!passesScope(item)) return false;
            if (item.visibility === 'friends' && (!user || !friendIdSet.has(item.userId))) return false;
            if (item.visibility === 'close' && (!user || !friendIdSet.has(item.userId))) return false;
            return true;
          });
          const localSpots = buildSpotsFromCheckins(localScoped, focus);
          const hasNearbyLocal = localSpots.some(
            (spot: any) => typeof spot?.distance === 'number' && spot.distance !== Infinity && spot.distance <= nearbyThresholdKm
          );
          if (localScoped.length > 0 && hasNearbyLocal && active) {
            setSpots(localSpots);
            setStatus(null);
          } else {
            const nearby = await fetchNearbySpots(focus.lat, focus.lng, 2, DEFAULT_FILTERS).catch(() => []);
            if (active && nearby.length > 0) {
              setSpots(nearby);
              setStatus({ message: 'No recent check-ins yet. Showing nearby spots.', tone: 'info' });
            } else if (active && items.length > 0) {
              setStatus({ message: 'Most recent check-ins are outside your area. Tap location to recenter.', tone: 'info' });
            }
          }
        }
        setLoading(false);
        void syncPendingCheckins(1);
      } catch {
        loadOk = false;
        if (demoMode) {
          if (!active) return;
          setSpots([]);
          setStatus({ message: 'Demo mode uses cloud data only. Connect to load seeded demo spots.', tone: 'warning' });
          return;
        }
        const local = await getCheckins();
        const fallback = (local || []).filter((item: any) => {
          if (!demoMode && item?.userId && DEMO_USER_IDS.includes(item.userId)) return false;
          if (user && blockedIdSet.has(item.userId)) return false;
          if (!passesScope(item)) return false;
          if (item.visibility === 'friends' && (!user || !friendIdSet.has(item.userId))) return false;
          if (item.visibility === 'close' && (!user || !friendIdSet.has(item.userId))) return false;
          return true;
        });

        if (!active) return;
        setSpots(buildSpotsFromCheckins(fallback, loc || mapFocus || mapCenter));
        setStatus({ message: 'Offline. Showing saved data.', tone: 'warning' });
      } finally {
        setRefreshing(false);
        if (active) setLoading(false);
        void endPerfMark(loadMarkId, loadOk);
      }
    })();

    return () => {
      active = false;
    };
  }, [
    isFocused,
    demoMode,
    refreshToken,
    user,
    loc,
    mapFocus,
    mapCenter,
    passesScope,
    friendIdSet,
    blockedIdSet,
    fetchNearbySpots,
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

  const displaySpots = useMemo<any[]>(() => {
    if (intelV1Enabled && intelFetched) return normalizeSpotsForExplore(intelSpots) as any[];
    return normalizeSpotsForExplore(spots) as any[];
  }, [intelV1Enabled, intelFetched, intelSpots, spots]);

  const filteredSpots = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const derivedNoiseFilter =
      filters.noiseLevel !== 'any'
        ? filters.noiseLevel
        : parsedQuery.filters.noiseLevel && parsedQuery.filters.noiseLevel !== 'any'
          ? parsedQuery.filters.noiseLevel
          : 'any';
    const derivedOpenNowFilter = filters.openNow || parsedQuery.filters.openNow === true;
    const derivedNotCrowdedFilter = filters.notCrowded || parsedQuery.filters.notCrowded === true;
    const derivedHighRatedFilter = filters.highRated || parsedQuery.filters.highRated === true;
    const derivedPriceLevels = filters.priceLevel.length > 0
      ? filters.priceLevel
      : Array.isArray(parsedQuery.filters.priceLevel)
        ? parsedQuery.filters.priceLevel
        : [];
    const rankingVibe = intentToVibe(rankingIntent);

    const list = displaySpots
      .map((spot: any) => {
        const intentSignal = scoreSpotForIntent(spot, rankingIntent);
        const queryBoost = applyParsedQueryBoost(spot, parsedQuery);
        const vibeScores = deriveVibeScoresFromSpot(spot);
        const vibeMatch = rankingVibe ? vibeScores[rankingVibe] : null;
        return {
          ...spot,
          intentScore: intentSignal.score,
          intentReasons: Array.from(new Set([...(intentSignal.reasons || []), ...(queryBoost.reasons || [])])),
          queryBoost: queryBoost.boost,
          vibeScores,
          vibeMatch,
        };
      })
      .filter((spot: any) => {
      const name = String(spot?.name || '').toLowerCase();
      if (q && !name.includes(q)) return false;

      const maxDistanceKm = Math.max(0.5, Math.min(5, filters.distance)) * 1.60934;
      if (typeof spot?.distance === 'number' && spot.distance !== Infinity && spot.distance > maxDistanceKm) return false;

      if (derivedOpenNowFilter && spot?.openNow !== true) return false;

      if (derivedPriceLevels.length > 0) {
        const priceLevel = spot?.intel?.priceLevel || spot?.priceLevel || spot?.metadata?.priceLevel;
        if (!priceLevel || !derivedPriceLevels.includes(priceLevel)) return false;
      }

      const noiseLabel = String(spot?.display?.noise || spot?.live?.noise || spot?.intel?.inferredNoise || '').toLowerCase();
      if (derivedNoiseFilter !== 'any' && noiseLabel !== derivedNoiseFilter) return false;

      if (derivedNotCrowdedFilter) {
        const busyness = String(spot?.display?.busyness || spot?.live?.busyness || '').toLowerCase();
        const busyScore = typeof spot?.avgBusyness === 'number' ? spot.avgBusyness : 3;
        if (busyness === 'packed' || busyScore > 3.5) return false;
      }

      if (derivedHighRatedFilter) {
        const rating = typeof spot?.intel?.avgRating === 'number' ? spot.intel.avgRating : spot?.rating || 0;
        if (rating < 4) return false;
      }

      if (filters.goodForStudying && spot?.intel?.goodForStudying !== true) return false;
      if (filters.goodForMeetings && spot?.intel?.goodForMeetings !== true) return false;

      return true;
    });

    list.sort((a: any, b: any) => {
      if (rankingVibe) {
        const vibeDelta = (b.vibeMatch || 0) - (a.vibeMatch || 0);
        if (Math.abs(vibeDelta) > 0.5) return vibeDelta;
      }
      if (rankingIntent !== 'any') {
        const intentDelta = (b.intentScore || 0) - (a.intentScore || 0);
        if (Math.abs(intentDelta) > 0.01) return intentDelta;
      }
      const queryBoostDelta = (b.queryBoost || 0) - (a.queryBoost || 0);
      if (Math.abs(queryBoostDelta) > 0.5) return queryBoostDelta;
      if (typeof b.hereNowCount === 'number' && typeof a.hereNowCount === 'number' && b.hereNowCount !== a.hereNowCount) {
        return b.hereNowCount - a.hereNowCount;
      }
      const distA = a.distance ?? Infinity;
      const distB = b.distance ?? Infinity;
      if (distA !== distB) return distA - distB;
      return (b.count || 0) - (a.count || 0);
    });

    return list;
  }, [displaySpots, deferredQuery, filters, parsedQuery, rankingIntent]);

  const maxSpotCount = useMemo(() => Math.max(1, ...spots.map((spot) => spot.count || 0)), [spots]);
  const listData = useMemo(() => (deferredQuery.trim() ? filteredSpots : filteredSpots.slice(0, 12)), [filteredSpots, deferredQuery]);
  const markerSpots = useMemo(() => filteredSpots.slice(0, 24), [filteredSpots]);
  const mapPreview = useMemo(() => {
    if (!mapKey || !mapCenter) return null;
    const center = `${mapCenter.lat},${mapCenter.lng}`;
    return `https://maps.googleapis.com/maps/api/staticmap?center=${center}&zoom=13&size=900x360&scale=2&key=${mapKey}`;
  }, [mapKey, mapCenter]);

  const timeOfDay = useMemo((): 'morning' | 'afternoon' | 'evening' => {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    return 'evening';
  }, []);

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

  useEffect(() => {
    let active = true;
    void (async () => {
      const lastKnown = await getLastKnownLocation().catch(() => null);
      if (!active || !lastKnown) return;
      setLoc((prev) => prev || lastKnown);
      setMapFocus((prev) => prev || lastKnown);
    })();
    return () => {
      active = false;
    };
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
      const current = await requestForegroundLocation({ ignoreCache: true, preferFresh: true });
      if (!current) {
        showToast('Location unavailable. Check Settings permissions.', 'warning');
        await ExpoLinking.openSettings().catch(() => {});
        return;
      }

      setLoc(current);
      setMapFocus(current);
      void saveLastKnownLocation(current);
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

  const [intelligenceMap, setIntelligenceMap] = useState<Map<string, PlaceIntelligence>>(new Map());

  useEffect(() => {
    let active = true;
    const spotsToProcess = listData.slice(0, 12);
    if (!spotsToProcess.length) return;

    const task = InteractionManager.runAfterInteractions(() => {
      spotsToProcess.forEach(async (spot) => {
        const placeId = spot?.example?.spotPlaceId || spot?.placeId || '';
        const name = spot?.name || '';
        const intelKey = spotKey(placeId, name);
        try {
          const intel = await buildPlaceIntelligence({
            placeName: name,
            placeId,
            location: spot?.example?.spotLatLng || spot?.example?.location || spot?.location || null,
            openNow: spot?.openNow,
            types: spot?.types,
            checkins: spot?._checkins || [],
            inferred: spot?.intel
              ? {
                  noise: spot.intel.inferredNoise ?? null,
                  noiseConfidence: spot.intel.inferredNoiseConfidence,
                  hasWifi: spot.intel.hasWifi,
                  wifiConfidence: spot.intel.wifiConfidence,
                  goodForStudying: spot.intel.goodForStudying,
                  goodForDates: spot.intel.goodForDates,
                  goodForGroups: spot.intel.goodForGroups,
                  instagramWorthy: spot.intel.instagramWorthy,
                  foodQualitySignal: spot.intel.foodQualitySignal,
                  aestheticVibe: spot.intel.aestheticVibe,
                  musicAtmosphere: spot.intel.musicAtmosphere,
                }
              : null,
          });
          if (active) {
            setIntelligenceMap((prev) => {
              if (prev.has(intelKey)) return prev;
              const next = new Map(prev);
              next.set(intelKey, intel);
              return next;
            });
          }
        } catch {}
      });
    });

    return () => {
      active = false;
      task.cancel();
    };
  }, [listData]);

  const selectedSpotKey = useMemo(() => {
    if (!selectedSpot) return null;
    const placeId = selectedSpot?.example?.spotPlaceId || selectedSpot?.placeId || '';
    const name = selectedSpot?.name || '';
    if (!name) return null;
    return spotKey(placeId, name);
  }, [selectedSpot]);

  const selectedSpotIntelligence = useMemo(() => {
    if (!selectedSpotKey) return null;
    return intelligenceMap.get(selectedSpotKey) || null;
  }, [selectedSpotKey, intelligenceMap]);
  const shouldRenderLegacyIntel = useMemo(() => {
    if (!selectedSpot) return false;
    const intel = selectedSpot?.intel || {};
    const display = selectedSpot?.display || {};
    return Boolean(
      intel?.priceLevel ||
        typeof intel?.avgRating === 'number' ||
        intel?.inferredNoise ||
        intel?.hasWifi ||
        intel?.goodForStudying ||
        intel?.goodForMeetings ||
        display?.noise ||
        display?.busyness
    );
  }, [selectedSpot]);
  const breakdownIntelligence = useMemo(
    () => (breakdownSpotKey ? intelligenceMap.get(breakdownSpotKey) || null : null),
    [breakdownSpotKey, intelligenceMap],
  );
  const breakdownCheckinCount = useMemo(() => {
    if (!breakdownSpotKey) return 0;
    const target = listData.find((spot) => {
      const key = spotKey(spot?.example?.spotPlaceId || spot?.placeId || '', spot?.name || '');
      return key === breakdownSpotKey;
    });
    return target?._checkins?.length ?? 0;
  }, [breakdownSpotKey, listData]);

  useEffect(() => {
    if (!selectedSpot) {
      setSelectedIntelState('idle');
      return;
    }
    if (selectedSpotIntelligence) {
      setSelectedIntelState('ready');
    }
  }, [selectedSpot, selectedSpotIntelligence]);

  useEffect(() => {
    if (loading || firstItemMarkedRef.current) return;
    const stop = screenLoadStopRef.current;
    screenLoadStopRef.current = null;
    if (stop) void stop();
    void markPerfEvent('explore_initial_data_ready', { itemCount: listData.length });
  }, [loading, listData.length]);

  useEffect(() => {
    if (!selectedSpot || !selectedSpotKey || selectedSpotIntelligence) return;
    const placeId = selectedSpot?.example?.spotPlaceId || selectedSpot?.placeId || '';
    const name = selectedSpot?.name || '';
    if (!name) return;

    let active = true;
    setSelectedIntelState('loading');
    const task = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        try {
          const intel = await buildPlaceIntelligence({
            placeName: name,
            placeId,
            location: selectedSpot?.example?.spotLatLng || selectedSpot?.example?.location || selectedSpot?.location || null,
            openNow: selectedSpot?.openNow,
            types: selectedSpot?.types,
            checkins: selectedSpot?._checkins || [],
            inferred: selectedSpot?.intel
              ? {
                  noise: selectedSpot.intel.inferredNoise ?? null,
                  noiseConfidence: selectedSpot.intel.inferredNoiseConfidence,
                  hasWifi: selectedSpot.intel.hasWifi,
                  wifiConfidence: selectedSpot.intel.wifiConfidence,
                  goodForStudying: selectedSpot.intel.goodForStudying,
                  goodForDates: selectedSpot.intel.goodForDates,
                  goodForGroups: selectedSpot.intel.goodForGroups,
                  instagramWorthy: selectedSpot.intel.instagramWorthy,
                  foodQualitySignal: selectedSpot.intel.foodQualitySignal,
                  aestheticVibe: selectedSpot.intel.aestheticVibe,
                  musicAtmosphere: selectedSpot.intel.musicAtmosphere,
                }
              : null,
          });
          if (!active) return;
          setIntelligenceMap((prev) => {
            if (prev.has(selectedSpotKey)) return prev;
            const next = new Map(prev);
            next.set(selectedSpotKey, intel);
            return next;
          });
          setSelectedIntelState('ready');
        } catch {
          if (active) setSelectedIntelState('error');
        }
      })();
    });

    return () => {
      active = false;
      task.cancel();
    };
  }, [selectedSpot, selectedSpotKey, selectedSpotIntelligence]);

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
        onViewableItemsChanged={onViewableItemsChangedRef.current}
        viewabilityConfig={viewabilityConfigRef.current}
        onScrollBeginDrag={() => {
          if (firstScrollMarkedRef.current) return;
          firstScrollMarkedRef.current = true;
          void markPerfEvent('explore_scroll_session_start');
        }}
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

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.intentRow}
              style={styles.intentScroll}
            >
              {DISCOVERY_INTENT_FILTER_OPTIONS.map((option) => {
                const active = selectedIntent === option.key;
                return (
                  <Pressable
                    key={option.key}
                    onPress={() => setSelectedIntent(option.key)}
                    style={({ pressed }) => [
                      styles.intentChip,
                      {
                        borderColor: border,
                        backgroundColor: active ? primary : pressed ? highlight : card,
                      },
                    ]}
                  >
                    <Text style={{ color: active ? '#FFFFFF' : text, fontWeight: '700', fontSize: 12 }}>
                      {option.emoji} {option.shortLabel}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={{ color: muted, fontSize: 12, marginTop: 6, marginBottom: 6 }}>
              {getDiscoveryIntentMeta(selectedIntent).hint}
            </Text>
            {parsedQuery.matched ? (
              <Text style={{ color: muted, fontSize: 12, marginBottom: 6 }}>
                Interpreting query as: {parsedQuery.explanation.slice(0, 3).join(' • ')}
              </Text>
            ) : null}

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
                ? `Showing ${filteredSpots.length} spot${filteredSpots.length === 1 ? '' : 's'}${rankingIntent !== 'any' ? ` • ranked for ${getDiscoveryIntentMeta(rankingIntent).shortLabel.toLowerCase()}` : ''}`
                : 'No spots match current filters.'}
            </Text>

            {canShowInteractiveMap ? (
              <View style={[styles.mapCard, { backgroundColor: card, borderColor: border }]}> 
                {loading ? (
                  <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
                    {[0, 1, 2, 3].map((i) => (
                      <SkeletonLoader key={i} style={{ height: 120, borderRadius: 16, marginBottom: 12 }} />
                    ))}
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

            <RecommendationsCard
              userLocation={loc}
              context={{ timeOfDay, intent: rankingIntent !== 'any' ? rankingIntent : undefined }}
              onSpotPress={(placeId, name) => {
                startPerfMark('spot_navigation');
                void markPerfEvent('spot_nav_start', { source: 'explore_recommendations' });
                router.push(`/spot?placeId=${encodeURIComponent(placeId)}&name=${encodeURIComponent(name)}`);
              }}
            />
          </View>
        }
        renderItem={({ item, index }) => {
          const key = spotKey(item?.example?.spotPlaceId || item?.placeId, item?.name || 'spot');
          const tags = spotTagsMap.get(key) || [];
          const intelligence = intelligenceMap.get(key) || null;
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
              intelligence={intelligence}
              activeIntent={rankingIntent}
              intentScore={typeof item?.intentScore === 'number' ? item.intentScore : null}
              intentReason={Array.isArray(item?.intentReasons) ? item.intentReasons[0] : null}
              onPress={() => openSpotSheet(item)}
              onScorePress={() => {
                const scoreKey = spotKey(item?.example?.spotPlaceId || item?.placeId || '', item?.name || '');
                setBreakdownSpotKey(scoreKey);
              }}
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

            {shouldRenderLegacyIntel ? (
              <SpotIntelligence
                intel={selectedSpot?.intel}
                display={selectedSpot?.display}
                liveCheckinCount={selectedSpot?.live?.checkinCount || selectedSpot?.checkinCount || selectedSpot?.count || 0}
                containerStyle={[styles.intelSection, { borderColor: border, backgroundColor: withAlpha(primary, 0.05) }]}
              />
            ) : selectedIntelState === 'loading' ? (
              <View style={[styles.intelSection, { borderColor: border, backgroundColor: withAlpha(primary, 0.05) }]}>
                <Text style={{ color: text, fontWeight: '700', marginBottom: 4 }}>Refreshing intelligence…</Text>
                <Text style={{ color: muted }}>Fetching live + inferred signals for this spot.</Text>
              </View>
            ) : selectedIntelState === 'error' ? (
              <View style={[styles.intelSection, { borderColor: border, backgroundColor: withAlpha(primary, 0.05) }]}>
                <Text style={{ color: text, fontWeight: '700', marginBottom: 4 }}>Intelligence temporarily unavailable</Text>
                <Text style={{ color: muted }}>
                  Live enrichment failed right now. Try again shortly or open the spot page.
                </Text>
              </View>
            ) : null}

            {selectedSpotIntelligence ? (
              <View style={[styles.snapshotCard, { borderColor: border, backgroundColor: withAlpha(primary, 0.06) }]}>
                <Text style={[styles.snapshotLabel, { color: muted }]}>Smart snapshot</Text>
                <View style={styles.snapshotRow}>
                  <View style={styles.snapshotItem}>
                    <Text style={{ color: getWorkScoreColor(selectedSpotIntelligence.workScore), fontWeight: '800', fontSize: 20 }}>
                      {selectedSpotIntelligence.workScore}
                    </Text>
                    <Text style={{ color: muted, fontSize: 11 }}>Work score</Text>
                  </View>
                  <View style={styles.snapshotItem}>
                    <Text
                      style={{
                        color: getCrowdLevelColor(selectedSpotIntelligence.crowdLevel, muted),
                        fontWeight: '700',
                        textTransform: 'capitalize',
                      }}
                    >
                      {selectedSpotIntelligence.crowdLevel}
                    </Text>
                    <Text style={{ color: muted, fontSize: 11 }}>Crowd</Text>
                  </View>
                  <View style={styles.snapshotItem}>
                    <Text style={{ color: text, fontWeight: '700', textTransform: 'capitalize' }}>
                      {selectedSpotIntelligence.bestTime}
                    </Text>
                    <Text style={{ color: muted, fontSize: 11 }}>Best time</Text>
                  </View>
                </View>
                {selectedSpotIntelligence.useCases.length ? (
                  <View style={styles.snapshotChipRow}>
                    {selectedSpotIntelligence.useCases.slice(0, 3).map((item) => (
                      <View key={`sheet-uc-${item}`} style={[styles.snapshotChip, { borderColor: border }]}>
                        <Text style={{ color: text, fontSize: 11, fontWeight: '600' }}>{item}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {selectedSpotIntelligence.highlights.length ? (
                  <View style={styles.snapshotChipRow}>
                    {selectedSpotIntelligence.highlights.slice(0, 2).map((item) => (
                      <View key={`sheet-hl-${item}`} style={[styles.snapshotChip, { borderColor: border }]}>
                        <Text style={{ color: text, fontSize: 11, fontWeight: '600' }}>{item}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

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
                onPress={async () => {
                  const placeId = selectedSpot?.example?.spotPlaceId || selectedSpot?.placeId;
                  const name = selectedSpot?.name || 'Spot';
                  const coords = selectedSpot?.example?.spotLatLng || selectedSpot?.example?.location || selectedSpot?.location;
                  const markId = startPerfMark('maps_open_latency', { source: 'explore_sheet_open_maps' });
                  try {
                    const result = await openInMaps({ placeId, coords, name });
                    void endPerfMark(markId, result.opened, { source: 'explore_sheet_open_maps', reason: result.reason });
                    if (!result.opened && result.reason !== 'cancelled') {
                      showToast('Unable to open Maps on this device.', 'warning');
                    }
                  } catch (error) {
                    void endPerfMark(markId, false, { source: 'explore_sheet_open_maps', error: String(error) });
                    showToast('Unable to open Maps right now.', 'warning');
                  }
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
                  startPerfMark('spot_navigation');
                  void markPerfEvent('spot_nav_start', { source: 'explore_sheet' });
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

      {breakdownIntelligence ? (
        <ScoreBreakdownSheet
          visible={!!breakdownSpotKey}
          intelligence={breakdownIntelligence}
          checkinCount={breakdownCheckinCount}
          onDismiss={() => setBreakdownSpotKey(null)}
        />
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
  intentScroll: {
    marginTop: 2,
  },
  intentRow: {
    paddingRight: 12,
    gap: 8,
  },
  intentChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
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
  snapshotCard: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  snapshotLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '700',
    marginBottom: 8,
  },
  snapshotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  snapshotItem: {
    flex: 1,
  },
  snapshotChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 6,
  },
  snapshotChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
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
