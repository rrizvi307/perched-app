import { createCheckinRemote, ensureFirebase, getCheckinByClientId, getCheckinById, updateCheckinRemote, uploadCheckinPhotoToStorage, updateUserRemote } from '@/services/firebaseClient';
import { getPendingCheckins, pruneInvalidPendingCheckins, removePendingCheckin, updateCheckinLocalByClientId, getPendingProfileUpdates, removePendingProfileUpdate, updatePendingCheckin } from '@/storage/local';
import { publishCheckin } from '@/services/feedEvents';
import { logEvent } from '@/services/logEvent';

const inFlight = new Set<string>();
const profileInFlight = new Set<string>();

async function resolveRemoteCheckinForPending(item: any): Promise<{ id: string; data: any } | null> {
  const remoteId = typeof item?.remoteId === 'string' && item.remoteId ? item.remoteId : '';
  if (remoteId) {
    try {
      const fetched = await getCheckinById(remoteId);
      if (fetched) return { id: fetched.id, data: fetched };
      return { id: remoteId, data: null };
    } catch {
      return { id: remoteId, data: null };
    }
  }
  const clientId = typeof item?.clientId === 'string' ? item.clientId : '';
  if (!clientId) return null;
  try {
    return await getCheckinByClientId(clientId);
  } catch {
    return null;
  }
}

async function clearRemotePhotoPending(item: any): Promise<void> {
  const existing = await resolveRemoteCheckinForPending(item);
  if (!existing?.id) return;
  try {
    await updateCheckinRemote(existing.id, { photoPending: false });
  } catch {}
}

