import { Directory, File, Paths } from 'expo-file-system';
import type { CheckinOutletAvailability } from '@/domains/checkin/checkinComposerState';
import type { DiscoveryIntent } from '@/services/discoveryIntents';
import { publishCheckin } from '@/services/feedEvents';
import { updateMetricsImpact } from '@/services/metricsImpact';
import { devLog } from '@/services/logger';
import { updateStatsAfterCheckin, getUserStats } from '@/services/gamification';
import { notifyAchievementUnlocked, scheduleStreakReminder } from '@/services/smartNotifications';
import { promptRatingAtMoment, RatingTriggers, trackCheckinForRating } from '@/services/appRating';
import {
  getCheckinById,
  recordPlaceEventRemote,
  recordPlaceTagRemote,
  updateCheckinPhotoVisibility,
  updateCheckinRemote,
} from '@/services/repositories/checkinRepository';
import { classifySpotCategory } from '@/services/spotUtils';
import { syncPendingCheckins } from '@/services/syncPending';
import {
  clearCheckinDraft,
  enqueuePendingCheckin,
  getCheckins,
  recordPlaceEvent,
  recordPlaceTag,
  saveCheckin,
  setLastCheckinAt,
  updateCheckinLocalById,
} from '@/storage/local';

type CheckinPlace = {
  placeId?: string | null;
  location?: { lat: number; lng: number } | null;
} | null;

type CheckinUser = {
  id: string;
  email?: string | null;
  handle?: string | null;
  name?: string | null;
  photoUrl?: string | null;
  city?: string | null;
  campus?: string | null;
  campusOrCity?: string | null;
};

type CheckinComposerInput = {
  user: CheckinUser;
  spot: string;
  activePlace: CheckinPlace;
  caption: string;
  selectedTags: string[];
  photoTags: string[];
  visitIntent: DiscoveryIntent[];
  ambiance: string | null;
  visibility: 'public' | 'friends' | 'close';
  noiseLevel: number | null;
  busyness: number | null;
  overallVibe: number | null;
  drinkPrice: number | null;
  drinkQuality: number | null;
  wifiSpeed: number | null;
  outletAvailability: CheckinOutletAvailability;
  laptopFriendly: boolean | null;
  parkingAvailability: string | null;
  parkingType: string | null;
};

type SubmitNewCheckinInput = CheckinComposerInput & {
  image: string;
};

type SubmitCheckinEditInput = CheckinComposerInput & {
  editId: string;
};

export type SubmitNewCheckinResult = {
  localSaved: boolean;
  pendingPayload: any;
  syncOutcome: 'synced' | 'queued' | 'failed';
};

function buildSharedCheckinFields(input: CheckinComposerInput) {
  return {
    spotName: input.spot,
    spotPlaceId: input.activePlace?.placeId,
    spotLatLng: input.activePlace?.location,
    caption: input.caption,
    tags: input.selectedTags,
    photoTags: input.photoTags.slice(0, 3),
    visitIntent: input.visitIntent.slice(0, 2),
    ambiance: input.ambiance ?? null,
    visibility: input.visibility,
    noiseLevel: input.noiseLevel ?? null,
    busyness: input.busyness ?? null,
    overallVibe: input.overallVibe ?? null,
    drinkPrice: input.drinkPrice ?? null,
    drinkQuality: input.drinkQuality ?? null,
    wifiSpeed: input.wifiSpeed ?? null,
    outletAvailability: input.outletAvailability ?? null,
    laptopFriendly: input.laptopFriendly ?? null,
    parkingAvailability: input.parkingAvailability ?? null,
    parkingType: input.parkingType ?? null,
  };
}

