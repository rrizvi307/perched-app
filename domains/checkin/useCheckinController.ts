import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import {
  buildComposerDraftPayload,
  hasComposerDraftContent,
  hydrateComposerFromSource,
  parseComposerRouteParams,
  type CheckinOutletAvailability,
  type CheckinComposerHydration,
} from '@/domains/checkin/checkinComposerState';
import {
  buildCheckinDetectionLabel,
  buildCheckinMetricsSummary,
  buildCheckinStaticMapUrl,
  buildCheckinSubmitState,
  buildCheckinVisibilityNote,
} from '@/domains/checkin/checkinFlowState';
import {
  createCheckinComposerResetPatch,
  createCheckinPhotoClearedPatch,
  createCheckinPhotoReplacementPatch,
  toggleBoundedSelection,
  type CheckinComposerScreenPatch,
  type CheckinPostStatus,
} from '@/domains/checkin/checkinComposerUi';
import {
  captureCheckinPhoto,
  chooseCheckinPhotoFromLibrary,
  confirmCheckinCameraPrimerPermissions,
  loadCheckinMediaBootstrapState,
  type CheckinImagePickResult,
} from '@/domains/checkin/checkinMedia';
import {
  detectCheckinPlace,
  resolveManualCheckinPlaceSelection,
} from '@/domains/checkin/checkinPlaces';
import {
  loadEditableCheckin,
  retryQueuedCheckinSync,
  submitCheckinEdit,
  submitNewCheckin,
} from '@/domains/checkin/checkinSubmission';
import { validateCheckinSubmission } from '@/domains/checkin/checkinValidation';
import { DISCOVERY_INTENT_OPTIONS, type DiscoveryIntent } from '@/services/discoveryIntents';
import { getMapsKey } from '@/services/googleMaps';
import { devLog } from '@/services/logger';
import { logEvent } from '@/services/logEvent';
import {
  clearCheckinDraft,
  getCheckinDraft,
  getLastCheckinAt,
  saveCheckinDraft,
} from '@/storage/checkinQueueStore';
import { setPermissionPrimerSeen } from '@/storage/profileCacheStore';
import { safeNotification } from '@/utils/haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { InteractionManager, Keyboard, Platform } from 'react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const MAX_TAGS = 3;
const MAX_VISIT_INTENTS = 2;
const MAX_PHOTO_TAGS = 3;
const DETECTION_THRESHOLD_KM = 0.2;

type Ambiance = 'cozy' | 'modern' | 'rustic' | 'bright' | 'intimate' | 'energetic' | null;
type ParkingAvailability = 'yes' | 'limited' | 'no' | null;
type ParkingType = 'lot' | 'street' | 'garage' | null;

