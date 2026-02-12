/**
 * Seed demo account for App Store review.
 *
 * Creates or updates:
 * - demo@perched.app user
 * - 3 friend users
 * - 5 Houston demo spots
 * - 15 demo-user check-ins over last 14 days
 * - 10 friend check-ins for social feed
 * - bidirectional friendships
 *
 * Usage:
 *   npx ts-node scripts/seedDemoAccount.ts [--service-account ./perched-service-account.json]
 *
 * Security:
 * - Keep service account JSON out of git.
 * - This script is idempotent (safe to run multiple times).
 */

import fs from 'node:fs';
import path from 'node:path';
import admin from 'firebase-admin';
import { geohashForLocation } from 'geofire-common';

interface SeedUser {
  email: string;
  password: string;
  displayName: string;
  username: string;
  photoURL: string;
}

interface SeedSpot {
  id: string;
  name: string;
  address: string;
  placeId: string;
  lat: number;
  lng: number;
  category: 'cafe' | 'coworking' | 'library' | 'other';
  priceLevel: '$' | '$$' | '$$$' | '$$$$';
  avgRating: number;
}

interface SeedCheckinPlan {
  docId: string;
  userKey: 'demo' | 'friend1' | 'friend2' | 'friend3';
  spotId: string;
  daysAgo: number;
  wifiSpeed: 1 | 2 | 3 | 4 | 5;
  noiseLevel: 1 | 2 | 3 | 4 | 5;
  busyness: 1 | 2 | 3 | 4 | 5;
  outletAvailability: 'plenty' | 'some' | 'few' | 'none';
  caption: string;
}

const SPOT_PHOTO_URLS: Record<string, string[]> = {
  'demo-blacksmith': [
    'https://images.unsplash.com/photo-1559305616-3bed4d52be3a?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1497515114629-f71d768fd07c?auto=format&fit=crop&w=1400&q=80',
  ],
  'demo-catalina': [
    'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&w=1400&q=80',
  ],
  'demo-boomtown': [
    'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1400&q=80',
  ],
  'demo-coffeebar': [
    'https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?auto=format&fit=crop&w=1400&q=80',
  ],
  'demo-honeymoon': [
    'https://images.unsplash.com/photo-1522992319-0365e5f11656?auto=format&fit=crop&w=1400&q=80',
    'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1400&q=80',
  ],
};

const DEMO_USER: SeedUser = {
  email: 'demo@perched.app',
  password: 'TestPassword123',
  displayName: 'Demo User',
  username: 'demo_user',
  photoURL: 'https://i.pravatar.cc/300?img=1',
};

const FRIEND_USERS: SeedUser[] = [
  {
    email: 'friend1@perched.app',
    password: 'TestPassword123',
    displayName: 'Sarah Chen',
    username: 'sarah_chen',
    photoURL: 'https://i.pravatar.cc/300?img=5',
  },
  {
    email: 'friend2@perched.app',
    password: 'TestPassword123',
    displayName: 'Marcus Johnson',
    username: 'marcus_johnson',
    photoURL: 'https://i.pravatar.cc/300?img=12',
  },
  {
    email: 'friend3@perched.app',
    password: 'TestPassword123',
    displayName: 'Priya Patel',
    username: 'priya_patel',
    photoURL: 'https://i.pravatar.cc/300?img=9',
  },
];

const DEMO_SPOTS: SeedSpot[] = [
  {
    id: 'demo-blacksmith',
    name: 'Blacksmith',
    address: '1018 Westheimer Rd, Houston, TX 77006',
    placeId: 'demo_place_blacksmith',
    lat: 29.743,
    lng: -95.3977,
    category: 'cafe',
    priceLevel: '$$',
    avgRating: 4.6,
  },
  {
    id: 'demo-catalina',
    name: 'Catalina Coffee',
    address: '2201 Washington Ave, Houston, TX 77007',
    placeId: 'demo_place_catalina',
    lat: 29.7641,
    lng: -95.4001,
    category: 'cafe',
    priceLevel: '$$',
    avgRating: 4.4,
  },
  {
    id: 'demo-boomtown',
    name: 'Boomtown Coffee',
    address: '242 W 19th St, Houston, TX 77008',
    placeId: 'demo_place_boomtown',
    lat: 29.7995,
    lng: -95.4012,
    category: 'cafe',
    priceLevel: '$$',
    avgRating: 4.5,
  },
  {
    id: 'demo-coffeebar',
    name: 'Coffeebar',
    address: '1201 W Alabama St, Houston, TX 77006',
    placeId: 'demo_place_coffeebar',
    lat: 29.736,
    lng: -95.4003,
    category: 'cafe',
    priceLevel: '$$',
    avgRating: 4.3,
  },
  {
    id: 'demo-honeymoon',
    name: 'Honeymoon Cafe',
    address: '3333 Audley St, Houston, TX 77098',
    placeId: 'demo_place_honeymoon',
    lat: 29.749,
    lng: -95.4134,
    category: 'cafe',
    priceLevel: '$$',
    avgRating: 4.2,
  },
];

