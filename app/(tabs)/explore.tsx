import MapView, { Marker, PROVIDER_GOOGLE } from '@/components/map/index';
import { ThemedView } from '@/components/themed-view';
import SpotImage from '@/components/ui/spot-image';
import { Atmosphere } from '@/components/ui/atmosphere';
import { Body, H1, Label } from '@/components/ui/typography';
import { IconSymbol } from '@/components/ui/icon-symbol';
import SegmentedControl from '@/components/ui/segmented-control';
import StatusBanner from '@/components/ui/status-banner';
import FilterGroups, { FilterGroup } from '@/components/ui/filter-groups';
import SpotListItem from '@/components/ui/spot-list-item';
import PopularTimes from '@/components/ui/popular-times';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { getBlockedUsers, getCheckinsRemote, getUserFriendsCached, getUserPreferenceRemote, recordPlaceEventRemote } from '@/services/firebaseClient';
import { syncPendingCheckins } from '@/services/syncPending';
import { useToast } from '@/contexts/ToastContext';
import { getMapsKey, getPlaceDetails, searchPlaces, searchPlacesNearby, searchPlacesWithBias } from '@/services/googleMaps';
import { requestForegroundLocation } from '@/services/location';
import { classifySpotCategory, spotKey } from '@/services/spotUtils';
import { getCheckins, getLocationEnabled, getPermissionPrimerSeen, getPlaceTagScores, getSavedSpots, getSavedSpotNote, getUserPlaceSignals, getUserPreferenceScores, recordPlaceEvent, seedDemoNetwork, setLocationEnabled, setPermissionPrimerSeen, toggleSavedSpot, updateSavedSpotNote } from '@/storage/local';
import { formatCheckinClock, formatTimeRemaining } from '@/services/checkinUtils';
import { calculateCompositeScore } from '@/services/metricsUtils';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, InteractionManager, Platform, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { withAlpha } from '@/utils/colors';
import { DEMO_USER_IDS, isDemoMode } from '@/services/demoMode';
import { formatIntentChips, parsePerchedQuery } from '@/services/perchedAssistant';

function haversine(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDlat = Math.sin(dLat / 2) * Math.sin(dLat / 2);
  const sinDlon = Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(sinDlat + Math.cos(lat1) * Math.cos(lat2) * sinDlon), Math.sqrt(1 - (sinDlat + Math.cos(lat1) * Math.cos(lat2) * sinDlon)));
  return R * c;
}

// Aggregate utility metrics from check-ins for a spot
function aggregateSpotMetrics(checkins: any[]) {
  const wifiSpeeds: number[] = [];
  const busynessValues: number[] = [];
  const noiseLevels: number[] = [];
  const outletCounts: Record<string, number> = { plenty: 0, some: 0, few: 0, none: 0 };

  // Track "here now" - check-ins within last 2 hours
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  const now = Date.now();
  const hereNowUsers: Array<{ userId: string; userName: string; userPhotoUrl?: string }> = [];

  // Track popular times by hour (0-23)
  const popularHours = new Array(24).fill(0);

  checkins.forEach((c) => {
    if (c.wifiSpeed && typeof c.wifiSpeed === 'number') wifiSpeeds.push(c.wifiSpeed);
    if (c.busyness && typeof c.busyness === 'number') busynessValues.push(c.busyness);

    // Handle both old string format and new numeric format
    if (c.noiseLevel) {
      const convertedNoise = typeof c.noiseLevel === 'string'
        ? (c.noiseLevel === 'quiet' ? 2 : c.noiseLevel === 'moderate' ? 3 : 4)
        : c.noiseLevel;
      if (typeof convertedNoise === 'number') noiseLevels.push(convertedNoise);
    }

    if (c.outletAvailability && outletCounts[c.outletAvailability] !== undefined) {
      outletCounts[c.outletAvailability]++;
    }

    // Get check-in timestamp
    const checkinTime = c.createdAt?.seconds
      ? c.createdAt.seconds * 1000
      : typeof c.createdAt === 'number'
        ? c.createdAt
        : new Date(c.createdAt).getTime();

    // Track popular hours
    if (checkinTime) {
      const hour = new Date(checkinTime).getHours();
      popularHours[hour]++;
    }

    // Check if check-in is within last 2 hours
    if (now - checkinTime <= TWO_HOURS_MS && c.userId) {
      // Avoid duplicates (same user checking in multiple times)
      if (!hereNowUsers.find(u => u.userId === c.userId)) {
        hereNowUsers.push({
          userId: c.userId,
          userName: c.userName || 'Someone',
          userPhotoUrl: c.userPhotoUrl,
        });
      }
    }
  });

  const avgWifiSpeed = wifiSpeeds.length > 0 ? Math.round(wifiSpeeds.reduce((a, b) => a + b, 0) / wifiSpeeds.length * 10) / 10 : null;
  const avgBusyness = busynessValues.length > 0 ? Math.round(busynessValues.reduce((a, b) => a + b, 0) / busynessValues.length * 10) / 10 : null;
  const avgNoiseLevel = noiseLevels.length > 0 ? Math.round(noiseLevels.reduce((a, b) => a + b, 0) / noiseLevels.length * 10) / 10 : null;

  // Find most common outlet availability
  const outletEntries = Object.entries(outletCounts).filter(([_, count]) => count > 0);
  const topOutletAvailability = outletEntries.length > 0
    ? outletEntries.sort((a, b) => b[1] - a[1])[0][0] as 'plenty' | 'some' | 'few' | 'none'
    : null;

  return {
    avgWifiSpeed,
    avgBusyness,
    avgNoiseLevel,
    topOutletAvailability,
    hereNowCount: hereNowUsers.length,
    hereNowUsers: hereNowUsers.slice(0, 3), // Only show up to 3 avatars
    popularHours,
    checkinCount: checkins.length,
  };
}

function formatTime(input: string | { seconds?: number } | undefined) {
  return formatCheckinClock(input);
}

function hashString(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h << 5) - h + input.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function fuzzLocation(coords: { lat: number; lng: number }, key: string) {
  const seed = hashString(key);
  const offset = (seed % 400 + 300) / 100000; // ~300-700m
  const angle = (seed % 360) * (Math.PI / 180);
  return {
    lat: coords.lat + Math.cos(angle) * offset,
    lng: coords.lng + Math.sin(angle) * offset,
  };
}


function formatDistance(distanceKm?: number) {
  if (distanceKm === undefined || distanceKm === Infinity) return '';
  const miles = distanceKm * 0.621371;
  // Calculate walk time assuming 5 km/h walking speed (about 3.1 mph)
  const walkMinutes = Math.round(distanceKm / 5 * 60);
  if (miles < 0.1) return '< 1 min walk';
  if (miles < 2) {
    return `${miles.toFixed(1)} mi · ${walkMinutes} min walk`;
  }
  return `${miles.toFixed(1)} mi`;
}

function describeSpot(name?: string, address?: string) {
  const hay = `${name || ''} ${address || ''}`.toLowerCase();
  if (hay.includes('library')) return 'Library';
  if (hay.includes('cowork')) return 'Coworking';
  if (hay.includes('coffee') || hay.includes('espresso')) return 'Coffee shop';
  if (hay.includes('cafe') || hay.includes('coffee') || hay.includes('espresso') || hay.includes('tea')) return 'Cafe';
  if (hay.includes('lounge')) return 'Lounge';
  if (hay.includes('study') || hay.includes('nook') || hay.includes('reading')) return 'Study spot';
  if (hay.includes('university') || hay.includes('college') || hay.includes('campus')) return 'Campus';
  return 'Spot';
}

function studyScoreForPlace(place: any) {
  const typeStr = Array.isArray(place.types) ? place.types.join(' ') : '';
  const hay = `${place.name || ''} ${place.address || ''} ${typeStr}`.toLowerCase();
  let score = 0;
  if (hay.includes('library')) score += 4;
  if (hay.includes('cowork')) score += 4;
  if (hay.includes('university') || hay.includes('college') || hay.includes('campus')) score += 3;
  if (hay.includes('study') || hay.includes('reading') || hay.includes('workspace')) score += 2;
  if (hay.includes('cafe') || hay.includes('coffee') || hay.includes('espresso') || hay.includes('tea') || hay.includes('roastery')) score += 3;
  if (hay.includes('bookstore') || hay.includes('book store')) score += 2;
  if (typeStr.includes('library') || typeStr.includes('coworking_space') || typeStr.includes('university')) score += 3;
  if (typeStr.includes('cafe') || typeStr.includes('coffee_shop')) score += 2;
  const dessertHeavy = /(crepe|crêpe|dessert|ice cream|gelato|froyo|candy|boba|juice)/.test(hay);
  const hasWorkSignal = /(library|cowork|university|college|campus|study|workspace|bookstore|cafe|coffee|roastery)/.test(hay);
  if (dessertHeavy && !hasWorkSignal) score -= 2;
  return score;
}

function hasLateSignal(place: any) {
  const typeStr = Array.isArray(place.types) ? place.types.join(' ') : '';
  const hay = `${place.name || ''} ${place.address || ''} ${typeStr}`.toLowerCase();
  return /(24|late|midnight)/.test(hay) || typeStr.includes('night_club') || typeStr.includes('bar');
}

function isStudyCandidate(place: any) {
  const typeStr = Array.isArray(place.types) ? place.types.join(' ') : '';
  const hay = `${place.name || ''} ${place.address || ''} ${typeStr}`.toLowerCase();
  const allowTypes = ['cafe', 'coffee_shop', 'bakery', 'book_store', 'library', 'coworking_space', 'university', 'school'];
  const allowText = [
    'cafe',
    'coffee',
    'espresso',
    'roaster',
    'tea',
    'boba',
    'library',
    'cowork',
    'study',
    'reading',
    'workspace',
    'bookstore',
    'student center',
    'campus',
    'lounge',
  ];
  return allowTypes.some((t) => typeStr.includes(t)) || allowText.some((k) => hay.includes(k));
}

function buildSpotTags(spot: any) {
  const tags: string[] = [];
  if (spot.openNow === true) tags.push('Open now');
  if (spot.openNow === false) tags.push('Closed now');
  if (spot.tagScores) {
    const ranked = Object.entries(spot.tagScores)
      .filter(([, value]) => typeof value === 'number' && value > 0)
      .sort((a: any, b: any) => b[1] - a[1])
      .map(([key]) => key);
    ranked.forEach((tag) => {
      if (tags.length >= 3) return;
      if (!tags.includes(tag)) tags.push(tag);
    });
  }
  const types = Array.isArray(spot.types) ? spot.types.join(' ') : '';
  const hay = `${spot.name || ''} ${spot.description || ''} ${types}`.toLowerCase();
  if (hay.includes('library') || hay.includes('reading') || hay.includes('quiet')) tags.push('Quiet');
  if (hay.includes('study') || hay.includes('university') || hay.includes('college') || hay.includes('campus')) tags.push('Study');
  if (hay.includes('cafe') || hay.includes('coffee') || hay.includes('lounge') || hay.includes('tea')) tags.push('Social');
  if (hay.includes('bright') || hay.includes('light')) tags.push('Bright');
  if (hay.includes('spacious') || hay.includes('roomy')) tags.push('Spacious');
  if (hay.includes('cowork')) tags.push('Coworking');
  if (hay.includes('cowork')) tags.push('Outlets');
  if (hay.includes('cowork') || hay.includes('library')) tags.push('Seating');
  if (hay.includes('cafe') || hay.includes('cowork') || hay.includes('coffee')) tags.push('Wi-Fi');
  if (hay.includes('late') || hay.includes('24') || hay.includes('midnight')) tags.push('Late-night');
  return Array.from(new Set(tags)).slice(0, 3);
}

