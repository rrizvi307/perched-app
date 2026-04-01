import Constants from 'expo-constants';

function readFlag(name: string): string {
  const extra = ((Constants.expoConfig as any)?.extra || {}) as Record<string, unknown>;
  const extraValue = extra[name];
  if (typeof extraValue === 'string') return extraValue;
  if (typeof extraValue === 'boolean') return extraValue ? 'true' : 'false';
  const envValue =
    (process.env[`EXPO_PUBLIC_${name}`] as string | undefined) ||
    (process.env[name] as string | undefined);
  return typeof envValue === 'string' ? envValue : '';
}

function isEnabled(name: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(readFlag(name).trim().toLowerCase());
}

export function isGrowthProgramsEnabled(): boolean {
  return isEnabled('ENABLE_GROWTH_PROGRAMS');
}

export function isProxyOnlyMode(): boolean {
  return isEnabled('FORCE_PROXY_ONLY');
}

export function isClientProviderCallsEnabled(): boolean {
  if (isProxyOnlyMode()) return false;
  const isTestEnv = typeof process !== 'undefined' && typeof process.env?.JEST_WORKER_ID === 'string';
  if (!(isTestEnv || !!__DEV__)) return false;
  // Keep Expo Go aligned with TestFlight by default. Direct provider calls are
  // only allowed as an explicit local debugging override.
  return isEnabled('ENABLE_CLIENT_PROVIDER_CALLS');
}
