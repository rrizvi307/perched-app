#!/usr/bin/env node

/**
 * Post-deploy smoke checks against deployed infrastructure.
 *
 * Verifies:
 * - provider proxies reject requests without App Check and accept valid App Check
 * - Firestore deployed rules enforce the public/private profile boundary
 * - Storage deployed rules enforce public/friends/close media visibility
 * - built mobile bundle does not contain a Google Maps API key
 * - migration verification still passes post-deploy
 *
 * This script exits non-zero on any failure.
 *
 * Note:
 * - Admin SDK is used only for seeding and cleanup.
 * - Rule enforcement is tested with real Firebase Auth user tokens over deployed REST endpoints.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const admin = require('firebase-admin');

const EXPECTED_MIGRATION_VERSION = 2;
const DENY_STATUSES = new Set([401, 403]);
const SECTION_APP_CHECK = 'SECTION 1  APP CHECK ENFORCEMENT';
const SECTION_FIRESTORE = 'SECTION 2  FIRESTORE PRIVACY BOUNDARY';
const SECTION_STORAGE = 'SECTION 3  STORAGE MEDIA PRIVACY';
const SECTION_BUNDLE = 'SECTION 4  BUNDLE KEY EXPOSURE';
const SECTION_MIGRATION = 'SECTION 5  MIGRATION INTEGRITY';
const SECTION_FINAL = 'SECTION 6  SMOKE PASS/FAIL';

function parseArgs(argv) {
  const args = {
    serviceAccount: null,
    projectId: '',
    bundleDir: path.resolve(process.cwd(), '.expo-export'),
  };

  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--service-account' && value) {
      args.serviceAccount = value;
      i += 1;
    } else if (key === '--project' && value) {
      args.projectId = value;
      i += 1;
    } else if (key === '--bundle-dir' && value) {
      args.bundleDir = path.resolve(process.cwd(), value);
      i += 1;
    }
  }

  return args;
}

function initAdmin(args) {
  let credential;
  let serviceJson = null;

  if (args.serviceAccount) {
    const fullPath = path.resolve(process.cwd(), args.serviceAccount);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Service account file not found: ${fullPath}`);
    }
    serviceJson = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    credential = admin.credential.cert(serviceJson);
  }

  const projectId =
    args.projectId ||
    process.env.FIREBASE_PROJECT_ID ||
    serviceJson?.project_id ||
    process.env.GCLOUD_PROJECT ||
    '';

  if (!projectId) {
    throw new Error('Missing projectId. Pass --project or set FIREBASE_PROJECT_ID.');
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      ...(credential ? { credential } : {}),
      projectId,
      storageBucket: resolveStorageBucket(projectId),
    });
  }

  return { db: admin.firestore(), auth: admin.auth(), projectId };
}

function parseCsvList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveStorageBucket(projectId) {
  const bucket = (
    process.env.FIREBASE_STORAGE_BUCKET ||
    `${projectId}.firebasestorage.app`
  );
  return String(bucket).replace(/^gs:\/\//, '').trim();
}

function resolveFunctionsRegion() {
  return (
    process.env.FIREBASE_FUNCTIONS_REGION ||
    process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION ||
    'us-central1'
  );
}

function resolveFirebaseApiKey() {
  return String(process.env.FIREBASE_API_KEY || '').trim();
}

function resolveAppCheckAppId() {
  const allowed = parseCsvList(process.env.APP_CHECK_ALLOWED_APP_IDS);
  if (allowed.length) return allowed[0];
  const fallback = String(process.env.FIREBASE_APP_ID || '').trim();
  return fallback;
}

function getFunctionsEndpoint(projectId, fnName) {
  return `https://${resolveFunctionsRegion()}-${projectId}.cloudfunctions.net/${fnName}`;
}

function getFirestoreDocUrl(projectId, docPath) {
  const normalized = String(docPath || '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${normalized}`;
}

function getStorageObjectUrl(bucket, objectPath) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(objectPath)}?alt=media`;
}

function printSection(title, payload) {
  console.log(title);
  console.log(JSON.stringify(payload, null, 2));
  console.log('');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
    text,
    json,
  };
}

async function fetchBinary(url, init = {}) {
  const response = await fetch(url, init);
  const arrayBuffer = await response.arrayBuffer();
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    size: arrayBuffer.byteLength,
    headers: Object.fromEntries(response.headers.entries()),
  };
}

async function ensureAuthUser(auth, uid, displayName) {
  try {
    await auth.getUser(uid);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
    await auth.createUser({
      uid,
      displayName,
    });
  }
}

async function signInWithCustomToken(apiKey, customToken) {
  const response = await fetchJson(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: customToken,
        returnSecureToken: true,
      }),
    },
  );
  if (!response.ok || !response.json?.idToken) {
    throw new Error(`Custom token sign-in failed (${response.status}): ${response.text || 'no response body'}`);
  }
  return response.json.idToken;
}

async function uploadSmokeMedia(bucket, ownerId, objectName, visibility) {
  const objectPath = `checkins/${ownerId}/${objectName}`;
  await bucket.file(objectPath).save(Buffer.from('smoke-image-data'), {
    resumable: false,
    contentType: 'image/jpeg',
    metadata: {
      metadata: {
        ownerId,
        mediaKind: 'checkin',
        visibility,
      },
    },
  });
  return objectPath;
}

async function runVerifyScript(args) {
  const verifyArgs = ['scripts/verify-user-document-split.js'];
  if (args.projectId) {
    verifyArgs.push('--project', args.projectId);
  }
  if (args.serviceAccount) {
    verifyArgs.push('--service-account', args.serviceAccount);
  }
  const result = spawnSync(process.execPath, verifyArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function getNpmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function buildBundleForScan() {
  const result = spawnSync(getNpmCommand(), ['run', 'build:ios:export'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env },
    maxBuffer: 20 * 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function collectFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(fullPath, acc);
      continue;
    }
    acc.push(fullPath);
  }
  return acc;
}

function scanBundleForGoogleKeys(bundleDir) {
  const files = collectFiles(bundleDir);
  const hits = [];
  for (const filePath of files) {
    const buffer = fs.readFileSync(filePath);
    if (buffer.includes(Buffer.from('AIza'))) {
      hits.push(path.relative(process.cwd(), filePath));
    }
  }
  return hits;
}

function record(section, name, pass, details = {}) {
  section.push({
    name,
    pass,
    ...details,
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const firebaseApiKey = resolveFirebaseApiKey();
  if (!firebaseApiKey) {
    throw new Error('FIREBASE_API_KEY is required for deployed smoke checks.');
  }

  const appCheckAppId = resolveAppCheckAppId();
  if (!appCheckAppId) {
    throw new Error('APP_CHECK_ALLOWED_APP_IDS or FIREBASE_APP_ID is required for App Check smoke checks.');
  }

  const { db, auth, projectId } = initAdmin(args);
  const bucket = admin.storage().bucket(resolveStorageBucket(projectId));

  const smokeId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ids = {
    owner: `smoke-owner-${smokeId}`,
    friend: `smoke-friend-${smokeId}`,
    close: `smoke-close-${smokeId}`,
    stranger: `smoke-stranger-${smokeId}`,
  };

  const report = {
    appCheck: [],
    firestore: [],
    storage: [],
    bundle: [],
    migration: [],
  };

  const cleanupErrors = [];
  const createdStoragePaths = [];

  try {
    await Promise.all([
      ensureAuthUser(auth, ids.owner, 'Smoke Owner'),
      ensureAuthUser(auth, ids.friend, 'Smoke Friend'),
      ensureAuthUser(auth, ids.close, 'Smoke Close'),
      ensureAuthUser(auth, ids.stranger, 'Smoke Stranger'),
    ]);

    const [ownerToken, friendToken, closeToken, strangerToken] = await Promise.all([
      auth.createCustomToken(ids.owner).then((token) => signInWithCustomToken(firebaseApiKey, token)),
      auth.createCustomToken(ids.friend).then((token) => signInWithCustomToken(firebaseApiKey, token)),
      auth.createCustomToken(ids.close).then((token) => signInWithCustomToken(firebaseApiKey, token)),
      auth.createCustomToken(ids.stranger).then((token) => signInWithCustomToken(firebaseApiKey, token)),
    ]);

    const now = admin.firestore.Timestamp.now();
    const batch = db.batch();
    for (const uid of Object.values(ids)) {
      batch.set(db.collection('users').doc(uid), {
        createdAt: now,
        updatedAt: now,
        migrationVersion: EXPECTED_MIGRATION_VERSION,
      });
      batch.set(db.collection('publicProfiles').doc(uid), {
        name: uid,
        nameLower: uid.toLowerCase(),
        handle: uid.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 20),
        city: 'Houston',
        campus: null,
        campusOrCity: 'Houston',
        campusType: 'city',
        createdAt: now,
        updatedAt: now,
      });
      batch.set(db.collection('userPrivate').doc(uid), {
        email: `${uid}@example.com`,
        createdAt: now,
        updatedAt: now,
      });
    }
    batch.set(db.collection('socialGraph').doc(ids.owner), {
      friends: [ids.friend, ids.close],
      closeFriends: [ids.close],
      blocked: [],
      createdAt: now,
      updatedAt: now,
    });
    batch.set(db.collection('socialGraph').doc(ids.friend), {
      friends: [ids.owner],
      closeFriends: [],
      blocked: [],
      createdAt: now,
      updatedAt: now,
    });
    batch.set(db.collection('socialGraph').doc(ids.close), {
      friends: [ids.owner],
      closeFriends: [],
      blocked: [],
      createdAt: now,
      updatedAt: now,
    });
    batch.set(db.collection('socialGraph').doc(ids.stranger), {
      friends: [],
      closeFriends: [],
      blocked: [],
      createdAt: now,
      updatedAt: now,
    });
    await batch.commit();

    createdStoragePaths.push(await uploadSmokeMedia(bucket, ids.owner, `public-${smokeId}.jpg`, 'public'));
    createdStoragePaths.push(await uploadSmokeMedia(bucket, ids.owner, `friends-${smokeId}.jpg`, 'friends'));
    createdStoragePaths.push(await uploadSmokeMedia(bucket, ids.owner, `close-${smokeId}.jpg`, 'close'));

    const appCheckToken = (await admin.appCheck().createToken(appCheckAppId, { ttlMillis: 5 * 60 * 1000 })).token;
    const googleProxyUrl = getFunctionsEndpoint(projectId, 'googlePlacesProxy');
    const placeSignalsUrl = getFunctionsEndpoint(projectId, 'placeSignalsProxy');

    const negativeGoogle = await fetchJson(googleProxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reverse_geocode', lat: 29.7604, lng: -95.3698 }),
    });
    record(report.appCheck, 'googlePlacesProxy rejects missing App Check', DENY_STATUSES.has(negativeGoogle.status), {
      status: negativeGoogle.status,
      expectedStatuses: Array.from(DENY_STATUSES),
    });

    const positiveGoogle = await fetchJson(googleProxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Firebase-AppCheck': appCheckToken,
      },
      body: JSON.stringify({ action: 'reverse_geocode', lat: 29.7604, lng: -95.3698 }),
    });
    record(report.appCheck, 'googlePlacesProxy accepts valid App Check', positiveGoogle.ok, {
      status: positiveGoogle.status,
      responsePreview: positiveGoogle.json || positiveGoogle.text.slice(0, 300),
    });

    const negativeSignals = await fetchJson(placeSignalsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        placeName: 'Blacksmith',
        placeId: 'smoke-blacksmith',
        location: { lat: 29.743, lng: -95.3977 },
      }),
    });
    record(report.appCheck, 'placeSignalsProxy rejects missing App Check', DENY_STATUSES.has(negativeSignals.status), {
      status: negativeSignals.status,
      expectedStatuses: Array.from(DENY_STATUSES),
    });

    const positiveSignals = await fetchJson(placeSignalsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Firebase-AppCheck': appCheckToken,
      },
      body: JSON.stringify({
        placeName: 'Blacksmith',
        placeId: 'smoke-blacksmith',
        location: { lat: 29.743, lng: -95.3977 },
      }),
    });
    record(report.appCheck, 'placeSignalsProxy accepts valid App Check', positiveSignals.ok, {
      status: positiveSignals.status,
      responsePreview: positiveSignals.json || positiveSignals.text.slice(0, 300),
    });

    const firestoreCases = [
      {
        name: 'userA reads publicProfiles/userB is allowed',
        token: ownerToken,
        path: `publicProfiles/${ids.friend}`,
        expectStatus: 200,
      },
      {
        name: 'userA reads userPrivate/userB is denied',
        token: ownerToken,
        path: `userPrivate/${ids.friend}`,
        expectDeny: true,
      },
      {
        name: 'userA reads socialGraph/userB is denied',
        token: ownerToken,
        path: `socialGraph/${ids.friend}`,
        expectDeny: true,
      },
      {
        name: 'userA reads users/userB is denied',
        token: ownerToken,
        path: `users/${ids.friend}`,
        expectDeny: true,
      },
    ];

    for (const test of firestoreCases) {
      const response = await fetchJson(getFirestoreDocUrl(projectId, test.path), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${test.token}`,
        },
      });
      const pass = test.expectDeny
        ? DENY_STATUSES.has(response.status)
        : response.status === test.expectStatus;
      record(report.firestore, test.name, pass, {
        status: response.status,
        path: test.path,
      });
    }

    const storageCases = [
      {
        name: 'public media is readable to authenticated stranger',
        token: strangerToken,
        path: createdStoragePaths[0],
        expectStatus: 200,
      },
      {
        name: 'friend-only media is denied to stranger',
        token: strangerToken,
        path: createdStoragePaths[1],
        expectDeny: true,
      },
      {
        name: 'friend-only media is readable to friend',
        token: friendToken,
        path: createdStoragePaths[1],
        expectStatus: 200,
      },
      {
        name: 'close-friend media is denied to non-close friend',
        token: friendToken,
        path: createdStoragePaths[2],
        expectDeny: true,
      },
      {
        name: 'close-friend media is readable to close friend',
        token: closeToken,
        path: createdStoragePaths[2],
        expectStatus: 200,
      },
    ];

    for (const test of storageCases) {
      const response = await fetchBinary(getStorageObjectUrl(bucket.name, test.path), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${test.token}`,
        },
      });
      const pass = test.expectDeny
        ? DENY_STATUSES.has(response.status)
        : response.status === test.expectStatus;
      record(report.storage, test.name, pass, {
        status: response.status,
        objectPath: test.path,
        size: response.size,
      });
    }

    const localStorageRules = fs.readFileSync(path.resolve(process.cwd(), 'storage.rules'), 'utf8');
    record(
      report.storage,
      'storage.rules check-in media path uses socialGraph lookups',
      localStorageRules.includes('documents/socialGraph/$(userId)') && !localStorageRules.includes('documents/users/$(userId)'),
      {},
    );

    const bundleBuild = buildBundleForScan();
    record(report.bundle, 'mobile export build succeeds for bundle scan', bundleBuild.status === 0, {
      status: bundleBuild.status,
      stderr: bundleBuild.status === 0 ? undefined : bundleBuild.stderr.slice(0, 800),
    });

    const bundleHits = bundleBuild.status === 0 ? scanBundleForGoogleKeys(args.bundleDir) : [];
    record(report.bundle, 'production bundle contains no Google API key literals', bundleHits.length === 0, {
      matchCount: bundleHits.length,
      matchingFiles: bundleHits,
      scannedDir: path.relative(process.cwd(), args.bundleDir),
    });
  } finally {
    for (const objectPath of createdStoragePaths) {
      try {
        await bucket.file(objectPath).delete({ ignoreNotFound: true });
      } catch (error) {
        cleanupErrors.push(`storage:${objectPath}:${error?.message || String(error)}`);
      }
    }

    const cleanupBatch = db.batch();
    for (const uid of Object.values(ids)) {
      cleanupBatch.delete(db.collection('publicProfiles').doc(uid));
      cleanupBatch.delete(db.collection('socialGraph').doc(uid));
      cleanupBatch.delete(db.collection('userPrivate').doc(uid));
      cleanupBatch.delete(db.collection('users').doc(uid));
      cleanupBatch.delete(db.collection('userStats').doc(uid));
      cleanupBatch.delete(db.collection('pushTokens').doc(uid));
    }
    try {
      await cleanupBatch.commit();
    } catch (error) {
      cleanupErrors.push(`firestore:${error?.message || String(error)}`);
    }

    await sleep(5000);

    const cleanupBatchSecondPass = db.batch();
    for (const uid of Object.values(ids)) {
      cleanupBatchSecondPass.delete(db.collection('publicProfiles').doc(uid));
      cleanupBatchSecondPass.delete(db.collection('socialGraph').doc(uid));
      cleanupBatchSecondPass.delete(db.collection('userPrivate').doc(uid));
      cleanupBatchSecondPass.delete(db.collection('users').doc(uid));
      cleanupBatchSecondPass.delete(db.collection('userStats').doc(uid));
      cleanupBatchSecondPass.delete(db.collection('pushTokens').doc(uid));
    }
    try {
      await cleanupBatchSecondPass.commit();
    } catch (error) {
      cleanupErrors.push(`firestore-second-pass:${error?.message || String(error)}`);
    }

    for (const uid of Object.values(ids)) {
      try {
        await auth.deleteUser(uid);
      } catch (error) {
        cleanupErrors.push(`auth:${uid}:${error?.message || String(error)}`);
      }
    }
  }

  await sleep(2000);

  const verifyResult = await runVerifyScript(args);
  record(report.migration, 'post-deploy user document verification passes', verifyResult.status === 0, {
    status: verifyResult.status,
    stdout: verifyResult.stdout.trim(),
    stderr: verifyResult.stderr.trim(),
  });

  if (cleanupErrors.length > 0) {
    record(report.migration, 'smoke-check cleanup completed without errors', false, {
      cleanupErrors,
    });
  } else {
    record(report.migration, 'smoke-check cleanup completed without errors', true, {});
  }

  const allSections = [
    report.appCheck,
    report.firestore,
    report.storage,
    report.bundle,
    report.migration,
  ];
  const failedChecks = allSections.flat().filter((entry) => !entry.pass);
  const passed = failedChecks.length === 0;

  printSection(SECTION_APP_CHECK, report.appCheck);
  printSection(SECTION_FIRESTORE, report.firestore);
  printSection(SECTION_STORAGE, report.storage);
  printSection(SECTION_BUNDLE, report.bundle);
  printSection(SECTION_MIGRATION, report.migration);
  printSection(SECTION_FINAL, {
    status: passed ? 'PASS' : 'FAIL',
    failedCheckCount: failedChecks.length,
    failedChecks: failedChecks.map((entry) => entry.name),
  });

  if (!passed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  printSection(SECTION_APP_CHECK, []);
  printSection(SECTION_FIRESTORE, []);
  printSection(SECTION_STORAGE, []);
  printSection(SECTION_BUNDLE, []);
  printSection(SECTION_MIGRATION, []);
  printSection(SECTION_FINAL, {
    status: 'FAIL',
    error: error?.message || String(error),
  });
  process.exitCode = 1;
});
