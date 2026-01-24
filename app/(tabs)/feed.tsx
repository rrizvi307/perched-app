import { ThemedView } from '@/components/themed-view';
import { Atmosphere } from '@/components/ui/atmosphere';
import { Body, H1, Label } from '@/components/ui/typography';
import SegmentedControl from '@/components/ui/segmented-control';
import StatusBanner from '@/components/ui/status-banner';
import { getCheckins, getPendingCheckins, pruneInvalidPendingCheckins, seedDemoNetwork } from '@/storage/local';
import { syncPendingCheckins } from '@/services/syncPending';
import { useToast } from '@/contexts/ToastContext';
import { tokens } from '@/constants/tokens';
import { useAuth } from '@/contexts/AuthContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { subscribeCheckinEvents } from '@/services/feedEvents';
import { acceptFriendRequest, blockUserRemote, getBlockedUsers, getApprovedCheckinsRemote, getCloseFriends, getIncomingFriendRequests, getOutgoingFriendRequests, getUserFriendsCached, isFirebaseConfigured, getFirebaseInitError, reportUserRemote, sendFriendRequest, setCloseFriendRemote, subscribeApprovedCheckins, subscribeApprovedCheckinsForUsers, unblockUserRemote, unfollowUserRemote } from '@/services/firebaseClient';
import { logEvent } from '@/services/logEvent';
import { devLog } from '@/services/logger';
import { spotKey } from '@/services/spotUtils';
import { formatCheckinTime, formatTimeRemaining, isCheckinExpired, toMillis } from '@/services/checkinUtils';
import { DEMO_USER_IDS, isDemoMode } from '@/services/demoMode';
import SpotImage from '@/components/ui/spot-image';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { gapStyle } from '@/utils/layout';
import { withAlpha } from '@/utils/colors';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { FlatList, InteractionManager, Platform, Pressable, RefreshControl, Share, StyleSheet, Text, View } from 'react-native';

type Checkin = {
	id: string;
	spot?: string;
	spotName?: string;
	spotPlaceId?: string;
	image?: string;
	photoUrl?: string;
	photoPending?: boolean;
	caption?: string;
	createdAt: string;
	userId?: string;
	userName?: string | null;
	userHandle?: string | null;
	userPhotoUrl?: string | null;
	campus?: string;
	city?: string;
	campusOrCity?: string;
	expiresAt?: string;
};

