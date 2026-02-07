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

// Demo users - Houston-based (Rice, UH, local professionals)
const DEMO_USERS = [
  {
    id: 'demo-user-sarah',
    name: 'Sarah Chen',
    handle: 'sarahc',
    email: 'sarah@rice.edu',
    photoUrl: 'https://i.pravatar.cc/150?img=5',
    campus: 'Rice University',
    city: 'Houston, TX',
    bio: 'CS major | Coffee enthusiast',
    friends: ['demo-user-maya', 'demo-user-jon', 'demo-user-emma'],
    totalCheckins: 47,
  },
  {
    id: 'demo-user-maya',
    name: 'Maya Patel',
    handle: 'mayap',
    email: 'maya@rice.edu',
    photoUrl: 'https://i.pravatar.cc/150?img=45',
    campus: 'Rice University',
    city: 'Houston, TX',
    bio: 'Architecture @ Rice',
    friends: ['demo-user-sarah', 'demo-user-alex', 'demo-user-david'],
    totalCheckins: 32,
  },
  {
    id: 'demo-user-jon',
    name: 'Jon Rodriguez',
    handle: 'jonstudy',
    email: 'jon@uh.edu',
    photoUrl: 'https://i.pravatar.cc/150?img=12',
    campus: 'University of Houston',
    city: 'Houston, TX',
    bio: 'Business + Data Science',
    friends: ['demo-user-sarah', 'demo-user-emma'],
    totalCheckins: 28,
  },
  {
    id: 'demo-user-alex',
    name: 'Alex Kim',
    handle: 'alexk',
    email: 'alex@rice.edu',
    photoUrl: 'https://i.pravatar.cc/150?img=33',
    campus: 'Rice University',
    city: 'Houston, TX',
    bio: 'ECE @ Rice | Builder',
    friends: ['demo-user-maya', 'demo-user-david'],
    totalCheckins: 53,
  },
  {
    id: 'demo-user-emma',
    name: 'Emma Wilson',
    handle: 'emmaw',
    email: 'emma@rice.edu',
    photoUrl: 'https://i.pravatar.cc/150?img=24',
    campus: 'Rice University',
    city: 'Houston, TX',
    bio: 'Pre-med | Study buddy finder',
    friends: ['demo-user-sarah', 'demo-user-jon', 'demo-user-david'],
    totalCheckins: 41,
  },
  {
    id: 'demo-user-david',
    name: 'David Lee',
    handle: 'davidl',
    email: 'david@uh.edu',
    photoUrl: 'https://i.pravatar.cc/150?img=15',
    campus: 'University of Houston',
    city: 'Houston, TX',
    bio: 'MBA | Startup life',
    friends: ['demo-user-maya', 'demo-user-alex', 'demo-user-emma'],
    totalCheckins: 65,
  },
  {
    id: 'demo-user-lisa',
    name: 'Lisa Thompson',
    handle: 'lisat',
    email: 'lisa@rice.edu',
    photoUrl: 'https://i.pravatar.cc/150?img=48',
    campus: 'Rice University',
    city: 'Houston, TX',
    bio: 'Jones MBA | Networking',
    friends: ['demo-user-alex'],
    totalCheckins: 22,
  },
  {
    id: 'demo-user-marcus',
    name: 'Marcus Johnson',
    handle: 'marcusj',
    email: 'marcus@rice.edu',
    photoUrl: 'https://i.pravatar.cc/150?img=53',
    campus: 'Rice University',
    city: 'Houston, TX',
    bio: 'PhD Physics | Late night coder',
    friends: ['demo-user-sarah', 'demo-user-jon'],
    totalCheckins: 89,
  },
];

