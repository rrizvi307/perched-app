import { createCheckinRemote, ensureFirebase, getCheckinByClientId, updateCheckinRemote, uploadPhotoToStorage, updateUserRemote } from '@/services/firebaseClient';
import { getPendingCheckins, pruneInvalidPendingCheckins, removePendingCheckin, updateCheckinLocalByClientId, getPendingProfileUpdates, removePendingProfileUpdate, updatePendingCheckin } from '@/storage/local';
import { publishCheckin } from '@/services/feedEvents';

const inFlight = new Set<string>();
const profileInFlight = new Set<string>();

async function localFileExists(uri: string): Promise<boolean> {
  if (!uri || typeof uri !== 'string') return false;
  if (uri.startsWith('http') || uri.startsWith('data:')) return true;
  // Avoid false negatives if expo-file-system isn't available (e.g. web).
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const FileSystem = require('expo-file-system');
    if (FileSystem?.getInfoAsync) {
      const info = await FileSystem.getInfoAsync(uri);
      return !!info?.exists;
    }
  } catch {
    return true;
  }
  return true;
}

function formatSyncError(err: any) {
  if (!err) return 'Unknown error';
  const code = typeof err?.code === 'string' ? err.code : '';
  const name = typeof err?.name === 'string' ? err.name : '';
  const message = typeof err?.message === 'string' ? err.message : '';
  const base = message || String(err);
  const prefix = code || name;
  return prefix ? `${prefix}: ${base}` : base;
}

