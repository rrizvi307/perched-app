/**
 * Trust & Safety Service
 *
 * Handles user reporting, blocking, and safety features
 */

import { ensureFirebase } from './firebaseClient';
import { track } from './analytics';
import { moderateText } from './contentModeration';

export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'inappropriate_content'
  | 'fake_profile'
  | 'fake_check_in'
  | 'copyright'
  | 'impersonation'
  | 'other';

export type ReportableType = 'user' | 'checkin' | 'comment' | 'spot';

interface Report {
  id: string;
  reporterId: string;
  reportedType: ReportableType;
  reportedId: string;
  reportedUserId?: string;
  reason: ReportReason;
  description?: string;
  evidence?: string[]; // URLs to screenshots
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assignedTo?: string;
  resolution?: string;
  createdAt: number;
  updatedAt: number;
  resolvedAt?: number;
}

interface BlockedUser {
  id: string;
  blockerId: string;
  blockedId: string;
  reason?: string;
  createdAt: number;
}

interface SafetySettings {
  userId: string;
  allowMessagesFromStrangers: boolean;
  showProfileToStrangers: boolean;
  allowTagging: boolean;
  showLocationHistory: boolean;
  requireFollowToMessage: boolean;
  mutedUsers: string[];
  blockedUsers: string[];
  updatedAt: number;
}

/**
 * Submit a report
 */
