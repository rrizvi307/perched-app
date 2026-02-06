import { ThemedView } from '@/components/themed-view';
import { Atmosphere } from '@/components/ui/atmosphere';
import * as ImagePicker from 'expo-image-picker';
import { copyAsync, documentDirectory, makeDirectoryAsync } from 'expo-file-system/legacy';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SpotImage from '@/components/ui/spot-image';
import PermissionSheet from '@/components/ui/permission-sheet';
import StatusBanner from '@/components/ui/status-banner';
import { Alert, Image, InteractionManager, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
// use ImagePicker for camera-launch to avoid direct Camera component on web
import PlaceSearch from '@/components/place-search';
import { Body, H1, Label } from '@/components/ui/typography';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { tokens } from '@/constants/tokens';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useKeyboardHeight } from '@/hooks/use-keyboard-visible';
import { withAlpha } from '@/utils/colors';
import { gapStyle } from '@/utils/layout';
import { publishCheckin } from '@/services/feedEvents';
import { recordPlaceEventRemote, recordPlaceTagRemote } from '@/services/firebaseClient';
import { getMapsKey, searchPlacesNearby } from '@/services/googleMaps';
import { devLog } from '@/services/logger';
import { logEvent } from '@/services/logEvent';
import { requestForegroundLocation } from '@/services/location';
import { clearCheckinDraft, enqueuePendingCheckin, getCheckinDraft, getLastCheckinAt, getPermissionPrimerSeen, recordPlaceEvent, recordPlaceTag, saveCheckin, saveCheckinDraft, setLastCheckinAt, setPermissionPrimerSeen } from '@/storage/local';
import { syncPendingCheckins } from '@/services/syncPending';
import { useLocalSearchParams, useRootNavigationState, useRouter } from 'expo-router';
import { classifySpotCategory } from '@/services/spotUtils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { updateStatsAfterCheckin } from '@/services/gamification';
import { notifyAchievementUnlocked, scheduleStreakReminder } from '@/services/smartNotifications';
import { trackCheckinForRating, promptRatingAtMoment, RatingTriggers } from '@/services/appRating';

function dmsToDeg(value: any, ref?: string) {
	if (!value) return null;
	let deg = 0;
	if (Array.isArray(value)) {
		const [d, m, s] = value.map((v) => (typeof v === 'number' ? v : v?.numerator ? v.numerator / v.denominator : Number(v)));
		deg = (d || 0) + (m || 0) / 60 + (s || 0) / 3600;
	} else if (typeof value === 'number') {
		deg = value;
	} else if (typeof value === 'string') {
		deg = Number(value) || 0;
	}
	if (ref === 'S' || ref === 'W') deg *= -1;
	return deg || null;
}

function exifToLocation(exif: any) {
	if (!exif) return null;
	const lat = dmsToDeg(exif.GPSLatitude, exif.GPSLatitudeRef);
	const lng = dmsToDeg(exif.GPSLongitude, exif.GPSLongitudeRef);
	if (lat && lng) return { lat, lng };
	return null;
}

const TAG_OPTIONS = ['Quiet', 'Study', 'Social', 'Coworking', 'Bright', 'Spacious', 'Wi-Fi', 'Outlets', 'Seating', 'Late-night'];
const MAX_TAGS = 3;

