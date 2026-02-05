import { View, Text, StyleSheet } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';

interface StreakBadgeProps {
  days: number;
  size?: 'small' | 'medium' | 'large';
}

export function StreakBadge({ days, size = 'medium' }: StreakBadgeProps) {
  const primary = useThemeColor({}, 'primary');
  const text = useThemeColor({}, 'text');
  const surface = useThemeColor({}, 'surface');

  const sizeMap = {
    small: { container: 60, icon: 24, text: 12 },
    medium: { container: 80, icon: 32, text: 14 },
    large: { container: 100, icon: 40, text: 16 },
  };

  const dimensions = sizeMap[size];

  return (
    <View
      style={[
        styles.container,
        {
          width: dimensions.container,
          height: dimensions.container,
          backgroundColor: surface,
          borderColor: primary,
        },
      ]}
    >
      <Text style={{ fontSize: dimensions.icon }}>🔥</Text>
      <Text
        style={[
          styles.number,
          {
            fontSize: dimensions.text,
            fontWeight: '700',
            color: text,
          },
        ]}
      >
        {days}
      </Text>
      <Text
        style={[
          styles.label,
          {
            fontSize: dimensions.text - 2,
            color: text,
            opacity: 0.6,
          },
        ]}
      >
        day{days !== 1 ? 's' : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  number: {
    marginTop: 2,
  },
  label: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
