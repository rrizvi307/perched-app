import { Share, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { track } from './analytics';
import { updateUserRemote } from './firebaseClient';

const APP_NAME = 'Perched';
const APP_STORE_URL = 'https://apps.apple.com/app/perched'; // TODO: Replace with actual
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.perched'; // TODO: Replace
const WEB_URL = 'https://perched.app'; // TODO: Replace with actual domain

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
 */
export function getInviteLink(referralCode: string): string {
  // TODO: Implement branch.io or Firebase Dynamic Links for proper attribution
  // For now, use simple query param
  const baseUrl = Platform.OS === 'ios' ? APP_STORE_URL : PLAY_STORE_URL;
  return `${baseUrl}?ref=${referralCode}`;
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
  // TODO: Implement deep link to check-in detail
  const deepLink = `${WEB_URL}/checkin/${checkinId}`;
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
  const deepLink = `${WEB_URL}/spot/${placeId}`;
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
  const deepLink = `${WEB_URL}/@${handle}`;
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

  // TODO: Credit referrer with premium time
  // This should be done in Cloud Functions for security
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
  // TODO: Implement with Firestore queries
  // For now, return mock data
  return {
    totalInvites: 0,
    acceptedInvites: 0,
    pendingInvites: 0,
    premiumWeeksEarned: 0,
  };
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
