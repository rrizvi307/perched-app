/**
 * Partner Program Service
 *
 * Manages local partnerships with coffee shops and coworking spaces
 */

import { callFirebaseCallable, ensureFirebase } from './firebaseClient';
import { track } from './analytics';
import { haversineKm, readEntityLatLng, type LatLng } from './geo';

export interface Partner {
  id: string;
  spotId: string;
  spotName: string;
  ownerId: string;
  tier: 'basic' | 'premium' | 'elite';
  status: 'pending' | 'active' | 'paused' | 'cancelled';

  // Benefits
  benefits: {
    verifiedBadge: boolean;
    featuredInDiscovery: boolean;
    loyaltyProgram: boolean;
    eventHosting: boolean;
    sponsoredEquipment: boolean;
    coMarketing: boolean;
  };

  // Loyalty Program
  loyaltyConfig?: {
    enabled: boolean;
    checkinsRequired: number; // e.g., 10 check-ins = 1 reward
    rewardType: 'free_item' | 'discount' | 'custom';
    rewardValue: string; // e.g., "Free coffee", "20% off"
    rewardDescription: string;
  };

  // Pricing
  monthlyFee: number;
  revenueShare?: number; // Percentage for loyalty redemptions

  // Stats
  stats: {
    totalCheckins: number;
    loyaltyRedemptions: number;
    eventsHosted: number;
    revenue: number;
  };

  joinedAt: number;
  renewsAt?: number;
}

export interface LoyaltyCard {
  id: string;
  userId: string;
  partnerId: string;
  spotId: string;
  spotName: string;
  checkins: number;
  checkinsRequired: number;
  rewardsEarned: number;
  rewardsRedeemed: number;
  lastCheckinAt?: number;
  createdAt: number;
}

export interface LoyaltyRedemption {
  id: string;
  userId: string;
  partnerId: string;
  spotId: string;
  loyaltyCardId: string;
  rewardType: string;
  rewardValue: string;
  redeemedAt: number;
  verified: boolean;
}

export interface PartnerEvent {
  id: string;
  partnerId: string;
  spotId: string;
  spotName: string;
  title: string;
  description: string;
  eventType: 'meetup' | 'workshop' | 'networking' | 'special' | 'other';
  date: number;
  duration: number; // minutes
  capacity?: number;
  currentAttendees: number;
  imageUrl?: string;
  requirements?: string;
  status: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
  createdAt: number;
}

export interface EquipmentSponsorship {
  id: string;
  partnerId: string;
  spotId: string;
  brandId: string;
  brandName: string;
  equipmentType: 'wifi' | 'outlets' | 'furniture' | 'coffee' | 'other';
  sponsorshipValue: number; // monthly fee
  featured: boolean;
  startDate: number;
  endDate: number;
  status: 'active' | 'expired';
}

const PARTNER_TIERS = {
  basic: {
    monthlyFee: 50,
    benefits: {
      verifiedBadge: true,
      featuredInDiscovery: false,
      loyaltyProgram: false,
      eventHosting: false,
      sponsoredEquipment: false,
      coMarketing: false,
    },
  },
  premium: {
    monthlyFee: 100,
    benefits: {
      verifiedBadge: true,
      featuredInDiscovery: true,
      loyaltyProgram: true,
      eventHosting: true,
      sponsoredEquipment: false,
      coMarketing: true,
    },
  },
  elite: {
    monthlyFee: 200,
    benefits: {
      verifiedBadge: true,
      featuredInDiscovery: true,
      loyaltyProgram: true,
      eventHosting: true,
      sponsoredEquipment: true,
      coMarketing: true,
    },
  },
};

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
 * Create a new partner
 */
export async function createPartner(
  spotId: string,
  _ownerId: string,
  tier: Partner['tier'],
  loyaltyConfig?: Partner['loyaltyConfig']
): Promise<{ success: boolean; partnerId?: string; error?: string }> {
  try {
    const result = await callFirebaseCallable<{ ok?: boolean; partnerId?: string }>('createPartnerSecure', {
      spotId,
      tier,
      loyaltyConfig,
    });
    if (!result?.ok || !result.partnerId) {
      return { success: false, error: 'Partner service unavailable' };
    }

    track('partner_created', {
      partner_id: result.partnerId,
      spot_id: spotId,
      tier,
      loyalty_enabled: loyaltyConfig?.enabled || false,
    });

    return { success: true, partnerId: result.partnerId };
  } catch (error) {
    console.error('Failed to create partner:', error);
    return { success: false, error: (error as any)?.message || 'Failed to create partner' };
  }
}

