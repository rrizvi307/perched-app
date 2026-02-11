/**
 * Premium Subscription Service
 *
 * Manages premium subscription status, feature access, and referral rewards
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { ensureFirebase } from './firebaseClient';
import { trackPremiumConversion } from './analytics';

export type SubscriptionTier = 'free' | 'premium';
export type SubscriptionPeriod = 'monthly' | 'annual';

export interface PremiumStatus {
  tier: SubscriptionTier;
  isActive: boolean;
  expiresAt: number | null; // Timestamp, null = lifetime/no expiration
  source: 'purchase' | 'referral' | 'promo' | 'free';
  subscriptionId?: string;
  period?: SubscriptionPeriod;
  autoRenew?: boolean;
  referralWeeksRemaining?: number;
}

export interface SubscriptionPricing {
  monthly: {
    price: number;
    priceId: string; // Stripe price ID
    displayPrice: string;
  };
  annual: {
    price: number;
    priceId: string;
    displayPrice: string;
    savings: string;
  };
}

// Subscription pricing (in cents)
export const PRICING: SubscriptionPricing = {
  monthly: {
    price: 499, // $4.99
    priceId: 'price_monthly_perched_premium', // TODO: Replace with actual Stripe price ID
    displayPrice: '$4.99',
  },
  annual: {
    price: 4999, // $49.99
    priceId: 'price_annual_perched_premium', // TODO: Replace with actual Stripe price ID
    displayPrice: '$49.99',
    savings: '17% off',
  },
};

// Premium feature flags
export enum PremiumFeature {
  ADVANCED_FILTERS = 'advanced_filters',
  CUSTOM_LISTS = 'custom_lists',
  EXPORT_HISTORY = 'export_history',
  AD_FREE = 'ad_free',
  EXCLUSIVE_LEADERBOARDS = 'exclusive_leaderboards',
  PRIORITY_SUPPORT = 'priority_support',
}

const PREMIUM_STATUS_KEY = '@perched_premium_status';

type RevenueCatCustomerInfo = {
  entitlements?: {
    active?: Record<string, unknown>;
  };
};

type RevenueCatModule = {
  configure: (options: { apiKey: string }) => void;
  getCustomerInfo: () => Promise<RevenueCatCustomerInfo>;
};

let revenueCat: RevenueCatModule | null | undefined;
let purchasesInitialized = false;

function getRevenueCatModule(): RevenueCatModule | null {
  if (revenueCat !== undefined) return revenueCat;
  try {
    const loaded = require('react-native-purchases');
    revenueCat = (loaded?.default ?? loaded) as RevenueCatModule;
  } catch {
    revenueCat = null;
  }
  return revenueCat;
}

function getRevenueCatPublicKey(providedKey?: string): string {
  const expoExtraKey = (Constants.expoConfig as any)?.extra?.REVENUECAT_PUBLIC_KEY;
  const globalKey = (global as any)?.REVENUECAT_PUBLIC_KEY;
  const resolved = providedKey || expoExtraKey || globalKey || '';
  return typeof resolved === 'string' ? resolved.trim() : '';
}

/**
 * Get user's premium status
 */
export async function getPremiumStatus(userId: string): Promise<PremiumStatus> {
  try {
    // Try local cache first
    const cached = await AsyncStorage.getItem(`${PREMIUM_STATUS_KEY}_${userId}`);
    if (cached) {
      const status: PremiumStatus = JSON.parse(cached);

      // Check if expired
      if (status.expiresAt && status.expiresAt < Date.now()) {
        return {
          tier: 'free',
          isActive: false,
          expiresAt: null,
          source: 'free',
        };
      }

      return status;
    }

    // Fetch from Firestore
    const fb = ensureFirebase();
    if (fb) {
      const db = fb.firestore();
      const doc = await db.collection('users').doc(userId).get();
      const data = doc.data();

      if (data?.premiumStatus) {
        const status: PremiumStatus = {
          tier: data.premiumStatus.tier || 'free',
          isActive: data.premiumStatus.isActive || false,
          expiresAt: data.premiumStatus.expiresAt?.toMillis?.() || data.premiumStatus.expiresAt || null,
          source: data.premiumStatus.source || 'free',
          subscriptionId: data.premiumStatus.subscriptionId,
          period: data.premiumStatus.period,
          autoRenew: data.premiumStatus.autoRenew,
          referralWeeksRemaining: data.premiumStatus.referralWeeksRemaining,
        };

        // Check if expired
        if (status.expiresAt && status.expiresAt < Date.now()) {
          return {
            tier: 'free',
            isActive: false,
            expiresAt: null,
            source: 'free',
          };
        }

        // Cache locally
        await AsyncStorage.setItem(`${PREMIUM_STATUS_KEY}_${userId}`, JSON.stringify(status));
        return status;
      }
    }
  } catch (error) {
    console.warn('Failed to get premium status:', error);
  }

  // Default to free tier
  return {
    tier: 'free',
    isActive: false,
    expiresAt: null,
    source: 'free',
  };
}