export async function syncPendingCheckins(limit = 5) {
  await pruneInvalidPendingCheckins().catch(() => {});
  const pendingAll = await getPendingCheckins();
  const fb = ensureFirebase();
  const currentUid = fb?.auth?.()?.currentUser?.uid || null;
  const pending = currentUid ? pendingAll.filter((p: any) => p?.userId === currentUid) : pendingAll;
  if (!pending.length) return { attempted: 0, synced: 0 };
  const batch = pending.slice(0, limit);
  let synced = 0;
  let failed = 0;
  let lastError: string | null = null;

  for (const item of batch) {
    try {
      if (!item?.clientId) continue;
      if (inFlight.has(item.clientId)) continue;
      inFlight.add(item.clientId);

      // Drop very old / invalid entries so users don't see "finishing uploads" forever.
      const queuedAt = typeof item.queuedAt === 'number' ? item.queuedAt : 0;
      const attempts = typeof item.attempts === 'number' ? item.attempts : 0;
      // Check-ins are ephemeral; if an upload is still stuck after ~24h, drop it to avoid permanent banners.
      if (!queuedAt || Date.now() - queuedAt > 24 * 60 * 60 * 1000) {
        await removePendingCheckin(item.clientId);
        inFlight.delete(item.clientId);
        continue;
      }
      if (attempts >= 10) {
        await removePendingCheckin(item.clientId);
        inFlight.delete(item.clientId);
        continue;
      }

      // If the local photo file is missing (common after app restarts for older URIs),
      // stop retrying forever. We'll keep the check-in text-only if it already exists remotely.
      const photoUrl = typeof item.photoUrl === 'string' ? item.photoUrl : '';
      if (photoUrl && !photoUrl.startsWith('http')) {
        const exists = await localFileExists(photoUrl);
        if (!exists) {
          try {
            const existing = await getCheckinByClientId(item.clientId);
            if (existing?.id) {
              await updateCheckinRemote(existing.id, { photoPending: false });
              const updated = await updateCheckinLocalByClientId(item.clientId, { photoUrl: null as any, image: null as any, photoPending: false });
              if (updated) publishCheckin(updated);
            }
          } catch {}
          await removePendingCheckin(item.clientId);
          inFlight.delete(item.clientId);
          synced += 1;
          continue;
        }
      }

      const now = Date.now();
      const lastAttemptAt = typeof item.lastAttemptAt === 'number' ? item.lastAttemptAt : 0;
      if (lastAttemptAt && now - lastAttemptAt < 15000) {
        inFlight.delete(item.clientId);
        continue;
      }
      await updatePendingCheckin(item.clientId, {
        lastAttemptAt: now,
        attempts: (typeof item.attempts === 'number' ? item.attempts : 0) + 1,
        lastError: null,
      });

      const remoteId = typeof item.remoteId === 'string' && item.remoteId ? item.remoteId : null;
      const existing = remoteId ? { id: remoteId, data: null } : await getCheckinByClientId(item.clientId);
      if (existing) {
        if (!remoteId) {
          await updatePendingCheckin(item.clientId, { remoteId: existing.id });
        }
        const currentPhoto = existing.data?.photoUrl;
        if (!currentPhoto && item.photoUrl && typeof item.photoUrl === 'string' && !item.photoUrl.startsWith('http')) {
          try {
            const uploaded = await uploadPhotoToStorage(item.photoUrl, item.userId);
            if (uploaded) {
              await updateCheckinRemote(existing.id, { photoUrl: uploaded, photoPending: false });
              const updated = await updateCheckinLocalByClientId(item.clientId, { photoUrl: uploaded, photoPending: false, image: uploaded });
              if (updated) publishCheckin(updated);
              await removePendingCheckin(item.clientId);
              synced += 1;
              inFlight.delete(item.clientId);
              continue;
            }
          } catch (e) {
            lastError = `Photo upload failed. ${formatSyncError(e)}`;
          }
          // keep pending if upload failed
          await updatePendingCheckin(item.clientId, { lastError: lastError || 'Photo upload failed. Check Firebase Storage + rules.' });
          if (item?.clientId) inFlight.delete(item.clientId);
          continue;
        }
        if (existing.data?.photoPending) {
        await updateCheckinRemote(existing.id, { photoPending: false });
        const updated = await updateCheckinLocalByClientId(item.clientId, { photoPending: false });
        if (updated) publishCheckin(updated);
        }
        await removePendingCheckin(item.clientId);
        synced += 1;
        inFlight.delete(item.clientId);
        continue;
      }
      let nextPhoto = item.photoUrl;
      let photoPending = false;
      if (nextPhoto && typeof nextPhoto === 'string' && !nextPhoto.startsWith('http')) {
        try {
          const uploaded = await uploadPhotoToStorage(nextPhoto, item.userId);
          if (uploaded) nextPhoto = uploaded;
        } catch (e) {
          lastError = `Photo upload failed. ${formatSyncError(e)}`;
        }
        if (nextPhoto && typeof nextPhoto === 'string' && !nextPhoto.startsWith('http')) {
          // allow remote check-in to exist without a photo while upload retries
          nextPhoto = null;
          photoPending = true;
          await updatePendingCheckin(item.clientId, { lastError: lastError || 'Photo upload pending' });
        }
      }
      const created = await createCheckinRemote({ ...item, photoUrl: nextPhoto, photoPending });
      if (created?.id) {
        await updatePendingCheckin(item.clientId, { remoteId: created.id });
      }
      if (nextPhoto && typeof nextPhoto === 'string' && nextPhoto.startsWith('http')) {
        const updated = await updateCheckinLocalByClientId(item.clientId, { photoUrl: nextPhoto, photoPending: false, image: nextPhoto });
        if (updated) publishCheckin(updated);
      }
      if (!photoPending) {
        await removePendingCheckin(item.clientId);
        synced += 1;
      }
      inFlight.delete(item.clientId);
    } catch (e) {
      // keep in queue
      failed += 1;
      lastError = `Sync failed. ${formatSyncError(e)}`;
      try {
        if (item?.clientId) {
          await updatePendingCheckin(item.clientId, { lastError });
        }
      } catch {}
      if (item?.clientId) inFlight.delete(item.clientId);
    }
  }

  return { attempted: batch.length, synced, failed, lastError };
}


export async function syncPendingProfileUpdates(limit = 5) {
  const pending = await getPendingProfileUpdates();
  if (!pending.length) return { attempted: 0, synced: 0 };
  const batch = pending.slice(0, limit);
  let synced = 0;

  for (const item of batch) {
    const userId = item?.userId;
    const fields = item?.fields || {};
    if (!userId || profileInFlight.has(userId)) continue;
    if (!fields || Object.keys(fields).length === 0) {
      await removePendingProfileUpdate(userId);
      continue;
    }
    profileInFlight.add(userId);
    try {
      await updateUserRemote(userId, fields);
      await removePendingProfileUpdate(userId);
      synced += 1;
    } catch {
      // keep in queue
    } finally {
      profileInFlight.delete(userId);
    }
  }

  return { attempted: batch.length, synced };
}
