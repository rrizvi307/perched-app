/**
 * Content Moderation Service
 *
 * Handles automated content moderation using pattern-based detection
 */

import { ensureFirebase } from './firebaseClient';
import { track } from './analytics';

export type ContentType = 'caption' | 'comment' | 'profile' | 'spot_name' | 'image';
export type ModerationAction = 'allow' | 'flag' | 'block' | 'review';
export type ViolationType =
  | 'spam'
  | 'profanity'
  | 'harassment'
  | 'explicit_content'
  | 'hate_speech'
  | 'promotion'
  | 'fake_location'
  | 'other';

interface ModerationResult {
  action: ModerationAction;
  violations: ViolationType[];
  confidence: number; // 0-100
  reason?: string;
}

interface FlaggedContent {
  id: string;
  contentType: ContentType;
  contentId: string;
  userId: string;
  content: string;
  violations: ViolationType[];
  autoFlagged: boolean;
  reportedBy?: string[];
  status: 'pending' | 'approved' | 'removed' | 'warned';
  reviewedBy?: string;
  reviewedAt?: number;
  createdAt: number;
}

// Profanity and explicit content patterns
const PROFANITY_PATTERNS = [
  /\b(fuck|shit|damn|bitch|asshole|bastard|crap|dick|pussy|cock|tits)\b/gi,
  /\b(whore|slut|cunt|fag|nigger|retard)\b/gi,
];

// Spam patterns
const SPAM_PATTERNS = [
  /\b(buy now|click here|limited time|act now|earn \$|make money|work from home)\b/gi,
  /\b(bitcoin|crypto|investment|trading|forex)\b.*\b(guaranteed|profit|returns)\b/gi,
  /(http|https):\/\/[^\s]+/gi, // URLs
  /\b\w{0,3}\d{3,}\w{0,3}\b/g, // Phone numbers
  /(.)\1{5,}/g, // Repeated characters (aaaaa)
];

