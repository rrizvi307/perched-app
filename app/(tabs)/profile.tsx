import ProfilePicture from '@/components/profile-picture';
import PermissionSheet from '@/components/ui/permission-sheet';
import { ThemedView } from '@/components/themed-view';
import { Atmosphere } from '@/components/ui/atmosphere';
import CelebrationOverlay from '@/components/ui/CelebrationOverlay';
import SpotImage from '@/components/ui/spot-image';
import { Body, H2, Label } from '@/components/ui/typography';
import { StreakBadge } from '@/components/ui/streak-badge';
import { PolishedCard } from '@/components/ui/polished-card';
import MetricsImpactCard from '@/components/ui/metrics-impact-card';
import { PolishedLargeHeader } from '@/components/ui/polished-header';
import { PremiumButton } from '@/components/ui/premium-button';
import { PremiumBadge } from '@/components/ui/premium-badge';
import { usePremium } from '@/hooks/use-premium';
import { getLocationOptions } from '@/constants/locations';
import { reverseGeocodeCity, searchLocations } from '@/services/googleMaps';
import { getForegroundLocationIfPermitted } from '@/services/location';
import StatusBanner from '@/components/ui/status-banner';
import { useToast } from '@/contexts/ToastContext';
import { useAuth } from '@/contexts/AuthContext';
import { isPremiumPurchasesEnabled } from '@/services/premium';
import { useThemePreference } from '@/contexts/ThemePreferenceContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { withAlpha } from '@/utils/colors';
import { gapStyle } from '@/utils/layout';
import { devLog } from '@/services/logger';
import { isDemoMode } from '@/services/demoMode';
import { subscribeCheckinEvents } from '@/services/feedEvents';
import { acceptFriendRequest, declineFriendRequest, findUserByEmail, findUserByHandle, findUserByPhone, getCheckinsForUserRemote, getCheckinsRemote, getCloseFriends, getIncomingFriendRequests, getOutgoingFriendRequests, getUserFriends, getUserFriendsCached, getUsersByCampus, getUsersByIds, getUsersByIdsCached, isFirebaseConfigured, sendFriendRequest, setCloseFriendRemote, unfollowUserRemote, updateUserRemote } from '@/services/firebaseClient';
import { logEvent } from '@/services/logEvent';
import { getUserStats } from '@/services/gamification';
import { getCheckins, getPermissionPrimerSeen, getSavedSpots, setPermissionPrimerSeen, subscribeSavedSpots } from '@/storage/local';
import { isCheckinExpired, toMillis } from '@/services/checkinUtils';
import { isPhoneLike, normalizePhone } from '@/utils/phone';
import { openExternalLink } from '@/services/externalLinks';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Platform, Pressable, RefreshControl, SectionList, Share, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import * as Haptics from 'expo-haptics';
import FontAwesome5 from '@expo/vector-icons/FontAwesome5';

type CheckinRow = { key: string; items: any[] };

function createdAtMs(checkin: any) {
  return toMillis(checkin?.createdAt) || 0;
}

function toRows(items: any[], columns = 2): CheckinRow[] {
  const rows: CheckinRow[] = [];
  for (let i = 0; i < items.length; i += columns) {
    const slice = items.slice(i, i + columns);
    const key = slice.map((c: any) => String(c?.id || '')).filter(Boolean).join('|') || `row-${i}`;
    rows.push({ key, items: slice });
  }
  return rows;
}