const DEMO_CHECKINS: SeedCheckinPlan[] = [
  { docId: 'demo-checkin-01', userKey: 'demo', spotId: 'demo-blacksmith', daysAgo: 1, wifiSpeed: 5, noiseLevel: 2, busyness: 3, outletAvailability: 'plenty', caption: 'Locked in for deep work.' },
  { docId: 'demo-checkin-02', userKey: 'demo', spotId: 'demo-catalina', daysAgo: 2, wifiSpeed: 4, noiseLevel: 3, busyness: 4, outletAvailability: 'some', caption: 'Great coffee and good pace.' },
  { docId: 'demo-checkin-03', userKey: 'demo', spotId: 'demo-boomtown', daysAgo: 3, wifiSpeed: 5, noiseLevel: 2, busyness: 2, outletAvailability: 'plenty', caption: 'Quiet morning session.' },
  { docId: 'demo-checkin-04', userKey: 'demo', spotId: 'demo-coffeebar', daysAgo: 4, wifiSpeed: 3, noiseLevel: 4, busyness: 5, outletAvailability: 'few', caption: 'Crowded lunch rush.' },
  { docId: 'demo-checkin-05', userKey: 'demo', spotId: 'demo-honeymoon', daysAgo: 5, wifiSpeed: 4, noiseLevel: 3, busyness: 3, outletAvailability: 'some', caption: 'Solid afternoon grind.' },
  { docId: 'demo-checkin-06', userKey: 'demo', spotId: 'demo-blacksmith', daysAgo: 6, wifiSpeed: 5, noiseLevel: 2, busyness: 2, outletAvailability: 'plenty', caption: 'Fast WiFi today.' },
  { docId: 'demo-checkin-07', userKey: 'demo', spotId: 'demo-catalina', daysAgo: 7, wifiSpeed: 4, noiseLevel: 3, busyness: 4, outletAvailability: 'some', caption: 'Meeting prep.' },
  { docId: 'demo-checkin-08', userKey: 'demo', spotId: 'demo-boomtown', daysAgo: 8, wifiSpeed: 5, noiseLevel: 2, busyness: 2, outletAvailability: 'plenty', caption: 'Good focus energy.' },
  { docId: 'demo-checkin-09', userKey: 'demo', spotId: 'demo-coffeebar', daysAgo: 9, wifiSpeed: 3, noiseLevel: 4, busyness: 5, outletAvailability: 'few', caption: 'Busy but productive.' },
  { docId: 'demo-checkin-10', userKey: 'demo', spotId: 'demo-honeymoon', daysAgo: 10, wifiSpeed: 4, noiseLevel: 3, busyness: 2, outletAvailability: 'some', caption: 'Calmer than usual.' },
  { docId: 'demo-checkin-11', userKey: 'demo', spotId: 'demo-blacksmith', daysAgo: 11, wifiSpeed: 5, noiseLevel: 2, busyness: 3, outletAvailability: 'plenty', caption: 'Great corner table.' },
  { docId: 'demo-checkin-12', userKey: 'demo', spotId: 'demo-catalina', daysAgo: 12, wifiSpeed: 4, noiseLevel: 3, busyness: 4, outletAvailability: 'some', caption: 'Good pre-class stop.' },
  { docId: 'demo-checkin-13', userKey: 'demo', spotId: 'demo-boomtown', daysAgo: 13, wifiSpeed: 5, noiseLevel: 2, busyness: 2, outletAvailability: 'plenty', caption: 'Morning sprint complete.' },
  { docId: 'demo-checkin-14', userKey: 'demo', spotId: 'demo-coffeebar', daysAgo: 14, wifiSpeed: 3, noiseLevel: 4, busyness: 5, outletAvailability: 'few', caption: 'Peak hour chaos.' },
  { docId: 'demo-checkin-15', userKey: 'demo', spotId: 'demo-honeymoon', daysAgo: 0, wifiSpeed: 4, noiseLevel: 2, busyness: 3, outletAvailability: 'some', caption: 'Live now and working.' },
];