// Real Houston spots - cafes, libraries, coworking spaces
// Coordinates are in Houston area (around 29.7° N, 95.4° W)
const DEMO_SPOTS = [
  {
    name: 'Boomtown Coffee',
    placeId: 'ChIJQaJNnMq_QIYRgGPBBisuZ4I',
    location: { lat: 29.8024, lng: -95.4101 },
    tags: ['Wi-Fi', 'Spacious', 'Outlets'],
    category: 'cafe',
    address: '242 W 19th St, Houston, TX',
    photos: [
      'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800&q=80', // Coffee shop interior
      'https://images.unsplash.com/photo-1445116572660-236099ec97a0?w=800&q=80', // Cafe with laptop
    ],
  },
  {
    name: 'Retrospect Coffee Bar',
    placeId: 'ChIJd8BlQ2XBQIYRvp8aREjr-jQ',
    location: { lat: 29.7386, lng: -95.3865 },
    tags: ['Cozy', 'Wi-Fi', 'Quiet'],
    category: 'cafe',
    address: '3709 La Branch St, Houston, TX',
    photos: [
      'https://images.unsplash.com/photo-1559496417-e7f25cb247f3?w=800&q=80', // Minimal coffee shop
      'https://images.unsplash.com/photo-1511920170033-f8396924c348?w=800&q=80', // Coffee and pastry
    ],
  },
  {
    name: 'Fondren Library',
    placeId: 'ChIJyxKlzLTBQIYRTKCTnOXaR3Y',
    location: { lat: 29.7182, lng: -95.4019 },
    tags: ['Quiet', 'Study', 'Seating'],
    category: 'library',
    address: 'Rice University, Houston, TX',
    photos: [
      'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=800&q=80', // Library interior
      'https://images.unsplash.com/photo-1568667256549-094345857637?w=800&q=80', // Study tables
    ],
  },
  {
    name: 'Tout Suite',
    placeId: 'ChIJE0JZQR7AQIYRV_7R6a-Yb3g',
    location: { lat: 29.7537, lng: -95.3531 },
    tags: ['Bright', 'Social', 'Wi-Fi'],
    category: 'cafe',
    address: '2001 Commerce St, Houston, TX',
    photos: [
      'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&q=80', // Modern cafe
      'https://images.unsplash.com/photo-1493857671505-72967e2e2760?w=800&q=80', // Coffee and work
    ],
  },
  {
    name: 'Campesino Coffee House',
    placeId: 'demo-place-campesino',
    location: { lat: 29.7476, lng: -95.3694 },
    tags: ['Wi-Fi', 'Chill', 'Outlets'],
    category: 'cafe',
    address: '2602 Waugh Dr, Houston, TX',
    photos: [
      'https://images.unsplash.com/photo-1442512595331-e89e73853f31?w=800&q=80', // Latte art
      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80', // Cafe atmosphere
    ],
  },
  {
    name: 'MD Anderson Library',
    placeId: 'demo-place-mdanderson',
    location: { lat: 29.7215, lng: -95.3430 },
    tags: ['Quiet', 'Study', '24/7'],
    category: 'library',
    address: 'University of Houston, Houston, TX',
    photos: [
      'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=800&q=80', // Library bookshelves
      'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=800&q=80', // Study area
    ],
  },
  {
    name: 'Common Bond Bistro',
    placeId: 'demo-place-commonbond',
    location: { lat: 29.7430, lng: -95.3908 },
    tags: ['Bright', 'Wi-Fi', 'Social'],
    category: 'cafe',
    address: '1706 Westheimer Rd, Houston, TX',
    photos: [
      'https://images.unsplash.com/photo-1559925393-8be0ec4767c8?w=800&q=80', // Bakery cafe
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80', // Restaurant interior
    ],
  },
  {
    name: 'Siphon Coffee',
    placeId: 'demo-place-siphon',
    location: { lat: 29.8015, lng: -95.4085 },
    tags: ['Specialty', 'Quiet', 'Cozy'],
    category: 'cafe',
    address: '701 W 19th St, Houston, TX',
    photos: [
      'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800&q=80', // Pour over coffee
      'https://images.unsplash.com/photo-1498804103079-a6351b050096?w=800&q=80', // Coffee brewing
    ],
  },
  {
    name: 'The Nook Cafe',
    placeId: 'demo-place-nook',
    location: { lat: 29.7603, lng: -95.3628 },
    tags: ['Cozy', 'Wi-Fi', 'Pastries'],
    category: 'cafe',
    address: '1006 McGowen St, Houston, TX',
    photos: [
      'https://images.unsplash.com/photo-1453614512568-c4024d13c247?w=800&q=80', // Cozy cafe corner
      'https://images.unsplash.com/photo-1464979681340-bdd28a61699e?w=800&q=80', // Coffee and book
    ],
  },
  {
    name: 'Agora',
    placeId: 'demo-place-agora',
    location: { lat: 29.7445, lng: -95.3907 },
    tags: ['Late-night', 'Social', 'Wi-Fi'],
    category: 'cafe',
    address: '1712 Westheimer Rd, Houston, TX',
    photos: [
      'https://images.unsplash.com/photo-1521017432531-fbd92d768814?w=800&q=80', // Evening cafe vibes
      'https://images.unsplash.com/photo-1485182708500-e8f1f318ba72?w=800&q=80', // Late night coffee
    ],
  },
  {
    name: 'Brazos Bookstore & Cafe',
    placeId: 'demo-place-brazos',
    location: { lat: 29.7291, lng: -95.4134 },
    tags: ['Quiet', 'Books', 'Cozy'],
    category: 'cafe',
    address: '2421 Bissonnet St, Houston, TX',
    photos: [
      'https://images.unsplash.com/photo-1524578271613-d550eacf6090?w=800&q=80', // Bookstore interior
      'https://images.unsplash.com/photo-1526243741027-444d633d7365?w=800&q=80', // Reading nook
    ],
  },
  {
    name: 'Station Coffee Co',
    placeId: 'demo-place-station',
    location: { lat: 29.8041, lng: -95.4120 },
    tags: ['Wi-Fi', 'Industrial', 'Spacious'],
    category: 'cafe',
    address: '1809 N Durham Dr, Houston, TX',
    photos: [
      'https://images.unsplash.com/photo-1497935586351-b67a49e012bf?w=800&q=80', // Industrial coffee shop
      'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=800&q=80', // Coffee close up
    ],
  },
];

