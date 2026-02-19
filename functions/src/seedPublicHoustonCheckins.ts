/**
 * One-time beta cold-start seeding for public feed.
 *
 * Usage:
 *   1) cd functions && npm run build
 *   2) node lib/src/seedPublicHoustonCheckins.js
 *
 * The script is idempotent and writes deterministic doc IDs:
 *   checkins/beta-public-001 ... beta-public-012
 */

import admin from 'firebase-admin';
import crypto from 'crypto';

type SeedUser = {
  email: string;
  fallbackId: string;
  fallbackName: string;
  fallbackHandle: string;
  fallbackPhotoUrl: string;
};

type ResolvedUser = {
  id: string;
  name: string;
  handle: string;
  photoUrl: string;
};

type SeedSpot = {
  name: string;
  placeId: string;
  lat: number;
  lng: number;
  tags: string[];
  campus: string;
  city: string;
  photoSources: string[];
};

const TARGET_USERS: SeedUser[] = [
  {
    email: 'demo@perched.app',
    fallbackId: 'demo-user-12345',
    fallbackName: 'Demo User',
    fallbackHandle: 'demo_user',
    fallbackPhotoUrl: 'https://i.pravatar.cc/300?img=1',
  },
  {
    email: 'friend1@perched.app',
    fallbackId: 'demo-user-sarah',
    fallbackName: 'Sarah Chen',
    fallbackHandle: 'sarah_chen',
    fallbackPhotoUrl: 'https://i.pravatar.cc/300?img=5',
  },
  {
    email: 'friend2@perched.app',
    fallbackId: 'demo-user-marcus',
    fallbackName: 'Marcus Johnson',
    fallbackHandle: 'marcus_johnson',
    fallbackPhotoUrl: 'https://i.pravatar.cc/300?img=12',
  },
  {
    email: 'friend3@perched.app',
    fallbackId: 'demo-user-priya',
    fallbackName: 'Priya Patel',
    fallbackHandle: 'priya_patel',
    fallbackPhotoUrl: 'https://i.pravatar.cc/300?img=9',
  },
];

const HOUSTON_SPOTS: SeedSpot[] = [
  {
    name: 'Blacksmith',
    placeId: 'demo_place_blacksmith',
    lat: 29.7430,
    lng: -95.3977,
    tags: ['Wi-Fi', 'Quiet', 'Outlets'],
    campus: 'Rice University',
    city: 'Houston',
    photoSources: [
      'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=1200&q=80',
      'https://images.unsplash.com/photo-1445116572660-236099ec97a0?w=1200&q=80',
    ],
  },
  {
    name: 'Catalina Coffee',
    placeId: 'demo_place_catalina',
    lat: 29.7641,
    lng: -95.4001,
    tags: ['Wi-Fi', 'Social', 'Bright'],
    campus: 'Rice University',
    city: 'Houston',
    photoSources: [
      'https://images.unsplash.com/photo-1559496417-e7f25cb247f3?w=1200&q=80',
      'https://images.unsplash.com/photo-1511920170033-f8396924c348?w=1200&q=80',
    ],
  },
  {
    name: 'Boomtown Coffee',
    placeId: 'demo_place_boomtown',
    lat: 29.8033,
    lng: -95.4102,
    tags: ['Wi-Fi', 'Outlets', 'Focus'],
    campus: 'University of Houston',
    city: 'Houston',
    photoSources: [
      'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=1200&q=80',
      'https://images.unsplash.com/photo-1493857671505-72967e2e2760?w=1200&q=80',
    ],
  },
  {
    name: 'Agora',
    placeId: 'demo_place_agora',
    lat: 29.7421,
    lng: -95.3970,
    tags: ['Late-night', 'Social', 'Seating'],
    campus: 'Rice University',
    city: 'Houston',
    photoSources: [
      'https://images.unsplash.com/photo-1521017432531-fbd92d768814?w=1200&q=80',
      'https://images.unsplash.com/photo-1485182708500-e8f1f318ba72?w=1200&q=80',
    ],
  },
  {
    name: 'Common Bond',
    placeId: 'demo_place_commonbond',
    lat: 29.7422,
    lng: -95.3904,
    tags: ['Wi-Fi', 'Brunch', 'Bright'],
    campus: 'Rice University',
    city: 'Houston',
    photoSources: [
      'https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=1200&q=80',
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&q=80',
    ],
  },
  {
    name: 'MD Anderson Library',
    placeId: 'demo_place_mdanderson',
    lat: 29.7218,
    lng: -95.3436,
    tags: ['Quiet', 'Study', 'Seating'],
    campus: 'University of Houston',
    city: 'Houston',
    photoSources: [
      'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=1200&q=80',
      'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=1200&q=80',
    ],
  },
];

