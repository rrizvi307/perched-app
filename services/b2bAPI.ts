/**
 * B2B API Service
 *
 * Provides API access for business partners (Uber Eats, DoorDash, etc.)
 */

import { ensureFirebase } from './firebaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { track } from './analytics';
import { parseCheckinTimestamp, queryCheckinsBySpot } from './schemaHelpers';

export interface APIKey {
  id: string;
  keyHash: string;
  keyPreview: string;
  keyLast4: string;
  partnerId: string;
  partnerName: string;
  tier: 'free' | 'basic' | 'pro' | 'enterprise';

  // Rate limits (requests per hour)
  rateLimit: number;
  currentUsage: number;
  usageResetAt: number;

  // Permissions
  permissions: {
    spotData: boolean;
    realtimeMetrics: boolean;
    busynessData: boolean;
    userDemographics: boolean;
    historicalData: boolean;
  };

  // Status
  active: boolean;
  createdAt: number;
  expiresAt?: number;
}

export interface GeneratedAPIKey extends APIKey {
  plaintextKey: string;
}

export interface APIUsageLog {
  id: string;
  apiKeyId: string;
  partnerId: string;
  endpoint: string;
  method: string;
  statusCode: number;
  responseTime: number;
  timestamp: number;
}

export interface SpotDataAPI {
  spotId: string;
  name: string;
  location: {
    lat: number;
    lng: number;
    address?: string;
  };
  metrics: {
    avgWifi: number;
    avgNoise: number;
    avgBusyness: number;
    avgOutlets: number;
    ratingCount: number;
  };
  realtimeData?: {
    currentBusyness: number;
    estimatedWaitTime: number;
    lastUpdated: number;
  };
  popularTimes?: Array<{
    hour: number;
    dayOfWeek: number;
    busyness: number;
  }>;
}

const RATE_LIMITS = {
  free: 100,      // 100 requests/hour
  basic: 1000,    // 1k requests/hour
  pro: 10000,     // 10k requests/hour
  enterprise: 100000, // 100k requests/hour
};
const TRUSTED_BACKEND_FLAG = 'PERCHED_TRUSTED_BACKEND';

function isTrustedBackendRuntime(): boolean {
  const envFlag = process.env[TRUSTED_BACKEND_FLAG];
  const globalFlag = (global as any)?.[TRUSTED_BACKEND_FLAG];
  return envFlag === '1' || envFlag === 'true' || globalFlag === true;
}

function getTrustedRuntimeError(operation: string): string {
  return `${operation} must run on a trusted backend runtime`;
}


/**
 * Generate API key for a partner
 */
export async function generateAPIKey(
  partnerId: string,
  partnerName: string,
  tier: APIKey['tier'],
  permissions: APIKey['permissions'],
  expiresInDays?: number
): Promise<{ success: boolean; apiKey?: GeneratedAPIKey; error?: string }> {
  if (!isTrustedBackendRuntime()) {
    return { success: false, error: getTrustedRuntimeError('generateAPIKey') };
  }

  try {
    const fb = ensureFirebase();
    if (!fb) return { success: false, error: 'Firebase not initialized' };

    const db = fb.firestore();

    // Generate secure random key
    const keyString = generateSecureKey();
    const keyHash = await hashApiKey(keyString);
    const keyMetadata = buildApiKeyMetadata(keyString);

    const now = Date.now();
    const apiKey: Omit<APIKey, 'id'> = {
      keyHash,
      ...keyMetadata,
      partnerId,
      partnerName,
      tier,
      rateLimit: RATE_LIMITS[tier],
      currentUsage: 0,
      usageResetAt: now + 60 * 60 * 1000, // Reset in 1 hour
      permissions,
      active: true,
      createdAt: now,
      expiresAt: expiresInDays ? now + expiresInDays * 24 * 60 * 60 * 1000 : undefined,
    };

    const docRef = await db.collection('apiKeys').add(apiKey);

    track('api_key_generated', {
      partner_id: partnerId,
      tier,
    });

    return {
      success: true,
      apiKey: { id: docRef.id, ...apiKey, plaintextKey: keyString },
    };
  } catch (error) {
    console.error('Failed to generate API key:', error);
    return { success: false, error: 'Failed to generate API key' };
  }
}

