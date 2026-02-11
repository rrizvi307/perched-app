// Expo dynamic config. Keeps secrets out of git by loading from env at build time.
// Local dev: copy `.env.example` → `.env.local` and fill values.
// EAS Build: set these as environment variables / secrets.

function pickEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return "";
}

module.exports = ({ config }) => {
  const googleMapsApiKey = pickEnv("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY", "GOOGLE_MAPS_API_KEY");
  const sentryDsn = pickEnv("EXPO_PUBLIC_SENTRY_DSN", "SENTRY_DSN");
  const env = pickEnv("EXPO_PUBLIC_ENV", "ENV") || "development";
  const segmentWriteKey = pickEnv("EXPO_PUBLIC_SEGMENT_WRITE_KEY", "SEGMENT_WRITE_KEY");
  const mixpanelToken = pickEnv("EXPO_PUBLIC_MIXPANEL_TOKEN", "MIXPANEL_TOKEN");
  const revenueCatPublicKey = pickEnv("EXPO_PUBLIC_REVENUECAT_PUBLIC_KEY", "REVENUECAT_PUBLIC_KEY");
  const placeIntelEndpoint = pickEnv("EXPO_PUBLIC_PLACE_INTEL_ENDPOINT", "PLACE_INTEL_ENDPOINT");
  const intelV1Enabled = pickEnv("EXPO_PUBLIC_INTEL_V1_ENABLED", "INTEL_V1_ENABLED");
  const firebaseFunctionsRegion = pickEnv("EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION", "FIREBASE_FUNCTIONS_REGION") || "us-central1";

  const firebaseFromEnv = {
    apiKey: pickEnv("EXPO_PUBLIC_FIREBASE_API_KEY", "FIREBASE_API_KEY"),
    authDomain: pickEnv("EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN", "FIREBASE_AUTH_DOMAIN"),
    projectId: pickEnv("EXPO_PUBLIC_FIREBASE_PROJECT_ID", "FIREBASE_PROJECT_ID"),
    storageBucket: pickEnv("EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET", "FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: pickEnv("EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", "FIREBASE_MESSAGING_SENDER_ID"),
    appId: pickEnv("EXPO_PUBLIC_FIREBASE_APP_ID", "FIREBASE_APP_ID"),
    measurementId: pickEnv("EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID", "FIREBASE_MEASUREMENT_ID"),
  };

  const extra = config.extra || {};
  const baseFirebase = extra.FIREBASE_CONFIG && typeof extra.FIREBASE_CONFIG === "object" ? extra.FIREBASE_CONFIG : {};

  return {
    ...config,
    ios: {
      ...config.ios,
      config: {
        ...(config.ios?.config ?? {}),
        googleMapsApiKey: googleMapsApiKey || config.ios?.config?.googleMapsApiKey,
      },
    },
    android: {
      ...config.android,
      config: {
        ...(config.android?.config ?? {}),
        googleMaps: {
          ...(config.android?.config?.googleMaps ?? {}),
          apiKey: googleMapsApiKey || config.android?.config?.googleMaps?.apiKey,
        },
      },
    },
    extra: {
      ...extra,
      GOOGLE_MAPS_API_KEY: googleMapsApiKey || extra.GOOGLE_MAPS_API_KEY,
      FIREBASE_CONFIG: {
        ...baseFirebase,
        ...firebaseFromEnv,
      },
      SENTRY_DSN: sentryDsn || extra.SENTRY_DSN,
      ENV: env || extra.ENV,
      SEGMENT_WRITE_KEY: segmentWriteKey || extra.SEGMENT_WRITE_KEY,
      MIXPANEL_TOKEN: mixpanelToken || extra.MIXPANEL_TOKEN,
      REVENUECAT_PUBLIC_KEY: revenueCatPublicKey || extra.REVENUECAT_PUBLIC_KEY,
      PLACE_INTEL_ENDPOINT: placeIntelEndpoint || extra.PLACE_INTEL_ENDPOINT,
      INTEL_V1_ENABLED: (
        intelV1Enabled
          ? intelV1Enabled === "true" || intelV1Enabled === "1"
          : extra.INTEL_V1_ENABLED
      ),
      FIREBASE_FUNCTIONS_REGION: firebaseFunctionsRegion || extra.FIREBASE_FUNCTIONS_REGION,
    },
  };
};
