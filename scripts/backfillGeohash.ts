/**
 * Geohash Backfill Script
 *
 * Scans all spots in Firestore and ensures they have:
 * - geoHash (generated from lat/lng)
 * - lat (from location field if missing)
 * - lng (from location field if missing)
 *
 * Usage:
 *   npx ts-node scripts/backfillGeohash.ts [--dry-run] [--limit N]
 *
 * Prerequisites:
 *   - Firebase service account key (perched-service-account.json)
 */

import admin from 'firebase-admin';
import { geohashForLocation } from 'geofire-common';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get current directory in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load service account key
const serviceAccount = JSON.parse(
  readFileSync(join(__dirname, '../perched-service-account.json'), 'utf8')
);

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
});

const db = admin.firestore();

interface BackfillStats {
  total: number;
  processed: number;
  fixed: number;
  skipped: number;
  failed: number;
  startTime: number;
  errors: Array<{ spotId: string; error: string }>;
}

interface SpotDocument {
  id: string;
  name?: string;
  geoHash?: string;
  lat?: number;
  lng?: number;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  example?: {
    location?: {
      lat?: number;
      lng?: number;
    };
  };
}

/**
 * Extract coordinates from various spot document formats
 */
function extractCoordinates(spot: SpotDocument): { lat: number; lng: number } | null {
  // Priority 1: Root-level lat/lng
  if (typeof spot.lat === 'number' && typeof spot.lng === 'number') {
    return { lat: spot.lat, lng: spot.lng };
  }

  // Priority 2: location object (legacy format)
  if (spot.location?.latitude && spot.location?.longitude) {
    return { lat: spot.location.latitude, lng: spot.location.longitude };
  }

  // Priority 3: example.location (seed data format)
  if (spot.example?.location?.lat && spot.example?.location?.lng) {
    return { lat: spot.example.location.lat, lng: spot.example.location.lng };
  }

  return null;
}

/**
 * Validate coordinates are within valid ranges
 */