/**
 * Get or create loyalty card for a user at a partner spot
 */
export async function getLoyaltyCard(
  userId: string,
  partnerId: string
): Promise<LoyaltyCard | null> {
  try {
    const fb = ensureFirebase();
    if (!fb) return null;

    const db = fb.firestore();

    // Check for existing card
    const existingCard = await db
      .collection('loyaltyCards')
      .where('userId', '==', userId)
      .where('partnerId', '==', partnerId)
      .limit(1)
      .get();

    if (!existingCard.empty) {
      const doc = existingCard.docs[0];
      return { id: doc.id, ...doc.data() } as LoyaltyCard;
    }

    // Get partner config
    const partnerDoc = await db.collection('partners').doc(partnerId).get();
    if (!partnerDoc.exists) return null;

    const partner = partnerDoc.data() as Partner;

    if (!partner.loyaltyConfig?.enabled) {
      return null; // Partner doesn't have loyalty program
    }

    // Create new card
    const newCard: Omit<LoyaltyCard, 'id'> = {
      userId,
      partnerId,
      spotId: partner.spotId,
      spotName: partner.spotName,
      checkins: 0,
      checkinsRequired: partner.loyaltyConfig.checkinsRequired,
      rewardsEarned: 0,
      rewardsRedeemed: 0,
      createdAt: Date.now(),
    };

    const docRef = await db.collection('loyaltyCards').add(newCard);

    track('loyalty_card_created', {
      partner_id: partnerId,
      user_id: userId,
    });

    return { id: docRef.id, ...newCard };
  } catch (error) {
    console.error('Failed to get loyalty card:', error);
    return null;
  }
}

/**
 * Process check-in for loyalty program
 */
export async function processLoyaltyCheckin(
  userId: string,
  spotId: string,
  checkinId: string
): Promise<{ success: boolean; rewardEarned?: boolean; loyaltyCard?: LoyaltyCard }> {
  try {
    const fb = ensureFirebase();
    if (!fb) return { success: false };

    const db = fb.firestore();

    // Find partner for this spot
    const partnerSnapshot = await db
      .collection('partners')
      .where('spotId', '==', spotId)
      .where('status', '==', 'active')
      .limit(1)
      .get();

    if (partnerSnapshot.empty) {
      return { success: false }; // Not a partner spot
    }

    const partnerId = partnerSnapshot.docs[0].id;
    const partner = partnerSnapshot.docs[0].data() as Partner;

    if (!partner.loyaltyConfig?.enabled) {
      return { success: false }; // Loyalty not enabled
    }

    // Get or create loyalty card
    const loyaltyCard = await getLoyaltyCard(userId, partnerId);
    if (!loyaltyCard) return { success: false };

    // Increment check-ins
    const newCheckins = loyaltyCard.checkins + 1;
    let rewardEarned = false;

    const updates: any = {
      checkins: newCheckins,
      lastCheckinAt: Date.now(),
    };

    // Check if reward earned
    if (newCheckins >= loyaltyCard.checkinsRequired) {
      updates.checkins = 0; // Reset counter
      updates.rewardsEarned = fb.firestore.FieldValue.increment(1);
      rewardEarned = true;
    }

    await db.collection('loyaltyCards').doc(loyaltyCard.id).update(updates);

    // Update partner stats
    await db.collection('partners').doc(partnerId).update({
      'stats.totalCheckins': fb.firestore.FieldValue.increment(1),
    });

    if (rewardEarned) {
      track('loyalty_reward_earned', {
        partner_id: partnerId,
        user_id: userId,
        checkins: loyaltyCard.checkinsRequired,
      });
    }

    return {
      success: true,
      rewardEarned,
      loyaltyCard: {
        ...loyaltyCard,
        ...updates,
        rewardsEarned: rewardEarned ? loyaltyCard.rewardsEarned + 1 : loyaltyCard.rewardsEarned,
      },
    };
  } catch (error) {
    console.error('Failed to process loyalty check-in:', error);
    return { success: false };
  }
}