// Captions that feel authentic for study/work spots
const DEMO_CAPTIONS = [
  'Perfect spot for deep work',
  'Great vibes here today!',
  'Finally found a quiet corner',
  'Best cold brew in Houston',
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
  'Best oat milk latte in town',
  'Found my new favorite spot',
  'Late night coding session',
  'Sunday study vibes',
  'The baristas here are so nice',
  'AC is perfect on hot days',
  'Always come back here',
  '',
  '',
  '', // Some without captions
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
  console.log(`Created ${DEMO_USERS.length} demo users`);
}

async function seedCheckins() {
  console.log('Seeding check-ins...');
  const checkinsToCreate = 45;
  const batch = db.batch();

  // Utility metric options
  const wifiSpeeds = [3, 3, 4, 4, 4, 5, 5] as const; // Mostly good WiFi
  const noiseLevels = ['quiet', 'quiet', 'moderate', 'moderate', 'lively'] as const;
  const busynessLevels = [1, 2, 2, 3, 3, 3, 4, 4, 5] as const;
  const outletOptions = ['plenty', 'plenty', 'some', 'some', 'few', 'none'] as const;

  for (let i = 0; i < checkinsToCreate; i++) {
    const user = randomElement(DEMO_USERS);
    const spot = randomElement(DEMO_SPOTS);
    const caption = randomElement(DEMO_CAPTIONS);
    // Use spot-specific photo
    const photo = randomElement(spot.photos);
    const hoursAgo = Math.random() * 20; // Within last 20 hours
    const createdAt = generateTimestamp(hoursAgo);
    const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);

    // Generate utility metrics (70% chance of having each metric)
    const wifiSpeed = Math.random() > 0.3 ? randomElement([...wifiSpeeds]) : undefined;
    const noiseLevel = Math.random() > 0.3 ? randomElement([...noiseLevels]) : undefined;
    const busyness = Math.random() > 0.3 ? randomElement([...busynessLevels]) : undefined;
    const outletAvailability = Math.random() > 0.3 ? randomElement([...outletOptions]) : undefined;

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
      ...(outletAvailability && { outletAvailability }),
      __demo: true,
    });
  }

  await batch.commit();
  console.log(`Created ${checkinsToCreate} demo check-ins with utility metrics`);
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
  console.log(`Created ${requests.length} demo friend requests`);
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
  console.log('Cleared existing demo data');
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

  console.log('\nFirestore seeded successfully!');
  console.log('Demo users:', DEMO_USERS.map(u => u.handle).join(', '));
  console.log('Houston spots:', DEMO_SPOTS.map(s => s.name).join(', '));
  process.exit(0);
}

main().catch(err => {
  console.error('Error seeding Firestore:', err);
  process.exit(1);
});
