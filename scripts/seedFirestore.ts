/**
 * Seed Firestore with demo data for testing
 *
 * Run with: npx ts-node scripts/seedFirestore.ts
 * Or: npx tsx scripts/seedFirestore.ts
 */

import { initializeApp, cert, ServiceAccount } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// Initialize Firebase Admin (uses Application Default Credentials in cloud, or service account locally)
// For local development, set GOOGLE_APPLICATION_CREDENTIALS env variable to your service account key
const app = initializeApp({
  projectId: 'spot-app-ce2d8',
});

const db = getFirestore(app);

// Demo users with realistic profiles
const DEMO_USERS = [
  {
    id: 'demo-user-sarah',
    name: 'Sarah Chen',
    handle: 'sarahc',
    email: 'sarah@stanford.edu',
    photoUrl: 'https://i.pravatar.cc/150?img=5',
    campus: 'Stanford University',
    city: 'Palo Alto, CA',
    bio: 'CS major | Coffee enthusiast',
    friends: ['demo-user-maya', 'demo-user-jon', 'demo-user-emma'],
    totalCheckins: 47,
  },
  {
    id: 'demo-user-maya',
    name: 'Maya Patel',
    handle: 'mayap',
    email: 'maya@stanford.edu',
    photoUrl: 'https://i.pravatar.cc/150?img=45',
    campus: 'Stanford University',
    city: 'Palo Alto, CA',
    bio: 'Product Design @ Stanford',
    friends: ['demo-user-sarah', 'demo-user-alex', 'demo-user-david'],
    totalCheckins: 32,
  },
  {
    id: 'demo-user-jon',
    name: 'Jon Rodriguez',
    handle: 'jonstudy',
    email: 'jon@stanford.edu',
    photoUrl: 'https://i.pravatar.cc/150?img=12',
    campus: 'Stanford University',
    city: 'Palo Alto, CA',
    bio: 'Econ + Data Science',
    friends: ['demo-user-sarah', 'demo-user-emma'],
    totalCheckins: 28,
  },
  {
    id: 'demo-user-alex',
    name: 'Alex Kim',
    handle: 'alexk',
    email: 'alex@berkeley.edu',
    photoUrl: 'https://i.pravatar.cc/150?img=33',
    campus: 'UC Berkeley',
    city: 'Berkeley, CA',
    bio: 'EECS @ Cal | Builder',
    friends: ['demo-user-maya', 'demo-user-david'],
    totalCheckins: 53,
  },
  {
    id: 'demo-user-emma',
    name: 'Emma Wilson',
    handle: 'emmaw',
    email: 'emma@stanford.edu',
    photoUrl: 'https://i.pravatar.cc/150?img=24',
    campus: 'Stanford University',
    city: 'Palo Alto, CA',
    bio: 'Pre-med | Study buddy finder',
    friends: ['demo-user-sarah', 'demo-user-jon', 'demo-user-david'],
    totalCheckins: 41,
  },
  {
    id: 'demo-user-david',
    name: 'David Lee',
    handle: 'davidl',
    email: 'david@stanford.edu',
    photoUrl: 'https://i.pravatar.cc/150?img=15',
    campus: 'Stanford University',
    city: 'Palo Alto, CA',
    bio: 'MS&E | Startup life',
    friends: ['demo-user-maya', 'demo-user-alex', 'demo-user-emma'],
    totalCheckins: 65,
  },
  {
    id: 'demo-user-lisa',
    name: 'Lisa Thompson',
    handle: 'lisat',
    email: 'lisa@berkeley.edu',
    photoUrl: 'https://i.pravatar.cc/150?img=48',
    campus: 'UC Berkeley',
    city: 'Berkeley, CA',
    bio: 'Haas MBA | Networking',
    friends: ['demo-user-alex'],
    totalCheckins: 22,
  },
  {
    id: 'demo-user-marcus',
    name: 'Marcus Johnson',
    handle: 'marcusj',
    email: 'marcus@stanford.edu',
    photoUrl: 'https://i.pravatar.cc/150?img=53',
    campus: 'Stanford University',
    city: 'Palo Alto, CA',
    bio: 'PhD Physics | Late night coder',
    friends: ['demo-user-sarah', 'demo-user-jon'],
    totalCheckins: 89,
  },
];

