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

function isSet(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isTruthy(value) {
  return ['1', 'true', 'yes', 'on'].includes(String(value || '').trim().toLowerCase());
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
  const merged = {
    ...dotenvValues,
    ...process.env,
  };

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
  if (resolvedEnv === 'development') {
    process.stdout.write('[preflight] warning: resolved Expo ENV is "development". Confirm this is intentional for the release build.\n');
  }

  runStep('TypeScript check', 'npm', ['run', 'typecheck']);
  runStep('Lint', 'npm', ['run', 'lint']);
  runStep('Tests', 'npm', ['run', 'test:unit', '--', '--runInBand']);

  const hasSmokeCredentials =
    (isSet(merged.SMOKE_TEST_EMAIL) || isSet(merged.APP_REVIEW_EMAIL)) &&
    (isSet(merged.SMOKE_TEST_PASSWORD) || isSet(merged.APP_REVIEW_PASSWORD));
  const requireAuthSmokeCheck = isTruthy(merged.REQUIRE_AUTH_SMOKE_CHECK);

  if (hasSmokeCredentials) {
    runStep('Firebase auth smoke check', 'npm', ['run', 'auth:smoke-check']);
  } else if (requireAuthSmokeCheck) {
    process.stderr.write(
      '[preflight] auth smoke check required but SMOKE_TEST_EMAIL/SMOKE_TEST_PASSWORD (or APP_REVIEW_EMAIL/APP_REVIEW_PASSWORD) are not set.\n'
    );
    process.exit(1);
  } else {
    process.stdout.write('\n[preflight] auth smoke check skipped: no smoke credentials set.\n');
    process.stdout.write('[preflight] set SMOKE_TEST_EMAIL/SMOKE_TEST_PASSWORD and REQUIRE_AUTH_SMOKE_CHECK=true to make this a hard gate.\n');
  }

  process.stdout.write('\n[preflight] release preflight passed\n');
}

main();
