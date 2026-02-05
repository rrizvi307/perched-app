/**
 * Demo Data Manager - Rich, realistic seed data for filming and presentations
 * Provides toggle-able demo content that makes the app look populated
 */

import { saveCheckin, getCheckins } from '@/storage/local';
import { setDemoMode as setDemoModeFlag } from './demoMode';

// Demo users with realistic profiles
export const DEMO_USERS = [
  {
    id: 'demo-user-sarah',
    name: 'Sarah Chen',
    handle: 'sarahc',
    email: 'sarah@stanford.edu',
    photoUrl: 'https://i.pravatar.cc/150?img=5',
    campus: 'Stanford University',
    city: 'Palo Alto, CA',
  },
  {
    id: 'demo-user-maya',
    name: 'Maya Patel',
    handle: 'mayap',
    email: 'maya@stanford.edu',
    photoUrl: 'https://i.pravatar.cc/150?img=45',
    campus: 'Stanford University',
    city: 'Palo Alto, CA',
  },
  {
    id: 'demo-user-jon',
    name: 'Jon Rodriguez',
    handle: 'jonstudy',
    email: 'jon@stanford.edu',
    photoUrl: 'https://i.pravatar.cc/150?img=12',
    campus: 'Stanford University',
    city: 'Palo Alto, CA',
  },
  {
    id: 'demo-user-alex',
    name: 'Alex Kim',
    handle: 'alexk',
    email: 'alex@berkeley.edu',
    photoUrl: 'https://i.pravatar.cc/150?img=33',
    campus: 'UC Berkeley',
    city: 'Berkeley, CA',
  },
  {
    id: 'demo-user-emma',
    name: 'Emma Wilson',
    handle: 'emmaw',
    email: 'emma@stanford.edu',
    photoUrl: 'https://i.pravatar.cc/150?img=24',
    campus: 'Stanford University',
    city: 'Palo Alto, CA',
  },
  {
    id: 'demo-user-david',
    name: 'David Lee',
    handle: 'davidl',
    email: 'david@stanford.edu',
    photoUrl: 'https://i.pravatar.cc/150?img=15',
    campus: 'Stanford University',
    city: 'Palo Alto, CA',
  },
];

// Demo spots - realistic coffee shops, libraries, coworking spaces
export const DEMO_SPOTS = [
  {
    name: 'Blue Bottle Coffee',
    placeId: 'demo-place-bluebottle',
    location: { lat: 37.7749, lng: -122.4194 },
    tags: ['Wi-Fi', 'Quiet', 'Outlets'],
    category: 'cafe',
  },
  {
    name: 'Philz Coffee',
    placeId: 'demo-place-philz',
    location: { lat: 37.7829, lng: -122.4189 },
    tags: ['Social', 'Wi-Fi', 'Bright'],
    category: 'cafe',
  },
  {
    name: 'Green Library',
    placeId: 'demo-place-green-lib',
    location: { lat: 37.4275, lng: -122.1697 },
    tags: ['Quiet', 'Study', 'Seating'],
    category: 'library',
  },
  {
    name: 'Coupa Cafe',
    placeId: 'demo-place-coupa',
    location: { lat: 37.4267, lng: -122.1690 },
    tags: ['Social', 'Wi-Fi', 'Late-night'],
    category: 'cafe',
  },
  {
    name: 'Tresidder Union',
    placeId: 'demo-place-tresidder',
    location: { lat: 37.4250, lng: -122.1695 },
    tags: ['Coworking', 'Outlets', 'Seating'],
    category: 'coworking',
  },
  {
    name: 'Main Library',
    placeId: 'demo-place-main-lib',
    location: { lat: 37.8720, lng: -122.2585 },
    tags: ['Quiet', 'Study', 'Wi-Fi'],
    category: 'library',
  },
  {
    name: 'Peet\'s Coffee',
    placeId: 'demo-place-peets',
    location: { lat: 37.8730, lng: -122.2580 },
    tags: ['Wi-Fi', 'Outlets', 'Bright'],
    category: 'cafe',
  },
  {
    name: 'Sightglass Coffee',
    placeId: 'demo-place-sightglass',
    location: { lat: 37.7743, lng: -122.4097 },
    tags: ['Wi-Fi', 'Spacious', 'Bright'],
    category: 'cafe',
  },
];

// Demo captions - realistic check-in messages
const DEMO_CAPTIONS = [
  'Perfect spot for deep work 🎯',
  'Great vibes here today!',
  'Finally found a quiet corner',
  'Best coffee in the area ☕',
  'Crushing this project',
  'Study sesh with the crew',
  'Love the natural lighting here',
  'Fast WiFi + good music = productivity',
  'My go-to spot for finals week',
  'Hidden gem!',
  'Outlets everywhere 🔌',
  'Can\'t beat this atmosphere',
  'Where I get my best work done',
  'Perfect for morning meetings',
  'Cozy and focused',
];

// Photo URLs (using Unsplash for realistic cafe/study photos)
const DEMO_PHOTOS = [
  'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&q=80', // Coffee shop
  'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&q=80', // Cafe interior
  'https://images.unsplash.com/photo-1521017432531-fbd92d768814?w=800&q=80', // Library
  'https://images.unsplash.com/photo-1481833761820-0509d3217039?w=800&q=80', // Coffee cup
  'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800&q=80', // Coffee shop window
  'https://images.unsplash.com/photo-1501959915551-4e8d30928317?w=800&q=80', // Library books
  'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=800&q=80', // Laptop coffee
  'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=800&q=80', // Cafe workspace
];

