import { getDemoModeEnabled, resetDemoNetwork, setDemoModeEnabled } from '@/storage/local';
import { clearLocationCache } from '@/services/location';
import { devLog } from '@/services/logger';

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

export function isDemoUserId(userId: unknown): boolean {
  const value = typeof userId === 'string' ? userId : '';
  return (DEMO_USER_IDS as readonly string[]).includes(value);
}

export function isCloudDemoCheckin(item: any): boolean {
  if (!item || typeof item !== 'object') return false;
  if (item.__demoCloudSeed === true) return true;
  const id = typeof item.id === 'string' ? item.id : '';
  if (id.startsWith('demo-cloud-') || id.startsWith('beta-public-')) return true;
  return isDemoUserId(item.userId);
}

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

export async function ensureDemoModeReady(currentUserId?: string) {
  void currentUserId;
  const forced = isDemoMode();
  if (forced) {
    try {
      await setDemoModeEnabled(true);

      // Clear cached location so demo data takes priority
      clearLocationCache();
    } catch {}
  }
  const enabled = forced || (await getDemoModeEnabled().catch(() => false));
  if (!enabled) return false;
  setGlobalDemoMode(true);
  try {
    // Cloud-only demo mode: remove any legacy local demo rows.
    await resetDemoNetwork();
  } catch {}
  return true;
}

export async function resetAndReseedDemo(currentUserId?: string) {
  void currentUserId;
  try {
    await resetDemoNetwork();
  } catch {}
  setGlobalDemoMode(true);
}

/**
 * Set demo mode on/off
 */
export async function setDemoMode(enabled: boolean) {
  setGlobalDemoMode(enabled);
  try {
    await setDemoModeEnabled(enabled);
    await resetDemoNetwork();
  } catch (error) {
    devLog('setDemoMode failed', error);
  }
}