export function useCheckinController() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [spot, setSpot] = useState('');
  const [caption, setCaption] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [captured, setCaptured] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [photoTags, setPhotoTags] = useState<string[]>([]);
  const [visitIntent, setVisitIntent] = useState<DiscoveryIntent[]>([]);
  const [ambiance, setAmbiance] = useState<Ambiance>(null);
  const [noiseLevel, setNoiseLevel] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [busyness, setBusyness] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [overallVibe, setOverallVibe] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [drinkPrice, setDrinkPrice] = useState<1 | 2 | 3 | null>(null);
  const [drinkQuality, setDrinkQuality] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [wifiSpeed, setWifiSpeed] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [outletAvailability, setOutletAvailability] = useState<CheckinOutletAvailability>(null);
  const [laptopFriendly, setLaptopFriendly] = useState<boolean | null>(null);
  const [parkingAvailability, setParkingAvailability] = useState<ParkingAvailability>(null);
  const [parkingType, setParkingType] = useState<ParkingType>(null);
  const [placeModal, setPlaceModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [placeInfo, setPlaceInfo] = useState<any | null>(null);
  const [placeSelectionSource, setPlaceSelectionSource] = useState<'auto' | 'manual' | 'prefill' | null>(null);
  const [visibility, setVisibility] = useState<'public' | 'friends' | 'close'>('public');
  const [detectedPlace, setDetectedPlace] = useState<any | null>(null);
  const [detectedCandidates, setDetectedCandidates] = useState<any[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [detectionError, setDetectionError] = useState<string | null>(null);
  const [resolvingPlaceSelection, setResolvingPlaceSelection] = useState(false);
  const [imageExif, setImageExif] = useState<any | null>(null);
  const [postStatus, setPostStatus] = useState<CheckinPostStatus>(null);
  const [pendingRemote, setPendingRemote] = useState<any | null>(null);
  const [showCameraPrimer, setShowCameraPrimer] = useState(false);
  const [showLocationPrimer, setShowLocationPrimer] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [bootstrapReady, setBootstrapReady] = useState(false);

  const initialLoadRef = useRef(false);
  const draftLoadedRef = useRef(false);
  const draftEmptyRef = useRef(false);
  const activeRef = useRef(true);
  const submittingRef = useRef(false);
  const lastDetectRef = useRef<string | null>(null);
  const celebrationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevMetricsCompleteRef = useRef(false);

  const isWeb = Platform.OS === 'web';
  const imageQuality = isWeb ? 0.35 : 0.7;
  const displayPlace = placeInfo || detectedPlace;
  const activePlace = displayPlace;
  const mapsKey = useMemo(() => {
    try {
      return getMapsKey();
    } catch {
      return null;
    }
  }, []);
  const visibilityNote = useMemo(() => buildCheckinVisibilityNote(visibility), [visibility]);
  const detectionLabel = useMemo(() => buildCheckinDetectionLabel(detectedPlace), [detectedPlace]);
  const mapPreviewUrl = useMemo(
    () => buildCheckinStaticMapUrl(displayPlace?.location, mapsKey, '800x400'),
    [displayPlace?.location, mapsKey],
  );
  const metricsSummary = useMemo(
    () =>
      buildCheckinMetricsSummary({
        noiseLevel,
        busyness,
        overallVibe,
        wifiSpeed,
        outletAvailability,
      }),
    [noiseLevel, busyness, overallVibe, wifiSpeed, outletAvailability],
  );
  const submitState = useMemo(
    () =>
      buildCheckinSubmitState({
        loading,
        resolvingPlaceSelection,
        spot,
        activePlace,
      }),
    [loading, resolvingPlaceSelection, spot, activePlace],
  );

  const applyComposerScreenPatch = useCallback((patch: CheckinComposerScreenPatch) => {
    if (patch.spot !== undefined) setSpot(patch.spot);
    if (patch.caption !== undefined) setCaption(patch.caption);
    if (patch.image !== undefined) setImage(patch.image);
    if (patch.imageExif !== undefined) setImageExif(patch.imageExif);
    if (patch.captured !== undefined) setCaptured(patch.captured);
    if (patch.selectedTags !== undefined) setSelectedTags(patch.selectedTags);
    if (patch.photoTags !== undefined) setPhotoTags(patch.photoTags);
    if (patch.visitIntent !== undefined) setVisitIntent(patch.visitIntent);
    if (patch.ambiance !== undefined) setAmbiance(patch.ambiance);
    if (patch.placeInfo !== undefined) setPlaceInfo(patch.placeInfo);
    if (patch.placeSelectionSource !== undefined) setPlaceSelectionSource(patch.placeSelectionSource);
    if (patch.detectedPlace !== undefined) setDetectedPlace(patch.detectedPlace);
    if (patch.detectedCandidates !== undefined) setDetectedCandidates(patch.detectedCandidates);
    if (patch.detecting !== undefined) setDetecting(patch.detecting);
    if (patch.detectionError !== undefined) setDetectionError(patch.detectionError);
    if (patch.postStatus !== undefined) setPostStatus(patch.postStatus);
    if (patch.pendingRemote !== undefined) setPendingRemote(patch.pendingRemote);
    if (patch.placeModal !== undefined) setPlaceModal(patch.placeModal);
    if (patch.visibility !== undefined) setVisibility(patch.visibility);
    if (patch.isEditMode !== undefined) setIsEditMode(patch.isEditMode);
    if (patch.editId !== undefined) setEditId(patch.editId);
    if (patch.noiseLevel !== undefined) setNoiseLevel(patch.noiseLevel);
    if (patch.busyness !== undefined) setBusyness(patch.busyness);
    if (patch.overallVibe !== undefined) setOverallVibe(patch.overallVibe);
    if (patch.drinkPrice !== undefined) setDrinkPrice(patch.drinkPrice);
    if (patch.drinkQuality !== undefined) setDrinkQuality(patch.drinkQuality);
    if (patch.wifiSpeed !== undefined) setWifiSpeed(patch.wifiSpeed);
    if (patch.outletAvailability !== undefined) setOutletAvailability(patch.outletAvailability);
    if (patch.laptopFriendly !== undefined) setLaptopFriendly(patch.laptopFriendly);
    if (patch.parkingAvailability !== undefined) setParkingAvailability(patch.parkingAvailability);
    if (patch.parkingType !== undefined) setParkingType(patch.parkingType);
  }, []);

  const applyComposerHydration = useCallback((patch: CheckinComposerHydration) => {
    if (patch.spot !== undefined) setSpot(patch.spot);
    if (patch.caption !== undefined) setCaption(patch.caption);
    if (patch.image !== undefined) setImage(patch.image);
    if (patch.captured !== undefined) setCaptured(patch.captured);
    if (patch.selectedTags !== undefined) setSelectedTags(patch.selectedTags);
    if (patch.photoTags !== undefined) setPhotoTags(patch.photoTags);
    if (patch.visitIntent !== undefined) setVisitIntent(patch.visitIntent);
    if (patch.ambiance !== undefined) setAmbiance(patch.ambiance);
    if (patch.visibility !== undefined) setVisibility(patch.visibility);
    if (patch.placeInfo !== undefined) setPlaceInfo(patch.placeInfo);
    if (patch.placeSelectionSource !== undefined) setPlaceSelectionSource(patch.placeSelectionSource);
    if (patch.noiseLevel !== undefined) setNoiseLevel(patch.noiseLevel);
    if (patch.busyness !== undefined) setBusyness(patch.busyness);
    if (patch.overallVibe !== undefined) setOverallVibe(patch.overallVibe);
    if (patch.drinkPrice !== undefined) setDrinkPrice(patch.drinkPrice);
    if (patch.drinkQuality !== undefined) setDrinkQuality(patch.drinkQuality);
    if (patch.wifiSpeed !== undefined) setWifiSpeed(patch.wifiSpeed);
    if (patch.outletAvailability !== undefined) setOutletAvailability(patch.outletAvailability);
    if (patch.laptopFriendly !== undefined) setLaptopFriendly(patch.laptopFriendly);
    if (patch.parkingAvailability !== undefined) setParkingAvailability(patch.parkingAvailability);
    if (patch.parkingType !== undefined) setParkingType(patch.parkingType);
  }, []);

  const startCelebration = useCallback(() => {
    setShowCelebration(true);
    if (celebrationTimeoutRef.current) {
      clearTimeout(celebrationTimeoutRef.current);
    }
    celebrationTimeoutRef.current = setTimeout(() => {
      celebrationTimeoutRef.current = null;
      if (activeRef.current) {
        setShowCelebration(false);
      }
    }, 2500);
  }, []);

  const applyPickedImageResult = useCallback(
    (result: CheckinImagePickResult, errorContext: string) => {
      if (result.status === 'success') {
        setImage(result.image);
        setImageExif(result.exif || null);
        setCaptured(true);
        setHasPermission(true);
        return result.image;
      }
      if (result.status === 'permission_denied') {
        if (typeof result.hasCameraPermission === 'boolean') {
          setHasPermission(result.hasCameraPermission);
        }
        showToast(result.message, 'warning');
        return null;
      }
      if (result.status === 'error') {
        if (typeof result.hasCameraPermission === 'boolean') {
          setHasPermission(result.hasCameraPermission);
        }
        devLog(errorContext, result.error);
        showToast(result.message, 'warning');
        return null;
      }
      return null;
    },
    [showToast],
  );

  const triggerHaptic = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      const mod = await import('expo-haptics');
      await mod.selectionAsync();
    } catch {}
  }, []);

  const openCamera = useCallback(async (): Promise<string | null> => {
    const result = await captureCheckinPhoto({
      imageQuality,
      isWeb,
      userId: user?.id,
    });
    return applyPickedImageResult(result, 'openCamera error');
  }, [applyPickedImageResult, imageQuality, isWeb, user?.id]);

  const pickImage = useCallback(async (): Promise<string | null> => {
    const result = await chooseCheckinPhotoFromLibrary({
      imageQuality,
      isWeb,
      userId: user?.id,
    });
    return applyPickedImageResult(result, 'pickImage error');
  }, [applyPickedImageResult, imageQuality, isWeb, user?.id]);

  const autoDetectPlace = useCallback(
    async (options?: { allowWithoutImage?: boolean; detectionKey?: string }) => {
      const detectionKey = options?.detectionKey || (image ? `image:${image}` : 'screen_prefetch');
      if ((!image && !options?.allowWithoutImage) || detecting) return;
      if (lastDetectRef.current === detectionKey) return;

      lastDetectRef.current = detectionKey;
      setDetecting(true);
      setDetectionError(null);
      setDetectedCandidates([]);

      try {
        const detection = await detectCheckinPlace({
          image,
          imageExif,
          allowWithoutImage: options?.allowWithoutImage,
          detectionThresholdKm: DETECTION_THRESHOLD_KM,
          userId: user?.id,
          existingSpot: spot,
          existingPlaceInfo: placeInfo,
        });
        if (detection.status === 'needs_location_primer') {
          setShowLocationPrimer(true);
          return;
        }
        if (detection.status === 'error') {
          setDetectionError(detection.detectionError);
          return;
        }
        if (detection.status === 'success') {
          setDetectedPlace(detection.detectedPlace);
          setDetectedCandidates(detection.detectedCandidates);
          if (detection.autoFill) {
            setPlaceInfo(detection.autoFill.placeInfo);
            setPlaceSelectionSource(detection.autoFill.placeSelectionSource);
            setSpot(detection.autoFill.spot);
          }
        }
      } finally {
        setDetecting(false);
      }
    },
    [detecting, image, imageExif, placeInfo, spot, user?.id],
  );

  const handlePlaceSelect = useCallback(
    async (place: any) => {
      setResolvingPlaceSelection(true);
      setPostStatus(null);
      try {
        const selection = await resolveManualCheckinPlaceSelection(place);
        if (selection.status === 'error') {
          setPostStatus({ message: selection.postStatusMessage, tone: selection.tone });
          showToast(selection.toastMessage, selection.tone === 'warning' ? 'warning' : 'error');
          throw new Error('place_verification_failed');
        }

        const resolved = selection.resolvedPlace;
        setPlaceInfo(resolved);
        setPlaceSelectionSource('manual');
        setDetectedPlace(null);
        setDetectedCandidates([]);
        if (resolved?.name) setSpot(resolved.name);
      } catch (error) {
        if (error instanceof Error && error.message === 'place_verification_failed') {
          throw error;
        }
        setPostStatus({ message: 'Unable to verify that spot right now. Try again.', tone: 'error' });
        showToast('Unable to verify that spot right now.', 'error');
        throw new Error('place_verification_failed');
      } finally {
        setResolvingPlaceSelection(false);
      }
    },
    [showToast],
  );

  const toggleTag = useCallback(
    (tag: string) => {
      setSelectedTags((prev) => {
        const nextSelection = toggleBoundedSelection(prev, tag, MAX_TAGS);
        if (nextSelection.limitReached) {
          showToast(`Pick up to ${MAX_TAGS} tags.`, 'info');
          return prev;
        }
        return nextSelection.next;
      });
    },
    [showToast],
  );

  const toggleVisitIntent = useCallback(
    (intent: DiscoveryIntent) => {
      setVisitIntent((prev) => {
        const nextSelection = toggleBoundedSelection(prev, intent, MAX_VISIT_INTENTS);
        if (nextSelection.limitReached) {
          showToast(`Pick up to ${MAX_VISIT_INTENTS} intents.`, 'info');
          return prev;
        }
        return nextSelection.next;
      });
    },
    [showToast],
  );

  const togglePhotoTag = useCallback(
    (tag: string) => {
      setPhotoTags((prev) => {
        const nextSelection = toggleBoundedSelection(prev, tag, MAX_PHOTO_TAGS);
        if (nextSelection.limitReached) {
          showToast(`Pick up to ${MAX_PHOTO_TAGS} photo tags.`, 'info');
          return prev;
        }
        return nextSelection.next;
      });
    },
    [showToast],
  );

  const clearSpot = useCallback(() => {
    setSpot('');
    setPlaceInfo(null);
    setPlaceSelectionSource(null);
  }, []);

  const selectDetectedPlace = useCallback(() => {
    if (!detectedPlace) return;
    setPlaceInfo(detectedPlace);
    setPlaceSelectionSource('auto');
    if (!spot) setSpot(detectedPlace.name);
  }, [detectedPlace, spot]);

  const selectDetectedCandidate = useCallback((candidate: any) => {
    setPlaceInfo(candidate);
    setPlaceSelectionSource('auto');
    if (!spot) setSpot(candidate.name);
  }, [spot]);

  const resetDraftState = useCallback(() => {
    applyComposerScreenPatch(createCheckinComposerResetPatch());
    lastDetectRef.current = null;
    draftEmptyRef.current = false;
  }, [applyComposerScreenPatch]);

  const clearAttachedPhoto = useCallback(() => {
    applyComposerScreenPatch(createCheckinPhotoClearedPatch(placeSelectionSource));
    lastDetectRef.current = null;
  }, [applyComposerScreenPatch, placeSelectionSource]);

  const replacePhoto = useCallback(
    async (via: 'camera' | 'library') => {
      const newImage = via === 'camera' ? await openCamera() : await pickImage();
      if (!newImage) return;

      applyComposerScreenPatch(createCheckinPhotoReplacementPatch(placeSelectionSource));
      lastDetectRef.current = null;
    },
    [applyComposerScreenPatch, openCamera, pickImage, placeSelectionSource],
  );

  const confirmCameraPrimer = useCallback(async () => {
    setShowCameraPrimer(false);
    const permissionState = await confirmCheckinCameraPrimerPermissions();
    setHasPermission(permissionState.hasCameraPermission);
    if (permissionState.hasCameraPermission && Platform.OS !== 'web') {
      await openCamera();
    }
  }, [openCamera]);

  const confirmLocationPrimer = useCallback(async () => {
    setShowLocationPrimer(false);
    await setPermissionPrimerSeen('location', true);
    lastDetectRef.current = null;
    await autoDetectPlace({
      allowWithoutImage: true,
      detectionKey: image ? `image:${image}` : 'screen_prefetch_retry',
    });
  }, [autoDetectPlace, image]);

  const handlePost = useCallback(async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    Keyboard.dismiss();

    try {
      const validation = validateCheckinSubmission({
        hasImage: !!image,
        userId: user?.id,
        userEmail: user?.email,
        userEmailVerified: user?.emailVerified,
        spot,
        placeId: activePlace?.placeId,
        location: activePlace?.location,
        caption,
        selectedTags,
        visibility,
        lastCheckinAt: await getLastCheckinAt(),
        noiseLevel,
        busyness,
        overallVibe,
        wifiSpeed,
        outletAvailability,
      });

      if (!validation.ok) {
        if (validation.reason === 'email_unverified') {
          showToast(validation.message, 'warning');
          router.replace('/verify');
          return;
        }
        if (validation.reason === 'missing_user' || validation.reason === 'rate_limited') {
          showToast(validation.message, 'warning');
        } else {
          setPostStatus({ message: validation.message, tone: 'warning' });
        }
        return;
      }

      if (validation.metricsProvided === 0) {
        showToast('Consider adding the quick pulse so others know what the spot is like right now.', 'info');
      }

      setLoading(true);

      if (isEditMode && editId) {
        try {
          await submitCheckinEdit({
            editId,
            user: user!,
            spot,
            activePlace,
            caption,
            selectedTags,
            photoTags,
            visitIntent,
            ambiance,
            visibility,
            noiseLevel,
            busyness,
            overallVibe,
            drinkPrice,
            drinkQuality,
            wifiSpeed,
            outletAvailability,
            laptopFriendly,
            parkingAvailability,
            parkingType,
          });
          showToast('Check-in updated.', 'success');
          resetDraftState();
          router.replace('/(tabs)/feed');
          return;
        } catch (error) {
          devLog('edit update failed', error);
          setPostStatus({ message: 'Unable to update. Try again.', tone: 'error' });
          return;
        }
      }

      const result = await submitNewCheckin({
        user: user!,
        image: image as string,
        spot,
        activePlace,
        caption,
        selectedTags,
        photoTags,
        visitIntent,
        ambiance,
        visibility,
        noiseLevel,
        busyness,
        overallVibe,
        drinkPrice,
        drinkQuality,
        wifiSpeed,
        outletAvailability,
        laptopFriendly,
        parkingAvailability,
        parkingType,
      });

      if (result.localSaved) {
        startCelebration();
      }
      setPendingRemote(result.syncOutcome === 'synced' ? null : result.pendingPayload);
      if (result.syncOutcome === 'synced') {
        if (activeRef.current) setPendingRemote(null);
        showToast('Check-in posted.', 'success');
      } else if (result.syncOutcome === 'queued') {
        showToast('Check-in queued. Posting in background.', 'success');
      } else {
        showToast('Upload failed. Check your connection and try Sync now from the feed.', 'warning');
      }
      resetDraftState();
      router.replace('/(tabs)/feed');
    } catch (error) {
      devLog('handlePost error', error);
      setPostStatus({ message: 'Unable to post right now. Check your connection and try again.', tone: 'error' });
      showToast('Unable to post right now.', 'error');
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  }, [
    activePlace,
    ambiance,
    busyness,
    caption,
    drinkPrice,
    drinkQuality,
    editId,
    image,
    isEditMode,
    laptopFriendly,
    noiseLevel,
    outletAvailability,
    overallVibe,
    parkingAvailability,
    parkingType,
    photoTags,
    resetDraftState,
    router,
    selectedTags,
    showToast,
    spot,
    startCelebration,
    user,
    visibility,
    visitIntent,
    wifiSpeed,
  ]);

  const retryRemotePost = useCallback(async () => {
    if (!pendingRemote) return;
    setLoading(true);
    try {
      const result = await retryQueuedCheckinSync();
      if (result.synced > 0) {
        setPendingRemote(null);
        setPostStatus({ message: 'Posted successfully.', tone: 'success' });
        showToast('Check-in synced.', 'success');
      } else {
        setPostStatus({ message: 'Still unable to post. Try again soon.', tone: 'warning' });
      }
    } catch (error) {
      devLog('retryRemotePost error', error);
      setPostStatus({ message: 'Still unable to post. Try again soon.', tone: 'warning' });
    } finally {
      setLoading(false);
    }
  }, [pendingRemote, showToast]);

  const buildStaticMapUrl = useCallback(
    (coords?: { lat: number; lng: number }, size = '200x140') =>
      buildCheckinStaticMapUrl(coords, mapsKey, size),
    [mapsKey],
  );

  useEffect(() => {
    if (metricsSummary.isComplete && !prevMetricsCompleteRef.current) {
      void safeNotification();
    }
    prevMetricsCompleteRef.current = metricsSummary.isComplete;
  }, [metricsSummary.isComplete]);

  useEffect(() => {
    const { editId: routeEditId, patch } = parseComposerRouteParams(params as Record<string, unknown>, spot);
    if (Object.keys(patch).length) {
      applyComposerHydration(patch);
    }
    if (routeEditId) {
      setIsEditMode(true);
      setEditId(routeEditId);
      void (async function loadEdit() {
        const checkin = await loadEditableCheckin(routeEditId);
        if (!checkin) return;
        applyComposerHydration(
          hydrateComposerFromSource(checkin, {
            placeSelectionSource: 'manual',
          }),
        );
      })();
    }
  }, [applyComposerHydration, params, spot]);

  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    void (async () => {
      try {
        const draft = await getCheckinDraft();
        if (draft && draft.savedAt && Date.now() - draft.savedAt < 24 * 60 * 60 * 1000) {
          applyComposerHydration(
            hydrateComposerFromSource(draft, {
              placeSelectionSource: 'manual',
            }),
          );
        }
      } catch {}
      draftLoadedRef.current = true;
      const mediaBootstrap = await loadCheckinMediaBootstrapState();
      setShowCameraPrimer(mediaBootstrap.showCameraPrimer);
      if (mediaBootstrap.hasCameraPermission !== null) {
        setHasPermission(mediaBootstrap.hasCameraPermission);
      }
      setBootstrapReady(true);
    })();
    logEvent('checkin_started', user?.id);
  }, [applyComposerHydration, user?.id]);

  useEffect(() => {
    return () => {
      activeRef.current = false;
      if (celebrationTimeoutRef.current) {
        clearTimeout(celebrationTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!draftLoadedRef.current) return;
    const draftSnapshot = {
      spot,
      caption,
      image,
      selectedTags,
      photoTags,
      visitIntent,
      ambiance,
      placeInfo,
      detectedPlace,
      noiseLevel,
      busyness,
      overallVibe,
      drinkPrice,
      drinkQuality,
      wifiSpeed,
      outletAvailability,
      laptopFriendly,
      parkingAvailability,
      parkingType,
    };
    if (!hasComposerDraftContent(draftSnapshot)) {
      if (!draftEmptyRef.current) {
        draftEmptyRef.current = true;
        void clearCheckinDraft();
      }
      return;
    }

    draftEmptyRef.current = false;
    const timer = setTimeout(() => {
      saveCheckinDraft(buildComposerDraftPayload(draftSnapshot));
    }, 400);
    return () => clearTimeout(timer);
  }, [
    ambiance,
    busyness,
    caption,
    detectedPlace,
    drinkPrice,
    drinkQuality,
    image,
    laptopFriendly,
    noiseLevel,
    outletAvailability,
    overallVibe,
    parkingAvailability,
    parkingType,
    photoTags,
    placeInfo,
    selectedTags,
    spot,
    visitIntent,
    wifiSpeed,
  ]);

  useEffect(() => {
    if (!bootstrapReady) return;
    if (showCameraPrimer) return;
    if (isEditMode) return;
    if (spot || placeInfo || detectedPlace || detecting) return;
    void autoDetectPlace({ allowWithoutImage: true, detectionKey: 'screen_prefetch' });
  }, [
    autoDetectPlace,
    bootstrapReady,
    detectedPlace,
    detecting,
    isEditMode,
    placeInfo,
    showCameraPrimer,
    spot,
  ]);

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
  }, [autoDetectPlace, image]);

  return {
    activePlace,
    ambiance,
    bootstrapReady,
    buildStaticMapUrl,
    busyness,
    caption,
    captured,
    clearAttachedPhoto,
    clearSpot,
    confirmCameraPrimer,
    confirmLocationPrimer,
    detectedCandidates,
    detectedPlace,
    detectionError,
    detectionLabel,
    detecting,
    displayPlace,
    drinkPrice,
    drinkQuality,
    handlePlaceSelect,
    handlePost,
    hasPermission,
    image,
    isEditMode,
    laptopFriendly,
    loading,
    mapPreviewUrl,
    metricsSummary,
    noiseLevel,
    openCamera,
    outletAvailability,
    overallVibe,
    parkingAvailability,
    parkingType,
    pendingRemote,
    photoTags,
    pickImage,
    placeInfo,
    placeModal,
    postStatus,
    replacePhoto,
    resolvingPlaceSelection,
    retryRemotePost,
    selectedTags,
    setAmbiance,
    setBusyness,
    setCaption,
    setDrinkPrice,
    setDrinkQuality,
    setOverallVibe,
    setLaptopFriendly,
    setNoiseLevel,
    setOutletAvailability,
    setParkingAvailability,
    setParkingType,
    setPlaceModal,
    setShowCameraPrimer,
    setShowLocationPrimer,
    setVisibility,
    setWifiSpeed,
    showCameraPrimer,
    showCelebration,
    showLocationPrimer,
    spot,
    submitState,
    togglePhotoTag,
    toggleTag,
    toggleVisitIntent,
    triggerHaptic,
    selectDetectedCandidate,
    selectDetectedPlace,
    user,
    visibility,
    visibilityNote,
    visitIntent,
    wifiSpeed,
  };
}

export const CHECKIN_DISCOVERY_INTENT_OPTIONS = DISCOVERY_INTENT_OPTIONS;