/**
 * Check if user has access to a premium feature
 */
export async function hasFeatureAccess(userId: string, feature: PremiumFeature): Promise<boolean> {
  const status = await getPremiumStatus(userId);
  return status.isActive && status.tier === 'premium';
}

/**
 * Initialize RevenueCat purchases client (no-op if package/key are unavailable).
 */
export function initializePurchases(apiKey?: string): void {
  const purchases = getRevenueCatModule();
  if (!purchases || purchasesInitialized) return;

  const key = getRevenueCatPublicKey(apiKey);
  if (!key || key === 'YOUR_REVENUECAT_PUBLIC_KEY') return;

  try {
    purchases.configure({ apiKey: key });
    purchasesInitialized = true;
  } catch (error) {
    console.warn('Failed to initialize purchases:', error);
  }
}

/**
 * Check active premium entitlement from RevenueCat customer info.
 */
export async function checkPremiumStatus(): Promise<boolean> {
  try {
    initializePurchases();
    const purchases = getRevenueCatModule();
    if (!purchases || typeof purchases.getCustomerInfo !== 'function') {
      return false;
    }
    const customerInfo = await purchases.getCustomerInfo();
    return customerInfo?.entitlements?.active?.premium !== undefined;
  } catch {
    return false;
  }
}

/**
 * Unified premium access check used by UI gating.
 * Falls back to Firestore-backed premiumStatus when RevenueCat is unavailable.
 */
export async function checkPremiumAccess(userId?: string): Promise<boolean> {
  const rcPremium = await checkPremiumStatus();
  if (rcPremium) return true;

  try {
    const fb = ensureFirebase();
    const resolvedUserId = userId || fb?.auth?.()?.currentUser?.uid || '';
    if (!resolvedUserId) return false;
    const status = await getPremiumStatus(resolvedUserId);
    return status.isActive && status.tier === 'premium';
  } catch {
    return false;
  }
}

/**
 * RevenueCat purchase flow helper for app premium upgrade screen.
 */
export async function purchasePremium(productId: 'monthly' | 'yearly'): Promise<boolean> {
  try {
    initializePurchases();
    const purchases = getRevenueCatModule() as any;
    if (!purchases) return false;
    if (typeof purchases.getOfferings !== 'function' || typeof purchases.purchasePackage !== 'function') {
      return false;
    }

    const offerings = await purchases.getOfferings();
    const availablePackages: any[] = offerings?.current?.availablePackages || [];
    const desired = productId === 'yearly'
      ? ['annual', 'yearly', '$rc_annual']
      : ['monthly', '$rc_monthly'];

    const selectedPackage = availablePackages.find((pkg: any) => {
      const identifier = String(pkg?.identifier || '').toLowerCase();
      const productIdentifier = String(pkg?.product?.identifier || '').toLowerCase();
      const packageType = String(pkg?.packageType || '').toLowerCase();
      return desired.some((needle) =>
        identifier.includes(needle) ||
        productIdentifier.includes(needle) ||
        packageType.includes(needle)
      );
    });

    if (!selectedPackage) {
      return false;
    }

    const result = await purchases.purchasePackage(selectedPackage);
    const customerInfo = result?.customerInfo || result;
    const premiumActive = customerInfo?.entitlements?.active?.premium !== undefined;
    if (premiumActive) {
      void trackPremiumConversion(productId === 'yearly' ? 'annual' : 'monthly');
    }
    return premiumActive;
  } catch {
    return false;
  }
}

/**
 * Grant premium access from referral rewards
 *
 * @param userId - User ID
 * @param weeks - Number of weeks to grant
 */
