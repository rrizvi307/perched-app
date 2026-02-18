import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

export async function safeImpact(
  style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light
): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Haptics.impactAsync(style);
  } catch {}
}

export async function safeNotification(
  type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success
): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Haptics.notificationAsync(type);
  } catch {}
}
