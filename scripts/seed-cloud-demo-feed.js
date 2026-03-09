#!/usr/bin/env node

/**
 * Cloud demo seeder for Perched.
 *
 * Purpose:
 * - Mirror demo source photos into Firebase Storage
 * - Upsert deterministic demo checkins in Firestore
 * - Remove legacy demo rows so feed is cloud-only and consistent
 *
 * Usage:
 *   node scripts/seed-cloud-demo-feed.js [--service-account ./service-account.json] [--project my-project] [--bucket my-bucket.firebasestorage.app]
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const admin = require('firebase-admin');

function parseArgs(argv) {
  const args = { serviceAccount: null, projectId: '', bucket: '' };
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--service-account' && value) {
      args.serviceAccount = value;
      i += 1;
    } else if (key === '--project' && value) {
      args.projectId = value;
      i += 1;
    } else if (key === '--bucket' && value) {
      args.bucket = value;
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
  if (!projectId) {
    throw new Error('Missing projectId. Pass --project or set FIREBASE_PROJECT_ID.');
  }

  const storageBucket = args.bucket || process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.firebasestorage.app`;

  if (!admin.apps.length) {
    admin.initializeApp({
      ...(credential ? { credential } : {}),
      projectId,
      storageBucket,
    });
  }

  return { projectId, storageBucket };
}

function extFromContentType(contentType) {
  const value = String(contentType || '').toLowerCase();
  if (value.includes('png')) return 'png';
  if (value.includes('webp')) return 'webp';
  if (value.includes('gif')) return 'gif';
  return 'jpg';
}

function downloadUrl(bucketName, objectPath, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
}

function readStorageToken(metadata) {
  const raw = typeof metadata?.metadata?.firebaseStorageDownloadTokens === 'string'
    ? metadata.metadata.firebaseStorageDownloadTokens
    : '';
  const token = raw.split(',').map((entry) => entry.trim()).find((entry) => entry.length > 0);
  return token || null;
}

async function mirrorPhotoToStorage(bucket, sourceUrl, keyPrefix) {
  const hash = crypto.createHash('sha1').update(sourceUrl).digest('hex').slice(0, 20);
  const candidatePath = `seed/demo-cloud/v1/${keyPrefix}-${hash}`;

  // Attempt to reuse an existing file if present with known token
  for (const ext of ['jpg', 'png', 'webp', 'gif']) {
    const objectPath = `${candidatePath}.${ext}`;
    const file = bucket.file(objectPath);
    try {
      const [exists] = await file.exists();
      if (!exists) continue;
      const [metadata] = await file.getMetadata();
      let token = readStorageToken(metadata);
      if (!token) {
        token = crypto.randomUUID();
        await file.setMetadata({
          metadata: {
            ...(metadata.metadata || {}),
            firebaseStorageDownloadTokens: token,
            sourceUrl,
          },
        });
      }
      return downloadUrl(bucket.name, objectPath, token);
    } catch {
      // try next extension
    }
  }

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Unable to fetch seed photo ${sourceUrl} (${response.status})`);
  }
  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const ext = extFromContentType(contentType);
  const objectPath = `${candidatePath}.${ext}`;
  const file = bucket.file(objectPath);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const token = crypto.randomUUID();

  await file.save(buffer, {
    resumable: false,
    contentType,
    metadata: {
      cacheControl: 'public,max-age=31536000,immutable',
      metadata: {
        firebaseStorageDownloadTokens: token,
        sourceUrl,
      },
    },
  });

  return downloadUrl(bucket.name, objectPath, token);
}

const DEMO_USERS = [
  { id: 'demo-u1', name: 'Maya Patel', handle: 'mayap', city: 'Houston', campus: 'Rice University' },
  { id: 'demo-u2', name: 'Jon Lee', handle: 'jonstudy', city: 'Houston', campus: 'UH' },
  { id: 'demo-u3', name: 'Ava Brooks', handle: 'avab', city: 'Houston', campus: 'Houston' },
  { id: 'demo-u4', name: 'Leo Nguyen', handle: 'leon', city: 'Houston', campus: 'Rice University' },
  { id: 'demo-u5', name: 'Sofia Kim', handle: 'sofiak', city: 'Houston', campus: 'Houston' },
  { id: 'demo-u6', name: 'Noah Johnson', handle: 'noahj', city: 'Houston', campus: 'Houston' },
  { id: 'demo-u7', name: 'Priya Shah', handle: 'priyash', city: 'Houston', campus: 'Houston' },
  { id: 'demo-u8', name: 'Ethan Chen', handle: 'ethanc', city: 'Houston', campus: 'Houston' },
  { id: 'demo-u9', name: 'Camila Rivera', handle: 'cami', city: 'Houston', campus: 'Houston' },
  { id: 'demo-u10', name: 'Jordan Wells', handle: 'jordanw', city: 'Houston', campus: 'Houston' },
  { id: 'demo-u11', name: 'Hannah Park', handle: 'hannahp', city: 'Houston', campus: 'Houston' },
  { id: 'demo-u12', name: 'Omar Hassan', handle: 'omarh', city: 'Houston', campus: 'Houston' },
];

const SPOTS = [
  {
    name: 'Catalina Coffee',
    placeId: 'demo-place-catalina',
    lat: 29.7367,
    lng: -95.4197,
    tags: ['Study', 'Wi-Fi', 'Bright', 'Quiet'],
    photos: [
      'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1400&q=80',
      'https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&w=1400&q=80',
    ],
  },
  {
    name: 'Fondren Library',
    placeId: 'demo-place-fondren',
    lat: 29.7174,
    lng: -95.4011,
    tags: ['Quiet', 'Study', 'Outlets', 'Seating'],
    photos: [
      'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=1400&q=80',
      'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=1400&q=80',
    ],
  },
  {
    name: 'Blacksmith',
    placeId: 'demo-place-blacksmith',
    lat: 29.7604,
    lng: -95.3698,
    tags: ['Bright', 'Social', 'Wi-Fi', 'Coworking'],
    photos: [
      'https://images.unsplash.com/photo-1559305616-3bed4d52be3a?auto=format&fit=crop&w=1400&q=80',
      'https://images.unsplash.com/photo-1497515114629-f71d768fd07c?auto=format&fit=crop&w=1400&q=80',
    ],
  },
  {
    name: 'Boomtown Coffee',
    placeId: 'demo-place-boomtown',
    lat: 29.7175,
    lng: -95.4022,
    tags: ['Social', 'Wi-Fi', 'Late-night', 'Seating'],
    photos: [
      'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=1400&q=80',
      'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1400&q=80',
    ],
  },
  {
    name: 'Siphon Coffee',
    placeId: 'demo-place-siphon',
    lat: 29.7285,
    lng: -95.3911,
    tags: ['Study', 'Wi-Fi', 'Outlets', 'Bright'],
    photos: [
      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1400&q=80',
      'https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?auto=format&fit=crop&w=1400&q=80',
    ],
  },
  {
    name: 'Agora Coffee',
    placeId: 'demo-place-agora',
    lat: 29.7346,
    lng: -95.3896,
    tags: ['Study', 'Wi-Fi', 'Spacious', 'Quiet'],
    photos: [
      'https://images.unsplash.com/photo-1497515114629-f71d768fd07c?auto=format&fit=crop&w=1400&q=80',
      'https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&w=1400&q=80',
    ],
  },
  {
    name: 'Brasil',
    placeId: 'demo-place-brasil',
    lat: 29.7392,
    lng: -95.3856,
    tags: ['Coworking', 'Wi-Fi', 'Outlets', 'Late-night'],
    photos: [
      'https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=1400&q=80',
      'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?auto=format&fit=crop&w=1400&q=80',
    ],
  },
  {
    name: 'The Nook',
    placeId: 'demo-place-nook',
    lat: 29.7445,
    lng: -95.3587,
    tags: ['Study', 'Wi-Fi', 'Bright', 'Social'],
    photos: [
      'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1400&q=80',
      'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=1400&q=80',
    ],
  },
];

const CAPTIONS = [
  'Perfect spot for deep work right now.',
  'Great vibe and seats available.',
  'Quiet corner open if anyone needs focus time.',
  'Strong coffee and reliable WiFi today.',
  'Live now. Good energy, not too crowded.',
  'Locked in for a study block.',
  'Fast internet and easy outlets near the wall.',
  'Solid for a quick coffee and reset.',
  'Aesthetic spot with real productivity.',
  'Working here for the next two hours.',
];

function buildCreatedAt(index, total) {
  const now = Date.now();
  const windowMs = 36 * 60 * 60 * 1000;
  const step = total > 1 ? Math.floor(windowMs / (total - 1)) : 0;
  const jitter = Math.floor(Math.random() * (20 * 60 * 1000));
  const createdAtMs = now - (index * step + jitter);
  return {
    createdAtMs,
    createdAt: admin.firestore.Timestamp.fromMillis(createdAtMs),
  };
}

async function purgeLegacyDemoCheckins(db, demoUserIds, keepIds) {
  let deleted = 0;
  const chunks = [];
  for (let i = 0; i < demoUserIds.length; i += 10) chunks.push(demoUserIds.slice(i, i + 10));

  for (const chunk of chunks) {
    const snap = await db.collection('checkins').where('userId', 'in', chunk).limit(500).get();
    if (snap.empty) continue;

    const batch = db.batch();
    snap.docs.forEach((doc) => {
      if (keepIds.has(doc.id)) return;
      const data = doc.data() || {};
      const isCloudSeed = data.__demoCloudSeed === true;
      if (isCloudSeed) return;
      batch.delete(doc.ref);
      deleted += 1;
    });
    await batch.commit();
  }

  return deleted;
}

async function seedCloudDemo() {
  const args = parseArgs(process.argv);
  const { projectId, storageBucket } = initAdmin(args);
  const db = admin.firestore();
  const bucket = admin.storage().bucket(storageBucket);

  const photoCache = new Map();
  const mirroredSpotPhotos = new Map();

  for (const spot of SPOTS) {
    const out = [];
    for (const sourceUrl of spot.photos) {
      if (photoCache.has(sourceUrl)) {
        out.push(photoCache.get(sourceUrl));
        continue;
      }
      const mirrored = await mirrorPhotoToStorage(bucket, sourceUrl, spot.placeId);
      photoCache.set(sourceUrl, mirrored);
      out.push(mirrored);
    }
    mirroredSpotPhotos.set(spot.placeId, out);
  }

  const seedCount = 24;
  const keepIds = new Set();
  const batch = db.batch();

  for (let i = 0; i < seedCount; i += 1) {
    const user = DEMO_USERS[i % DEMO_USERS.length];
    const spot = SPOTS[i % SPOTS.length];
    const photos = mirroredSpotPhotos.get(spot.placeId) || [];
    const photoUrl = photos[i % Math.max(1, photos.length)] || null;
    const { createdAt, createdAtMs } = buildCreatedAt(i, seedCount);
    const docId = `demo-cloud-v1-${String(i + 1).padStart(3, '0')}`;
    keepIds.add(docId);

    batch.set(
      db.collection('checkins').doc(docId),
      {
        clientId: `demo-cloud-seed-${docId}`,
        userId: user.id,
        userName: user.name,
        userHandle: user.handle,
        userPhotoUrl: `https://i.pravatar.cc/300?img=${(i % 60) + 1}`,
        visibility: 'public',
        spotName: spot.name,
        spotPlaceId: spot.placeId,
        spotLatLng: { lat: spot.lat, lng: spot.lng },
        caption: CAPTIONS[i % CAPTIONS.length],
        tags: spot.tags,
        photoUrl,
        photoPending: false,
        campusOrCity: user.campus || user.city,
        city: user.city,
        campus: user.campus,
        createdAt,
        createdAtServer: admin.firestore.FieldValue.serverTimestamp(),
        createdAtMs,
        timestamp: createdAtMs,
        approved: true,
        moderation: { status: 'approved' },
        __demoCloudSeed: true,
        demoSeedVersion: 1,
        demoPhotoSource: 'firebase-storage',
      },
      { merge: true }
    );
  }

  await batch.commit();

  const deletedLegacy = await purgeLegacyDemoCheckins(
    db,
    DEMO_USERS.map((entry) => entry.id),
    keepIds
  );

  console.log(`\nCloud demo seed complete for project ${projectId}`);
  console.log(`Storage bucket: ${storageBucket}`);
  console.log(`Upserted demo docs: ${seedCount}`);
  console.log(`Mirrored photo URLs: ${photoCache.size}`);
  console.log(`Deleted legacy demo docs: ${deletedLegacy}`);
}

seedCloudDemo()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('seed-cloud-demo-feed failed:', error?.message || error);
    process.exit(1);
  });