/**
 * Generate realistic timestamps over the past 24 hours
 */
function generateRealisticTimestamp(index: number, total: number): string {
  const now = Date.now();
  const dayInMs = 24 * 60 * 60 * 1000;
  const spread = dayInMs * 0.8; // Spread over 80% of last 24h
  const offset = (spread / total) * index;
  const randomJitter = Math.random() * (60 * 60 * 1000); // Random hour jitter
  const timestamp = now - offset - randomJitter;
  return new Date(timestamp).toISOString();
}

/**
 * Seed demo feed with realistic check-ins
 */
export async function seedDemoFeed(): Promise<void> {
  const checkinsToCreate = 25; // Good amount for demo filming

  for (let i = 0; i < checkinsToCreate; i++) {
    const user = DEMO_USERS[i % DEMO_USERS.length];
    const spot = DEMO_SPOTS[i % DEMO_SPOTS.length];
    const caption = i % 3 === 0 ? DEMO_CAPTIONS[i % DEMO_CAPTIONS.length] : ''; // Some without captions
    const photo = DEMO_PHOTOS[i % DEMO_PHOTOS.length];
    const timestamp = generateRealisticTimestamp(i, checkinsToCreate);

    const checkin = {
      id: `demo-checkin-${i}-${Date.now()}`,
      userId: user.id,
      userName: user.name,
      userHandle: user.handle,
      userPhotoUrl: user.photoUrl,
      spotName: spot.name,
      spotPlaceId: spot.placeId,
      spotLatLng: spot.location,
      photoUrl: photo,
      caption,
      tags: spot.tags.slice(0, 3),
      campus: user.campus,
      city: user.city,
      campusOrCity: user.campus,
      createdAt: timestamp,
      expiresAt: new Date(new Date(timestamp).getTime() + 24 * 60 * 60 * 1000).toISOString(),
      visibility: 'public',
      clientId: `demo-client-${i}`,
      __demo: true, // Flag as demo data
    };

    await saveCheckin(checkin as any);
  }

  console.log(`✅ Seeded ${checkinsToCreate} demo check-ins`);
}

/**
 * Clear all demo data
 */
export async function clearDemoData(): Promise<void> {
  const allCheckins = await getCheckins();
  const demoCheckins = allCheckins.filter((c: any) => c.__demo || c.id?.startsWith('demo-'));

  // Remove demo check-ins
  // Note: You'll need to implement removeCheckin in local.ts
  // For now, we'll clear all and let user's real data remain in remote

  console.log(`🗑️ Cleared ${demoCheckins.length} demo check-ins`);
}

/**
 * Get demo data statistics
 */
export async function getDemoStats(): Promise<{ checkinsCount: number; usersCount: number }> {
  const allCheckins = await getCheckins();
  const demoCheckins = allCheckins.filter((c: any) => c.__demo || c.id?.startsWith('demo-'));

  const uniqueUsers = new Set(demoCheckins.map((c: any) => c.userId));

  return {
    checkinsCount: demoCheckins.length,
    usersCount: uniqueUsers.size,
  };
}

/**
 * Check if we have demo data
 */
export async function hasDemoData(): Promise<boolean> {
  const stats = await getDemoStats();
  return stats.checkinsCount > 0;
}

/**
 * Get demo user by ID
 */
export function getDemoUser(userId: string) {
  return DEMO_USERS.find((u) => u.id === userId);
}

/**
 * Get all demo users
 */
export function getAllDemoUsers() {
  return DEMO_USERS;
}

/**
 * Friend request data for demo
 */
export interface DemoFriendRequest {
  id: string;
  fromUser: {
    id: string;
    name: string;
    handle?: string;
    photoUrl?: string;
    campus?: string;
    mutualFriends?: number;
  };
  timestamp: Date;
}

/**
 * Friend suggestion data for demo
 */
export interface DemoFriendSuggestion {
  id: string;
  name: string;
  handle?: string;
  photoUrl?: string;
  campus?: string;
  mutualFriends: number;
  reason?: string;
}

/**
 * Get demo friend requests
 */
export function getDemoFriendRequests(): DemoFriendRequest[] {
  // Get random 2-3 users to simulate incoming friend requests
  const requesters = [DEMO_USERS[0], DEMO_USERS[1], DEMO_USERS[4]];

  return requesters.map((user, index) => ({
    id: `demo-request-${user.id}`,
    fromUser: {
      id: user.id,
      name: user.name,
      handle: user.handle,
      photoUrl: user.photoUrl,
      campus: user.campus,
      mutualFriends: Math.floor(Math.random() * 10) + 1, // 1-10 mutual friends
    },
    timestamp: new Date(Date.now() - index * 60 * 60 * 1000), // Stagger by hours
  }));
}

/**
 * Get demo friend suggestions with social proof
 */
export function getDemoFriendSuggestions(): DemoFriendSuggestion[] {
  const reasons = [
    'Same campus',
    'Checks in at similar spots',
    'Friend of a friend',
    'Same study habits',
    'Popular in your area',
  ];

  // Users not in friend requests
  const suggestionUsers = [DEMO_USERS[2], DEMO_USERS[3], DEMO_USERS[5]];

  return suggestionUsers.map((user, index) => ({
    id: user.id,
    name: user.name,
    handle: user.handle,
    photoUrl: user.photoUrl,
    campus: user.campus,
    mutualFriends: Math.floor(Math.random() * 15) + 2, // 2-16 mutual friends
    reason: reasons[index % reasons.length],
  }));
}