/**
 * Validate API key and check rate limits
 */
export async function validateAPIKey(
  apiKeyString: string
): Promise<{ valid: boolean; apiKey?: APIKey; error?: string }> {
  if (!isTrustedBackendRuntime()) {
    return { valid: false, error: getTrustedRuntimeError('validateAPIKey') };
  }

  try {
    const fb = ensureFirebase();
    if (!fb) return { valid: false, error: 'Firebase not initialized' };

    const db = fb.firestore();
    const keyHash = await hashApiKey(apiKeyString);

    // Find API key
    const snapshot = await db
      .collection('apiKeys')
      .where('keyHash', '==', keyHash)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return { valid: false, error: 'Invalid API key' };
    }

    const doc = snapshot.docs[0];
    const rawApiKey = doc.data() || {};
    const apiKey = sanitizeAPIKeyDocument(doc.id, rawApiKey) as APIKey;
    void selfHealAPIKeyDocument(db, fb, doc.id, rawApiKey, keyHash, apiKeyString).catch(() => {});

    // Check if active
    if (!apiKey.active) {
      return { valid: false, error: 'API key is inactive' };
    }

    // Check expiration
    const now = Date.now();
    if (apiKey.expiresAt && now > apiKey.expiresAt) {
      return { valid: false, error: 'API key has expired' };
    }

    // Check rate limit
    if (now > apiKey.usageResetAt) {
      // Reset usage counter
      await db.collection('apiKeys').doc(apiKey.id).update({
        currentUsage: 0,
        usageResetAt: now + 60 * 60 * 1000,
      });
      apiKey.currentUsage = 0;
    }

    if (apiKey.currentUsage >= apiKey.rateLimit) {
      return { valid: false, error: 'Rate limit exceeded' };
    }

    // Increment usage
    await db.collection('apiKeys').doc(apiKey.id).update({
      currentUsage: fb.firestore.FieldValue.increment(1),
    });

    return { valid: true, apiKey };
  } catch (error) {
    console.error('Failed to validate API key:', error);
    return { valid: false, error: 'Validation failed' };
  }
}

/**
 * Get spot data for API partners
 */
