#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_PLACE_PROVIDER_SMOKE_QUERIES = [
  'Blacksmith Houston TX',
  'Catalina Coffee Houston TX',
  'Boomtown Coffee Houston TX',
  'Agora Houston TX',
];

function parseDotenv(content) {
  const output = {};
  const lines = String(content || '').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const withoutExport = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eq = withoutExport.indexOf('=');
    if (eq <= 0) continue;

    const key = withoutExport.slice(0, eq).trim();
    if (!key) continue;
    let value = withoutExport.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    output[key] = value;
  }
  return output;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return parseDotenv(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

function hydrateLocalEnv() {
  const envFiles = [
    path.join(ROOT, '.env'),
    path.join(ROOT, '.env.local'),
  ];

  envFiles.forEach((filePath) => {
    const parsed = loadEnvFile(filePath);
    Object.entries(parsed).forEach(([key, value]) => {
      if (!process.env[key]) process.env[key] = value;
    });
  });
}

function isSet(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isTruthy(value, fallback = false) {
  if (!isSet(value)) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function readArgs(flag, argv = process.argv) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== flag) continue;
    const value = String(argv[index + 1] || '').trim();
    if (value) values.push(value);
  }
  return values;
}

function readArg(flag, argv = process.argv) {
  return readArgs(flag, argv)[0] || '';
}

function parseSmokeQueries(value) {
  if (!isSet(value)) return [];
  return String(value)
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getSmokeQueries(options = {}) {
  const argv = Array.isArray(options.argv) ? options.argv : process.argv;
  const env = options.env || process.env;
  const cliQueries = readArgs('--query', argv);
  if (cliQueries.length) return cliQueries;
  const envQueries = parseSmokeQueries(env.PLACE_PROVIDER_SMOKE_QUERY);
  if (envQueries.length) return envQueries;
  return [...DEFAULT_PLACE_PROVIDER_SMOKE_QUERIES];
}

function getCredentials() {
  return {
    email:
      readArg('--email') ||
      process.env.SMOKE_TEST_EMAIL ||
      process.env.APP_REVIEW_EMAIL ||
      '',
    password:
      readArg('--password') ||
      process.env.SMOKE_TEST_PASSWORD ||
      process.env.APP_REVIEW_PASSWORD ||
      '',
  };
}

function getFirebaseApiKey() {
  return String(
    process.env.FIREBASE_API_KEY ||
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY ||
    '',
  ).trim();
}

function getProjectId() {
  return String(process.env.FIREBASE_PROJECT_ID || '').trim();
}

function getFunctionsRegion() {
  return String(
    process.env.FIREBASE_FUNCTIONS_REGION ||
    process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION ||
    'us-central1',
  ).trim();
}

function getGooglePlacesProxyUrl(projectId) {
  const explicit = String(
    process.env.GOOGLE_PLACES_PROXY_ENDPOINT ||
    process.env.GOOGLE_MAPS_PROXY_ENDPOINT ||
    '',
  ).trim();
  if (explicit) return explicit;
  return `https://${getFunctionsRegion()}-${projectId}.cloudfunctions.net/googlePlacesProxy`;
}

function getPlaceSignalsProxyUrl(projectId) {
  const explicit = String(
    process.env.PLACE_INTEL_ENDPOINT ||
    process.env.PLACE_SIGNALS_PROXY_ENDPOINT ||
    '',
  ).trim();
  if (explicit) return explicit;
  return `https://${getFunctionsRegion()}-${projectId}.cloudfunctions.net/placeSignalsProxy`;
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return {
    ok: response.ok,
    status: response.status,
    text,
    json,
  };
}

async function signInWithPassword(apiKey, email, password) {
  const response = await fetchJson(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    },
  );
  if (!response.ok || !response.json?.idToken) {
    throw new Error(
      `Firebase sign-in failed (${response.status}): ${response.text || JSON.stringify(response.json || {})}`,
    );
  }
  return response.json.idToken;
}

function makeAuthHeaders(idToken) {
  return {
    Authorization: `Bearer ${idToken}`,
    'Content-Type': 'application/json',
  };
}

function preview(value) {
  if (typeof value === 'string') return value.slice(0, 240);
  try {
    return JSON.stringify(value).slice(0, 240);
  } catch {
    return String(value);
  }
}