const FRIEND_CHECKINS: SeedCheckinPlan[] = [
  { docId: 'friend-checkin-01', userKey: 'friend1', spotId: 'demo-blacksmith', daysAgo: 0, wifiSpeed: 5, noiseLevel: 2, busyness: 3, outletAvailability: 'plenty', caption: 'Here now for a sprint.' },
  { docId: 'friend-checkin-02', userKey: 'friend2', spotId: 'demo-catalina', daysAgo: 1, wifiSpeed: 4, noiseLevel: 3, busyness: 4, outletAvailability: 'some', caption: 'Late afternoon check-in.' },
  { docId: 'friend-checkin-03', userKey: 'friend3', spotId: 'demo-boomtown', daysAgo: 1, wifiSpeed: 5, noiseLevel: 2, busyness: 2, outletAvailability: 'plenty', caption: 'Quiet booth found.' },
  { docId: 'friend-checkin-04', userKey: 'friend1', spotId: 'demo-coffeebar', daysAgo: 2, wifiSpeed: 3, noiseLevel: 4, busyness: 5, outletAvailability: 'few', caption: 'Packed but fun.' },
  { docId: 'friend-checkin-05', userKey: 'friend2', spotId: 'demo-honeymoon', daysAgo: 3, wifiSpeed: 4, noiseLevel: 3, busyness: 3, outletAvailability: 'some', caption: 'Good for project sync.' },
  { docId: 'friend-checkin-06', userKey: 'friend3', spotId: 'demo-blacksmith', daysAgo: 4, wifiSpeed: 5, noiseLevel: 2, busyness: 2, outletAvailability: 'plenty', caption: 'Fast upload speeds.' },
  { docId: 'friend-checkin-07', userKey: 'friend1', spotId: 'demo-catalina', daysAgo: 5, wifiSpeed: 4, noiseLevel: 3, busyness: 4, outletAvailability: 'some', caption: 'Meeting prep here.' },
  { docId: 'friend-checkin-08', userKey: 'friend2', spotId: 'demo-boomtown', daysAgo: 6, wifiSpeed: 5, noiseLevel: 2, busyness: 2, outletAvailability: 'plenty', caption: 'Best morning spot.' },
  { docId: 'friend-checkin-09', userKey: 'friend3', spotId: 'demo-coffeebar', daysAgo: 7, wifiSpeed: 3, noiseLevel: 4, busyness: 5, outletAvailability: 'few', caption: 'Busy lunch crowd.' },
  { docId: 'friend-checkin-10', userKey: 'friend1', spotId: 'demo-honeymoon', daysAgo: 8, wifiSpeed: 4, noiseLevel: 3, busyness: 2, outletAvailability: 'some', caption: 'Calm evening session.' },
];

function parseArgs(argv: string[]) {
  const serviceFlagIndex = argv.indexOf('--service-account');
  const serviceAccountPath = serviceFlagIndex >= 0 && argv[serviceFlagIndex + 1]
    ? argv[serviceFlagIndex + 1]
    : path.resolve(process.cwd(), 'perched-service-account.json');
  return { serviceAccountPath };
}

