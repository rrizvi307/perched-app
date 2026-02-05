import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, Platform } from 'react-native';
import { useState, useEffect } from 'react';
import { IconSymbol } from './icon-symbol';
import { PolishedCard } from './polished-card';
import { useThemeColor } from '@/hooks/use-theme-color';
import { withAlpha } from '@/utils/colors';
import * as Haptics from 'expo-haptics';

interface Campus {
  id: string;
  name: string;
  shortName?: string;
  location: string;
  domain: string;
  verified?: boolean;
  studentCount?: number;
}

interface CampusSelectorProps {
  onSelect: (campus: Campus) => void;
  selectedCampus?: Campus;
  onClose?: () => void;
}

// Top universities for quick access
const POPULAR_CAMPUSES: Campus[] = [
  {
    id: 'stanford',
    name: 'Stanford University',
    shortName: 'Stanford',
    location: 'Palo Alto, CA',
    domain: 'stanford.edu',
    verified: true,
    studentCount: 17000,
  },
  {
    id: 'berkeley',
    name: 'University of California, Berkeley',
    shortName: 'UC Berkeley',
    location: 'Berkeley, CA',
    domain: 'berkeley.edu',
    verified: true,
    studentCount: 45000,
  },
  {
    id: 'mit',
    name: 'Massachusetts Institute of Technology',
    shortName: 'MIT',
    location: 'Cambridge, MA',
    domain: 'mit.edu',
    verified: true,
    studentCount: 11500,
  },
  {
    id: 'harvard',
    name: 'Harvard University',
    shortName: 'Harvard',
    location: 'Cambridge, MA',
    domain: 'harvard.edu',
    verified: true,
    studentCount: 31000,
  },
  {
    id: 'caltech',
    name: 'California Institute of Technology',
    shortName: 'Caltech',
    location: 'Pasadena, CA',
    domain: 'caltech.edu',
    verified: true,
    studentCount: 2400,
  },
  {
    id: 'ucla',
    name: 'University of California, Los Angeles',
    shortName: 'UCLA',
    location: 'Los Angeles, CA',
    domain: 'ucla.edu',
    verified: true,
    studentCount: 47000,
  },
  {
    id: 'usc',
    name: 'University of Southern California',
    shortName: 'USC',
    location: 'Los Angeles, CA',
    domain: 'usc.edu',
    verified: true,
    studentCount: 49000,
  },
  {
    id: 'columbia',
    name: 'Columbia University',
    shortName: 'Columbia',
    location: 'New York, NY',
    domain: 'columbia.edu',
    verified: true,
    studentCount: 33000,
  },
];

/**
 * Silicon Valley-grade campus selector
 * Smooth search, verification badges, student counts
 */