const CAPTIONS = [
  'Solid WiFi and lots of seating right now.',
  'Quiet corner opened up, great for focus.',
  'Busy but productive vibe this afternoon.',
  'Outlets available near the back wall.',
  'Great place for a 2-hour deep work block.',
  'Morning check-in: calm and reliable.',
  'Fast internet today and not too loud.',
  'Good spot for a quick study session.',
  'Comfortable seating and steady pace.',
  'Live now: decent space and power access.',
  'Good coffee, good WiFi, good momentum.',
  'Low noise right now, ideal for writing.',
];

function initAdmin(): admin.firestore.Firestore {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
  return admin.firestore();
}

function resolveStorageBucketName(): string {
  const envBucket = (process.env.FIREBASE_STORAGE_BUCKET || '').trim();
  if (envBucket) return envBucket;
  const projectCandidates = [
    (process.env.FIREBASE_PROJECT_ID || '').trim(),
    (process.env.GCLOUD_PROJECT || '').trim(),
    String(admin.app().options.projectId || '').trim(),
    'spot-app-ce2d8',
  ].filter((value) => value.length > 0);
  if (projectCandidates.length > 0) return `${projectCandidates[0]}.firebasestorage.app`;
  throw new Error('Unable to resolve Firebase Storage bucket. Set FIREBASE_STORAGE_BUCKET or FIREBASE_PROJECT_ID.');
}

function contentTypeToExt(contentType: string): string {
  const normalized = contentType.toLowerCase();
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('heic')) return 'heic';
  return 'jpg';
}

function buildDownloadUrl(bucketName: string, objectPath: string, token: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
}

function readStorageToken(metadata: any): string | null {
  const raw = typeof metadata?.metadata?.firebaseStorageDownloadTokens === 'string'
    ? metadata.metadata.firebaseStorageDownloadTokens
    : '';
  const token = raw
    .split(',')
    .map((part: string) => part.trim())
    .find((part: string) => part.length > 0);
  return token || null;
}

