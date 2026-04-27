import {
  STORAGE_KEYS,
  isWeb,
  readJsonItem,
  writeJsonItem,
} from './keyValueStore';

const permissionMemory: Record<string, boolean> = {};

async function readUserProfileMap() {
  return await readJsonItem<Record<string, any>>(STORAGE_KEYS.userProfile, {});
}

async function writeUserProfileMap(data: Record<string, any>) {
  await writeJsonItem(STORAGE_KEYS.userProfile, data);
}

export async function saveUserProfile(profile: any) {
  if (!profile?.id) return;
  const map = await readUserProfileMap();
  map[profile.id] = { ...map[profile.id], ...profile };
  await writeUserProfileMap(map);
}

export async function getUserProfile(userId: string) {
  if (!userId) return null;
  const map = await readUserProfileMap();
  return map[userId] || null;
}

export async function getPermissionPrimerSeen(key: string) {
  if (!key) return false;
  if (!isWeb() && key in permissionMemory) return !!permissionMemory[key];
  const data = await readJsonItem<Record<string, boolean>>(STORAGE_KEYS.permissionPrimer, {});
  if (!isWeb()) permissionMemory[key] = !!data[key];
  return !!data[key];
}

export async function setPermissionPrimerSeen(key: string, value = true) {
  if (!key) return;
  if (!isWeb()) permissionMemory[key] = value;
  const data = await readJsonItem<Record<string, boolean>>(STORAGE_KEYS.permissionPrimer, {});
  data[key] = value;
  await writeJsonItem(STORAGE_KEYS.permissionPrimer, data);
}