// Harassment patterns
const HARASSMENT_PATTERNS = [
  /\b(kill yourself|kys|die|hang yourself|jump off)\b/gi,
  /\b(ugly|stupid|idiot|loser|pathetic)\b.*\b(you|ur|you're)\b/gi,
  /\b(hate|despise|disgusted)\b.*\b(you|ur)\b/gi,
];

// Hate speech patterns
const HATE_SPEECH_PATTERNS = [
  /\b(nigger|nigga|spic|chink|gook|kike|wetback|towelhead)\b/gi,
  /\b(fag|faggot|dyke|tranny)\b/gi,
  /\b(terrorist|jihad)\b.*\b(muslim|islam)\b/gi,
];

// Promotional patterns
const PROMOTIONAL_PATTERNS = [
  /\b(discount code|promo code|coupon|sale|50% off|free shipping)\b/gi,
  /\b(follow me|check out my|visit my|dm me)\b/gi,
  /\b(instagram|tiktok|youtube|onlyfans)\b.*\b(@|link)\b/gi,
];

/**
 * Moderate text content
 */
export function moderateText(
  content: string,
  contentType: ContentType
): ModerationResult {
  const violations: ViolationType[] = [];
  let maxConfidence = 0;

  // Check profanity
  for (const pattern of PROFANITY_PATTERNS) {
    if (pattern.test(content)) {
      violations.push('profanity');
      maxConfidence = Math.max(maxConfidence, 90);
      break;
    }
  }

  // Check spam
  for (const pattern of SPAM_PATTERNS) {
    if (pattern.test(content)) {
      violations.push('spam');
      maxConfidence = Math.max(maxConfidence, 85);
      break;
    }
  }

  // Check harassment
  for (const pattern of HARASSMENT_PATTERNS) {
    if (pattern.test(content)) {
      violations.push('harassment');
      maxConfidence = Math.max(maxConfidence, 95);
      break;
    }
  }

  // Check hate speech
  for (const HATE_SPEECH_PATTERN of HATE_SPEECH_PATTERNS) {
    if (HATE_SPEECH_PATTERN.test(content)) {
      violations.push('hate_speech');
      maxConfidence = Math.max(maxConfidence, 100);
      break;
    }
  }

  // Check promotional content
  for (const pattern of PROMOTIONAL_PATTERNS) {
    if (pattern.test(content)) {
      violations.push('promotion');
      maxConfidence = Math.max(maxConfidence, 75);
      break;
    }
  }

  // Check for excessive caps (spam indicator)
  const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length;
  if (capsRatio > 0.7 && content.length > 10) {
    if (!violations.includes('spam')) {
      violations.push('spam');
      maxConfidence = Math.max(maxConfidence, 70);
    }
  }

  // Determine action
  let action: ModerationAction = 'allow';

  if (violations.includes('hate_speech') || violations.includes('harassment')) {
    action = 'block';
  } else if (violations.includes('profanity')) {
    action = contentType === 'caption' ? 'flag' : 'review';
  } else if (violations.includes('spam') || violations.includes('promotion')) {
    action = 'flag';
  }

  return {
    action,
    violations,
    confidence: maxConfidence,
    reason: violations.length > 0 ? `Detected: ${violations.join(', ')}` : undefined,
  };
}

/**
 * Moderate image content (basic checks)
 */
export async function moderateImage(imageUrl: string): Promise<ModerationResult> {
  // In production, integrate with image moderation API
  // For now, return safe result
  return {
    action: 'allow',
    violations: [],
    confidence: 0,
  };
}

/**
 * Auto-flag content based on moderation result
 */
export async function autoFlagContent(
  contentType: ContentType,
  contentId: string,
  userId: string,
  content: string,
  moderationResult: ModerationResult
): Promise<{ success: boolean; flaggedContentId?: string }> {
  if (moderationResult.action === 'allow') {
    return { success: false };
  }

  try {
    const fb = ensureFirebase();
    if (!fb) return { success: false };

    const db = fb.firestore();

    const flaggedContent: Omit<FlaggedContent, 'id'> = {
      contentType,
      contentId,
      userId,
      content,
      violations: moderationResult.violations,
      autoFlagged: true,
      status: moderationResult.action === 'block' ? 'removed' : 'pending',
      createdAt: Date.now(),
    };

    const docRef = await db.collection('flaggedContent').add(flaggedContent);

    // If blocked, delete the content
    if (moderationResult.action === 'block') {
      await deleteContent(contentType, contentId);

      // Warn user
      await warnUser(userId, moderationResult.violations);
    }

    track('content_auto_flagged', {
      content_type: contentType,
      violations: moderationResult.violations.join(','),
      action: moderationResult.action,
      confidence: moderationResult.confidence,
    });

    return { success: true, flaggedContentId: docRef.id };
  } catch (error) {
    console.error('Failed to auto-flag content:', error);
    return { success: false };
  }
}

/**
 * Check for fake GPS location (detect spoofing)
 */
export function detectFakeLocation(
  location: { lat: number; lng: number },
  previousLocations: Array<{ lat: number; lng: number; timestamp: number }>
): { isSuspicious: boolean; reason?: string } {
  if (previousLocations.length < 2) {
    return { isSuspicious: false };
  }

  // Get last location
  const last = previousLocations[previousLocations.length - 1];
  const timeDiff = Date.now() - last.timestamp;

  // Calculate distance
  const distance = haversineDistance(
    location.lat,
    location.lng,
    last.lat,
    last.lng
  );

  // Impossible speed check (e.g., traveled 1000km in 1 minute)
  const speedKmH = (distance / (timeDiff / 1000 / 60 / 60));

  if (speedKmH > 800) {
    // Faster than airplane
    return {
      isSuspicious: true,
      reason: `Impossible travel speed: ${Math.round(speedKmH)}km/h`,
    };
  }

  // Check for rapid location jumping
  const recentLocations = previousLocations.slice(-5);
  const uniqueCoords = new Set(
    recentLocations.map((l: any) => `${l.lat.toFixed(2)},${l.lng.toFixed(2)}`)
  );

  if (uniqueCoords.size >= 4 && previousLocations.length >= 4) {
    const timeSpan = Date.now() - recentLocations[0].timestamp;

    // 4+ different locations in less than 10 minutes = suspicious
    if (timeSpan < 10 * 60 * 1000) {
      return {
        isSuspicious: true,
        reason: 'Rapid location jumping detected',
      };
    }
  }

  return { isSuspicious: false };
}

/**
 * Get flagged content for review
 */
export async function getFlaggedContent(
  status: FlaggedContent['status'] = 'pending',
  limit: number = 50
): Promise<FlaggedContent[]> {
  try {
    const fb = ensureFirebase();
    if (!fb) return [];

    const db = fb.firestore();

    const snapshot = await db
      .collection('flaggedContent')
      .where('status', '==', status)
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get();

    return snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data(),
    } as FlaggedContent));
  } catch (error) {
    console.error('Failed to get flagged content:', error);
    return [];
  }
}