// Demo spots - cafes, libraries, coworking spaces
const DEMO_SPOTS = [
  {
    name: 'Blue Bottle Coffee',
    placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
    location: { lat: 37.4419, lng: -122.1430 },
    tags: ['Wi-Fi', 'Quiet', 'Outlets'],
    category: 'cafe',
    address: '456 University Ave, Palo Alto, CA',
  },
  {
    name: 'Philz Coffee',
    placeId: 'ChIJrTLr-ByuEmsRdS2mBRaV9Xw',
    location: { lat: 37.4435, lng: -122.1612 },
    tags: ['Social', 'Wi-Fi', 'Bright'],
    category: 'cafe',
    address: '101 Forest Ave, Palo Alto, CA',
  },
  {
    name: 'Green Library',
    placeId: 'ChIJ9zPnPKe6j4ARfWLpBMEljSw',
    location: { lat: 37.4275, lng: -122.1697 },
    tags: ['Quiet', 'Study', 'Seating'],
    category: 'library',
    address: 'Stanford University, Stanford, CA',
  },
  {
    name: 'Coupa Cafe',
    placeId: 'ChIJIQBpAG2xhYAR_6128GcTUEo',
    location: { lat: 37.4267, lng: -122.1690 },
    tags: ['Social', 'Wi-Fi', 'Late-night'],
    category: 'cafe',
    address: '538 Ramona St, Palo Alto, CA',
  },
  {
    name: 'Bytes Cafe',
    placeId: 'demo-place-bytes',
    location: { lat: 37.4320, lng: -122.1756 },
    tags: ['Campus', 'Quick bites', 'Seating'],
    category: 'cafe',
    address: 'Gates Building, Stanford, CA',
  },
  {
    name: 'Doe Library',
    placeId: 'demo-place-doe',
    location: { lat: 37.8723, lng: -122.2595 },
    tags: ['Quiet', 'Historic', 'Study'],
    category: 'library',
    address: 'UC Berkeley, Berkeley, CA',
  },
  {
    name: 'Free Speech Cafe',
    placeId: 'demo-place-freespeech',
    location: { lat: 37.8695, lng: -122.2590 },
    tags: ['Wi-Fi', 'Busy', 'Social'],
    category: 'cafe',
    address: 'Moffitt Library, UC Berkeley, CA',
  },
  {
    name: 'Sightglass Coffee',
    placeId: 'demo-place-sightglass',
    location: { lat: 37.7743, lng: -122.4097 },
    tags: ['Wi-Fi', 'Spacious', 'Bright'],
    category: 'cafe',
    address: '270 7th St, San Francisco, CA',
  },
  {
    name: 'Ritual Coffee Roasters',
    placeId: 'demo-place-ritual',
    location: { lat: 37.7565, lng: -122.4211 },
    tags: ['Hip', 'Outlets', 'Music'],
    category: 'cafe',
    address: '1026 Valencia St, San Francisco, CA',
  },
  {
    name: 'The Study Hall',
    placeId: 'demo-place-studyhall',
    location: { lat: 37.4445, lng: -122.1601 },
    tags: ['Coworking', 'Quiet', '24/7'],
    category: 'coworking',
    address: '200 Hamilton Ave, Palo Alto, CA',
  },
];

// Captions
const DEMO_CAPTIONS = [
  'Perfect spot for deep work',
  'Great vibes here today!',
  'Finally found a quiet corner',
  'Best coffee in the area',
  'Crushing this project',
  'Study sesh with the crew',
  'Love the natural lighting here',
  'Fast WiFi + good music = productivity',
  'My go-to spot for finals week',
  'Hidden gem!',
  'Outlets everywhere',
  "Can't beat this atmosphere",
  'Where I get my best work done',
  'Perfect for morning meetings',
  'Cozy and focused',
  'Midterms grind mode activated',
  'Best matcha latte in town',
  'Found my new favorite spot',
  'Late night coding session',
  'Sunday study vibes',
  '',
  '',
  '', // Some without captions
];

// Photo URLs
const DEMO_PHOTOS = [
  'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80',
  'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&q=80',
  'https://images.unsplash.com/photo-1521017432531-fbd92d768814?w=800&q=80',
  'https://images.unsplash.com/photo-1481833761820-0509d3217039?w=800&q=80',
  'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800&q=80',
  'https://images.unsplash.com/photo-1501959915551-4e8d30928317?w=800&q=80',
  'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=800&q=80',
  'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=800&q=80',
  'https://images.unsplash.com/photo-1453614512568-c4024d13c247?w=800&q=80',
  'https://images.unsplash.com/photo-1497935586351-b67a49e012bf?w=800&q=80',
  'https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=800&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80',
];

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateTimestamp(hoursAgo: number): Date {
  const now = new Date();
  const jitter = Math.random() * 30 * 60 * 1000; // 0-30 min jitter
  return new Date(now.getTime() - hoursAgo * 60 * 60 * 1000 - jitter);
}

async function seedUsers() {
  console.log('Seeding users...');
  const batch = db.batch();

  for (const user of DEMO_USERS) {
    const userRef = db.collection('users').doc(user.id);
    batch.set(userRef, {
      ...user,
      createdAt: Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)), // 30 days ago
      updatedAt: Timestamp.now(),
      emailVerified: true,
    });
  }

  await batch.commit();
  console.log(`✅ Created ${DEMO_USERS.length} demo users`);
}

