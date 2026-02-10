import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserStats } from './gamification';
import { track } from './analytics';

const NOTIF_PREFS_KEY = '@perched_notification_prefs';
const LAST_NOTIF_KEY = '@perched_last_notification';

export interface NotificationPreferences {
  enabled: boolean;
  streakReminders: boolean;
  friendActivity: boolean;
  nearbySpots: boolean;
  achievements: boolean;
  weeklyRecap: boolean;
}

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function buildDateTrigger(date: Date): Notifications.NotificationTriggerInput {
  return {
    type: Notifications.SchedulableTriggerInputTypes.DATE,
    date,
  };
}

/**
 * Initialize push notifications
 */
export async function initPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission denied');
      return null;
    }

    // Get push token
    const token = (await Notifications.getExpoPushTokenAsync()).data;

    track('push_notification_enabled', {
      platform: Platform.OS,
    });

    return token;
  } catch (error) {
    console.error('Failed to get push token:', error);
    return null;
  }
}

/**
 * Get notification preferences
 */
export async function getNotificationPreferences(): Promise<NotificationPreferences> {
  try {
    const json = await AsyncStorage.getItem(NOTIF_PREFS_KEY);
    if (json) {
      return JSON.parse(json);
    }
  } catch (error) {
    console.error('Failed to load notification preferences:', error);
  }

  // Defaults
  return {
    enabled: true,
    streakReminders: true,
    friendActivity: true,
    nearbySpots: true,
    achievements: true,
    weeklyRecap: true,
  };
}

/**
 * Update notification preferences
 */
export async function updateNotificationPreferences(
  prefs: Partial<NotificationPreferences>
): Promise<void> {
  const current = await getNotificationPreferences();
  const updated = { ...current, ...prefs };
  await AsyncStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(updated));

  track('notifications_toggled', {
    enabled: updated.enabled,
  });
}

/**
 * Schedule streak reminder notification
 */
export async function scheduleStreakReminder(): Promise<void> {
  const prefs = await getNotificationPreferences();
  if (!prefs.enabled || !prefs.streakReminders) return;

  const stats = await getUserStats();
  if (stats.streakDays === 0) return; // No streak to save

  // Cancel existing reminders
  await Notifications.cancelAllScheduledNotificationsAsync();

  // Schedule for 8pm today if user hasn't checked in
  const now = new Date();
  const reminderTime = new Date();
  reminderTime.setHours(20, 0, 0, 0);

  // If it's already past 8pm, schedule for tomorrow
  if (now > reminderTime) {
    reminderTime.setDate(reminderTime.getDate() + 1);
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `🔥 ${stats.streakDays} day streak!`,
      body: "Don't break your streak! Check in before midnight.",
      data: { type: 'streak_reminder' },
    },
    trigger: buildDateTrigger(reminderTime),
  });

  track('notification_scheduled', {
    type: 'streak_reminder',
    streak_days: stats.streakDays,
  });
}

/**
 * Send local notification for achievement unlock
 */
