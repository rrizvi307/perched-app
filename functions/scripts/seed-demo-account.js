#!/usr/bin/env node

/**
 * Seed App Review demo users and data.
 *
 * Usage:
 *   cd functions
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json node scripts/seed-demo-account.js
 */

const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();
const auth = admin.auth();

const DEMO_EMAIL = 'demo@perched.app';
const DEMO_PASSWORD = 'TestPassword123';
const ADMIN_EMAIL = 'admin@perched.app';
const ADMIN_PASSWORD = 'AdminPass123';

const HOUSTON_SPOTS = [
  { name: 'Agora', placeId: 'houston_agora_montrose', lat: 29.7445, lng: -95.3926, campusOrCity: 'Houston' },
  { name: 'Boomtown Coffee', placeId: 'houston_boomtown', lat: 29.7817, lng: -95.3938, campusOrCity: 'Houston' },
  { name: 'Campesino Coffee', placeId: 'houston_campesino', lat: 29.7578, lng: -95.3684, campusOrCity: 'Houston' },
  { name: 'Blacksmith', placeId: 'houston_blacksmith', lat: 29.7326, lng: -95.4218, campusOrCity: 'Houston' },
  { name: 'Inversion Coffee House', placeId: 'houston_inversion', lat: 29.7289, lng: -95.3906, campusOrCity: 'Houston' },
  { name: 'Retrospect Coffee Bar', placeId: 'houston_retrospect', lat: 29.7489, lng: -95.3615, campusOrCity: 'Houston' },
];

const FRIEND_USERS = [
  { email: 'reviewfriend1@perched.app', password: 'TestPassword123', name: 'Avery Chen', handle: 'avery' },
  { email: 'reviewfriend2@perched.app', password: 'TestPassword123', name: 'Jordan Lee', handle: 'jordy' },
  { email: 'reviewfriend3@perched.app', password: 'TestPassword123', name: 'Sam Rivera', handle: 'samr' },
];

async function ensureUser(email, password, displayName, claims = null) {
  try {
    const existing = await auth.getUserByEmail(email);
    if (claims) {
      await auth.setCustomUserClaims(existing.uid, { ...(existing.customClaims || {}), ...claims });
    }
    return existing;
  } catch (error) {
    if (error && error.code === 'auth/user-not-found') {
      const created = await auth.createUser({
        email,
        password,
        displayName,
        emailVerified: true,
      });
      if (claims) {
        await auth.setCustomUserClaims(created.uid, claims);
      }
      return created;
    }
    throw error;
  }
}

function buildCheckin(user, spot, index) {
  const createdAtMs = Date.now() - index * 60 * 60 * 1000;
  return {
    userId: user.uid,
    userName: user.displayName || 'Demo User',
    userHandle: 'demo',
    userPhotoUrl: null,
    visibility: 'public',
    spotName: spot.name,
    spotPlaceId: spot.placeId,
    spotLatLng: { lat: spot.lat, lng: spot.lng },
    caption: `Demo check-in #${index + 1} at ${spot.name}`,
    tags: ['study', 'wifi'],
    wifiSpeed: 4,
    noiseLevel: 2,
    busyness: 3,
    outletAvailability: 'some',
    campusOrCity: spot.campusOrCity,
    city: 'Houston',
    campus: null,
    approved: true,
    moderation: { status: 'approved' },
    createdAt: admin.firestore.Timestamp.fromMillis(createdAtMs),
    createdAtServer: admin.firestore.FieldValue.serverTimestamp(),
    createdAtMs,
  };
}

async function ensureUserDoc(user, profile = {}) {
  await db.collection('users').doc(user.uid).set(
    {
      id: user.uid,
      email: user.email,
      name: profile.name || user.displayName || null,
      handle: profile.handle || null,
      photoUrl: null,
      campus: profile.campus || null,
      city: profile.city || 'Houston',
      friends: profile.friends || [],
      premiumStatus: profile.premiumStatus || {
        tier: 'free',
        isActive: false,
        expiresAt: null,
        source: 'free',
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function main() {
  const demoUser = await ensureUser(DEMO_EMAIL, DEMO_PASSWORD, 'Perched Demo');
  const adminUser = await ensureUser(ADMIN_EMAIL, ADMIN_PASSWORD, 'Perched Admin', { admin: true });

  const friendAuthUsers = [];
  for (const friend of FRIEND_USERS) {
    const user = await ensureUser(friend.email, friend.password, friend.name);
    friendAuthUsers.push({ ...friend, uid: user.uid });
  }

  const friendIds = friendAuthUsers.map((u) => u.uid);

  await ensureUserDoc(demoUser, {
    name: 'Perched Demo',
    handle: 'demo',
    city: 'Houston',
    friends: friendIds,
    premiumStatus: {
      tier: 'premium',
      isActive: true,
      source: 'purchase',
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      period: 'monthly',
      autoRenew: true,
    },
  });

  await ensureUserDoc(adminUser, {
    name: 'Perched Admin',
    handle: 'admin',
    city: 'Houston',
    friends: [],
  });

  for (const friend of friendAuthUsers) {
    await ensureUserDoc({ uid: friend.uid, email: friend.email, displayName: friend.name }, {
      name: friend.name,
      handle: friend.handle,
      city: 'Houston',
      friends: [demoUser.uid],
    });
  }

  const checkinWrites = [];
  for (let i = 0; i < 12; i += 1) {
    const spot = HOUSTON_SPOTS[i % HOUSTON_SPOTS.length];
    const payload = buildCheckin(demoUser, spot, i);
    checkinWrites.push(db.collection('checkins').add(payload));
  }
  await Promise.all(checkinWrites);

  console.log('Demo seed complete');
  console.log(`Demo account: ${DEMO_EMAIL}`);
  console.log(`Admin account: ${ADMIN_EMAIL}`);
  console.log('Created 12 Houston check-ins and 3 friend connections.');
}

main().catch((error) => {
  console.error('Failed to seed demo data:', error);
  process.exit(1);
});