/**
 * Redeem loyalty reward
 */
export async function redeemLoyaltyReward(
  userId: string,
  partnerId: string,
  loyaltyCardId: string
): Promise<{ success: boolean; redemption?: LoyaltyRedemption; error?: string }> {
  try {
    const fb = ensureFirebase();
    if (!fb) return { success: false, error: 'Firebase not initialized' };

    const db = fb.firestore();

    // Get loyalty card
    const cardDoc = await db.collection('loyaltyCards').doc(loyaltyCardId).get();
    if (!cardDoc.exists) {
      return { success: false, error: 'Loyalty card not found' };
    }

    const card = { id: cardDoc.id, ...cardDoc.data() } as LoyaltyCard;

    if (card.userId !== userId || card.partnerId !== partnerId) {
      return { success: false, error: 'Invalid loyalty card' };
    }

    if (card.rewardsEarned <= card.rewardsRedeemed) {
      return { success: false, error: 'No rewards available' };
    }

    // Get partner config
    const partnerDoc = await db.collection('partners').doc(partnerId).get();
    if (!partnerDoc.exists) {
      return { success: false, error: 'Partner not found' };
    }

    const partner = partnerDoc.data() as Partner;

    // Create redemption
    const redemption: Omit<LoyaltyRedemption, 'id'> = {
      userId,
      partnerId,
      spotId: card.spotId,
      loyaltyCardId,
      rewardType: partner.loyaltyConfig!.rewardType,
      rewardValue: partner.loyaltyConfig!.rewardValue,
      redeemedAt: Date.now(),
      verified: false, // Requires partner verification
    };

    const docRef = await db.collection('loyaltyRedemptions').add(redemption);

    // Update card
    await db.collection('loyaltyCards').doc(loyaltyCardId).update({
      rewardsRedeemed: fb.firestore.FieldValue.increment(1),
    });

    // Update partner stats
    await db.collection('partners').doc(partnerId).update({
      'stats.loyaltyRedemptions': fb.firestore.FieldValue.increment(1),
    });

    track('loyalty_reward_redeemed', {
      partner_id: partnerId,
      user_id: userId,
      reward_type: redemption.rewardType,
    });

    return { success: true, redemption: { id: docRef.id, ...redemption } };
  } catch (error) {
    console.error('Failed to redeem loyalty reward:', error);
    return { success: false, error: 'Failed to redeem reward' };
  }
}

/**
 * Create partner event
 */
export async function createPartnerEvent(
  partnerId: string,
  event: Omit<PartnerEvent, 'id' | 'partnerId' | 'currentAttendees' | 'status' | 'createdAt'>
): Promise<{ success: boolean; eventId?: string; error?: string }> {
  try {
    const fb = ensureFirebase();
    if (!fb) return { success: false, error: 'Firebase not initialized' };

    const db = fb.firestore();

    // Verify partner has event hosting benefits
    const partnerDoc = await db.collection('partners').doc(partnerId).get();
    if (!partnerDoc.exists) {
      return { success: false, error: 'Partner not found' };
    }

    const partner = partnerDoc.data() as Partner;

    if (!partner.benefits.eventHosting) {
      return { success: false, error: 'Event hosting not enabled for this tier' };
    }

    const now = Date.now();

    const newEvent: Omit<PartnerEvent, 'id'> = {
      ...event,
      partnerId,
      currentAttendees: 0,
      status: event.date > now ? 'upcoming' : 'ongoing',
      createdAt: now,
    };

    const docRef = await db.collection('partnerEvents').add(newEvent);

    // Update partner stats
    await db.collection('partners').doc(partnerId).update({
      'stats.eventsHosted': fb.firestore.FieldValue.increment(1),
    });

    track('partner_event_created', {
      partner_id: partnerId,
      event_id: docRef.id,
      event_type: event.eventType,
    });

    return { success: true, eventId: docRef.id };
  } catch (error) {
    console.error('Failed to create partner event:', error);
    return { success: false, error: 'Failed to create event' };
  }
}

/**
 * Get upcoming partner events
 */
