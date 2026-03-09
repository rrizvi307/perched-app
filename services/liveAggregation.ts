/**
 * Live Aggregation Service (Phase B)
 *
 * Weighted blending of inferred intelligence + live check-in data
 *
 * Strategy:
 * - New spots: Inferred data dominates (shows immediately)
 * - Growing spots: Blended data (smooth transition)
 * - Popular spots: Live data dominates (>10 check-ins)
 *
 * Formula: w_live = min(checkinCount / 10, 0.9)
 * Max 90% weight to live data (always consider inference)
 */

import { ensureFirebase } from './firebaseClient';

export interface LiveData {
  noise: 'quiet' | 'moderate' | 'loud' | null;
  busyness: 'empty' | 'some' | 'packed' | null;
  checkinCount: number;
  lastCheckinAt: number | null;
}

export interface DisplayData {
  noise: 'quiet' | 'moderate' | 'loud' | null;
  noiseSource: 'live' | 'inferred' | 'blended';
  noiseLabel: string;
  busyness: 'empty' | 'some' | 'packed' | null;
  busynessSource: 'live';
  busynessLabel: string;
}

interface InferredData {
  inferredNoise: 'quiet' | 'moderate' | 'loud' | null;
  inferredNoiseConfidence: number;
}

/**
 * Calculate display data from inferred + live data
 *
 * @param inferred - NLP inference results
 * @param live - Live check-in aggregation
 * @returns Blended display data with provenance labels
 */
export function calculateDisplayData(
  inferred: InferredData,
  live: LiveData
): DisplayData {
  const { noise, noiseSource, noiseLabel } = calculateDisplayNoise(inferred, live);
  const { busyness, busynessLabel } = calculateDisplayBusyness(live);

  return {
    noise,
    noiseSource,
    noiseLabel,
    busyness,
    busynessSource: 'live',  // Busyness is always live (no inference)
    busynessLabel,
  };
}

/**
 * Calculate display noise with weighted blending
 */
function calculateDisplayNoise(
  inferred: InferredData,
  live: LiveData
): {
  noise: 'quiet' | 'moderate' | 'loud' | null;
  noiseSource: 'live' | 'inferred' | 'blended';
  noiseLabel: string;
} {
  const { inferredNoise, inferredNoiseConfidence } = inferred;
  const { noise: liveNoise, checkinCount } = live;

  // No data at all
  if (!inferredNoise && !liveNoise) {
    return {
      noise: null,
      noiseSource: 'inferred',
      noiseLabel: 'No data yet',
    };
  }

  // Only inferred data (no check-ins yet)
  if (!liveNoise || checkinCount === 0) {
    return {
      noise: inferredNoise,
      noiseSource: 'inferred',
      noiseLabel: `${capitalize(inferredNoise || 'Unknown')} (inferred from reviews)`,
    };
  }

  // Calculate live data weight
  // w_live = min(checkinCount / 10, 0.9)
  const w_live = Math.min(checkinCount / 10, 0.9);

  // High confidence in live data (>50% weight)
  if (w_live > 0.5) {
    return {
      noise: liveNoise,
      noiseSource: 'live',
      noiseLabel: `${capitalize(liveNoise)} (${checkinCount} check-in${checkinCount === 1 ? '' : 's'})`,
    };
  }

  // Low confidence in live data, show blended
  // If live and inferred agree → show with confidence
  // If they disagree → show live but mention usual state
  if (liveNoise === inferredNoise) {
    return {
      noise: liveNoise,
      noiseSource: 'blended',
      noiseLabel: `${capitalize(liveNoise)} (${checkinCount} check-in${checkinCount === 1 ? '' : 's'})`,
    };
  } else {
    return {
      noise: liveNoise,
      noiseSource: 'blended',
      noiseLabel: `${capitalize(liveNoise)} (${checkinCount} check-in${checkinCount === 1 ? '' : 's'}, usually ${inferredNoise || 'varies'})`,
    };
  }
}

/**
 * Calculate display busyness (always live, no inference)
 */
