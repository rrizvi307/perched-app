import { View, Text, StyleSheet, SectionList, Pressable } from 'react-native';
import { useThemeColor } from '@/hooks/use-theme-color';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { tokens } from '@/constants/tokens';

interface SpotItem {
  id: string;
  name: string;
  distanceKm?: number;
  description?: string;
  tags?: string[];
  photoUrl?: string;
  checkinCount?: number;
}

interface DistanceGroupedListProps {
  spots: SpotItem[];
  onSpotPress: (spot: SpotItem) => void;
  onSpotFocus?: (spot: SpotItem) => void;
}

interface DistanceSection {
  title: string;
  data: SpotItem[];
  distanceRange: string;
}

function groupByDistance(spots: SpotItem[]): DistanceSection[] {
  const groups = new Map<string, SpotItem[]>();

  // Distance ranges in miles
  const ranges = [
    { max: 0.16, label: '< 0.1 mi' },
    { max: 0.32, label: '0.1 - 0.2 mi' },
    { max: 0.64, label: '0.2 - 0.4 mi' },
    { max: 1.0, label: '0.4 - 0.6 mi' },
    { max: 2.0, label: '0.6 - 1.2 mi' },
    { max: Infinity, label: '> 1.2 mi' },
  ];

  spots.forEach((spot) => {
    const distanceMiles = (spot.distanceKm ?? 999) * 0.621371;
    const range = ranges.find((r) => distanceMiles < r.max) || ranges[ranges.length - 1];

    if (!groups.has(range.label)) {
      groups.set(range.label, []);
    }
    groups.get(range.label)!.push(spot);
  });

  return Array.from(groups.entries())
    .map(([label, data]) => ({
      title: label,
      distanceRange: label,
      data: data.sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999)),
    }))
    .filter((section) => section.data.length > 0);
}

export function DistanceGroupedList({
  spots,
  onSpotPress,
  onSpotFocus,
}: DistanceGroupedListProps) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const border = useThemeColor({}, 'border');
  const surface = useThemeColor({}, 'surface');
  const primary = useThemeColor({}, 'primary');

  const sections = groupByDistance(spots);

  const renderSectionHeader = ({ section }: { section: DistanceSection }) => (
    <View style={[styles.sectionHeader, { backgroundColor: surface }]}>
      <IconSymbol name="location.fill" size={14} color={muted} />
      <Text style={[styles.sectionTitle, { color: muted }]}>
        {section.distanceRange}
      </Text>
      <Text style={[styles.sectionCount, { color: muted }]}>
        {section.data.length} {section.data.length === 1 ? 'spot' : 'spots'}
      </Text>
    </View>
  );

  const renderItem = ({ item }: { item: SpotItem }) => {
    const distanceMiles = item.distanceKm !== undefined
      ? (item.distanceKm * 0.621371).toFixed(1)
      : '?';

    return (
      <Pressable
        onPress={() => onSpotPress(item)}
        onLongPress={() => onSpotFocus?.(item)}
        style={({ pressed }) => [
          styles.spotCard,
          {
            backgroundColor: surface,
            borderColor: border,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <View style={styles.spotInfo}>
          <Text style={[styles.spotName, { color: text }]} numberOfLines={1}>
            {item.name}
          </Text>

          {item.description && (
            <Text style={[styles.spotDescription, { color: muted }]} numberOfLines={1}>
              {item.description}
            </Text>
          )}

          {item.tags && item.tags.length > 0 && (
            <View style={styles.tags}>
              {item.tags.slice(0, 3).map((tag) => (
                <View
                  key={tag}
                  style={[styles.tag, { backgroundColor: border }]}
                >
                  <Text style={[styles.tagText, { color: muted }]}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.spotMeta}>
          <View style={styles.distance}>
            <IconSymbol name="figure.walk" size={14} color={primary} />
            <Text style={[styles.distanceText, { color: primary }]}>
              {distanceMiles} mi
            </Text>
          </View>

          {item.checkinCount !== undefined && item.checkinCount > 0 && (
            <Text style={[styles.checkinCount, { color: muted }]}>
              {item.checkinCount} check-ins
            </Text>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <SectionList
      sections={sections}
      renderSectionHeader={renderSectionHeader}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContent}
      stickySectionHeadersEnabled={true}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 8,
    gap: 6,
  },
  sectionTitle: {
    fontSize: tokens.type.small.fontSize,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCount: {
    fontSize: tokens.type.small.fontSize,
    marginLeft: 'auto',
  },
  spotCard: {
    flexDirection: 'row',
    padding: 14,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  spotInfo: {
    flex: 1,
    gap: 4,
  },
  spotName: {
    fontSize: tokens.type.h4.fontSize,
    fontWeight: '700',
  },
  spotDescription: {
    fontSize: tokens.type.small.fontSize,
  },
  tags: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  spotMeta: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  distance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  distanceText: {
    fontSize: tokens.type.small.fontSize,
    fontWeight: '700',
  },
  checkinCount: {
    fontSize: 11,
    marginTop: 4,
  },
});
