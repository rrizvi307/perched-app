import { Platform } from 'react-native';

export function gapStyle(value: number) {
  if (Platform.OS === 'web') {
    return { rowGap: value, columnGap: value };
  }
  return { gap: value };
}