export default function CheckinScreen() {
	const insets = useSafeAreaInsets();
	const keyboardHeight = useKeyboardHeight();
	const [spot, setSpot] = useState('');
	const [caption, setCaption] = useState('');
	const [image, setImage] = useState<string | null>(null);
	const [captured, setCaptured] = useState(false);
	const [hasPermission, setHasPermission] = useState<boolean | null>(null);
	const [loading, setLoading] = useState(false);
	const [selectedTags, setSelectedTags] = useState<string[]>([]);
	// Utility metrics for spot intel
	const [wifiSpeed, setWifiSpeed] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
	const [noiseLevel, setNoiseLevel] = useState<1 | 2 | 3 | 4 | 5 | null>(null); // 1=silent, 2=quiet, 3=moderate, 4=lively, 5=loud
	const [busyness, setBusyness] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
	const [laptopFriendly, setLaptopFriendly] = useState<boolean | null>(null);
	// no direct Camera ref — using ImagePicker.launchCameraAsync for camera-first flow
	const router = useRouter();
	const rootNavigationState = useRootNavigationState();
	const params = useLocalSearchParams();
	const color = useThemeColor({}, 'text');
	// call theme hooks once to preserve hook order across renders
	const cardBg = useThemeColor({}, 'card');
	const primary = useThemeColor({}, 'primary');
	const surface = useThemeColor({}, 'surface');
	const inputBorder = useThemeColor({}, 'border');
	const inputBg = useThemeColor({}, 'surface');
	const text = useThemeColor({}, 'text');
	const muted = useThemeColor({}, 'muted');
	const success = useThemeColor({}, 'success');
	const backgroundAltLight = withAlpha(surface, 0.92);
	const backgroundAltLibrary = withAlpha(primary, 0.14);
	const { user } = useAuth();
	const { showToast } = useToast();
	const initialLoadRef = useRef(false);
	const isWeb = Platform.OS === 'web';
	const imageQuality = isWeb ? 0.35 : 0.7;
	const stickyBottom = (Platform.OS === 'android' ? keyboardHeight : 0) + Math.max(0, insets.bottom) + 12;
	const stickySpacer = captured ? stickyBottom + 96 : Math.max(24, insets.bottom + 24);
	// require verified email before allowing check-ins
	useEffect(() => {
		if (!rootNavigationState?.key) return;
		if (!user) return;
		if (user && user.email && !user.emailVerified) {
			router.replace('/verify');
		}
	}, [user, rootNavigationState?.key, router]);
	const [placeModal, setPlaceModal] = useState(false);
	const [isEditMode, setIsEditMode] = useState(false);
	const [editId, setEditId] = useState<string | null>(null);
	const [placeInfo, setPlaceInfo] = useState<any | null>(null);
	const [visibility, setVisibility] = useState<'public' | 'friends' | 'close'>('public');
	const [detectedPlace, setDetectedPlace] = useState<any | null>(null);
	const [detectedCandidates, setDetectedCandidates] = useState<any[]>([]);
	const [detecting, setDetecting] = useState(false);
	const [detectionError, setDetectionError] = useState<string | null>(null);
	const [imageExif, setImageExif] = useState<any | null>(null);
	const [postStatus, setPostStatus] = useState<{ message: string; tone: 'info' | 'warning' | 'error' | 'success' } | null>(null);
	const [pendingRemote, setPendingRemote] = useState<any | null>(null);
	const draftLoadedRef = useRef(false);
	const draftEmptyRef = useRef(false);
	const [showCameraPrimer, setShowCameraPrimer] = useState(false);
	const [showLocationPrimer, setShowLocationPrimer] = useState(false);
	const activeRef = useRef(true);
	const lastDetectRef = useRef<string | null>(null);
	const detectionThreshold = 0.2; // km
	const displayPlace = placeInfo || detectedPlace;
	const activePlace = displayPlace;
	const visibilityNote = useMemo(() => {
		if (visibility === 'friends') return 'Only friends can see this check-in.';
		if (visibility === 'close') return 'Only close friends can see the exact spot.';
		return 'Anyone can see this check-in.';
	}, [visibility]);
	const detectionLabel = useMemo(() => {
		if (!detectedPlace) return null;
		const source = detectedPlace.source === 'photo' ? 'Photo GPS' : 'Near you';
		const distance = typeof detectedPlace.distanceKm === 'number' ? ` · ${Math.round(detectedPlace.distanceKm * 1000)}m` : '';
		return `${source}${distance}`;
	}, [detectedPlace]);

	function buildStaticMapUrl(coords?: { lat: number; lng: number }, size = '200x140') {
		try {
			const key = getMapsKey();
			if (!coords || !key) return null;
			const center = `${coords.lat},${coords.lng}`;
			return `https://maps.googleapis.com/maps/api/staticmap?center=${center}&zoom=15&size=${size}&scale=2&markers=color:red%7C${center}&key=${key}`;
		} catch {
			return null;
		}
	}
	const mapPreviewUrl = (() => {
		try {
			const coords = displayPlace?.location;
			const key = getMapsKey();
			if (!coords || !key) return null;
			const center = `${coords.lat},${coords.lng}`;
			return `https://maps.googleapis.com/maps/api/staticmap?center=${center}&zoom=15&size=800x400&scale=2&markers=color:red%7C${center}&key=${key}`;
		} catch {
			return null;
		}
	})();

	useEffect(() => {
		const prefillSpot = typeof params.spot === 'string' ? params.spot : '';
		const editParam = typeof params.editId === 'string' ? params.editId : null;
		const prefillPlaceId = typeof params.placeId === 'string' ? params.placeId : '';
		const prefillLat = typeof params.lat === 'string' ? Number(params.lat) : null;
		const prefillLng = typeof params.lng === 'string' ? Number(params.lng) : null;
		if (prefillSpot && !spot) {
			setSpot(prefillSpot);
		}
		if (prefillPlaceId || (prefillLat && prefillLng)) {
			setPlaceInfo({
				placeId: prefillPlaceId || undefined,
				name: prefillSpot || undefined,
				location: prefillLat && prefillLng ? { lat: prefillLat, lng: prefillLng } : undefined,
			});
		}
		if (editParam) {
			setIsEditMode(true);
			setEditId(editParam);
			// try to load remote/local checkin for editing
				void (async function loadEdit() {
					try {
						const fb = await import('@/services/firebaseClient');
						const check = await fb.getCheckinById(editParam as string);
						if (check) {
							if (check.spotName) setSpot(check.spotName);
						if (check.caption) setCaption(check.caption);
						if (check.photoUrl) { setImage(check.photoUrl); setCaptured(true); }
						if (Array.isArray(check.tags)) setSelectedTags(check.tags);
						if (check.spotLatLng) setPlaceInfo({ placeId: check.spotPlaceId, name: check.spotName, location: check.spotLatLng });
					// Load metrics from edit mode
					if (check.wifiSpeed) setWifiSpeed(check.wifiSpeed);
					if (check.noiseLevel) {
						const convertedNoise = typeof check.noiseLevel === 'string'
							? (check.noiseLevel === 'quiet' ? 2 : check.noiseLevel === 'moderate' ? 3 : 4)
							: check.noiseLevel;
						setNoiseLevel(convertedNoise);
					}
					if (check.busyness) setBusyness(check.busyness);
					if (check.laptopFriendly !== undefined) setLaptopFriendly(check.laptopFriendly);
					}
				} catch {
					try {
						const local = await import('@/storage/local');
						const items = await local.getCheckins();
						const found = (items || []).find((c: any) => String(c.id) === String(editParam));
						if (found) {
							if (found.caption) setCaption(found.caption);
							if (found.photoUrl) { setImage(found.photoUrl); setCaptured(true); }
							if (Array.isArray(found.tags)) setSelectedTags(found.tags);
							if (found.spotLatLng) setPlaceInfo({ placeId: found.spotPlaceId, name: found.spotName, location: found.spotLatLng });
							// Load metrics from edit mode (local fallback)
							if (found.wifiSpeed) setWifiSpeed(found.wifiSpeed);
							if (found.noiseLevel) {
								const convertedNoise = typeof found.noiseLevel === 'string'
									? (found.noiseLevel === 'quiet' ? 2 : found.noiseLevel === 'moderate' ? 3 : 4)
									: found.noiseLevel;
								setNoiseLevel(convertedNoise);
							}
							if (found.busyness) setBusyness(found.busyness);
							if (found.laptopFriendly !== undefined) setLaptopFriendly(found.laptopFriendly);
						}
					} catch {}
					}
				})();
			}
		}, [params, spot]);

	const triggerHaptic = useCallback(async () => {
		if (Platform.OS === 'web') return;
		try {
			const mod = await import('expo-haptics');
			await mod.selectionAsync();
		} catch {}
	}, []);

	const openCamera = useCallback(async () => {
		try {
			const current = await ImagePicker.getCameraPermissionsAsync();
			if (!current.granted) {
				const requested = await ImagePicker.requestCameraPermissionsAsync();
				if (requested.status !== 'granted') {
					setHasPermission(false);
					showToast('Enable camera access in Settings to take a photo.', 'warning');
					return;
				}
				setHasPermission(true);
			}
			const result = await ImagePicker.launchCameraAsync({
				mediaTypes: ImagePicker.MediaTypeOptions.Images,
				allowsEditing: true,
				aspect: [1, 1],
				quality: imageQuality,
				exif: true,
				base64: isWeb,
			});
			if (!result.canceled) {
				const uri = Array.isArray(result.assets) ? result.assets[0].uri : (result as any).uri;
				const base64 = Array.isArray(result.assets) ? result.assets[0].base64 : (result as any).base64;
				const dataUri = isWeb && base64 ? `data:image/jpeg;base64,${base64}` : uri;
				const exif = Array.isArray(result.assets) ? result.assets[0].exif : (result as any).exif;
				setImage(dataUri);
				setImageExif(exif || null);
				setCaptured(true);
				await logEvent('photo_captured', user?.id);
			}
		} catch (e) {
			devLog('openCamera error', e);
			showToast('Unable to open camera. Check permissions and try again.', 'warning');
		}
	}, [imageQuality, isWeb, showToast, user?.id]);
	const pickImage = useCallback(async () => {
		const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
		if (status !== 'granted') return;

		const result = await ImagePicker.launchImageLibraryAsync({
			mediaTypes: ImagePicker.MediaTypeOptions.Images,
			allowsEditing: true,
			aspect: [1, 1],
			quality: imageQuality,
			exif: true,
			base64: isWeb,
		});
		if (!result.canceled) {
			const uri = Array.isArray(result.assets) ? result.assets[0].uri : (result as any).uri;
			const base64 = Array.isArray(result.assets) ? result.assets[0].base64 : (result as any).base64;
			const dataUri = isWeb && base64 ? `data:image/jpeg;base64,${base64}` : uri;
			const exif = Array.isArray(result.assets) ? result.assets[0].exif : (result as any).exif;
			setImage(dataUri);
			setImageExif(exif || null);
			setCaptured(true);
			await logEvent('photo_captured', user?.id);
		}
	}, [imageQuality, isWeb, user?.id]);

	useEffect(() => {
		if (initialLoadRef.current) return;
		initialLoadRef.current = true;
		(async () => {
			try {
				const draft = await getCheckinDraft();
				if (draft && draft.savedAt && Date.now() - draft.savedAt < 24 * 60 * 60 * 1000) {
					if (draft.spot) setSpot(draft.spot);
					if (draft.caption) setCaption(draft.caption);
					if (draft.image) {
						setImage(draft.image);
						setCaptured(true);
					}
					if (Array.isArray(draft.tags)) setSelectedTags(draft.tags);
					if (draft.placeId || draft.location) {
						setPlaceInfo({
							placeId: draft.placeId,
							name: draft.spot || draft.name,
							location: draft.location,
						});
					}
					// Load metrics from draft
					if (typeof draft.wifiSpeed === 'number') setWifiSpeed(draft.wifiSpeed);
					if (draft.noiseLevel) {
						const convertedNoise = typeof draft.noiseLevel === 'string' 
							? (draft.noiseLevel === 'quiet' ? 2 : draft.noiseLevel === 'moderate' ? 3 : 4)
							: draft.noiseLevel;
						setNoiseLevel(convertedNoise);
					}
					if (typeof draft.busyness === 'number') setBusyness(draft.busyness);
					if (draft.laptopFriendly !== undefined) setLaptopFriendly(draft.laptopFriendly);
				}
			} catch {}
			const seen = await getPermissionPrimerSeen('camera');
			if (!seen) {
				setShowCameraPrimer(true);
				return;
			}
			const cam = await ImagePicker.requestCameraPermissionsAsync();
			setHasPermission(cam.status === 'granted');
			await ImagePicker.requestMediaLibraryPermissionsAsync();

			draftLoadedRef.current = true;
		})();
		logEvent('checkin_started', user?.id);
	}, [openCamera, user?.id]);

	useEffect(() => {
		return () => {
			activeRef.current = false;
		};
	}, []);

	useEffect(() => {
		if (!draftLoadedRef.current) return;
		const hasDraftContent = !!(
			(spot && spot.trim().length) ||
			(caption && caption.trim().length) ||
			image ||
			(selectedTags && selectedTags.length) ||
			placeInfo ||
			detectedPlace
		);
		if (!hasDraftContent) {
			if (!draftEmptyRef.current) {
				draftEmptyRef.current = true;
				void clearCheckinDraft();
			}
			return;
		}
		draftEmptyRef.current = false;
		const timer = setTimeout(() => {
			saveCheckinDraft({
				spot,
				caption,
				image,
				tags: selectedTags,
				placeId: placeInfo?.placeId || detectedPlace?.placeId,
				location: placeInfo?.location || detectedPlace?.location,
				wifiSpeed,
				noiseLevel,
				busyness,
				laptopFriendly,
			});
		}, 400);
		return () => clearTimeout(timer);
	}, [spot, caption, image, selectedTags, placeInfo, detectedPlace, wifiSpeed, noiseLevel, busyness, laptopFriendly]);

	function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
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

		const autoDetectPlace = useCallback(async () => {
			if (!image || detecting) return;
			if (lastDetectRef.current === image) return;
			lastDetectRef.current = image;
			setDetecting(true);
			setDetectionError(null);
			setDetectedCandidates([]);
			try {
				const exifLoc = exifToLocation(imageExif);
				const loc = exifLoc || (await requestForegroundLocation());
				// Fast-path demo detection when demo mode is active so auto-detect appears instantly in recordings
				try {
					const isDemo = (typeof window !== 'undefined' && (window as any).__PERCHED_DEMO) || (global as any).__PERCHED_DEMO;
					if (isDemo) {
						const top = { placeId: 'demo-place-agora', name: 'Agora Coffee', location: { lat: 29.7172, lng: -95.4018 }, distanceKm: 0.02 } as any;
						setDetectedPlace({ ...top, source: exifLoc ? 'photo' : 'gps' });
						setDetectedCandidates([top]);
						await logEvent('place_detected', user?.id, { success: true, source: exifLoc ? 'photo' : 'gps', distanceKm: top.distanceKm });
						if (!spot && !placeInfo && typeof top.distanceKm === 'number' && top.distanceKm <= detectionThreshold) {
							setPlaceInfo(top);
							setSpot(top.name);
						}
						setDetecting(false);
						return;
					}
				} catch {}
				if (!loc) {
					const seenLoc = await getPermissionPrimerSeen('location');
					if (!seenLoc) setShowLocationPrimer(true);
					await logEvent('place_detected', user?.id, { success: false, reason: 'no_location' });
					setDetecting(false);
					return;
				}
			const primary = await searchPlacesNearby(loc.lat, loc.lng, 220);
			let results = primary;
			if (results.length < 3) {
				const fallback = await searchPlacesNearby(loc.lat, loc.lng, 800, 'general');
				const seen = new Set(results.map((r) => r.placeId));
				fallback.forEach((r) => {
					if (!seen.has(r.placeId)) results.push(r);
				});
			}
			if (!results.length) {
				await logEvent('place_detected', user?.id, { success: false, reason: 'no_results' });
				setDetecting(false);
				return;
			}
			const ranked = results
				.map((r) => {
					const dist = r.location ? haversineKm(loc, r.location) : Infinity;
					return { ...r, distanceKm: dist };
				})
				.sort((a, b) => (a.distanceKm || 999) - (b.distanceKm || 999));
			const top = ranked[0];
			setDetectedPlace({ ...top, source: exifLoc ? 'photo' : 'gps' });
			setDetectedCandidates(ranked.slice(0, 4));
			await logEvent('place_detected', user?.id, {
				success: true,
				source: exifLoc ? 'photo' : 'gps',
				distanceKm: top.distanceKm,
			});
			if (!spot && !placeInfo && typeof top.distanceKm === 'number' && top.distanceKm <= detectionThreshold) {
				setPlaceInfo(top);
				setSpot(top.name);
			}
		} catch (e: any) {
			const raw = e?.message || '';
			const msg = /api key|not authorized|referer|key/i.test(raw)
				? 'Places API blocked. Check key restrictions.'
				: 'Unable to detect location.';
			setDetectionError(msg);
			await logEvent('place_detected', user?.id, { success: false, reason: 'error' });
			// ignore
		} finally {
			setDetecting(false);
		}
	}, [image, detecting, imageExif, user?.id, spot, placeInfo, detectionThreshold]);

	useEffect(() => {
		if (!image) return;
		let task: any = null;
		const id = setTimeout(() => {
			if (Platform.OS === 'web') {
				void autoDetectPlace();
			} else {
				task = InteractionManager.runAfterInteractions(() => {
					void autoDetectPlace();
				});
			}
		}, 200);
		return () => {
			clearTimeout(id);
			try {
				task?.cancel?.();
			} catch {}
		};
	}, [image, imageExif, autoDetectPlace]);

	function toggleTag(tag: string) {
		setSelectedTags((prev) => {
			if (prev.includes(tag)) return prev.filter((t) => t !== tag);
			if (prev.length >= MAX_TAGS) {
				showToast(`Pick up to ${MAX_TAGS} tags.`, 'info');
				return prev;
			}
			return [...prev, tag];
		});
	}

	function resetDraftState() {
		setSpot('');
		setCaption('');
		setImage(null);
		setImageExif(null);
		setCaptured(false);
		setSelectedTags([]);
		setPlaceInfo(null);
		setDetectedPlace(null);
		setDetectedCandidates([]);
		setDetecting(false);
		setDetectionError(null);
		setPostStatus(null);
		setPendingRemote(null);
		setPlaceModal(false);
		setVisibility('public');
		setIsEditMode(false);
		setEditId(null);
		lastDetectRef.current = null;
		draftEmptyRef.current = false;
	}

		async function handlePost() {
			if (!image) return;
			if (!user?.id) {
				showToast('Please sign in to post a check-in.', 'warning');
				return;
			}
			if (user.email && !user.emailVerified) {
				showToast('Verify your email before posting.', 'warning');
				router.replace('/verify');
				return;
			}
			if (!spot || !activePlace?.placeId) {
				setPostStatus({ message: 'Please select a spot from lookup.', tone: 'warning' });
				return;
			}
			// basic anti-spam: require short caption or at least one tag
			const trimmed = String(caption || '').trim();
			if (trimmed.length < 3 && (!selectedTags || selectedTags.length === 0)) {
				setPostStatus({ message: 'Add a short caption or select a tag.', tone: 'warning' });
				return;
			}
		// Gentle encouragement for metrics (non-blocking)
		const metricsProvided = [wifiSpeed, noiseLevel, busyness, laptopFriendly !== null].filter(Boolean).length;
		if (metricsProvided === 0) {
			showToast('💡 Consider adding Spot Intel to help others!', 'info');
			// Still allow posting - don't block
		}
		const last = await getLastCheckinAt();
		const now = Date.now();
			// rate-limit public posts: 10 minutes for public posts, 5 for others
			const MIN_GAP_PUBLIC = 10 * 60 * 1000;
			const MIN_GAP_OTHER = 5 * 60 * 1000;
			const MIN_GAP = visibility === 'public' ? MIN_GAP_PUBLIC : MIN_GAP_OTHER;
		if (last && now - last < MIN_GAP) {
			const mins = Math.ceil((MIN_GAP - (now - last)) / 60000);
			Alert.alert('Slow down', `You can post another check-in in about ${mins} minute${mins === 1 ? '' : 's'}.`);
			return;
		}
			setLoading(true);
			try {
				const uid = user.id;
				const clientId = `client-${Date.now()}`;
				// If editing, perform an update flow
				if (isEditMode && editId) {
					try {
						const fb = await import('@/services/firebaseClient');
						const updates: any = {
							spotName: spot,
							spotPlaceId: activePlace?.placeId,
							spotLatLng: activePlace?.location,
							caption,
							tags: selectedTags,
							visibility,
							// Utility metrics
							...(wifiSpeed && { wifiSpeed }),
							...(noiseLevel && { noiseLevel }),
							...(busyness && { busyness }),
							...(laptopFriendly !== null && { laptopFriendly }),
						};
						await fb.updateCheckinRemote(editId, updates);
						// update local copy
						const local = await import('@/storage/local');
						await local.updateCheckinLocalById(editId, updates as any);
						publishCheckin({ id: editId, ...updates });
						showToast('Check-in updated.', 'success');
						try {
							await clearCheckinDraft();
						} catch {}
						resetDraftState();
						router.replace('/(tabs)/feed');
						return;
					} catch (e) {
						devLog('edit update failed', e);
						setPostStatus({ message: 'Unable to update. Try again.', tone: 'error' });
						setLoading(false);
						return;
					}
				}
				let persistedImage = image as string;
				try {
					if (persistedImage && !persistedImage.startsWith('http') && !persistedImage.startsWith('data:') && documentDirectory) {
						const dir = `${documentDirectory}perched-photos`;
						try {
							await makeDirectoryAsync(dir, { intermediates: true });
						} catch {}
					const target = `${dir}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
					await copyAsync({ from: persistedImage, to: target });
					persistedImage = target;
				}
			} catch {}
			const displayName = user?.name || user?.handle || (user?.email ? user.email.split('@')[0] : null) || 'Someone';
			const localPayload = {
				spot,
				spotName: spot,
				spotPlaceId: activePlace?.placeId,
				spotLatLng: activePlace?.location,
				image: persistedImage,
				photoUrl: persistedImage,
				caption,
				tags: selectedTags,
				userId: uid,
				userName: displayName,
				userHandle: user?.handle,
				userPhotoUrl: user?.photoUrl,
				city: user?.city,
				campus: user?.campus,
				visibility,
				clientId,
				// Utility metrics
				...(wifiSpeed && { wifiSpeed }),
				...(noiseLevel && { noiseLevel }),
				...(busyness && { busyness }),
				...(laptopFriendly !== null && { laptopFriendly }),
			} as any;
			const pendingPayload = {
				userId: uid,
				userName: displayName,
				userHandle: user?.handle,
				userPhotoUrl: user?.photoUrl,
				spotName: spot,
				spotPlaceId: activePlace?.placeId,
				spotLatLng: activePlace?.location,
				caption: caption || '',
				tags: selectedTags,
				photoUrl: persistedImage,
				campusOrCity: user?.campusOrCity || user?.city,
				city: user?.city,
				campus: user?.campus,
				visibility,
				clientId,
				// Utility metrics
				...(wifiSpeed && { wifiSpeed }),
				...(noiseLevel && { noiseLevel }),
				...(busyness && { busyness }),
				...(laptopFriendly !== null && { laptopFriendly }),
			};
			try {
				const savedLocal = await saveCheckin(localPayload as any);
				publishCheckin(savedLocal);
				await setLastCheckinAt(Date.now());

				// Track gamification stats
				if (activePlace?.placeId) {
					try {
						const stats = await updateStatsAfterCheckin(activePlace.placeId, Date.now());

						// Track for rating prompt
						await trackCheckinForRating();

						// Check for streak milestones and notify
						if (stats.streakDays === 3 || stats.streakDays === 7 || stats.streakDays === 30 || stats.streakDays === 100) {
							await notifyAchievementUnlocked(`${stats.streakDays} Day Streak`, '🔥');
							// Perfect moment to ask for rating - user just hit milestone!
							setTimeout(() => {
								void promptRatingAtMoment(RatingTriggers.MILESTONE_REACHED);
							}, 2000); // Wait 2s after notification
						}

						// Schedule next streak reminder
						await scheduleStreakReminder();

						// Prompt for rating after 10th check-in (milestone)
						if (stats.totalCheckins === 10 || stats.totalCheckins === 25) {
							setTimeout(() => {
								void promptRatingAtMoment(RatingTriggers.MILESTONE_REACHED);
							}, 2000);
						}
					} catch (error) {
						console.error('Failed to update gamification stats:', error);
					}
				}
			} catch {}
			setPendingRemote(pendingPayload);
			await enqueuePendingCheckin(pendingPayload);
				showToast('Check-in queued. Posting in background.', 'success');
				const category = classifySpotCategory(spot);
				const eventPayload = {
					event: 'checkin' as const,
					ts: Date.now(),
					userId: user?.id,
					placeId: activePlace?.placeId || null,
					name: spot,
					category,
				};
				recordPlaceEvent(eventPayload);
				void recordPlaceEventRemote(eventPayload);
			if (selectedTags.length) {
				selectedTags.forEach((tag) => {
					recordPlaceTag(activePlace?.placeId || null, spot, tag, 1);
					void recordPlaceTagRemote({ placeId: activePlace?.placeId || null, name: spot, tag, delta: 1 });
				});
			}
			const runSync = async () => {
				try {
					const res = await syncPendingCheckins(1);
					if (res.synced > 0) {
						if (activeRef.current) setPendingRemote(null);
						showToast('Check-in posted.', 'success');
					} else {
						showToast('Upload is taking longer than usual. Keep this tab open for a moment.', 'warning');
					}
				} catch {
					showToast('Upload failed. Check your connection and try Sync now from the feed.', 'warning');
				}
			};
			setTimeout(() => {
				void runSync();
			}, 0);
			setLoading(false);
			try {
				await clearCheckinDraft();
			} catch {}
			resetDraftState();
			router.replace('/(tabs)/feed');
		} catch (e) {
			setLoading(false);
			devLog('handlePost error', e);
			setPostStatus({ message: 'Unable to post right now. Check your connection and try again.', tone: 'error' });
			showToast('Unable to post right now.', 'error');
		}
	}

	async function retryRemotePost() {
		if (!pendingRemote) return;
		setLoading(true);
		try {
			const res = await syncPendingCheckins(1);
			if (res.synced > 0) {
				setPendingRemote(null);
				setPostStatus({ message: 'Posted successfully.', tone: 'success' });
				showToast('Check-in synced.', 'success');
			} else {
				setPostStatus({ message: 'Still unable to post. Try again soon.', tone: 'warning' });
			}
		} catch (err) {
			devLog('retryRemotePost error', err);
			setPostStatus({ message: 'Still unable to post. Try again soon.', tone: 'warning' });
		} finally {
			setLoading(false);
		}
	}

	if (hasPermission === false) {
	return (
			<ThemedView style={styles.container}>
				<H1 style={{ color }}>Camera access required</H1>
				<Body style={{ color, marginTop: 12 }}>Enable camera permissions in system settings.</Body>
			</ThemedView>
		);
	}

	return (
		<ThemedView style={styles.container}>
			{Platform.OS !== 'web' ? (
				<>
					<PermissionSheet
						visible={showCameraPrimer}
						title="Camera access"
						body="Perched uses your camera so you can tap in with a photo."
						bullets={['We only use photos you choose', 'No background recording']}
						confirmLabel="Enable camera"
						onConfirm={async () => {
							setShowCameraPrimer(false);
							await setPermissionPrimerSeen('camera', true);
							const cam = await ImagePicker.requestCameraPermissionsAsync();
							setHasPermission(cam.status === 'granted');
							await ImagePicker.requestMediaLibraryPermissionsAsync();
							if (cam.status === 'granted' && Platform.OS !== 'web') {
								await openCamera();
							}
						}}
						onCancel={() => setShowCameraPrimer(false)}
					/>
					<PermissionSheet
						visible={showLocationPrimer}
						title="Location access"
						body="Location helps confirm your spot and power nearby pins."
						bullets={['We only store your spot when you check in', 'Exact location only for friends']}
						confirmLabel="Enable location"
						onConfirm={async () => {
							setShowLocationPrimer(false);
							await setPermissionPrimerSeen('location', true);
							await autoDetectPlace();
						}}
						onCancel={() => setShowLocationPrimer(false)}
					/>
				</>
			) : null}
			<Atmosphere />
			<PlaceSearch
				visible={placeModal}
				onClose={() => setPlaceModal(false)}
				onSelect={(p) => {
					setPlaceInfo(p);
					setDetectedPlace(null);
					setDetectedCandidates([]);
					if (p?.name) setSpot(p.name);
					setPostStatus(null);
				}}
			/>
					<KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0} style={{ flex: 1 }}>
						<View style={styles.scrollContainer}>
							<ScrollView
								style={{ flex: 1 }}
								contentContainerStyle={[styles.scrollContent, { paddingBottom: stickySpacer }]}
								keyboardShouldPersistTaps="handled"
								keyboardDismissMode="interactive"
								automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
								showsVerticalScrollIndicator={false}
							>
								<View style={[styles.topBar, { marginTop: Math.max(0, insets.top - 10) }]}>
									<Pressable
										onPress={() => router.back()}
										accessibilityLabel="Close"
										style={({ pressed }) => [styles.topBarButton, pressed ? { opacity: 0.75 } : null]}
									>
										<IconSymbol name="xmark" size={18} color={muted} />
									</Pressable>
								</View>
					<Label style={{ color: muted, marginBottom: 8 }}>New check-in</Label>
					<H1 style={{ color }}>Share your spot.</H1>
					{!captured ? <Text style={{ color: muted, marginTop: 4 }}>Your photo is the check-in. Keep it real.</Text> : null}

				<View style={{ height: 12 }} />

				<View style={styles.stepRow}>
					<View style={[styles.stepChip, { borderColor: inputBorder, backgroundColor: captured ? inputBg : primary }]}>
						<Text style={{ color: captured ? text : '#FFFFFF', fontWeight: '700' }}>1 Photo</Text>
					</View>
					<View style={[styles.stepChip, { borderColor: inputBorder, backgroundColor: spot ? primary : inputBg }]}>
						<Text style={{ color: spot ? '#FFFFFF' : text, fontWeight: '700' }}>2 Spot</Text>
					</View>
					<View style={[styles.stepChip, { borderColor: inputBorder, backgroundColor: caption.trim().length ? primary : inputBg }]}>
						<Text style={{ color: caption.trim().length ? '#FFFFFF' : text, fontWeight: '700' }}>3 Share</Text>
					</View>
				</View>
				<View style={{ height: 10 }} />

				{!captured ? (
					<View style={[styles.cameraContainer, { backgroundColor: cardBg, borderColor: inputBorder }]}>
						<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
							<Body style={{ color, marginBottom: 6 }}>Ready to tap in</Body>
							<Body style={{ color: muted }}>Choose how you want to add a photo.</Body>
							<View style={{ height: 18 }} />
							<View style={styles.mediaRow}>
								<Pressable
									style={[styles.mediaButton, { backgroundColor: backgroundAltLight, borderColor: inputBorder }]}
									onPress={() => {
										void triggerHaptic();
										void openCamera();
									}}
								>
									<IconSymbol name="camera.fill" size={18} color={text} />
									<Body style={{ marginBottom: 0, color: text }}>Camera</Body>
								</Pressable>
								<Pressable
									style={[styles.mediaButton, { backgroundColor: backgroundAltLibrary, borderColor: inputBorder }]}
									onPress={() => {
										void triggerHaptic();
										void pickImage();
									}}
								>
									<IconSymbol name="photo.fill" size={18} color={text} />
									<Body style={{ marginBottom: 0, color: text }}>Library</Body>
								</Pressable>
							</View>
						</View>
					</View>
				) : (
					<View>
						<Image source={{ uri: image as string }} style={[styles.preview, { backgroundColor: inputBorder }]} />
						<Pressable
							onPress={() => setPlaceModal(true)}
							style={[styles.input, styles.selectInput, { borderColor: inputBorder, backgroundColor: inputBg }]}
						>
							<Text style={{ color: spot ? text : muted, fontWeight: spot ? '600' : '400' }}>
								{spot || 'Spot name'}
							</Text>
							<Text style={{ color: primary, fontWeight: '600' }}>{spot ? 'Change' : 'Lookup'}</Text>
						</Pressable>
						{!spot ? (
							<Text style={{ color: muted, marginBottom: 6 }}>Choose a spot from lookup to continue.</Text>
						) : (
							<Text style={{ color: muted, marginBottom: 6 }}>Tip: add a short note so friends know your vibe.</Text>
						)}
						<TextInput
							placeholder="Add a short caption (optional)"
							placeholderTextColor={muted}
							value={caption}
							onChangeText={setCaption}
							style={[styles.input, { borderColor: inputBorder, backgroundColor: inputBg, color: text }]}
							maxLength={140}
						/>
						<Text style={{ color: muted, marginBottom: 8 }}>{caption.length}/140</Text>
						<Text style={{ color: muted, fontWeight: '600', marginBottom: 6 }}>Tags</Text>
						<View style={styles.tagRow}>
							{TAG_OPTIONS.map((tag) => {
								const active = selectedTags.includes(tag);
								return (
									<Pressable
										key={tag}
										onPress={() => toggleTag(tag)}
										style={({ pressed }) => [
											styles.tagChip,
											{ borderColor: inputBorder, backgroundColor: active ? primary : pressed ? withAlpha(primary, 0.12) : 'transparent' },
										]}
									>
										<Text style={{ color: active ? '#FFFFFF' : text, fontWeight: '600' }}>{tag}</Text>
									</Pressable>
								);
							})}
						</View>
						<Text style={{ color: muted, marginBottom: 8 }}>Pick up to {MAX_TAGS} tags to describe the vibe.</Text>


						{/* Calculate metrics completion */}
						{(() => {
							const metricsCompleted = [
								wifiSpeed !== null,
								noiseLevel !== null,
								busyness !== null,
								laptopFriendly !== null,
							].filter(Boolean).length;
							const metricsTotal = 4;
							const metricsPercentage = Math.round((metricsCompleted / metricsTotal) * 100);

							return (
								<>

						{/* Spot Intel Section - Utility Metrics */}
						<View style={{ marginTop: 16, marginBottom: 8 }}>
						<View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
							<Text style={{ color: text, fontWeight: '700', fontSize: 16 }}>
								Spot Intel (optional)
							</Text>
							{metricsCompleted > 0 && (
								<View style={{
									marginLeft: 8,
									paddingHorizontal: 8,
									paddingVertical: 2,
									borderRadius: 12,
									backgroundColor: metricsPercentage === 100
										? withAlpha(success, 0.15)
										: withAlpha(primary, 0.15)
								}}>
									<Text style={{
										color: metricsPercentage === 100 ? success : primary,
										fontSize: 11,
										fontWeight: '700'
									}}>
										{metricsCompleted}/{metricsTotal} ✓
									</Text>
								</View>
							)}
						</View>
						<Text style={{ color: muted, marginBottom: 12 }}>
							{metricsCompleted === 0
								? 'Help others find the perfect spot by sharing a few quick details'
								: metricsPercentage === 100
								? '🎉 Thanks for helping the community!'
								: `Great start! ${metricsTotal - metricsCompleted} more to go`}
						</Text>

							{/* WiFi Speed */}
							<View style={{ marginBottom: 16 }}>
								<Text style={{ color: muted, fontWeight: '600', marginBottom: 8 }}>WiFi Speed</Text>
								<View style={{ flexDirection: 'row', gap: 8 }}>
									{([1, 2, 3, 4, 5] as const).map((level) => (
										<Pressable
											key={`wifi-${level}`}
											onPress={() => setWifiSpeed(wifiSpeed === level ? null : level)}
											style={[
												styles.metricChip,
												{
													borderColor: inputBorder,
													backgroundColor: wifiSpeed === level ? primary : 'transparent',
													minWidth: 50,
												},
											]}
										>
											<Text style={{ color: wifiSpeed === level ? '#FFFFFF' : text, fontWeight: '600', textAlign: 'center' }}>
												{level === 1 ? '😩' : level === 2 ? '😕' : level === 3 ? '😐' : level === 4 ? '😊' : '🚀'}
											</Text>
										</Pressable>
									))}
								</View>
								<Text style={{ color: muted, fontSize: 12, marginTop: 4 }}>
									{wifiSpeed === 1 ? 'Unusable' : wifiSpeed === 2 ? 'Slow' : wifiSpeed === 3 ? 'OK' : wifiSpeed === 4 ? 'Fast' : wifiSpeed === 5 ? 'Blazing' : 'Tap to rate WiFi'}
								</Text>
							</View>

						{/* Noise Level */}
						<View style={{ marginBottom: 16 }}>
							<Text style={{ color: muted, fontWeight: '600', marginBottom: 8 }}>Noise Level</Text>
							<View style={{ flexDirection: 'row', gap: 8 }}>
								{([1, 2, 3, 4, 5] as const).map((level) => (
									<Pressable
										key={`noise-${level}`}
										onPress={() => setNoiseLevel(noiseLevel === level ? null : level)}
										style={[
											styles.metricChip,
											{
												borderColor: inputBorder,
												backgroundColor: noiseLevel === level ? primary : 'transparent',
												minWidth: 50,
											},
										]}
									>
										<Text style={{ color: noiseLevel === level ? '#FFFFFF' : text, fontWeight: '600', textAlign: 'center' }}>
											{level === 1 ? '🔇' : level === 2 ? '🤫' : level === 3 ? '💬' : level === 4 ? '🎉' : '📢'}
										</Text>
									</Pressable>
								))}
							</View>
							<Text style={{ color: muted, fontSize: 12, marginTop: 4 }}>
								{noiseLevel === 1 ? 'Silent' : noiseLevel === 2 ? 'Quiet' : noiseLevel === 3 ? 'Moderate' : noiseLevel === 4 ? 'Lively' : noiseLevel === 5 ? 'Loud' : 'Tap to rate noise'}
							</Text>
						</View>

							{/* Busyness */}
							<View style={{ marginBottom: 16 }}>
								<Text style={{ color: muted, fontWeight: '600', marginBottom: 8 }}>How Busy?</Text>
								<View style={{ flexDirection: 'row', gap: 8 }}>
									{([1, 2, 3, 4, 5] as const).map((level) => (
										<Pressable
											key={`busy-${level}`}
											onPress={() => setBusyness(busyness === level ? null : level)}
											style={[
												styles.metricChip,
												{
													borderColor: inputBorder,
													backgroundColor: busyness === level ? primary : 'transparent',
													minWidth: 50,
												},
											]}
										>
											<Text style={{ color: busyness === level ? '#FFFFFF' : text, fontWeight: '600', textAlign: 'center' }}>
												{level === 1 ? '👻' : level === 2 ? '🧘' : level === 3 ? '👥' : level === 4 ? '😅' : '🔥'}
											</Text>
										</Pressable>
									))}
								</View>
								<Text style={{ color: muted, fontSize: 12, marginTop: 4 }}>
									{busyness === 1 ? 'Empty' : busyness === 2 ? 'Quiet' : busyness === 3 ? 'Some people' : busyness === 4 ? 'Busy' : busyness === 5 ? 'Packed!' : 'Tap to rate how crowded'}
								</Text>
							</View>

							{/* Laptop Friendly */}
							<View style={{ marginBottom: 8 }}>
								<Text style={{ color: muted, fontWeight: '600', marginBottom: 8 }}>Good for Laptop Work?</Text>
								<View style={{ flexDirection: 'row', gap: 8 }}>
									<Pressable
										onPress={() => setLaptopFriendly(laptopFriendly === true ? null : true)}
										style={[
											styles.metricChip,
											{
												borderColor: inputBorder,
												backgroundColor: laptopFriendly === true ? primary : 'transparent',
												paddingHorizontal: 20,
											},
										]}
									>
										<Text style={{ color: laptopFriendly === true ? '#FFFFFF' : text, fontWeight: '600' }}>
											💻 Yes
										</Text>
									</Pressable>
									<Pressable
										onPress={() => setLaptopFriendly(laptopFriendly === false ? null : false)}
										style={[
											styles.metricChip,
											{
												borderColor: inputBorder,
												backgroundColor: laptopFriendly === false ? primary : 'transparent',
												paddingHorizontal: 20,
											},
										]}
									>
										<Text style={{ color: laptopFriendly === false ? '#FFFFFF' : text, fontWeight: '600' }}>
											☕ Not really
										</Text>
									</Pressable>
								</View>
							</View>
						</View>
								</>
							);
						})()}

						<View style={{ height: 8 }} />
						{spot ? (
							<Pressable
								onPress={() => {
									setSpot('');
									setPlaceInfo(null);
								}}
								style={{ marginBottom: 8, alignSelf: 'flex-start' }}
							>
								<Body style={{ color: muted }}>Clear spot</Body>
							</Pressable>
						) : null}
						{detectedPlace && (!placeInfo || placeInfo?.placeId === detectedPlace?.placeId) ? (
							<View style={[styles.detectedRow, { borderColor: inputBorder, backgroundColor: inputBg }]}>
								<View style={{ flex: 1, paddingRight: 10 }}>
									<Text style={{ color: text, fontWeight: '600' }}>
										Detected: {detectedPlace.name}
									</Text>
									{detectionLabel ? <Text style={{ color: muted, marginTop: 4 }}>{detectionLabel}</Text> : null}
								</View>
								<Pressable
									onPress={() => {
										setPlaceInfo(detectedPlace);
										if (!spot) setSpot(detectedPlace.name);
									}}
									disabled={placeInfo?.placeId === detectedPlace?.placeId}
									style={[
										styles.detectedChip,
										{ backgroundColor: placeInfo?.placeId === detectedPlace?.placeId ? inputBorder : primary },
									]}
								>
									<Text style={{ color: placeInfo?.placeId === detectedPlace?.placeId ? text : '#FFFFFF', fontWeight: '700' }}>
										{placeInfo?.placeId === detectedPlace?.placeId ? 'Selected' : 'Use'}
									</Text>
								</Pressable>
							</View>
						) : detecting ? (
							<Text style={{ color: muted }}>Detecting location…</Text>
						) : detectionError ? (
							<Text style={{ color: muted }}>{detectionError}</Text>
						) : null}
						{detectedCandidates.length && !placeInfo ? (
							<View style={{ marginBottom: 8 }}>
								<Text style={{ color: muted, marginBottom: 6 }}>Suggestions</Text>
								{detectedCandidates.map((c: any) => (
									<Pressable
										key={`cand-${c.placeId}`}
										onPress={() => {
											setPlaceInfo(c);
											if (!spot) setSpot(c.name);
										}}
										style={[styles.suggestionRow, { borderColor: inputBorder, backgroundColor: inputBg }]}
									>
										{(() => {
											const thumb = c.location ? buildStaticMapUrl(c.location) : null;
											if (!thumb) return null;
											return <SpotImage source={{ uri: thumb }} style={styles.suggestionThumb} />;
										})()}
										<View style={{ flex: 1 }}>
											<Text style={{ color: text, fontWeight: '600' }}>{c.name}</Text>
											{typeof c.distanceKm === 'number' ? (
												<Text style={{ color: muted }}>
													Why this? Closest match{` · ${Math.round(c.distanceKm * 1000)}m`}
												</Text>
											) : (
												<Text style={{ color: muted }}>Why this? Nearby place</Text>
											)}
										</View>
										<Text style={{ color: primary, fontWeight: '700' }}>Use</Text>
									</Pressable>
								))}
							</View>
						) : null}
						{mapPreviewUrl ? (
							<SpotImage source={{ uri: mapPreviewUrl }} style={styles.mapPreview} />
						) : displayPlace?.location ? (
							<View style={[styles.mapPlaceholder, { borderColor: inputBorder }]}>
								<Body style={{ color: muted, marginBottom: 0 }}>Location pinned</Body>
							</View>
						) : null}

						<View style={{ height: 8 }} />
						<View style={[{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }, gapStyle(10)]}>
							<Pressable onPress={() => setVisibility('public')} style={[styles.visibilityChip, { borderColor: inputBorder, backgroundColor: visibility === 'public' ? primary : 'transparent' }]}>
								<Body style={[styles.visibilityText, { color: visibility === 'public' ? '#FFFFFF' : text }]}>Public</Body>
							</Pressable>
							<Pressable onPress={() => setVisibility('friends')} style={[styles.visibilityChip, { borderColor: inputBorder, backgroundColor: visibility === 'friends' ? primary : 'transparent' }]}>
								<Body style={[styles.visibilityText, { color: visibility === 'friends' ? '#FFFFFF' : text }]}>Friends</Body>
							</Pressable>
							<Pressable onPress={() => setVisibility('close')} style={[styles.visibilityChip, { borderColor: inputBorder, backgroundColor: visibility === 'close' ? primary : 'transparent' }]}>
								<Body style={[styles.visibilityText, { color: visibility === 'close' ? '#FFFFFF' : text }]}>Close</Body>
							</Pressable>
						</View>
						<Text style={{ color: muted, marginTop: 6 }}>{visibilityNote}</Text>

						<View style={{ height: 12 }} />
						{postStatus ? (
							<StatusBanner
								message={postStatus.message}
								tone={postStatus.tone}
								actionLabel={pendingRemote ? 'Retry' : undefined}
								onAction={pendingRemote ? retryRemotePost : undefined}
							/>
						) : null}
						<View style={{ height: 8 }} />
						<Pressable onPress={() => { setImage(null); setCaptured(false); }}>
							<Body style={{ color: text }}>Retake</Body>
						</Pressable>
					</View>
					)}
					</ScrollView>
					{captured ? (
						<View
							style={[
								styles.stickyBar,
								{
									borderColor: inputBorder,
									backgroundColor: cardBg,
									position: 'absolute',
									left: 0,
									right: 0,
									bottom: stickyBottom,
								},
							]}
						>
							<Pressable
								style={({ pressed }) => [
									styles.saveButton,
									{ backgroundColor: primary },
									loading ? { opacity: 0.6 } : null,
									pressed ? { opacity: 0.85 } : null,
								]}
								onPress={handlePost}
								disabled={loading || !spot || !activePlace?.placeId}
							>
								<View style={styles.ctaRow}>
									{!loading && spot && activePlace?.placeId ? (
										<IconSymbol name="plus" size={18} color="#FFFFFF" />
									) : null}
									<Text style={[styles.saveButtonText, { color: '#FFFFFF' }]}>
										{loading ? 'Posting...' : !spot || !activePlace?.placeId ? 'Select a spot' : 'Post check-in'}
									</Text>
								</View>
							</Pressable>
						</View>
					) : null}
					</View>
				</KeyboardAvoidingView>
		</ThemedView>
	);
}

	const styles = StyleSheet.create({
	container: {
		flex: 1,
		padding: 20,
		position: 'relative',
	},
	scrollContent: {
		flexGrow: 1,
	},
		scrollContainer: {
			flex: 1,
			position: 'relative',
		},
		topBar: {
			width: '100%',
			flexDirection: 'row',
			justifyContent: 'flex-end',
			marginBottom: 6,
		},
		topBarButton: {
			width: 40,
			height: 40,
			borderRadius: 20,
			alignItems: 'center',
			justifyContent: 'center',
		},
	stepRow: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		...gapStyle(8),
	},
	stepChip: {
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 999,
		borderWidth: 1,
	},
	input: {
		borderWidth: 1,
		padding: 12,
		borderRadius: 14,
		marginBottom: 12,
		fontSize: tokens.type.body.fontSize,
	},
	selectInput: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	cameraContainer: {
		height: 420,
		borderRadius: 24,
		overflow: 'hidden',
		marginBottom: 12,
		borderWidth: 1,
		paddingHorizontal: 18,
	},
	camera: {
		flex: 1,
		width: '100%',
		height: '100%',
	},
	cameraActions: {
		position: 'absolute',
		bottom: 12,
		left: 0,
		right: 0,
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingHorizontal: 18,
	},
	mediaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', ...gapStyle(12) },
	mediaButton: {
		minWidth: 120,
		paddingHorizontal: 16,
		paddingVertical: 12,
		borderRadius: 14,
		borderWidth: 1,
		alignItems: 'center',
		justifyContent: 'center',
	},
	previewContainer: {
		alignItems: 'center',
		marginBottom: 12,
	},
	preview: {
		width: '100%',
		aspectRatio: 1,
		borderRadius: 20,
		marginBottom: 8,
		resizeMode: 'cover',
	},
	mapPreview: {
		width: '100%',
		height: 160,
		borderRadius: 16,
		marginBottom: 10,
	},
	mapPlaceholder: {
		borderWidth: 1,
		borderRadius: 14,
		paddingVertical: 12,
		paddingHorizontal: 14,
		marginBottom: 10,
		alignItems: 'center',
	},
	detectedRow: {
		borderWidth: 1,
		borderRadius: 14,
		paddingVertical: 10,
		paddingHorizontal: 12,
		marginBottom: 10,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	detectedChip: {
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 999,
	},
	suggestionRow: {
		borderWidth: 1,
		borderRadius: 12,
		paddingVertical: 10,
		paddingHorizontal: 12,
		marginBottom: 8,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		...gapStyle(10),
	},
	suggestionThumb: {
		width: 70,
		height: 70,
		borderRadius: 10,
	},
	tagRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 },
	tagChip: {
		paddingHorizontal: tokens.space.s12,
		paddingVertical: tokens.space.s8,
		borderRadius: 999,
		borderWidth: 1,
		marginRight: tokens.space.s8,
		marginBottom: tokens.space.s8,
	},
	metricChip: {
		paddingHorizontal: tokens.space.s12,
		paddingVertical: tokens.space.s10,
		borderRadius: 12,
		borderWidth: 1,
		alignItems: 'center',
		justifyContent: 'center',
	},
	photoButton: {
		height: 52,
		borderRadius: 12,
		borderWidth: 1,
		// borderColor set dynamically
		alignItems: 'center',
		justifyContent: 'center',
		marginBottom: 12,
	},
	removePhoto: {
		paddingVertical: 8,
		paddingHorizontal: 12,
		borderRadius: 8,
		borderWidth: 1,
		// dynamic
	},
	saveButton: {
		height: 54,
		borderRadius: 18,
		alignItems: 'center',
		justifyContent: 'center',
	},
	saveButtonText: {
		fontWeight: '600',
		fontSize: tokens.type.body.fontSize,
	},
	ctaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', ...gapStyle(8) },
	visibilityChip: {
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 999,
		borderWidth: 1,
	},
	visibilityText: {
		marginBottom: 0,
		fontWeight: '600',
	},
	stickyBar: {
		padding: 12,
		borderRadius: 18,
		borderWidth: 1,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 10 },
		shadowOpacity: 0.12,
		shadowRadius: 16,
		elevation: 6,
	},
});
