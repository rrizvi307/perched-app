import { Share, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { track } from './analytics';
import { ensureFirebase } from './firebaseClient';
import { createDeepLink } from './deepLinking';
import Constants from 'expo-constants';

const APP_NAME = 'Perched';
const extra = ((Constants.expoConfig as any)?.extra || {}) as Record<string, any>;
const APP_STORE_URL = (extra.APP_STORE_URL as string) || 'https://apps.apple.com/app/perched/id6739514696';
const PLAY_STORE_URL = (extra.PLAY_STORE_URL as string) || 'https://play.google.com/store/apps/details?id=com.perched.app';
const WEB_URL = 'https://perched.app';

interface ShareOptions {
  title?: string;
  message: string;
  url?: string;
  context?: string;
}

/**
 * Generate a referral code for a user
 */
export function generateReferralCode(userId: string, handle?: string): string {
  // Use handle if available, otherwise use first 6 chars of userId
  const base = handle || userId.substring(0, 6);
  return base.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Get shareable app download link with referral tracking
 * Uses Firebase Dynamic Links format for proper attribution
 */
export function getInviteLink(referralCode: string): string {
  // Firebase Dynamic Link format
  // When configured in Firebase console, these links will:
  // 1. Open the app directly if installed
  // 2. Redirect to app store if not installed
  // 3. Pass referral code through the install process
  const dynamicLinkDomain = (extra.DYNAMIC_LINK_DOMAIN as string) || 'perched.page.link';
  const bundleId = 'com.perched.app';
  const appStoreId = '6739514696';

  // Build the deep link that will open in the app
  const deepLink = encodeURIComponent(`${WEB_URL}/invite?ref=${referralCode}`);

  // Construct Firebase Dynamic Link
  // Note: For full functionality, configure in Firebase Console > Dynamic Links
  const dynamicLink = `https://${dynamicLinkDomain}/?` +
    `link=${deepLink}` +
    `&apn=${bundleId}` +
    `&ibi=${bundleId}` +
    `&isi=${appStoreId}` +
    `&efr=1`; // Skip preview page

  return dynamicLink;
}

/**
 * Share app invite with referral code
 */
export async function shareAppInvite(
  userId: string,
  userName: string,
  handle?: string
): Promise<{ success: boolean; method?: string }> {
  const referralCode = generateReferralCode(userId, handle);
  const inviteLink = getInviteLink(referralCode);

  const message = `Hey! I'm using ${APP_NAME} to share my favorite spots. Join me and get 1 week of Premium free! ${inviteLink}`;

  try {
    const result = await Share.share({
      message,
      title: `${userName} invited you to ${APP_NAME}`,
      url: inviteLink, // iOS only
    });

    track('invite_shared', {
      method: result.action === Share.sharedAction ? 'success' : 'dismissed',
      referral_code: referralCode,
    });

    if (result.action === Share.sharedAction) {
      return { success: true, method: result.activityType || 'unknown' };
    }

    return { success: false };
  } catch (error) {
    console.error('Failed to share invite:', error);
    track('invite_share_failed', {
      error: String(error),
      referral_code: referralCode,
    });
    return { success: false };
  }
}

/**
 * Share a specific check-in
 */
export async function shareCheckin(
  checkinId: string,
  spotName: string,
  userName: string,
  photoUrl?: string
): Promise<{ success: boolean }> {
  // Use deep linking service for proper URL generation
  const deepLink = createDeepLink('checkin', { checkinId });
  const message = `Check out where ${userName} is at ${spotName} on ${APP_NAME}! ${deepLink}`;

  try {
    const result = await Share.share({
      message,
      title: `${userName} is at ${spotName}`,
      url: deepLink,
    });

    track('checkin_shared', {
      checkin_id: checkinId,
      spot_name: spotName,
      method: result.action === Share.sharedAction ? 'success' : 'dismissed',
    });

    return { success: result.action === Share.sharedAction };
  } catch (error) {
    console.error('Failed to share check-in:', error);
    track('checkin_share_failed', {
      checkin_id: checkinId,
      error: String(error),
    });
    return { success: false };
  }
}

/**
 * Share a spot
 */
export async function shareSpot(
  spotName: string,
  placeId: string,
  userName?: string
): Promise<{ success: boolean }> {
  const deepLink = createDeepLink('spot', { placeId });
  const message = userName
    ? `${userName} recommends checking out ${spotName} on ${APP_NAME}! ${deepLink}`
    : `Check out ${spotName} on ${APP_NAME}! ${deepLink}`;

  try {
    const result = await Share.share({
      message,
      title: spotName,
      url: deepLink,
    });

    track('spot_shared', {
      spot_name: spotName,
      place_id: placeId,
      method: result.action === Share.sharedAction ? 'success' : 'dismissed',
    });

    return { success: result.action === Share.sharedAction };
  } catch (error) {
    console.error('Failed to share spot:', error);
    track('spot_share_failed', {
      spot_name: spotName,
      error: String(error),
    });
    return { success: false };
  }
}

/**
 * Share user profile
 */
export async function shareProfile(
  userId: string,
  userName: string,
  handle: string
): Promise<{ success: boolean }> {
  const deepLink = createDeepLink('profile', { userId });
  const message = `Check out ${userName}'s profile on ${APP_NAME}! ${deepLink}`;

  try {
    const result = await Share.share({
      message,
      title: `${userName} on ${APP_NAME}`,
      url: deepLink,
    });

    track('profile_shared', {
      user_id: userId,
      handle,
      method: result.action === Share.sharedAction ? 'success' : 'dismissed',
    });

    return { success: result.action === Share.sharedAction };
  } catch (error) {
    console.error('Failed to share profile:', error);
    track('profile_share_failed', {
      user_id: userId,
      error: String(error),
    });
    return { success: false };
  }
}

/**
 * Copy referral link to clipboard
 */
export async function copyReferralLink(
  userId: string,
  handle?: string
): Promise<boolean> {
  try {
    const referralCode = generateReferralCode(userId, handle);
    const inviteLink = getInviteLink(referralCode);

    await Clipboard.setStringAsync(inviteLink);

    track('referral_link_copied', {
      referral_code: referralCode,
    });

    return true;
  } catch (error) {
    console.error('Failed to copy referral link:', error);
    return false;
  }
}

/**
 * Track referral signup (call this after successful signup)
 * Stores referral info for the new user and triggers referrer credit
 */
export async function trackReferralSignup(
  newUserId: string,
  referralCode?: string
): Promise<void> {
  if (!referralCode) return;

  track('referral_signup', {
    new_user_id: newUserId,
    referral_code: referralCode,
  });

  const fb = ensureFirebase();
  if (!fb) return;

  try {
    const db = fb.firestore();

    // Store referral info on the new user's profile
    await db.collection('users').doc(newUserId).set({
      referredBy: referralCode.toUpperCase(),
      referredAt: fb.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // Create a referral record for tracking and Cloud Function processing
    // Cloud Function should watch this collection to credit premium time
    await db.collection('referrals').add({
      referralCode: referralCode.toUpperCase(),
      newUserId,
      status: 'pending', // Will be updated to 'credited' by Cloud Function
      createdAt: fb.firestore.FieldValue.serverTimestamp(),
    });

    track('referral_recorded', {
      new_user_id: newUserId,
      referral_code: referralCode,
    });
  } catch (error) {
    console.error('Failed to track referral signup:', error);
  }
}

/**
 * Get invite statistics for a user
 */
export interface InviteStats {
  totalInvites: number;
  acceptedInvites: number;
  pendingInvites: number;
  premiumWeeksEarned: number;
}

export async function getInviteStats(userId: string): Promise<InviteStats> {
  const fb = ensureFirebase();
  if (!fb || !userId) {
    return {
      totalInvites: 0,
      acceptedInvites: 0,
      pendingInvites: 0,
      premiumWeeksEarned: 0,
    };
  }

  try {
    const db = fb.firestore();
    const referralCode = generateReferralCode(userId);

    // Query users who signed up with this referral code
    const referralsSnap = await db.collection('users')
      .where('referredBy', '==', referralCode)
      .get();

    const totalInvites = referralsSnap.size;
    let acceptedInvites = 0;

    // Count accepted invites (users who completed onboarding)
    referralsSnap.forEach((doc) => {
      const data = doc.data();
      if (data.onboardingComplete) {
        acceptedInvites++;
      }
    });

    // Each accepted invite = 1 week of premium
    const premiumWeeksEarned = acceptedInvites;

    return {
      totalInvites,
      acceptedInvites,
      pendingInvites: totalInvites - acceptedInvites,
      premiumWeeksEarned,
    };
  } catch (error) {
    console.error('Failed to get invite stats:', error);
    return {
      totalInvites: 0,
      acceptedInvites: 0,
      pendingInvites: 0,
      premiumWeeksEarned: 0,
    };
  }
}

/**
 * Create a shareable story card image URL
 * This generates a beautiful card for sharing to Instagram/Snapchat stories
 */
export function generateStoryCardUrl(
  spotName: string,
  photoUrl?: string,
  userName?: string
): string {
  // TODO: Implement with Cloud Function or Cloudinary
  // For now, return placeholder
  const params = new URLSearchParams({
    spot: spotName,
    photo: photoUrl || '',
    user: userName || '',
  });
  return `${WEB_URL}/story-card?${params.toString()}`;
}

export default {
  shareAppInvite,
  shareCheckin,
  shareSpot,
  shareProfile,
  copyReferralLink,
  trackReferralSignup,
  getInviteStats,
  generateStoryCardUrl,
  generateReferralCode,
  getInviteLink,
};
