import { clearManagedNotifications, ensureNotificationHandlerConfigured, initPushNotifications } from './smartNotifications';

export async function registerForPushNotificationsAsync() {
  return initPushNotifications();
}

export async function clearNotificationHandlers() {
  ensureNotificationHandlerConfigured();
  await clearManagedNotifications();
}
