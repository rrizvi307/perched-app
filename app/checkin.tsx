import { ThemedView } from '@/components/themed-view';
import { Atmosphere } from '@/components/ui/atmosphere';
import CelebrationOverlay from '@/components/ui/CelebrationOverlay';
import * as ImagePicker from 'expo-image-picker';
import { copyAsync, documentDirectory, makeDirectoryAsync } from 'expo-file-system/legacy';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SpotImage from '@/components/ui/spot-image';
import PermissionSheet from '@/components/ui/permission-sheet';
import StatusBanner from '@/components/ui/status-banner';
import { Image, InteractionManager, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
import { updateStatsAfterCheckin, getUserStats } from '@/services/gamification';
import { notifyAchievementUnlocked, scheduleStreakReminder } from '@/services/smartNotifications';
import { safeImpact, safeNotification } from '@/utils/haptics';
import { trackCheckinForRating, promptRatingAtMoment, RatingTriggers } from '@/services/appRating';
import { toNumericNoiseLevel } from '@/services/checkinUtils';
import { DISCOVERY_INTENT_OPTIONS, sanitizeDiscoveryIntents, type DiscoveryIntent } from '@/services/discoveryIntents';

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
	return Number.isFinite(deg) ? deg : null;
}

function exifToLocation(exif: any) {
	if (!exif) return null;
	const lat = dmsToDeg(exif.GPSLatitude, exif.GPSLatitudeRef);
	const lng = dmsToDeg(exif.GPSLongitude, exif.GPSLongitudeRef);
	if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
	return null;
}