export async function getSpotDataAPI(
  spotId: string,
  apiKey: APIKey,
  includeRealtime: boolean = false
): Promise<{ success: boolean; data?: SpotDataAPI; error?: string }> {
  if (!isTrustedBackendRuntime()) {
    return { success: false, error: getTrustedRuntimeError('getSpotDataAPI') };
  }

  try {
    // Check permissions
    if (!apiKey.permissions.spotData) {
      return { success: false, error: 'No permission for spot data' };
    }

    const fb = ensureFirebase();
    if (!fb) return { success: false, error: 'Firebase not initialized' };

    const db = fb.firestore();

    // Get spot
    const spotDoc = await db.collection('spots').doc(spotId).get();
    if (!spotDoc.exists) {
      return { success: false, error: 'Spot not found' };
    }

    const spot = spotDoc.data()!;

    // Calculate average metrics
    const checkinsSnapshot = await queryCheckinsBySpot(db, fb, spotId, { limit: 100 });

    let totalWifi = 0, totalNoise = 0, totalBusyness = 0, totalOutlets = 0;
    let wifiCount = 0, noiseCount = 0, busynessCount = 0, outletsCount = 0;

    checkinsSnapshot.forEach((doc: any) => {
      const data = doc.data();
      if (data.metrics) {
        if (data.metrics.wifi !== undefined) {
          totalWifi += data.metrics.wifi;
          wifiCount++;
        }
        if (data.metrics.noise !== undefined) {
          totalNoise += data.metrics.noise;
          noiseCount++;
        }
        if (data.metrics.busyness !== undefined) {
          totalBusyness += data.metrics.busyness;
          busynessCount++;
        }
        if (data.metrics.outlets !== undefined) {
          totalOutlets += data.metrics.outlets;
          outletsCount++;
        }
      }
    });

    const spotData: SpotDataAPI = {
      spotId,
      name: spot.name || 'Unknown',
      location: {
        lat: spot.location?.lat || spot.spotLatLng?.lat || 0,
        lng: spot.location?.lng || spot.spotLatLng?.lng || 0,
        address: spot.address,
      },
      metrics: {
        avgWifi: wifiCount > 0 ? totalWifi / wifiCount : 0,
        avgNoise: noiseCount > 0 ? totalNoise / noiseCount : 0,
        avgBusyness: busynessCount > 0 ? totalBusyness / busynessCount : 0,
        avgOutlets: outletsCount > 0 ? totalOutlets / outletsCount : 0,
        ratingCount: checkinsSnapshot.size,
      },
    };

    // Add real-time data if permitted
    if (includeRealtime && apiKey.permissions.realtimeMetrics) {
      const recentCheckins = await queryCheckinsBySpot(
        db,
        fb,
        spotId,
        { startDate: new Date(Date.now() - 60 * 60 * 1000), limit: 200 }
      );

      let recentBusyness = 0;
      let recentCount = 0;

      recentCheckins.forEach((doc: any) => {
        const data = doc.data();
        if (data.metrics?.busyness !== undefined) {
          recentBusyness += data.metrics.busyness;
          recentCount++;
        }
      });

      spotData.realtimeData = {
        currentBusyness: recentCount > 0 ? recentBusyness / recentCount : 0,
        estimatedWaitTime: calculateWaitTime(recentCount > 0 ? recentBusyness / recentCount : 0),
        lastUpdated: Date.now(),
      };
    }

    // Add popular times if permitted
    if (apiKey.permissions.historicalData) {
      spotData.popularTimes = await calculatePopularTimes(spotId);
    }

    // Log API usage
    await logAPIUsage(apiKey.id, apiKey.partnerId, '/spots/:id', 'GET', 200);

    return { success: true, data: spotData };
  } catch (error) {
    console.error('Failed to get spot data:', error);
    await logAPIUsage(apiKey.id, apiKey.partnerId, '/spots/:id', 'GET', 500);
    return { success: false, error: 'Failed to get spot data' };
  }
}

/**
 * Get nearby spots with busyness data (for delivery apps)
 */
export async function getNearbySpotsBusyness(
  location: { lat: number; lng: number },
  radiusKm: number,
  apiKey: APIKey
): Promise<{ success: boolean; data?: SpotDataAPI[]; error?: string }> {
  if (!isTrustedBackendRuntime()) {
    return { success: false, error: getTrustedRuntimeError('getNearbySpotsBusyness') };
  }

  try {
    // Check permissions
    if (!apiKey.permissions.busynessData) {
      return { success: false, error: 'No permission for busyness data' };
    }

    const fb = ensureFirebase();
    if (!fb) return { success: false, error: 'Firebase not initialized' };

    const db = fb.firestore();

    // Get all spots (simplified - in production, use geohash queries)
    const spotsSnapshot = await db.collection('spots').limit(500).get();

    const nearbySpots: SpotDataAPI[] = [];

    for (const doc of spotsSnapshot.docs) {
      const spot = doc.data();
      const spotLocation = spot.location || spot.spotLatLng;

      if (!spotLocation) continue;

      const distance = haversineDistance(
        location.lat,
        location.lng,
        spotLocation.lat,
        spotLocation.lng
      );

      if (distance <= radiusKm) {
        const spotDataResult = await getSpotDataAPI(doc.id, apiKey, true);
        if (spotDataResult.success && spotDataResult.data) {
          nearbySpots.push(spotDataResult.data);
        }
      }
    }

    // Sort by current busyness
    nearbySpots.sort((a, b) =>
      (a.realtimeData?.currentBusyness || 0) - (b.realtimeData?.currentBusyness || 0)
    );

    await logAPIUsage(apiKey.id, apiKey.partnerId, '/spots/nearby', 'GET', 200);

    return { success: true, data: nearbySpots };
  } catch (error) {
    console.error('Failed to get nearby spots:', error);
    await logAPIUsage(apiKey.id, apiKey.partnerId, '/spots/nearby', 'GET', 500);
    return { success: false, error: 'Failed to get nearby spots' };
  }
}