export default function ProfileScreen() {
  const { user, updateProfile } = useAuth();
  const { preference } = useThemePreference();
  const { isPremium } = usePremium();
  const premiumPurchasesEnabled = isPremiumPurchasesEnabled();
  const systemScheme = useColorScheme();
  const textColor = useThemeColor({}, 'text');
  const borderColor = useThemeColor({}, 'border');
  const cardBg = useThemeColor({}, 'card');
  const primary = useThemeColor({}, 'primary');
  const success = useThemeColor({}, 'success');
  const danger = useThemeColor({}, 'danger');
  const muted = useThemeColor({}, 'muted');
  const highlight = withAlpha(primary, 0.1);
  const separator = withAlpha(textColor, 0.08);
  const [checkins, setCheckins] = useState<any[]>([]);
  const router = useRouter();
  const [friendIds, setFriendIds] = useState<string[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  const [closeFriendIds, setCloseFriendIds] = useState<string[]>([]);
  const [recentByUser, setRecentByUser] = useState<Record<string, number>>({});
  const [activeSuggestions, setActiveSuggestions] = useState<any[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<any[]>([]);
  const [requestUsers, setRequestUsers] = useState<Record<string, any>>({});
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResult, setSearchResult] = useState<any | null>(null);
  const [searching, setSearching] = useState(false);
  const [suggestedFriends, setSuggestedFriends] = useState<any[]>([]);
  const [cityDraft, setCityDraft] = useState(user?.city || '');
  const [campusDraft, setCampusDraft] = useState(user?.campus || '');
  const [cityQuery, setCityQuery] = useState('');
  const [cityTouched, setCityTouched] = useState(false);
  const [cityResults, setCityResults] = useState<string[]>([]);
  const [cityLoading, setCityLoading] = useState(false);
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const [campusQuery, setCampusQuery] = useState('');
  const [campusTouched, setCampusTouched] = useState(false);
  const [campusResults, setCampusResults] = useState<string[]>([]);
  const [campusLoading, setCampusLoading] = useState(false);
  const [campusDropdownOpen, setCampusDropdownOpen] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState(user?.phone || '');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(user?.name || '');
  const [savingName, setSavingName] = useState(false);
  const [detectingCity, setDetectingCity] = useState(false);
  const [geoBias, setGeoBias] = useState<{ lat: number; lng: number } | null>(null);
  const [editingHandle, setEditingHandle] = useState(false);
  const [handleDraft, setHandleDraft] = useState(user?.handle || '');
  const [contactMatches, setContactMatches] = useState<any[]>([]);
  const [contactError, setContactError] = useState<string | null>(null);
  const [savedSpots, setSavedSpots] = useState<any[]>([]);
  const [showContactsPrimer, setShowContactsPrimer] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState<{ message: string; tone: 'info' | 'warning' | 'error' | 'success' } | null>(null);
  const { showToast } = useToast();
  const wasOfflineRef = useRef(false);
  const [userStats, setUserStats] = useState<{ streakDays: number; totalCheckins: number; uniqueSpots: number } | null>(null);
  const [showStreakCelebration, setShowStreakCelebration] = useState(false);
  const prevStreakRef = useRef(0);
  const fbAvailable = isFirebaseConfigured();
  const storyMode = preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;
  const profileCompletion = useMemo(() => {
    if (!user) return { pct: 0, missing: ['Name', 'Handle', 'City'] };
    const missing: string[] = [];
    if (!user.name) missing.push('Name');
    if (!user.handle) missing.push('Handle');
    if (!user.city) missing.push('City');
    const total = 3;
    const pct = Math.round(((total - missing.length) / total) * 100);
    return { pct, missing };
  }, [user]);
  const requestUserMap = useMemo(() => ({ ...requestUsers }), [requestUsers]);
  const historySections = useMemo(() => {
    const sorted = (checkins || []).slice().sort((a: any, b: any) => createdAtMs(b) - createdAtMs(a));
    const now = Date.now();
    const live = sorted.filter((c: any) => !isCheckinExpired(c, now));
    const expired = sorted.filter((c: any) => isCheckinExpired(c, now));
    return [
      { key: 'live', title: 'Live', data: toRows(live, 2) },
      { key: 'expired', title: 'Expired', data: toRows(expired, 2) },
    ].filter((s) => s.data.length);
  }, [checkins]);

  const loadCheckins = useCallback(async () => {
    setRefreshing(true);
    try {
      const remoteRes = await getCheckinsForUserRemote(user?.id || '', 180);
      const remote = Array.isArray(remoteRes) ? remoteRes : (remoteRes && (remoteRes.items ?? [])) as any[];
      const mineRemote = remote.filter((c: any) => c.userId === user?.id);
      const local = await getCheckins();
      const mineLocal = local.filter((c: any) => c.userId === user?.id);
      const keyOf = (c: any) => c.clientId || c.id;
      const remoteKeys = new Set(mineRemote.map(keyOf));
      const merged = [...mineRemote, ...mineLocal.filter((c: any) => !remoteKeys.has(keyOf(c)))];
      // Keep full history in Profile; Feed/Explore handle "live now" filtering separately.
      setCheckins(merged);
      setStatus(null);
      if (wasOfflineRef.current) {
        showToast('Back online. Profile updated.', 'success');
        wasOfflineRef.current = false;
      }
    } catch {
      if (isDemoMode()) {
        setCheckins([]);
        setStatus({ message: 'Demo mode uses cloud data only. Connect to refresh.', tone: 'warning' });
        wasOfflineRef.current = true;
        return;
      }
      const local = await getCheckins();
      const mine = local.filter((c: any) => c.id?.startsWith(user?.id || 'local-') || c.userId === user?.id);
      setCheckins(mine);
      setStatus({ message: 'Offline right now. Showing saved check-ins.', tone: 'warning' });
      wasOfflineRef.current = true;
    } finally {
      setRefreshing(false);
    }
  }, [showToast, user]);

  useEffect(() => {
    (async () => {
      try {
        await loadCheckins();
      } catch {
        const local = await getCheckins();
        const mine = local.filter((c: any) => c.id?.startsWith(user?.id || 'local-') || c.userId === user?.id);
        setCheckins(mine);
      }
      await logEvent('profile_viewed', user?.id);
      try {
        const saved = await getSavedSpots(10);
        setSavedSpots(saved);
      } catch {}

      // Load user stats for gamification
      try {
        const stats = await getUserStats();
        setUserStats(stats);
      } catch (error) {
        console.error('Failed to load user stats:', error);
      }
    })();
  }, [loadCheckins, user]);

  useEffect(() => {
    const unsub = subscribeCheckinEvents((it: any) => {
      const incomingClientId = it?.clientId;
      const incomingId = it?.id;
      if (!incomingClientId && !incomingId) return;

      setCheckins((prev) => {
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

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const saved = await getSavedSpots(10);
          if (active) setSavedSpots(saved);
        } catch {}
      })();
      return () => {
        active = false;
      };
    }, [])
  );

  useEffect(() => {
    const unsubscribe = subscribeSavedSpots((spots) => {
      setSavedSpots(Array.isArray(spots) ? spots.slice(0, 10) : []);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const milestones = [7, 14, 30, 50, 100];
    const current = userStats?.streakDays || 0;
    if (current > prevStreakRef.current && milestones.includes(current)) {
      setShowStreakCelebration(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setShowStreakCelebration(false), 2500);
    }
    prevStreakRef.current = current;
  }, [userStats?.streakDays]);

  useEffect(() => {
    if (user?.handle) setHandleDraft(user.handle);
  }, [user?.handle]);

  useEffect(() => {
    if (user?.name) setNameDraft(user.name);
  }, [user?.name]);

  useEffect(() => {
    if (user?.city) setCityDraft(user.city);
  }, [user?.city]);

  useEffect(() => {
    if (user?.campus) setCampusDraft(user.campus);
  }, [user?.campus]);

  useEffect(() => {
    if (user?.phone) setPhoneDraft(user.phone);
  }, [user?.phone]);

  useEffect(() => {
    if (cityDraft && !cityTouched) setCityQuery(cityDraft);
  }, [cityDraft, cityTouched]);

  useEffect(() => {
    if (campusDraft && !campusTouched) setCampusQuery(campusDraft);
  }, [campusDraft, campusTouched]);

  useEffect(() => {
    (async () => {
      const pos = await getForegroundLocationIfPermitted();
      if (pos) setGeoBias(pos);
    })().catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!geoBias || cityTouched || cityDraft) return;
    setDetectingCity(true);
    (async () => {
      const detected = await reverseGeocodeCity(geoBias.lat, geoBias.lng);
      if (cancelled || !detected || cityTouched || cityDraft) return;
      setCityDraft(detected);
      setCityQuery(detected);
    })()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setDetectingCity(false);
      });
    return () => {
      cancelled = true;
    };
  }, [geoBias, cityTouched, cityDraft]);

  useEffect(() => {
    let alive = true;
    if (!cityQuery.trim()) {
      setCityResults([]);
      setCityLoading(false);
      return;
    }
    const timer = setTimeout(async () => {
      setCityLoading(true);
      try {
        const remote = await searchLocations(cityQuery, 'city', 8, geoBias || undefined);
        const names = remote.map((r) => r.name);
        const fallback = getLocationOptions('city', cityQuery).slice(0, 8);
        if (alive) setCityResults(names.length ? names : fallback);
      } catch {
        if (alive) setCityResults(getLocationOptions('city', cityQuery).slice(0, 8));
      } finally {
        if (alive) setCityLoading(false);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [cityQuery, geoBias]);

  useEffect(() => {
    let alive = true;
    if (!campusQuery.trim()) {
      setCampusResults([]);
      setCampusLoading(false);
      return;
    }
    const timer = setTimeout(async () => {
      setCampusLoading(true);
      try {
        const remote = await searchLocations(campusQuery, 'campus', 8, geoBias || undefined);
        const names = remote.map((r) => r.name);
        const fallback = getLocationOptions('campus', campusQuery).slice(0, 8);
        if (alive) setCampusResults(names.length ? names : fallback);
      } catch {
        if (alive) setCampusResults(getLocationOptions('campus', campusQuery).slice(0, 8));
      } finally {
        if (alive) setCampusLoading(false);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [campusQuery, geoBias]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const ids = await getUserFriends(user.id);
        setFriendIds(ids || []);
        const friendProfiles = await getUsersByIds(ids || []);
        setFriends(friendProfiles || []);
        const closeIds = await getCloseFriends(user.id);
        setCloseFriendIds(closeIds || []);
        const incoming = await getIncomingFriendRequests(user.id);
        const outgoing = await getOutgoingFriendRequests(user.id);
        setIncomingRequests(incoming || []);
        setOutgoingRequests(outgoing || []);
        const requestIds = Array.from(new Set([...(incoming || []).map((r: any) => r.fromId), ...(outgoing || []).map((r: any) => r.toId)]));
        const requestProfiles = await getUsersByIds(requestIds);
        const map: Record<string, any> = {};
        requestProfiles.forEach((u: any) => { map[u.id] = u; });
        setRequestUsers(map);
        if (user.campus) {
          const campusUsers = await getUsersByCampus(user.campus, 20);
          const suggestions = campusUsers.filter((u: any) => u.id !== user.id && !ids.includes(u.id));
          setSuggestedFriends(suggestions.slice(0, 6));
        }

        // active check-ins today for discovery
        try {
          const recentRes = await getCheckinsRemote(80);
          const items = (recentRes.items || []) as any[];
          const now = Date.now();
          const TWELVE_HOURS = 12 * 60 * 60 * 1000;
          const counts: Record<string, number> = {};
          items.forEach((it: any) => {
            if (!it.userId || it.userId === user.id) return;
            const created = it.createdAt;
            let ts = 0;
            if (created?.seconds) ts = created.seconds * 1000;
            else if (created) ts = new Date(created).getTime();
            if (!ts || now - ts > TWELVE_HOURS) return;
            counts[it.userId] = (counts[it.userId] || 0) + 1;
          });
          setRecentByUser(counts);
          const activeIds = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([id]) => id)
            .filter((id) => !ids.includes(id))
            .slice(0, 8);
          if (activeIds.length) {
            const profiles = await getUsersByIds(activeIds);
            setActiveSuggestions(profiles || []);
          } else {
            setActiveSuggestions([]);
          }
        } catch {
          setActiveSuggestions([]);
          setRecentByUser({});
        }
      } catch (e) {
        devLog('friend load failed', e);
      }
    })();
  }, [user]);

  const topSpots = (() => {
    const counts: Record<string, { name: string; count: number }> = {};
    checkins.forEach((c) => {
      const key = c.spotPlaceId ? `place:${c.spotPlaceId}` : `name:${c.spotName || c.spot || 'Unknown'}`;
      const name = c.spotName || c.spot || 'Unknown';
      if (!counts[key]) counts[key] = { name, count: 0 };
      counts[key].count += 1;
      if (name && !counts[key].name) counts[key].name = name;
    });
    return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 6);
  })();

  const streak = useMemo(() => {
    const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    const days = new Set<string>();
    checkins.forEach((c) => {
      if (!c.createdAt) return;
      const dt = new Date(c.createdAt);
      if (!Number.isNaN(dt.getTime())) days.add(dayKey(dt));
    });
    const today = new Date();
    let count = 0;
    for (let i = 0; i < 365; i += 1) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = dayKey(d);
      if (days.has(key)) {
        count += 1;
      } else {
        break;
      }
    }
    return count;
  }, [checkins]);

  const weekCount = useMemo(() => {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    return checkins.filter((c) => {
      const t = c.createdAt ? new Date(c.createdAt).getTime() : 0;
      return t >= weekAgo;
    }).length;
  }, [checkins]);

  const [savingHandle, setSavingHandle] = useState(false);
  const [handleAvailability, setHandleAvailability] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [nameSavedAt, setNameSavedAt] = useState<number | null>(null);
  const nameSaveDisabled = useMemo(() => {
    if (!user) return true;
    const nextName = nameDraft?.trim() || '';
    const nextCity = cityDraft?.trim() || '';
    const nextCampus = campusDraft?.trim() || '';
    const nextPhoneRaw = phoneDraft?.trim() || '';
    const nextPhone = normalizePhone(nextPhoneRaw) || nextPhoneRaw;
    const prevName = user.name || '';
    const prevCity = user.city || '';
    const prevCampus = user.campus || '';
    const prevPhone = normalizePhone(user.phone || '') || (user.phone || '');
    const phoneChanged = nextPhone !== prevPhone;
    return savingName || (!phoneChanged && nextName === prevName && nextCity === prevCity && nextCampus === prevCampus);
  }, [user, nameDraft, cityDraft, campusDraft, phoneDraft, savingName]);
  const handleSaveDisabled = useMemo(() => {
    if (!user) return true;
    const normalized = handleDraft.trim().replace(/^@/, '').toLowerCase();
    const prev = (user.handle || '').toLowerCase();
    return savingHandle || normalized === prev || !normalized;
  }, [user, handleDraft, savingHandle]);

  useEffect(() => {
    let cancelled = false;
    const normalized = handleDraft.trim().replace(/^@/, '').toLowerCase();
    if (!normalized) {
      setHandleAvailability('idle');
      return () => { cancelled = true; };
    }
    if (!/^[a-z0-9_.]{3,20}$/.test(normalized)) {
      setHandleAvailability('invalid');
      return () => { cancelled = true; };
    }
    if (normalized === (user?.handle || '').toLowerCase()) {
      setHandleAvailability('available');
      return () => { cancelled = true; };
    }
    setHandleAvailability('checking');
    const id = setTimeout(async () => {
      try {
        const existing = await findUserByHandle(normalized);
        if (cancelled) return;
        if (existing && existing.id !== user?.id) {
          setHandleAvailability('taken');
        } else {
          setHandleAvailability('available');
        }
      } catch {
        if (!cancelled) setHandleAvailability('idle');
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [handleDraft, user?.handle, user?.id]);

  useEffect(() => {
    if (!nameSavedAt) return;
    const timeout = setTimeout(() => setNameSavedAt(null), 2000);
    return () => clearTimeout(timeout);
  }, [nameSavedAt]);

  async function saveNameAndCampus() {
    if (!user) return;
    if (savingName) return;
    const normalizedPhone = phoneDraft?.trim() ? normalizePhone(phoneDraft.trim()) : null;
    if (phoneDraft?.trim() && !normalizedPhone) {
      alert('Please enter a valid phone number (include area code).');
      return;
    }
    setSavingName(true);
    try {
      const campusType = campusDraft ? 'campus' : 'city';
      const campusOrCity = campusDraft ? campusDraft.trim() : (cityDraft?.trim() || null);
      const payload = {
        name: nameDraft?.trim() || null,
        city: cityDraft?.trim() || null,
        campus: campusDraft?.trim() || null,
        campusOrCity,
        campusType,
        phone: normalizedPhone || null,
      };
      if (updateProfile) {
        await updateProfile(payload as any);
      } else {
        await updateUserRemote(user.id, payload);
      }
      await logEvent('profile_updated', user.id);
      setEditingName(false);
      showToast('Profile updated.', 'success');
      setNameSavedAt(Date.now());
      setCityTouched(false);
      setCityResults([]);
      setCityQuery(cityDraft || '');
      setCampusTouched(false);
      setCampusResults([]);
      setCampusQuery(campusDraft || '');
    } catch (e) {
      devLog('profile save failed', e);
      alert('Unable to save profile');
    } finally {
      setSavingName(false);
    }
  }

  async function saveHandle() {
    if (!user) return;
    if (savingHandle) return;
    setSavingHandle(true);
    try {
      const normalized = handleDraft.trim().replace(/^@/, '').toLowerCase();
      if (!normalized) {
        alert('Please enter a handle.');
        return;
      }
      if (!/^[a-z0-9_.]{3,20}$/.test(normalized)) {
        alert('Handles must be 3–20 characters and use letters, numbers, underscores, or periods.');
        return;
      }
      if (normalized !== user.handle) {
        const existing = await findUserByHandle(normalized);
        if (existing && existing.id !== user.id) {
          alert('That handle is taken.');
          return;
        }
      }
      const payload = { handle: normalized };
      if (updateProfile) {
        await updateProfile(payload as any);
      } else {
        await updateUserRemote(user.id, payload);
      }
      await logEvent('profile_updated', user.id);
      setEditingHandle(false);
      showToast('Handle saved.', 'success');
    } catch (e) {
      devLog('profile handle save failed', e);
      alert('Unable to save handle');
    } finally {
      setSavingHandle(false);
    }
  }

  async function refreshFriends() {
    if (!user) return;
    const [
      ids,
      closeIds,
      incoming,
      outgoing,
    ] = await Promise.all([
      getUserFriendsCached(user.id),
      getCloseFriends(user.id),
      getIncomingFriendRequests(user.id),
      getOutgoingFriendRequests(user.id),
    ]);
    setFriendIds(ids || []);
    setCloseFriendIds(closeIds || []);
    setIncomingRequests(incoming || []);
    setOutgoingRequests(outgoing || []);

    const [friendProfiles, requestProfiles] = await Promise.all([
      getUsersByIdsCached(ids || []),
      getUsersByIdsCached(Array.from(new Set([...(incoming || []).map((r: any) => r.fromId), ...(outgoing || []).map((r: any) => r.toId)]))),
    ]);
    setFriends(friendProfiles || []);
    const map: Record<string, any> = {};
    (requestProfiles || []).forEach((u: any) => { map[u.id] = u; });
    setRequestUsers(map);

    if (user.campus) {
      const campusUsers = await getUsersByCampus(user.campus, 20);
      const suggestions = campusUsers.filter((u: any) => u.id !== user.id && !ids.includes(u.id));
      setSuggestedFriends(suggestions.slice(0, 6));
    }
  }

  async function handleSearch() {
    if (!searchEmail.trim()) return;
    setSearching(true);
    try {
      const trimmed = searchEmail.trim();
      const res = trimmed.startsWith('@')
        ? await findUserByHandle(trimmed)
        : isPhoneLike(trimmed)
          ? await findUserByPhone(trimmed)
          : await findUserByEmail(trimmed);
      setSearchResult(res);
    } catch {
      setSearchResult(null);
    } finally {
      setSearching(false);
    }
  }

  async function sendRequest(targetId: string) {
    if (!user) return;
    try {
      await sendFriendRequest(user.id, targetId);
      await refreshFriends();
      showToast('Friend request sent.', 'success');
    } catch (error: any) {
      const message = String(error?.message || '').toLowerCase();
      if (message.includes('friend graph permissions')) {
        setContactError('Friend sync is temporarily unavailable. Please re-open the app and try again.');
      } else {
        setContactError('Unable to send friend request right now.');
      }
    }
  }

  async function acceptRequest(request: any) {
    if (!user) return;
    try {
      await acceptFriendRequest(request.id, request.fromId, request.toId);
      await refreshFriends();
      showToast('Friend request accepted.', 'success');
    } catch {
      setContactError('Unable to accept this request right now.');
    }
  }

  async function declineRequest(request: any) {
    try {
      await declineFriendRequest(request.id);
      await refreshFriends();
    } catch {
      setContactError('Unable to decline this request right now.');
    }
  }

  async function removeFriend(targetId: string) {
    if (!user) return;
    try {
      await unfollowUserRemote(user.id, targetId);
      await refreshFriends();
    } catch {
      setContactError('Unable to remove friend right now.');
    }
  }


  async function loadContacts() {
    setContactError(null);
    const startedAt = Date.now();
    try {
      const seen = await getPermissionPrimerSeen('contacts');
      if (!seen) {
        setShowContactsPrimer(true);
        return;
      }
      const req: any = eval('require');
      const Contacts = req('expo-contacts');
      if (!Contacts?.requestPermissionsAsync) {
        setContactError('Contacts unavailable on this build.');
        devLog('contacts_sync_unavailable', { platform: Platform.OS });
        return;
      }
      const currentPerm = Contacts.getPermissionsAsync ? await Contacts.getPermissionsAsync().catch(() => null) : null;
      const { status, canAskAgain } = await Contacts.requestPermissionsAsync();
      devLog('contacts_sync_permission', {
        platform: Platform.OS,
        initialStatus: currentPerm?.status || null,
        status,
        canAskAgain: canAskAgain ?? null,
      });
      if (status !== 'granted') {
        setContactError(canAskAgain === false ? 'Contacts permission denied. Enable it from Settings.' : 'Contacts permission denied.');
        return;
      }
      const fields = [Contacts.Fields.Emails];
      if (Contacts.Fields.PhoneNumbers) fields.push(Contacts.Fields.PhoneNumbers);
      const fetchStartedAt = Date.now();
      const { data } = await Contacts.getContactsAsync({ fields });
      const emails = (data || [])
        .flatMap((c: any) => (c.emails || []).map((e: any) => e.email))
        .filter((value: any): value is string => typeof value === 'string' && value.includes('@'));
      const phoneNumbers = (data || [])
        .flatMap((c: any) => (c.phoneNumbers || []).map((p: any) => p.number))
        .map((num: any) => (typeof num === 'string' ? normalizePhone(num) : null))
        .filter((value: any): value is string => typeof value === 'string' && value.length > 6);
      const uniqueEmails = Array.from(new Set<string>(emails)).slice(0, 25);
      const uniquePhones = Array.from(new Set<string>(phoneNumbers)).slice(0, 25);
      const matchesMap = new Map<string, any>();
      const [emailMatches, phoneMatches] = await Promise.all([
        Promise.all(uniqueEmails.map((email) => findUserByEmail(email))),
        Promise.all(uniquePhones.map((phone) => findUserByPhone(phone))),
      ]);
      [...emailMatches, ...phoneMatches].forEach((match) => {
        if (match && !matchesMap.has(match.id)) matchesMap.set(match.id, match);
      });
      setContactMatches(Array.from(matchesMap.values()).slice(0, 8));
      devLog('contacts_sync_complete', {
        platform: Platform.OS,
        totalContacts: Array.isArray(data) ? data.length : 0,
        uniqueEmails: uniqueEmails.length,
        uniquePhones: uniquePhones.length,
        matches: matchesMap.size,
        fetchDurationMs: Date.now() - fetchStartedAt,
        totalDurationMs: Date.now() - startedAt,
      });
      if (!matchesMap.size) {
        setContactError('No matches found in contacts yet.');
      }
    } catch {
      devLog('contacts_sync_failed', {
        platform: Platform.OS,
        totalDurationMs: Date.now() - startedAt,
      });
      setContactError('Unable to load contacts right now. Try again in a moment.');
    }
  }

  async function inviteFriends() {
    try {
      const message = user?.handle
        ? `Join me on Perched — @${user.handle}\nDownload: https://perched.app`
        : 'Join me on Perched.\nDownload: https://perched.app';
      await Share.share({ message });
      await logEvent('invite_shared', user?.id);
    } catch {}
  }

  return (
    <ThemedView style={styles.container}>
      {Platform.OS !== 'web' ? (
        <>
          <PermissionSheet
            visible={showContactsPrimer}
            title="Contacts access"
            body="Contacts help you find friends who already use Perched."
            bullets={['We only scan for matching emails + numbers', 'You can invite friends directly']}
            confirmLabel="Enable contacts"
            onConfirm={async () => {
              setShowContactsPrimer(false);
              await setPermissionPrimerSeen('contacts', true);
              await loadContacts();
            }}
            onCancel={() => setShowContactsPrimer(false)}
          />
        </>
      ) : null}
      <Atmosphere variant="warm" />
      <SectionList
        sections={historySections as any}
        keyExtractor={(row: CheckinRow) => row.key}
        contentContainerStyle={styles.listContent}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              await loadCheckins();
              await refreshFriends();
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <PolishedLargeHeader
              title={user?.name || 'Profile'}
              subtitle={user?.handle ? `@${user.handle}` : 'Add a username'}
            />
            {status ? (
              <StatusBanner
                message={status.message}
                tone={status.tone}
                actionLabel="Retry"
                onAction={async () => {
                  await loadCheckins();
                  await refreshFriends();
                }}
              />
            ) : null}
            <View style={{ height: 12 }} />
            <PolishedCard variant="elevated" animated style={styles.profileCard}>
            <View style={[{ flexDirection: 'row', alignItems: 'center' }, gapStyle(12)]}>
              <ProfilePicture size={84} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Body style={{ color: textColor }}>
                    {user ? `${user.name || 'Your profile'}` : 'Not signed in'}
                  </Body>
                  {isPremium && <PremiumBadge size="small" />}
                </View>
                <Text style={{ color: muted, fontSize: 13 }}>
                  {user?.handle ? `@${user.handle}` : 'Add a username'}
                </Text>
                <Text style={{ color: muted, fontSize: 12 }}>{user?.email || 'Tap below to upgrade'}</Text>
              </View>
              {userStats && userStats.streakDays > 0 && (
                <StreakBadge days={userStats.streakDays} size="medium" />
              )}
            </View>
            {userStats && (
              <>
                <View style={{ marginTop: 16, flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12, backgroundColor: withAlpha(primary, 0.05), borderRadius: 12 }}>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ color: textColor, fontSize: 20, fontWeight: '700' }}>{userStats.totalCheckins}</Text>
                    <Text style={{ color: muted, fontSize: 12 }}>Check-ins</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ color: textColor, fontSize: 20, fontWeight: '700' }}>{userStats.uniqueSpots}</Text>
                    <Text style={{ color: muted, fontSize: 12 }}>Spots</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ color: primary, fontSize: 20, fontWeight: '700' }}>🔥 {userStats.streakDays}</Text>
                    <Text style={{ color: muted, fontSize: 12 }}>Day Streak</Text>
                  </View>
                </View>
                <PremiumButton
                  onPress={() => router.push('/achievements' as any)}
                  variant="secondary"
                  size="medium"
                  icon="trophy.fill"
                  fullWidth
                  style={{ marginTop: 12 }}
                >
                  View Achievements
                </PremiumButton>
                {premiumPurchasesEnabled || isPremium ? (
                  <PremiumButton
                    onPress={() => router.push('/subscription' as any)}
                    variant={isPremium ? 'ghost' : 'primary'}
                    size="medium"
                    icon={isPremium ? 'sparkles' : 'star.fill'}
                    fullWidth
                    style={{ marginTop: 8 }}
                  >
                    {isPremium ? 'Manage Premium' : 'Upgrade to Premium'}
                  </PremiumButton>
                ) : null}
              </>
            )}
            <MetricsImpactCard />
            {fbAvailable && user?.email && !user.emailVerified ? (
              <Pressable
                onPress={() => router.push('/verify')}
                style={[styles.banner, { borderColor, backgroundColor: withAlpha(danger, 0.12) }]}
              >
                <Text style={{ color: danger, fontWeight: '600' }}>Email not verified — tap to resend</Text>
              </Pressable>
            ) : null}
              <View style={{ height: 12 }} />
              <View style={[styles.progressTrack, { backgroundColor: borderColor }]}>
                <View style={[styles.progressFill, { backgroundColor: primary, width: `${profileCompletion.pct}%` }]} />
              </View>
              <Text style={{ color: muted, marginTop: 6 }}>
                Profile {profileCompletion.pct}% complete
                {profileCompletion.missing.length ? ` · Missing: ${profileCompletion.missing.join(', ')}` : ''}
              </Text>
              <View style={{ height: 12 }} />
              {user ? (
                editingName ? (
                  <View>
                    <Label style={{ color: muted, marginBottom: 6 }}>Name</Label>
                    <TextInput
                      placeholder="Your name"
                      placeholderTextColor={muted}
                      value={nameDraft}
                      onChangeText={setNameDraft}
                      maxLength={40}
                      style={[styles.input, { borderColor, backgroundColor: cardBg, color: textColor }]}
                    />
                    <View style={{ height: 8 }} />
                    <Label style={{ color: muted, marginBottom: 6 }}>City</Label>
                    <TextInput
                      placeholder="Search cities"
                      placeholderTextColor={muted}
                      value={cityQuery}
                      onChangeText={(text) => {
                        setCityTouched(true);
                        setCityQuery(text);
                        setCityDropdownOpen(true);
                      }}
                      onFocus={() => { if (cityQuery.trim()) setCityDropdownOpen(true); }}
                      style={[styles.input, { borderColor, backgroundColor: cardBg, color: textColor }]}
                    />
                    {detectingCity && !cityDraft ? <Text style={{ color: muted, marginBottom: 8 }}>Detecting your city...</Text> : null}
                    {cityLoading ? <Text style={{ color: muted, marginBottom: 8 }}>Searching...</Text> : null}
                    {cityDropdownOpen && cityQuery.trim().length ? (
                      <View style={[styles.suggestionList, { borderColor, backgroundColor: cardBg }]}>
                        {(cityResults.length ? cityResults : getLocationOptions('city', cityQuery).slice(0, 8)).map((option) => (
                          <Pressable
                            key={option}
                            onPress={() => {
                              setCityDraft(option);
                              setCityQuery(option);
                              setCityTouched(true);
                              setCityDropdownOpen(false);
                            }}
                            style={({ pressed }) => [
                              styles.locationRow,
                              { borderColor, backgroundColor: pressed ? highlight : 'transparent' },
                            ]}
                          >
                            <Text style={{ color: textColor, fontWeight: '600' }}>{option}</Text>
                          </Pressable>
                        ))}
                        {!cityResults.length && !cityLoading ? (
                          <Text style={{ color: muted, marginTop: 8 }}>No matches yet.</Text>
                        ) : null}
                      </View>
                    ) : (
                      <Text style={{ color: muted, marginBottom: 8 }}>Start typing to see matches.</Text>
                    )}
                    {geoBias && !cityQuery.trim().length ? (
                      <Pressable
                        onPress={async () => {
                          setDetectingCity(true);
                          const detected = await reverseGeocodeCity(geoBias.lat, geoBias.lng);
                          setDetectingCity(false);
                          if (!detected) return;
                          setCityTouched(true);
                          setCityDraft(detected);
                          setCityQuery(detected);
                        }}
                        style={[styles.inlineButton, { borderColor }]}
                      >
                        <Text style={{ color: primary, fontWeight: '600' }}>Use current city</Text>
                      </Pressable>
                    ) : null}

                    <Label style={{ color: muted, marginBottom: 6 }}>Campus (optional)</Label>
                    <TextInput
                      placeholder="Search campuses"
                      placeholderTextColor={muted}
                      value={campusQuery}
                      onChangeText={(text) => {
                        setCampusTouched(true);
                        setCampusQuery(text);
                        setCampusDropdownOpen(true);
                      }}
                      onFocus={() => { if (campusQuery.trim()) setCampusDropdownOpen(true); }}
                      style={[styles.input, { borderColor, backgroundColor: cardBg, color: textColor }]}
                    />
                    {campusLoading ? <Text style={{ color: muted, marginBottom: 8 }}>Searching...</Text> : null}
                    {campusDropdownOpen && campusQuery.trim().length ? (
                      <View style={[styles.suggestionList, { borderColor, backgroundColor: cardBg }]}>
                        {(campusResults.length ? campusResults : getLocationOptions('campus', campusQuery).slice(0, 8)).map((option) => (
                          <Pressable
                            key={option}
                            onPress={() => {
                              setCampusDraft(option);
                              setCampusQuery(option);
                              setCampusTouched(true);
                              setCampusDropdownOpen(false);
                            }}
                            style={({ pressed }) => [
                              styles.locationRow,
                              { borderColor, backgroundColor: pressed ? highlight : 'transparent' },
                            ]}
                          >
                            <Text style={{ color: textColor, fontWeight: '600' }}>{option}</Text>
                          </Pressable>
                        ))}
                        {!campusResults.length && !campusLoading ? (
                          <Text style={{ color: muted, marginTop: 8 }}>No matches yet.</Text>
                        ) : null}
                      </View>
                    ) : (
                      <Text style={{ color: muted, marginBottom: 8 }}>Add a campus to meet classmates.</Text>
                    )}
                    <Label style={{ color: muted, marginBottom: 6 }}>Phone (optional)</Label>
                    <TextInput
                      placeholder="Phone number"
                      placeholderTextColor={muted}
                      value={phoneDraft}
                      onChangeText={setPhoneDraft}
                      keyboardType="phone-pad"
                      textContentType="telephoneNumber"
                      autoComplete="tel"
                      style={[styles.input, { borderColor, backgroundColor: cardBg, color: textColor }]}
                    />
                    <Text style={{ color: muted, marginBottom: 8 }}>Add your number so friends can find you.</Text>
                    <View style={{ flexDirection: 'row' }}>
                  <Pressable
                    onPress={saveNameAndCampus}
                    style={[styles.inlineButton, { backgroundColor: primary }, nameSaveDisabled ? { opacity: 0.5 } : null]}
                    disabled={nameSaveDisabled}
                  >
                    <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{savingName ? 'Saving…' : 'Save'}</Text>
                  </Pressable>
                  {nameSavedAt && !savingName ? (
                    <Text style={{ color: muted, marginTop: 6 }}>Saved</Text>
                  ) : null}
                      <Pressable
                        onPress={() => {
                          setEditingName(false);
                          setNameDraft(user.name || '');
                          setEditingHandle(false);
                          setHandleDraft(user.handle || '');
                          setCityDraft(user.city || '');
                          setCampusDraft(user.campus || '');
                          setCityTouched(false);
                          setCityResults([]);
                          setCityQuery(user.city || '');
                          setCampusTouched(false);
                          setCampusResults([]);
                          setCampusQuery(user.campus || '');
                          setPhoneDraft(user.phone || '');
                        }}
                        style={[styles.inlineButton, { borderColor }]}
                      >
                        <Text style={{ color: textColor }}>Cancel</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View style={[{ flexDirection: 'row', alignItems: 'center' }, gapStyle(12)]}>
                    <Pressable onPress={() => setEditingName(true)} style={styles.linkButton}>
                      <Text style={{ color: primary, fontWeight: '600' }}>Edit profile</Text>
                    </Pressable>
                  </View>
                )
              ) : null}
              {user && !editingName ? (
                <View style={{ marginTop: 10 }}>
                  {editingHandle ? (
                    <View>
                      <TextInput
                        value={handleDraft}
                        onChangeText={setHandleDraft}
                        placeholder="@handle"
                        placeholderTextColor={muted}
                        autoCapitalize="none"
                        autoCorrect={false}
                        maxLength={20}
                        style={[styles.input, { borderColor, backgroundColor: cardBg, color: textColor }]}
                      />
                      <View style={{ height: 6 }} />
                      {handleAvailability === 'checking' ? (
                        <Text style={{ color: muted }}>Checking handle…</Text>
                      ) : handleAvailability === 'available' ? (
                        <Text style={{ color: success }}>Handle available</Text>
                      ) : handleAvailability === 'taken' ? (
                        <Text style={{ color: danger }}>Handle taken</Text>
                      ) : handleAvailability === 'invalid' ? (
                        <Text style={{ color: danger }}>Use 3–20 letters, numbers, underscores, or periods.</Text>
                      ) : null}
                      <View style={{ height: 6 }} />
                      <Pressable
                        onPress={saveHandle}
                        style={[styles.inlineButton, { backgroundColor: primary }, handleSaveDisabled ? { opacity: 0.5 } : null]}
                        disabled={handleSaveDisabled}
                      >
                        <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{savingHandle ? 'Saving…' : 'Save handle'}</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable onPress={() => setEditingHandle(true)} style={styles.linkButton}>
                      <Text style={{ color: primary, fontWeight: '600' }}>{user?.handle ? 'Edit @handle' : 'Add @handle'}</Text>
                    </Pressable>
                  )}
                </View>
              ) : null}
              {!user?.email ? (
                <View style={{ marginTop: 10 }}>
                  <Button title="Upgrade account" onPress={() => router.push('/upgrade')} />
                </View>
              ) : null}
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { borderColor }]}>
                <Text style={[styles.statValue, { color: textColor }]}>{checkins.length}</Text>
                <Text style={{ color: muted, fontSize: 12 }}>Check-ins</Text>
              </View>
              <View style={[styles.statCard, { borderColor }]}>
                <Text style={[styles.statValue, { color: textColor }]}>{topSpots.length}</Text>
                <Text style={{ color: muted, fontSize: 12 }}>Top spots</Text>
              </View>
            </View>
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { borderColor }]}>
                <Text style={[styles.statValue, { color: textColor }]}>{streak}</Text>
                <Text style={{ color: muted, fontSize: 12 }}>Day streak</Text>
              </View>
              <View style={[styles.statCard, { borderColor }]}>
                <Text style={[styles.statValue, { color: textColor }]}>{weekCount}</Text>
                <Text style={{ color: muted, fontSize: 12 }}>This week</Text>
              </View>
            </View>
            <View style={[styles.locationCard, { borderColor, backgroundColor: cardBg }]}>
              <Text style={[styles.locationLabel, { color: muted }]}>City</Text>
              <Text style={[styles.locationValue, { color: textColor }]}>{user?.city || '—'}</Text>
              <View style={{ height: 8 }} />
              <Text style={[styles.locationLabel, { color: muted }]}>Campus</Text>
              <Text style={[styles.locationValue, { color: textColor }]}>{user?.campus || '—'}</Text>
            </View>
              {savedSpots.length ? (
                <View style={{ marginTop: 16 }}>
                  <H2 style={{ color: textColor }}>Saved spots</H2>
                  {savedSpots.map((s: any) => (
                    <Pressable
                      key={s.key}
                      onPress={() => {
                        try {
                          router.push(`/spot?placeId=${encodeURIComponent(s.placeId || '')}&name=${encodeURIComponent(s.name || '')}`);
                        } catch {}
                      }}
                      style={[styles.row, { borderColor, backgroundColor: cardBg }]}
                    >
                      <Text style={{ color: textColor, fontWeight: '600' }}>{s.name}</Text>
                      <Text style={{ color: muted }}>{s.placeId ? 'Saved place' : 'Saved'}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : (
                <View style={{ marginTop: 16 }}>
                  <H2 style={{ color: textColor }}>Saved spots</H2>
                  <Text style={{ color: muted, marginTop: 6 }}>Save your favorite places to find them fast.</Text>
                  <Pressable onPress={() => router.push('/(tabs)/explore')} style={[styles.inlineButton, { borderColor, marginTop: 12 }]}>
                    <Text style={{ color: primary, fontWeight: '600' }}>Explore spots</Text>
                  </Pressable>
                </View>
              )}
            </PolishedCard>

            <View style={{ height: 12 }} />
            <View style={[styles.softDivider, { backgroundColor: separator }]} />
            <H2 style={{ color: textColor }}>Top spots</H2>
            <View style={styles.chipRow}>
              {topSpots.length ? (
                topSpots.map((s) => (
                  <View key={`${s.name}-${s.count}`} style={[styles.chip, { borderColor, backgroundColor: cardBg }]}>
                    <Text style={{ color: textColor, fontWeight: '600' }}>{s.name}</Text>
                    <Text style={{ color: muted, fontSize: 12 }}>{s.count} visits</Text>
                  </View>
                ))
              ) : (
                <Body style={{ color: muted }}>No favorites yet. Tap in to build your list.</Body>
              )}
            </View>

            <View style={{ height: 12 }} />
            <View style={[styles.softDivider, { backgroundColor: separator }]} />
            <View style={styles.sectionHeader}>
              <H2 style={{ color: textColor, marginBottom: 0 }}>Your history</H2>
              <Pressable
                onPress={async () => {
                  if (!user) return;
                  try {
                    router.push(`/story-card?mode=${encodeURIComponent(storyMode)}`);
                  } catch (e) {
                    devLog('story card generation failed', e);
                    alert('Unable to build story card');
                  }
                }}
                style={[styles.storyButton, { backgroundColor: primary }]}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Create story card</Text>
              </Pressable>
            </View>
          </View>
        }
        renderSectionHeader={({ section }: any) => (
          <View style={{ marginTop: 12, marginBottom: 6, marginHorizontal: 6 }}>
            <Text style={{ color: muted, fontSize: 12, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', opacity: 0.7 }}>
              {section.title}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <View style={{ marginTop: 10, marginHorizontal: 6 }}>
            <Text style={{ color: muted }}>No check-ins yet.</Text>
          </View>
        }
        ListFooterComponent={
          <View style={{ marginTop: 18, marginBottom: 40, alignItems: 'center' }}>
            <View style={styles.socialRow}>
              <Pressable
                onPress={() => {
                  void openExternalLink('https://instagram.com/perchedapp');
                }}
                accessibilityLabel="Perched on Instagram"
                style={({ pressed }) => [
                  styles.socialButton,
                  { borderColor, backgroundColor: pressed ? highlight : cardBg },
                ]}
              >
                <FontAwesome5 name="instagram" size={18} color={textColor} />
              </Pressable>
              <Pressable
                onPress={() => {
                  void openExternalLink('https://tiktok.com/@perchedapp');
                }}
                accessibilityLabel="Perched on TikTok"
                style={({ pressed }) => [
                  styles.socialButton,
                  { borderColor, backgroundColor: pressed ? highlight : cardBg },
                ]}
              >
                <FontAwesome5 name="tiktok" size={18} color={textColor} />
              </Pressable>
              <Pressable
                onPress={() => {
                  void openExternalLink('mailto:perchedappteam@gmail.com');
                }}
                accessibilityLabel="Email Perched"
                style={({ pressed }) => [
                  styles.socialButton,
                  { borderColor, backgroundColor: pressed ? highlight : cardBg },
                ]}
              >
                <FontAwesome5 name="envelope" size={18} color={textColor} />
              </Pressable>
            </View>
          </View>
        }
        renderItem={({ item: row, section }: any) => (
          <View style={styles.gridRow}>
            {[0, 1].map((idx) => {
              const it = row.items[idx];
              if (!it) return <View key={`${row.key}-empty-${idx}`} style={{ flex: 1, margin: 6 }} />;
              const focus = String(it.id || it.clientId || '');
              const sectionKey = typeof section?.key === 'string' ? section.key : '';
              return (
                <Pressable
                  key={it.id || it.clientId || `${row.key}-${idx}`}
                  onPress={() => {
                    if (!focus) return;
                    router.push(`/my-posts?focus=${encodeURIComponent(focus)}${sectionKey ? `&section=${encodeURIComponent(sectionKey)}` : ''}` as any);
                  }}
                  style={({ pressed }) => [{ flex: 1, margin: 6, opacity: pressed ? 0.88 : 1 }]}
                >
                  <SpotImage
                    source={{ uri: it.photoUrl || it.photoURL || it.imageUrl || it.imageURL || it.image }}
                    style={[styles.gridImage, { borderColor }]}
                  />
                </Pressable>
              );
            })}
          </View>
        )}
      />
      <CelebrationOverlay visible={showStreakCelebration} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  listContent: { paddingHorizontal: 20, paddingBottom: 140 },
  header: { paddingTop: 20, paddingBottom: 16 },
  locationRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  suggestionList: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10,
  },
  softDivider: {
    height: 1,
    marginTop: 12,
    marginBottom: 12,
    opacity: 0.8,
  },
  profileCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
  },
  banner: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  progressTrack: { height: 8, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  input: { borderWidth: 1, padding: 12, borderRadius: 14 },
  inlineButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    marginRight: 10,
    borderWidth: 1,
  },
  row: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
  },
  linkButton: { paddingVertical: 4 },
  statsRow: { flexDirection: 'row', marginTop: 16, ...gapStyle(10) },
  statCard: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
  },
  statValue: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  locationCard: {
    marginTop: 12,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
  },
  locationLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  locationValue: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', ...gapStyle(8) },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  storyButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  friendCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', ...gapStyle(10) },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
    ...gapStyle(8),
  },
  friendActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    ...gapStyle(10),
  },
  friendChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  socialRow: { flexDirection: 'row', alignItems: 'center', ...gapStyle(12) },
  socialButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridRow: { flexDirection: 'row' },
  gridImage: { width: '100%', height: 140, borderRadius: 16, borderWidth: 1 },
});
