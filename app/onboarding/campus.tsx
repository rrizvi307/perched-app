/**
 * Onboarding: Campus/City Selection
 *
 * Let users select their campus or city for better recommendations
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { PremiumButton } from '@/components/ui/premium-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuth } from '@/contexts/AuthContext';
import { completeOnboardingStep } from '@/services/onboarding';
import { withAlpha } from '@/utils/colors';
import * as Haptics from 'expo-haptics';

// Popular campuses (can be expanded)
const POPULAR_CAMPUSES = [
  { id: 'rice', name: 'Rice University', city: 'Houston, TX', emoji: '🦉' },
  { id: 'ut-austin', name: 'UT Austin', city: 'Austin, TX', emoji: '🤘' },
  { id: 'stanford', name: 'Stanford University', city: 'Palo Alto, CA', emoji: '🌲' },
  { id: 'mit', name: 'MIT', city: 'Cambridge, MA', emoji: '🏛️' },
  { id: 'harvard', name: 'Harvard University', city: 'Cambridge, MA', emoji: '🎓' },
  { id: 'ucla', name: 'UCLA', city: 'Los Angeles, CA', emoji: '🐻' },
  { id: 'berkeley', name: 'UC Berkeley', city: 'Berkeley, CA', emoji: '🐻' },
  { id: 'columbia', name: 'Columbia University', city: 'New York, NY', emoji: '🦁' },
];

const POPULAR_CITIES = [
  { id: 'houston', name: 'Houston', state: 'TX', emoji: '🚀' },
  { id: 'austin', name: 'Austin', state: 'TX', emoji: '🎸' },
  { id: 'san-francisco', name: 'San Francisco', state: 'CA', emoji: '🌉' },
  { id: 'new-york', name: 'New York', state: 'NY', emoji: '🗽' },
  { id: 'los-angeles', name: 'Los Angeles', state: 'CA', emoji: '🌴' },
  { id: 'boston', name: 'Boston', state: 'MA', emoji: '⚾' },
];

export default function CampusScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, updateProfile } = useAuth();

  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const card = useThemeColor({}, 'card');
  const border = useThemeColor({}, 'border');

  const [campusType, setCampusType] = useState<'campus' | 'city'>('campus');
  const [selectedCampus, setSelectedCampus] = useState<string | null>(null);
  const [selectedCity, setSelectedCity] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const handleContinue = async () => {
    try {
      setSaving(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Save selection to user profile
      if (updateProfile) {
        const updates: any = { campusType };

        if (campusType === 'campus' && selectedCampus) {
          const campus = POPULAR_CAMPUSES.find(c => c.id === selectedCampus);
          updates.campus = campus?.name;
          updates.campusOrCity = campus?.name;
          updates.city = campus?.city;
        } else if (campusType === 'city' && selectedCity) {
          const city = POPULAR_CITIES.find(c => c.id === selectedCity);
          updates.city = `${city?.name}, ${city?.state}`;
          updates.campusOrCity = `${city?.name}, ${city?.state}`;
        }

        await updateProfile(updates);
      }

      // Mark campus selection as complete
      if (user?.id) {
        await completeOnboardingStep(user.id, 'campusSelection');
      }

      // Navigate to complete onboarding
      router.push('/onboarding/complete');
    } catch (error) {
      console.error('Failed to save campus selection:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    if (user?.id) {
      await completeOnboardingStep(user.id, 'campusSelection');
    }
    router.push('/onboarding/complete');
  };

  const filteredCampuses = POPULAR_CAMPUSES.filter(campus =>
    campus.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    campus.city.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredCities = POPULAR_CITIES.filter(city =>
    city.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const canContinue = (campusType === 'campus' && selectedCampus) ||
                      (campusType === 'city' && selectedCity);

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={[styles.headerTitle, { color: text }]}>Where are you?</Text>
        <Text style={[styles.headerSubtitle, { color: muted }]}>
          We&apos;ll show you the best spots in your area
        </Text>
      </View>

      {/* Type Selector */}
      <View style={styles.typeSelector}>
        <Pressable
          onPress={() => {
            setCampusType('campus');
            setSelectedCity(null);
          }}
          style={[
            styles.typeButton,
            {
              backgroundColor: campusType === 'campus' ? primary : card,
              borderColor: campusType === 'campus' ? primary : border,
            },
          ]}
        >
          <Text
            style={[
              styles.typeButtonText,
              { color: campusType === 'campus' ? '#FFFFFF' : text },
            ]}
          >
            🎓 Campus
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setCampusType('city');
            setSelectedCampus(null);
          }}
          style={[
            styles.typeButton,
            {
              backgroundColor: campusType === 'city' ? primary : card,
              borderColor: campusType === 'city' ? primary : border,
            },
          ]}
        >
          <Text
            style={[
              styles.typeButtonText,
              { color: campusType === 'city' ? '#FFFFFF' : text },
            ]}
          >
            🏙️ City
          </Text>
        </Pressable>
      </View>

      {/* Search */}
      <View style={[styles.searchContainer, { backgroundColor: card, borderColor: border }]}>
        <IconSymbol name="magnifyingglass" size={18} color={muted} />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder={campusType === 'campus' ? 'Search campuses...' : 'Search cities...'}
          placeholderTextColor={muted}
          style={[styles.searchInput, { color: text }]}
          autoCapitalize="words"
        />
      </View>

      {/* List */}
      <View style={styles.listContainer}>
        {campusType === 'campus' ? (
          <FlatList
            data={filteredCampuses}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => setSelectedCampus(item.id)}
                style={[
                  styles.listItem,
                  {
                    backgroundColor: selectedCampus === item.id ? withAlpha(primary, 0.15) : card,
                    borderColor: selectedCampus === item.id ? primary : border,
                  },
                ]}
              >
                <Text style={styles.listItemEmoji}>{item.emoji}</Text>
                <View style={styles.listItemText}>
                  <Text style={[styles.listItemTitle, { color: text }]}>{item.name}</Text>
                  <Text style={[styles.listItemSubtitle, { color: muted }]}>{item.city}</Text>
                </View>
                {selectedCampus === item.id && (
                  <IconSymbol name="checkmark.circle.fill" size={24} color={primary} />
                )}
              </Pressable>
            )}
          />
        ) : (
          <FlatList
            data={filteredCities}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => setSelectedCity(item.id)}
                style={[
                  styles.listItem,
                  {
                    backgroundColor: selectedCity === item.id ? withAlpha(primary, 0.15) : card,
                    borderColor: selectedCity === item.id ? primary : border,
                  },
                ]}
              >
                <Text style={styles.listItemEmoji}>{item.emoji}</Text>
                <View style={styles.listItemText}>
                  <Text style={[styles.listItemTitle, { color: text }]}>
                    {item.name}, {item.state}
                  </Text>
                </View>
                {selectedCity === item.id && (
                  <IconSymbol name="checkmark.circle.fill" size={24} color={primary} />
                )}
              </Pressable>
            )}
          />
        )}
      </View>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 20 }]}>
        <PremiumButton
          onPress={handleContinue}
          variant="primary"
          size="large"
          fullWidth
          disabled={!canContinue}
          loading={saving}
          icon="arrow.right"
          iconPosition="right"
        >
          Continue
        </PremiumButton>
        <PremiumButton
          onPress={handleSkip}
          variant="ghost"
          size="medium"
          fullWidth
          style={{ marginTop: 12 }}
        >
          Skip for now
        </PremiumButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 17,
    lineHeight: 24,
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
  },
  typeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: 24,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 12,
  },
  listItemEmoji: {
    fontSize: 28,
  },
  listItemText: {
    flex: 1,
  },
  listItemTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  listItemSubtitle: {
    fontSize: 14,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 20,
  },
});
