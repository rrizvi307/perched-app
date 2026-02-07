import { useThemeColor } from '@/hooks/use-theme-color';
import { getCuratedLists, type CuratedList } from '@/services/lifestyleDataService';
import { withAlpha } from '@/utils/colors';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type CuratedListsProps = {
  onSelectList: (list: CuratedList) => void;
  compact?: boolean;
};

export default function CuratedLists({ onSelectList, compact = false }: CuratedListsProps) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const surface = useThemeColor({}, 'surface');
  const border = useThemeColor({}, 'border');
  const primary = useThemeColor({}, 'primary');

  const lists = getCuratedLists();
  const displayLists = compact ? lists.slice(0, 4) : lists;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: text }]}>Discover</Text>
        {compact && (
          <Pressable>
            <Text style={{ color: primary, fontSize: 13, fontWeight: '600' }}>See all</Text>
          </Pressable>
        )}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {displayLists.map((list) => (
          <Pressable
            key={list.id}
            onPress={() => onSelectList(list)}
            style={({ pressed }) => [
              styles.listCard,
              {
                backgroundColor: pressed ? withAlpha(primary, 0.1) : surface,
                borderColor: border,
              },
            ]}
          >
            <Text style={styles.emoji}>{list.emoji}</Text>
            <Text style={[styles.listTitle, { color: text }]} numberOfLines={1}>
              {list.title}
            </Text>
            <Text style={[styles.listSubtitle, { color: muted }]} numberOfLines={2}>
              {list.subtitle}
            </Text>
            <Text style={[styles.spotCount, { color: muted }]}>
              {list.spotIds.length} spots
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// Mood selector for quick discovery
export function MoodSelector({ onSelectMood }: { onSelectMood: (mood: string) => void }) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const surface = useThemeColor({}, 'surface');
  const border = useThemeColor({}, 'border');

  const moods = [
    { id: 'chill', emoji: '😌', label: 'Chill' },
    { id: 'social', emoji: '👥', label: 'Social' },
    { id: 'romantic', emoji: '💕', label: 'Date' },
    { id: 'productive', emoji: '💻', label: 'Focus' },
    { id: 'adventurous', emoji: '🎲', label: 'Surprise me' },
  ];

  return (
    <View style={styles.moodContainer}>
      <Text style={[styles.moodTitle, { color: text }]}>What's your mood?</Text>
      <View style={styles.moodRow}>
        {moods.map((mood) => (
          <Pressable
            key={mood.id}
            onPress={() => onSelectMood(mood.id)}
            style={({ pressed }) => [
              styles.moodButton,
              {
                backgroundColor: pressed ? withAlpha('#8B5CF6', 0.15) : surface,
                borderColor: border,
              },
            ]}
          >
            <Text style={styles.moodEmoji}>{mood.emoji}</Text>
            <Text style={[styles.moodLabel, { color: text }]}>{mood.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// Quick filters for lifestyle features
export function LifestyleQuickFilters({ onSelectFilter, activeFilters }: {
  onSelectFilter: (filter: string) => void;
  activeFilters: string[];
}) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const border = useThemeColor({}, 'border');

  const filters = [
    { id: 'dog_friendly', emoji: '🐕', label: 'Dog Friendly' },
    { id: 'kid_friendly', emoji: '👶', label: 'Kid Friendly' },
    { id: 'patio', emoji: '☀️', label: 'Patio' },
    { id: 'vegan', emoji: '🌱', label: 'Vegan' },
    { id: 'date_spot', emoji: '💕', label: 'Date Spot' },
    { id: 'hidden_gem', emoji: '💎', label: 'Hidden Gems' },
    { id: 'instagram', emoji: '📸', label: 'Instagrammable' },
    { id: 'brunch', emoji: '🥞', label: 'Brunch' },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.filtersContent}
    >
      {filters.map((filter) => {
        const isActive = activeFilters.includes(filter.id);
        return (
          <Pressable
            key={filter.id}
            onPress={() => onSelectFilter(filter.id)}
            style={[
              styles.filterChip,
              {
                backgroundColor: isActive ? withAlpha(primary, 0.15) : 'transparent',
                borderColor: isActive ? primary : border,
              },
            ]}
          >
            <Text style={styles.filterEmoji}>{filter.emoji}</Text>
            <Text style={[styles.filterLabel, { color: isActive ? primary : text }]}>
              {filter.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 4,
  },
  listCard: {
    width: 140,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 10,
  },
  emoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  listTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  listSubtitle: {
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 8,
  },
  spotCount: {
    fontSize: 10,
    fontWeight: '500',
  },
  moodContainer: {
    marginTop: 16,
  },
  moodTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 10,
  },
  moodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  moodButton: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    minWidth: 60,
  },
  moodEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  moodLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  filtersContent: {
    paddingVertical: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  filterEmoji: {
    fontSize: 14,
    marginRight: 4,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
});