type ExploreVibe = 'all' | 'quiet' | 'study' | 'social' | 'late' | 'cowork';

function formatVibeLabel(vibe: ExploreVibe) {
  if (vibe === 'all') return 'All vibes';
  if (vibe === 'late') return 'Late-night';
  if (vibe === 'cowork') return 'Coworking';
  return `${vibe[0].toUpperCase()}${vibe.slice(1)}`;
}

const ASK_PRESETS = [
  { label: 'Quiet + outlets', query: 'quiet cafe with outlets' },
  { label: 'Study + Wi‑Fi', query: 'study spot with wifi' },
  { label: 'Coworking', query: 'coworking space' },
  { label: 'Open now', query: 'open now' },
] as const;

const FILTER_GROUPS: FilterGroup[] = [
  {
    id: 'sort',
    title: 'Sort By',
    icon: 'arrow.up.arrow.down',
    multiSelect: false,
    options: [
      { id: 'popular', label: '🔥 Popular', value: 'popular' },
      { id: 'nearest', label: '📍 Nearest', value: 'nearest' },
      { id: 'quality', label: '⭐ Top Rated', value: 'quality' },
    ],
  },
  {
    id: 'atmosphere',
    title: 'Atmosphere',
    icon: 'sparkles',
    multiSelect: true,
    options: [
      { id: 'quiet', label: 'Quiet', value: 'quiet' },
      { id: 'social', label: 'Social', value: 'social' },
      { id: 'cozy', label: 'Cozy', value: 'cozy' },
      { id: 'bright', label: 'Bright', value: 'bright' },
      { id: 'spacious', label: 'Spacious', value: 'spacious' },
    ],
  },
  {
    id: 'amenities',
    title: 'Amenities',
    icon: 'bolt.fill',
    multiSelect: true,
    options: [
      { id: 'wifi', label: 'Wi-Fi', value: 'wifi' },
      { id: 'outlets', label: 'Outlets', value: 'outlets' },
      { id: 'seating', label: 'Seating', value: 'seating' },
      { id: 'outdoor', label: 'Outdoor', value: 'outdoor' },
      { id: 'parking', label: 'Parking', value: 'parking' },
    ],
  },
  {
    id: 'spotIntel',
    title: 'Spot Intel',
    icon: 'chart.bar.fill',
    multiSelect: true,
    options: [
      { id: 'fast-wifi', label: '🚀 Fast WiFi', value: 'fast-wifi' },
      { id: 'has-outlets', label: '🔌 Has Outlets', value: 'has-outlets' },
      { id: 'not-busy', label: '🧘 Not Busy', value: 'not-busy' },
      { id: 'quiet-spot', label: '🤫 Quiet', value: 'quiet-spot' },
      { id: 'lively-spot', label: '🎉 Lively', value: 'lively-spot' },
    ],
  },
  {
    id: 'type',
    title: 'Spot Type',
    icon: 'building.2.fill',
    multiSelect: true,
    options: [
      { id: 'cafe', label: 'Cafe', value: 'cafe' },
      { id: 'library', label: 'Library', value: 'library' },
      { id: 'cowork', label: 'Coworking', value: 'cowork' },
      { id: 'study', label: 'Study spot', value: 'study' },
    ],
  },
  {
    id: 'hours',
    title: 'Hours',
    icon: 'clock.fill',
    multiSelect: false,
    options: [
      { id: 'open', label: 'Open now', value: 'open' },
      { id: 'late', label: 'Late-night', value: 'late' },
      { id: 'closed', label: 'Closed', value: 'closed' },
    ],
  },
];