async function seedCheckins() {
  console.log('Seeding check-ins...');
  const checkinsToCreate = 40;
  const batch = db.batch();

  // Utility metric options
  const wifiSpeeds = [3, 3, 4, 4, 4, 5, 5] as const; // Mostly good WiFi
  const noiseLevels = ['quiet', 'quiet', 'moderate', 'moderate', 'lively'] as const;
  const busynessLevels = [1, 2, 2, 3, 3, 3, 4, 4, 5] as const;

  for (let i = 0; i < checkinsToCreate; i++) {
    const user = randomElement(DEMO_USERS);
    const spot = randomElement(DEMO_SPOTS);
    const caption = randomElement(DEMO_CAPTIONS);
    const photo = randomElement(DEMO_PHOTOS);
    const hoursAgo = Math.random() * 20; // Within last 20 hours
    const createdAt = generateTimestamp(hoursAgo);
    const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);

    // Generate utility metrics (70% chance of having each metric)
    const wifiSpeed = Math.random() > 0.3 ? randomElement([...wifiSpeeds]) : undefined;
    const noiseLevel = Math.random() > 0.3 ? randomElement([...noiseLevels]) : undefined;
    const busyness = Math.random() > 0.3 ? randomElement([...busynessLevels]) : undefined;
    const laptopFriendly = Math.random() > 0.3 ? (Math.random() > 0.2) : undefined; // 80% say yes when provided

    const checkinId = `demo-checkin-${Date.now()}-${i}`;
    const checkinRef = db.collection('checkins').doc(checkinId);

    batch.set(checkinRef, {
      id: checkinId,
      userId: user.id,
      userName: user.name,
      userHandle: user.handle,
      userPhotoUrl: user.photoUrl,
      spotName: spot.name,
      spotPlaceId: spot.placeId,
      spotLatLng: spot.location,
      spotAddress: spot.address,
      photoUrl: photo,
      caption,
      tags: spot.tags,
      campus: user.campus,
      city: user.city,
      campusOrCity: user.campus,
      visibility: 'public',
      createdAt: Timestamp.fromDate(createdAt),
      expiresAt: Timestamp.fromDate(expiresAt),
      // Utility metrics
      ...(wifiSpeed && { wifiSpeed }),
      ...(noiseLevel && { noiseLevel }),
      ...(busyness && { busyness }),
      ...(laptopFriendly !== undefined && { laptopFriendly }),
      __demo: true,
    });
  }

  await batch.commit();
  console.log(`✅ Created ${checkinsToCreate} demo check-ins with utility metrics`);
}

async function seedFriendRequests() {
  console.log('Seeding friend requests...');
  const batch = db.batch();

  // Create a few pending friend requests
  const requests = [
    { from: 'demo-user-lisa', to: 'demo-user-sarah' },
    { from: 'demo-user-marcus', to: 'demo-user-maya' },
  ];

  for (const req of requests) {
    const requestId = `${req.from}_${req.to}`;
    const requestRef = db.collection('friendRequests').doc(requestId);
    batch.set(requestRef, {
      id: requestId,
      from: req.from,
      to: req.to,
      status: 'pending',
      createdAt: Timestamp.fromDate(generateTimestamp(Math.random() * 48)),
    });
  }

  await batch.commit();
  console.log(`✅ Created ${requests.length} demo friend requests`);
}

async function clearDemoData() {
  console.log('Clearing existing demo data...');

  // Clear demo checkins
  const checkinsSnapshot = await db.collection('checkins')
    .where('__demo', '==', true)
    .get();

  const batch = db.batch();
  checkinsSnapshot.docs.forEach(doc => batch.delete(doc.ref));

  // Clear demo users
  for (const user of DEMO_USERS) {
    batch.delete(db.collection('users').doc(user.id));
  }

  // Clear demo friend requests
  const requestsSnapshot = await db.collection('friendRequests').get();
  requestsSnapshot.docs.forEach(doc => {
    if (doc.id.includes('demo-user')) {
      batch.delete(doc.ref);
    }
  });

  await batch.commit();
  console.log('✅ Cleared existing demo data');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--clear')) {
    await clearDemoData();
    console.log('Done!');
    process.exit(0);
  }

  if (args.includes('--fresh')) {
    await clearDemoData();
  }

  await seedUsers();
  await seedCheckins();
  await seedFriendRequests();

  console.log('\n🎉 Firestore seeded successfully!');
  console.log('Demo users:', DEMO_USERS.map(u => u.handle).join(', '));
  process.exit(0);
}

main().catch(err => {
  console.error('Error seeding Firestore:', err);
  process.exit(1);
});
