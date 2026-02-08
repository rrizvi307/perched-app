// REALISTIC DEMO DATA - Real Houston spots with authentic photos
// All coordinates are in Houston, TX area
// Photos are realistic user-generated content style

export const BETTER_DEMO_CHECKINS = (now: number, demoAvatars: Record<string, string>) => [
  // Real Houston coffee shops and study spots
  {
    id: `demo-c1-${now}`,
    createdAt: new Date(now - 4 * 60 * 1000).toISOString(),
    expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
    userId: 'demo-u1',
    userName: 'Maya Patel',
    userHandle: 'mayap',
    userPhotoUrl: demoAvatars['demo-u1'],
    campus: 'Rice University',
    city: 'Houston',
    spotName: 'Catalina Coffee',
    spotPlaceId: 'demo-place-catalina',
    spotLatLng: { lat: 29.7367, lng: -95.4197 }, // Rice Village, Houston
    photoUrl: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1400&q=80', // Coffee shop with laptop
    caption: '☕ Perfect spot for deep work. Got the window seat with amazing natural light. Staying here till 3pm!',
    tags: ['Study', 'Wi-Fi', 'Bright', 'Quiet'],
    openNow: true,
    visibility: 'public',
    wifiSpeed: 5,
    noiseLevel: 2,
    busyness: 2,
    laptopFriendly: true,
  },
  {
    id: `demo-c2-${now}`,
    createdAt: new Date(now - 12 * 60 * 1000).toISOString(),
    expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
    userId: 'demo-u2',
    userName: 'Jon Lee',
    userHandle: 'jonstudy',
    userPhotoUrl: demoAvatars['demo-u2'],
    campus: 'University of Houston',
    city: 'Houston',
    spotName: 'Fondren Library',
    spotPlaceId: 'demo-place-fondren',
    spotLatLng: { lat: 29.7174, lng: -95.4011 }, // Rice University, Houston
    photoUrl: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=1400&q=80', // Library interior
    caption: '📚 Silent floor = productivity heaven. Every seat has outlets and USB ports. Study group forming at 4!',
    tags: ['Quiet', 'Study', 'Outlets', 'Seating'],
    openNow: true,
    visibility: 'friends',
    wifiSpeed: 4,
    noiseLevel: 1,
    busyness: 1,
    laptopFriendly: true,
  },
  {
    id: `demo-c3-${now}`,
    createdAt: new Date(now - 22 * 60 * 1000).toISOString(),
    expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
    userId: 'demo-u3',
    userName: 'Ava Brooks',
    userHandle: 'avab',
    userPhotoUrl: demoAvatars['demo-u3'],
    city: 'Houston',
    spotName: 'Blacksmith',
    spotPlaceId: 'demo-place-blacksmith',
    spotLatLng: { lat: 29.7604, lng: -95.3698 }, // Montrose, Houston
    photoUrl: 'https://images.unsplash.com/photo-1559305616-3bed4d52be3a?auto=format&fit=crop&w=1400&q=80', // Coffee on wooden table
    caption: '✨ Just discovered my new favorite study spot! The vibe here is immaculate. Cold brew + notes = perfect combo',
    tags: ['Bright', 'Social', 'Wi-Fi', 'Coworking'],
    openNow: true,
    visibility: 'public',
    wifiSpeed: 4,
    noiseLevel: 3,
    busyness: 3,
    laptopFriendly: true,
  },
  {
    id: `demo-c4-${now}`,
    createdAt: new Date(now - 31 * 60 * 1000).toISOString(),
    expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
    userId: 'demo-u4',
    userName: 'Leo Nguyen',
    userHandle: 'leon',
    userPhotoUrl: demoAvatars['demo-u4'],
    campus: 'Rice University',
    city: 'Houston',
    spotName: 'WeWork Greenway Plaza',
    spotPlaceId: 'demo-place-wework',
    spotLatLng: { lat: 29.7372, lng: -95.4472 }, // Greenway Plaza, Houston
    photoUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1400&q=80', // Coworking space
    caption: '💼 Private booth secured! Working on my startup pitch deck. Free coffee bar is a game changer ☕',
    tags: ['Coworking', 'Outlets', 'Wi-Fi', 'Spacious'],
    openNow: true,
    visibility: 'public',
    wifiSpeed: 5,
    noiseLevel: 2,
    busyness: 2,
    laptopFriendly: true,
  },
  {
    id: `demo-c5-${now}`,
    createdAt: new Date(now - 44 * 60 * 1000).toISOString(),
    expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
    userId: 'demo-u5',
    userName: 'Sofia Kim',
    userHandle: 'sofiak',
    userPhotoUrl: demoAvatars['demo-u5'],
    city: 'Houston',
    spotName: 'Boomtown Coffee',
    spotPlaceId: 'demo-place-boomtown',
    spotLatLng: { lat: 29.7175, lng: -95.4022 }, // Near Rice, Houston
    photoUrl: 'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=1400&q=80', // Busy coffee shop
    caption: '🎧 Noise-canceling headphones + oat milk latte = locked in for the next 3 hours. Mid-terms aren\'t gonna study themselves!',
    tags: ['Social', 'Wi-Fi', 'Late-night', 'Seating'],
    openNow: true,
    visibility: 'public',
    wifiSpeed: 3,
    noiseLevel: 4,
    busyness: 4,
    laptopFriendly: true,
  },
  {
    id: `demo-c6-${now}`,
    createdAt: new Date(now - 58 * 60 * 1000).toISOString(),
    expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
    userId: 'demo-u6',
    userName: 'Noah Johnson',
    userHandle: 'noahj',
    userPhotoUrl: demoAvatars['demo-u6'],
    city: 'Houston',
    spotName: 'Siphon Coffee',
    spotPlaceId: 'demo-place-siphon',
    spotLatLng: { lat: 29.7285, lng: -95.3911 }, // Heights, Houston
    photoUrl: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1400&q=80', // Latte art
    caption: '🔥 This place is FIRE. Literally the best cappuccino I\'ve ever had. Plus they have almond croissants 🥐',
    tags: ['Study', 'Wi-Fi', 'Outlets', 'Bright'],
    openNow: true,
    visibility: 'public',
    wifiSpeed: 4,
    noiseLevel: 3,
    busyness: 3,
    laptopFriendly: true,
  },
  {
    id: `demo-c7-${now}`,
    createdAt: new Date(now - 73 * 60 * 1000).toISOString(),
    expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
    userId: 'demo-u7',
    userName: 'Priya Shah',
    userHandle: 'priyash',
    userPhotoUrl: demoAvatars['demo-u7'],
    city: 'Houston',
    spotName: 'Memorial Park',
    spotPlaceId: 'demo-place-memorialpark',
    spotLatLng: { lat: 29.7644, lng: -95.4515 }, // Memorial Park, Houston
    photoUrl: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=1400&q=80', // Running path
    caption: '🏃‍♀️ Study break = running break. Beautiful day outside! Anyone want to join for a 5K?',
    tags: ['Social', 'Outdoor'],
    openNow: true,
    visibility: 'friends',
    // No work metrics - outdoor spot
  },
  {
    id: `demo-c8-${now}`,
    createdAt: new Date(now - 88 * 60 * 1000).toISOString(),
    expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
    userId: 'demo-u8',
    userName: 'Ethan Chen',
    userHandle: 'ethanc',
    userPhotoUrl: demoAvatars['demo-u8'],
    city: 'Houston',
    spotName: 'Agora Coffee',
    spotPlaceId: 'demo-place-agora',
    spotLatLng: { lat: 29.7346, lng: -95.3896 }, // Montrose, Houston
    photoUrl: 'https://images.unsplash.com/photo-1497515114629-f71d768fd07c?auto=format&fit=crop&w=1400&q=80', // Coffee and pastry
    caption: '📖 Reading week grind. This spot has the aesthetic + they play good lo-fi beats. Highly recommend 🎵',
    tags: ['Study', 'Wi-Fi', 'Spacious', 'Quiet'],
    openNow: true,
    visibility: 'public',
    wifiSpeed: 4,
    noiseLevel: 2,
    busyness: 2,
    laptopFriendly: true,
  },
  {
    id: `demo-c9-${now}`,
    createdAt: new Date(now - 105 * 60 * 1000).toISOString(),
    expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
    userId: 'demo-u9',
    userName: 'Camila Rivera',
    userHandle: 'cami',
    userPhotoUrl: demoAvatars['demo-u9'],
    city: 'Houston',
    spotName: 'Brasil',
    spotPlaceId: 'demo-place-brasil',
    spotLatLng: { lat: 29.7392, lng: -95.3856 }, // Montrose, Houston
    photoUrl: 'https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=1400&q=80', // Coding on laptop
    caption: '💻 Coding session in progress! Free refills on drip coffee = unlimited productivity. Anyone else working on CS projects?',
    tags: ['Coworking', 'Wi-Fi', 'Outlets', 'Late-night'],
    openNow: true,
    visibility: 'public',
    wifiSpeed: 5,
    noiseLevel: 3,
    busyness: 3,
    laptopFriendly: true,
  },
  {
    id: `demo-c10-${now}`,
    createdAt: new Date(now - 122 * 60 * 1000).toISOString(),
    expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
    userId: 'demo-u10',
    userName: 'Jordan Wells',
    userHandle: 'jordanw',
    userPhotoUrl: demoAvatars['demo-u10'],
    city: 'Houston',
    spotName: 'The Nook',
    spotPlaceId: 'demo-place-nook',
    spotLatLng: { lat: 29.7445, lng: -95.3587 }, // Midtown, Houston
    photoUrl: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1400&q=80', // Coffee cup on table
    caption: '☕☕ Name checks out - cozy little nook. Got a double shot to power through this essay. Fast wifi = chef\'s kiss 👨‍🍳',
    tags: ['Study', 'Wi-Fi', 'Bright', 'Social'],
    openNow: true,
    visibility: 'public',
    wifiSpeed: 5,
    noiseLevel: 3,
    busyness: 3,
    laptopFriendly: true,
  },
  {
    id: `demo-c11-${now}`,
    createdAt: new Date(now - 145 * 60 * 1000).toISOString(),
    expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
    userId: 'demo-u11',
    userName: 'Hannah Park',
    userHandle: 'hannahp',
    userPhotoUrl: demoAvatars['demo-u11'],
    city: 'Houston',
    spotName: 'Greenway Coffee',
    spotPlaceId: 'demo-place-greenway',
    spotLatLng: { lat: 29.7396, lng: -95.4012 }, // Upper Kirby, Houston
    photoUrl: 'https://images.unsplash.com/photo-1522992319-0365e5f11656?auto=format&fit=crop&w=1400&q=80', // Study group
    caption: '📝 Group study sesh! 5 of us just posted up here for the afternoon. They have board games too if you need a break 🎲',
    tags: ['Social', 'Coworking', 'Wi-Fi', 'Seating'],
    openNow: true,
    visibility: 'public',
    wifiSpeed: 3,
    noiseLevel: 4,
    busyness: 4,
    laptopFriendly: true,
  },
  {
    id: `demo-c12-${now}`,
    createdAt: new Date(now - 168 * 60 * 1000).toISOString(),
    expiresAt: new Date(now + 12 * 60 * 60 * 1000).toISOString(),
    userId: 'demo-u12',
    userName: 'Omar Hassan',
    userHandle: 'omarh',
    userPhotoUrl: demoAvatars['demo-u12'],
    city: 'Houston',
    spotName: 'Brass Tacks',
    spotPlaceId: 'demo-place-brasstacks',
    spotLatLng: { lat: 29.7298, lng: -95.3965 }, // Heights, Houston
    photoUrl: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1400&q=80', // Coffee with bagel
    caption: '🥯 Bagel + coffee = breakfast of champions. Just finished my morning pages here. Great spot for creative work!',
    tags: ['Bright', 'Wi-Fi', 'Spacious', 'Study'],
    openNow: true,
    visibility: 'friends',
    wifiSpeed: 4,
    noiseLevel: 2,
    busyness: 2,
    laptopFriendly: true,
  },
  // Multiple check-ins at same spots (for aggregation)
  {
    id: `demo-c13-${now}`,
    createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(now + 10 * 60 * 60 * 1000).toISOString(),
    userId: 'demo-u3',
    userName: 'Ava Brooks',
    userHandle: 'avab',
    userPhotoUrl: demoAvatars['demo-u3'],
    city: 'Houston',
    spotName: 'Catalina Coffee',
    spotPlaceId: 'demo-place-catalina',
    spotLatLng: { lat: 29.7367, lng: -95.4197 },
    photoUrl: 'https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&w=1400&q=80', // Coffee and laptop
    caption: 'Back at Catalina again! Can never get enough of this place 💙',
    tags: ['Study', 'Wi-Fi'],
    openNow: true,
    visibility: 'public',
    wifiSpeed: 4,
    noiseLevel: 3,
    busyness: 3,
    laptopFriendly: true,
  },
  {
    id: `demo-c14-${now}`,
    createdAt: new Date(now - 5 * 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(now + 7 * 60 * 60 * 1000).toISOString(),
    userId: 'demo-u4',
    userName: 'Leo Nguyen',
    userHandle: 'leon',
    userPhotoUrl: demoAvatars['demo-u4'],
    city: 'Houston',
    spotName: 'Fondren Library',
    spotPlaceId: 'demo-place-fondren',
    spotLatLng: { lat: 29.7174, lng: -95.4011 },
    photoUrl: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=1400&q=80', // Library desk
    caption: 'Finals week = library life. See you all in 8 hours 😅',
    tags: ['Quiet', 'Study'],
    openNow: true,
    visibility: 'friends',
    wifiSpeed: 5,
    noiseLevel: 1,
    busyness: 2,
    laptopFriendly: true,
  },
  {
    id: `demo-c15-${now}`,
    createdAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(now + 9 * 60 * 60 * 1000).toISOString(),
    userId: 'demo-u6',
    userName: 'Noah Johnson',
    userHandle: 'noahj',
    userPhotoUrl: demoAvatars['demo-u6'],
    city: 'Houston',
    spotName: 'Brasil',
    spotPlaceId: 'demo-place-brasil',
    spotLatLng: { lat: 29.7392, lng: -95.3856 },
    photoUrl: 'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?auto=format&fit=crop&w=1400&q=80', // Code debugging
    caption: 'Debugging life 🐛 This place keeps me sane during crunch time',
    tags: ['Coworking', 'Wi-Fi'],
    openNow: true,
    visibility: 'public',
    wifiSpeed: 5,
    noiseLevel: 2,
    busyness: 2,
    laptopFriendly: true,
  },
];

// ALL COORDINATES ARE IN HOUSTON, TX
// Real Houston spots:
// - Catalina Coffee (Rice Village)
// - Fondren Library (Rice University)
// - Blacksmith (Montrose)
// - WeWork (Greenway Plaza)
// - Boomtown Coffee (Rice area)
// - Siphon Coffee (Heights)
// - Memorial Park
// - Agora Coffee (Montrose)
// - Brasil (Montrose)
// - The Nook (Midtown)
// - Greenway Coffee (Upper Kirby)
// - Brass Tacks (Heights)

// PRODUCTION SAFETY:
// - Demo data isolated with 'demo-' prefixes
// - resetDemoNetwork() clears all demo data
// - Production safety script filters demo data
// - Demo mode disabled by default
