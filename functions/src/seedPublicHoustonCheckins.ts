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
  },
  {
    name: 'Catalina Coffee',
    placeId: 'demo_place_catalina',
    lat: 29.7641,
    lng: -95.4001,
    tags: ['Wi-Fi', 'Social', 'Bright'],
    campus: 'Rice University',
    city: 'Houston',
  },
  {
    name: 'Boomtown Coffee',
    placeId: 'demo_place_boomtown',
    lat: 29.8033,
    lng: -95.4102,
    tags: ['Wi-Fi', 'Outlets', 'Focus'],
    campus: 'University of Houston',
    city: 'Houston',
  },
  {
    name: 'Agora',
    placeId: 'demo_place_agora',
    lat: 29.7421,
    lng: -95.3970,
    tags: ['Late-night', 'Social', 'Seating'],
    campus: 'Rice University',
    city: 'Houston',
  },
  {
    name: 'Common Bond',
    placeId: 'demo_place_commonbond',
    lat: 29.7422,
    lng: -95.3904,
    tags: ['Wi-Fi', 'Brunch', 'Bright'],
    campus: 'Rice University',
    city: 'Houston',
  },
  {
    name: 'MD Anderson Library',
    placeId: 'demo_place_mdanderson',
    lat: 29.7218,
    lng: -95.3436,
    tags: ['Quiet', 'Study', 'Seating'],
    campus: 'University of Houston',
    city: 'Houston',
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
  const users = await resolveUsers(db);
  const total = 12;
  const batch = db.batch();

  for (let i = 0; i < total; i++) {
    const user = users[i % users.length];
    const spot = HOUSTON_SPOTS[i % HOUSTON_SPOTS.length];
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