export async function notifyAchievementUnlocked(
  achievementName: string,
  achievementIcon: string
): Promise<void> {
  const prefs = await getNotificationPreferences();
  if (!prefs.enabled || !prefs.achievements) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${achievementIcon} Achievement Unlocked!`,
      body: `You earned "${achievementName}"`,
      data: { type: 'achievement' },
    },
    trigger: null, // Send immediately
  });

  track('notification_sent', {
    type: 'achievement',
    achievement_name: achievementName,
  });
}

/**
 * Send friend activity notification
 */
export async function notifyFriendActivity(
  friendName: string,
  spotName: string,
  type: 'checkin' | 'nearby'
): Promise<void> {
  const prefs = await getNotificationPreferences();
  if (!prefs.enabled || !prefs.friendActivity) return;

  // Rate limit: Only send one notification per hour
  const lastNotif = await AsyncStorage.getItem(LAST_NOTIF_KEY);
  if (lastNotif) {
    const lastTime = parseInt(lastNotif, 10);
    if (Date.now() - lastTime < 60 * 60 * 1000) {
      return; // Skip if less than 1 hour ago
    }
  }

  await AsyncStorage.setItem(LAST_NOTIF_KEY, Date.now().toString());

  const message =
    type === 'checkin'
      ? `${friendName} just checked in at ${spotName}`
      : `${friendName} is nearby at ${spotName}`;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '👋 Friend Activity',
      body: message,
      data: { type: 'friend_activity' },
    },
    trigger: null,
  });

  track('notification_sent', {
    type: 'friend_activity',
    subtype: type,
  });
}

/**
 * Send weekly recap notification
 */
export async function scheduleWeeklyRecap(): Promise<void> {
  const prefs = await getNotificationPreferences();
  if (!prefs.enabled || !prefs.weeklyRecap) return;

  // Schedule for Sunday at 6pm
  const sunday = new Date();
  sunday.setDate(sunday.getDate() + ((7 - sunday.getDay()) % 7));
  sunday.setHours(18, 0, 0, 0);

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '📊 Your Week on Perched',
      body: 'Check out your weekly recap and see where your friends have been!',
      data: { type: 'weekly_recap' },
    },
    trigger: buildDateTrigger(sunday),
  });

  track('notification_scheduled', {
    type: 'weekly_recap',
  });
}

/**
 * Smart notification: Suggest check-in based on patterns
 */
export async function sendSmartCheckInSuggestion(spotName: string, reason: string): Promise<void> {
  const prefs = await getNotificationPreferences();
  if (!prefs.enabled) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '✨ Spot Suggestion',
      body: `${reason} - Try checking in at ${spotName}!`,
      data: { type: 'smart_suggestion', spot: spotName },
    },
    trigger: null,
  });

  track('notification_sent', {
    type: 'smart_suggestion',
    spot_name: spotName,
    reason,
  });
}

/**
 * Handle notification received/clicked
 */
export function addNotificationReceivedListener(
  handler: (notification: Notifications.Notification) => void
) {
  return Notifications.addNotificationReceivedListener(handler);
}

export function addNotificationResponseListener(
  handler: (response: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as Record<string, unknown> | null | undefined;
    const rawType = data?.type;
    const type =
      typeof rawType === 'string' || typeof rawType === 'number' || typeof rawType === 'boolean'
        ? rawType
        : null;
    track('notification_opened', {
      type,
    });
    handler(response);
  });
}

/**
 * ADVANCED: Optimal notification timing based on user behavior
 */
export async function getOptimalNotificationHour(userId: string): Promise<number> {
  try {
    // Import here to avoid circular dependency
    const { getUserPreferences } = await import('./recommendations');
    const userPrefs = await getUserPreferences(userId);

    if (userPrefs.checkinTimes.length > 0) {
      const avgHour =
        userPrefs.checkinTimes.reduce((a: number, b: number) => a + b, 0) /
        userPrefs.checkinTimes.length;
      return Math.round(avgHour);
    }

    return 14; // Default 2 PM
  } catch (error) {
    console.error('Failed to get optimal notification hour:', error);
    return 14;
  }
}

/**
 * ADVANCED: Check for friends nearby with smart detection
 */
export async function checkAndNotifyFriendsNearby(
  userId: string,
  userLocation: { lat: number; lng: number }
): Promise<void> {
  try {
    const prefs = await getNotificationPreferences();
    if (!prefs.enabled || !prefs.friendActivity) return;

    // Rate limit: only check once per hour
    const lastCheckKey = `@last_friend_check_${userId}`;
    const lastCheck = await AsyncStorage.getItem(lastCheckKey);
    if (lastCheck) {
      const lastTime = parseInt(lastCheck, 10);
      if (Date.now() - lastTime < 60 * 60 * 1000) return;
    }

    await AsyncStorage.setItem(lastCheckKey, Date.now().toString());

    // Import firebaseClient to check for nearby friends
    const { ensureFirebase, getUserFriendsCached } = await import('./firebaseClient');
    const fb = ensureFirebase();
    if (!fb) return;

    const db = fb.firestore();

    // Get user's friends from canonical user profile relation.
    const friendIds = await getUserFriendsCached(userId, 60_000);
    if (friendIds.length === 0) return;

    // Get recent check-ins from friends (last 2 hours)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const since = fb.firestore.Timestamp.fromDate(twoHoursAgo);
    const snapshots = await Promise.all(
      friendIds.slice(0, 50).reduce<string[][]>((batches, friendId, index) => {
        const batchIndex = Math.floor(index / 10);
        if (!batches[batchIndex]) batches[batchIndex] = [];
        batches[batchIndex].push(friendId);
        return batches;
      }, []).map((batch) =>
        db
          .collection('checkins')
          .where('userId', 'in', batch)
          .where('createdAt', '>=', since)
          .get()
      )
    );

    // Calculate distances
    const nearbyFriends: Array<{ name: string; spotName: string; distance: number }> = [];
    snapshots.forEach((checkinsSnapshot) => {
      checkinsSnapshot.forEach((doc: any) => {
        const data = doc.data();
        const spotLatLng = data.spotLatLng || data.location;

        if (spotLatLng) {
          const distance = haversineDistance(
            userLocation.lat,
            userLocation.lng,
            spotLatLng.lat,
            spotLatLng.lng
          );

          if (distance <= 2) {
            // Within 2km
            nearbyFriends.push({
              name: data.userName || 'A friend',
              spotName: data.spotName || 'a nearby spot',
              distance,
            });
          }
        }
      });
    });

    if (nearbyFriends.length > 0) {
      const friend = nearbyFriends.sort((a, b) => a.distance - b.distance)[0];
      await notifyFriendActivity(friend.name, friend.spotName, 'nearby');
    }
  } catch (error) {
    console.error('Failed to check friends nearby:', error);
  }
}

/**
 * ADVANCED: Send trending spot alert
 */
export async function notifyTrendingSpot(
  spotName: string,
  checkinCount: number
): Promise<void> {
  const prefs = await getNotificationPreferences();
  if (!prefs.enabled || !prefs.nearbySpots) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🔥 Spot Trending',
      body: `${spotName} is buzzing! ${checkinCount} check-ins today.`,
      data: { type: 'trending', spot: spotName },
    },
    trigger: null,
  });

  track('notification_sent', {
    type: 'trending_spot',
    spot_name: spotName,
    checkin_count: checkinCount,
  });
}

/**
 * ADVANCED: Notification analytics tracking
 */
export async function trackNotificationEngagement(
  notificationType: string,
  action: 'sent' | 'opened' | 'dismissed'
): Promise<void> {
  try {
    const key = `@notif_analytics_${notificationType}_${action}`;
    const countStr = await AsyncStorage.getItem(key);
    const count = countStr ? parseInt(countStr, 10) : 0;
    await AsyncStorage.setItem(key, (count + 1).toString());

    track(`notification_${action}`, {
      type: notificationType,
      count: count + 1,
    });
  } catch (error) {
    console.error('Failed to track notification engagement:', error);
  }
}

/**
 * ADVANCED: Get notification engagement stats
 */
export async function getNotificationStats(): Promise<{
  [type: string]: { sent: number; opened: number; openRate: number };
}> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const analyticsKeys = keys.filter(k => k.includes('@notif_analytics_'));

    const stats: { [type: string]: { sent: number; opened: number; openRate: number } } = {};

    for (const key of analyticsKeys) {
      const parts = key.split('_');
      if (parts.length >= 4) {
        const type = parts[2];
        const action = parts[3];
        const countStr = await AsyncStorage.getItem(key);
        const count = countStr ? parseInt(countStr, 10) : 0;

        if (!stats[type]) {
          stats[type] = { sent: 0, opened: 0, openRate: 0 };
        }

        if (action === 'sent') stats[type].sent = count;
        if (action === 'opened') stats[type].opened = count;
      }
    }

    // Calculate open rates
    Object.keys(stats).forEach(type => {
      if (stats[type].sent > 0) {
        stats[type].openRate = (stats[type].opened / stats[type].sent) * 100;
      }
    });

    return stats;
  } catch (error) {
    console.error('Failed to get notification stats:', error);
    return {};
  }
}

// Helper function
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
  initPushNotifications,
  getNotificationPreferences,
  updateNotificationPreferences,
  scheduleStreakReminder,
  notifyAchievementUnlocked,
  notifyFriendActivity,
  scheduleWeeklyRecap,
  sendSmartCheckInSuggestion,
  addNotificationReceivedListener,
  addNotificationResponseListener,
  // Advanced features
  getOptimalNotificationHour,
  checkAndNotifyFriendsNearby,
  notifyTrendingSpot,
  trackNotificationEngagement,
  getNotificationStats,
};