function formatAttemptSummary(attempts) {
  return attempts
    .map((attempt) => {
      if (!attempt?.ok) {
        return `${attempt?.query || 'unknown'} -> error: ${attempt?.error || 'unknown error'}`;
      }
      return `${attempt.query} -> place=${attempt.placeName} signals=${attempt.externalSignalsCount} google=${attempt.hasGoogleSnapshot ? 'yes' : 'no'} photos=${attempt.providerPhotosCount}`;
    })
    .join(' | ');
}

function selectSmokeResult(attempts, requireProviderPhoto = false) {
  const successfulAttempts = attempts.filter((attempt) => attempt?.ok);
  const photoBackedAttempt = successfulAttempts.find(
    (attempt) => attempt.providerPhotosCount > 0,
  ) || null;
  const chosenAttempt = photoBackedAttempt || successfulAttempts[0] || null;

  if (!chosenAttempt) {
    return {
      ok: false,
      chosenAttempt: null,
      warning: null,
      error: `all place-provider smoke queries failed: ${formatAttemptSummary(attempts)}`,
    };
  }

  if (requireProviderPhoto && !photoBackedAttempt) {
    return {
      ok: false,
      chosenAttempt,
      warning: null,
      error: `placeSignalsProxy returned no provider photos for any smoke query. Attempts: ${formatAttemptSummary(attempts)}`,
    };
  }

  return {
    ok: true,
    chosenAttempt,
    warning: photoBackedAttempt
      ? null
      : `provider photos unavailable across ${successfulAttempts.length} successful place-provider smoke quer${successfulAttempts.length === 1 ? 'y' : 'ies'}; treating this as non-blocking because the runtime contract only requires external signals or Google snapshot data.`,
    error: null,
  };
}

async function runSmokeQuery({
  smokeQuery,
  googleProxyUrl,
  signalsProxyUrl,
  idToken,
}) {
  const searchResponse = await fetchJson(googleProxyUrl, {
    method: 'POST',
    headers: makeAuthHeaders(idToken),
    body: JSON.stringify({
      action: 'search_text',
      query: smokeQuery,
      limit: 5,
    }),
  });
  if (!searchResponse.ok) {
    throw new Error(`search_text failed (${searchResponse.status}): ${preview(searchResponse.json || searchResponse.text)}`);
  }
  const searchPlaces = Array.isArray(searchResponse.json?.places) ? searchResponse.json.places : [];
  if (!searchPlaces.length) {
    throw new Error(`search_text returned no places for "${smokeQuery}"`);
  }

  const primaryPlace = searchPlaces.find(
    (item) =>
      typeof item?.placeId === 'string' &&
      typeof item?.name === 'string' &&
      typeof item?.location?.lat === 'number' &&
      typeof item?.location?.lng === 'number',
  );
  if (!primaryPlace) {
    throw new Error(`search_text returned places but none had placeId + location: ${preview(searchPlaces[0])}`);
  }

  const nearbyResponse = await fetchJson(googleProxyUrl, {
    method: 'POST',
    headers: makeAuthHeaders(idToken),
    body: JSON.stringify({
      action: 'nearby',
      lat: primaryPlace.location.lat,
      lng: primaryPlace.location.lng,
      radius: 1200,
      intent: 'study',
    }),
  });
  if (!nearbyResponse.ok) {
    throw new Error(`nearby failed (${nearbyResponse.status}): ${preview(nearbyResponse.json || nearbyResponse.text)}`);
  }
  const nearbyPlaces = Array.isArray(nearbyResponse.json?.places) ? nearbyResponse.json.places : [];
  if (!nearbyPlaces.length) {
    throw new Error(`nearby returned no places around ${primaryPlace.name}`);
  }

  const detailsResponse = await fetchJson(googleProxyUrl, {
    method: 'POST',
    headers: makeAuthHeaders(idToken),
    body: JSON.stringify({
      action: 'details',
      placeId: primaryPlace.placeId,
    }),
  });
  if (!detailsResponse.ok || !detailsResponse.json?.place) {
    throw new Error(`details failed (${detailsResponse.status}): ${preview(detailsResponse.json || detailsResponse.text)}`);
  }

  const signalsResponse = await fetchJson(signalsProxyUrl, {
    method: 'POST',
    headers: makeAuthHeaders(idToken),
    body: JSON.stringify({
      placeName: primaryPlace.name,
      placeId: primaryPlace.placeId,
      location: primaryPlace.location,
    }),
  });
  if (!signalsResponse.ok) {
    throw new Error(`placeSignalsProxy failed (${signalsResponse.status}): ${preview(signalsResponse.json || signalsResponse.text)}`);
  }

  const externalSignals = Array.isArray(signalsResponse.json?.externalSignals)
    ? signalsResponse.json.externalSignals
    : [];
  const providerPhotos = Array.isArray(signalsResponse.json?.providerPhotos)
    ? signalsResponse.json.providerPhotos
    : [];
  const googleSnapshot = signalsResponse.json?.googleSnapshot || null;
  const degradedProviders = Array.isArray(signalsResponse.json?.degradedProviders)
    ? signalsResponse.json.degradedProviders.filter(Boolean)
    : [];

  if (!externalSignals.length && !googleSnapshot) {
    throw new Error(
      `placeSignalsProxy returned no intelligence payload for ${primaryPlace.name}: ${preview(signalsResponse.json)}`,
    );
  }

  return {
    ok: true,
    query: smokeQuery,
    placeName: primaryPlace.name,
    searchCount: searchPlaces.length,
    nearbyCount: nearbyPlaces.length,
    externalSignalsCount: externalSignals.length,
    providerPhotosCount: providerPhotos.length,
    hasGoogleSnapshot: Boolean(googleSnapshot),
    degradedProviders,
  };
}

