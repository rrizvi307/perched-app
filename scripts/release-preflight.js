#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
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

  runStep('TypeScript check', 'npm', ['run', 'typecheck']);
  runStep('Lint', 'npm', ['run', 'lint']);
  runStep('Tests', 'npm', ['test', '--', '--runInBand']);

  process.stdout.write('\n[preflight] release preflight passed\n');
}

main();
