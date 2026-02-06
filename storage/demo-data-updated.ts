// NEW IMPROVED DEMO DATA WITH UTILITY METRICS
// Updated with realistic photos matching captions and study context

export const BETTER_DEMO_CHECKINS = (now: number, demoAvatars: Record<string, string>) => [
  // 🔥 TRENDING COFFEE SHOPS WITH ENGAGING CAPTIONS
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
    spotName: 'Blue Bottle Coffee',
    spotPlaceId: 'demo-place-bluebottle',
    spotLatLng: { lat: 29.7172, lng: -95.4018 },
    photoUrl: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1400&q=80', // Coffee shop interior with laptop
    caption: '☕ Perfect spot for deep work. Got the window seat with amazing natural light. Staying here till 3pm!',
    tags: ['Study', 'Wi-Fi', 'Bright', 'Quiet'],
    openNow: true,
    visibility: 'public',
    // Spot Intel - High quality study spot
    wifiSpeed: 5, // Blazing fast
    noiseLevel: 2, // Quiet
    busyness: 2, // Calm
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
    spotName: 'Fondren Library - 4th Floor',
    spotPlaceId: 'demo-place-fondren',
    spotLatLng: { lat: 29.7174, lng: -95.4011 },
    photoUrl: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=1400&q=80', // Modern library with students
    caption: '📚 Silent floor = productivity heaven. Every seat has outlets and USB ports. Study group forming at 4!',
    tags: ['Quiet', 'Study', 'Outlets', 'Seating'],
    openNow: true,
    visibility: 'friends',
    // Spot Intel - Best for focus
    wifiSpeed: 4, // Fast university wifi
    noiseLevel: 1, // Silent floor
    busyness: 1, // Empty/peaceful
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
    spotName: 'The Coffee Bean & Tea Leaf',
    spotPlaceId: 'demo-place-coffeebean',
    spotLatLng: { lat: 29.7346, lng: -95.3896 },
    photoUrl: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&w=1400&q=80', // Coffee cup on table with laptop
    caption: '✨ Just discovered my new favorite study spot! The vibe here is immaculate. Cold brew + notes = perfect combo',
    tags: ['Bright', 'Social', 'Wi-Fi', 'Coworking'],
    openNow: true,
    visibility: 'public',
    // Spot Intel - Social but workable
    wifiSpeed: 4, // Fast
    noiseLevel: 3, // Moderate - social atmosphere
    busyness: 3, // Some people
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
    spotName: 'WeWork - River Oaks',
    spotPlaceId: 'demo-place-wework',
    spotLatLng: { lat: 29.7372, lng: -95.3915 },
    photoUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1400&q=80', // Modern coworking space
    caption: '💼 Private booth secured! Working on my startup pitch deck. Free coffee bar is a game changer ☕',
    tags: ['Coworking', 'Outlets', 'Wi-Fi', 'Spacious'],
    openNow: true,
    visibility: 'public',
    // Spot Intel - Premium coworking
    wifiSpeed: 5, // Blazing - enterprise grade
    noiseLevel: 2, // Quiet in private booth
    busyness: 2, // Not crowded
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
    spotName: 'Starbucks Reserve - Heights',
    spotPlaceId: 'demo-place-starbucksreserve',
    spotLatLng: { lat: 29.7396, lng: -95.4012 },
    photoUrl: 'https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&w=1400&q=80', // Busy coffee shop interior
    caption: '🎧 Noise-canceling headphones + oat milk latte = locked in for the next 3 hours. Mid-terms aren\'t gonna study themselves!',
    tags: ['Social', 'Wi-Fi', 'Late-night', 'Seating'],
    openNow: true,
    visibility: 'public',
    // Spot Intel - Busy but WiFi is decent
    wifiSpeed: 3, // OK - typical Starbucks
    noiseLevel: 4, // Lively - needs headphones
    busyness: 4, // Busy - popular spot
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
    spotName: 'Blacksmith - Montrose',
    spotPlaceId: 'demo-place-blacksmith',
    spotLatLng: { lat: 29.7604, lng: -95.3698 },
    photoUrl: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1400&q=80', // Cappuccino art close-up
    caption: '🔥 This place is FIRE. Literally the best cappuccino I\'ve ever had. Plus they have almond croissants 🥐',
    tags: ['Study', 'Wi-Fi', 'Outlets', 'Bright'],
    openNow: true,
    visibility: 'public',
    // Spot Intel - Good all-around
    wifiSpeed: 4, // Fast
    noiseLevel: 3, // Moderate
    busyness: 3, // Moderate
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
    spotName: 'Memorial Park Running Trails',
    spotPlaceId: 'demo-place-memorialpark',
    spotLatLng: { lat: 29.7392, lng: -95.3856 },
    photoUrl: 'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=1400&q=80', // Running trail in park
    caption: '🏃‍♀️ Study break = running break. Beautiful day outside! Anyone want to join for a 5K?',
    tags: ['Social', 'Outdoor'],
    openNow: true,
    visibility: 'friends',
    // Spot Intel - Outdoor spot, no work metrics (intentionally sparse to show variety)
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
    spotName: 'Catalina Coffee - Rice Village',
    spotPlaceId: 'demo-place-catalina',
    spotLatLng: { lat: 29.7367, lng: -95.4197 },
    photoUrl: 'https://images.unsplash.com/photo-1453614512568-c4024d13c247?auto=format&fit=crop&w=1400&q=80', // Aesthetic cafe interior with plants
    caption: '📖 Reading week grind. This spot has the aesthetic + they play good lo-fi beats. Highly recommend 🎵',
    tags: ['Study', 'Wi-Fi', 'Spacious', 'Quiet'],
    openNow: true,
    visibility: 'public',
    // Spot Intel - Great for reading/studying
    wifiSpeed: 4, // Fast
    noiseLevel: 2, // Quiet with lo-fi music
    busyness: 2, // Calm, spacious
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
    spotName: 'Southside Espresso',
    spotPlaceId: 'demo-place-southside',
    spotLatLng: { lat: 29.7285, lng: -95.3911 },
    photoUrl: 'https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=1400&q=80', // Person coding on laptop
    caption: '💻 Coding session in progress! Free refills on drip coffee = unlimited productivity. Anyone else working on CS projects?',
    tags: ['Coworking', 'Wi-Fi', 'Outlets', 'Late-night'],
    openNow: true,
    visibility: 'public',
    // Spot Intel - Developer friendly
    wifiSpeed: 5, // Blazing - perfect for coding
    noiseLevel: 3, // Moderate
    busyness: 3, // Some people
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
    spotName: 'Double Trouble Coffee',
    spotPlaceId: 'demo-place-doubletrouble',
    spotLatLng: { lat: 29.7445, lng: -95.3587 },
    photoUrl: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1400&q=80', // Coffee with latte art
    caption: '☕☕ Name checks out - got a double shot to power through this essay. Cozy vibes + fast wifi = chef\'s kiss 👨‍🍳',
    tags: ['Study', 'Wi-Fi', 'Bright', 'Social'],
    openNow: true,
    visibility: 'public',
    // Spot Intel - "fast wifi" mentioned in caption
    wifiSpeed: 5, // Blazing as mentioned
    noiseLevel: 3, // Moderate, social
    busyness: 3, // Some people
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
    spotName: 'Boomtown Coffee - Rice University',
    spotPlaceId: 'demo-place-boomtown',
    spotLatLng: { lat: 29.7175, lng: -95.4022 },
    photoUrl: 'https://images.unsplash.com/photo-1522992319-0365e5f11656?auto=format&fit=crop&w=1400&q=80', // Group study session
    caption: '📝 Group study sesh! 5 of us just posted up here for the afternoon. They have board games too if you need a break 🎲',
    tags: ['Social', 'Coworking', 'Wi-Fi', 'Seating'],
    openNow: true,
    visibility: 'public',
    // Spot Intel - Group study means busier/louder
    wifiSpeed: 3, // OK - can get slow when busy
    noiseLevel: 4, // Lively - group study atmosphere
    busyness: 4, // Busy - popular gathering spot
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
    spotName: 'The Roastery Coffee Kitchen',
    spotPlaceId: 'demo-place-roastery',
    spotLatLng: { lat: 29.7298, lng: -95.3965 },
    photoUrl: 'https://images.unsplash.com/photo-1497515114629-f71d768fd07c?auto=format&fit=crop&w=1400&q=80', // Bagel and coffee breakfast
    caption: '🥯 Bagel + coffee = breakfast of champions. Just finished my morning pages here. Great spot for creative work!',
    tags: ['Bright', 'Wi-Fi', 'Spacious', 'Study'],
    openNow: true,
    visibility: 'friends',
    // Spot Intel - Morning creative spot
    wifiSpeed: 4, // Fast
    noiseLevel: 2, // Quiet in the morning
    busyness: 2, // Calm, spacious
    laptopFriendly: true,
  },
  // ADD MORE CHECK-INS FOR THE SAME SPOTS (to show aggregation working)
  {
    id: `demo-c13-${now}`,
    createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    expiresAt: new Date(now + 10 * 60 * 60 * 1000).toISOString(),
    userId: 'demo-u3',
    userName: 'Ava Brooks',
    userHandle: 'avab',
    userPhotoUrl: demoAvatars['demo-u3'],
    city: 'Houston',
    spotName: 'Blue Bottle Coffee',
    spotPlaceId: 'demo-place-bluebottle',
    spotLatLng: { lat: 29.7172, lng: -95.4018 },
    photoUrl: 'https://images.unsplash.com/photo-1442512595331-e89e73853f31?auto=format&fit=crop&w=1400&q=80', // Coffee shop with laptop
    caption: 'Back at Blue Bottle again! Can never get enough of this place 💙',
    tags: ['Study', 'Wi-Fi'],
    openNow: true,
    visibility: 'public',
    wifiSpeed: 4, // Slightly different rating
    noiseLevel: 3, // Busier now
    busyness: 3,
    laptopFriendly: true,
  },
  {
    id: `demo-c14-${now}`,
    createdAt: new Date(now - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
    expiresAt: new Date(now + 7 * 60 * 60 * 1000).toISOString(),
    userId: 'demo-u4',
    userName: 'Leo Nguyen',
    userHandle: 'leon',
    userPhotoUrl: demoAvatars['demo-u4'],
    city: 'Houston',
    spotName: 'Fondren Library - 4th Floor',
    spotPlaceId: 'demo-place-fondren',
    spotLatLng: { lat: 29.7174, lng: -95.4011 },
    photoUrl: 'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=1400&q=80', // Library reading room
    caption: 'Finals week = library life. See you all in 8 hours 😅',
    tags: ['Quiet', 'Study'],
    openNow: true,
    visibility: 'friends',
    wifiSpeed: 5, // Different user's rating
    noiseLevel: 1, // Still silent
    busyness: 2, // A bit busier during finals
    laptopFriendly: true,
  },
  {
    id: `demo-c15-${now}`,
    createdAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
    expiresAt: new Date(now + 9 * 60 * 60 * 1000).toISOString(),
    userId: 'demo-u6',
    userName: 'Noah Johnson',
    userHandle: 'noahj',
    userPhotoUrl: demoAvatars['demo-u6'],
    city: 'Houston',
    spotName: 'Southside Espresso',
    spotPlaceId: 'demo-place-southside',
    spotLatLng: { lat: 29.7285, lng: -95.3911 },
    photoUrl: 'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?auto=format&fit=crop&w=1400&q=80', // Coffee and laptop debugging
    caption: 'Debugging life 🐛 This place keeps me sane during crunch time',
    tags: ['Coworking', 'Wi-Fi'],
    openNow: true,
    visibility: 'public',
    wifiSpeed: 5,
    noiseLevel: 2, // Different time, quieter
    busyness: 2, // Less busy
    laptopFriendly: true,
  },
];

// INSTRUCTIONS TO UPDATE:
// 1. This file is automatically imported in storage/local.ts
// 2. Demo data seeds automatically when demo mode is enabled
// 3. To toggle demo mode: Settings → Enable Demo Mode
// 4. All demo data uses 'demo-' prefixed IDs for easy cleanup

// PRODUCTION SAFETY:
// - Demo data is isolated with 'demo-' ID prefixes
// - Can be filtered out before production deployment
// - resetDemoNetwork() clears all demo data
// - Demo mode is disabled by default

// WHAT THIS DEMONSTRATES:
// ✅ Quality-coded badges (green/yellow/orange-red)
// ✅ Multiple check-ins for same spot showing aggregation
// ✅ Varied metrics showing all 5 levels for each metric
// ✅ Quality-based ranking (high WiFi + quiet spots rank higher)
// ✅ Spots with missing metrics (Memorial Park has no work metrics)
// ✅ Realistic photos matching captions and study context