async function mirrorPhotoToStorage(bucket: any, sourceUrl: string, keyPrefix: string): Promise<string> {
  const hash = crypto.createHash('sha1').update(sourceUrl).digest('hex').slice(0, 16);
  const tokenSeed = crypto.randomUUID();
  let ext = 'jpg';
  let objectPath = `seed/checkins/${keyPrefix}-${hash}.${ext}`;
  let file = bucket.file(objectPath);

  try {
    const [exists] = await file.exists();
    if (exists) {
      const [metadata] = await file.getMetadata();
      const existingToken = readStorageToken(metadata);
      if (existingToken) return buildDownloadUrl(bucket.name, objectPath, existingToken);
      await file.setMetadata({
        metadata: {
          ...(metadata.metadata || {}),
          firebaseStorageDownloadTokens: tokenSeed,
          sourceUrl,
        },
      });
      return buildDownloadUrl(bucket.name, objectPath, tokenSeed);
    }
  } catch {}

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch seed photo (${response.status}): ${sourceUrl}`);
  }
  const contentType = response.headers.get('content-type') || 'image/jpeg';
  ext = contentTypeToExt(contentType);
  objectPath = `seed/checkins/${keyPrefix}-${hash}.${ext}`;
  file = bucket.file(objectPath);
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

  return buildDownloadUrl(bucket.name, objectPath, token);
}

async function buildSpotPhotoMap(bucket: any): Promise<Map<string, string[]>> {
  const sourceCache = new Map<string, string>();
  const spotMap = new Map<string, string[]>();

  for (const spot of HOUSTON_SPOTS) {
    const mirrored: string[] = [];
    for (const sourceUrl of spot.photoSources) {
      const cached = sourceCache.get(sourceUrl);
      if (cached) {
        mirrored.push(cached);
        continue;
      }
      const uploaded = await mirrorPhotoToStorage(bucket, sourceUrl, spot.placeId);
      sourceCache.set(sourceUrl, uploaded);
      mirrored.push(uploaded);
    }
    if (!mirrored.length) {
      throw new Error(`No mirrored photos available for spot ${spot.placeId}`);
    }
    spotMap.set(spot.placeId, mirrored);
  }

  return spotMap;
}

async function resolveUsers(db: admin.firestore.Firestore): Promise<ResolvedUser[]> {
  const users: ResolvedUser[] = [];

  for (const candidate of TARGET_USERS) {
    const snap = await db.collection('users').where('email', '==', candidate.email).limit(1).get();
    if (!snap.empty) {
      const doc = snap.docs[0];
      const data = doc.data() || {};
      users.push({
        id: doc.id,
        name: String(data.displayName || data.name || candidate.fallbackName),
        handle: String(data.username || data.userHandle || candidate.fallbackHandle),
        photoUrl: String(data.photoURL || data.userPhotoUrl || candidate.fallbackPhotoUrl),
      });
      continue;
    }

    users.push({
      id: candidate.fallbackId,
      name: candidate.fallbackName,
      handle: candidate.fallbackHandle,
      photoUrl: candidate.fallbackPhotoUrl,
    });
  }

  return users;
}

function buildCreatedAt(index: number, total: number): { createdAtMs: number; createdAt: admin.firestore.Timestamp } {
  const now = Date.now();
  const windowMs = 48 * 60 * 60 * 1000;
  const step = total > 1 ? Math.floor(windowMs / (total - 1)) : 0;
  const jitter = Math.floor(Math.random() * (35 * 60 * 1000));
  const createdAtMs = now - (index * step + jitter);
  return {
    createdAtMs,
    createdAt: admin.firestore.Timestamp.fromMillis(createdAtMs),
  };
}

async function seed(): Promise<void> {
  const db = initAdmin();
  const bucketName = resolveStorageBucketName();
  const bucket = admin.storage().bucket(bucketName);
  const users = await resolveUsers(db);
  const spotPhotos = await buildSpotPhotoMap(bucket);
  const total = 12;
  const batch = db.batch();

  for (let i = 0; i < total; i++) {
    const user = users[i % users.length];
    const spot = HOUSTON_SPOTS[i % HOUSTON_SPOTS.length];
    const photoOptions = spotPhotos.get(spot.placeId) || [];
    const photoUrl = photoOptions[i % Math.max(1, photoOptions.length)] || null;
    const { createdAt, createdAtMs } = buildCreatedAt(i, total);
    const docId = `beta-public-${String(i + 1).padStart(3, '0')}`;

    batch.set(
      db.collection('checkins').doc(docId),
      {
        clientId: `beta-seed-${docId}`,
        userId: user.id,
        userName: user.name,
        userHandle: user.handle,
        userPhotoUrl: user.photoUrl,
        visibility: 'public',
        spotName: spot.name,
        spotPlaceId: spot.placeId,
        spotLatLng: { lat: spot.lat, lng: spot.lng },
        caption: CAPTIONS[i % CAPTIONS.length],
        tags: spot.tags,
        photoUrl,
        photoPending: false,
        campusOrCity: spot.campus,
        city: spot.city,
        campus: spot.campus,
        createdAt,
        createdAtServer: admin.firestore.FieldValue.serverTimestamp(),
        createdAtMs,
        timestamp: createdAtMs,
        approved: true,
        moderation: { status: 'approved' },
        __betaSeed: true,
      },
      { merge: true }
    );
  }

  await batch.commit();
  // Keep logs explicit for one-time operator runs.
  console.log(`Seeded ${total} public Houston check-ins for beta cold start.`);
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed to seed public Houston check-ins:', error);
    process.exit(1);
  });
