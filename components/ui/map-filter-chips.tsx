import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import { withAlpha } from '@/utils/colors';

export interface FilterChip {
  id: string;
  label: string;
  icon?: string;
  active: boolean;
}

interface MapFilterChipsProps {
  filters: FilterChip[];
  onFilterToggle: (filterId: string) => void;
  variant?: 'default' | 'compact';
}

export function MapFilterChips({
  filters,
  onFilterToggle,
  variant = 'default'
}: MapFilterChipsProps) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const border = useThemeColor({}, 'border');
  const surface = useThemeColor({}, 'surface');
  const activeBg = primary;
  const inactiveBg = surface;
  const activeHover = withAlpha(primary, 0.9);
  const inactiveHover = withAlpha(primary, 0.08);

  const isCompact = variant === 'compact';

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContainer}
      style={styles.container}
    >
      {filters.map((filter) => (
        <Pressable
          key={filter.id}
          onPress={() => onFilterToggle(filter.id)}
          style={({ pressed }) => [
            styles.chip,
            isCompact && styles.chipCompact,
            {
              backgroundColor: filter.active ? activeBg : inactiveBg,
              borderColor: filter.active ? activeBg : border,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          {filter.icon && (
            <IconSymbol
              name={filter.icon as any}
              size={isCompact ? 14 : 16}
              color={filter.active ? '#FFFFFF' : text}
            />
          )}
          <Text
            style={[
              styles.label,
              isCompact && styles.labelCompact,
              {
                color: filter.active ? '#FFFFFF' : text,
                fontWeight: filter.active ? '700' : '600',
              },
            ]}
          >
            {filter.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    maxHeight: 48,
  },
  scrollContainer: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 8,
    flexDirection: 'row',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.5,
    gap: 6,
  },
  chipCompact: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 4,
  },
  label: {
    fontSize: 15,
  },
  labelCompact: {
    fontSize: 13,
  },
});
