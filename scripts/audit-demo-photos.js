#!/usr/bin/env node

/**
 * Audit cloud demo photo integrity.
 *
 * Usage:
 *   node scripts/audit-demo-photos.js [--service-account ./service-account.json] [--project my-project]
 */

const fs = require('node:fs');
const path = require('node:path');
const admin = require('firebase-admin');

function parseArgs(argv) {
  const args = { serviceAccount: null, projectId: '' };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--service-account' && value) {
      args.serviceAccount = value;
      i += 1;
    } else if (key === '--project' && value) {
      args.projectId = value;
      i += 1;
    }
  }
  return args;
}

function initAdmin(args) {
  let credential = undefined;
  let serviceJson = null;
  if (args.serviceAccount) {
    const full = path.resolve(process.cwd(), args.serviceAccount);
    if (!fs.existsSync(full)) {
      throw new Error(`Service account file not found: ${full}`);
    }
    serviceJson = JSON.parse(fs.readFileSync(full, 'utf8'));
    credential = admin.credential.cert(serviceJson);
  }

  const projectId = args.projectId || process.env.FIREBASE_PROJECT_ID || serviceJson?.project_id || process.env.GCLOUD_PROJECT || '';
  if (!projectId) throw new Error('Missing projectId. Pass --project or set FIREBASE_PROJECT_ID.');

  if (!admin.apps.length) {
    admin.initializeApp({
      ...(credential ? { credential } : {}),
      projectId,
    });
  }

  return { projectId };
}

async function checkImageUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('https://')) {
    return { ok: false, reason: 'not_https' };
  }

  try {
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) {
      return { ok: false, reason: `http_${response.status}` };
    }
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('image/')) {
      return { ok: false, reason: `content_type_${contentType || 'missing'}` };
    }
    return { ok: true, reason: 'ok' };
  } catch (error) {
    return { ok: false, reason: `fetch_error_${String(error?.message || error)}` };
  }
}

async function runAudit() {
  const args = parseArgs(process.argv);
  const { projectId } = initAdmin(args);
  const db = admin.firestore();

  const snap = await db
    .collection('checkins')
    .where('__demoCloudSeed', '==', true)
    .limit(500)
    .get();

  const docs = snap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));
  const broken = [];
  const photoPending = [];

  for (const item of docs) {
    if (item.photoPending) {
      photoPending.push(item.id);
      continue;
    }
    const photoUrl = typeof item.photoUrl === 'string' ? item.photoUrl : '';
    const check = await checkImageUrl(photoUrl);
    if (!check.ok) {
      broken.push({ id: item.id, reason: check.reason, photoUrl });
    }
  }

  console.log(`\nDemo photo audit for project ${projectId}`);
  console.log(`Total cloud demo docs: ${docs.length}`);
  console.log(`photoPending=true docs: ${photoPending.length}`);
  console.log(`Broken photo docs: ${broken.length}`);

  if (photoPending.length > 0) {
    console.log('\nphotoPending docs:');
    photoPending.forEach((id) => console.log(` - ${id}`));
  }

  if (broken.length > 0) {
    console.log('\nBroken docs:');
    broken.forEach((entry) => {
      console.log(` - ${entry.id}: ${entry.reason}`);
    });
    process.exitCode = 1;
    return;
  }

  if (!docs.length) {
    console.log('No cloud demo seed docs found. Run demo:seed:cloud first.');
    process.exitCode = 1;
    return;
  }

  console.log('Audit passed. Cloud demo photos are valid.');
}

runAudit().catch((error) => {
  console.error('audit-demo-photos failed:', error?.message || error);
  process.exit(1);
});
