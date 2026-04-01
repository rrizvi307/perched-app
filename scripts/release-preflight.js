#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const REQUIRED_FIREBASE_CONFIG_KEYS = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
];
const REQUIRED_SECRETS = [
  'FIREBASE_API_KEY',
  'FIREBASE_AUTH_DOMAIN',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_STORAGE_BUCKET',
  'FIREBASE_MESSAGING_SENDER_ID',
  'FIREBASE_APP_ID',
  'GOOGLE_MAPS_API_KEY',
  'OPENAI_API_KEY',
  'YELP_API_KEY',
  'FOURSQUARE_API_KEY',
];
const OPTIONAL_SECRETS = [
  'FIREBASE_MEASUREMENT_ID',
  'SENTRY_DSN',
  'SEGMENT_WRITE_KEY',
  'MIXPANEL_TOKEN',
  'REVENUECAT_PUBLIC_KEY',
  'PLACE_INTEL_ENDPOINT',
];
const REQUIRED_SUBMISSION_FLAGS = [
  'REQUIRE_AUTH_SMOKE_CHECK',
  'REQUIRE_PLACE_PROVIDER_SMOKE_CHECK',
  'REQUIRE_PROXY_ONLY_PARITY',
  'REQUIRE_POST_DEPLOY_SMOKE_CHECK',
];

function parseDotenv(content) {
  const output = {};
  const lines = content.split(/\r?\n/);
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

function loadProductionEasEnv() {
  const easPath = path.join(ROOT, 'eas.json');
  if (!fs.existsSync(easPath)) return {};
  try {
    const eas = JSON.parse(fs.readFileSync(easPath, 'utf8'));
    const env = eas?.build?.production?.env;
    return env && typeof env === 'object' ? env : {};
  } catch {
    return {};
  }
}

function isSet(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
}

function isSubmissionEnv(env) {
  return String(env?.ENV || '').trim().toLowerCase() === 'production';
}

function isProxyOnlyEnabled(env) {
  return isTruthy(env?.FORCE_PROXY_ONLY) || isTruthy(env?.EXPO_PUBLIC_FORCE_PROXY_ONLY);
}

function evaluateSubmissionGate(env) {
  const errors = [];

  if (!isSubmissionEnv(env)) {
    errors.push('ENV=production is required for the App Store submission gate.');
  }

  for (const key of REQUIRED_SUBMISSION_FLAGS) {
    if (!isTruthy(env?.[key])) {
      errors.push(`${key}=true is required for the App Store submission gate.`);
    }
  }

  if (!isSet(env?.SMOKE_TEST_EMAIL)) {
    errors.push('SMOKE_TEST_EMAIL is required for the App Store submission gate.');
  }

  if (!isSet(env?.SMOKE_TEST_PASSWORD)) {
    errors.push('SMOKE_TEST_PASSWORD is required for the App Store submission gate.');
  }

  if (!isProxyOnlyEnabled(env)) {
    errors.push('FORCE_PROXY_ONLY=true or EXPO_PUBLIC_FORCE_PROXY_ONLY=true is required for the App Store submission gate.');
  }

  return {
    errors,
    proxyOnlyEnabled: isProxyOnlyEnabled(env),
    hasSmokeCredentials: isSet(env?.SMOKE_TEST_EMAIL) && isSet(env?.SMOKE_TEST_PASSWORD),
  };
}

function runStep(name, cmd, args) {
  process.stdout.write(`\n[preflight] ${name}\n`);
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.stderr.write(`[preflight] failed: ${name}\n`);
    process.exit(result.status || 1);
  }
}

function resolveExpoConfig(env) {
  const appJsonPath = path.join(ROOT, 'app.json');
  const appConfigPath = path.join(ROOT, 'app.config.js');

  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  const baseConfig = appJson?.expo || {};
  const previousEnv = {};
  Object.keys(env || {}).forEach((key) => {
    previousEnv[key] = process.env[key];
    process.env[key] = env[key];
  });

  delete require.cache[require.resolve(appConfigPath)];
  const exported = require(appConfigPath);
  const resolved = typeof exported === 'function' ? exported({ config: baseConfig }) : exported;

  Object.keys(env || {}).forEach((key) => {
    if (previousEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previousEnv[key];
    }
  });
  return resolved || baseConfig;
}