function isValidCoordinates(lat: number, lng: number): boolean {
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * Process a single spot document
 */
async function processSpot(
  spotId: string,
  spotData: any,
  dryRun: boolean
): Promise<{ fixed: boolean; skipped: boolean; error?: string }> {
  const spot: SpotDocument = { id: spotId, ...spotData };

  // Check if already has geoHash
  if (spot.geoHash && typeof spot.lat === 'number' && typeof spot.lng === 'number') {
    return { fixed: false, skipped: true };
  }

  // Extract coordinates
  const coords = extractCoordinates(spot);
  if (!coords) {
    return {
      fixed: false,
      skipped: true,
      error: 'No coordinates found in any format',
    };
  }

  // Validate coordinates
  if (!isValidCoordinates(coords.lat, coords.lng)) {
    return {
      fixed: false,
      skipped: true,
      error: `Invalid coordinates: lat=${coords.lat}, lng=${coords.lng}`,
    };
  }

  // Generate geohash (precision 7 for ~150m accuracy)
  const geoHash = geohashForLocation([coords.lat, coords.lng], 7);

  if (dryRun) {
    console.log(`  Would update ${spotId}:`);
    console.log(`    geoHash: ${geoHash}`);
    console.log(`    lat: ${coords.lat}`);
    console.log(`    lng: ${coords.lng}`);
    return { fixed: true, skipped: false };
  }

  // Update Firestore
  try {
    await db.collection('spots').doc(spotId).update({
      geoHash,
      lat: coords.lat,
      lng: coords.lng,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { fixed: true, skipped: false };
  } catch (error: any) {
    return {
      fixed: false,
      skipped: false,
      error: error.message || String(error),
    };
  }
}

/**
 * Backfill all spots with missing geohash
 */
async function backfillAllSpots(
  batchSize: number = 50,
  maxSpots?: number,
  dryRun: boolean = false
): Promise<BackfillStats> {
  const stats: BackfillStats = {
    total: 0,
    processed: 0,
    fixed: 0,
    skipped: 0,
    failed: 0,
    startTime: Date.now(),
    errors: [],
  };

  try {
    // Query all spots (or up to maxSpots)
    let query = db.collection('spots').limit(maxSpots || 10000);

    const snapshot = await query.get();
    stats.total = snapshot.size;

    console.log(`\n📊 Found ${stats.total} spots`);

    if (dryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be made\n');
    }

    if (stats.total === 0) {
      console.log('✅ No spots found');
      return stats;
    }

    // Process in batches
    const spots = snapshot.docs;
    for (let i = 0; i < spots.length; i += batchSize) {
      const batch = spots.slice(i, Math.min(i + batchSize, spots.length));

      console.log(
        `\n📦 Processing batch ${Math.floor(i / batchSize) + 1} (spots ${i + 1}-${Math.min(
          i + batchSize,
          spots.length
        )})`
      );

      // Process batch in parallel
      const results = await Promise.allSettled(
        batch.map((doc) => processSpot(doc.id, doc.data(), dryRun))
      );

      results.forEach((result, idx) => {
        stats.processed++;

        if (result.status === 'fulfilled') {
          const { fixed, skipped, error } = result.value;

          if (error) {
            console.log(`  ⚠️  ${batch[idx].id}: ${error}`);
          } else if (fixed) {
            stats.fixed++;
            console.log(`  ✅ ${batch[idx].id}: Fixed`);
          } else if (skipped) {
            stats.skipped++;
            console.log(`  ⏭️  ${batch[idx].id}: Skipped (already has geoHash)`);
          }
        } else {
          stats.failed++;
          const error = result.reason?.message || String(result.reason);
          stats.errors.push({ spotId: batch[idx].id, error });
          console.log(`  ❌ ${batch[idx].id}: ${error}`);
        }
      });

      // Progress update
      const progress = ((stats.processed / stats.total) * 100).toFixed(1);
      console.log(
        `\n📈 Progress: ${stats.processed}/${stats.total} (${progress}%) | ✅ ${stats.fixed} | ⏭️  ${stats.skipped} | ❌ ${stats.failed}`
      );

      // Rate limiting: pause between batches
      if (i + batchSize < spots.length) {
        console.log('⏸️  Pausing 1s between batches...');
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    // Final summary
    const elapsedMs = Date.now() - stats.startTime;
    const elapsedMin = (elapsedMs / 60000).toFixed(1);

    console.log('\n' + '='.repeat(60));
    console.log('📊 FINAL SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total spots:      ${stats.total}`);
    console.log(`Processed:        ${stats.processed}`);
    console.log(`✅ Fixed:         ${stats.fixed}`);
    console.log(`⏭️  Skipped:       ${stats.skipped}`);
    console.log(`❌ Failed:        ${stats.failed}`);
    console.log(`⏱️  Time elapsed:  ${elapsedMin} minutes`);
    console.log('='.repeat(60) + '\n');

    if (stats.errors.length > 0) {
      console.log('❌ ERRORS:\n');
      stats.errors.forEach(({ spotId, error }) => {
        console.log(`  ${spotId}: ${error}`);
      });
      console.log('');
    }

    return stats;
  } catch (error) {
    console.error('Fatal error during backfill:', error);
    throw error;
  }
}

/**
 * Main entry point
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const maxSpots = args.includes('--limit')
    ? parseInt(args[args.indexOf('--limit') + 1])
    : undefined;

  console.log('\n🚀 Perched Geohash Backfill Script\n');

  if (dryRun) {
    console.log('🔍 Running in DRY RUN mode (no changes will be saved)\n');
  }

  if (maxSpots) {
    console.log(`🔢 Processing maximum ${maxSpots} spots\n`);
  }

  const stats = await backfillAllSpots(50, maxSpots, dryRun);

  if (stats.failed > 0) {
    process.exit(1);
  }

  process.exit(0);
}

// Run if called directly (ES module check)
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