/**
 * Get API usage statistics for a partner
 */
export async function getAPIUsageStats(
  partnerId: string,
  period: 'day' | 'week' | 'month' = 'day'
): Promise<{
  totalRequests: number;
  successRate: number;
  avgResponseTime: number;
  endpointBreakdown: { [endpoint: string]: number };
}> {
  if (!isTrustedBackendRuntime()) {
    return { totalRequests: 0, successRate: 0, avgResponseTime: 0, endpointBreakdown: {} };
  }

  try {
    const fb = ensureFirebase();
    if (!fb) return { totalRequests: 0, successRate: 0, avgResponseTime: 0, endpointBreakdown: {} };

    const db = fb.firestore();

    const now = Date.now();
    let startTime = now - 24 * 60 * 60 * 1000; // 1 day

    if (period === 'week') startTime = now - 7 * 24 * 60 * 60 * 1000;
    if (period === 'month') startTime = now - 30 * 24 * 60 * 60 * 1000;

    const logsSnapshot = await db
      .collection('apiUsageLogs')
      .where('partnerId', '==', partnerId)
      .where('timestamp', '>=', startTime)
      .get();

    let totalRequests = 0;
    let successfulRequests = 0;
    let totalResponseTime = 0;
    const endpointBreakdown: { [endpoint: string]: number } = {};

    logsSnapshot.forEach((doc: any) => {
      const log = doc.data() as APIUsageLog;
      totalRequests++;

      if (log.statusCode >= 200 && log.statusCode < 300) {
        successfulRequests++;
      }

      totalResponseTime += log.responseTime;

      endpointBreakdown[log.endpoint] = (endpointBreakdown[log.endpoint] || 0) + 1;
    });

    return {
      totalRequests,
      successRate: totalRequests > 0 ? (successfulRequests / totalRequests) * 100 : 0,
      avgResponseTime: totalRequests > 0 ? totalResponseTime / totalRequests : 0,
      endpointBreakdown,
    };
  } catch (error) {
    console.error('Failed to get API usage stats:', error);
    return { totalRequests: 0, successRate: 0, avgResponseTime: 0, endpointBreakdown: {} };
  }
}

// Helper functions

function generateSecureKey(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const prefix = 'pk_';
  const randomBytes = new Uint8Array(48);
  const cryptoApi = globalThis.crypto;

  if (cryptoApi?.getRandomValues) {
    cryptoApi.getRandomValues(randomBytes);
  } else {
    for (let i = 0; i < randomBytes.length; i += 1) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
  }

  let key = prefix;
  for (const byte of randomBytes) {
    key += alphabet.charAt(byte % alphabet.length);
  }
  return key;
}

async function hashApiKey(apiKey: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Secure crypto unavailable for API key hashing');
  }

  const encoded = new TextEncoder().encode(apiKey.trim());
  const digest = await subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function buildApiKeyPreview(apiKey: string): string {
  const normalized = apiKey.trim();
  if (normalized.length <= 18) return normalized;
  return `${normalized.slice(0, 12)}...${normalized.slice(-4)}`;
}

function buildApiKeyMetadata(apiKey: string) {
  return {
    keyPreview: buildApiKeyPreview(apiKey),
    keyLast4: apiKey.trim().slice(-4),
  };
}

function sanitizeAPIKeyDocument(id: string, data: Record<string, any>): APIKey {
  const previewSource = typeof data.keyPreview === 'string' && data.keyPreview
    ? data.keyPreview
    : typeof data.key === 'string'
      ? data.key
      : '';
  const metadata = buildApiKeyMetadata(previewSource);
  return {
    id,
    keyHash: typeof data.keyHash === 'string' ? data.keyHash : '',
    keyPreview: typeof data.keyPreview === 'string' && data.keyPreview ? data.keyPreview : metadata.keyPreview,
    keyLast4: typeof data.keyLast4 === 'string' && data.keyLast4 ? data.keyLast4 : metadata.keyLast4,
    partnerId: data.partnerId,
    partnerName: data.partnerName,
    tier: data.tier,
    rateLimit: data.rateLimit,
    currentUsage: data.currentUsage,
    usageResetAt: data.usageResetAt,
    permissions: data.permissions,
    active: data.active,
    createdAt: data.createdAt,
    expiresAt: data.expiresAt,
  };
}

