/**
 * Promotions Service
 *
 * Allows business owners to run promotions and boost spot visibility
 */

import { callFirebaseCallable, ensureFirebase } from './firebaseClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { track } from './analytics';
import { queryCheckinsBySpot } from './schemaHelpers';
import { haversineKm, readEntityLatLng, type LatLng } from './geo';

export interface Promotion {
  id: string;
  spotId: string;
  spotName: string;
  ownerId: string;
  type: 'discount' | 'freebie' | 'special' | 'boost';
  title: string;
  description: string;
  discountPercent?: number;
  termsAndConditions?: string;

  // Scheduling
  startDate: number;
  endDate: number;
  daysOfWeek?: number[]; // 0-6 (Sunday-Saturday), undefined = all days
  timeRange?: { start: string; end: string }; // "09:00" - "17:00"

  // Constraints
  maxRedemptions?: number;
  currentRedemptions: number;
  requiresCheckin: boolean;

  // Visibility
  featured: boolean; // Boosted promotion
  boostExpiry?: number;

  // Status
  status: 'active' | 'paused' | 'expired' | 'completed';
  createdAt: number;
  updatedAt: number;
}

export interface PromotionRedemption {
  id: string;
  promotionId: string;
  userId: string;
  spotId: string;
  redeemedAt: number;
  checkinId?: string;
}

export interface CheckinResponse {
  id: string;
  spotId: string;
  ownerId: string;
  checkinId: string;
  userId: string;
  userName: string;
  userCaption: string;
  responseText: string;
  respondedAt: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function loadSpotLocationMap(db: any, spotIds: string[]): Promise<Map<string, LatLng>> {
  const uniqueIds = Array.from(new Set(spotIds.map((spotId) => String(spotId || '').trim()).filter(Boolean)));
  const locationMap = new Map<string, LatLng>();
  if (!uniqueIds.length) return locationMap;

  const docs = await Promise.all(
    uniqueIds.map((spotId) =>
      db.collection('spots').doc(spotId).get().catch(() => null)
    )
  );

  docs.forEach((doc: any, index) => {
    if (!doc?.exists) return;
    const coords = readEntityLatLng(doc.data());
    if (coords) {
      locationMap.set(uniqueIds[index], coords);
    }
  });

  return locationMap;
}

/**
 * Create a new promotion
 */
export async function createPromotion(
  _ownerId: string,
  spotId: string,
  promotion: Omit<Promotion, 'id' | 'ownerId' | 'spotId' | 'spotName' | 'currentRedemptions' | 'status' | 'createdAt' | 'updatedAt'>
): Promise<{ success: boolean; promotionId?: string; error?: string }> {
  try {
    const result = await callFirebaseCallable<{ ok?: boolean; promotionId?: string }>('createPromotionSecure', {
      spotId,
      promotion,
    });
    if (!result?.ok || !result.promotionId) {
      return { success: false, error: 'Promotion service unavailable' };
    }

    track('promotion_created', {
      promotion_id: result.promotionId,
      spot_id: spotId,
      type: promotion.type,
      featured: promotion.featured,
    });

    return { success: true, promotionId: result.promotionId };
  } catch (error) {
    console.error('Failed to create promotion:', error);
    return { success: false, error: (error as any)?.message || 'Failed to create promotion' };
  }
}

/**
 * Get active promotions for a spot
 */
export async function getSpotPromotions(
  spotId: string,
  includeInactive: boolean = false
): Promise<Promotion[]> {
  const cacheKey = `@promotions_${spotId}_${includeInactive}`;

  try {
    // Check cache
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) {
      const { data, ts } = JSON.parse(cached);
      if (Date.now() - ts < CACHE_TTL) {
        return data;
      }
    }

    const fb = ensureFirebase();
    if (!fb) return [];

    const db = fb.firestore();

    let query = db.collection('promotions').where('spotId', '==', spotId);

    if (!includeInactive) {
      query = query.where('status', '==', 'active');
    }

    const snapshot = await query.get();

    const promotions = snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data(),
    } as Promotion));

    // Update status based on dates
    const now = Date.now();
    const updated = promotions.map((promo: any) => {
      if (now > promo.endDate) {
        return { ...promo, status: 'expired' as const };
      }
      if (promo.maxRedemptions && promo.currentRedemptions >= promo.maxRedemptions) {
        return { ...promo, status: 'completed' as const };
      }
      return promo;
    });

    // Cache result
    await AsyncStorage.setItem(cacheKey, JSON.stringify({
      data: updated,
      ts: Date.now(),
    }));

    return updated;
  } catch (error) {
    console.error('Failed to get spot promotions:', error);
    return [];
  }
}

