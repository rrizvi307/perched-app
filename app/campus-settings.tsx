/**
 * Campus Settings Screen
 *
 * Manage campus preferences, notifications, and privacy
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { useAuth } from '@/contexts/AuthContext';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { PremiumButton } from '@/components/ui/premium-button';
import {
  getCampusById,
  getAllPilotCampuses,
  detectCampusFromLocation,
  type Campus,
} from '@/services/campus';
import { requestForegroundLocation } from '@/services/location';
import { withAlpha } from '@/utils/colors';
import * as Haptics from 'expo-haptics';
import { useToast } from '@/contexts/ToastContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface CampusPreferences {
  autoDetect: boolean;
  showCampusInProfile: boolean;
  campusNotifications: boolean;
  leaderboardNotifications: boolean;
  challengeNotifications: boolean;
}

const CAMPUS_PREFERENCES_KEY = '@perched_campus_preferences';

export default function CampusSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { showToast } = useToast();

  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const card = useThemeColor({}, 'card');
  const border = useThemeColor({}, 'border');

  const [campus, setCampus] = useState<Campus | null>(null);
  const [allCampuses, setAllCampuses] = useState<Campus[]>([]);
  const [preferences, setPreferences] = useState<CampusPreferences>({
    autoDetect: true,
    showCampusInProfile: true,
    campusNotifications: true,
    leaderboardNotifications: true,
    challengeNotifications: true,
  });
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [showCampusPicker, setShowCampusPicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      // Load all campuses
      const campuses = getAllPilotCampuses();
      setAllCampuses(campuses);

      // Load current campus
      if (user?.campus) {
        const campusData = getCampusById(user.campus.toLowerCase().replace(/\s+/g, '-'));
        setCampus(campusData);
      }

      // Load preferences
      const prefsJson = await AsyncStorage.getItem(`${CAMPUS_PREFERENCES_KEY}_${user?.id}`);
      if (prefsJson) {
        setPreferences(JSON.parse(prefsJson));
      }
    } catch (error) {
      console.error('Failed to load campus settings:', error);
    }
  }, [user?.campus, user?.id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleBack = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    router.back();
  };

  const savePreferences = async (newPrefs: CampusPreferences) => {
    try {
      await AsyncStorage.setItem(
        `${CAMPUS_PREFERENCES_KEY}_${user?.id}`,
        JSON.stringify(newPrefs)
      );
      setPreferences(newPrefs);
    } catch (error) {
      console.error('Failed to save preferences:', error);
    }
  };

  const handleAutoDetectToggle = async (value: boolean) => {
    await savePreferences({ ...preferences, autoDetect: value });

    if (value) {
      // Trigger location detection
      handleDetectCampus();
    }
  };

  const handleDetectCampus = async () => {
    try {
      setDetectingLocation(true);

      const location = await requestForegroundLocation({ ignoreCache: true });
      if (!location) {
        showToast('Unable to get your location', 'warning');
        return;
      }

      const detectedCampus = detectCampusFromLocation(location);

      if (detectedCampus) {
        showToast(`Detected ${detectedCampus.name}!`, 'success');
        setCampus(detectedCampus);
        // TODO: Update user.campus in Firestore
      } else {
        showToast('No campus detected at your location', 'warning');
      }
    } catch {
      showToast('Failed to detect campus', 'error');
    } finally {
      setDetectingLocation(false);
    }
  };

  const handleCampusSelect = async (selectedCampus: Campus) => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setCampus(selectedCampus);
      setShowCampusPicker(false);
      showToast(`Switched to ${selectedCampus.name}`, 'success');
      // TODO: Update user.campus in Firestore
    } catch {
      showToast('Failed to update campus', 'error');
    }
  };

  const handleRemoveCampus = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setCampus(null);
      showToast('Campus removed', 'success');
      // TODO: Update user.campus in Firestore
    } catch {
      showToast('Failed to remove campus', 'error');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: border }]}>
        <Pressable onPress={handleBack} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={24} color={primary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: text }]}>Campus Settings</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={primary} />
        }
      >
        {/* Current Campus */}
        <View style={[styles.currentCampusCard, { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.sectionTitle, { color: text }]}>Current Campus</Text>

          {campus ? (
            <View style={[styles.campusDisplay, { backgroundColor: withAlpha(primary, 0.1), borderColor: primary }]}>
              <View style={styles.campusInfo}>
                <Text style={styles.campusEmoji}>{campus.emoji}</Text>
                <View style={styles.campusText}>
                  <Text style={[styles.campusName, { color: text }]}>{campus.name}</Text>
                  <Text style={[styles.campusLocation, { color: muted }]}>
                    {campus.city}, {campus.state}
                  </Text>
                </View>
              </View>
              <Pressable onPress={handleRemoveCampus} style={styles.removeButton}>
                <Text style={[styles.removeText, { color: primary }]}>Remove</Text>
              </Pressable>
            </View>
          ) : (
            <View style={[styles.noCampus, { borderColor: border }]}>
              <IconSymbol name="building.2" size={32} color={muted} />
              <Text style={[styles.noCampusText, { color: muted }]}>No campus set</Text>
              <PremiumButton
                onPress={() => setShowCampusPicker(true)}
                variant="primary"
                size="small"
                icon="plus"
                style={{ marginTop: 12 }}
              >
                Add Campus
              </PremiumButton>
            </View>
          )}

          {campus && (
            <PremiumButton
              onPress={() => setShowCampusPicker(true)}
              variant="secondary"
              size="medium"
              fullWidth
              icon="arrow.triangle.2.circlepath"
              style={{ marginTop: 12 }}
            >
              Change Campus
            </PremiumButton>
          )}
        </View>

        {/* Campus Picker */}
        {showCampusPicker && (
          <View style={[styles.pickerCard, { backgroundColor: card, borderColor: border }]}>
            <View style={styles.pickerHeader}>
              <Text style={[styles.sectionTitle, { color: text }]}>Select Campus</Text>
              <Pressable onPress={() => setShowCampusPicker(false)}>
                <IconSymbol name="xmark.circle.fill" size={24} color={muted} />
              </Pressable>
            </View>

            {allCampuses.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => handleCampusSelect(c)}
                style={[
                  styles.campusOption,
                  {
                    backgroundColor: campus?.id === c.id ? withAlpha(primary, 0.05) : 'transparent',
                    borderBottomColor: withAlpha(border, 0.5),
                  },
                ]}
              >
                <Text style={styles.campusEmoji}>{c.emoji}</Text>
                <View style={styles.campusOptionText}>
                  <Text style={[styles.campusOptionName, { color: text }]}>{c.name}</Text>
                  <Text style={[styles.campusOptionLocation, { color: muted }]}>
                    {c.city}, {c.state}
                  </Text>
                </View>
                {campus?.id === c.id && (
                  <IconSymbol name="checkmark.circle.fill" size={20} color={primary} />
                )}
              </Pressable>
            ))}
          </View>
        )}

        {/* Auto-Detect */}
        <View style={[styles.settingsCard, { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.sectionTitle, { color: text }]}>Location Detection</Text>

          <SettingRow
            icon="location.fill"
            title="Auto-Detect Campus"
            description="Automatically detect your campus from your location"
            value={preferences.autoDetect}
            onValueChange={handleAutoDetectToggle}
            textColor={text}
            mutedColor={muted}
            primary={primary}
          />

          {preferences.autoDetect && (
            <PremiumButton
              onPress={handleDetectCampus}
              variant="secondary"
              size="medium"
              fullWidth
              disabled={detectingLocation}
              icon="location.circle"
              style={{ marginTop: 12 }}
            >
              {detectingLocation ? 'Detecting...' : 'Detect Now'}
            </PremiumButton>
          )}
        </View>

        {/* Privacy */}
        <View style={[styles.settingsCard, { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.sectionTitle, { color: text }]}>Privacy</Text>

          <SettingRow
            icon="eye.fill"
            title="Show Campus in Profile"
            description="Display your campus on your public profile"
            value={preferences.showCampusInProfile}
            onValueChange={(value) => savePreferences({ ...preferences, showCampusInProfile: value })}
            textColor={text}
            mutedColor={muted}
            primary={primary}
          />
        </View>

        {/* Notifications */}
        <View style={[styles.settingsCard, { backgroundColor: card, borderColor: border }]}>
          <Text style={[styles.sectionTitle, { color: text }]}>Notifications</Text>

          <SettingRow
            icon="bell.fill"
            title="Campus Activity"
            description="Get notified about campus events and updates"
            value={preferences.campusNotifications}
            onValueChange={(value) => savePreferences({ ...preferences, campusNotifications: value })}
            textColor={text}
            mutedColor={muted}
            primary={primary}
          />

          <SettingRow
            icon="trophy.fill"
            title="Leaderboard Updates"
            description="Get notified when your rank changes"
            value={preferences.leaderboardNotifications}
            onValueChange={(value) => savePreferences({ ...preferences, leaderboardNotifications: value })}
            textColor={text}
            mutedColor={muted}
            primary={primary}
          />

          <SettingRow
            icon="target"
            title="Challenge Updates"
            description="Get notified about new challenges and progress"
            value={preferences.challengeNotifications}
            onValueChange={(value) => savePreferences({ ...preferences, challengeNotifications: value })}
            textColor={text}
            mutedColor={muted}
            primary={primary}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function SettingRow({
  icon,
  title,
  description,
  value,
  onValueChange,
  textColor,
  mutedColor,
  primary,
}: {
  icon: string;
  title: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  textColor: string;
  mutedColor: string;
  primary: string;
}) {
  return (
    <View style={styles.settingRow}>
      <IconSymbol name={icon as any} size={20} color={primary} />
      <View style={styles.settingText}>
        <Text style={[styles.settingTitle, { color: textColor }]}>{title}</Text>
        <Text style={[styles.settingDescription, { color: mutedColor }]}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: mutedColor, true: primary }}
        thumbColor="#FFFFFF"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600' },
  scrollView: { flex: 1 },
  scrollContent: { padding: 20 },
  currentCampusCard: { padding: 20, borderRadius: 16, borderWidth: 1, marginBottom: 20 },
  sectionTitle: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  campusDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
  },
  campusInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  campusEmoji: { fontSize: 32 },
  campusText: { flex: 1 },
  campusName: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  campusLocation: { fontSize: 13 },
  removeButton: { padding: 8 },
  removeText: { fontSize: 14, fontWeight: '600' },
  noCampus: { alignItems: 'center', padding: 32, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed' },
  noCampusText: { fontSize: 14, fontWeight: '600', marginTop: 8 },
  pickerCard: { padding: 20, borderRadius: 16, borderWidth: 1, marginBottom: 20 },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  campusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderRadius: 8,
  },
  campusOptionText: { flex: 1 },
  campusOptionName: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  campusOptionLocation: { fontSize: 12 },
  settingsCard: { padding: 20, borderRadius: 16, borderWidth: 1, marginBottom: 20 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  settingText: { flex: 1 },
  settingTitle: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  settingDescription: { fontSize: 13, lineHeight: 18 },
});
