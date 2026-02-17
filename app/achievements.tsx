import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useState, useEffect, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ACHIEVEMENTS, getUserStats, getUnlockedAchievements, UserStats } from '@/services/gamification';
import { AchievementCard } from '@/components/ui/achievement-card';
import CelebrationOverlay from '@/components/ui/CelebrationOverlay';
import { ThemedView } from '@/components/themed-view';
import { Atmosphere } from '@/components/ui/atmosphere';
import { H1, Body } from '@/components/ui/typography';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import { tokens } from '@/constants/tokens';

function getAchievementCategory(id: string) {
  if (id.startsWith('explorer_')) return 'exploration';
  if (id.startsWith('social_')) return 'social';
  if (id.startsWith('streak_')) return 'streak';
  if (id === 'night_owl' || id === 'early_bird' || id === 'weekend_warrior') return 'time';
  if (id.startsWith('loyal_')) return 'regular';
  return 'discovery';
}

export default function AchievementsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const border = useThemeColor({}, 'border');
  const cardBg = useThemeColor({}, 'card');
  const primary = useThemeColor({}, 'primary');

  const [stats, setStats] = useState<UserStats | null>(null);
  const [unlocked, setUnlocked] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCelebration, setShowCelebration] = useState(false);
  const prevUnlockedCountRef = useRef<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [statsData, unlockedData] = await Promise.all([
          getUserStats(),
          getUnlockedAchievements(),
        ]);
        setStats(statsData);
        setUnlocked(unlockedData);
      } catch (error) {
        console.error('Failed to load achievements:', error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const unlockedIds = unlocked.map(a => a.id);
  const unlockedCount = unlockedIds.length;
  const totalCount = ACHIEVEMENTS.length;

  useEffect(() => {
    if (prevUnlockedCountRef.current === null) {
      prevUnlockedCountRef.current = unlockedCount;
      return;
    }
    if (unlockedCount > prevUnlockedCountRef.current) {
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 2500);
    }
    prevUnlockedCountRef.current = unlockedCount;
  }, [unlockedCount]);

  const categories = {
    'Explorer': ACHIEVEMENTS.filter((a) => getAchievementCategory(a.id) === 'exploration'),
    'Social': ACHIEVEMENTS.filter((a) => getAchievementCategory(a.id) === 'social'),
    'Streaks': ACHIEVEMENTS.filter((a) => getAchievementCategory(a.id) === 'streak'),
    'Time-Based': ACHIEVEMENTS.filter((a) => getAchievementCategory(a.id) === 'time'),
    'Regular': ACHIEVEMENTS.filter((a) => getAchievementCategory(a.id) === 'regular'),
    'Discovery': ACHIEVEMENTS.filter((a) => getAchievementCategory(a.id) === 'discovery'),
  };

  return (
    <ThemedView style={{ flex: 1 }}>
      <Atmosphere variant="warm" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(tokens.space.s12, insets.top + 10) }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backButton,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <IconSymbol name="chevron.left" size={24} color={text} />
        </Pressable>
        <H1 style={{ color: text, marginTop: 16 }}>Achievements</H1>
        <Body style={{ color: muted, marginTop: 8 }}>
          {unlockedCount} of {totalCount} unlocked
        </Body>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: Math.max(24, insets.bottom + 24) }
          ]}
        >
          {/* Summary Stats */}
          {stats && (
            <View style={[styles.statsCard, { backgroundColor: cardBg, borderColor: border }]}>
              <View style={styles.statRow}>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: text }]}>{stats.totalCheckins}</Text>
                  <Text style={[styles.statLabel, { color: muted }]}>Total Check-ins</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: text }]}>{stats.uniqueSpots}</Text>
                  <Text style={[styles.statLabel, { color: muted }]}>Unique Spots</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: primary }]}>🔥 {stats.streakDays}</Text>
                  <Text style={[styles.statLabel, { color: muted }]}>Day Streak</Text>
                </View>
              </View>
            </View>
          )}

          {/* Achievement Categories */}
          {Object.entries(categories).map(([category, achievements]) => {
            if (achievements.length === 0) return null;

            const categoryUnlocked = achievements.filter(a => unlockedIds.includes(a.id)).length;

            return (
              <View key={category} style={styles.categorySection}>
                <View style={styles.categoryHeader}>
                  <Text style={[styles.categoryTitle, { color: text }]}>
                    {category}
                  </Text>
                  <Text style={[styles.categoryCount, { color: muted }]}>
                    {categoryUnlocked}/{achievements.length}
                  </Text>
                </View>
                {achievements.map((achievement) => (
                  <AchievementCard
                    key={achievement.id}
                    achievement={achievement}
                    stats={stats || {} as UserStats}
                    unlocked={unlockedIds.includes(achievement.id)}
                  />
                ))}
              </View>
            );
          })}

          {unlockedCount === 0 && (
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 48, marginBottom: 16 }}>🏆</Text>
              <Text style={[styles.emptyTitle, { color: text }]}>
                Start Your Journey
              </Text>
              <Text style={[styles.emptyText, { color: muted }]}>
                Check in at spots to unlock achievements and build your streak!
              </Text>
            </View>
          )}
        </ScrollView>
      )}
      <CelebrationOverlay visible={showCelebration} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -10,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
  },
  statsCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    marginBottom: 24,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
  },
  categorySection: {
    marginBottom: 32,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  categoryTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  categoryCount: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 280,
  },
});
