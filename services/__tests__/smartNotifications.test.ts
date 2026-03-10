import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { track } from '../analytics';
import { getUserStats } from '../gamification';
import { scheduleStreakReminder, scheduleWeeklyRecap } from '../smartNotifications';

jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: {
    DATE: 'date',
  },
  scheduleNotificationAsync: jest.fn(async () => 'new-notification-id'),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[test]' })),
}));

jest.mock('react-native', () => ({
  Platform: {
    OS: 'ios',
    Version: '18.0',
  },
}));

jest.mock('../gamification', () => ({
  getUserStats: jest.fn(async () => ({ streakDays: 0 })),
}));

describe('smartNotifications managed scheduling', () => {
  const storage = new Map<string, string>();
  const asyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
  const mockedNotifications = Notifications as jest.Mocked<typeof Notifications>;
  const mockedGetUserStats = getUserStats as jest.MockedFunction<typeof getUserStats>;
  const mockedTrack = track as jest.MockedFunction<typeof track>;

  beforeEach(() => {
    jest.clearAllMocks();
    storage.clear();
    asyncStorage.getItem.mockImplementation(async (key: string) => storage.get(key) ?? null);
    asyncStorage.setItem.mockImplementation(async (key: string, value: string) => {
      storage.set(key, value);
    });
  });

  it('replaces existing streak reminder schedule id when rescheduling', async () => {
    storage.set(
      '@perched_scheduled_notification_ids',
      JSON.stringify({ streak_reminder: 'old-streak-id' }),
    );
    mockedGetUserStats.mockResolvedValue({ streakDays: 6 } as any);

    await scheduleStreakReminder();

    expect(mockedNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('old-streak-id');
    expect(mockedNotifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(storage.get('@perched_scheduled_notification_ids')).toBe(
      JSON.stringify({ streak_reminder: 'new-notification-id' }),
    );
    expect(mockedTrack).toHaveBeenCalledWith(
      'notification_scheduled',
      expect.objectContaining({ type: 'streak_reminder', streak_days: 6 }),
    );
  });

  it('cancels weekly recap when notifications are disabled and does not schedule new ones', async () => {
    storage.set(
      '@perched_notification_prefs',
      JSON.stringify({
        enabled: false,
        streakReminders: true,
        friendActivity: true,
        nearbySpots: true,
        achievements: true,
        weeklyRecap: true,
      }),
    );
    storage.set(
      '@perched_scheduled_notification_ids',
      JSON.stringify({ weekly_recap: 'existing-weekly-id' }),
    );

    await scheduleWeeklyRecap();

    expect(mockedNotifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('existing-weekly-id');
    expect(mockedNotifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(storage.get('@perched_scheduled_notification_ids')).toBe(JSON.stringify({}));
  });
});
