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

function hasDevClientMapsKey(): boolean {
  const extra = ((Constants.expoConfig as any)?.extra || {}) as Record<string, unknown>;
  const iosGoogleMapsKey = (Constants.expoConfig as any)?.ios?.config?.googleMapsApiKey;
  const androidGoogleMapsKey = (Constants.expoConfig as any)?.android?.config?.googleMaps?.apiKey;
  const candidateValues = [
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
    process.env.GOOGLE_MAPS_API_KEY,
    typeof extra.GOOGLE_MAPS_API_KEY === 'string' ? extra.GOOGLE_MAPS_API_KEY : '',
    typeof iosGoogleMapsKey === 'string' ? iosGoogleMapsKey : '',
    typeof androidGoogleMapsKey === 'string' ? androidGoogleMapsKey : '',
    typeof (global as any)?.GOOGLE_MAPS_API_KEY === 'string' ? (global as any).GOOGLE_MAPS_API_KEY : '',
  ];
  return candidateValues.some((value) => typeof value === 'string' && value.trim().length > 0);
}

export function isGrowthProgramsEnabled(): boolean {
  return isEnabled('ENABLE_GROWTH_PROGRAMS');
}

export function isClientProviderCallsEnabled(): boolean {
  const isTestEnv = typeof process !== 'undefined' && typeof process.env?.JEST_WORKER_ID === 'string';
  if (!(isTestEnv || !!__DEV__)) return false;
  return isEnabled('ENABLE_CLIENT_PROVIDER_CALLS') || hasDevClientMapsKey();
}