export function CampusSelector({ onSelect, selectedCampus, onClose }: CampusSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredCampuses, setFilteredCampuses] = useState(POPULAR_CAMPUSES);

  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const border = useThemeColor({}, 'border');
  const surface = useThemeColor({}, 'surface');
  const card = useThemeColor({}, 'card');

  useEffect(() => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const filtered = POPULAR_CAMPUSES.filter(
        (campus) =>
          campus.name.toLowerCase().includes(query) ||
          campus.shortName?.toLowerCase().includes(query) ||
          campus.location.toLowerCase().includes(query)
      );
      setFilteredCampuses(filtered);
    } else {
      setFilteredCampuses(POPULAR_CAMPUSES);
    }
  }, [searchQuery]);

  const handleSelectCampus = async (campus: Campus) => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    onSelect(campus);
  };

  return (
    <View style={[styles.container, { backgroundColor: surface }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.titleContainer}>
            <IconSymbol name="building.2.fill" size={24} color={primary} />
            <Text style={[styles.title, { color: text }]}>Select Your Campus</Text>
          </View>
          {onClose && (
            <Pressable onPress={onClose} style={styles.closeButton}>
              <IconSymbol name="xmark" size={20} color={muted} />
            </Pressable>
          )}
        </View>
        <Text style={[styles.subtitle, { color: muted }]}>
          Connect with students at your university
        </Text>
      </View>

      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: card, borderColor: border }]}>
        <IconSymbol name="magnifyingglass" size={18} color={muted} />
        <TextInput
          style={[styles.searchInput, { color: text }]}
          placeholder="Search universities..."
          placeholderTextColor={muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')}>
            <IconSymbol name="xmark.circle.fill" size={18} color={muted} />
          </Pressable>
        )}
      </View>

      {/* Campus List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {filteredCampuses.length === 0 ? (
          <View style={styles.emptyState}>
            <IconSymbol name="building.2" size={48} color={muted} />
            <Text style={[styles.emptyTitle, { color: text }]}>No universities found</Text>
            <Text style={[styles.emptyDescription, { color: muted }]}>
              Try a different search term
            </Text>
          </View>
        ) : (
          <>
            {!searchQuery && (
              <Text style={[styles.sectionTitle, { color: muted }]}>Popular Universities</Text>
            )}
            {filteredCampuses.map((campus, index) => (
              <CampusCard
                key={campus.id}
                campus={campus}
                isSelected={selectedCampus?.id === campus.id}
                onSelect={handleSelectCampus}
                delay={index * 30}
              />
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/**
 * Individual campus card with verification badge
 */
function CampusCard({
  campus,
  isSelected,
  onSelect,
  delay = 0,
}: {
  campus: Campus;
  isSelected: boolean;
  onSelect: (campus: Campus) => void;
  delay?: number;
}) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const success = useThemeColor({}, 'success');

  return (
    <PolishedCard
      variant={isSelected ? 'outlined' : 'default'}
      animated
      delay={delay}
      pressable
      onPress={() => onSelect(campus)}
      style={[
        styles.campusCard,
        isSelected ? { borderColor: primary, borderWidth: 2 } : undefined,
      ] as any
      ]}
    >
      <View style={styles.campusContent}>
        {/* Icon */}
        <View
          style={[
            styles.campusIcon,
            { backgroundColor: withAlpha(primary, 0.1) },
          ]}
        >
          <IconSymbol name="building.2.fill" size={24} color={primary} />
        </View>

        {/* Info */}
        <View style={styles.campusInfo}>
          <View style={styles.campusNameRow}>
            <Text style={[styles.campusName, { color: text }]} numberOfLines={1}>
              {campus.shortName || campus.name}
            </Text>
            {campus.verified && (
              <IconSymbol name="checkmark.seal.fill" size={16} color={success} />
            )}
          </View>
          <Text style={[styles.campusLocation, { color: muted }]} numberOfLines={1}>
            {campus.location}
          </Text>
          {campus.studentCount && (
            <Text style={[styles.campusStats, { color: muted }]}>
              {(campus.studentCount / 1000).toFixed(1)}K students
            </Text>
          )}
        </View>

        {/* Selection Indicator */}
        {isSelected && (
          <View style={styles.selectedIndicator}>
            <IconSymbol name="checkmark.circle.fill" size={24} color={primary} />
          </View>
        )}
      </View>
    </PolishedCard>
  );
}

/**
 * Compact campus badge for displaying selected campus
 */
export function CampusBadge({ campus }: { campus: Campus }) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const success = useThemeColor({}, 'success');

  return (
    <View style={[styles.badge, { backgroundColor: withAlpha(primary, 0.1) }]}>
      <IconSymbol name="building.2.fill" size={14} color={primary} />
      <Text style={[styles.badgeText, { color: text }]} numberOfLines={1}>
        {campus.shortName || campus.name}
      </Text>
      {campus.verified && (
        <IconSymbol name="checkmark.seal.fill" size={12} color={success} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 20,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 20,
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    height: '100%',
  },
  scrollView: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  campusCard: {
    padding: 16,
    marginBottom: 12,
  },
  campusContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  campusIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  campusInfo: {
    flex: 1,
  },
  campusNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  campusName: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  campusLocation: {
    fontSize: 14,
    marginBottom: 4,
  },
  campusStats: {
    fontSize: 13,
    fontWeight: '500',
  },
  selectedIndicator: {
    marginLeft: 8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 15,
    textAlign: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
    maxWidth: 200,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
});