/**
 * Get featured (boosted) promotions nearby
 */
export async function getFeaturedPromotions(
  userLocation: { lat: number; lng: number },
  radiusKm: number = 5
): Promise<Promotion[]> {
  try {
    const fb = ensureFirebase();
    if (!fb) return [];

    const db = fb.firestore();

    const now = Date.now();

    // Get all active featured promotions
    const snapshot = await db
      .collection('promotions')
      .where('featured', '==', true)
      .where('status', '==', 'active')
      .where('endDate', '>', now)
      .get();

    const promotions = snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data(),
    } as Promotion));

    const spotLocations = userLocation
      ? await loadSpotLocationMap(db, promotions.map((promo: any) => promo.spotId))
      : new Map<string, LatLng>();

    const filtered = promotions
      .map((promo: any) => {
        if (promo.boostExpiry && now > promo.boostExpiry) return null;
        if (!userLocation) {
          return { promo, distanceKm: null as number | null };
        }
        const coords = spotLocations.get(String(promo.spotId || '')) || readEntityLatLng(promo);
        if (!coords) return null;
        const distanceKm = haversineKm(userLocation, coords);
        if (distanceKm > radiusKm) return null;
        return { promo, distanceKm };
      })
      .filter(
        (entry: { promo: Promotion; distanceKm: number | null } | null): entry is { promo: Promotion; distanceKm: number | null } =>
          entry !== null
      );

    filtered.sort((left: { promo: Promotion; distanceKm: number | null }, right: { promo: Promotion; distanceKm: number | null }) => {
      if (left.distanceKm !== null && right.distanceKm !== null && left.distanceKm !== right.distanceKm) {
        return left.distanceKm - right.distanceKm;
      }
      if (left.distanceKm !== null && right.distanceKm === null) return -1;
      if (left.distanceKm === null && right.distanceKm !== null) return 1;
      return (right.promo.createdAt || 0) - (left.promo.createdAt || 0);
    });

    return filtered.slice(0, 10).map((entry: { promo: Promotion; distanceKm: number | null }) => entry.promo);
  } catch (error) {
    console.error('Failed to get featured promotions:', error);
    return [];
  }
}

/**
 * Redeem a promotion
 */
