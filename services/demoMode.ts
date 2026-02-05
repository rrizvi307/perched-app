import { getCheckins, getDemoModeEnabled, resetDemoNetwork, seedDemoNetwork, setDemoModeEnabled } from '@/storage/local';

export const DEMO_USER_IDS = [
  'demo-u1',
  'demo-u2',
  'demo-u3',
  'demo-u4',
  'demo-u5',
  'demo-u6',
  'demo-u7',
  'demo-u8',
  'demo-u9',
  'demo-u10',
  'demo-u11',
  'demo-u12',
  'demo-u13',
  'demo-u14',
  'demo-u15',
  'demo-u16',
] as const;

export function isDemoMode() {
  try {
    const globalDemo = (global as any).__PERCHED_DEMO;
    if (globalDemo) return true;
  } catch {}
  try {
    const windowDemo = typeof window !== 'undefined' ? (window as any).__PERCHED_DEMO : false;
    if (windowDemo) return true;
  } catch {}
  try {
    const env = (process.env.EXPO_PUBLIC_PERCHED_DEMO as string) || (process.env.PERCHED_DEMO as string) || '';
    if (env === '1' || env === 'true') return true;
  } catch {}
  try {
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search);
      const v = p.get('demo');
      if (v === '1' || v === 'true') return true;
    }
  } catch {}
  return false;
}

export function setGlobalDemoMode(enabled: boolean) {
  try {
    (global as any).__PERCHED_DEMO = !!enabled;
  } catch {}
  try {
    if (typeof window !== 'undefined') (window as any).__PERCHED_DEMO = !!enabled;
  } catch {}
}

let prefetched = false;
async function prefetchDemoImages() {
  if (prefetched) return;
  prefetched = true;
  try {
    const items = await getCheckins();
    const urls = Array.from(
      new Set(
        items
          .filter((c: any) => String(c?.id || '').startsWith('demo-c'))
          .flatMap((c: any) => [c?.photoUrl, c?.image, c?.userPhotoUrl])
          .filter((u: any) => typeof u === 'string' && u.startsWith('http'))
      )
    ).slice(0, 48);
    if (!urls.length) return;
    const mod: any = await import('expo-image');
    const Image = mod?.Image;
    if (Image?.prefetch) await Image.prefetch(urls, 'memory-disk');
  } catch {
    // ignore
  }
}

export async function ensureDemoModeReady(currentUserId?: string) {
  const forced = isDemoMode();
  if (forced) {
    try {
      await setDemoModeEnabled(true);
    } catch {}
  }
  const enabled = forced || (await getDemoModeEnabled().catch(() => false));
  if (!enabled) return false;
  setGlobalDemoMode(true);
  try {
    await seedDemoNetwork(currentUserId);
  } catch {}
  await prefetchDemoImages();
  return true;
}

export async function resetAndReseedDemo(currentUserId?: string) {
  try {
    await resetDemoNetwork();
  } catch {}
  setGlobalDemoMode(true);
  try {
    await seedDemoNetwork(currentUserId);
  } catch {}
  await prefetchDemoImages();
}

/**
 * Set demo mode on/off
 */
export async function setDemoMode(enabled: boolean) {
  setGlobalDemoMode(enabled);
  try {
    await setDemoModeEnabled(enabled);
  } catch (error) {
    console.error('Failed to set demo mode:', error);
  }
}
