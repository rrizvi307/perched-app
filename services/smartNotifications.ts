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
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

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
    trigger: reminderTime,
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
    trigger: sunday,
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
    track('notification_opened', {
      type: response.notification.request.content.data?.type,
    });
    handler(response);
  });
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
};