export async function submitReport(
  reporterId: string,
  reportedType: ReportableType,
  reportedId: string,
  reason: ReportReason,
  description?: string,
  evidence?: string[]
): Promise<{ success: boolean; reportId?: string; error?: string }> {
  try {
    const fb = ensureFirebase();
    if (!fb) return { success: false, error: 'Firebase not initialized' };

    const db = fb.firestore();

    // Check if already reported by this user
    const existingReport = await db
      .collection('reports')
      .where('reporterId', '==', reporterId)
      .where('reportedType', '==', reportedType)
      .where('reportedId', '==', reportedId)
      .where('status', 'in', ['pending', 'reviewing'])
      .get();

    if (!existingReport.empty) {
      return { success: false, error: 'You have already reported this' };
    }

    // Determine priority
    let priority: Report['priority'] = 'medium';

    if (reason === 'harassment' || reason === 'impersonation') {
      priority = 'high';
    } else if (reason === 'spam' || reason === 'fake_profile') {
      priority = 'low';
    }

    // Auto-escalate if description contains severe keywords
    if (description) {
      const modResult = moderateText(description, 'caption');
      if (modResult.violations.includes('hate_speech') || modResult.violations.includes('harassment')) {
        priority = 'urgent';
      }
    }

    // Get reported user ID
    let reportedUserId: string | undefined;

    if (reportedType === 'user') {
      reportedUserId = reportedId;
    } else if (reportedType === 'checkin' || reportedType === 'comment') {
      const doc = await db.collection(reportedType === 'checkin' ? 'checkins' : 'comments').doc(reportedId).get();
      if (doc.exists) {
        reportedUserId = doc.data()?.userId;
      }
    }

    const report: Omit<Report, 'id'> = {
      reporterId,
      reportedType,
      reportedId,
      reportedUserId,
      reason,
      description,
      evidence,
      status: 'pending',
      priority,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const docRef = await db.collection('reports').add(report);

    // Auto-action for certain reports
    if (priority === 'urgent') {
      await autoActionReport(docRef.id);
    }

    track('report_submitted', {
      reporter_id: reporterId,
      reported_type: reportedType,
      reason,
      priority,
    });

    return { success: true, reportId: docRef.id };
  } catch (error) {
    console.error('Failed to submit report:', error);
    return { success: false, error: 'Failed to submit report' };
  }
}

/**
 * Block a user
 */
export async function blockUser(
  blockerId: string,
  blockedId: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (blockerId === blockedId) {
      return { success: false, error: 'Cannot block yourself' };
    }

    const fb = ensureFirebase();
    if (!fb) return { success: false, error: 'Firebase not initialized' };

    const db = fb.firestore();

    // Check if already blocked
    const existingBlock = await db
      .collection('blockedUsers')
      .where('blockerId', '==', blockerId)
      .where('blockedId', '==', blockedId)
      .get();

    if (!existingBlock.empty) {
      return { success: false, error: 'User already blocked' };
    }

    const block: Omit<BlockedUser, 'id'> = {
      blockerId,
      blockedId,
      reason,
      createdAt: Date.now(),
    };

    await db.collection('blockedUsers').add(block);

    // Update safety settings
    const settingsRef = db.collection('safetySettings').doc(blockerId);
    const settingsDoc = await settingsRef.get();

    if (settingsDoc.exists) {
      await settingsRef.update({
        blockedUsers: fb.firestore.FieldValue.arrayUnion(blockedId),
        updatedAt: Date.now(),
      });
    } else {
      const defaultSettings = getDefaultSafetySettings(blockerId);
      defaultSettings.blockedUsers = [blockedId];
      await settingsRef.set(defaultSettings);
    }

    // Remove from friends if applicable
    await db.collection('friends').doc(blockerId).update({
      friendIds: fb.firestore.FieldValue.arrayRemove(blockedId),
    });

    await db.collection('friends').doc(blockedId).update({
      friendIds: fb.firestore.FieldValue.arrayRemove(blockerId),
    });

    track('user_blocked', {
      blocker_id: blockerId,
      blocked_id: blockedId,
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to block user:', error);
    return { success: false, error: 'Failed to block user' };
  }
}

/**
 * Unblock a user
 */
export async function unblockUser(
  blockerId: string,
  blockedId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const fb = ensureFirebase();
    if (!fb) return { success: false, error: 'Firebase not initialized' };

    const db = fb.firestore();

    // Find and delete block
    const blockSnapshot = await db
      .collection('blockedUsers')
      .where('blockerId', '==', blockerId)
      .where('blockedId', '==', blockedId)
      .get();

    if (!blockSnapshot.empty) {
      await Promise.all(blockSnapshot.docs.map((doc: any) => doc.ref.delete()));
    }

    // Update safety settings
    await db.collection('safetySettings').doc(blockerId).update({
      blockedUsers: fb.firestore.FieldValue.arrayRemove(blockedId),
      updatedAt: Date.now(),
    });

    track('user_unblocked', {
      blocker_id: blockerId,
      blocked_id: blockedId,
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to unblock user:', error);
    return { success: false, error: 'Failed to unblock user' };
  }
}

/**
 * Get blocked users list
 */
export async function getBlockedUsers(userId: string): Promise<string[]> {
  try {
    const fb = ensureFirebase();
    if (!fb) return [];

    const db = fb.firestore();

    const settingsDoc = await db.collection('safetySettings').doc(userId).get();

    if (settingsDoc.exists) {
      return settingsDoc.data()?.blockedUsers || [];
    }

    return [];
  } catch (error) {
    console.error('Failed to get blocked users:', error);
    return [];
  }
}

/**
 * Check if user is blocked
 */
export async function isUserBlocked(
  userId: string,
  targetUserId: string
): Promise<boolean> {
  const blockedUsers = await getBlockedUsers(userId);
  return blockedUsers.includes(targetUserId);
}

/**
 * Get safety settings
 */
export async function getSafetySettings(userId: string): Promise<SafetySettings> {
  try {
    const fb = ensureFirebase();
    if (!fb) return getDefaultSafetySettings(userId);

    const db = fb.firestore();

    const doc = await db.collection('safetySettings').doc(userId).get();

    if (doc.exists) {
      return { userId, ...doc.data() } as SafetySettings;
    }

    return getDefaultSafetySettings(userId);
  } catch (error) {
    console.error('Failed to get safety settings:', error);
    return getDefaultSafetySettings(userId);
  }
}

/**
 * Update safety settings
 */
export async function updateSafetySettings(
  userId: string,
  updates: Partial<Omit<SafetySettings, 'userId' | 'updatedAt'>>
): Promise<{ success: boolean; error?: string }> {
  try {
    const fb = ensureFirebase();
    if (!fb) return { success: false, error: 'Firebase not initialized' };

    const db = fb.firestore();

    await db.collection('safetySettings').doc(userId).set(
      {
        ...updates,
        updatedAt: Date.now(),
      },
      { merge: true }
    );

    track('safety_settings_updated', {
      user_id: userId,
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to update safety settings:', error);
    return { success: false, error: 'Failed to update settings' };
  }
}

/**
 * Get reports for review (moderators)
 */
export async function getReportsForReview(
  status: Report['status'] = 'pending',
  priority?: Report['priority'],
  limit: number = 50
): Promise<Report[]> {
  try {
    const fb = ensureFirebase();
    if (!fb) return [];

    const db = fb.firestore();

    let query = db
      .collection('reports')
      .where('status', '==', status)
      .orderBy('priority', 'desc')
      .orderBy('createdAt', 'asc');

    if (priority) {
      query = query.where('priority', '==', priority);
    }

    const snapshot = await query.limit(limit).get();

    return snapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data(),
    } as Report));
  } catch (error) {
    console.error('Failed to get reports:', error);
    return [];
  }
}

/**
 * Assign report to moderator
 */
export async function assignReport(
  reportId: string,
  moderatorId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const fb = ensureFirebase();
    if (!fb) return { success: false, error: 'Firebase not initialized' };

    const db = fb.firestore();

    await db.collection('reports').doc(reportId).update({
      assignedTo: moderatorId,
      status: 'reviewing',
      updatedAt: Date.now(),
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to assign report:', error);
    return { success: false, error: 'Failed to assign report' };
  }
}

/**
 * Resolve report
 */
export async function resolveReport(
  reportId: string,
  resolution: string,
  action: 'dismiss' | 'remove_content' | 'ban_user' | 'warn_user'
): Promise<{ success: boolean; error?: string }> {
  try {
    const fb = ensureFirebase();
    if (!fb) return { success: false, error: 'Firebase not initialized' };

    const db = fb.firestore();

    const reportDoc = await db.collection('reports').doc(reportId).get();

    if (!reportDoc.exists) {
      return { success: false, error: 'Report not found' };
    }

    const report = { id: reportDoc.id, ...reportDoc.data() } as Report;

    // Execute action
    if (action === 'remove_content' && report.reportedType !== 'user') {
      // Mark content as deleted
      const collection = report.reportedType === 'checkin' ? 'checkins' : 'comments';
      await db.collection(collection).doc(report.reportedId).update({
        deleted: true,
        deletedAt: Date.now(),
        deletedReason: 'reported',
      });
    } else if (action === 'ban_user' && report.reportedUserId) {
      await db.collection('users').doc(report.reportedUserId).update({
        banned: true,
        bannedAt: Date.now(),
        bannedReason: report.reason,
      });
    } else if (action === 'warn_user' && report.reportedUserId) {
      await db.collection('userWarnings').add({
        userId: report.reportedUserId,
        reason: report.reason,
        reportId,
        timestamp: Date.now(),
      });
    }

    // Update report
    await db.collection('reports').doc(reportId).update({
      status: action === 'dismiss' ? 'dismissed' : 'resolved',
      resolution,
      resolvedAt: Date.now(),
      updatedAt: Date.now(),
    });

    track('report_resolved', {
      report_id: reportId,
      action,
      reason: report.reason,
    });

    return { success: true };
  } catch (error) {
    console.error('Failed to resolve report:', error);
    return { success: false, error: 'Failed to resolve report' };
  }
}

// Helper functions

function getDefaultSafetySettings(userId: string): SafetySettings {
  return {
    userId,
    allowMessagesFromStrangers: true,
    showProfileToStrangers: true,
    allowTagging: true,
    showLocationHistory: true,
    requireFollowToMessage: false,
    mutedUsers: [],
    blockedUsers: [],
    updatedAt: Date.now(),
  };
}

async function autoActionReport(reportId: string): Promise<void> {
  try {
    // For urgent reports, automatically hide content and escalate
    const fb = ensureFirebase();
    if (!fb) return;

    const db = fb.firestore();

    const reportDoc = await db.collection('reports').doc(reportId).get();

    if (!reportDoc.exists) return;

    const report = reportDoc.data() as Report;

    // Hide content immediately if urgent
    if (report.reportedType !== 'user') {
      const collection = report.reportedType === 'checkin' ? 'checkins' : 'comments';
      await db.collection(collection).doc(report.reportedId).update({
        hidden: true,
        hiddenAt: Date.now(),
        hiddenReason: 'urgent_report',
      });
    }

    // Notify moderators
    // In production, send push notification to on-call moderator
  } catch (error) {
    console.error('Failed to auto-action report:', error);
  }
}

export default {
  submitReport,
  blockUser,
  unblockUser,
  getBlockedUsers,
  isUserBlocked,
  getSafetySettings,
  updateSafetySettings,
  getReportsForReview,
  assignReport,
  resolveReport,
};