function calculateDisplayBusyness(
  live: LiveData
): {
  busyness: 'empty' | 'some' | 'packed' | null;
  busynessLabel: string;
} {
  const { busyness, checkinCount } = live;

  if (!busyness || checkinCount === 0) {
    return {
      busyness: null,
      busynessLabel: 'No recent data',
    };
  }

  const label = busyness === 'empty' ? 'Empty' :
                busyness === 'some' ? 'Some people' :
                'Packed';

  return {
    busyness,
    busynessLabel: `${label} (live)`,
  };
}

/**
 * Aggregate live check-in data for a spot
 *
 * @param spotId - Spot ID
 * @param recentWindow - Time window for "recent" check-ins (default: 7 days)
 * @returns Aggregated live data
 */
export async function aggregateLiveData(
  spotId: string,
  recentWindow: number = 7 * 24 * 60 * 60 * 1000  // 7 days
): Promise<LiveData> {
  try {
    const fb = ensureFirebase();
    if (!fb) throw new Error('Firebase not initialized');

    const db = fb.firestore();
    const cutoff = Date.now() - recentWindow;

    // Query recent check-ins
    const snapshot = await db.collection('checkins')
      .where('spotPlaceId', '==', spotId)
      .where('timestamp', '>', cutoff)
      .orderBy('timestamp', 'desc')
      .limit(20)  // Last 20 check-ins
      .get();

    if (snapshot.empty) {
      return {
        noise: null,
        busyness: null,
        checkinCount: 0,
        lastCheckinAt: null,
      };
    }

    const checkins = snapshot.docs.map((doc: any) => doc.data());

    // Aggregate noise (most recent weighted higher)
    const noise = aggregateNoise(checkins);

    // Aggregate busyness (most recent only)
    const busyness = checkins[0]?.busyness || null;

    // Total count (all-time, not just recent)
    const totalSnapshot = await db.collection('checkins')
      .where('spotPlaceId', '==', spotId)
      .get();

    return {
      noise,
      busyness,
      checkinCount: totalSnapshot.size,
      lastCheckinAt: checkins[0]?.timestamp || null,
    };
  } catch (error) {
    console.error('Failed to aggregate live data:', error);
    return {
      noise: null,
      busyness: null,
      checkinCount: 0,
      lastCheckinAt: null,
    };
  }
}

/**
 * Aggregate noise level from recent check-ins
 * Weighted by recency: newer check-ins have higher weight
 */
function aggregateNoise(
  checkins: Array<{ noise?: string; timestamp: number }>
): 'quiet' | 'moderate' | 'loud' | null {
  if (checkins.length === 0) return null;

  const counts: Record<string, number> = {
    quiet: 0,
    moderate: 0,
    loud: 0,
  };

  const now = Date.now();

  // Weight by recency: exponential decay (half-life = 3.5 days)
  checkins.forEach(checkin => {
    if (!checkin.noise) return;

    const age = now - checkin.timestamp;
    const weight = Math.exp(-age / (3.5 * 24 * 60 * 60 * 1000));

    counts[checkin.noise] = (counts[checkin.noise] || 0) + weight;
  });

  // Return most common (highest weighted count)
  const max = Math.max(counts.quiet, counts.moderate, counts.loud);
  if (max === 0) return null;

  if (counts.quiet === max) return 'quiet';
  if (counts.moderate === max) return 'moderate';
  return 'loud';
}

/**
 * Capitalize first letter
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Update display data in Firestore after check-in
 * Triggered by Cloud Function or client-side
 */
export async function updateDisplayData(
  spotId: string,
  inferredData: InferredData,
  liveData: LiveData
): Promise<void> {
  try {
    const displayData = calculateDisplayData(inferredData, liveData);

    const fb = ensureFirebase();
    if (!fb) throw new Error('Firebase not initialized');

    const db = fb.firestore();
    await db.collection('spots').doc(spotId).set({
      live: liveData,
      display: displayData,
      updatedAt: fb.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log(`Updated display data for spot ${spotId}`);
  } catch (error) {
    console.error('Failed to update display data:', error);
    throw error;
  }
}