async function localFileExists(uri: string): Promise<boolean> {
  if (!uri || typeof uri !== 'string') return false;
  if (uri.startsWith('http') || uri.startsWith('data:') || uri.startsWith('gs://')) return true;
  try {
    const FileSystem = require('expo-file-system');
    if (FileSystem?.File) {
      return !!new FileSystem.File(uri).exists;
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

function isRemotePhotoReference(value: unknown) {
  if (typeof value !== 'string') return false;
  return value.startsWith('http') || value.startsWith('gs://');
}

function shouldProtectCheckinPhoto(visibility: unknown) {
  return visibility === 'friends' || visibility === 'close';
}

function getRemotePhotoFields(data: any) {
  const photoUrl = typeof data?.photoUrl === 'string' && data.photoUrl.startsWith('http') ? data.photoUrl : null;
  const photoPath = typeof data?.photoPath === 'string' && data.photoPath.startsWith('gs://') ? data.photoPath : null;
  return {
    photoUrl,
    photoPath,
    renderSource: photoUrl || photoPath || null,
  };
}

function buildUploadedPhotoFields(uploaded: { downloadURL: string; storagePath: string }, visibility: unknown) {
  const protectedPhoto = shouldProtectCheckinPhoto(visibility);
  const remote = protectedPhoto
    ? { photoUrl: null, photoPath: uploaded.storagePath, photoPending: false }
    : { photoUrl: uploaded.downloadURL, photoPath: uploaded.storagePath, photoPending: false };
  const local = protectedPhoto
    ? { photoUrl: null, photoPath: uploaded.storagePath, photoPending: false, image: uploaded.storagePath }
    : { photoUrl: uploaded.downloadURL, photoPath: uploaded.storagePath, photoPending: false, image: uploaded.downloadURL };
  return { remote, local };
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

      const queuedAt = typeof item.queuedAt === 'number' ? item.queuedAt : 0;
      const attempts = typeof item.attempts === 'number' ? item.attempts : 0;
      if (!queuedAt || Date.now() - queuedAt > 24 * 60 * 60 * 1000) {
        await clearRemotePhotoPending(item);
        void logEvent('photo_sync_dropped', item.userId, { reason: 'ttl', age: queuedAt ? Date.now() - queuedAt : null, attempts, lastError: item.lastError || null });
        await removePendingCheckin(item.clientId);
        inFlight.delete(item.clientId);
        continue;
      }
      if (attempts >= 10) {
        await clearRemotePhotoPending(item);
        void logEvent('photo_sync_dropped', item.userId, { reason: 'retry_limit', attempts, lastError: item.lastError || null });
        await removePendingCheckin(item.clientId);
        inFlight.delete(item.clientId);
        continue;
      }

      const localPhotoUrl = typeof item.photoUrl === 'string' ? item.photoUrl : '';
      const hasLocalPhotoFile = !!localPhotoUrl && !isRemotePhotoReference(localPhotoUrl);
      if (hasLocalPhotoFile) {
        const exists = await localFileExists(localPhotoUrl);
        if (!exists) {
          void logEvent('photo_file_missing', item.userId, { photoUrl: localPhotoUrl, remoteId: item.remoteId || null });
          try {
            const existing = await resolveRemoteCheckinForPending(item);
            if (existing?.id) {
              const remotePhoto = getRemotePhotoFields(existing.data);
              if (remotePhoto.renderSource) {
                const updated = await updateCheckinLocalByClientId(item.clientId, {
                  photoUrl: remotePhoto.photoUrl,
                  photoPath: remotePhoto.photoPath,
                  image: remotePhoto.renderSource,
                  photoPending: false,
                });
                if (updated) publishCheckin(updated);
                await updateCheckinRemote(existing.id, { photoPending: false });
                await removePendingCheckin(item.clientId);
                inFlight.delete(item.clientId);
                synced += 1;
                continue;
              }
              await updateCheckinRemote(existing.id, { photoPending: false });
              const updated = await updateCheckinLocalByClientId(item.clientId, { photoUrl: null as any, photoPath: null as any, image: null as any, photoPending: false });
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
      const existing = await resolveRemoteCheckinForPending(item);
      if (existing) {
        if (!remoteId) {
          await updatePendingCheckin(item.clientId, { remoteId: existing.id });
        }
        const remotePhoto = getRemotePhotoFields(existing.data);
        if (!remotePhoto.renderSource && hasLocalPhotoFile) {
          try {
            const uploaded = await uploadCheckinPhotoToStorage(localPhotoUrl, {
              userId: item.userId,
              checkinId: existing.id,
              visibility: item.visibility,
            });
            const syncedPhoto = buildUploadedPhotoFields(uploaded, item.visibility);
            await updateCheckinRemote(existing.id, syncedPhoto.remote);
            const updated = await updateCheckinLocalByClientId(item.clientId, syncedPhoto.local);
            if (updated) publishCheckin(updated);
            await removePendingCheckin(item.clientId);
            synced += 1;
            inFlight.delete(item.clientId);
            continue;
          } catch (e) {
            lastError = `Photo upload failed. ${formatSyncError(e)}`;
            void logEvent('photo_upload_failed', item.userId, {
              phase: 'update_existing',
              checkinId: existing.id,
              clientId: item.clientId,
              attempts: (typeof item.attempts === 'number' ? item.attempts : 0) + 1,
              error: formatSyncError(e),
            });
            await updatePendingCheckin(item.clientId, { lastError: lastError || 'Photo upload failed. Check Firebase Storage + rules.' });
            inFlight.delete(item.clientId);
            continue;
          }
        }
        if (remotePhoto.renderSource) {
          const updated = await updateCheckinLocalByClientId(item.clientId, {
            photoUrl: remotePhoto.photoUrl,
            photoPath: remotePhoto.photoPath,
            image: remotePhoto.renderSource,
            photoPending: false,
          });
          if (updated) publishCheckin(updated);
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

      const initialRemotePhotoUrl = isRemotePhotoReference(item.photoUrl) && String(item.photoUrl).startsWith('http')
        ? String(item.photoUrl)
        : null;
      const initialRemotePhotoPath = typeof item.photoPath === 'string' && item.photoPath.startsWith('gs://')
        ? item.photoPath
        : null;
      const created = await createCheckinRemote({
        ...item,
        photoUrl: hasLocalPhotoFile ? null : initialRemotePhotoUrl,
        photoPath: hasLocalPhotoFile ? null : initialRemotePhotoPath,
        photoPending: hasLocalPhotoFile,
      });
      if (!created?.id) throw new Error('Remote check-in creation failed.');

      await updatePendingCheckin(item.clientId, { remoteId: created.id });
      if (hasLocalPhotoFile) {
        try {
          const uploaded = await uploadCheckinPhotoToStorage(localPhotoUrl, {
            userId: item.userId,
            checkinId: created.id,
            visibility: item.visibility,
          });
          const syncedPhoto = buildUploadedPhotoFields(uploaded, item.visibility);
          await updateCheckinRemote(created.id, syncedPhoto.remote);
          const updated = await updateCheckinLocalByClientId(item.clientId, syncedPhoto.local);
          if (updated) publishCheckin(updated);
          await removePendingCheckin(item.clientId);
          synced += 1;
          inFlight.delete(item.clientId);
          continue;
        } catch (e) {
          lastError = `Photo upload failed. ${formatSyncError(e)}`;
          void logEvent('photo_upload_failed', item.userId, {
            phase: 'create_new',
            remoteId: created.id,
            clientId: item.clientId,
            attempts: (typeof item.attempts === 'number' ? item.attempts : 0) + 1,
            error: formatSyncError(e),
          });
          await updatePendingCheckin(item.clientId, { lastError: lastError || 'Photo upload pending' });
          inFlight.delete(item.clientId);
          continue;
        }
      }

      await removePendingCheckin(item.clientId);
      synced += 1;
      inFlight.delete(item.clientId);
    } catch (e) {
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