function main() {
  const dotenvValues = {
    ...loadEnvFile(path.join(ROOT, '.env')),
    ...loadEnvFile(path.join(ROOT, '.env.local')),
  };
  const easProductionEnv = loadProductionEasEnv();
  const merged = {
    ...dotenvValues,
    ...easProductionEnv,
    ...process.env,
  };

  process.stdout.write('[preflight] validating App Store submission gate\n');
  const submissionGate = evaluateSubmissionGate(merged);
  if (submissionGate.errors.length > 0) {
    process.stderr.write('[preflight] submission gate is not configured:\n');
    for (const error of submissionGate.errors) {
      process.stderr.write(`- ${error}\n`);
    }
    process.stderr.write(
      '\nSet the required smoke credentials and release flags before cutting or submitting a build.\n'
    );
    process.exit(1);
  }

  const missingRequired = REQUIRED_SECRETS.filter((key) => !isSet(merged[key]));
  const missingOptional = OPTIONAL_SECRETS.filter((key) => !isSet(merged[key]));

  process.stdout.write('[preflight] checking required env/secrets\n');
  if (missingRequired.length > 0) {
    process.stderr.write('[preflight] missing required keys:\n');
    for (const key of missingRequired) {
      process.stderr.write(`- ${key}\n`);
    }
    process.stderr.write('\nSet these in `.env.local` and EAS env/secrets before release.\n');
    process.exit(1);
  }

  if (missingOptional.length > 0) {
    process.stdout.write('[preflight] optional keys not set:\n');
    for (const key of missingOptional) {
      process.stdout.write(`- ${key}\n`);
    }
  }

  process.stdout.write('\n[preflight] checking resolved Expo Firebase config\n');
  const resolvedExpoConfig = resolveExpoConfig(merged);
  const resolvedFirebaseConfig = resolvedExpoConfig?.extra?.FIREBASE_CONFIG || {};
  const missingResolvedFirebase = REQUIRED_FIREBASE_CONFIG_KEYS.filter(
    (key) => !isSet(resolvedFirebaseConfig[key]),
  );
  if (missingResolvedFirebase.length > 0) {
    process.stderr.write('[preflight] resolved Expo config is missing Firebase keys:\n');
    for (const key of missingResolvedFirebase) {
      process.stderr.write(`- FIREBASE_CONFIG.${key}\n`);
    }
    process.stderr.write('\nThis means the release build can still ship with broken Firebase auth even if env vars exist.\n');
    process.exit(1);
  }

  const resolvedEnv = String(resolvedExpoConfig?.extra?.ENV || '').trim();
  if (!resolvedEnv) {
    process.stderr.write('[preflight] resolved Expo config is missing extra.ENV\n');
    process.exit(1);
  }
  if (resolvedEnv.toLowerCase() !== 'production') {
    process.stderr.write(
      `[preflight] resolved Expo ENV must be "production" for submission builds, found "${resolvedEnv}".\n`
    );
    process.exit(1);
  }

  runStep('TypeScript check', 'npm', ['run', 'typecheck']);
  runStep('Lint', 'npm', ['run', 'lint']);
  runStep('Tests', 'npm', ['run', 'test:unit', '--', '--runInBand']);
  runStep('TestFlight readiness audit', 'npm', ['run', 'audit:testflight']);
  runStep('App Store preflight', 'npm', ['run', 'appstore:preflight']);

  const hasSmokeCredentials = submissionGate.hasSmokeCredentials;
  const requireAuthSmokeCheck = isTruthy(merged.REQUIRE_AUTH_SMOKE_CHECK);
  const requirePlaceProviderSmokeCheck = isTruthy(merged.REQUIRE_PLACE_PROVIDER_SMOKE_CHECK);
  const requireProxyOnlyParity = isTruthy(merged.REQUIRE_PROXY_ONLY_PARITY);
  const proxyOnlyEnabled = submissionGate.proxyOnlyEnabled;
  const requirePostDeploySmokeCheck = isTruthy(merged.REQUIRE_POST_DEPLOY_SMOKE_CHECK);

  if (requireProxyOnlyParity && !proxyOnlyEnabled) {
    process.stderr.write(
      '[preflight] proxy-only parity is required but FORCE_PROXY_ONLY/EXPO_PUBLIC_FORCE_PROXY_ONLY is not enabled.\n'
    );
    process.exit(1);
  }
  process.stdout.write('\n[preflight] proxy-only parity flag is enabled. Run the manual proxy-only app pass before cutting the build.\n');

  if (hasSmokeCredentials) {
    runStep('Firebase auth smoke check', 'npm', ['run', 'auth:smoke-check']);
    runStep('Place provider smoke check', 'npm', ['run', 'place-provider:smoke-check']);
  } else if (requireAuthSmokeCheck) {
    process.stderr.write(
      '[preflight] auth smoke check required but SMOKE_TEST_EMAIL/SMOKE_TEST_PASSWORD (or APP_REVIEW_EMAIL/APP_REVIEW_PASSWORD) are not set.\n'
    );
    process.exit(1);
  }

  if (!hasSmokeCredentials && requirePlaceProviderSmokeCheck) {
    process.stderr.write(
      '[preflight] place provider smoke check required but SMOKE_TEST_EMAIL/SMOKE_TEST_PASSWORD (or APP_REVIEW_EMAIL/APP_REVIEW_PASSWORD) are not set.\n'
    );
    process.exit(1);
  }

  if (requirePostDeploySmokeCheck) {
    runStep('Post-deploy smoke check', 'npm', ['run', 'post-deploy:smoke-check']);
  }

  process.stdout.write('\n[preflight] release preflight passed\n');
}

if (require.main === module) {
  main();
}

module.exports = {
  evaluateSubmissionGate,
  isProxyOnlyEnabled,
  isSubmissionEnv,
  isSet,
  isTruthy,
  parseDotenv,
};