async function selfHealAPIKeyDocument(
  db: any,
  fb: any,
  docId: string,
  rawData: Record<string, any>,
  keyHash: string,
  apiKey: string
) {
  const updates: Record<string, any> = {};
  const metadata = buildApiKeyMetadata(apiKey);

  if (rawData.keyHash !== keyHash) {
    updates.keyHash = keyHash;
  }
  if (rawData.keyPreview !== metadata.keyPreview) {
    updates.keyPreview = metadata.keyPreview;
  }
  if (rawData.keyLast4 !== metadata.keyLast4) {
    updates.keyLast4 = metadata.keyLast4;
  }
  if (typeof rawData.key === 'string' && rawData.key) {
    updates.key = fb.firestore.FieldValue.delete();
  }

  if (Object.keys(updates).length === 0) return;
  updates.updatedAt = Date.now();
  await db.collection('apiKeys').doc(docId).set(updates, { merge: true });
}

function calculateWaitTime(busyness: number): number {
  // Estimate wait time in minutes based on busyness level (1-5)
  if (busyness <= 1.5) return 0;
  if (busyness <= 2.5) return 5;
  if (busyness <= 3.5) return 10;
  if (busyness <= 4.5) return 15;
  return 20;
}

async function calculatePopularTimes(
  spotId: string
): Promise<Array<{ hour: number; dayOfWeek: number; busyness: number }>> {
  try {
    const fb = ensureFirebase();
    if (!fb) return [];

    const db = fb.firestore();

    // Get last 30 days of check-ins
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const checkinsSnapshot = await queryCheckinsBySpot(
      db,
      fb,
      spotId,
      { startDate: thirtyDaysAgo, limit: 500 }
    );

    const hourDayCounts = new Map<string, { count: number; totalBusyness: number }>();

    checkinsSnapshot.forEach((doc: any) => {
      const data = doc.data();
      const date = parseCheckinTimestamp(data);
      if (!date) return;
      const hour = date.getHours();
      const dayOfWeek = date.getDay();
      const key = `${dayOfWeek}_${hour}`;

      const existing = hourDayCounts.get(key) || { count: 0, totalBusyness: 0 };
      hourDayCounts.set(key, {
        count: existing.count + 1,
        totalBusyness: existing.totalBusyness + (data.metrics?.busyness || 0),
      });
    });

    return Array.from(hourDayCounts.entries())
      .map(([key, value]) => {
        const [dayOfWeek, hour] = key.split('_').map(Number);
        return {
          hour,
          dayOfWeek,
          busyness: value.totalBusyness / value.count,
        };
      })
      .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.hour - b.hour);
  } catch (error) {
    console.error('Failed to calculate popular times:', error);
    return [];
  }
}

async function logAPIUsage(
  apiKeyId: string,
  partnerId: string,
  endpoint: string,
  method: string,
  statusCode: number,
  responseTime: number = 0
): Promise<void> {
  try {
    const fb = ensureFirebase();
    if (!fb) return;

    const db = fb.firestore();

    const log: Omit<APIUsageLog, 'id'> = {
      apiKeyId,
      partnerId,
      endpoint,
      method,
      statusCode,
      responseTime,
      timestamp: Date.now(),
    };

    await db.collection('apiUsageLogs').add(log);

    track('api_request', {
      partner_id: partnerId,
      endpoint,
      status_code: statusCode,
    });
  } catch (error) {
    console.error('Failed to log API usage:', error);
  }
}

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export default {
  generateAPIKey,
  validateAPIKey,
  getSpotDataAPI,
  getNearbySpotsBusyness,
  getAPIUsageStats,
};