export async function grantReferralPremium(userId: string, weeks: number): Promise<PremiumStatus> {
  try {
    const currentStatus = await getPremiumStatus(userId);

    // Calculate new expiration
    const now = Date.now();
    const weeksInMs = weeks * 7 * 24 * 60 * 60 * 1000;

    let newExpiresAt: number;
    if (currentStatus.isActive && currentStatus.expiresAt && currentStatus.expiresAt > now) {
      // Extend existing premium
      newExpiresAt = currentStatus.expiresAt + weeksInMs;
    } else {
      // Start new premium period
      newExpiresAt = now + weeksInMs;
    }

    const newStatus: PremiumStatus = {
      tier: 'premium',
      isActive: true,
      expiresAt: newExpiresAt,
      source: 'referral',
      referralWeeksRemaining: (currentStatus.referralWeeksRemaining || 0) + weeks,
    };

    // Save to Firestore
    const fb = ensureFirebase();
    if (fb) {
      const db = fb.firestore();
      await db.collection('users').doc(userId).set({
        premiumStatus: {
          ...newStatus,
          updatedAt: fb.firestore.FieldValue.serverTimestamp(),
        },
      }, { merge: true });
    }

    // Update local cache
    await AsyncStorage.setItem(`${PREMIUM_STATUS_KEY}_${userId}`, JSON.stringify(newStatus));

    return newStatus;
  } catch (error) {
    console.error('Failed to grant referral premium:', error);
    throw error;
  }
}

/**
 * Grant premium access from purchase
 *
 * @param userId - User ID
 * @param period - Subscription period
 * @param subscriptionId - Stripe subscription ID
 */
export async function grantPurchasedPremium(
  userId: string,
  period: SubscriptionPeriod,
  subscriptionId: string
): Promise<PremiumStatus> {
  try {
    // Calculate expiration based on period
    const now = Date.now();
    const expiresAt = period === 'monthly'
      ? now + 30 * 24 * 60 * 60 * 1000 // 30 days
      : now + 365 * 24 * 60 * 60 * 1000; // 365 days

    const newStatus: PremiumStatus = {
      tier: 'premium',
      isActive: true,
      expiresAt,
      source: 'purchase',
      subscriptionId,
      period,
      autoRenew: true,
    };

    // Save to Firestore
    const fb = ensureFirebase();
    if (fb) {
      const db = fb.firestore();
      await db.collection('users').doc(userId).set({
        premiumStatus: {
          ...newStatus,
          updatedAt: fb.firestore.FieldValue.serverTimestamp(),
        },
      }, { merge: true });
    }

    // Update local cache
    await AsyncStorage.setItem(`${PREMIUM_STATUS_KEY}_${userId}`, JSON.stringify(newStatus));
    void trackPremiumConversion(period);

    return newStatus;
  } catch (error) {
    console.error('Failed to grant purchased premium:', error);
    throw error;
  }
}

/**
 * Cancel premium subscription
 */
export async function cancelPremiumSubscription(userId: string): Promise<void> {
  try {
    const currentStatus = await getPremiumStatus(userId);

    // Mark as non-renewing but keep active until expiration
    const updatedStatus: PremiumStatus = {
      ...currentStatus,
      autoRenew: false,
    };

    // Update Firestore
    const fb = ensureFirebase();
    if (fb) {
      const db = fb.firestore();
      await db.collection('users').doc(userId).set({
        premiumStatus: {
          ...updatedStatus,
          updatedAt: fb.firestore.FieldValue.serverTimestamp(),
        },
      }, { merge: true });
    }

    // Update local cache
    await AsyncStorage.setItem(`${PREMIUM_STATUS_KEY}_${userId}`, JSON.stringify(updatedStatus));
  } catch (error) {
    console.error('Failed to cancel premium subscription:', error);
    throw error;
  }
}

/**
 * Clear premium status cache (for logout or cache invalidation)
 */
export async function clearPremiumCache(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${PREMIUM_STATUS_KEY}_${userId}`);
  } catch (error) {
    console.warn('Failed to clear premium cache:', error);
  }
}

/**
 * Get days remaining in premium subscription
 */
export function getDaysRemaining(status: PremiumStatus): number | null {
  if (!status.isActive || !status.expiresAt) return null;
  const now = Date.now();
  const remaining = status.expiresAt - now;
  return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
}

/**
 * Format premium expiration date
 */
export function formatExpirationDate(status: PremiumStatus): string {
  if (!status.expiresAt) return 'Never expires';
  const date = new Date(status.expiresAt);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