export default function Explore() {
  const color = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const isWeb = Platform.OS === 'web';
  const demoMode = isDemoMode();

  const router = useRouter();
  const { user } = useAuth();
  const userId = user?.id || null;
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');
  const primary = useThemeColor({}, 'primary');
  const accent = useThemeColor({}, 'accent');
  const success = useThemeColor({}, 'success');
  const highlight = withAlpha(primary, 0.12);
  const badgeFill = withAlpha(accent, 0.16);
  const [spots, setSpots] = useState<any[]>([]);
  const [seedSpots, setSeedSpots] = useState<any[]>([]);
  const [seedLoading, setSeedLoading] = useState(false);
  const [checkins, setCheckins] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locBusy, setLocBusy] = useState(false);
  const [mapFocus, setMapFocus] = useState<{ lat: number; lng: number } | null>(null);
  const [mapFetchFocus, setMapFetchFocus] = useState<{ lat: number; lng: number } | null>(null);
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  const [scope, setScope] = useState<'everyone' | 'campus' | 'friends'>('everyone');
  const [vibe, setVibe] = useState<ExploreVibe>('all');
  const [openFilter, setOpenFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);
  const [friendIds, setFriendIds] = useState<string[]>(() => (isDemoMode() ? [...DEMO_USER_IDS] : []));
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const [status, setStatus] = useState<{ message: string; tone: 'info' | 'warning' | 'error' | 'success' } | null>(null);
  const { showToast } = useToast();
  const friendIdSet = React.useMemo(() => new Set(friendIds), [friendIds]);
  const campusKey = user?.campus || null;
  const wasOfflineRef = React.useRef(false);
  const detailFetchRef = React.useRef(new Set<string>());
  const impressionRef = React.useRef(new Set<string>());
  const openNowFetchRef = React.useRef(new Set<string>());
  const seedQueryRef = React.useRef<string | null>(null);
  const enrichRef = React.useRef(new Set<string>());
  const fetchKeyRef = React.useRef<string | null>(null);
  const seedCacheRef = React.useRef<Map<string, any[]>>(new Map());
  const lastLocateFailRef = React.useRef(0);
  const lastOpenSettingsRef = React.useRef(0);
  const mapViewRef = React.useRef<any>(null);
  const [preferenceScores, setPreferenceScores] = useState<Record<string, number>>({});
  const [selectedSpot, setSelectedSpot] = useState<any | null>(null);
  const [selectedSaved, setSelectedSaved] = useState(false);
  const [savedNote, setSavedNote] = useState('');
  const hasRealSpots = spots.length > 0;
  const mapKey = getMapsKey();
  const hasMapKey = !!mapKey;

  const parsedIntent = React.useMemo(() => parsePerchedQuery(query), [query]);
  const activeIntent = React.useMemo(() => {
    if (!parsedIntent) return null;
    const hasSignals = parsedIntent.vibe !== 'all' || parsedIntent.openFilter !== 'all' || parsedIntent.tags.length > 0;
    return hasSignals ? parsedIntent : null;
  }, [parsedIntent]);
  const intentChips = React.useMemo(() => formatIntentChips(activeIntent), [activeIntent]);
  const aiMode = !!activeIntent && !!query.trim();
  // While an "Ask Perched" query is active, avoid accidental empty states by ignoring manual filters
  // unless the query explicitly asks for them (e.g. "open now").
  const appliedVibe = aiMode
    ? (activeIntent?.vibe && activeIntent.vibe !== 'all' ? activeIntent.vibe : 'all')
    : vibe;
  const appliedOpenFilter = aiMode
    ? (activeIntent?.openFilter && activeIntent.openFilter !== 'all' ? activeIntent.openFilter : 'all')
    : openFilter;

  useEffect(() => {
    if (!demoMode) return;
    setSeedSpots([]);
  }, [demoMode]);
  const mapCenter = React.useMemo(() => {
    if (mapFocus) return mapFocus;
    if (loc) return loc;
    const first = (spots.length ? spots : seedSpots).find((s) => s.example?.spotLatLng || s.example?.location);
    const coords = first?.example?.spotLatLng || first?.example?.location;
    if (coords?.lat && coords?.lng) return { lat: coords.lat, lng: coords.lng };
    return { lat: 29.7604, lng: -95.3698 };
  }, [mapFocus, loc, spots, seedSpots]);
  const fallbackMapUrl = React.useMemo(() => {
    if (!mapKey || !mapCenter) return null;
    const center = `${mapCenter.lat},${mapCenter.lng}`;
    return `https://maps.googleapis.com/maps/api/staticmap?center=${center}&zoom=13&size=800x300&scale=2&key=${mapKey}`;
  }, [mapKey, mapCenter]);

  const passesScope = React.useCallback((it: any) => {
    if (scope === 'friends') {
      if (!user) return false;
      return friendIdSet.has(it.userId);
    }
    if (scope === 'campus') {
      if (!campusKey) return false;
      return it.campus === campusKey || it.campusOrCity === campusKey;
    }
    return true;
  }, [scope, user, friendIdSet, campusKey]);

  const friendSpotCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    checkins.forEach((it: any) => {
      if (!user) return;
      if (!friendIdSet.has(it.userId)) return;
      const name = it.spotName || it.spot || 'Unknown';
      const key = spotKey(it.spotPlaceId, name);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }, [checkins, friendIdSet, user]);

  useEffect(() => {
    (async () => {
      if (!user) return;
      try {
        const ids = await getUserFriendsCached(user.id);
        const resolved = ids || [];
        setFriendIds(resolved.length ? resolved : (isDemoMode() ? [...DEMO_USER_IDS] : []));
        const blocked = await getBlockedUsers(user.id);
        setBlockedIds(blocked || []);
      } catch {}
    })();
  }, [user]);

  useEffect(() => {
    if (!userId) {
      setPreferenceScores({});
      return;
    }
    (async () => {
      try {
        const scores = await getUserPreferenceScores(userId);
        const remote = await getUserPreferenceRemote(userId);
        const merged: Record<string, number> = { ...(scores || {}) };
        if (remote) {
          Object.entries(remote).forEach(([key, value]) => {
            merged[key] = (merged[key] || 0) + (typeof value === 'number' ? value : 0);
          });
        }
        setPreferenceScores(merged);
      } catch {}
    })();
  }, [userId]);

  useEffect(() => {
    (async () => {
      const enabled = await getLocationEnabled().catch(() => true);
      if (!enabled) return;
      const seen = await getPermissionPrimerSeen('location');
      if (!seen) return;
      const current = await requestForegroundLocation();
      if (current) {
        setLoc(current);
      }
    })();
  }, []);

  useEffect(() => {
    if (loc && !mapFocus) setMapFocus(loc);
  }, [loc, mapFocus]);

  useEffect(() => {
    if (scope === 'campus' && !campusKey) {
      setScope('everyone');
    }
  }, [scope, campusKey]);

  useEffect(() => {
    if (!mapFocus) return;
    const id = setTimeout(() => setMapFetchFocus(mapFocus), 650);
    return () => clearTimeout(id);
  }, [mapFocus]);

  // Animate map to new focus when mapFocus changes (e.g., user clicks locate button)
  useEffect(() => {
    if (!mapFocus || !mapViewRef.current) return;
    try {
      mapViewRef.current.animateToRegion({
        latitude: mapFocus.lat,
        longitude: mapFocus.lng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }, 500);
    } catch {
      // Map ref may not support animateToRegion
    }
  }, [mapFocus]);

  useEffect(() => {
    if (!mapKey || !mapCenter) return;
    const center = `${mapCenter.lat},${mapCenter.lng}`;
    const url = `https://maps.googleapis.com/maps/api/staticmap?center=${center}&zoom=13&size=800x300&scale=2&key=${mapKey}`;
    setMapUrl(url);
  }, [mapKey, mapCenter]);

  useEffect(() => {
    let active = true;
    const locKey = loc ? `${loc.lat.toFixed(2)}:${loc.lng.toFixed(2)}` : 'none';
    const fetchKey = `${scope}|${userId || 'anon'}|${campusKey || 'none'}|${friendIds.join(',')}|${blockedIds.join(',')}|${locKey}|${refreshToken}`;
    if (fetchKeyRef.current === fetchKey) return;
    fetchKeyRef.current = fetchKey;
    (async () => {
      setRefreshing(true);
      setLoading(true);
      try {
        if (isDemoMode()) {
          try {
            await seedDemoNetwork(user?.id);
          } catch {}
          let items: any[] = [];
          try {
            items = await getCheckins();
          } catch {}
          items = (items || []).filter((it: any) => {
            if (user && blockedIds.includes(it.userId)) return false;
            if (it.visibility === 'friends' && (!user || !friendIds.includes(it.userId))) return false;
            if (it.visibility === 'close' && (!user || !friendIds.includes(it.userId))) return false;
            if (!passesScope(it)) return false;
            return true;
          });
          if (!active) return;
          setCheckins(items);
          const grouped: Record<string, any> = {};
          items.forEach((it: any) => {
            const name = it.spotName || it.spot || 'Unknown';
            const key = spotKey(it.spotPlaceId, name);
            if (!grouped[key]) {
              grouped[key] = {
                name,
                count: 0,
                example: it,
                openNow: typeof it.openNow === 'boolean' ? it.openNow : undefined,
                tagScores: {},
                _checkins: [], // Track checkins for metric aggregation
              };
            }
            grouped[key].count += 1;
            grouped[key]._checkins.push(it);
            if (typeof it.openNow === 'boolean') grouped[key].openNow = it.openNow;
            if (Array.isArray(it.tags)) {
              it.tags.forEach((tag: any) => {
                const t = String(tag || '').trim();
                if (!t) return;
                grouped[key].tagScores[t] = (grouped[key].tagScores[t] || 0) + 1;
              });
            }
          });
          // Aggregate utility metrics for each spot
          Object.values(grouped).forEach((spot: any) => {
            const metrics = aggregateSpotMetrics(spot._checkins);
            Object.assign(spot, metrics);
            delete spot._checkins; // Clean up
          });
          const arr = Object.values(grouped) as any[];
          const focus = loc;
          if (focus) {
            arr.forEach((a) => {
              const coords = a.example?.spotLatLng || a.example?.location;
              if (coords && coords.lat && coords.lng) {
                a.distance = haversine(focus, { lat: coords.lat, lng: coords.lng });
              } else {
                a.distance = Infinity;
              }
            });
            arr.sort((a, b) => (a.distance || 99999) - (b.distance || 99999));
          } else {
            arr.sort((a, b) => b.count - a.count);
          }
          setSpots(arr.slice(0, 30));
          setStatus(null);
          setLoading(false);
          return;
        }
        const res = await getCheckinsRemote(500);
        let items = (res.items || []).filter((it: any) => {
          if (user && blockedIds.includes(it.userId)) return false;
          if (it.visibility === 'friends' && (!user || !friendIds.includes(it.userId))) return false;
          if (it.visibility === 'close' && (!user || !friendIds.includes(it.userId))) return false;
          if (!passesScope(it)) return false;
          return true;
        });
        try {
          const local = await getCheckins();
          const mineLocal = local.filter((it: any) => it.userId === user?.id);
          const keyOf = (it: any) => it.clientId || it.id;
          const remoteKeys = new Set(items.map(keyOf));
          const merged = [...items, ...mineLocal.filter((it: any) => !remoteKeys.has(keyOf(it)))];
          items = merged;
        } catch {}
        if (!items.length && process.env.NODE_ENV !== 'production') {
          try {
	            await seedDemoNetwork(user?.id);
	            const local = await getCheckins();
	            const fallback = local.filter((it: any) => {
	              if (user && blockedIds.includes(it.userId)) return false;
	              if (it.visibility === 'friends' && (!user || !friendIds.includes(it.userId))) return false;
	              if (it.visibility === 'close' && (!user || !friendIds.includes(it.userId))) return false;
	              if (!passesScope(it)) return false;
	              return true;
	            });
            if (fallback.length) items = fallback;
          } catch {}
        }
        setCheckins(items);
        void syncPendingCheckins(1);
        // compute top spots and attach distance if possible
        const grouped: Record<string, any> = {};
        items.forEach((it: any) => {
          const name = it.spotName || it.spot || 'Unknown';
          const key = spotKey(it.spotPlaceId, name);
          if (!grouped[key]) {
            grouped[key] = {
              name,
              count: 0,
              example: it,
              openNow: typeof it.openNow === 'boolean' ? it.openNow : undefined,
              tagScores: {},
              _checkins: [],
            };
          }
          grouped[key].count += 1;
          grouped[key]._checkins.push(it);
          if (typeof it.openNow === 'boolean') grouped[key].openNow = it.openNow;
          if (Array.isArray(it.tags)) {
            it.tags.forEach((tag: any) => {
              const t = String(tag || '').trim();
              if (!t) return;
              grouped[key].tagScores[t] = (grouped[key].tagScores[t] || 0) + 1;
            });
          }
        });
        // Aggregate utility metrics for each spot
        Object.values(grouped).forEach((spot: any) => {
          const metrics = aggregateSpotMetrics(spot._checkins);
          Object.assign(spot, metrics);
          delete spot._checkins;
        });
        const arr = Object.values(grouped) as any[];
        const focus = loc;
        if (focus) {
          arr.forEach((a) => {
            const coords = a.example?.spotLatLng || a.example?.location;
            if (coords && coords.lat && coords.lng) {
              a.distance = loc ? haversine(loc, { lat: coords.lat, lng: coords.lng }) : haversine(focus, { lat: coords.lat, lng: coords.lng });
            } else {
              a.distance = Infinity;
            }
          });
          arr.sort((a, b) => (a.distance || 99999) - (b.distance || 99999));
        } else {
          // Use quality-based ranking when no location
          arr.sort((a, b) => {
            const scoreA = calculateCompositeScore(a, loc);
            const scoreB = calculateCompositeScore(b, loc);
            return scoreB - scoreA;
          });
        }
        if (!active) return;
        const baseSpots = arr.slice(0, 30);
        setSpots(baseSpots);
        setStatus(null);
        setLoading(false);
        const enrichTargets = baseSpots.slice(0, 12);
        setTimeout(() => {
          Promise.all(enrichTargets.map(async (a) => {
            try {
              const placeId = a.example?.spotPlaceId || a.example?.placeId;
              if (!placeId || enrichRef.current.has(placeId)) return a;
              enrichRef.current.add(placeId);
              const signals = await getUserPlaceSignals(userId || undefined, placeId, a.name);
              const localTags = await getPlaceTagScores(placeId, a.name);
              const mergedTagScores: Record<string, number> = { ...(a.tagScores || {}) };
              Object.entries(localTags || {}).forEach(([key, value]) => {
                if (typeof value !== 'number') return;
                mergedTagScores[key] = (mergedTagScores[key] || 0) + value;
              });
              return { ...a, signals, tagScores: mergedTagScores };
            } catch {
              return a;
            }
          })).then((next) => {
            if (!active) return;
            setSpots((prev) => {
              const map = new Map(prev.map((p) => [spotKey(p.example?.spotPlaceId, p.name), p]));
              next.forEach((updated) => {
                const key = spotKey(updated.example?.spotPlaceId, updated.name);
                map.set(key, updated);
              });
              return Array.from(map.values());
            });
          });
        }, 0);
        if (wasOfflineRef.current) {
          showToast('Back online. Explore updated.', 'success');
          wasOfflineRef.current = false;
        }
      } catch {
        const local = await getCheckins();
        const filtered = local.filter((it: any) => {
          if (user && blockedIds.includes(it.userId)) return false;
          if (it.visibility === 'friends' && (!user || !friendIds.includes(it.userId))) return false;
          if (it.visibility === 'close' && (!user || !friendIds.includes(it.userId))) return false;
          if (!passesScope(it)) return false;
          return true;
        });
        setCheckins(filtered);
        const grouped: Record<string, any> = {};
        filtered.forEach((it: any) => {
          const name = it.spotName || it.spot || 'Unknown';
          const key = spotKey(it.spotPlaceId, name);
          if (!grouped[key]) {
            grouped[key] = {
              name,
              count: 0,
              example: it,
              openNow: typeof it.openNow === 'boolean' ? it.openNow : undefined,
              tagScores: {},
              _checkins: [],
            };
          }
          grouped[key].count += 1;
          grouped[key]._checkins.push(it);
          if (typeof it.openNow === 'boolean') grouped[key].openNow = it.openNow;
          if (Array.isArray(it.tags)) {
            it.tags.forEach((tag: any) => {
              const t = String(tag || '').trim();
              if (!t) return;
              grouped[key].tagScores[t] = (grouped[key].tagScores[t] || 0) + 1;
            });
          }
        });
        // Aggregate utility metrics
        Object.values(grouped).forEach((spot: any) => {
          const metrics = aggregateSpotMetrics(spot._checkins);
          Object.assign(spot, metrics);
          delete spot._checkins;
        });
        const offlineArr = Object.values(grouped).sort((a: any, b: any) => {
          const scoreA = calculateCompositeScore(a, loc);
          const scoreB = calculateCompositeScore(b, loc);
          return scoreB - scoreA;
        });
        if (!active) return;
        setSpots(offlineArr);
        setStatus({ message: 'Offline right now. Showing saved spots.', tone: 'warning' });
        wasOfflineRef.current = true;
      } finally {
        setRefreshing(false);
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [scope, friendIds, user, userId, loc, blockedIds, refreshToken, showToast, campusKey, passesScope]);

  useEffect(() => {
    const focus = loc || mapFocus;
    if (!focus) return;
    setSpots((prev) => {
      const next = prev.map((a) => {
        const coords = a.example?.spotLatLng || a.example?.location;
        if (coords && coords.lat && coords.lng) {
          return { ...a, distance: haversine(focus, { lat: coords.lat, lng: coords.lng }) };
        }
        return { ...a, distance: Infinity };
      });
      next.sort((a, b) => (a.distance || 99999) - (b.distance || 99999));
      return next;
    });
  }, [mapFocus, loc]);

  const matchesVibe = React.useCallback((input: string, target: typeof vibe) => {
    if (target === 'all') return true;
    const text = input.toLowerCase();
    if (target === 'quiet') return ['library', 'study', 'quiet', 'nook', 'reading', 'campus'].some((k) => text.includes(k));
    if (target === 'study') return ['study', 'library', 'cowork', 'university', 'workspace', 'campus'].some((k) => text.includes(k));
    if (target === 'cowork') return ['cowork', 'co-work', 'workspace', 'shared office', 'flex office', 'serviced office', 'wework', 'regus', 'industrious', 'common desk'].some((k) => text.includes(k));
    if (target === 'social') return ['cafe', 'coffee', 'lounge', 'bistro', 'bakery', 'tea'].some((k) => text.includes(k));
    if (target === 'late') return ['late', '24', 'diner', 'night', 'midnight', 'open'].some((k) => text.includes(k));
    return true;
  }, []);

  const hasStudySignal = React.useCallback((types: string[] | undefined, text: string) => {
    const hay = `${types ? types.join(' ') : ''} ${text}`.toLowerCase();
    return ['library', 'university', 'college', 'campus', 'cowork', 'study', 'reading'].some((k) => hay.includes(k));
  }, []);

  const hasCoworkSignal = React.useCallback((types: string[] | undefined, text: string) => {
    const hay = `${types ? types.join(' ') : ''} ${text}`.toLowerCase();
    return ['cowork', 'co-work', 'workspace', 'shared office', 'flex office', 'serviced office'].some((k) => hay.includes(k))
      || hay.includes('coworking_space')
      || hay.includes('wework')
      || hay.includes('regus')
      || hay.includes('industrious')
      || hay.includes('common desk');
  }, []);

  const classifySpot = React.useCallback((place: any) => {
    const hay = `${place.name || ''} ${place.address || ''} ${(place.types || []).join(' ')}`.toLowerCase();
    if (hay.includes('library')) return 'library';
    if (hay.includes('cowork')) return 'cowork';
    if (hay.includes('cafe') || hay.includes('coffee') || hay.includes('espresso') || hay.includes('tea')) return 'cafe';
    return 'other';
  }, []);

  const scoreNearby = React.useCallback((place: any) => {
    const rating = place.rating || 0;
    const ratingCount = place.ratingCount || 0;
    const base = rating * Math.log10(1 + ratingCount);
    const resolvedPlaceId = place?.placeId || place?.example?.spotPlaceId || place?.example?.placeId || null;
    const resolvedName = place?.name || place?.example?.spotName || place?.example?.name || 'Unknown';
    const friendKey = spotKey(resolvedPlaceId || undefined, resolvedName);
    const friendBoost = Math.min(3, friendSpotCounts.get(friendKey) || 0) * 0.6;
    const isOpen = place.openNow;
    const openBoost = isOpen === true ? 0.6 : isOpen === false ? -1.2 : 0;
    const typeStr = Array.isArray(place.types) ? place.types.join(' ') : '';
    const text = `${resolvedName} ${place.address || place.example?.address || ''} ${place.description || ''} ${typeStr}`;
    const intentVibe = aiMode && activeIntent?.vibe && activeIntent.vibe !== 'all' ? activeIntent.vibe : null;
    const intentHours = aiMode && activeIntent?.openFilter && activeIntent.openFilter !== 'all' ? activeIntent.openFilter : null;
    const effectiveVibe = intentVibe || (aiMode ? 'all' : vibe);
    const vibeBoost = effectiveVibe === 'all' ? 0 : matchesVibe(text, effectiveVibe) ? 0.5 : -0.8;
    const intentHoursBoost = intentHours
      ? (
          intentHours === 'open'
            ? (isOpen === true ? 0.5 : isOpen === false ? -0.9 : 0)
            : (isOpen === false ? 0.35 : isOpen === true ? -0.65 : 0)
        )
      : 0;
    const studyBoost = (effectiveVibe === 'study' || effectiveVibe === 'quiet') && hasStudySignal(place.types, text) ? 0.9 : 0;
    const coworkBoost = effectiveVibe === 'cowork' && hasCoworkSignal(place.types, text) ? 1.1 : 0;
    const cafePenalty = (effectiveVibe === 'study' || effectiveVibe === 'quiet' || effectiveVibe === 'cowork') && /cafe|coffee|espresso|tea/.test(text.toLowerCase()) ? 0.2 : 0;
    const coords = place.location || place.example?.spotLatLng || place.example?.location;
    const distanceKm = loc && coords ? haversine(loc, coords) : 0;
    const distancePenalty = distanceKm ? Math.min(4, distanceKm) * 0.3 : 0;
    const category = classifySpotCategory(resolvedName, place.types);
    const prefBoost = Math.min(2, (preferenceScores[category] || 0) * 0.6);
    const signals = place.signals || {};
    const signalBoost = Math.min(2.5, (signals.taps || 0) * 0.4 + (signals.saves || 0) * 0.7 + (signals.views || 0) * 0.1);
    const tagScores = place.tagScores || {};
    const tagStudy = (tagScores['Quiet'] || 0) + (tagScores['Seating'] || 0) + (tagScores['Outlets'] || 0) + (tagScores['Wi-Fi'] || 0);
    const tagCozy = tagScores['Cozy'] || 0;
    const tagBoost = (effectiveVibe === 'study' || effectiveVibe === 'quiet' || effectiveVibe === 'cowork')
      ? Math.min(2, Math.log10(1 + tagStudy))
      : Math.min(1.2, Math.log10(1 + tagCozy));
    const intentTags = aiMode ? (activeIntent?.tags || []) : [];
    let intentBoost = 0;
    if (intentTags.length) {
      const hay = text.toLowerCase();
      intentTags.forEach((tag) => {
        const score = tagScores[tag] || 0;
        if (score > 0) {
          intentBoost += Math.min(1.6, Math.log10(1 + score) * 0.9);
          return;
        }
        if (tag === 'Outlets' && hasCoworkSignal(place.types, hay)) intentBoost += 0.35;
        if (tag === 'Wi-Fi' && /cafe|coffee|library|cowork|workspace/.test(hay)) intentBoost += 0.25;
        if (tag === 'Quiet' && /library|quiet|reading|study/.test(hay)) intentBoost += 0.25;
        if (tag === 'Bright' && /bright|sun|window/.test(hay)) intentBoost += 0.2;
        if (tag === 'Spacious' && /spacious|roomy|large/.test(hay)) intentBoost += 0.2;
        if (tag === 'Seating' && /seating|booth|chair|bench/.test(hay)) intentBoost += 0.15;
      });
    }
    const nowHour = new Date().getHours();
    const isLate = nowHour >= 20 || nowHour <= 2;
    const lateBoost = effectiveVibe === 'late' && (hasLateSignal(place) || (isLate && isOpen)) ? 0.7 : 0;
    const liveCount = place.count || 0;
    const crowdBoost = Math.min(1.5, Math.log10(1 + liveCount));
    const globalScore = base + openBoost + vibeBoost + intentHoursBoost + studyBoost + coworkBoost + lateBoost + crowdBoost - cafePenalty - distancePenalty;
    const personalScore = globalScore + prefBoost + signalBoost + tagBoost + friendBoost + intentBoost;
    return globalScore * 0.6 + personalScore * 0.4;
  }, [friendSpotCounts, aiMode, activeIntent, vibe, loc, preferenceScores, matchesVibe, hasStudySignal, hasCoworkSignal]);

  useEffect(() => {
    if (demoMode) return;
    if (!user || seedLoading) return;
    if (!mapKey && !user?.city && !user?.campus && !loc && !mapFetchFocus) return;
    const focus = mapFetchFocus || loc;
    const seedVibe = aiMode ? appliedVibe : vibe;
    const seedKey = focus
      ? `${focus.lat.toFixed(2)}:${focus.lng.toFixed(2)}:${seedVibe}`
      : `city:${user?.city || user?.campus || user?.campusOrCity || 'none'}:${seedVibe}`;
    const cached = seedCacheRef.current.get(seedKey);
    if (cached && cached.length) {
      setSeedSpots(cached.slice(0, 12));
      setLoading(false);
      return;
    }
    if (seedQueryRef.current === seedKey && seedSpots.length) return;
    seedQueryRef.current = seedKey;
    let cancelled = false;
    const runSeedFetch = async () => {
      setSeedLoading(true);
      try {
        const results: any[] = [];
        if (focus) {
          const [nearbyStudy, nearbyGeneral] = await Promise.all([
            searchPlacesNearby(focus.lat, focus.lng, 4500, 'study'),
            searchPlacesNearby(focus.lat, focus.lng, 4500, 'general'),
          ]);
          const biasQueries = seedVibe === 'cowork'
            ? [
                'coworking space',
                'shared office',
                'flex office',
                'workspace',
                'wework',
                'regus',
                'industrious',
                'common desk',
                'student center workspace',
              ]
            : [
                'coffee shop',
                'cafe',
                'library',
                'coworking space',
                'study spot',
                'bookstore',
                'student center',
                'campus library',
              ];
          const biasResults = await Promise.all(
            biasQueries.map((q) => searchPlacesWithBias(q, focus.lat, focus.lng, 12000, 8))
          );
          const merged = [...nearbyStudy];
          [nearbyGeneral, ...biasResults].forEach((list) => {
            list.forEach((p) => {
              const key = `${p.placeId || ''}-${p.name}`;
              if (merged.some((m) => `${m.placeId || ''}-${m.name}` === key)) return;
              merged.push(p);
            });
          });
          const denyTypeTokens = [
            'department_store',
            'shopping_mall',
            'supermarket',
            'grocery_store',
            'warehouse_store',
            'hardware_store',
            'home_goods_store',
            'clothing_store',
            'electronics_store',
            'furniture_store',
            'stadium',
            'movie_theater',
            'casino',
          ];
          const filtered = merged.filter((p) => {
            const hay = `${p.name || ''} ${p.address || ''}`;
            const typeStr = Array.isArray(p.types) ? p.types.join(' ') : '';
            const deny = denyTypeTokens.some((t) => typeStr.includes(t));
            if (deny) return false;
            if (seedVibe === 'study' || seedVibe === 'quiet') return studyScoreForPlace(p) >= 4 || hasStudySignal(p.types, hay);
            if (seedVibe === 'cowork') return hasCoworkSignal(p.types, hay);
            if (seedVibe === 'social') return /cafe|coffee|espresso|tea|boba|bakery|lounge|restaurant/.test(hay.toLowerCase());
            if (seedVibe === 'late') {
              if (p.openNow === false && !hasLateSignal(p)) return false;
              return isStudyCandidate(p) || hasLateSignal(p);
            }
            return isStudyCandidate(p) && studyScoreForPlace(p) >= 2;
          });
          const finalFiltered = filtered.length >= 8 ? filtered : merged.filter((p) => {
            const typeStr = Array.isArray(p.types) ? p.types.join(' ') : '';
            const deny = denyTypeTokens.some((t) => typeStr.includes(t));
            if (deny) return false;
            if (seedVibe === 'cowork') return hasCoworkSignal(p.types, `${p.name || ''} ${p.address || ''}`);
            if (seedVibe === 'late') {
              if (p.openNow === false && !hasLateSignal(p)) return false;
              return isStudyCandidate(p) || hasLateSignal(p);
            }
            return isStudyCandidate(p);
          });
          const denseCount = finalFiltered.filter((p) => {
            if (!p.location) return false;
            return haversine(focus, p.location) <= 3;
          }).length;
          const dynamicRadiusKm = denseCount >= 8 ? 5 : denseCount >= 4 ? 8 : 14;
          const maxTravelMinutes = seedVibe === 'late' ? 25 : 20;
          const speedKmh = 35;
          const maxTravelDistance = (speedKmh * maxTravelMinutes) / 60;
          const maxDistance = Math.min(dynamicRadiusKm, maxTravelDistance);
          const scoped = finalFiltered.filter((p) => {
            if (!p.location) return false;
            const d = haversine(focus, p.location);
            return d <= maxDistance;
          });
          const extended = finalFiltered.filter((p) => {
            if (!p.location) return false;
            const d = haversine(focus, p.location);
            return d <= Math.min(24, maxTravelDistance + 6);
          });
          const baseList = scoped.length >= 5 ? scoped : extended.length ? extended : finalFiltered;
          const enrichedBase = await Promise.all(baseList.slice(0, 14).map(async (p) => {
            try {
              const [signals, localTags] = await Promise.all([
                getUserPlaceSignals(userId || undefined, p.placeId, p.name),
                getPlaceTagScores(p.placeId, p.name),
              ]);
              return { ...p, signals, tagScores: { ...(localTags || {}) } };
            } catch {
              return p;
            }
          }));
          const scored = enrichedBase
            .map((p) => ({ ...p, _score: scoreNearby(p) }))
            .sort((a, b) => (b._score || 0) - (a._score || 0));
          const buckets: Record<string, any[]> = { cafe: [], library: [], cowork: [], other: [] };
          scored.forEach((p) => {
            buckets[classifySpot(p)].push(p);
          });
          const diversified: any[] = [];
          const order = seedVibe === 'study' || seedVibe === 'quiet'
            ? ['library', 'cowork', 'cafe', 'other']
            : seedVibe === 'cowork'
              ? ['cowork', 'library', 'cafe', 'other']
              : ['cafe', 'library', 'cowork', 'other'];
          while (diversified.length < Math.min(12, scored.length)) {
            let added = false;
            for (const key of order) {
              const next = buckets[key].shift();
              if (next) {
                diversified.push(next);
                added = true;
              }
              if (diversified.length >= Math.min(12, scored.length)) break;
            }
            if (!added) break;
          }
          const finalList = diversified.length ? diversified : scored;
          if (seedVibe === 'all' || seedVibe === 'social') {
            const cafeCount = finalList.filter((p) => classifySpot(p) === 'cafe').length;
            if (cafeCount < 2 && buckets.cafe.length) {
              const fill = buckets.cafe.slice(0, 2 - cafeCount);
              for (let i = 0; i < fill.length && i < finalList.length; i += 1) {
                finalList[finalList.length - 1 - i] = fill[i];
              }
            }
          } else if (seedVibe === 'cowork') {
            const coworkCount = finalList.filter((p) => classifySpot(p) === 'cowork').length;
            if (coworkCount < 2 && buckets.cowork.length) {
              const fill = buckets.cowork.slice(0, 2 - coworkCount);
              for (let i = 0; i < fill.length && i < finalList.length; i += 1) {
                finalList[finalList.length - 1 - i] = fill[i];
              }
            }
          }
          for (const p of finalList) {
            if (!p?.name) continue;
            const key = `${p.placeId || ''}-${p.name}`;
            if (results.some((it) => it.key === key)) continue;
            const distance = p.location && loc ? haversine(loc, p.location) : undefined;
            const signals = p.signals;
            const tagScores = p.tagScores;
            results.push({
              key,
              name: p.name,
              count: 1,
              seed: true,
              openNow: p.openNow,
              rating: p.rating,
              ratingCount: p.ratingCount,
              types: p.types,
              distance,
              signals,
              tagScores,
              description: describeSpot(p.name, p.address),
              example: {
                spotPlaceId: p.placeId,
                spotLatLng: p.location,
                location: p.location,
                address: p.address,
              },
            });
          }
        }
        if (!results.length) {
            const seedBase = user?.city || user?.campus || user?.campusOrCity || 'Houston';
            const queries = [
              `popular study cafes near ${seedBase}`,
              `public library near ${seedBase}`,
              `coworking space near ${seedBase}`,
            ];
            const queryResults = await Promise.all(queries.map((q) => searchPlaces(q, 4)));
            for (const r of queryResults) {
              for (const p of r) {
                if (!p?.name) continue;
                const hay = `${p.name || ''} ${p.address || ''}`;
                if (!matchesVibe(hay, seedVibe)) continue;
                const key = `${p.placeId || ''}-${p.name}`;
                if (results.some((it) => it.key === key)) continue;
                const distance = p.location && loc ? haversine(loc, p.location) : undefined;
                const [signals, localTags] = await Promise.all([
                  getUserPlaceSignals(userId || undefined, p.placeId, p.name),
                  getPlaceTagScores(p.placeId, p.name),
                ]);
                const tagScores = { ...(localTags || {}) };
                results.push({
                  key,
                  name: p.name,
                  count: 1,
                  seed: true,
                  openNow: p.openNow,
                  rating: p.rating,
                  ratingCount: p.ratingCount,
                  types: p.types,
                  distance,
                  signals,
                  tagScores,
                  description: describeSpot(p.name, p.address),
                  example: {
                    spotPlaceId: p.placeId,
                    spotLatLng: p.location,
                    location: p.location,
                    address: p.address,
                  },
                });
              }
            }
          }
        if (!cancelled) {
          const nextSeed = results.slice(0, 12);
          setSeedSpots(nextSeed);
          seedCacheRef.current.set(seedKey, nextSeed);
          setLoading(false);
        }
      } catch {
        // ignore seed failures
      } finally {
        if (!cancelled) setSeedLoading(false);
      }
    };
    const task = isWeb ? null : InteractionManager.runAfterInteractions(runSeedFetch);
    if (isWeb) {
      void runSeedFetch();
    }
    return () => {
      cancelled = true;
      task?.cancel?.();
    };
  }, [demoMode, user, userId, spots.length, seedSpots.length, seedLoading, mapKey, loc, mapFetchFocus, aiMode, appliedVibe, vibe, friendSpotCounts, matchesVibe, scoreNearby, classifySpot, hasStudySignal, hasCoworkSignal, isWeb]);

  useEffect(() => {
    if (demoMode) return;
    if (!seedSpots.length) return;
    let active = true;
    const runDetailFetch = async () => {
      const updates: Record<string, any> = {};
      for (const spot of seedSpots.slice(0, 6)) {
        const placeId = spot.example?.spotPlaceId;
        if (!placeId) continue;
        if (detailFetchRef.current.has(placeId)) continue;
        detailFetchRef.current.add(placeId);
        const detail = await getPlaceDetails(placeId);
        if (detail) updates[placeId] = detail;
      }
      if (!active) return;
      const updateKeys = Object.keys(updates);
      if (!updateKeys.length) return;
      setSeedSpots((prev) =>
        prev.map((spot) => {
          const placeId = spot.example?.spotPlaceId;
          if (!placeId) return spot;
          const detail = updates[placeId];
          if (!detail) return spot;
          const address = detail.address || spot.example?.address;
          return {
            ...spot,
            types: detail.types || spot.types,
            openNow: typeof detail.openNow === 'boolean' ? detail.openNow : spot.openNow,
            description: spot.description || describeSpot(detail.name || spot.name, address),
            example: {
              ...spot.example,
              address,
            },
          };
        })
      );
    };
    const task = isWeb ? null : InteractionManager.runAfterInteractions(runDetailFetch);
    if (isWeb) {
      void runDetailFetch();
    }
    return () => {
      active = false;
      task?.cancel?.();
    };
  }, [demoMode, seedSpots, isWeb]);

  useEffect(() => {
    if (demoMode) return;
    if (appliedOpenFilter === 'all') return;
    const useSeeds = seedSpots.length > 0;
    const source = useSeeds ? seedSpots : spots;
    if (!source.length) return;
    let active = true;
    const runOpenNowFetch = async () => {
      const targets = source
        .filter((s) => s.openNow === undefined && s.example?.spotPlaceId)
        .filter((s) => !openNowFetchRef.current.has(s.example.spotPlaceId))
        .slice(0, 20);
      if (!targets.length) return;
      const updates: Record<string, any> = {};
      await Promise.all(targets.map(async (spot) => {
        const placeId = spot.example.spotPlaceId;
        if (!placeId) return;
        openNowFetchRef.current.add(placeId);
        try {
          const detail = await getPlaceDetails(placeId);
          if (detail && typeof detail.openNow === 'boolean') {
            updates[placeId] = detail.openNow;
          }
        } catch {}
      }));
      if (!active) return;
      const keys = Object.keys(updates);
      if (!keys.length) return;
      if (!useSeeds) {
        setSpots((prev) =>
          prev.map((spot) => {
            const placeId = spot.example?.spotPlaceId;
            if (!placeId || updates[placeId] === undefined) return spot;
            return { ...spot, openNow: updates[placeId] };
          })
        );
      } else {
        setSeedSpots((prev) =>
          prev.map((spot) => {
            const placeId = spot.example?.spotPlaceId;
            if (!placeId || updates[placeId] === undefined) return spot;
            return { ...spot, openNow: updates[placeId] };
          })
        );
      }
    };
    const task = isWeb ? null : InteractionManager.runAfterInteractions(runOpenNowFetch);
    if (isWeb) {
      void runOpenNowFetch();
    }
    return () => {
      active = false;
      task?.cancel?.();
    };
  }, [demoMode, appliedOpenFilter, spots, seedSpots, isWeb]);

  const maxSuggestedDistance = React.useMemo(() => {
    const focus = mapFocus || loc;
    if (!focus) return null;
    const denseCount = seedSpots.filter((s) => typeof s.distance === 'number' && s.distance <= 3).length;
    const dynamicRadiusKm = denseCount >= 8 ? 5 : denseCount >= 4 ? 8 : 14;
    const maxTravelMinutes = appliedVibe === 'late' ? 25 : 20;
    const speedKmh = 35;
    const maxTravelDistance = (speedKmh * maxTravelMinutes) / 60;
    return Math.min(dynamicRadiusKm, maxTravelDistance);
  }, [seedSpots, mapFocus, loc, appliedVibe]);

  const filteredSeedSpots = React.useMemo(() => {
    const base = seedSpots.filter((s) => {
      if (appliedOpenFilter !== 'all') {
        if (typeof s.openNow !== 'boolean') return false;
        if (appliedOpenFilter === 'open' && !s.openNow) return false;
        if (appliedOpenFilter === 'closed' && s.openNow) return false;
      }
      if (maxSuggestedDistance && typeof s.distance === 'number' && s.distance > maxSuggestedDistance) return false;
      return true;
    });
    if (base.length >= 6) return base;
    const relaxedHours = seedSpots.filter((s) => {
      if (maxSuggestedDistance && typeof s.distance === 'number' && s.distance > maxSuggestedDistance) return false;
      return true;
    });
    if (relaxedHours.length >= 6) return relaxedHours;
    if (!maxSuggestedDistance) return relaxedHours;
    return seedSpots.filter((s) => {
      if (typeof s.distance === 'number' && s.distance > Math.min(24, maxSuggestedDistance + 8)) return false;
      return true;
    });
  }, [seedSpots, appliedOpenFilter, maxSuggestedDistance]);

  useEffect(() => {
    if (!filteredSeedSpots.length) return;
    filteredSeedSpots.slice(0, 10).forEach((s) => {
      const key = s.example?.spotPlaceId || s.name;
      if (!key || impressionRef.current.has(key)) return;
      impressionRef.current.add(key);
      const category = classifySpotCategory(s.name, s.types);
      const eventPayload = {
        event: 'impression' as const,
        ts: Date.now(),
        userId: userId || undefined,
        placeId: s.example?.spotPlaceId || null,
        name: s.name,
        category,
      };
      recordPlaceEvent(eventPayload);
      recordPlaceEventRemote(eventPayload);
    });
  }, [filteredSeedSpots, userId]);
  const displaySpots = demoMode ? spots : (filteredSeedSpots.length ? filteredSeedSpots : spots);
  const isSeeded = !demoMode && filteredSeedSpots.length > 0;
  const liveCheckins = React.useMemo(
    () => checkins.filter((it: any) => it.spotLatLng || it.location).slice(0, 6),
    [checkins]
  );
  const liveUnique = React.useMemo(() => {
    const spotKeys = new Set(spots.map((s) => spotKey(s.example?.spotPlaceId, s.name)));
    const seen = new Set<string>();
    return liveCheckins.filter((it: any) => {
      const name = it.spotName || it.spot || 'Unknown';
      const key = spotKey(it.spotPlaceId, name);
      if (spotKeys.has(key)) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [liveCheckins, spots]);
  const filteredSpots = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const isNameSearch = !!q && !activeIntent;
    const byQuery = isNameSearch ? displaySpots.filter((s) => (s.name || '').toLowerCase().includes(q)) : displaySpots;
    if (aiMode) return byQuery;

    // Apply grouped filters
    return byQuery.filter((s) => {
      const typeStr = Array.isArray(s.types) ? s.types.join(' ') : '';
      const tags = Array.isArray(s.tags) ? s.tags.join(' ') : '';
      const exampleTags = Array.isArray(s.example?.tags) ? s.example.tags.join(' ') : '';
      const caption = typeof s.example?.caption === 'string' ? s.example.caption : '';
      const hay = `${s.name || ''} ${s.description || ''} ${typeStr} ${tags} ${exampleTags} ${caption}`.toLowerCase();

      // Atmosphere filters
      const atmosphereFilters = selectedFilters.atmosphere || [];
      if (atmosphereFilters.length > 0) {
        const hasMatch = atmosphereFilters.some(filter => {
          if (filter === 'quiet') return hay.includes('quiet') || hay.includes('library') || hay.includes('reading');
          if (filter === 'social') return hay.includes('social') || hay.includes('cafe') || hay.includes('lounge');
          if (filter === 'cozy') return hay.includes('cozy') || hay.includes('warm');
          if (filter === 'bright') return hay.includes('bright') || hay.includes('light') || hay.includes('airy');
          if (filter === 'spacious') return hay.includes('spacious') || hay.includes('roomy') || hay.includes('large');
          return false;
        });
        if (!hasMatch) return false;
      }

      // Amenities filters
      const amenitiesFilters = selectedFilters.amenities || [];
      if (amenitiesFilters.length > 0) {
        const hasMatch = amenitiesFilters.every(filter => {
          if (filter === 'wifi') return hay.includes('wifi') || hay.includes('wi-fi') || hay.includes('internet');
          if (filter === 'outlets') return hay.includes('outlet') || hay.includes('power') || hay.includes('charging');
          if (filter === 'seating') return hay.includes('seating') || hay.includes('seats') || hay.includes('tables');
          if (filter === 'outdoor') return hay.includes('outdoor') || hay.includes('patio') || hay.includes('terrace');
          if (filter === 'parking') return hay.includes('parking') || hay.includes('garage');
          return true;
        });
        if (!hasMatch) return false;
      }

      // Type filters
      const typeFilters = selectedFilters.type || [];
      if (typeFilters.length > 0) {
        const hasMatch = typeFilters.some(filter => {
          if (filter === 'cafe') return hay.includes('cafe') || hay.includes('coffee');
          if (filter === 'library') return hay.includes('library');
          if (filter === 'cowork') return hay.includes('cowork') || hay.includes('co-work');
          if (filter === 'study') return hay.includes('study') || hay.includes('university') || hay.includes('campus');
          return false;
        });
        if (!hasMatch) return false;
      }

      // Hours filters
      const hoursFilters = selectedFilters.hours || [];
      if (hoursFilters.length > 0) {
        const hoursMatch = hoursFilters.some(filter => {
          if (filter === 'open') return s.openNow === true;
          if (filter === 'closed') return s.openNow === false;
          if (filter === 'late') return hay.includes('late') || hay.includes('24') || hay.includes('midnight');
          return true;
        });
        if (!hoursMatch) return false;
      }

      // Spot Intel filters (utility metrics from check-ins)
      const spotIntelFilters = selectedFilters.spotIntel || [];
      if (spotIntelFilters.length > 0) {
        const intelMatch = spotIntelFilters.every(filter => {
          if (filter === 'fast-wifi') return s.avgWifiSpeed && s.avgWifiSpeed >= 4;
          if (filter === 'has-outlets') return s.topOutletAvailability === 'plenty' || s.topOutletAvailability === 'some';
          if (filter === 'not-busy') return s.avgBusyness && s.avgBusyness <= 2;
          if (filter === 'quiet-spot') return s.avgNoiseLevel && s.avgNoiseLevel <= 2;
          if (filter === 'lively-spot') return s.avgNoiseLevel && s.avgNoiseLevel >= 4;
          return true;
        });
        if (!intelMatch) return false;
      }

      // Legacy vibe filter (for backward compatibility)
      if (vibe !== 'all' && !matchesVibe(hay, vibe)) return false;

      return true;
    });
  }, [query, displaySpots, activeIntent, aiMode, selectedFilters, vibe, matchesVibe]);

  const filteredByOpen = React.useMemo(() => {
    // Hours filter is now handled in filteredSpots, but keep for backward compatibility
    if (appliedOpenFilter === 'all') return filteredSpots;
    return filteredSpots.filter((s) => {
      if (typeof s.openNow !== 'boolean') return false;
      return appliedOpenFilter === 'open' ? s.openNow : !s.openNow;
    });
  }, [filteredSpots, appliedOpenFilter]);
  const sortOption = selectedFilters.sort?.[0] || 'popular';
  const rankedSpots = React.useMemo(() => {
    const next = filteredByOpen.slice();

    // Apply sorting based on selected sort option
    if (sortOption === 'nearest') {
      // Sort by distance (nearest first)
      next.sort((a: any, b: any) => {
        const distA = a.distance ?? Infinity;
        const distB = b.distance ?? Infinity;
        return distA - distB;
      });
    } else if (sortOption === 'quality') {
      // Sort by quality score (WiFi, noise, busyness, outlets)
      next.sort((a: any, b: any) => {
        const scoreA = calculateCompositeScore(a, null);
        const scoreB = calculateCompositeScore(b, null);
        return scoreB - scoreA;
      });
    } else if (aiMode) {
      // Default AI mode sorting
      next.sort((a: any, b: any) => scoreNearby(b) - scoreNearby(a));
    } else {
      // Default: sort by popularity (check-in count)
      next.sort((a: any, b: any) => (b.count || 0) - (a.count || 0));
    }

    return next;
  }, [filteredByOpen, aiMode, scoreNearby, sortOption]);
  const showRanks = !query.trim() || aiMode;

  // Memoize spot tags to avoid recomputing on every render
  const spotTagsMap = React.useMemo(() => {
    const map = new Map<string, string[]>();
    rankedSpots.forEach((spot) => {
      const key = spotKey(spot.example?.spotPlaceId || spot.placeId, spot.name || 'spot');
      map.set(key, buildSpotTags(spot));
    });
    return map;
  }, [rankedSpots]);

  // Memoize spot press handler
  const handleSpotPress = useCallback((item: any) => {
    try {
      const category = classifySpotCategory(item.name, item.types);
      const eventPayload = {
        event: 'tap' as const,
        ts: Date.now(),
        userId: userId || undefined,
        placeId: item.example?.spotPlaceId || null,
        name: item.name,
        category,
      };
      recordPlaceEvent(eventPayload);
      recordPlaceEventRemote(eventPayload);
      openSpotSheet(item);
    } catch {}
  }, [userId]);
  const listData = React.useMemo(() => {
    if (!rankedSpots.length) return [];
    if (query.trim()) return rankedSpots;
    return rankedSpots.slice(0, 10);
  }, [rankedSpots, query]);

  const friendSuggested = React.useMemo(() => {
    if (!user) return [];
    const grouped: Record<string, any> = {};
    checkins.forEach((it: any) => {
      if (!friendIdSet.has(it.userId)) return;
      const name = it.spotName || it.spot || 'Unknown';
      const key = spotKey(it.spotPlaceId, name);
      grouped[key] = grouped[key] || { name, count: 0, example: it, friends: new Set<string>() };
      grouped[key].count += 1;
      grouped[key].friends.add(it.userId);
    });
    return Object.values(grouped)
      .map((s: any) => ({ ...s, friendCount: s.friends.size }))
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, 6);
  }, [checkins, friendIdSet, user]);
  const hasMapView = typeof MapView === 'function';
  const canShowInteractiveMap = hasMapView && (!isWeb || hasMapKey);
  const mapPreviewUrl = mapUrl || fallbackMapUrl;
  const maxSpotCount = React.useMemo(() => {
    return Math.max(1, ...spots.map((s) => s.count || 0));
  }, [spots]);
  const topSpots = rankedSpots.slice(0, 5);
  const markerSpots = React.useMemo(() => rankedSpots.slice(0, 24), [rankedSpots]);
  const previewSpots = React.useMemo(() => rankedSpots.slice(0, 3), [rankedSpots]);
  const listKeyExtractor = React.useCallback((item: any) => {
    if (item?.key) return item.key;
    const placeId = item?.example?.spotPlaceId || item?.placeId || item?.example?.placeId;
    return spotKey(placeId, item?.name || 'spot');
  }, []);

  const handleRegionChange = React.useCallback((region: any) => {
    if (!region?.latitude || !region?.longitude) return;
    const next = { lat: region.latitude, lng: region.longitude };
    setMapFocus((prev) => {
      if (!prev) return next;
      const moved = haversine(prev, next);
      if (moved < 0.15) return prev; // ignore tiny drags to avoid refetch churn
      return next;
    });
  }, []);
  const handleLocateMe = React.useCallback(async () => {
    if (locBusy) return;
    setLocBusy(true);
    try {
      const enabled = await getLocationEnabled().catch(() => true);
      if (!enabled) {
        const now = Date.now();
        if (now - lastLocateFailRef.current > 3500) {
          lastLocateFailRef.current = now;
          showToast('Location is off. Turn it on in Settings.', 'info');
        }
        try {
          router.push('/settings');
        } catch {}
        return;
      }

      // If we already have a location, just re-center without extra prompts.
      if (loc) {
        setMapFocus(loc);
        return;
      }

      try {
        await setPermissionPrimerSeen('location', true);
        await setLocationEnabled(true);
      } catch {}

      const current = await requestForegroundLocation();
      if (current) {
        setLoc(current);
        setMapFocus(current);
        showToast('Centered on you.', 'success');
        return;
      }

      // Avoid spam if the user taps repeatedly.
      const now = Date.now();
      if (now - lastLocateFailRef.current > 3500) {
        lastLocateFailRef.current = now;
        showToast('Location unavailable. Enable it in iOS Settings.', 'warning');
      }
      if (now - lastOpenSettingsRef.current > 5000) {
        lastOpenSettingsRef.current = now;
        try {
          await Linking.openSettings();
        } catch {}
      }
      try {
        await setLocationEnabled(false);
      } catch {}
    } finally {
      setLocBusy(false);
    }
  }, [loc, locBusy, router, showToast]);

  function getSpotCoords(spot: any) {
    const coords = spot?.example?.spotLatLng || spot?.example?.location || spot?.location;
    if (!coords?.lat || !coords?.lng) return null;
    return coords;
  }

  function getSpotPlaceId(spot: any) {
    return (
      spot?.example?.spotPlaceId ||
      spot?.example?.placeId ||
      spot?.placeId ||
      spot?.id ||
      ''
    );
  }

  async function refreshSelectedSaved(spot: any) {
    if (!spot) return;
    try {
      const list = await getSavedSpots(200);
      const placeId = getSpotPlaceId(spot);
      const key = placeId ? `place:${placeId}` : `name:${spot.name || ''}`;
      const saved = list.find((s: any) => s.key === key);
      setSelectedSaved(!!saved);
      setSavedNote(saved?.note || '');
    } catch {
      setSelectedSaved(false);
      setSavedNote('');
    }
  }

  function openSpotSheet(spot: any) {
    setSelectedSpot(spot);
    void refreshSelectedSaved(spot);
  }

  function closeSpotSheet() {
    setSelectedSpot(null);
    setSelectedSaved(false);
  }

  const selectedTags = React.useMemo(() => (
    selectedSpot ? buildSpotTags(selectedSpot) : []
  ), [selectedSpot]);

  return (
    <ThemedView style={styles.container}>
      <Atmosphere variant="cool" />
      <FlatList
        data={listData}
        keyExtractor={listKeyExtractor}
        contentContainerStyle={styles.listContent}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={5}
        removeClippedSubviews={true}
        updateCellsBatchingPeriod={100}
        windowSize={7}
        updateCellsBatchingPeriod={40}
        removeClippedSubviews={Platform.OS !== 'web'}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => setRefreshToken((v) => v + 1)} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Label style={{ color: muted, marginBottom: 8 }}>Explore</Label>
            <H1 style={{ color }}>Find your next third place.</H1>
            <Body style={{ color: muted }}>
              See trending spots and live check-ins near you.
            </Body>
            <View style={{ height: 12 }} />
            <TextInput
              placeholder="Search, or ask Perched…"
              placeholderTextColor={muted}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              style={[styles.searchInput, { borderColor: border, backgroundColor: card, color }]}
            />
            {!query.trim() ? (
              <View style={{ marginTop: 10 }}>
                <Text style={{ color: muted, fontSize: 12, fontWeight: '700', marginBottom: 6 }}>Try:</Text>
                <View style={styles.vibeRow}>
                  {ASK_PRESETS.map((preset) => (
                    <Pressable
                      key={preset.label}
                      onPress={() => setQuery(preset.query)}
                      style={({ pressed }) => [
                        styles.vibeChip,
                        { borderColor: border, backgroundColor: pressed ? highlight : badgeFill },
                      ]}
                    >
                      <Text style={{ color: accent, fontWeight: '700' }}>{preset.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
            {activeIntent && intentChips.length ? (
              <View style={styles.intentRow}>
                <View style={[styles.intentBadge, { backgroundColor: badgeFill, borderColor: border }]}>
                  <Text style={{ color: accent, fontSize: 11, fontWeight: '800' }}>AI</Text>
                </View>
                <View style={styles.intentChipRow}>
                  {intentChips.map((chip) => (
                    <View key={`intent-${chip}`} style={[styles.tagChip, { backgroundColor: badgeFill, borderColor: border }]}>
                      <Text style={{ color: accent, fontSize: 11, fontWeight: '600' }}>{chip}</Text>
                    </View>
                  ))}
                </View>
                <Pressable onPress={() => setQuery('')} style={{ marginLeft: 10, paddingVertical: 6 }}>
                  <Text style={{ color: primary, fontSize: 12, fontWeight: '700' }}>Clear</Text>
                </Pressable>
              </View>
            ) : null}
            {status ? (
              <StatusBanner
                message={status.message}
                tone={status.tone}
                actionLabel="Retry"
                onAction={() => setRefreshToken((v) => v + 1)}
              />
            ) : null}
            <View style={[styles.softDivider, { backgroundColor: border }]} />
            {user ? (
              <View style={styles.filterRow}>
                <View>
                  <SegmentedControl
                    value={scope}
                    activeColor={accent}
                    onChange={(next) => {
                      if (next === 'campus' && !campusKey) return;
                      setScope(next as 'everyone' | 'campus' | 'friends');
                    }}
                    options={[
                      { key: 'everyone', label: 'Everyone' },
                      { key: 'campus', label: 'Campus', disabled: !campusKey },
                      { key: 'friends', label: 'Friends' },
                    ]}
                  />
                  <Text style={{ color: muted, fontSize: 11, marginTop: 6 }}>
                    Showing: {scope === 'friends' ? 'Friends only' : scope === 'campus' ? 'Campus only' : 'Everyone'}
                  </Text>
                  {scope === 'friends' && friendIds.length === 0 ? (
                    <Pressable onPress={() => router.push('/(tabs)/profile')} style={{ marginTop: 6 }}>
                      <Text style={{ color: primary, fontSize: 12, fontWeight: '600' }}>No friends yet — add friends in Profile</Text>
                    </Pressable>
                  ) : null}
                  {scope === 'campus' && !campusKey ? (
                    <Text style={{ color: muted, fontSize: 12, marginTop: 4 }}>Add a campus in Profile to enable this feed.</Text>
                  ) : null}
                </View>
              </View>
            ) : null}
            <FilterGroups
              groups={FILTER_GROUPS}
              selectedFilters={selectedFilters}
              onFilterChange={(groupId, values) => {
                setSelectedFilters(prev => ({
                  ...prev,
                  [groupId]: values,
                }));
              }}
            />
            <Text style={{ color: muted, fontSize: 12, marginTop: 8 }}>
              {filteredByOpen.length
                ? `Showing ${filteredByOpen.length} spot${filteredByOpen.length === 1 ? '' : 's'}`
                : 'No spots match these filters.'}
            </Text>
            {previewSpots.length ? (
              <View style={styles.previewRow}>
                {previewSpots.map((s: any) => {
                  const placeId = s?.example?.spotPlaceId || s?.placeId || s?.example?.placeId;
                  const key = spotKey(placeId, s?.name || 'spot');
                  return (
                    <View key={`preview-${key}`} style={[styles.previewChip, { backgroundColor: badgeFill, borderColor: border }]}>
                    <Text numberOfLines={1} style={{ color: accent, fontSize: 12, fontWeight: '700' }}>{s.name}</Text>
                  </View>
                  );
                })}
              </View>
            ) : null}
            {canShowInteractiveMap ? (
              <View style={[styles.mapCard, { backgroundColor: card, borderColor: border }]}>
                {loading ? (
                  <View pointerEvents="none" style={[styles.mapLoading, { backgroundColor: card }]}>
                    <ActivityIndicator color={primary} />
                    <Text style={{ color: muted, marginTop: 6 }}>Loading map pins…</Text>
                  </View>
                ) : null}
                <MapView
                  ref={mapViewRef}
                  provider={hasMapKey ? PROVIDER_GOOGLE : undefined}
                  style={styles.map}
                  initialRegion={{ latitude: mapCenter.lat, longitude: mapCenter.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
                  onRegionChangeComplete={handleRegionChange}
                  showsUserLocation={true}
                  showsMyLocationButton={true}
                  showsCompass={true}
                  rotateEnabled={true}
                  pitchEnabled={true}
                >
                  {loc ? (
                    <Marker
                      key="you"
                      coordinate={{ latitude: loc.lat, longitude: loc.lng }}
                      title="You"
                      pinColor={primary}
                    />
                  ) : null}
                    {markerSpots.map((s) => {
                      const coords = s.example?.spotLatLng || s.example?.location;
                      if (!coords || !coords.lat || !coords.lng) return null;
                      const markerKey = spotKey(s.example?.spotPlaceId || s.placeId, s.name || 'spot');
                      const isFriend = !!(user && friendIdSet.has(s.example?.userId));
                      const displayCoords = !isFriend && s.example?.visibility !== 'friends' && s.example?.visibility !== 'close'
                        ? fuzzLocation(coords, `${s.name}-${s.example?.id || ''}`)
                        : coords;
                      const isTop = topSpots.some((t) => t.name === s.name);
                      return (
                        <Marker
                          key={markerKey}
                          coordinate={{ latitude: displayCoords.lat, longitude: displayCoords.lng }}
                          title={s.name}
                          description={s.seed ? 'Suggested spot' : `${s.count} check-ins`}
                          pinColor={isTop ? accent : primary}
                          onPress={() => {
                            try {
                              const placeId = s.example?.spotPlaceId || '';
                              router.push(`/spot?placeId=${encodeURIComponent(placeId)}&name=${encodeURIComponent(s.name)}`);
                            } catch {
                              // ignore
                            }
                          }}
                        />
                    );
                  })}
                    {liveUnique.map((it: any) => {
                      const coords = it.spotLatLng || it.location;
                      if (!coords?.lat || !coords?.lng) return null;
                      const isFriend = !!(user && friendIdSet.has(it.userId));
                      const displayCoords = !isFriend && it.visibility !== 'friends' && it.visibility !== 'close'
                        ? fuzzLocation(coords, `live-${it.id}`)
                        : coords;
                      return (
                        <Marker
                          key={`live-${it.id}`}
                          coordinate={{ latitude: displayCoords.lat, longitude: displayCoords.lng }}
                          title={it.spotName || it.spot || 'Live now'}
                          description={it.userName || 'Someone'}
                          pinColor={success}
                          onPress={() => {
                            try {
                              const placeId = it.spotPlaceId || '';
                              const name = it.spotName || it.spot || '';
                              router.push(`/spot?placeId=${encodeURIComponent(placeId)}&name=${encodeURIComponent(name)}`);
                            } catch {}
                          }}
                        />
                      );
                    })}
                </MapView>
                {!loading && previewSpots.length ? (
                  <View pointerEvents="none" style={[styles.mapSummary, { backgroundColor: withAlpha(card, 0.92), borderColor: withAlpha(border, 0.9) }]}>
                    <Text style={{ color, fontWeight: '800' }}>
                      {appliedVibe === 'all' ? 'Top right now' : `${formatVibeLabel(appliedVibe)} picks`}
                    </Text>
                    <Text numberOfLines={1} style={{ color: muted, marginTop: 2 }}>
                      {previewSpots.map((s: any) => s.name).join(' · ')}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : mapPreviewUrl ? (
              <View style={[styles.mapCard, { backgroundColor: card, borderColor: border }]}>
                <SpotImage source={{ uri: mapPreviewUrl }} style={styles.mapImage} />
                {!loading && previewSpots.length ? (
                  <View pointerEvents="none" style={[styles.mapSummary, { backgroundColor: withAlpha(card, 0.92), borderColor: withAlpha(border, 0.9) }]}>
                    <Text style={{ color, fontWeight: '800' }}>
                      {appliedVibe === 'all' ? 'Top right now' : `${formatVibeLabel(appliedVibe)} picks`}
                    </Text>
                    <Text numberOfLines={1} style={{ color: muted, marginTop: 2 }}>
                      {previewSpots.map((s: any) => s.name).join(' · ')}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={[styles.mapCard, { backgroundColor: card, borderColor: border, alignItems: 'center', justifyContent: 'center' }]}>
                {loading ? <ActivityIndicator color={primary} /> : null}
                <Text style={{ color: muted, marginTop: loading ? 8 : 0 }}>
                  {hasMapKey ? 'Map unavailable. Check API key restrictions.' : 'Map preview needs a Google Maps API key.'}
                </Text>
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
            {canShowInteractiveMap ? (
              <Text style={{ color: muted, marginTop: 6, fontSize: 12 }}>
                Drag the map to explore — results update as you move.
              </Text>
            ) : null}
            {/* Legend removed to avoid web prefixer crashes */}
            {liveUnique.length ? (
              <View style={{ marginTop: 14, marginBottom: 8 }}>
                <Label style={{ marginBottom: 6, color: muted }}>Live now</Label>
                {liveUnique.map((it: any) => {
                  const remaining = formatTimeRemaining(it);
                  return (
                  <Pressable
                    key={`live-row-${it.id}`}
                    onPress={() => {
                      try {
                        router.push(`/(tabs)/feed?spot=${encodeURIComponent(it.spotName || it.spot || '')}`);
                      } catch {}
                    }}
                    style={({ pressed }) => [
                      styles.liveRow,
                      { borderColor: border, backgroundColor: pressed ? highlight : card },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color, fontWeight: '700' }}>{it.spotName || it.spot || 'Spot'}</Text>
                      <Text style={{ color: muted }}>
                        {it.userName || 'Someone'}{it.userHandle ? ` · @${it.userHandle}` : ''} · {formatTime(it.createdAt)}
                      </Text>
                      {remaining ? <Text style={{ color: muted, marginTop: 2 }}>{remaining}</Text> : null}
                    </View>
                  </Pressable>
                );
                })}
              </View>
            ) : null}
            {isSeeded ? (
              <View style={{ marginTop: 6, marginBottom: 8 }}>
                <Label style={{ marginBottom: 6, color: muted }}>Nearby picks</Label>
              </View>
            ) : null}
            {scope === 'friends' && friendSuggested.length ? (
              <View style={{ marginTop: 6, marginBottom: 8 }}>
                <Label style={{ marginBottom: 6, color: muted }}>Friends picks</Label>
                {friendSuggested.map((s: any, index) => {
                  const friendKey = spotKey(s.example?.spotPlaceId, s.name || 'spot');
                  return (
                  <Pressable
                    key={`friends-${friendKey}`}
                    onPress={() => {
                      try {
                        openSpotSheet(s);
                      } catch {}
                    }}
                    style={({ pressed }) => [
                      styles.liveRow,
                      { borderColor: border, backgroundColor: pressed ? highlight : card },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color, fontWeight: '700' }}>{s.name}</Text>
                      <Text style={{ color: muted }}>
                        {`${s.count} friend check-ins`}{s.friendCount ? ` · ${s.friendCount} friends` : ''}
                      </Text>
                      <View style={styles.tagRow}>
                        <View style={[styles.tagChip, { backgroundColor: badgeFill, borderColor: border }]}>
                          <Text style={{ color: accent, fontSize: 11, fontWeight: '600' }}>Friends nearby</Text>
                        </View>
                        {s.example?.visibility === 'close' ? (
                          <View style={[styles.tagChip, { backgroundColor: badgeFill, borderColor: border }]}>
                            <Text style={{ color: accent, fontSize: 11, fontWeight: '600' }}>Close friends</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                    <View style={[styles.rankBadge, { backgroundColor: badgeFill, borderColor: border }]}>
                      <Text style={{ color: accent, fontSize: 11, fontWeight: '700' }}>{`#${index + 1}`}</Text>
                    </View>
                  </Pressable>
                  );
                })}
              </View>
            ) : null}
            {!isSeeded && hasRealSpots ? (
              <>
                <View style={[styles.softDivider, { backgroundColor: border }]} />
                <View style={styles.sectionHeader}>
                  <Label style={{ marginBottom: 0, color: muted }}>Top spots</Label>
                  {loc ? <Text style={{ color: primary, fontWeight: '600' }}>Near you</Text> : null}
                </View>
              </>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => {
          const key = spotKey(item.example?.spotPlaceId || item.placeId, item.name || 'spot');
          const tags = spotTagsMap.get(key) || [];
          const friendCount = friendSpotCounts.get(key) || 0;
          const subtitle = friendCount
            ? `${friendCount} friend${friendCount === 1 ? '' : 's'} live now`
            : item.seed ? 'Suggested spot' : `${item.count} check-ins`;

          return (
            <SpotListItem
              item={item}
              index={index}
              tags={tags}
              friendCount={friendCount}
              subtitle={subtitle}
              mapKey={mapKey}
              maxSpotCount={maxSpotCount}
              showRanks={showRanks}
              onPress={() => handleSpotPress(item)}
              describeSpot={describeSpot}
              formatDistance={formatDistance}
            />
          );
        }}
        ListEmptyComponent={
          query.trim() ? (
            <View style={{ marginTop: 10 }}>
              <Body style={{ color: muted }}>{activeIntent ? 'No spots match that request.' : 'No spots match that search.'}</Body>
              <Pressable onPress={() => setQuery('')} style={{ marginTop: 8 }}>
                <Text style={{ color: primary, fontWeight: '600' }}>Clear</Text>
              </Pressable>
            </View>
          ) : (
            !loading ? (
              <View style={[styles.emptyState, { borderColor: border, backgroundColor: card }]}>
                <Text style={{ color, fontWeight: '700', marginBottom: 6 }}>No spots yet</Text>
                <Text style={{ color: muted, marginBottom: 10 }}>Be the first to tap in and light up the map.</Text>
                {!seedSpots.length ? (
                  <Text style={{ color: muted, marginBottom: 10 }}>
                    Enable location or add a campus to see featured recommendations.
                  </Text>
                ) : null}
                  <Pressable onPress={() => router.push('/checkin')} style={[styles.emptyCta, { backgroundColor: primary }]}>
                    <View style={styles.ctaRow}>
                      <IconSymbol name="plus" size={18} color="#FFFFFF" />
                      <Text style={{ color: '#FFFFFF', fontWeight: '700', marginLeft: 8 }}>New check-in</Text>
                    </View>
                  </Pressable>
                {!seedSpots.length && user ? (
                  <Pressable onPress={() => router.push('/(tabs)/profile')} style={[styles.emptySecondary, { borderColor: border }]}>
                    <Text style={{ color, fontWeight: '700' }}>Add campus</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null
          )
        }
      />
      <Pressable
        onPress={() => router.push('/checkin')}
        accessibilityLabel="New check-in"
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: pressed ? muted : primary, borderColor: border },
        ]}
      >
        <IconSymbol name="plus" size={24} color="#FFFFFF" />
      </Pressable>
      {selectedSpot ? (
        <Pressable style={styles.sheetBackdrop} onPress={closeSpotSheet}>
          <Pressable
            style={[styles.sheetCard, { backgroundColor: card, borderColor: border }]}
            onPress={(event: any) => event?.stopPropagation?.()}
          >
            <View style={styles.sheetHandle} />
            <Text style={[styles.sheetTitle, { color }]}>{selectedSpot.name}</Text>
            <Text style={{ color: muted, marginTop: 6 }}>
              {selectedSpot.description || describeSpot(selectedSpot.name, selectedSpot.example?.address)}
              {selectedSpot.distance !== undefined ? ` · ${formatDistance(selectedSpot.distance)}` : ''}
            </Text>
            {selectedTags.length ? (
              <View style={styles.tagRow}>
                {selectedTags.map((tag) => (
                  <View key={`${selectedSpot.name}-${tag}`} style={[styles.tagChip, { backgroundColor: badgeFill, borderColor: border }]}>
                    <Text style={{ color: accent, fontSize: 11, fontWeight: '600' }}>{tag}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {selectedSpot.rating ? (
              <Text style={{ color: muted, marginTop: 6 }}>
                {`${selectedSpot.rating.toFixed(1)} ★${selectedSpot.ratingCount ? ` · ${selectedSpot.ratingCount} reviews` : ''}`}
              </Text>
            ) : null}
            {/* Popular Times Chart */}
            <PopularTimes
              popularHours={selectedSpot.popularHours}
              checkinCount={selectedSpot.checkinCount || selectedSpot.count || 0}
              compact
            />
            <View style={styles.sheetActions}>
              <Pressable
                onPress={() => {
                  try {
                    const placeId = getSpotPlaceId(selectedSpot);
                    const name = selectedSpot.name || '';
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
                    const name = selectedSpot.name || 'Spot';
                    const coords = getSpotCoords(selectedSpot);
                    const placeId = getSpotPlaceId(selectedSpot);
                    const url = placeId
                      ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`
                      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords ? `${coords.lat},${coords.lng}` : name)}`;
                    if (!url) return;
                    if (Platform.OS === 'web') {
                      window.open(url, '_blank', 'noopener');
                    } else {
                      Linking.openURL(url);
                    }
                  } catch {}
                }}
                style={[styles.sheetButton, { backgroundColor: highlight, borderColor: border }]}
              >
                <Text style={{ color, fontWeight: '700' }}>Open maps</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  try {
                    await toggleSavedSpot({ placeId: getSpotPlaceId(selectedSpot), name: selectedSpot.name });
                    await refreshSelectedSaved(selectedSpot);
                  } catch {}
                }}
                style={[styles.sheetButton, { backgroundColor: selectedSaved ? primary : card, borderColor: border }]}
              >
                <Text style={{ color: selectedSaved ? '#FFFFFF' : color, fontWeight: '700' }}>
                  {selectedSaved ? 'Saved' : 'Save'}
                </Text>
              </Pressable>
            </View>
            {/* Personal Note Input - shows when saved */}
            {selectedSaved && (
              <View style={[styles.noteContainer, { borderColor: border }]}>
                <Text style={{ color: muted, fontSize: 12, marginBottom: 6 }}>Personal note</Text>
                <TextInput
                  style={[styles.noteInput, { borderColor: border, color, backgroundColor: withAlpha(border, 0.3) }]}
                  placeholder="Add a note (e.g., 'good matcha', 'outlet by window')"
                  placeholderTextColor={muted}
                  value={savedNote}
                  onChangeText={setSavedNote}
                  onBlur={async () => {
                    try {
                      await updateSavedSpotNote(getSpotPlaceId(selectedSpot), selectedSpot.name, savedNote);
                    } catch {}
                  }}
                  multiline
                  numberOfLines={2}
                />
              </View>
            )}
            <Pressable
              onPress={() => {
                try {
                  const placeId = getSpotPlaceId(selectedSpot);
                  router.push(`/spot?placeId=${encodeURIComponent(placeId)}&name=${encodeURIComponent(selectedSpot.name)}`);
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
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  listContent: { paddingHorizontal: 20, paddingBottom: 140 },
  header: { paddingTop: 20, paddingBottom: 16, paddingHorizontal: 20 },
  mapCard: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: 16,
  },
  map: { width: '100%', height: 240 },
  mapImage: { width: '100%', height: 200 },
  mapLoading: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    zIndex: 2,
    alignItems: 'center',
  },
  mapSummary: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  previewRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 },
  previewChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12, borderWidth: 1, marginRight: 8, marginBottom: 8, maxWidth: '100%' },
  legendRow: { flexDirection: 'row', marginTop: 10, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: 12, marginBottom: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 999 },
  mapOverlayRow: { flexDirection: 'row', marginTop: 10, flexWrap: 'wrap' },
  mapOverlayChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, marginRight: 10, marginBottom: 10 },
  mapOverlayContent: { flexDirection: 'row', alignItems: 'center' },
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
  sheetTitle: { fontSize: 20, fontWeight: '700' },
  sheetActions: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 14 },
  sheetButton: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, marginRight: 10, marginBottom: 10 },
  noteContainer: { marginTop: 12, marginBottom: 8 },
  noteInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, minHeight: 50 },
  sheetLink: { marginTop: 12, borderWidth: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  sectionHeader: {
    marginTop: 18,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  filterRow: { marginTop: 12, alignItems: 'center', justifyContent: 'center' },
  vibeRow: { flexDirection: 'row', marginTop: 10, flexWrap: 'wrap' },
  vibeChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, marginRight: 8, marginBottom: 8 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  tagChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1, marginRight: 6, marginBottom: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 18,
    padding: 10,
  },
  thumb: { width: 140, height: 90, borderRadius: 12 },
  rankBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'center',
    marginRight: 6,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
  },
  intentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 10,
  },
  intentBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  intentChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
    marginLeft: 8,
  },
  countBar: { height: 6, borderRadius: 999, marginTop: 6, overflow: 'hidden' },
  countFill: { height: '100%', borderRadius: 999 },
  emptyState: {
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'flex-start',
  },
  emptyCta: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
  },
  ctaRow: { flexDirection: 'row', alignItems: 'center' },
  emptySecondary: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 10,
  },
  softDivider: {
    height: 1,
    marginTop: 16,
    marginBottom: 6,
    opacity: 0.35,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 90,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 6,
  },
});
