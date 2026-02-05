import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Achievement, getAchievementProgress, UserStats } from '@/services/gamification';
import { tokens } from '@/constants/tokens';
import { useThemeColor } from '@/hooks/use-theme-color';

interface AchievementCardProps {
  achievement: Achievement;
  stats: UserStats;
  unlocked?: boolean;
  onPress?: () => void;
}

const TIER_COLORS = {
  bronze: '#CD7F32',
  silver: '#C0C0C0',
  gold: '#FFD700',
  platinum: '#E5E4E2',
};

export function AchievementCard({ achievement, stats, unlocked, onPress }: AchievementCardProps) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const border = useThemeColor({}, 'border');
  const surface = useThemeColor({}, 'surface');

  const progress = getAchievementProgress(achievement, stats);
  const tierColor = TIER_COLORS[achievement.tier];

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.container,
        {
          backgroundColor: surface,
          borderColor: unlocked ? tierColor : border,
          opacity: pressed ? 0.8 : unlocked ? 1 : 0.5,
        },
      ]}
    >
      <View style={styles.content}>
        <Text style={styles.icon}>{achievement.icon}</Text>
        <View style={styles.info}>
          <Text style={[styles.name, { color: text }]}>{achievement.name}</Text>
          <Text style={[styles.description, { color: muted }]} numberOfLines={2}>
            {achievement.description}
          </Text>
          {!unlocked && (
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${progress}%`,
                    backgroundColor: tierColor,
                  },
                ]}
              />
            </View>
          )}
          {unlocked && achievement.unlockedAt && (
            <Text style={[styles.unlocked, { color: tierColor }]}>
              ✓ Unlocked {new Date(achievement.unlockedAt).toLocaleDateString()}
            </Text>
          )}
        </View>
      </View>
      {unlocked && (
        <View style={[styles.badge, { backgroundColor: tierColor }]}>
          <Text style={styles.badgeText}>{achievement.tier}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 2,
    padding: 16,
    marginBottom: 12,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    fontSize: 40,
    marginRight: 16,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: tokens.type.h4.fontSize,
    fontWeight: '700',
    marginBottom: 4,
  },
  description: {
    fontSize: tokens.type.small.fontSize,
    lineHeight: 18,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  unlocked: {
    fontSize: tokens.type.small.fontSize,
    fontWeight: '600',
    marginTop: 4,
  },
  badge: {
    position: 'absolute',
    top: 12,
    right: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});