export async function getUpcomingPartnerEvents(
  userLocation?: { lat: number; lng: number },
  radiusKm: number = 10
): Promise<PartnerEvent[]> {
  try {
    const fb = ensureFirebase();
    if (!fb) return [];

    const db = fb.firestore();

    const now = Date.now();

    const snapshot = await db
      .collection('partnerEvents')
      .where('status', '==', 'upcoming')
      .where('date', '>', now)
      .orderBy('date', 'asc')
      .limit(50)
      .get();

    const events = snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data(),
    } as PartnerEvent));

    const spotLocations = userLocation
      ? await loadSpotLocationMap(db, events.map((event: PartnerEvent) => event.spotId))
      : new Map<string, LatLng>();

    const filtered = events
      .map((event: PartnerEvent) => {
        if (!userLocation) return { event, distanceKm: null as number | null };
        const coords = spotLocations.get(String(event.spotId || '')) || readEntityLatLng(event as any);
        if (!coords) return null;
        const distanceKm = haversineKm(userLocation, coords);
        if (distanceKm > radiusKm) return null;
        return { event, distanceKm };
      })
      .filter(
        (entry: { event: PartnerEvent; distanceKm: number | null } | null): entry is { event: PartnerEvent; distanceKm: number | null } =>
          entry !== null
      );

    filtered.sort((left: { event: PartnerEvent; distanceKm: number | null }, right: { event: PartnerEvent; distanceKm: number | null }) => {
      if (left.distanceKm !== null && right.distanceKm !== null && left.distanceKm !== right.distanceKm) {
        return left.distanceKm - right.distanceKm;
      }
      if (left.distanceKm !== null && right.distanceKm === null) return -1;
      if (left.distanceKm === null && right.distanceKm !== null) return 1;
      return (left.event.date || 0) - (right.event.date || 0);
    });

    return filtered.map((entry: { event: PartnerEvent; distanceKm: number | null }) => entry.event);
  } catch (error) {
    console.error('Failed to get upcoming events:', error);
    return [];
  }
}

/**
 * Create equipment sponsorship
 */
export async function createEquipmentSponsorship(
  partnerId: string,
  sponsorship: Omit<EquipmentSponsorship, 'id' | 'partnerId' | 'status'>
): Promise<{ success: boolean; sponsorshipId?: string; error?: string }> {
  try {
    const fb = ensureFirebase();
    if (!fb) return { success: false, error: 'Firebase not initialized' };

    const db = fb.firestore();

    // Verify partner has sponsorship benefits
    const partnerDoc = await db.collection('partners').doc(partnerId).get();
    if (!partnerDoc.exists) {
      return { success: false, error: 'Partner not found' };
    }

    const partner = partnerDoc.data() as Partner;

    if (!partner.benefits.sponsoredEquipment) {
      return { success: false, error: 'Equipment sponsorship not enabled for this tier' };
    }

    const now = Date.now();

    const newSponsorship: Omit<EquipmentSponsorship, 'id'> = {
      ...sponsorship,
      partnerId,
      status: now >= sponsorship.startDate && now <= sponsorship.endDate ? 'active' : 'expired',
    };

    const docRef = await db.collection('equipmentSponsorships').add(newSponsorship);

    track('equipment_sponsorship_created', {
      partner_id: partnerId,
      brand_id: sponsorship.brandId,
      equipment_type: sponsorship.equipmentType,
      value: sponsorship.sponsorshipValue,
    });

    return { success: true, sponsorshipId: docRef.id };
  } catch (error) {
    console.error('Failed to create equipment sponsorship:', error);
    return { success: false, error: 'Failed to create sponsorship' };
  }
}

/**
 * Get user's loyalty cards
 */
export async function getUserLoyaltyCards(userId: string): Promise<LoyaltyCard[]> {
  try {
    const fb = ensureFirebase();
    if (!fb) return [];

    const db = fb.firestore();

    const snapshot = await db
      .collection('loyaltyCards')
      .where('userId', '==', userId)
      .orderBy('lastCheckinAt', 'desc')
      .get();

    return snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data(),
    } as LoyaltyCard));
  } catch (error) {
    console.error('Failed to get user loyalty cards:', error);
    return [];
  }
}

export default {
  createPartner,
  getLoyaltyCard,
  processLoyaltyCheckin,
  redeemLoyaltyReward,
  createPartnerEvent,
  getUpcomingPartnerEvents,
  createEquipmentSponsorship,
  getUserLoyaltyCards,
};