/**
 * Review flagged content (moderator action)
 */
export async function reviewFlaggedContent(
  flaggedContentId: string,
  action: 'approve' | 'remove' | 'warn',
  reviewerId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const fb = ensureFirebase();
    if (!fb) return { success: false, error: 'Firebase not initialized' };

    const db = fb.firestore();

    const flaggedDoc = await db.collection('flaggedContent').doc(flaggedContentId).get();

    if (!flaggedDoc.exists) {
      return { success: false, error: 'Flagged content not found' };
    }

    const flagged = { id: flaggedDoc.id, ...flaggedDoc.data() } as FlaggedContent;

    let newStatus: FlaggedContent['status'] = 'approved';

    if (action === 'remove') {
      await deleteContent(flagged.contentType, flagged.contentId);
      newStatus = 'removed';

      // Ban user if multiple violations
      await checkAndBanUser(flagged.userId);
    } else if (action === 'warn') {
      await warnUser(flagged.userId, flagged.violations);
      newStatus = 'warned';
    }

    await db.collection('flaggedContent').doc(flaggedContentId).update({
      status: newStatus,
      reviewedBy: reviewerId,
      reviewedAt: Date.now(),
    });

    track('content_reviewed', {
      flagged_content_id: flaggedContentId,
      action,
      reviewer_id: reviewerId,
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to review flagged content:', error);
    return { success: false, error: 'Review failed' };
  }
}

// Helper functions

async function deleteContent(contentType: ContentType, contentId: string): Promise<void> {
  try {
    const fb = ensureFirebase();
    if (!fb) return;

    const db = fb.firestore();

    const collectionMap: Record<ContentType, string> = {
      caption: 'checkins',
      comment: 'comments',
      profile: 'users',
      spot_name: 'spots',
      image: 'images',
    };

    const collection = collectionMap[contentType];
    if (!collection) return;

    // Mark as deleted instead of hard delete
    await db.collection(collection).doc(contentId).update({
      deleted: true,
      deletedAt: Date.now(),
      deletedReason: 'moderation',
    });
  } catch (error) {
    console.error('Failed to delete content:', error);
  }
}

async function warnUser(userId: string, violations: ViolationType[]): Promise<void> {
  try {
    const fb = ensureFirebase();
    if (!fb) return;

    const db = fb.firestore();

    await db.collection('userWarnings').add({
      userId,
      violations,
      timestamp: Date.now(),
    });

    // Increment warning count
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      const warningCount = (userDoc.data()?.warningCount || 0) + 1;
      await userRef.update({ warningCount });
    }

    track('user_warned', {
      user_id: userId,
      violations: violations.join(','),
    });
  } catch (error) {
    console.error('Failed to warn user:', error);
  }
}

async function checkAndBanUser(userId: string): Promise<void> {
  try {
    const fb = ensureFirebase();
    if (!fb) return;

    const db = fb.firestore();

    // Get user warnings
    const warningsSnapshot = await db
      .collection('userWarnings')
      .where('userId', '==', userId)
      .get();

    const warningCount = warningsSnapshot.size;

    // Ban if 3+ warnings
    if (warningCount >= 3) {
      await db.collection('users').doc(userId).update({
        banned: true,
        bannedAt: Date.now(),
        bannedReason: 'Multiple violations',
      });

      track('user_banned', {
        user_id: userId,
        warning_count: warningCount,
      });
    }
  } catch (error) {
    console.error('Failed to check/ban user:', error);
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
  moderateText,
  moderateImage,
  autoFlagContent,
  detectFakeLocation,
  getFlaggedContent,
  reviewFlaggedContent,
};
