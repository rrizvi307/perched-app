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