function initAdmin(serviceAccountPath: string) {
  const resolved = path.resolve(serviceAccountPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Service account file not found: ${resolved}`);
  }

  const raw = fs.readFileSync(resolved, 'utf8');
  const json = JSON.parse(raw);

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(json as admin.ServiceAccount),
    });
  }

  return {
    db: admin.firestore(),
    auth: admin.auth(),
  };
}

async function ensureUser(
  db: admin.firestore.Firestore,
  auth: admin.auth.Auth,
  user: SeedUser,
  forcedUid?: string
): Promise<string> {
  const existing = await auth.getUserByEmail(user.email).catch(() => null);
  let uid = existing?.uid || '';

  if (!uid) {
    const created = await auth.createUser({
      uid: forcedUid,
      email: user.email,
      password: user.password,
      displayName: user.displayName,
      photoURL: user.photoURL,
    });
    uid = created.uid;
    console.log(`  ✓ created auth user ${user.email}`);
  } else {
    await auth.updateUser(uid, {
      displayName: user.displayName,
      photoURL: user.photoURL,
    }).catch(() => undefined);
    console.log(`  • using existing auth user ${user.email}`);
  }

  await db.collection('users').doc(uid).set(
    {
      id: uid,
      email: user.email,
      displayName: user.displayName,
      username: user.username,
      userHandle: user.username,
      photoURL: user.photoURL,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return uid;
}

async function ensureSpot(db: admin.firestore.Firestore, spot: SeedSpot) {
  const geoHash = geohashForLocation([spot.lat, spot.lng], 7);

  await db.collection('spots').doc(spot.id).set(
    {
      id: spot.id,
      name: spot.name,
      address: spot.address,
      placeId: spot.placeId,
      geoHash,
      lat: spot.lat,
      lng: spot.lng,
      intel: {
        priceLevel: spot.priceLevel,
        avgRating: spot.avgRating,
        category: spot.category,
        isOpenNow: true,
        inferredNoise: 'quiet',
        inferredNoiseConfidence: 0.82,
        hasWifi: true,
        wifiConfidence: 0.9,
        goodForStudying: true,
        goodForMeetings: true,
        source: 'api+nlp',
        lastUpdated: Date.now(),
        reviewCount: 12,
      },
      live: null,
      display: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

function noiseFromScore(noiseLevel: number): 'quiet' | 'moderate' | 'loud' {
  if (noiseLevel <= 2) return 'quiet';
  if (noiseLevel <= 3) return 'moderate';
  return 'loud';
}

function busynessFromScore(busyness: number): 'empty' | 'some' | 'packed' {
  if (busyness <= 2) return 'empty';
  if (busyness <= 3) return 'some';
  return 'packed';
}

function tagsForPlan(plan: SeedCheckinPlan): string[] {
  const tags: string[] = [];
  if (plan.wifiSpeed >= 4) tags.push('Wi-Fi');
  if (plan.noiseLevel <= 2) tags.push('Quiet');
  if (plan.outletAvailability === 'plenty' || plan.outletAvailability === 'some') tags.push('Outlets');
  return tags.slice(0, 3);
}

function pickPhotoUrl(plan: SeedCheckinPlan): string | null {
  const options = SPOT_PHOTO_URLS[plan.spotId] || [];
  if (!options.length) return null;
  const index = Math.abs(plan.daysAgo + plan.docId.length) % options.length;
  return options[index] || null;
}

async function upsertCheckin(
  db: admin.firestore.Firestore,
  userMap: Record<string, { uid: string; profile: SeedUser }>,
  plan: SeedCheckinPlan
) {
  const owner = userMap[plan.userKey];
  const spot = DEMO_SPOTS.find((entry) => entry.id === plan.spotId);
  if (!owner || !spot) {
    throw new Error(`Invalid checkin plan owner/spot for ${plan.docId}`);
  }

  const timestampMs = Date.now() - plan.daysAgo * 24 * 60 * 60 * 1000;
  const createdAt = admin.firestore.Timestamp.fromMillis(timestampMs);
  const photoUrl = pickPhotoUrl(plan);

  await db.collection('checkins').doc(plan.docId).set(
    {
      id: plan.docId,
      clientId: plan.docId,
      userId: owner.uid,
      userName: owner.profile.displayName,
      userHandle: owner.profile.username,
      userPhotoUrl: owner.profile.photoURL,
      visibility: 'public',
      spotName: spot.name,
      spotPlaceId: spot.id,
      spotLatLng: { lat: spot.lat, lng: spot.lng },
      location: new admin.firestore.GeoPoint(spot.lat, spot.lng),
      caption: plan.caption,
      tags: tagsForPlan(plan),
      photoUrl,
      image: photoUrl,
      photoPending: false,
      campusOrCity: 'Houston',
      city: 'Houston',
      campus: null,
      // Utility metrics (existing app shape)
      wifiSpeed: plan.wifiSpeed,
      noiseLevel: plan.noiseLevel,
      busyness: plan.busyness,
      outletAvailability: plan.outletAvailability,
      // Alternate shape for newer services
      metrics: {
        wifi: plan.wifiSpeed,
        noise: noiseFromScore(plan.noiseLevel),
        busyness: busynessFromScore(plan.busyness),
        powerOutlets: plan.outletAvailability,
      },
      approved: true,
      moderation: { status: 'approved' },
      createdAt,
      timestamp: timestampMs,
      createdAtMs: timestampMs,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAtServer: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function ensureFriendship(
  db: admin.firestore.Firestore,
  userA: string,
  userB: string
) {
  const forwardId = `${userA}__${userB}`;
  const reverseId = `${userB}__${userA}`;

  await db.collection('friends').doc(forwardId).set(
    {
      userId: userA,
      friendId: userB,
      status: 'accepted',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await db.collection('friends').doc(reverseId).set(
    {
      userId: userB,
      friendId: userA,
      status: 'accepted',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await db.collection('users').doc(userA).set(
    { friends: admin.firestore.FieldValue.arrayUnion(userB) },
    { merge: true }
  );

  await db.collection('users').doc(userB).set(
    { friends: admin.firestore.FieldValue.arrayUnion(userA) },
    { merge: true }
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { db, auth } = initAdmin(options.serviceAccountPath);

  console.log('\nSeeding demo account for App Review\n');

  console.log('1) Ensuring users...');
  const demoUid = await ensureUser(db, auth, DEMO_USER, 'demo-user-12345');
  const friendUids = await Promise.all(FRIEND_USERS.map((user) => ensureUser(db, auth, user)));

  const userMap: Record<string, { uid: string; profile: SeedUser }> = {
    demo: { uid: demoUid, profile: DEMO_USER },
    friend1: { uid: friendUids[0], profile: FRIEND_USERS[0] },
    friend2: { uid: friendUids[1], profile: FRIEND_USERS[1] },
    friend3: { uid: friendUids[2], profile: FRIEND_USERS[2] },
  };

  console.log('\n2) Ensuring spots...');
  for (const spot of DEMO_SPOTS) {
    await ensureSpot(db, spot);
    console.log(`  ✓ ${spot.name}`);
  }

  console.log('\n3) Ensuring friendships...');
  for (const friendUid of friendUids) {
    await ensureFriendship(db, demoUid, friendUid);
    console.log(`  ✓ ${demoUid} <-> ${friendUid}`);
  }

  console.log('\n4) Upserting demo user check-ins...');
  for (const plan of DEMO_CHECKINS) {
    await upsertCheckin(db, userMap, plan);
    console.log(`  ✓ ${plan.docId}`);
  }

  console.log('\n5) Upserting friend check-ins...');
  for (const plan of FRIEND_CHECKINS) {
    await upsertCheckin(db, userMap, plan);
    console.log(`  ✓ ${plan.docId}`);
  }

  await db.collection('users').doc(demoUid).set(
    {
      checkInCount: DEMO_CHECKINS.length,
      streakDays: 7,
      badgesUnlocked: ['explorer', 'early_adopter', 'social_butterfly'],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log('\n' + '='.repeat(64));
  console.log('Demo seed completed');
  console.log('='.repeat(64));
  console.log(`Demo email:    ${DEMO_USER.email}`);
  console.log(`Demo password: ${DEMO_USER.password}`);
  console.log('Created/updated:');
  console.log(`- Users:       1 demo + ${FRIEND_USERS.length} friends`);
  console.log(`- Spots:       ${DEMO_SPOTS.length}`);
  console.log(`- Check-ins:   ${DEMO_CHECKINS.length + FRIEND_CHECKINS.length}`);
  console.log('- Friend links: bidirectional demo<->friends');
  console.log('='.repeat(64) + '\n');
}

main().catch((error) => {
  console.error('\nSeed failed:', error);
  process.exit(1);
});
