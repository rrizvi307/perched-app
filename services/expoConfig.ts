import Constants from 'expo-constants';

type ExpoExtra = Record<string, any>;

function toRecord(value: unknown): ExpoExtra {
  return value && typeof value === 'object' ? (value as ExpoExtra) : {};
}

export function getExpoExtra(): ExpoExtra {
  const constants = Constants as any;
  return {
    ...toRecord(constants?.manifest2?.extra),
    ...toRecord(constants?.manifest2?.extra?.expoClient?.extra),
    ...toRecord(constants?.manifest?.extra),
    ...toRecord(constants?.expoConfig?.extra),
  };
}

export function getExpoExtraString(key: string): string {
  const value = getExpoExtra()?.[key];
  return typeof value === 'string' ? value : '';
}

export function getExpoFirebaseConfig(): Record<string, string> {
  const value = getExpoExtra()?.FIREBASE_CONFIG;
  return value && typeof value === 'object' ? (value as Record<string, string>) : {};
}

function readGlobalString(key: string): string {
  const value = (global as any)?.[key];
  return typeof value === 'string' ? value : '';
}

function readGlobalRecord(key: string): Record<string, string> {
  const value = (global as any)?.[key];
  return value && typeof value === 'object' ? (value as Record<string, string>) : {};
}

export function getExpoFunctionsProjectId(): string {
  const firebaseConfig = getExpoFirebaseConfig();
  return (
    (process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID as string) ||
    (process.env.FIREBASE_PROJECT_ID as string) ||
    firebaseConfig.projectId ||
    readGlobalString('FIREBASE_PROJECT_ID') ||
    readGlobalRecord('FIREBASE_CONFIG').projectId ||
    ''
  );
}

export function getExpoFunctionsRegion(): string {
  return (
    (process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION as string) ||
    (process.env.FIREBASE_FUNCTIONS_REGION as string) ||
    getExpoExtraString('FIREBASE_FUNCTIONS_REGION') ||
    readGlobalString('FIREBASE_FUNCTIONS_REGION') ||
    'us-central1'
  );
}

export function getExpoFunctionEndpoint(
  explicitKeys: string[],
  functionName: string,
): string {
  for (const key of explicitKeys) {
    const envValue =
      (process.env[`EXPO_PUBLIC_${key}`] as string | undefined) ||
      (process.env[key] as string | undefined);
    if (typeof envValue === 'string' && envValue.trim()) return envValue.trim();

    const extraValue = getExpoExtraString(key);
    if (extraValue.trim()) return extraValue.trim();

    const globalValue = readGlobalString(key);
    if (globalValue.trim()) return globalValue.trim();
  }

  const projectId = getExpoFunctionsProjectId();
  if (!projectId) return '';
  return `https://${getExpoFunctionsRegion()}-${projectId}.cloudfunctions.net/${functionName}`;
}
