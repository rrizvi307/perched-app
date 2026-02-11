import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import { withAlpha } from '@/utils/colors';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export type FilterGroupOption = {
  id: string;
  label: string;
  value: string;
};

export type FilterGroup = {
  id: string;
  title: string;
  icon: string;
  options: FilterGroupOption[];
  multiSelect?: boolean;
  premium?: boolean; // Premium feature flag
};

type FilterGroupsProps = {
  groups: FilterGroup[];
  selectedFilters: Record<string, string[]>;
  onFilterChange: (groupId: string, values: string[]) => void;
  onPremiumRequired?: (groupId: string) => void; // Callback when premium filter is clicked without premium
  isPremium?: boolean; // Whether user has premium access
};

export default function FilterGroups({ groups, selectedFilters, onFilterChange, onPremiumRequired, isPremium = false }: FilterGroupsProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['atmosphere', 'hours']));
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const accent = useThemeColor({}, 'accent');
  const highlight = withAlpha(primary, 0.12);

  const toggleGroup = (groupId: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  const toggleFilter = (groupId: string, value: string, multiSelect: boolean, isPremiumGroup: boolean) => {
    // Check if premium access is required
    if (isPremiumGroup && !isPremium) {
      onPremiumRequired?.(groupId);
      return;
    }

    const currentValues = selectedFilters[groupId] || [];

    if (multiSelect) {
      // Toggle the value in the array
      if (currentValues.includes(value)) {
        onFilterChange(groupId, currentValues.filter(v => v !== value));
      } else {
        onFilterChange(groupId, [...currentValues, value]);
      }
    } else {
      // Single select - replace with new value or clear if already selected
      if (currentValues.includes(value)) {
        onFilterChange(groupId, []);
      } else {
        onFilterChange(groupId, [value]);
      }
    }
  };

  const getActiveCount = (groupId: string) => {
    return (selectedFilters[groupId] || []).length;
  };

  return (
    <View style={styles.container}>
      {groups.map((group) => {
        const isExpanded = expandedGroups.has(group.id);
        const activeCount = getActiveCount(group.id);

        return (
          <View key={group.id} style={[styles.group, { borderColor: border, backgroundColor: card }]}>
            <Pressable
              onPress={() => toggleGroup(group.id)}
              style={({ pressed }) => [
                styles.groupHeader,
                { backgroundColor: pressed ? highlight : 'transparent' },
              ]}
            >
              <View style={styles.groupHeaderLeft}>
                <IconSymbol name={group.icon as any} size={20} color={text} />
                <Text style={[styles.groupTitle, { color: text }]}>{group.title}</Text>
                {activeCount > 0 && (
                  <View style={[styles.badge, { backgroundColor: accent }]}>
                    <Text style={styles.badgeText}>{activeCount}</Text>
                  </View>
                )}
              </View>
              <IconSymbol
                name={isExpanded ? 'chevron.up' : 'chevron.down'}
                size={16}
                color={muted}
              />
            </Pressable>

            {isExpanded && (
              <View style={styles.optionsContainer}>
                <View style={styles.optionsGrid}>
                  {group.options.map((option) => {
                    const isSelected = (selectedFilters[group.id] || []).includes(option.value);

                    return (
                      <Pressable
                        key={option.id}
                        onPress={() => toggleFilter(group.id, option.value, group.multiSelect || false, group.premium || false)}
                        style={({ pressed }) => [
                          styles.optionChip,
                          {
                            borderColor: isSelected ? accent : border,
                            backgroundColor: isSelected ? withAlpha(accent, 0.16) : pressed ? highlight : card,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.optionLabel,
                            { color: isSelected ? accent : text },
                          ]}
                        >
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
    marginTop: 12,
  },
  group: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  groupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  badge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  optionsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  optionLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
});