function FeedPhoto({
	uri,
	background,
	muted,
	pending,
}: {
	uri?: string | null;
	background: string;
	muted: string;
	pending?: boolean;
}) {
	const [failed, setFailed] = useState(false);
	if (!uri || failed) {
		return (
			<View style={[styles.cardImage, { backgroundColor: background, alignItems: 'center', justifyContent: 'center' }]}>
				<Text style={{ color: muted, fontWeight: '600' }}>{pending ? 'Photo uploading…' : 'Photo unavailable'}</Text>
			</View>
		);
	}
	return (
		<SpotImage
			source={uri}
			contentFit="cover"
			style={[styles.cardImage, { backgroundColor: background }]}
			onError={() => setFailed(true)}
		/>
	);
}

	export default function FeedScreen() {
		const spotQuery = (() => {
			if (Platform.OS !== 'web') return null;
			try {
				const search = typeof window !== 'undefined' ? (window as any)?.location?.search : '';
				if (typeof search !== 'string' || !search) return null;
				return new URLSearchParams(search).get('spot');
			} catch {
				return null;
			}
		})() as string | null;
		const [items, setItems] = useState<Checkin[]>([]);
		const [loadingMore, setLoadingMore] = useState(false);
		const [refreshing, setRefreshing] = useState(false);
		const [initialLoading, setInitialLoading] = useState(true);
		const [status, setStatus] = useState<{ message: string; tone: 'info' | 'warning' | 'error' | 'success' } | null>(null);
		const [pendingCount, setPendingCount] = useState(0);
		const [pendingUploading, setPendingUploading] = useState(0);
		const [pendingError, setPendingError] = useState<string | null>(null);
		const { showToast } = useToast();
	const wasOfflineRef = useRef(false);
	const localCacheRef = useRef<Checkin[]>([]);
	const [remoteCursor, setRemoteCursor] = useState<any | null>(null);
	const [hasMoreRemote, setHasMoreRemote] = useState(true);
	const PAGE = 20;
	const realtimeEnabled = isFirebaseConfigured();

	// call theme hooks once at top-level of component to avoid calling hooks inside renderItem
	const text = useThemeColor({}, 'text');
	const card = useThemeColor({}, 'card');
	const border = useThemeColor({}, 'border');
	const background = useThemeColor({}, 'background');
	const muted = useThemeColor({}, 'muted');
	const primary = useThemeColor({}, 'primary');
	const accent = useThemeColor({}, 'accent');
	const highlight = withAlpha(primary, 0.12);
	const badgeFill = withAlpha(accent, 0.16);
	const isWeb = Platform.OS === 'web';

	const resolvePhotoSrc = useCallback(
		(item: any) => {
			const candidate = item?.photoUrl || item?.photoURL || item?.imageUrl || item?.imageURL || item?.image;
			if (typeof candidate === 'string' && isWeb) {
				if (candidate.startsWith('file:') || candidate.startsWith('blob:')) {
					return item?.image || null;
				}
			}
			return candidate;
		},
		[isWeb]
	);

	const { user } = useAuth();
	const router = useRouter();
	const [feedScope, setFeedScope] = useState<'everyone' | 'campus' | 'friends'>('everyone');
		const [friendIds, setFriendIds] = useState<string[]>(() => (isDemoMode() ? [...DEMO_USER_IDS] : []));
		const [blockedIds, setBlockedIds] = useState<string[]>([]);

		const summarizePending = useCallback(
			(pending: any[]) => {
				const scoped = user?.id ? pending.filter((p: any) => p?.userId === user.id) : pending;
				const firstErr = scoped.find((p: any) => typeof p?.lastError === 'string' && p.lastError.trim().length > 0);
				const uploading = scoped.filter((p: any) => {
					if (p?.photoPending) return true;
					const photoUrl = typeof p?.photoUrl === 'string' ? p.photoUrl : '';
					if (photoUrl && !photoUrl.startsWith('http')) return true;
					const err = typeof p?.lastError === 'string' ? p.lastError.toLowerCase() : '';
					return err.includes('photo') && err.includes('upload');
				}).length;
				return { count: scoped.length, uploading, error: firstErr?.lastError || null };
			},
			[user?.id]
		);
	const [incomingRequests, setIncomingRequests] = useState<any[]>([]);
	const [outgoingRequests, setOutgoingRequests] = useState<any[]>([]);
	const [lastSelfCheckinAt, setLastSelfCheckinAt] = useState<string | null>(null);
	const friendIdSet = useMemo(() => new Set(friendIds), [friendIds]);
	const blockedIdSet = useMemo(() => new Set(blockedIds), [blockedIds]);
	const incomingById = useMemo(() => new Set(incomingRequests.map((r) => r.fromId)), [incomingRequests]);
	const outgoingById = useMemo(() => new Set(outgoingRequests.map((r) => r.toId)), [outgoingRequests]);
	const onlyCampus = feedScope === 'campus';
	const onlyFriends = feedScope === 'friends';

	useEffect(() => {
		if (feedScope === 'campus' && !user?.campus) {
			setFeedScope('everyone');
		}
	}, [feedScope, user?.campus]);

	useEffect(() => {
		(async () => {
			if (user) {
				try {
					const ids = await getUserFriendsCached(user.id);
					const resolved = ids || [];
					setFriendIds(resolved.length ? resolved : (isDemoMode() ? [...DEMO_USER_IDS] : []));
					const blocked = await getBlockedUsers(user.id);
					setBlockedIds(blocked || []);
					const incoming = await getIncomingFriendRequests(user.id);
					const outgoing = await getOutgoingFriendRequests(user.id);
					setIncomingRequests(incoming || []);
					setOutgoingRequests(outgoing || []);
				} catch (e) {
					try { devLog('feed load failed', e); } catch {}
					try { const init = getFirebaseInitError(); if (init) devLog('firebase init error', init); } catch {}
				}
			}
		})();
	}, [user]);

	const refreshFriendRequests = useCallback(async () => {
		if (!user) return;
		try {
			const ids = await getUserFriendsCached(user.id);
			const resolved = ids || [];
			setFriendIds(resolved.length ? resolved : (isDemoMode() ? [...DEMO_USER_IDS] : []));
			const blocked = await getBlockedUsers(user.id);
			setBlockedIds(blocked || []);
			const incoming = await getIncomingFriendRequests(user.id);
			const outgoing = await getOutgoingFriendRequests(user.id);
			setIncomingRequests(incoming || []);
			setOutgoingRequests(outgoing || []);
		} catch {}
	}, [user]);

	const filterExpired = useCallback((list: Checkin[]) => list.filter((it) => !isCheckinExpired(it)), []);

	const needsDailyCheckin = useMemo(() => {
		if (!lastSelfCheckinAt) return true;
		const last = new Date(lastSelfCheckinAt);
		if (Number.isNaN(last.getTime())) return true;
		const now = new Date();
		return last.getFullYear() !== now.getFullYear()
			|| last.getMonth() !== now.getMonth()
			|| last.getDate() !== now.getDate();
	}, [lastSelfCheckinAt]);
	const selfCheckinCount = useMemo(() => {
		if (!user?.id) return 0;
		return items.reduce((sum, it) => sum + (it.userId === user.id ? 1 : 0), 0);
	}, [items, user?.id]);

	const mergeRemoteWithLocal = useCallback(async (remoteItems: any[]) => {
		try {
			const local = localCacheRef.current.length ? localCacheRef.current : await getCheckins();
			if (!localCacheRef.current.length) {
				localCacheRef.current = local as Checkin[];
			}
			const byClient = new Map<string, any>();
			const localByClient = new Map<string, any>();
			const localBySignature = new Map<string, any>();
			const usedLocal = new Set<string>();
			const normalizeName = (value: any) =>
				(value || '')
					.toString()
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, ' ')
					.trim();
			const signatureKey = (userId: any, name: string, bucket: number) => `${userId || 'anon'}|${name}|${bucket}`;
			const getBucket = (value: any) => {
				const ms = toMillis(value) || 0;
				return Math.round(ms / (5 * 60 * 1000));
			};
			const normalizedRemote = remoteItems.map((r: any) => {
				const resolved = resolvePhotoSrc(r);
				if (resolved && !r.photoUrl) return { ...r, photoUrl: resolved };
				return r;
			});
			normalizedRemote.forEach((r: any) => {
				if (r.clientId) byClient.set(r.clientId, r);
			});
			local.forEach((l: any) => {
				if (l.clientId) localByClient.set(l.clientId, l);
				const name = normalizeName(l.spotName || l.spot);
				if (!name) return;
				const bucket = getBucket(l.createdAt);
				const key = signatureKey(l.userId, name, bucket);
				if (!localBySignature.has(key)) localBySignature.set(key, l);
			});
			const findLocalMatch = (r: any) => {
				const name = normalizeName(r.spotName || r.spot);
				if (!name) return null;
				const bucket = getBucket(r.createdAt);
				const keys = [
					signatureKey(r.userId, name, bucket),
					signatureKey(r.userId, name, bucket - 1),
					signatureKey(r.userId, name, bucket + 1),
				];
				for (const key of keys) {
					const match = localBySignature.get(key);
					if (match) return match;
				}
				return null;
			};
			const combined = normalizedRemote.map((r: any) => {
				let localMatch = r.clientId ? localByClient.get(r.clientId) : null;
				if (!localMatch) localMatch = findLocalMatch(r);
				if (!localMatch) return r;
				if (localMatch.id) usedLocal.add(localMatch.id);
				const next = { ...r };
				if (!next.photoUrl && localMatch.photoUrl) next.photoUrl = localMatch.photoUrl;
				if (!next.image && localMatch.image) next.image = localMatch.image;
				if (!next.photoUrl) {
					const fallback = resolvePhotoSrc(localMatch);
					if (fallback) next.photoUrl = fallback;
				}
				if (!next.userName && localMatch.userName) next.userName = localMatch.userName;
				if (!next.userHandle && localMatch.userHandle) next.userHandle = localMatch.userHandle;
				return next;
			});
			local.forEach((l: any) => {
				if (l.clientId && byClient.has(l.clientId)) return;
				if (usedLocal.has(l.id)) return;
				combined.push(l);
			});
				const toTs = (it: any) => toMillis(it?.createdAt) || 0;
			const normalizedCombined = combined.map((it: any) => {
				const resolved = resolvePhotoSrc(it);
				if (resolved && !it.photoUrl) return { ...it, photoUrl: resolved };
				return it;
			});
			const sorted = normalizedCombined.sort((a: any, b: any) => toTs(b) - toTs(a));
			localCacheRef.current = sorted;
			return sorted;
		} catch {
			return remoteItems;
		}
		}, [resolvePhotoSrc]);

		const loadLatest = useCallback(async () => {
			setRefreshing(true);
			try {
				const demo = isDemoMode();
				await pruneInvalidPendingCheckins().catch(() => {});
				const pendingPromise = getPendingCheckins().catch(() => []);
				if (demo) {
					try { await seedDemoNetwork(user?.id); } catch {}
					const pending = await pendingPromise;
					const pendingSummary = summarizePending(pending);
					setPendingCount(pendingSummary.count);
					setPendingUploading(pendingSummary.uploading);
					setPendingError(pendingSummary.error);
					const data = await getCheckins().catch(() => []);
					setItems(filterExpired(data as any));
					setRemoteCursor(null);
					setHasMoreRemote(false);
					setStatus(null);
					return;
				}
				const res = await getApprovedCheckinsRemote(PAGE);
				const pending = await pendingPromise;
				const pendingSummary = summarizePending(pending);
				setPendingCount(pendingSummary.count);
				setPendingUploading(pendingSummary.uploading);
				setPendingError(pendingSummary.error);
				if (pending.length) {
					void syncPendingCheckins(2).then(async () => {
						try {
							const nextPending = await getPendingCheckins();
							const nextSummary = summarizePending(nextPending);
							setPendingCount(nextSummary.count);
							setPendingUploading(nextSummary.uploading);
							setPendingError(nextSummary.error);
						} catch {}
					});
				}
			const cleaned = filterExpired(res.items as any);
			let merged = await mergeRemoteWithLocal(cleaned);
			if (merged.length < 2 && process.env.NODE_ENV !== 'production') {
				try {
					await seedDemoNetwork(user?.id);
					merged = await mergeRemoteWithLocal(cleaned);
				} catch {}
			}
			setItems(merged);
			if (user) {
				const selfRemote = merged.filter((c: any) => c.userId === user.id);
				if (selfRemote.length) {
					const sorted = [...selfRemote].sort((a, b) => (toMillis(b.createdAt) || 0) - (toMillis(a.createdAt) || 0));
					setLastSelfCheckinAt(sorted[0]?.createdAt || null);
				}
			}
			setRemoteCursor(res.lastCursor || null);
			setHasMoreRemote(cleaned.length >= PAGE);
			void logEvent('feed_viewed', user?.id);
			setStatus(null);
			if (wasOfflineRef.current) {
				showToast('Back online. Feed updated.', 'success');
				wasOfflineRef.current = false;
			}
			} catch {
				try {
					const pending = await getPendingCheckins();
					const pendingSummary = summarizePending(pending);
					setPendingCount(pendingSummary.count);
					setPendingUploading(pendingSummary.uploading);
					setPendingError(pendingSummary.error);
				} catch {}
				const data = await getCheckins();
				setItems(filterExpired(data as any));
				setStatus({ message: 'Offline right now. Showing saved check-ins.', tone: 'warning' });
				wasOfflineRef.current = true;
				try {
					const init = getFirebaseInitError();
					if (init) {
						setStatus({ message: `Offline (firebase init error). ${String(init?.message || init)}`, tone: 'warning' });
					}
				} catch {}
		} finally {
			setRefreshing(false);
			setInitialLoading(false);
		}
		}, [filterExpired, mergeRemoteWithLocal, showToast, summarizePending, user]);

	const loadMore = useCallback(async () => {
		if (loadingMore || !hasMoreRemote) return;
		setLoadingMore(true);
		try {
			const res = await getApprovedCheckinsRemote(PAGE, remoteCursor || undefined);
			if (res.items && res.items.length) {
				const cleaned = filterExpired(res.items as any);
				setItems((prev) => [...prev, ...cleaned]);
				setRemoteCursor(res.lastCursor || null);
				setHasMoreRemote(cleaned.length >= PAGE);
			}
		} catch {
			// no-op for local fallback
		} finally {
			setLoadingMore(false);
		}
	}, [loadingMore, remoteCursor, hasMoreRemote, filterExpired]);

	useEffect(() => {
		(async () => {
			// show local items first for instant UX
			const local = await getCheckins();
			localCacheRef.current = local as Checkin[];
			setItems(filterExpired(local as any));
			if (user) {
				const selfLocal = (local as any[]).filter((c) => c.userId === user.id);
				if (selfLocal.length) {
					const sorted = [...selfLocal].sort((a, b) => (toMillis(b.createdAt) || 0) - (toMillis(a.createdAt) || 0));
					setLastSelfCheckinAt(sorted[0]?.createdAt || null);
				}
			}
			// defer network refresh to keep first paint fast
			if (isWeb) {
				void loadLatest();
			} else {
				InteractionManager.runAfterInteractions(() => {
					void loadLatest();
				});
			}
			})();

		// subscribe to optimistic inserts from Checkin screen
		const unsubLocal = subscribeCheckinEvents((it: any) => {
			setItems((prev) => {
				const clientId = it?.clientId;
				const id = it?.id;
				const idx = prev.findIndex((p: any) => (clientId && p?.clientId === clientId) || (id && p?.id === id));
				if (idx >= 0) {
					const next = prev.slice();
					next[idx] = { ...next[idx], ...it };
					return filterExpired(next as any);
				}
				return filterExpired([it as any, ...prev] as any);
			});
			try {
				const clientId = it?.clientId;
				const id = it?.id;
				const idx = localCacheRef.current.findIndex((p: any) => (clientId && p?.clientId === clientId) || (id && p?.id === id));
				if (idx >= 0) {
					localCacheRef.current[idx] = { ...localCacheRef.current[idx], ...it } as any;
				} else {
					localCacheRef.current = [it as any, ...localCacheRef.current];
				}
			} catch {}
		});


			return () => {
				unsubLocal();
			};
	}, [filterExpired, loadLatest, realtimeEnabled, user, isWeb]);

		useEffect(() => {
			let active = true;
			(async () => {
				try {
					const pending = await getPendingCheckins();
					if (!active) return;
					const pendingSummary = summarizePending(pending);
					setPendingCount(pendingSummary.count);
					setPendingUploading(pendingSummary.uploading);
					setPendingError(pendingSummary.error);
					const scoped = user?.id ? pending.filter((p: any) => p?.userId === user.id) : pending;
					if (scoped.length) {
						void syncPendingCheckins(3).then(async () => {
							try {
								const nextPending = await getPendingCheckins();
								if (!active) return;
								const nextSummary = summarizePending(nextPending);
								setPendingCount(nextSummary.count);
								setPendingUploading(nextSummary.uploading);
								setPendingError(nextSummary.error);
							} catch {}
						});
					}
				} catch {}
			})();
		return () => {
			active = false;
		};
		}, [summarizePending, user]);

		// refs for remote subscriptions so we can swap global <-> friends subscriptions
		const remoteUnsubRef = useRef<(() => void) | null>(null);
		const friendsUnsubRef = useRef<(() => void) | null>(null);

		// subscribe to global remote feed when not in friends-only mode
		useEffect(() => {
			// cleanup previous
			if (remoteUnsubRef.current) {
				try { remoteUnsubRef.current(); } catch {}
				remoteUnsubRef.current = null;
			}
			if (friendsUnsubRef.current) {
				try { friendsUnsubRef.current(); } catch {}
				friendsUnsubRef.current = null;
			}

			if (!onlyFriends) {
				const unsub = subscribeApprovedCheckins((remoteItems: any[]) => {
					const cleaned = filterExpired(remoteItems as any);
					void (async () => {
						const merged = await mergeRemoteWithLocal(cleaned);
						setItems(merged);
						if (cleaned.length) {
							setRemoteCursor(cleaned[cleaned.length - 1].createdAt || null);
							setHasMoreRemote(cleaned.length >= PAGE);
						}
					})();
				});
				if (typeof unsub === 'function') remoteUnsubRef.current = unsub;
			}

			return () => {
				if (remoteUnsubRef.current) {
					try { remoteUnsubRef.current(); } catch {}
					remoteUnsubRef.current = null;
				}
			};
		}, [onlyFriends, filterExpired, mergeRemoteWithLocal]);

	// subscribe to friends-only feed when toggled on
	useEffect(() => {
		if (!onlyFriends) return;
		if (user && friendIds.length === 0) {
			(async () => {
				try {
					const ids = await getUserFriendsCached(user.id);
					setFriendIds(ids || []);
					const incoming = await getIncomingFriendRequests(user.id);
					const outgoing = await getOutgoingFriendRequests(user.id);
					setIncomingRequests(incoming || []);
					setOutgoingRequests(outgoing || []);
				} catch {}
			})();
		}
		// cleanup any existing friend unsub
		if (friendsUnsubRef.current) {
			try { friendsUnsubRef.current(); } catch {}
			friendsUnsubRef.current = null;
		}
			if (!friendIds || friendIds.length === 0) {
				// nothing to subscribe to
				setItems([]);
				return;
			}
			const unsub = subscribeApprovedCheckinsForUsers(friendIds, (remoteItems: any[]) => {
				const cleaned = filterExpired(remoteItems as any);
				void (async () => {
					const merged = await mergeRemoteWithLocal(cleaned);
					setItems(merged);
					if (cleaned.length) {
						setRemoteCursor(cleaned[cleaned.length - 1].createdAt || null);
						setHasMoreRemote(cleaned.length >= PAGE);
					}
				})();
			});
			if (typeof unsub === 'function') friendsUnsubRef.current = unsub;

			return () => {
				if (friendsUnsubRef.current) {
					try { friendsUnsubRef.current(); } catch {}
					friendsUnsubRef.current = null;
				}
			};
		}, [onlyFriends, friendIds, user, filterExpired, mergeRemoteWithLocal]);

	const visibleItems = useMemo(() => {
		let out = items;

		// if navigated from map with a spot param, filter to that spot
		if (spotQuery) {
			out = out.filter((it: any) => {
				const name = (it.spotName || it.spot || '').toLowerCase();
				return name.includes((spotQuery || '').toLowerCase());
			});
		}
		if (onlyCampus && user?.campus) {
			out = out.filter((it: any) => (it.campus || it.campusOrCity) === user.campus);
		}
		if (onlyFriends && user) {
			// filter by friendIds if available, otherwise show none
			if (!friendIdSet.size) return [];
			out = out.filter((it: any) => friendIdSet.has(it.userId));
		}

		// filter expired posts (live window)
		out = out.filter((it: any) => !isCheckinExpired(it));

		// sanitize items for privacy: exact locations visible only to friends/owner
		const sanitized = out.map((it: any) => {
			if (user && blockedIdSet.has(it.userId)) return null;
			if (!it.visibility) return it;
			if (it.visibility === 'friends') {
				const allowed = user && (friendIdSet.has(it.userId) || it.userId === user.id);
				if (!allowed) return null; // hide entirely
			}
			if (it.visibility === 'close') {
				const allowed = user && (friendIdSet.has(it.userId) || it.userId === user.id);
				if (!allowed) {
					// anonymize and show general area only
					return { ...it, spotName: 'General area', userName: null, userHandle: null, userPhotoUrl: null };
				}
			}
			return it;
		}).filter(Boolean);

		return sanitized.filter(Boolean) as Checkin[];
	}, [items, spotQuery, onlyCampus, onlyFriends, user, friendIdSet, blockedIdSet]);

	const collapsedItems = useMemo(() => {
		const toTs = (value: any) => toMillis(value) || 0;
		const hasRenderablePhoto = (it: any) => {
			const candidate = it?.photoUrl || it?.photoURL || it?.imageUrl || it?.imageURL || it?.image;
			return typeof candidate === 'string' && candidate.trim().length > 0;
		};
		const map: Record<string, { item: Checkin; count: number }> = {};
		visibleItems.forEach((it) => {
			const name = it.spotName || it.spot || 'Unknown';
			const key = spotKey((it as any).spotPlaceId, name);
			if (!map[key]) {
				map[key] = { item: it, count: 1 };
				return;
			}
			map[key].count += 1;
			const existing = map[key].item;
			const existingTs = toTs(existing.createdAt);
			const nextTs = toTs(it.createdAt);
			const existingHasPhoto = hasRenderablePhoto(existing) && !existing.photoPending;
			const nextHasPhoto = hasRenderablePhoto(it) && !(it as any).photoPending;
			// Prefer: newer, but don't let a photo-less duplicate override a photo-backed one.
			if (nextTs > existingTs) {
				if (!existingHasPhoto || nextHasPhoto) map[key].item = it;
				return;
			}
			// Same bucket: prefer item with an actual photo.
			if (nextTs === existingTs) {
				if (!existingHasPhoto && nextHasPhoto) map[key].item = it;
				return;
			}
			// If the newer item is missing a photo (still uploading), keep an older item that has one.
			const withinTwoHours = existingTs - nextTs <= 2 * 60 * 60 * 1000;
			if (!existingHasPhoto && nextHasPhoto && withinTwoHours) {
				map[key].item = it;
			}
		});
		return Object.values(map).map((v) => ({ ...v.item, groupCount: v.count })) as any[];
	}, [visibleItems]);

	const groupedCount = collapsedItems.reduce((sum, it) => sum + ((it as any).groupCount || 1), 0);
	const demoMode = isDemoMode();

	return (
		<ThemedView style={styles.container}>
			<Atmosphere />
			<FlatList
				data={collapsedItems}
				keyExtractor={(i) => i.id}
				contentContainerStyle={styles.listContent}
				initialNumToRender={6}
				maxToRenderPerBatch={8}
				windowSize={7}
				updateCellsBatchingPeriod={40}
				removeClippedSubviews={Platform.OS !== 'web'}
				ListHeaderComponent={
					<View style={styles.header}>
						<View style={[styles.heroCard, { backgroundColor: card, borderColor: border }]}>
						<View style={[styles.heroBadge, { backgroundColor: badgeFill }]}>
								<Label style={{ marginBottom: 0, color: accent }}>Live now</Label>
							</View>
							<H1 style={{ color: text }}>Your friends are out there.</H1>
							<Body style={{ color: muted }}>
								See where people are studying and working, then tap in with a photo and a quick note.
							</Body>
							<Text style={{ color: muted, marginTop: 6 }}>
								{groupedCount
									? `${groupedCount} check-in${groupedCount === 1 ? '' : 's'} today`
									: 'No check-ins yet today.'}
							</Text>
							<Text style={{ color: muted, marginTop: 6 }}>
								Use the + button above to share where you are.
							</Text>
							{!demoMode && pendingCount > 0 ? (
								(() => {
									const normalizedError = pendingError?.toLowerCase() || '';
									const displayError = pendingError && !normalizedError.includes('pending') ? pendingError : null;
									const uploadingOnly = pendingUploading > 0 && pendingUploading === pendingCount;
									const baseMessage = uploadingOnly
										? `Finishing ${pendingUploading} upload${pendingUploading === 1 ? '' : 's'}…`
										: pendingUploading > 0
										? `${pendingCount} check-ins pending (${pendingUploading} photo upload${pendingUploading === 1 ? '' : 's'})`
										: `${pendingCount} check-in${pendingCount === 1 ? '' : 's'} waiting to sync`;
									return (
								<StatusBanner
									message={`${baseMessage}${displayError ? ` — ${displayError}` : ''}`}
									tone={displayError ? 'warning' : 'info'}
									actionLabel="Sync now"
									onAction={async () => {
										await syncPendingCheckins(3);
										const pending = await getPendingCheckins();
										const pendingSummary = summarizePending(pending);
										setPendingCount(pendingSummary.count);
										setPendingUploading(pendingSummary.uploading);
										setPendingError(pendingSummary.error);
									}}
								/>
									);
								})()
							) : null}
							{!demoMode && status ? (
								<>
									<StatusBanner
										message={status.message}
										tone={status.tone}
										actionLabel="Retry"
										onAction={loadLatest}
									/>
									{status.tone === 'warning' && !demoMode ? (
										<View style={[styles.debugCard, { borderColor: border, backgroundColor: card, marginTop: 10, padding: 10, borderRadius: 10 }]}> 
											<Text style={{ color: muted, marginBottom: 6 }}>Diagnostics:</Text>
											<Text style={{ color: muted, fontSize: 12 }}>Firebase configured: {isFirebaseConfigured() ? 'yes' : 'no'}</Text>
											<Text style={{ color: muted, fontSize: 12 }}>Init error: {String(getFirebaseInitError() || 'none')}</Text>
											<Pressable
												onPress={async () => {
													try {
														const res = await getApprovedCheckinsRemote(1);
														showToast(`Remote OK: ${res.items?.length || 0}`, 'success');
													} catch (err) {
														showToast(`Remote error: ${String(err)}`, 'error');
													}
												}}
												style={({ pressed }) => [{ padding: 8, marginTop: 8, borderRadius: 8, borderColor: border, borderWidth: 1, backgroundColor: pressed ? highlight : card }]}
											>
												<Text style={{ color: primary }}>Run remote test</Text>
											</Pressable>
										</View>
									) : null}
								</>
							) : null}
						</View>
						<View style={[styles.softDivider, { backgroundColor: border }]} />
						<View style={styles.quickActions}>
							<Pressable
								onPress={() => router.push('/(tabs)/explore')}
								style={({ pressed }) => [
									styles.quickButton,
									{ borderColor: border, backgroundColor: pressed ? highlight : card },
								]}
							>
								<Text style={{ color: text, fontWeight: '600' }}>Explore</Text>
							</Pressable>
                            
								<Pressable
									onPress={async () => {
											await Share.share({ message: 'Join me on Perched. Download: https://perched.app' });
									}}
									style={({ pressed }) => [
										styles.quickButton,
										{ borderColor: border, backgroundColor: pressed ? highlight : card },
								]}
							>
								<Text style={{ color: text, fontWeight: '600' }}>Invite</Text>
							</Pressable>
						</View>
							{user && needsDailyCheckin ? (
								<Text style={{ color: muted, marginTop: 10 }}>
									{selfCheckinCount === 0 ? 'Get your streak going — tap in today.' : 'Keep your streak going — tap in today.'}
								</Text>
							) : null}
						<View style={styles.filterRow}>
							{user ? (
								<View style={{ alignItems: 'center' }}>
									<SegmentedControl
										value={feedScope}
										activeColor={accent}
										onChange={(next) => {
											if (next === 'campus' && !user?.campus) return;
											setFeedScope(next as 'everyone' | 'campus' | 'friends');
										}}
										options={[
											{ key: 'everyone', label: 'Everyone' },
											{ key: 'campus', label: 'Campus', disabled: !user?.campus },
											{ key: 'friends', label: 'Friends' },
										]}
									/>
									<Text style={{ color: muted, fontSize: 11, marginTop: 6 }}>
										Showing: {feedScope === 'friends' ? 'Friends only' : feedScope === 'campus' ? 'Campus only' : 'Everyone'}
									</Text>
									{feedScope === 'friends' && friendIdSet.size === 0 ? (
										<Pressable onPress={() => router.push('/(tabs)/profile')} style={{ marginTop: 6 }}>
											<Text style={{ color: primary, fontSize: 12, fontWeight: '600' }}>No friends yet — add friends in Profile</Text>
										</Pressable>
									) : null}
									{feedScope === 'campus' && !user?.campus ? (
										<Text style={{ color: muted, fontSize: 12, marginTop: 4 }}>Add a campus in Profile to enable this feed.</Text>
									) : null}
								</View>
							) : null}
						</View>
					</View>
				}
				renderItem={({ item }) => {
					const time = formatCheckinTime(item.createdAt);
					const remaining = formatTimeRemaining(item);
					const groupCount = (item as any).groupCount || 1;
					const isFriend = !!(item.userId && friendIdSet.has(item.userId));
					const isIncoming = !!(item.userId && incomingById.has(item.userId));
					const isOutgoing = !!(item.userId && outgoingById.has(item.userId));
					const photo = resolvePhotoSrc(item);
						const selfFallback = user && item.userId === user.id
							? (user.name || (user.handle ? `@${user.handle}` : user.email ? user.email.split('@')[0] : null))
							: null;
						const rawUserName = typeof item.userName === 'string' ? item.userName.trim() : null;
						const userName =
							user && item.userId === user.id && rawUserName === 'Someone'
								? null
								: rawUserName;
						const effectiveHandle = item.userHandle || (user && item.userId === user.id ? user.handle : null);
						const displayName = userName || selfFallback || (effectiveHandle ? `@${effectiveHandle}` : 'Someone');
						const initials = displayName.replace('@', '').split(' ').map((s: any) => s[0]).slice(0, 2).join('').toUpperCase();
						return (
							<View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
							<View style={styles.cardHeader}>
								<View style={styles.avatarRow}>
									{item.userPhotoUrl ? (
										<SpotImage source={{ uri: item.userPhotoUrl }} style={styles.avatar} />
									) : (
										<View style={[styles.avatar, { backgroundColor: border, alignItems: 'center', justifyContent: 'center' }]}>
											<Text style={{ color: text, fontWeight: '700' }}>
												{initials || 'PA'}
											</Text>
										</View>
									)}
									<View style={{ marginLeft: 10 }}>
											<Text style={{ color: text, fontWeight: '700' }}>{displayName}</Text>
											{effectiveHandle && !displayName.startsWith('@') ? (
												<Text style={{ color: muted, fontSize: 12 }}>@{effectiveHandle}</Text>
											) : null}
											<Text style={{ color: muted, fontSize: 12 }}>{time}</Text>
											{remaining ? <Text style={{ color: muted, fontSize: 11 }}>{remaining}</Text> : null}
										</View>
								</View>
								{user && item.userId && item.userId !== user.id ? (
									<View style={styles.cardActions}>
										<Pressable
											onPress={async () => {
												try {
													const targetId = item.userId!;
													if (isFriend) {
														await unfollowUserRemote(user.id, targetId);
														await logEvent('user_unfollowed', user.id, { target: item.userId });
													} else if (isIncoming) {
														const req = incomingRequests.find((r) => r.fromId === targetId);
														if (!req?.id || !req?.fromId || !req?.toId) {
															showToast('Unable to accept request. Pull to refresh and try again.', 'warning');
															await refreshFriendRequests();
															return;
														}
														await acceptFriendRequest(req.id, req.fromId, req.toId);
														await logEvent('friend_request_accepted', user.id, { target: targetId });
													} else if (isOutgoing) {
														// no-op for now; keep pending
													} else {
														await sendFriendRequest(user.id, targetId);
														await logEvent('friend_request_sent', user.id, { target: targetId });
													}
													await refreshFriendRequests();
												} catch (e) {
													devLog('follow toggle failed', e);
												}
											}}
											disabled={isOutgoing}
											style={[
												styles.followButton,
												{
													backgroundColor: isFriend || isOutgoing ? background : primary,
													borderColor: isFriend || isOutgoing ? border : primary,
												},
											]}
										>
											<Text style={{ color: isFriend || isOutgoing ? text : '#FFFFFF', fontWeight: '600' }}>
												{isFriend
													? 'Friends'
													: isIncoming
													? 'Accept'
													: isOutgoing
													? 'Requested'
													: 'Add'}
											</Text>
										</Pressable>
										<Pressable
											onPress={async () => {
												if (!user) return;
												try {
													const targetId = item.userId!;
													const isClose = (await getCloseFriends(user.id)).includes(targetId);
													await setCloseFriendRemote(user.id, targetId, !isClose);
													await logEvent('user_closefriend_toggled', user.id, { target: targetId, close: !isClose });
												} catch (e) {
													devLog('toggle close friend failed', e);
												}
											}}
											style={styles.closeButton}
										>
											<Text style={{ color: muted, fontSize: 12 }}>Close</Text>
										</Pressable>
									</View>
								) : null}
							</View>

							<FeedPhoto uri={photo} background={background} muted={muted} pending={item.photoPending} />
							<View style={styles.cardContent}>
							<Pressable
								onPress={() => {
									const placeId = (item as any).spotPlaceId;
									const name = item.spotName || item.spot || '';
									router.push(`/spot?placeId=${encodeURIComponent(placeId || '')}&name=${encodeURIComponent(name)}`);
								}}
							>
								<Text style={[styles.spot, { color: text }]}>{item.spotName || item.spot}</Text>
							</Pressable>
							{groupCount > 1 ? (
								<Text style={{ color: muted, marginTop: 4 }}>{groupCount} check-ins here today</Text>
							) : null}
							{(item.caption || '').length ? <Body style={{ color: text, marginTop: 6 }}>{item.caption}</Body> : (
								<Text style={{ color: muted, marginTop: 6 }}>Tap in and drop a quick vibe note.</Text>
							)}
								<Text style={[styles.date, { color: muted }]}>{time}</Text>
								{remaining ? <Text style={{ color: muted, marginTop: 4 }}>{remaining}</Text> : null}
								<View style={[styles.cardDivider, { backgroundColor: border }]} />
								<View style={styles.cardFooter}>
									<Pressable
										onPress={async () => {
											try {
													const message = `${item.spot}${(item as any).caption ? '\n' + (item as any).caption : ''}\nSee on Perched.`;
												await Share.share({ message });
												await logEvent('checkin_shared', user?.id, { id: item.id });
											} catch {
												// ignore
											}
										}}
										style={({ pressed }) => [
											styles.footerButton,
											pressed ? { opacity: 0.6 } : null,
										]}
									>
										<Text style={{ color: muted }}>Share</Text>
									</Pressable>
									<Pressable
										onPress={async () => {
											try {
												await logEvent('checkin_reported', user?.id, { id: item.id });
												try {
													const { reportCheckinRemote } = await import('@/services/moderation');
													await reportCheckinRemote(item.id, user?.id as any, undefined, item.userId, item.spotName || item.spot);
												} catch {}
												if (user && item.userId) {
													await reportUserRemote(user.id, item.userId, 'reported_from_feed');
												}
												setItems((prev) => prev.filter((p: any) => p.id !== item.id));
											} catch {
												// ignore
											}
										}}
										style={({ pressed }) => [
											styles.footerButton,
											pressed ? { opacity: 0.6 } : null,
										]}
									>
										<Text style={{ color: muted }}>Report</Text>
									</Pressable>
									{user && item.userId && item.userId !== user.id ? (
										<Pressable
											onPress={async () => {
												try {
													if (blockedIds.includes(item.userId)) {
														await unblockUserRemote(user.id, item.userId);
													} else {
														await blockUserRemote(user.id, item.userId);
													}
													await refreshFriendRequests();
													setItems((prev) => prev.filter((p: any) => p.userId !== item.userId));
												} catch {}
											}}
											style={({ pressed }) => [
												styles.footerButton,
												pressed ? { opacity: 0.6 } : null,
											]}
										>
											<Text style={{ color: muted }}>{blockedIds.includes(item.userId) ? 'Unblock' : 'Block'}</Text>
										</Pressable>
									) : null}
								</View>
							</View>
						</View>
					);
				}}
				ListEmptyComponent={
					initialLoading ? (
						<View style={styles.empty}>
							<View style={[styles.skeletonCard, { backgroundColor: border }]} />
							<View style={[styles.skeletonCard, { backgroundColor: border, height: 220 }]} />
							<View style={[styles.skeletonCard, { backgroundColor: border }]} />
						</View>
					) : onlyFriends && friendIdSet.size === 0 ? (
						<View style={styles.empty}>
							<Body style={{ color: text, marginBottom: 8 }}>No friends yet.</Body>
							<Pressable
								onPress={() => router.push('/(tabs)/profile')}
								style={[styles.emptyCta, { backgroundColor: primary }]}
							>
								<Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Find friends</Text>
							</Pressable>
						</View>
					) : (
						<View style={styles.empty}>
							<Body style={{ color: text, marginBottom: 8 }}>No check-ins yet.</Body>
							<Pressable
								onPress={() => router.push('/checkin')}
								style={[styles.emptyCta, { backgroundColor: primary }]}
							>
								<View style={styles.ctaRow}>
									<IconSymbol name="plus" size={18} color="#FFFFFF" />
									<Text style={{ color: '#FFFFFF', fontWeight: '700' }}>New check-in</Text>
								</View>
							</Pressable>
							<Pressable
								onPress={() => router.push('/(tabs)/explore')}
								style={[styles.emptySecondary, { borderColor: border }]}
							>
								<Text style={{ color: text, fontWeight: '700' }}>Explore nearby</Text>
							</Pressable>
						</View>
					)
				}
				onEndReached={loadMore}
				onEndReachedThreshold={0.5}
				refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadLatest} />}
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
		</ThemedView>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, position: 'relative' },
	listContent: { paddingHorizontal: tokens.space.s20, paddingBottom: 140 },
	header: { paddingTop: tokens.space.s20, paddingBottom: tokens.space.s16, paddingHorizontal: tokens.space.s20 },
	heroCard: {
		borderWidth: 1,
		borderRadius: tokens.radius.r24,
		padding: tokens.space.s16,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 10 },
		shadowOpacity: 0.08,
		shadowRadius: 18,
		elevation: 3,
	},
	heroBadge: {
		alignSelf: 'flex-start',
		paddingHorizontal: tokens.space.s10,
		paddingVertical: tokens.space.s6,
		borderRadius: tokens.radius.r20,
		marginBottom: tokens.space.s12,
	},
	quickActions: { flexDirection: 'row', marginTop: tokens.space.s12, ...gapStyle(10) },
	quickButton: {
		paddingHorizontal: tokens.space.s14,
		paddingVertical: tokens.space.s10,
		borderRadius: 999,
		borderWidth: 1,
	},
	filterRow: { marginTop: tokens.space.s16, alignItems: 'center', justifyContent: 'center' },
	card: {
		borderRadius: tokens.radius.r24,
		overflow: 'hidden',
		marginBottom: tokens.space.s16,
		borderWidth: 1,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 10 },
		shadowOpacity: 0.08,
		shadowRadius: 16,
		elevation: 3,
	},
	cardImage: { width: '100%', aspectRatio: 1 },
	cardContent: { padding: tokens.space.s18 },
	cardHeader: { padding: tokens.space.s16, paddingBottom: tokens.space.s10 },
	avatarRow: { flexDirection: 'row', alignItems: 'center' },
	avatar: { width: 46, height: 46, borderRadius: 23 },
	cardActions: { flexDirection: 'row', alignItems: 'center', marginTop: tokens.space.s12 },
	followButton: {
		paddingHorizontal: tokens.space.s12,
		paddingVertical: tokens.space.s8,
		borderRadius: 999,
		borderWidth: 1,
		marginRight: tokens.space.s10,
	},
	closeButton: { padding: tokens.space.s8 },
	spot: { fontSize: tokens.type.body.fontSize, fontWeight: '700' as any },
	date: { fontSize: tokens.type.small.fontSize, opacity: 0.6, marginTop: 8 },
	cardFooter: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 },
	footerButton: { marginLeft: tokens.space.s12 },
	empty: { marginTop: tokens.space.s20, alignItems: 'flex-start' },
	emptyCta: {
		paddingHorizontal: tokens.space.s16,
		paddingVertical: tokens.space.s10,
		borderRadius: 999,
		alignItems: 'center',
	},
	ctaRow: { flexDirection: 'row', alignItems: 'center', ...gapStyle(8) },
	emptySecondary: {
		paddingHorizontal: tokens.space.s16,
		paddingVertical: tokens.space.s10,
		borderRadius: 999,
		borderWidth: 1,
		marginTop: 10,
	},
	cardDivider: {
		height: 1,
		opacity: 0.25,
		marginTop: 10,
		marginBottom: 6,
	},
	softDivider: {
		height: 1,
		marginTop: tokens.space.s12,
		marginBottom: tokens.space.s6,
		opacity: 0.35,
	},
	skeletonCard: {
		width: '100%',
		height: 160,
		borderRadius: tokens.radius.r24,
		marginBottom: tokens.space.s16,
		opacity: 0.35,
	},
	debugCard: {},
	fab: {
		position: 'absolute',
		right: tokens.space.s20,
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

 