export async function redeemPromotion(
  userId: string,
  promotionId: string,
  checkinId?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const fb = ensureFirebase();
    if (!fb) return { success: false, error: 'Firebase not initialized' };

    const db = fb.firestore();

    // Get promotion
    const promoDoc = await db.collection('promotions').doc(promotionId).get();
    if (!promoDoc.exists) {
      return { success: false, error: 'Promotion not found' };
    }

    const promo = { id: promoDoc.id, ...promoDoc.data() } as Promotion;

    // Check if promotion is active
    const now = Date.now();
    if (promo.status !== 'active' || now < promo.startDate || now > promo.endDate) {
      return { success: false, error: 'Promotion is not active' };
    }

    // Check max redemptions
    if (promo.maxRedemptions && promo.currentRedemptions >= promo.maxRedemptions) {
      return { success: false, error: 'Promotion limit reached' };
    }

    // Check if user already redeemed
    const existingRedemption = await db
      .collection('promotionRedemptions')
      .where('promotionId', '==', promotionId)
      .where('userId', '==', userId)
      .get();

    if (!existingRedemption.empty) {
      return { success: false, error: 'You already redeemed this promotion' };
    }

    // Check if check-in required
    if (promo.requiresCheckin && !checkinId) {
      return { success: false, error: 'Check-in required to redeem' };
    }

    // Create redemption
    const redemption: Omit<PromotionRedemption, 'id'> = {
      promotionId,
      userId,
      spotId: promo.spotId,
      redeemedAt: now,
      checkinId,
    };

    await db.collection('promotionRedemptions').add(redemption);

    // Increment redemption count
    await db.collection('promotions').doc(promotionId).update({
      currentRedemptions: fb.firestore.FieldValue.increment(1),
      updatedAt: now,
    });

    track('promotion_redeemed', {
      promotion_id: promotionId,
      spot_id: promo.spotId,
      type: promo.type,
      required_checkin: promo.requiresCheckin,
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to redeem promotion:', error);
    return { success: false, error: 'Failed to redeem promotion' };
  }
}

/**
 * Update promotion status
 */
export async function updatePromotionStatus(
  promotionId: string,
  ownerId: string,
  status: Promotion['status']
): Promise<{ success: boolean; error?: string }> {
  try {
    const fb = ensureFirebase();
    if (!fb) return { success: false, error: 'Firebase not initialized' };

    const db = fb.firestore();

    const promoDoc = await db.collection('promotions').doc(promotionId).get();
    if (!promoDoc.exists) {
      return { success: false, error: 'Promotion not found' };
    }

    const promo = promoDoc.data() as Promotion;

    if (promo.ownerId !== ownerId) {
      return { success: false, error: 'Unauthorized' };
    }

    await db.collection('promotions').doc(promotionId).update({
      status,
      updatedAt: Date.now(),
    });

    track('promotion_status_updated', {
      promotion_id: promotionId,
      new_status: status,
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to update promotion status:', error);
    return { success: false, error: 'Failed to update status' };
  }
}

/**
 * Boost a promotion (make it featured)
 */
export async function boostPromotion(
  promotionId: string,
  ownerId: string,
  durationDays: number = 7
): Promise<{ success: boolean; error?: string }> {
  try {
    const fb = ensureFirebase();
    if (!fb) return { success: false, error: 'Firebase not initialized' };

    const db = fb.firestore();

    const promoDoc = await db.collection('promotions').doc(promotionId).get();
    if (!promoDoc.exists) {
      return { success: false, error: 'Promotion not found' };
    }

    const promo = promoDoc.data() as Promotion;

    if (promo.ownerId !== ownerId) {
      return { success: false, error: 'Unauthorized' };
    }

    const boostExpiry = Date.now() + durationDays * 24 * 60 * 60 * 1000;

    await db.collection('promotions').doc(promotionId).update({
      featured: true,
      boostExpiry,
      updatedAt: Date.now(),
    });

    track('promotion_boosted', {
      promotion_id: promotionId,
      duration_days: durationDays,
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to boost promotion:', error);
    return { success: false, error: 'Failed to boost promotion' };
  }
}

/**
 * Respond to a check-in
 */
export async function respondToCheckin(
  _ownerId: string,
  spotId: string,
  checkinId: string,
  responseText: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await callFirebaseCallable<{ ok?: boolean; responseId?: string }>('respondToCheckinSecure', {
      spotId,
      checkinId,
      responseText,
    });
    if (!result?.ok) {
      return { success: false, error: 'Check-in response service unavailable' };
    }

    track('checkin_responded', {
      spot_id: spotId,
      checkin_id: checkinId,
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to respond to check-in:', error);
    return { success: false, error: (error as any)?.message || 'Failed to respond' };
  }
}

/**
 * Get check-in responses for a user
 */
export async function getUserCheckinResponses(userId: string): Promise<CheckinResponse[]> {
  try {
    const fb = ensureFirebase();
    if (!fb) return [];

    const db = fb.firestore();

    const snapshot = await db
      .collection('checkinResponses')
      .where('userId', '==', userId)
      .orderBy('respondedAt', 'desc')
      .limit(50)
      .get();

    return snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data(),
    } as CheckinResponse));
  } catch (error) {
    console.error('Failed to get user check-in responses:', error);
    return [];
  }
}

/**
 * Get recent check-ins for a spot (for business owners to respond to)
 */
export async function getSpotRecentCheckins(
  spotId: string,
  limit: number = 50
): Promise<any[]> {
  try {
    const fb = ensureFirebase();
    if (!fb) return [];

    const db = fb.firestore();

    // Use schema helper for automatic fallback (spotPlaceId+createdAt → spotId+timestamp)
    const snapshot = await queryCheckinsBySpot(db, fb, spotId, { limit, orderBy: 'desc' });

    return snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data(),
    }));
  } catch (error) {
    console.error('Failed to get recent check-ins:', error);
    return [];
  }
}

export default {
  createPromotion,
  getSpotPromotions,
  getFeaturedPromotions,
  redeemPromotion,
  updatePromotionStatus,
  boostPromotion,
  respondToCheckin,
  getUserCheckinResponses,
  getSpotRecentCheckins,
};
