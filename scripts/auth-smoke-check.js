#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

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

function readArg(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return '';
  return String(process.argv[index + 1] || '').trim();
}

function getCredentials() {
  const email =
    readArg('--email') ||
    process.env.SMOKE_TEST_EMAIL ||
    process.env.APP_REVIEW_EMAIL ||
    '';
  const password =
    readArg('--password') ||
    process.env.SMOKE_TEST_PASSWORD ||
    process.env.APP_REVIEW_PASSWORD ||
    '';
  return { email, password };
}

function getFirebaseApiKey() {
  return String(
    process.env.FIREBASE_API_KEY ||
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY ||
    '',
  ).trim();
}

async function main() {
  hydrateLocalEnv();

  const apiKey = getFirebaseApiKey();
  const { email, password } = getCredentials();

  if (!isSet(apiKey)) {
    throw new Error('FIREBASE_API_KEY is required for auth smoke checks.');
  }
  if (!isSet(email) || !isSet(password)) {
    throw new Error('SMOKE_TEST_EMAIL/SMOKE_TEST_PASSWORD (or APP_REVIEW_EMAIL/APP_REVIEW_PASSWORD) are required.');
  }

  const response = await fetch(
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

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok || !json?.localId || !json?.idToken) {
    const preview = json || text || 'no response body';
    throw new Error(`Firebase auth smoke check failed (${response.status}): ${typeof preview === 'string' ? preview : JSON.stringify(preview)}`);
  }

  process.stdout.write(`[auth-smoke-check] success for ${email}\n`);
}

main().catch((error) => {
  process.stderr.write(`[auth-smoke-check] ${String(error?.message || error)}\n`);
  process.exit(1);
});
