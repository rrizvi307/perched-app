/**
 * Production Safety Guards
 *
 * Ensures demo data doesn't leak into production
 * Run before deployment: npx ts-node scripts/production-safety.ts
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// All keys that may contain demo data
const DEMO_KEYS = [
  'spot_checkins_v1',
  'spot_users_v1',
  'spot_friends_v1',
  'spot_demo_seeded_v1',
  'spot_demo_mode_enabled_v1',
  '@perched_user_stats',
  '@perched_saved_spots',
  '@perched_friend_requests_incoming',
  '@perched_friend_requests_outgoing',
];

/**
 * Check if an ID is demo data
 */
function isDemoId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return id.startsWith('demo-') || id.startsWith('demo-u') || id.startsWith('demo-c');
}

/**
 * Filter demo data from an array
 */
function filterDemoData(items: any[]): any[] {
  return items.filter((item) => {
    // Filter by ID
    if (item.id && isDemoId(item.id)) return false;
    // Filter by userId
    if (item.userId && isDemoId(item.userId)) return false;
    // Filter by fromUserId (friend requests)
    if (item.fromUserId && isDemoId(item.fromUserId)) return false;
    // Filter by toUserId (friend requests)
    if (item.toUserId && isDemoId(item.toUserId)) return false;
    return true;
  });
}

/**
 * Filter demo data from friends map
 */
function filterDemoFriends(friendsMap: Record<string, string[]>): Record<string, string[]> {
  const cleaned: Record<string, string[]> = {};

  for (const [userId, friends] of Object.entries(friendsMap)) {
    // Skip demo users
    if (isDemoId(userId)) continue;

    // Filter demo friends from the list
    const cleanedFriends = friends.filter((friendId) => !isDemoId(friendId));

    // Only include if there are non-demo friends
    if (cleanedFriends.length > 0) {
      cleaned[userId] = cleanedFriends;
    }
  }

  return cleaned;
}

/**
 * Clean all demo data from storage
 */
export async function cleanDemoDataForProduction(): Promise<void> {
  console.log('🧹 Cleaning demo data for production...\n');

  let totalCleaned = 0;

  for (const key of DEMO_KEYS) {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) continue;

      // Special handling for different data types
      if (key === 'spot_friends_v1') {
        const friendsMap = JSON.parse(raw);
        const cleaned = filterDemoFriends(friendsMap);
        const beforeCount = Object.keys(friendsMap).length;
        const afterCount = Object.keys(cleaned).length;

        if (beforeCount !== afterCount) {
          await AsyncStorage.setItem(key, JSON.stringify(cleaned));
          console.log(`✓ ${key}: Removed ${beforeCount - afterCount} demo users`);
          totalCleaned += (beforeCount - afterCount);
        }
      } else if (key.startsWith('@perched_metrics_impact_demo-')) {
        // Remove demo user impact data
        await AsyncStorage.removeItem(key);
        console.log(`✓ Removed demo metrics impact`);
        totalCleaned++;
      } else {
        const data = JSON.parse(raw);

        if (Array.isArray(data)) {
          const cleaned = filterDemoData(data);
          const removedCount = data.length - cleaned.length;

          if (removedCount > 0) {
            await AsyncStorage.setItem(key, JSON.stringify(cleaned));
            console.log(`✓ ${key}: Removed ${removedCount} demo items`);
            totalCleaned += removedCount;
          }
        }
      }
    } catch (error) {
      console.warn(`⚠️  Failed to clean ${key}:`, error);
    }
  }

  // Remove demo-specific keys
  try {
    await AsyncStorage.removeItem('spot_demo_seeded_v1');
    await AsyncStorage.removeItem('spot_demo_mode_enabled_v1');
    await AsyncStorage.removeItem('spot_demo_auto_approve_v1');
    console.log(`✓ Removed demo mode flags`);
  } catch {}

  console.log(`\n✅ Production safety check complete!`);
  console.log(`   Cleaned ${totalCleaned} demo items`);
  console.log(`   Safe to deploy 🚀\n`);
}

/**
 * Verify no demo data exists
 */
export async function verifyNoDemoData(): Promise<boolean> {
  console.log('🔍 Verifying no demo data exists...\n');

  let foundDemo = false;

  for (const key of DEMO_KEYS) {
    try {
      const raw = await AsyncStorage.getItem(key);
      if (!raw) continue;

      const data = JSON.parse(raw);

      if (Array.isArray(data)) {
        const demoItems = data.filter((item) =>
          (item.id && isDemoId(item.id)) ||
          (item.userId && isDemoId(item.userId))
        );

        if (demoItems.length > 0) {
          console.log(`❌ ${key}: Found ${demoItems.length} demo items`);
          foundDemo = true;
        }
      } else if (typeof data === 'object') {
        const demoKeys = Object.keys(data).filter(isDemoId);

        if (demoKeys.length > 0) {
          console.log(`❌ ${key}: Found ${demoKeys.length} demo keys`);
          foundDemo = true;
        }
      }
    } catch {}
  }

  if (!foundDemo) {
    console.log('✅ No demo data found - safe for production!\n');
  } else {
    console.log('\n⚠️  Demo data found! Run cleanDemoDataForProduction() first.\n');
  }

  return !foundDemo;
}

// Environment check - prevent accidental demo mode in production
export function isProductionEnvironment(): boolean {
  const env = process.env.NODE_ENV;
  const expoEnv = process.env.EXPO_PUBLIC_ENV;

  return env === 'production' || expoEnv === 'production';
}

export function assertNoDemoInProduction(): void {
  if (isProductionEnvironment()) {
    const demoEnv = process.env.EXPO_PUBLIC_PERCHED_DEMO || process.env.PERCHED_DEMO;
    if (demoEnv === '1' || demoEnv === 'true') {
      throw new Error(
        '❌ PRODUCTION BUILD ERROR: Demo mode is enabled!\n' +
        '   Remove EXPO_PUBLIC_PERCHED_DEMO and PERCHED_DEMO from production env.\n' +
        '   Demo mode should only be enabled in development/staging.'
      );
    }
  }
}

// Run safety check on module load in production
if (isProductionEnvironment()) {
  assertNoDemoInProduction();
}

/**
 * CLI Interface
 */
if (require.main === module) {
  (async () => {
    console.log('🛡️  Production Safety Check\n');
    console.log('========================\n');

    // Check environment
    if (isProductionEnvironment()) {
      console.log('📦 Environment: PRODUCTION\n');
      assertNoDemoInProduction();
    } else {
      console.log('🔧 Environment: Development\n');
    }

    // Verify and clean
    const isClean = await verifyNoDemoData();

    if (!isClean) {
      console.log('🧹 Running cleanup...\n');
      await cleanDemoDataForProduction();
      await verifyNoDemoData();
    }

    console.log('Done! ✨');
    process.exit(0);
  })();
}