const TAG_OPTIONS = ['Quiet', 'Study', 'Social', 'Good Coffee', 'Cozy', 'Spacious', 'Late-night', 'Outdoor Seating'];
const PHOTO_TAG_OPTIONS = ['Cozy interior', 'Aesthetic latte', 'Outdoor patio', 'Group seating', 'Cool decor', 'Food shot'];
const AMBIANCE_OPTIONS: { key: 'cozy' | 'modern' | 'rustic' | 'bright' | 'intimate' | 'energetic'; label: string }[] = [
	{ key: 'cozy', label: 'Cozy' },
	{ key: 'modern', label: 'Modern' },
	{ key: 'rustic', label: 'Rustic' },
	{ key: 'bright', label: 'Bright' },
	{ key: 'intimate', label: 'Intimate' },
	{ key: 'energetic', label: 'Energetic' },
];
const MAX_TAGS = 4;

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
	const [photoTags, setPhotoTags] = useState<string[]>([]);
	const [visitIntent, setVisitIntent] = useState<DiscoveryIntent[]>([]);
	const [ambiance, setAmbiance] = useState<'cozy' | 'modern' | 'rustic' | 'bright' | 'intimate' | 'energetic' | null>(null);
	const [noiseLevel, setNoiseLevel] = useState<1 | 2 | 3 | 4 | 5 | null>(null); // 1=silent, 2=quiet, 3=moderate, 4=lively, 5=loud
	const [busyness, setBusyness] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
	const [drinkPrice, setDrinkPrice] = useState<1 | 2 | 3 | null>(null); // 1=$, 2=$$, 3=$$$
	const [drinkQuality, setDrinkQuality] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
	const [wifiSpeed, setWifiSpeed] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
	const [outletAvailability, setOutletAvailability] = useState<'plenty' | 'some' | 'few' | 'none' | null>(null);
	const [laptopFriendly, setLaptopFriendly] = useState<boolean | null>(null);
	const [parkingAvailability, setParkingAvailability] = useState<'yes' | 'limited' | 'no' | null>(null);
	const [parkingType, setParkingType] = useState<'lot' | 'street' | 'garage' | null>(null);
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
	const [showCelebration, setShowCelebration] = useState(false);
	const activeRef = useRef(true);
	const submittingRef = useRef(false);
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

	// Celebrate when all metrics are completed
	const prevMetricsCompleteRef = useRef(false);
	useEffect(() => {
		const allComplete =
			noiseLevel !== null &&
			busyness !== null &&
			drinkPrice !== null &&
			drinkQuality !== null &&
			wifiSpeed !== null &&
			outletAvailability !== null &&
			laptopFriendly !== null;
		if (allComplete && !prevMetricsCompleteRef.current) {
			// Just completed all metrics - celebrate!
			void safeNotification();
		}
		prevMetricsCompleteRef.current = allComplete;
	}, [noiseLevel, busyness, drinkPrice, drinkQuality, wifiSpeed, outletAvailability, laptopFriendly]);

	useEffect(() => {
		const prefillSpot = typeof params.spot === 'string' ? params.spot : '';
		const editParam = typeof params.editId === 'string' ? params.editId : null;
		const prefillPlaceId = typeof params.placeId === 'string' ? params.placeId : '';
		const prefillLat = typeof params.lat === 'string' ? Number(params.lat) : null;
		const prefillLng = typeof params.lng === 'string' ? Number(params.lng) : null;
		if (prefillSpot && !spot) {
			setSpot(prefillSpot);
		}
		if (prefillPlaceId || (typeof prefillLat === 'number' && typeof prefillLng === 'number')) {
			setPlaceInfo({
				placeId: prefillPlaceId || undefined,
				name: prefillSpot || undefined,
				location: typeof prefillLat === 'number' && typeof prefillLng === 'number' ? { lat: prefillLat, lng: prefillLng } : undefined,
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
						if (Array.isArray(check.photoTags)) setPhotoTags(check.photoTags.slice(0, 3));
						if (Array.isArray(check.visitIntent)) setVisitIntent(sanitizeDiscoveryIntents(check.visitIntent));
						if (typeof check.ambiance === 'string') setAmbiance(check.ambiance as any);
						if (check.spotLatLng) setPlaceInfo({ placeId: check.spotPlaceId, name: check.spotName, location: check.spotLatLng });
					// Load metrics from edit mode
					const convertedNoise = toNumericNoiseLevel(check.noiseLevel ?? null);
					if (convertedNoise) setNoiseLevel(convertedNoise);
					if (check.busyness) setBusyness(check.busyness);
					if (check.drinkPrice) setDrinkPrice(check.drinkPrice);
					if (check.drinkQuality) setDrinkQuality(check.drinkQuality);
					if (typeof check.wifiSpeed === 'number') setWifiSpeed(check.wifiSpeed);
					if (typeof check.outletAvailability === 'string') setOutletAvailability(check.outletAvailability as any);
					if (typeof check.laptopFriendly === 'boolean') setLaptopFriendly(check.laptopFriendly);
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
							if (Array.isArray(found.photoTags)) setPhotoTags(found.photoTags.slice(0, 3));
							if (Array.isArray(found.visitIntent)) setVisitIntent(sanitizeDiscoveryIntents(found.visitIntent));
							if (typeof found.ambiance === 'string') setAmbiance(found.ambiance as any);
							if (found.spotLatLng) setPlaceInfo({ placeId: found.spotPlaceId, name: found.spotName, location: found.spotLatLng });
							// Load metrics from edit mode (local fallback)
							const convertedNoiseLocal = toNumericNoiseLevel(found.noiseLevel ?? null);
							if (convertedNoiseLocal) setNoiseLevel(convertedNoiseLocal);
							if (found.busyness) setBusyness(found.busyness);
							if (found.drinkPrice) setDrinkPrice(found.drinkPrice);
							if (found.drinkQuality) setDrinkQuality(found.drinkQuality);
							if (typeof found.wifiSpeed === 'number') setWifiSpeed(found.wifiSpeed);
							if (typeof found.outletAvailability === 'string') setOutletAvailability(found.outletAvailability as any);
							if (typeof found.laptopFriendly === 'boolean') setLaptopFriendly(found.laptopFriendly);
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
					if (Array.isArray(draft.photoTags)) setPhotoTags(draft.photoTags.slice(0, 3));
					if (Array.isArray(draft.visitIntent)) setVisitIntent(sanitizeDiscoveryIntents(draft.visitIntent));
					if (typeof draft.ambiance === 'string') setAmbiance(draft.ambiance as any);
					if (draft.placeId || draft.location) {
						setPlaceInfo({
							placeId: draft.placeId,
							name: draft.spot || draft.name,
							location: draft.location,
						});
					}
					// Load metrics from draft
					const convertedNoiseDraft = toNumericNoiseLevel(draft.noiseLevel ?? null);
					if (convertedNoiseDraft) setNoiseLevel(convertedNoiseDraft);
					if (typeof draft.busyness === 'number') setBusyness(draft.busyness);
					if (typeof draft.drinkPrice === 'number') setDrinkPrice(draft.drinkPrice);
					if (typeof draft.drinkQuality === 'number') setDrinkQuality(draft.drinkQuality);
					if (typeof draft.wifiSpeed === 'number') setWifiSpeed(draft.wifiSpeed);
					if (typeof draft.outletAvailability === 'string') setOutletAvailability(draft.outletAvailability as any);
					if (typeof draft.laptopFriendly === 'boolean') setLaptopFriendly(draft.laptopFriendly);
					if (typeof draft.parkingAvailability === 'string') setParkingAvailability(draft.parkingAvailability as any);
					if (typeof draft.parkingType === 'string') setParkingType(draft.parkingType as any);
				}
			} catch {}
			draftLoadedRef.current = true;
			const seen = await getPermissionPrimerSeen('camera');
			if (!seen) {
				setShowCameraPrimer(true);
				return;
			}
			const cam = await ImagePicker.requestCameraPermissionsAsync();
			setHasPermission(cam.status === 'granted');
			await ImagePicker.requestMediaLibraryPermissionsAsync();
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
			(photoTags && photoTags.length) ||
			(visitIntent && visitIntent.length) ||
			ambiance ||
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
					photoTags,
					visitIntent,
					ambiance,
					placeId: placeInfo?.placeId || detectedPlace?.placeId,
					location: placeInfo?.location || detectedPlace?.location,
					noiseLevel,
					busyness,
					drinkPrice,
					drinkQuality,
					wifiSpeed,
					outletAvailability,
					laptopFriendly,
					parkingAvailability,
					parkingType,
				});
		}, 400);
		return () => clearTimeout(timer);
	}, [spot, caption, image, selectedTags, photoTags, visitIntent, ambiance, placeInfo, detectedPlace, noiseLevel, busyness, drinkPrice, drinkQuality, wifiSpeed, outletAvailability, laptopFriendly, parkingAvailability, parkingType]);

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

	function toggleVisitIntent(intent: DiscoveryIntent) {
		setVisitIntent((prev) => {
			if (prev.includes(intent)) return prev.filter((entry) => entry !== intent);
			if (prev.length >= 2) {
				showToast('Pick up to 2 intents.', 'info');
				return prev;
			}
			return [...prev, intent];
		});
	}

	function togglePhotoTag(tag: string) {
		setPhotoTags((prev) => {
			if (prev.includes(tag)) return prev.filter((entry) => entry !== tag);
			if (prev.length >= 3) {
				showToast('Pick up to 3 photo tags.', 'info');
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
		setPhotoTags([]);
		setVisitIntent([]);
		setAmbiance(null);
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
		setNoiseLevel(null);
		setBusyness(null);
		setDrinkPrice(null);
		setDrinkQuality(null);
		setWifiSpeed(null);
		setOutletAvailability(null);
		setLaptopFriendly(null);
		lastDetectRef.current = null;
		draftEmptyRef.current = false;
	}

	async function handlePost() {
		if (submittingRef.current) return;
		submittingRef.current = true;
		Keyboard.dismiss();

		try {
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
			const metricsProvided = [noiseLevel, busyness, drinkPrice, drinkQuality, wifiSpeed, outletAvailability, laptopFriendly]
				.filter((v) => v !== null && v !== undefined)
				.length;
			if (metricsProvided === 0) {
				showToast('💡 Consider adding Spot Intel to help others!', 'info');
			}

			const last = await getLastCheckinAt();
			const now = Date.now();
			// rate-limit public posts: 10 minutes for public posts, 5 for others
			const MIN_GAP_PUBLIC = 10 * 60 * 1000;
			const MIN_GAP_OTHER = 5 * 60 * 1000;
			const MIN_GAP = visibility === 'public' ? MIN_GAP_PUBLIC : MIN_GAP_OTHER;
			if (last && now - last < MIN_GAP) {
				const mins = Math.ceil((MIN_GAP - (now - last)) / 60000);
				showToast(`You can post again in about ${mins} minute${mins === 1 ? '' : 's'}.`, 'warning');
				return;
			}

			setLoading(true);
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
						photoTags: photoTags.slice(0, 3),
						visitIntent: visitIntent.slice(0, 2),
						ambiance: ambiance ?? null,
						visibility,
						// Utility metrics
						noiseLevel: noiseLevel ?? null,
						busyness: busyness ?? null,
						drinkPrice: drinkPrice ?? null,
						drinkQuality: drinkQuality ?? null,
						wifiSpeed: wifiSpeed ?? null,
						outletAvailability: outletAvailability ?? null,
						laptopFriendly: laptopFriendly ?? null,
						parkingAvailability: parkingAvailability ?? null,
						parkingType: parkingType ?? null,
					};
					await fb.updateCheckinRemote(editId, updates);
					// update local copy
					const local = await import('@/storage/local');
					await local.updateCheckinLocalById(editId, updates as any);
					publishCheckin({ id: editId, ...updates });
					// Track metrics impact for edits
					try {
						const { updateMetricsImpact } = await import('@/services/metricsImpact');
						await updateMetricsImpact(uid, updates);
					} catch (error) {
						devLog('metrics impact update failed (edit)', error);
					}
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
				photoTags: photoTags.slice(0, 3),
				visitIntent: visitIntent.slice(0, 2),
				ambiance: ambiance ?? null,
				userId: uid,
				userName: displayName,
				userHandle: user?.handle,
				userPhotoUrl: user?.photoUrl,
				city: user?.city,
				campus: user?.campus,
				visibility,
				clientId,
				// Utility metrics
				noiseLevel: noiseLevel ?? null,
				busyness: busyness ?? null,
				drinkPrice: drinkPrice ?? null,
				drinkQuality: drinkQuality ?? null,
				wifiSpeed: wifiSpeed ?? null,
				outletAvailability: outletAvailability ?? null,
				laptopFriendly: laptopFriendly ?? null,
				parkingAvailability: parkingAvailability ?? null,
				parkingType: parkingType ?? null,
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
				photoTags: photoTags.slice(0, 3),
				visitIntent: visitIntent.slice(0, 2),
				ambiance: ambiance ?? null,
				photoUrl: persistedImage,
				campusOrCity: user?.campusOrCity || user?.city,
				city: user?.city,
				campus: user?.campus,
				visibility,
				clientId,
				// Utility metrics
				noiseLevel: noiseLevel ?? null,
				busyness: busyness ?? null,
				drinkPrice: drinkPrice ?? null,
				drinkQuality: drinkQuality ?? null,
				wifiSpeed: wifiSpeed ?? null,
				outletAvailability: outletAvailability ?? null,
				laptopFriendly: laptopFriendly ?? null,
				parkingAvailability: parkingAvailability ?? null,
				parkingType: parkingType ?? null,
			};
			try {
				const savedLocal = await saveCheckin(localPayload as any);
				publishCheckin(savedLocal);
				await setLastCheckinAt(Date.now());

				// Track gamification stats
				let stats;
				if (activePlace?.placeId) {
					try {
						stats = await updateStatsAfterCheckin(activePlace.placeId, Date.now());
					} catch (error) {
						devLog('gamification stats update failed', error);
					}
				}
				// Celebration + notifications don't require placeId
				try {
					if (!stats) stats = await getUserStats();
					setShowCelebration(true);
					setTimeout(() => setShowCelebration(false), 2500);

					// Track for rating prompt
					await trackCheckinForRating();

					// Check for streak milestones and notify
					if (stats.streakDays === 3 || stats.streakDays === 7 || stats.streakDays === 30 || stats.streakDays === 100) {
						await notifyAchievementUnlocked(`${stats.streakDays} Day Streak`, '🔥');
						setTimeout(() => {
							void promptRatingAtMoment(RatingTriggers.MILESTONE_REACHED);
						}, 2000);
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
					devLog('celebration/notification flow failed', error);
				}

				// Track metrics impact
				try {
					const { updateMetricsImpact } = await import('@/services/metricsImpact');
					await updateMetricsImpact(uid, localPayload);
				} catch (error) {
					devLog('metrics impact update failed (new checkin)', error);
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
			try {
				await clearCheckinDraft();
			} catch {}
			resetDraftState();
			router.replace('/(tabs)/feed');
		} catch (e) {
			devLog('handlePost error', e);
			setPostStatus({ message: 'Unable to post right now. Check your connection and try again.', tone: 'error' });
			showToast('Unable to post right now.', 'error');
		} finally {
			setLoading(false);
			submittingRef.current = false;
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

						<Text style={{ color: muted, fontWeight: '600', marginBottom: 6 }}>Why are you here?</Text>
						<View style={styles.tagRow}>
							{DISCOVERY_INTENT_OPTIONS.map((intent) => {
								const active = visitIntent.includes(intent.key as DiscoveryIntent);
								return (
									<Pressable
										key={intent.key}
										onPress={() => toggleVisitIntent(intent.key as DiscoveryIntent)}
										style={({ pressed }) => [
											styles.tagChip,
											{
												borderColor: inputBorder,
												backgroundColor: active ? primary : pressed ? withAlpha(primary, 0.12) : 'transparent',
											},
										]}
									>
										<Text style={{ color: active ? '#FFFFFF' : text, fontWeight: '600' }}>
											{intent.emoji} {intent.shortLabel}
										</Text>
									</Pressable>
								);
							})}
						</View>
						<Text style={{ color: muted, marginBottom: 10 }}>
							{visitIntent.length
								? visitIntent
										.map((key) => DISCOVERY_INTENT_OPTIONS.find((option) => option.key === key)?.hint)
										.filter(Boolean)
										.join(' • ')
								: 'Choose up to 2 intents to improve recommendations for everyone.'}
						</Text>

						<Text style={{ color: muted, fontWeight: '600', marginBottom: 6 }}>Ambiance</Text>
						<View style={styles.tagRow}>
							{AMBIANCE_OPTIONS.map((option) => {
								const active = ambiance === option.key;
								return (
									<Pressable
										key={option.key}
										onPress={() => setAmbiance((prev) => (prev === option.key ? null : option.key))}
										style={({ pressed }) => [
											styles.tagChip,
											{
												borderColor: inputBorder,
												backgroundColor: active ? primary : pressed ? withAlpha(primary, 0.12) : 'transparent',
											},
										]}
									>
										<Text style={{ color: active ? '#FFFFFF' : text, fontWeight: '600' }}>{option.label}</Text>
									</Pressable>
								);
							})}
						</View>
						<Text style={{ color: muted, marginBottom: 10 }}>
							{ambiance ? `${AMBIANCE_OPTIONS.find((entry) => entry.key === ambiance)?.label} vibe selected.` : 'Optional: pick the overall vibe of the space.'}
						</Text>

						<Text style={{ color: muted, fontWeight: '600', marginBottom: 6 }}>Photo tags</Text>
						<View style={styles.tagRow}>
							{PHOTO_TAG_OPTIONS.map((tag) => {
								const active = photoTags.includes(tag);
								return (
									<Pressable
										key={tag}
										onPress={() => togglePhotoTag(tag)}
										style={({ pressed }) => [
											styles.tagChip,
											{
												borderColor: inputBorder,
												backgroundColor: active ? primary : pressed ? withAlpha(primary, 0.12) : 'transparent',
											},
										]}
									>
										<Text style={{ color: active ? '#FFFFFF' : text, fontWeight: '600' }}>{tag}</Text>
									</Pressable>
								);
							})}
						</View>
						<Text style={{ color: muted, marginBottom: 10 }}>
							{photoTags.length ? `${photoTags.length}/3 photo tags selected.` : 'Optional: quick photo tags help aesthetic discovery.'}
						</Text>

						{/* Spot Intel Section - Utility Metrics */}
						<View style={{ marginTop: 16, marginBottom: 8 }}>
							{(() => {
								const metricsCompleted = [noiseLevel !== null, busyness !== null, drinkPrice !== null, drinkQuality !== null, wifiSpeed !== null, outletAvailability !== null, laptopFriendly !== null].filter(Boolean).length;
								const metricsTotal = 7;
								const metricsPercentage = Math.round((metricsCompleted / metricsTotal) * 100);
								return (
									<>
										<View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
											<Text style={{ color: text, fontWeight: '700', fontSize: 16 }}>Spot Intel (optional)</Text>
											{metricsCompleted > 0 ? (
												<View
													style={{
														marginLeft: 8,
														paddingHorizontal: 8,
														paddingVertical: 2,
														borderRadius: 12,
														backgroundColor:
															metricsPercentage === 100
																? withAlpha(success, 0.15)
																: withAlpha(primary, 0.15),
													}}
												>
													<Text
														style={{
															color: metricsPercentage === 100 ? success : primary,
															fontSize: 11,
															fontWeight: '700',
														}}
													>
														{metricsCompleted}/{metricsTotal} ✓
													</Text>
												</View>
											) : null}
										</View>
										<Text style={{ color: muted, marginBottom: 12 }}>
											{metricsCompleted === 0
												? 'Help others find the perfect spot by sharing quick metrics'
												: metricsPercentage === 100
												? 'Thanks for helping the community!'
												: metricsTotal - metricsCompleted === 1 ? 'One more metric to go' : `${metricsTotal - metricsCompleted} more to go`}
										</Text>
									</>
								);
							})()}

							<View style={{ marginBottom: 16 }}>
								<Text style={{ color: muted, fontWeight: '600', marginBottom: 8 }}>Noise Level</Text>
								<View style={{ flexDirection: 'row', gap: 8 }}>
									{([1, 2, 3, 4, 5] as const).map((level) => (
										<Pressable
											key={`noise-${level}`}
											onPress={() => {
												void safeImpact();
												setNoiseLevel(noiseLevel === level ? null : level);
											}}
											style={[
												styles.metricChip,
												{
													borderColor: inputBorder,
													backgroundColor: noiseLevel === level ? primary : 'transparent',
													minWidth: 50,
												},
											]}
										>
											<Text
												style={{
													color: noiseLevel === level ? '#FFFFFF' : text,
													fontWeight: '600',
													textAlign: 'center',
												}}
											>
												{level === 1 ? '🔇' : level === 2 ? '🤫' : level === 3 ? '💬' : level === 4 ? '🎉' : '📢'}
											</Text>
										</Pressable>
									))}
								</View>
								<Text style={{ color: muted, fontSize: 12, marginTop: 4 }}>
									{noiseLevel === 1
										? 'Silent'
										: noiseLevel === 2
										? 'Quiet'
										: noiseLevel === 3
										? 'Moderate'
										: noiseLevel === 4
										? 'Lively'
										: noiseLevel === 5
										? 'Loud'
										: 'Tap to rate noise'}
								</Text>
							</View>

							<View style={{ marginBottom: 16 }}>
								<Text style={{ color: muted, fontWeight: '600', marginBottom: 8 }}>How Busy?</Text>
								<View style={{ flexDirection: 'row', gap: 8 }}>
									{([1, 2, 3, 4, 5] as const).map((level) => (
										<Pressable
											key={`busy-${level}`}
											onPress={() => {
												void safeImpact();
												setBusyness(busyness === level ? null : level);
											}}
											style={[
												styles.metricChip,
												{
													borderColor: inputBorder,
													backgroundColor: busyness === level ? primary : 'transparent',
													minWidth: 50,
												},
											]}
										>
											<Text
												style={{
													color: busyness === level ? '#FFFFFF' : text,
													fontWeight: '600',
													textAlign: 'center',
												}}
											>
												{level === 1 ? '1️⃣' : level === 2 ? '2️⃣' : level === 3 ? '3️⃣' : level === 4 ? '4️⃣' : '5️⃣'}
											</Text>
										</Pressable>
									))}
								</View>
								<Text style={{ color: muted, fontSize: 12, marginTop: 4 }}>
									{busyness === 1
										? 'Empty'
										: busyness === 2
										? 'Quiet'
										: busyness === 3
										? 'Some people'
										: busyness === 4
										? 'Busy'
										: busyness === 5
										? 'Packed!'
										: 'Tap to rate how crowded'}
								</Text>
							</View>

							<View style={{ marginBottom: 16 }}>
								<Text style={{ color: muted, fontWeight: '600', marginBottom: 8 }}>Drink Price</Text>
								<View style={{ flexDirection: 'row', gap: 8 }}>
									{([1, 2, 3] as const).map((level) => (
										<Pressable
											key={`price-${level}`}
											onPress={() => {
												void safeImpact();
												setDrinkPrice(drinkPrice === level ? null : level);
											}}
											style={[
												styles.metricChip,
												{
													borderColor: inputBorder,
													backgroundColor: drinkPrice === level ? primary : 'transparent',
													minWidth: 60,
												},
											]}
										>
											<Text
												style={{
													color: drinkPrice === level ? '#FFFFFF' : text,
													fontWeight: '600',
													textAlign: 'center',
												}}
											>
												{level === 1 ? '$' : level === 2 ? '$$' : '$$$'}
											</Text>
										</Pressable>
									))}
								</View>
								<Text style={{ color: muted, fontSize: 12, marginTop: 4 }}>
									{drinkPrice === 1
										? 'Budget-friendly'
										: drinkPrice === 2
										? 'Mid-range'
										: drinkPrice === 3
										? 'Pricey'
										: 'Tap to rate drink prices'}
								</Text>
							</View>

							<View style={{ marginBottom: 16 }}>
								<Text style={{ color: muted, fontWeight: '600', marginBottom: 8 }}>Drink Quality</Text>
								<View style={{ flexDirection: 'row', gap: 8 }}>
									{([1, 2, 3, 4, 5] as const).map((level) => (
										<Pressable
											key={`quality-${level}`}
											onPress={() => {
												void safeImpact();
												setDrinkQuality(drinkQuality === level ? null : level);
											}}
											style={[
												styles.metricChip,
												{
													borderColor: inputBorder,
													backgroundColor: drinkQuality === level ? primary : 'transparent',
													minWidth: 50,
												},
											]}
										>
											<Text
												style={{
													color: drinkQuality === level ? '#FFFFFF' : text,
													fontWeight: '600',
													textAlign: 'center',
												}}
											>
												{level === 1 ? '😐' : level === 2 ? '🙂' : level === 3 ? '😊' : level === 4 ? '😋' : '🤩'}
											</Text>
										</Pressable>
									))}
								</View>
								<Text style={{ color: muted, fontSize: 12, marginTop: 4 }}>
									{drinkQuality === 1
										? 'Poor'
										: drinkQuality === 2
										? 'Below average'
										: drinkQuality === 3
										? 'Decent'
										: drinkQuality === 4
										? 'Great'
										: drinkQuality === 5
										? 'Exceptional!'
										: 'Tap to rate drink quality'}
								</Text>
							</View>

							<View style={{ marginBottom: 16 }}>
								<Text style={{ color: muted, fontWeight: '600', marginBottom: 8 }}>WiFi Speed</Text>
								<View style={{ flexDirection: 'row', gap: 8 }}>
									{([1, 2, 3, 4, 5] as const).map((level) => (
										<Pressable
											key={`wifi-${level}`}
											onPress={() => {
												void safeImpact();
												setWifiSpeed(wifiSpeed === level ? null : level);
											}}
											style={[
												styles.metricChip,
												{
													borderColor: inputBorder,
													backgroundColor: wifiSpeed === level ? primary : 'transparent',
													minWidth: 50,
												},
											]}
										>
											<Text
												style={{
													color: wifiSpeed === level ? '#FFFFFF' : text,
													fontWeight: '600',
													textAlign: 'center',
												}}
											>
												{level === 1 ? '🐌' : level === 2 ? '📶' : level === 3 ? '✅' : level === 4 ? '🚀' : '⚡'}
											</Text>
										</Pressable>
									))}
								</View>
								<Text style={{ color: muted, fontSize: 12, marginTop: 4 }}>
									{wifiSpeed === 1
										? 'Unusable'
										: wifiSpeed === 2
										? 'Slow'
										: wifiSpeed === 3
										? 'Decent'
										: wifiSpeed === 4
										? 'Fast'
										: wifiSpeed === 5
										? 'Blazing!'
										: 'Tap to rate WiFi speed'}
								</Text>
							</View>

							<View style={{ marginBottom: 16 }}>
								<Text style={{ color: muted, fontWeight: '600', marginBottom: 8 }}>Outlets Available?</Text>
								<View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
									{([
										{ key: 'plenty', label: '🔌 Plenty' },
										{ key: 'some', label: '✅ Some' },
										{ key: 'few', label: '🤏 Few' },
										{ key: 'none', label: '❌ None' },
									] as const).map((option) => (
										<Pressable
											key={`outlet-${option.key}`}
											onPress={() => {
												void safeImpact();
												setOutletAvailability(outletAvailability === option.key ? null : option.key);
											}}
											style={[
												styles.metricChip,
												{
													borderColor: inputBorder,
													backgroundColor: outletAvailability === option.key ? primary : 'transparent',
													minWidth: 86,
												},
											]}
										>
											<Text
												style={{
													color: outletAvailability === option.key ? '#FFFFFF' : text,
													fontWeight: '600',
													textAlign: 'center',
												}}
											>
												{option.label}
											</Text>
										</Pressable>
									))}
								</View>
								<Text style={{ color: muted, fontSize: 12, marginTop: 4 }}>
									{outletAvailability === 'plenty'
										? 'Easy to find outlets'
										: outletAvailability === 'some'
										? 'Enough for most people'
										: outletAvailability === 'few'
										? 'Limited outlet access'
										: outletAvailability === 'none'
										? 'No usable outlets'
										: 'Tap to rate outlet availability'}
								</Text>
							</View>

							<View style={{ marginBottom: 16 }}>
								<Text style={{ color: muted, fontWeight: '600', marginBottom: 8 }}>Laptop-Friendly?</Text>
								<View style={{ flexDirection: 'row', gap: 8 }}>
									<Pressable
										onPress={() => {
											void safeImpact();
											setLaptopFriendly(laptopFriendly === true ? null : true);
										}}
										style={[
											styles.metricChip,
											{
												borderColor: inputBorder,
												backgroundColor: laptopFriendly === true ? primary : 'transparent',
												minWidth: 80,
											},
										]}
									>
										<Text
											style={{
												color: laptopFriendly === true ? '#FFFFFF' : text,
												fontWeight: '600',
												textAlign: 'center',
											}}
										>
											💻 Yes
										</Text>
									</Pressable>
									<Pressable
										onPress={() => {
											void safeImpact();
											setLaptopFriendly(laptopFriendly === false ? null : false);
										}}
										style={[
											styles.metricChip,
											{
												borderColor: inputBorder,
												backgroundColor: laptopFriendly === false ? primary : 'transparent',
												minWidth: 80,
											},
										]}
									>
										<Text
											style={{
												color: laptopFriendly === false ? '#FFFFFF' : text,
												fontWeight: '600',
												textAlign: 'center',
											}}
										>
											🚫 No
										</Text>
									</Pressable>
								</View>
								<Text style={{ color: muted, fontSize: 12, marginTop: 4 }}>
									{laptopFriendly === true
										? 'Good for laptop work'
										: laptopFriendly === false
										? 'Not great for laptops'
										: 'Would you bring your laptop here?'}
								</Text>
							</View>

							<View style={{ marginBottom: 16 }}>
								<Text style={{ color: muted, fontWeight: '600', marginBottom: 8 }}>Parking Available?</Text>
								<View style={{ flexDirection: 'row', gap: 8 }}>
									{([
										{ key: 'yes', label: '🟢 Yes' },
										{ key: 'limited', label: '🟡 Limited' },
										{ key: 'no', label: '🔴 None' },
									] as const).map((option) => (
										<Pressable
											key={`parking-avail-${option.key}`}
											onPress={() => {
												void safeImpact();
												setParkingAvailability(parkingAvailability === option.key ? null : option.key);
											}}
											style={[
												styles.metricChip,
												{
													borderColor: inputBorder,
													backgroundColor: parkingAvailability === option.key ? primary : 'transparent',
													minWidth: 86,
												},
											]}
										>
											<Text style={{ color: parkingAvailability === option.key ? '#FFFFFF' : text, fontWeight: '600', textAlign: 'center' }}>
												{option.label}
											</Text>
										</Pressable>
									))}
								</View>
							</View>

							{parkingAvailability === 'yes' || parkingAvailability === 'limited' ? (
								<View style={{ marginBottom: 16 }}>
									<Text style={{ color: muted, fontWeight: '600', marginBottom: 8 }}>Parking Type</Text>
									<View style={{ flexDirection: 'row', gap: 8 }}>
										{([
											{ key: 'lot', label: '🅿️ Lot' },
											{ key: 'street', label: '🚗 Street' },
											{ key: 'garage', label: '🏢 Garage' },
										] as const).map((option) => (
											<Pressable
												key={`parking-type-${option.key}`}
												onPress={() => {
													void safeImpact();
													setParkingType(parkingType === option.key ? null : option.key);
												}}
												style={[
													styles.metricChip,
													{
														borderColor: inputBorder,
														backgroundColor: parkingType === option.key ? primary : 'transparent',
														minWidth: 86,
													},
												]}
											>
												<Text style={{ color: parkingType === option.key ? '#FFFFFF' : text, fontWeight: '600', textAlign: 'center' }}>
													{option.label}
												</Text>
											</Pressable>
										))}
									</View>
								</View>
							) : null}
						</View>

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
				<CelebrationOverlay visible={showCelebration} />
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