async function persistCheckinImage(image: string) {
  let persistedImage = image;
  try {
    if (persistedImage && !persistedImage.startsWith('http') && !persistedImage.startsWith('data:')) {
      const dir = new Directory(Paths.document, 'perched-photos');
      try {
        dir.create({ idempotent: true, intermediates: true });
      } catch {}
      const target = new File(dir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`);
      new File(persistedImage).copy(target);
      persistedImage = target.uri;
    }
  } catch {}
  return persistedImage;
}

async function runPostSaveEffects(userId: string, placeId: string | null | undefined, localPayload: any) {
  let stats;
  if (placeId) {
    try {
      stats = await updateStatsAfterCheckin(placeId, Date.now());
    } catch (error) {
      devLog('gamification stats update failed', error);
    }
  }

  try {
    if (!stats) stats = await getUserStats();
    await trackCheckinForRating();

    if (stats.streakDays === 3 || stats.streakDays === 7 || stats.streakDays === 30 || stats.streakDays === 100) {
      await notifyAchievementUnlocked(`${stats.streakDays} Day Streak`, '🔥');
      setTimeout(() => {
        void promptRatingAtMoment(RatingTriggers.MILESTONE_REACHED);
      }, 2000);
    }

    await scheduleStreakReminder();

    if (stats.totalCheckins === 10 || stats.totalCheckins === 25) {
      setTimeout(() => {
        void promptRatingAtMoment(RatingTriggers.MILESTONE_REACHED);
      }, 2000);
    }
  } catch (error) {
    devLog('celebration/notification flow failed', error);
  }

  try {
    await updateMetricsImpact(userId, localPayload);
  } catch (error) {
    devLog('metrics impact update failed (new checkin)', error);
  }
}

function recordPlaceSignals(userId: string, spot: string, activePlace: CheckinPlace, selectedTags: string[]) {
  const eventPayload = {
    event: 'checkin' as const,
    ts: Date.now(),
    userId,
    placeId: activePlace?.placeId || null,
    name: spot,
    category: classifySpotCategory(spot),
  };
  recordPlaceEvent(eventPayload);
  void recordPlaceEventRemote(eventPayload);

  if (!selectedTags.length) return;
  selectedTags.forEach((tag) => {
    recordPlaceTag(activePlace?.placeId || null, spot, tag, 1);
    void recordPlaceTagRemote({ placeId: activePlace?.placeId || null, name: spot, tag, delta: 1 });
  });
}

export async function loadEditableCheckin(editId: string) {
  try {
    const remote = await getCheckinById(editId);
    if (remote) return remote;
  } catch {}

  try {
    const local = await getCheckins();
    return (local || []).find((item: any) => String(item?.id || item?.clientId || '') === String(editId)) || null;
  } catch {
    return null;
  }
}

export async function submitCheckinEdit(input: SubmitCheckinEditInput) {
  const existingCheckin = await getCheckinById(input.editId);
  const updates = buildSharedCheckinFields(input);

  await updateCheckinRemote(input.editId, updates);
  if (typeof existingCheckin?.photoPath === 'string' && existingCheckin.photoPath && existingCheckin.visibility !== input.visibility) {
    await updateCheckinPhotoVisibility(existingCheckin.photoPath, input.user.id, input.visibility);
  }

  await updateCheckinLocalById(input.editId, updates as any);
  publishCheckin({ id: input.editId, ...updates });

  try {
    await updateMetricsImpact(input.user.id, updates);
  } catch (error) {
    devLog('metrics impact update failed (edit)', error);
  }

  try {
    await clearCheckinDraft();
  } catch {}
}

export async function submitNewCheckin(input: SubmitNewCheckinInput): Promise<SubmitNewCheckinResult> {
  const persistedImage = await persistCheckinImage(input.image);
  const clientId = `client-${Date.now()}`;
  const displayName =
    input.user.name ||
    input.user.handle ||
    (input.user.email ? input.user.email.split('@')[0] : null) ||
    'Someone';
  const sharedFields = buildSharedCheckinFields(input);

  const localPayload = {
    spot: input.spot,
    ...sharedFields,
    image: persistedImage,
    photoUrl: persistedImage,
    userId: input.user.id,
    userName: displayName,
    userHandle: input.user.handle,
    userPhotoUrl: input.user.photoUrl,
    city: input.user.city,
    campus: input.user.campus,
    clientId,
  } as any;

  const pendingPayload = {
    userId: input.user.id,
    userName: displayName,
    userHandle: input.user.handle,
    userPhotoUrl: input.user.photoUrl,
    ...sharedFields,
    spotName: input.spot,
    photoUrl: persistedImage,
    campusOrCity: input.user.campusOrCity || input.user.city,
    city: input.user.city,
    campus: input.user.campus,
    clientId,
  };

  let localSaved = false;
  try {
    const savedLocal = await saveCheckin(localPayload);
    publishCheckin(savedLocal);
    await setLastCheckinAt(Date.now());
    localSaved = true;
    await runPostSaveEffects(input.user.id, input.activePlace?.placeId, localPayload);
  } catch {}

  await enqueuePendingCheckin(pendingPayload);
  recordPlaceSignals(input.user.id, input.spot, input.activePlace, input.selectedTags);

  let syncOutcome: SubmitNewCheckinResult['syncOutcome'] = 'queued';
  try {
    const result = await syncPendingCheckins(1);
    syncOutcome = result.synced > 0 ? 'synced' : 'queued';
  } catch {
    syncOutcome = 'failed';
  }

  try {
    await clearCheckinDraft();
  } catch {}

  return {
    localSaved,
    pendingPayload,
    syncOutcome,
  };
}

export async function retryQueuedCheckinSync() {
  return syncPendingCheckins(1);
}
