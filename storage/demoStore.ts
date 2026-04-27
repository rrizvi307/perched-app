import {
  STORAGE_KEYS,
  isWeb,
  readJsonItem,
  removeStoredItem,
  writeJsonItem,
} from './keyValueStore';

export type DemoCustomPhoto = { uri: string; fileName?: string | null };

export async function setDemoAutoApprove(enabled: boolean) {
  await writeJsonItem(STORAGE_KEYS.demoAutoApprove, !!enabled);
}

export async function getDemoAutoApprove() {
  return await readJsonItem<boolean>(STORAGE_KEYS.demoAutoApprove, false);
}

export async function setDemoModeEnabled(enabled: boolean) {
  try {
    try {
      (global as any).__PERCHED_DEMO = !!enabled;
    } catch {}
    try {
      if (typeof window !== 'undefined') (window as any).__PERCHED_DEMO = !!enabled;
    } catch {}
    await writeJsonItem(STORAGE_KEYS.demoModeEnabled, !!enabled);
  } catch {}
}

export async function getDemoModeEnabled() {
  return await readJsonItem<boolean>(STORAGE_KEYS.demoModeEnabled, false);
}

export async function setDemoCustomPhotos(photos: DemoCustomPhoto[]) {
  const cleaned = Array.isArray(photos)
    ? photos
        .filter((photo) => typeof photo?.uri === 'string' && photo.uri.trim().length > 0)
        .map((photo) => ({
          uri: photo.uri.trim(),
          fileName: typeof photo?.fileName === 'string' ? photo.fileName : null,
        }))
    : [];
  await writeJsonItem(STORAGE_KEYS.demoCustomPhotos, cleaned);
}

export async function getDemoCustomPhotos() {
  const fallback: DemoCustomPhoto[] = [];
  const photos = await readJsonItem<DemoCustomPhoto[]>(STORAGE_KEYS.demoCustomPhotos, fallback);
  return Array.isArray(photos) ? photos : fallback;
}

export async function clearDemoCustomPhotos() {
  if (isWeb()) {
    try {
      window.localStorage.removeItem(STORAGE_KEYS.demoCustomPhotos);
    } catch {}
    return;
  }
  await removeStoredItem(STORAGE_KEYS.demoCustomPhotos);
}
