/**
 * Premium Hook
 *
 * Provides easy access to premium status and feature checks
 */

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getPremiumStatus,
  hasFeatureAccess,
  PremiumFeature,
  PremiumStatus,
  getDaysRemaining,
  formatExpirationDate,
} from '@/services/premium';

export function usePremium() {
  const { user } = useAuth();
  const [premiumStatus, setPremiumStatus] = useState<PremiumStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) {
      setPremiumStatus(null);
      setLoading(false);
      return;
    }

    let mounted = true;

    const loadPremiumStatus = async () => {
      try {
        const status = await getPremiumStatus(user.id);
        if (mounted) {
          setPremiumStatus(status);
        }
      } catch (error) {
        console.error('Failed to load premium status:', error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadPremiumStatus();

    // Reload every 5 minutes to catch expiration
    const interval = setInterval(loadPremiumStatus, 5 * 60 * 1000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [user?.id]);

  /**
   * Check if user has access to a specific premium feature
   */
  const checkFeatureAccess = async (feature: PremiumFeature): Promise<boolean> => {
    if (!user?.id) return false;
    return hasFeatureAccess(user.id, feature);
  };

  /**
   * Check if user has premium (synchronous, uses cached status)
   */
  const isPremium = premiumStatus?.isActive && premiumStatus?.tier === 'premium';

  /**
   * Get days remaining in premium subscription
   */
  const daysRemaining = premiumStatus ? getDaysRemaining(premiumStatus) : null;

  /**
   * Get formatted expiration date
   */
  const expirationDate = premiumStatus ? formatExpirationDate(premiumStatus) : null;

  /**
   * Check if premium is from referrals
   */
  const isReferralPremium = premiumStatus?.source === 'referral';

  /**
   * Check if premium is from purchase
   */
  const isPurchasedPremium = premiumStatus?.source === 'purchase';

  /**
   * Check if subscription will auto-renew
   */
  const willAutoRenew = premiumStatus?.autoRenew === true;

  return {
    premiumStatus,
    loading,
    isPremium,
    checkFeatureAccess,
    daysRemaining,
    expirationDate,
    isReferralPremium,
    isPurchasedPremium,
    willAutoRenew,
  };
}