async function main() {
  hydrateLocalEnv();

  const apiKey = getFirebaseApiKey();
  const projectId = getProjectId();
  const { email, password } = getCredentials();
  const smokeQueries = getSmokeQueries();
  const requireProviderPhoto = isTruthy(
    process.env.REQUIRE_PROVIDER_PHOTO_SMOKE_CHECK,
    false,
  );

  if (!isSet(apiKey)) {
    throw new Error('FIREBASE_API_KEY is required for place provider smoke checks.');
  }
  if (!isSet(projectId)) {
    throw new Error('FIREBASE_PROJECT_ID is required for place provider smoke checks.');
  }
  if (!isSet(email) || !isSet(password)) {
    throw new Error('SMOKE_TEST_EMAIL/SMOKE_TEST_PASSWORD (or APP_REVIEW_EMAIL/APP_REVIEW_PASSWORD) are required.');
  }

  const idToken = await signInWithPassword(apiKey, email, password);
  const googleProxyUrl = getGooglePlacesProxyUrl(projectId);
  const signalsProxyUrl = getPlaceSignalsProxyUrl(projectId);
  const attempts = [];

  for (const smokeQuery of smokeQueries) {
    try {
      const result = await runSmokeQuery({
        smokeQuery,
        googleProxyUrl,
        signalsProxyUrl,
        idToken,
      });
      attempts.push(result);
      if (result.providerPhotosCount > 0) break;
    } catch (error) {
      attempts.push({
        ok: false,
        query: smokeQuery,
        error: String(error?.message || error),
      });
    }
  }

  const outcome = selectSmokeResult(attempts, requireProviderPhoto);
  if (!outcome.ok || !outcome.chosenAttempt) {
    throw new Error(outcome.error || 'place provider smoke check failed');
  }

  if (outcome.warning) {
    process.stderr.write(`[place-provider-smoke-check] warning: ${outcome.warning}\n`);
  }

  process.stdout.write(
    `[place-provider-smoke-check] success query="${outcome.chosenAttempt.query}" place="${outcome.chosenAttempt.placeName}" search=${outcome.chosenAttempt.searchCount} nearby=${outcome.chosenAttempt.nearbyCount} signals=${outcome.chosenAttempt.externalSignalsCount} google=${outcome.chosenAttempt.hasGoogleSnapshot ? 'yes' : 'no'} photos=${outcome.chosenAttempt.providerPhotosCount} queriesTried=${attempts.length}\n`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`[place-provider-smoke-check] ${String(error?.message || error)}\n`);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_PLACE_PROVIDER_SMOKE_QUERIES,
  formatAttemptSummary,
  getSmokeQueries,
  parseSmokeQueries,
  selectSmokeResult,
};
