import { useThemeColor } from '@/hooks/use-theme-color';
import type { Badge, UserGamificationProfile } from '@/services/gamificationService';
import { withAlpha } from '@/utils/colors';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

// ============ STREAK DISPLAY ============

type StreakDisplayProps = {
  currentStreak: number;
  longestStreak: number;
  compact?: boolean;
};

export function StreakDisplay({ currentStreak, longestStreak, compact }: StreakDisplayProps) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');

  if (compact) {
    return (
      <View style={styles.streakCompact}>
        <Text style={styles.streakEmoji}>🔥</Text>
        <Text style={[styles.streakCount, { color: text }]}>{currentStreak}</Text>
        <Text style={[styles.streakLabel, { color: muted }]}>day streak</Text>
      </View>
    );
  }

  return (
    <View style={styles.streakCard}>
      <View style={styles.streakMain}>
        <Text style={styles.streakEmojiLarge}>🔥</Text>
        <View>
          <Text style={[styles.streakCountLarge, { color: text }]}>{currentStreak}</Text>
          <Text style={[styles.streakLabelLarge, { color: muted }]}>day streak</Text>
        </View>
      </View>
      {longestStreak > currentStreak && (
        <Text style={[styles.longestStreak, { color: muted }]}>
          Longest: {longestStreak} days
        </Text>
      )}
    </View>
  );
}

// ============ LEVEL DISPLAY ============

type LevelDisplayProps = {
  level: number;
  xp: number;
  xpToNextLevel: number;
  compact?: boolean;
};

export function LevelDisplay({ level, xp, xpToNextLevel, compact }: LevelDisplayProps) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');

  const totalForLevel = xp + xpToNextLevel;
  const progress = xpToNextLevel > 0 ? ((totalForLevel - xpToNextLevel) / totalForLevel) * 100 : 100;

  if (compact) {
    return (
      <View style={styles.levelCompact}>
        <View style={[styles.levelBadge, { backgroundColor: primary }]}>
          <Text style={styles.levelNumber}>{level}</Text>
        </View>
        <View style={[styles.xpBarSmall, { backgroundColor: withAlpha(primary, 0.2) }]}>
          <View style={[styles.xpFill, { width: `${progress}%`, backgroundColor: primary }]} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.levelCard}>
      <View style={styles.levelHeader}>
        <View style={[styles.levelBadgeLarge, { backgroundColor: primary }]}>
          <Text style={styles.levelNumberLarge}>{level}</Text>
        </View>
        <View style={styles.levelInfo}>
          <Text style={[styles.levelTitle, { color: text }]}>Level {level}</Text>
          <Text style={[styles.xpText, { color: muted }]}>
            {xp.toLocaleString()} XP • {xpToNextLevel.toLocaleString()} to next level
          </Text>
        </View>
      </View>
      <View style={[styles.xpBar, { backgroundColor: withAlpha(primary, 0.2) }]}>
        <View style={[styles.xpFill, { width: `${progress}%`, backgroundColor: primary }]} />
      </View>
    </View>
  );
}

// ============ BADGE DISPLAY ============

type BadgeDisplayProps = {
  badge: Badge;
  size?: 'small' | 'medium' | 'large';
  showProgress?: boolean;
  onPress?: () => void;
};

const TIER_COLORS = {
  bronze: '#CD7F32',
  silver: '#C0C0C0',
  gold: '#FFD700',
  platinum: '#E5E4E2',
};

export function BadgeDisplay({ badge, size = 'medium', showProgress, onPress }: BadgeDisplayProps) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const surface = useThemeColor({}, 'surface');

  const isUnlocked = !!badge.unlockedAt;
  const tierColor = TIER_COLORS[badge.tier];

  const sizes = {
    small: { emoji: 20, container: 40 },
    medium: { emoji: 28, container: 56 },
    large: { emoji: 36, container: 72 },
  };

  const s = sizes[size];

  return (
    <Pressable onPress={onPress} disabled={!onPress}>
      <View style={[
        styles.badgeContainer,
        {
          width: s.container,
          height: s.container,
          backgroundColor: isUnlocked ? withAlpha(tierColor, 0.2) : surface,
          borderColor: isUnlocked ? tierColor : 'transparent',
          opacity: isUnlocked ? 1 : 0.5,
        },
      ]}>
        <Text style={{ fontSize: s.emoji }}>{badge.emoji}</Text>
        {!isUnlocked && showProgress && badge.progress !== undefined && (
          <View style={[styles.badgeProgress, { backgroundColor: withAlpha(tierColor, 0.3) }]}>
            <View style={[
              styles.badgeProgressFill,
              { width: `${badge.progress}%`, backgroundColor: tierColor },
            ]} />
          </View>
        )}
      </View>
      {size !== 'small' && (
        <Text style={[styles.badgeName, { color: isUnlocked ? text : muted }]} numberOfLines={1}>
          {badge.name}
        </Text>
      )}
    </Pressable>
  );
}

// ============ BADGES ROW ============

type BadgesRowProps = {
  badges: Badge[];
  title?: string;
  showAll?: boolean;
  onViewAll?: () => void;
};

export function BadgesRow({ badges, title, showAll, onViewAll }: BadgesRowProps) {
  const text = useThemeColor({}, 'text');
  const primary = useThemeColor({}, 'primary');

  const displayBadges = showAll ? badges : badges.slice(0, 6);
  const unlockedCount = badges.filter(b => b.unlockedAt).length;

  return (
    <View style={styles.badgesSection}>
      {title && (
        <View style={styles.badgesHeader}>
          <Text style={[styles.badgesTitle, { color: text }]}>{title}</Text>
          <Text style={[styles.badgesCount, { color: primary }]}>
            {unlockedCount}/{badges.length}
          </Text>
          {onViewAll && (
            <Pressable onPress={onViewAll}>
              <Text style={{ color: primary, fontSize: 13, fontWeight: '600' }}>View all</Text>
            </Pressable>
          )}
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.badgesRow}>
          {displayBadges.map(badge => (
            <BadgeDisplay key={badge.id} badge={badge} showProgress />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

// ============ XP EARNED TOAST ============

type XPEarnedProps = {
  amount: number;
  reason?: string;
};

export function XPEarned({ amount, reason }: XPEarnedProps) {
  const primary = useThemeColor({}, 'primary');

  return (
    <View style={[styles.xpToast, { backgroundColor: primary }]}>
      <Text style={styles.xpToastText}>+{amount} XP</Text>
      {reason && <Text style={styles.xpToastReason}>{reason}</Text>}
    </View>
  );
}

// ============ BADGE UNLOCKED MODAL ============

type BadgeUnlockedProps = {
  badge: Badge;
  onDismiss: () => void;
};

export function BadgeUnlocked({ badge, onDismiss }: BadgeUnlockedProps) {
  const text = useThemeColor({}, 'text');
  const card = useThemeColor({}, 'card');
  const tierColor = TIER_COLORS[badge.tier];

  return (
    <Pressable style={styles.modalBackdrop} onPress={onDismiss}>
      <View style={[styles.badgeModal, { backgroundColor: card }]}>
        <Text style={styles.badgeUnlockedTitle}>Badge Unlocked!</Text>
        <View style={[
          styles.badgeUnlockedIcon,
          { backgroundColor: withAlpha(tierColor, 0.2), borderColor: tierColor },
        ]}>
          <Text style={{ fontSize: 48 }}>{badge.emoji}</Text>
        </View>
        <Text style={[styles.badgeUnlockedName, { color: text }]}>{badge.name}</Text>
        <Text style={[styles.badgeUnlockedDesc, { color: tierColor }]}>{badge.description}</Text>
        <Pressable
          style={[styles.badgeModalButton, { backgroundColor: tierColor }]}
          onPress={onDismiss}
        >
          <Text style={styles.badgeModalButtonText}>Awesome!</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

// ============ PROFILE STATS ============

type ProfileStatsProps = {
  profile: UserGamificationProfile;
};

export function ProfileStats({ profile }: ProfileStatsProps) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const surface = useThemeColor({}, 'surface');

  const stats = [
    { label: 'Check-ins', value: profile.totalCheckIns, emoji: '📍' },
    { label: 'Spots Visited', value: profile.uniqueSpotsVisited, emoji: '🗺️' },
    { label: 'Reviews', value: profile.reviewsWritten, emoji: '✍️' },
    { label: 'Badges', value: profile.badges.length, emoji: '🏅' },
  ];

  return (
    <View style={styles.statsGrid}>
      {stats.map(stat => (
        <View key={stat.label} style={[styles.statCard, { backgroundColor: surface }]}>
          <Text style={styles.statEmoji}>{stat.emoji}</Text>
          <Text style={[styles.statValue, { color: text }]}>{stat.value}</Text>
          <Text style={[styles.statLabel, { color: muted }]}>{stat.label}</Text>
        </View>
      ))}
    </View>
  );
}

// ============ LEADERBOARD ENTRY ============

type LeaderboardEntryProps = {
  rank: number;
  userName: string;
  score: number;
  isCurrentUser?: boolean;
};

export function LeaderboardEntryRow({ rank, userName, score, isCurrentUser }: LeaderboardEntryProps) {
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');
  const surface = useThemeColor({}, 'surface');

  const rankEmoji = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;

  return (
    <View style={[
      styles.leaderboardRow,
      { backgroundColor: isCurrentUser ? withAlpha(primary, 0.1) : surface },
    ]}>
      <View style={styles.rankContainer}>
        {rankEmoji ? (
          <Text style={styles.rankEmoji}>{rankEmoji}</Text>
        ) : (
          <Text style={[styles.rankNumber, { color: muted }]}>{rank}</Text>
        )}
      </View>
      <Text style={[styles.leaderboardName, { color: text }]} numberOfLines={1}>
        {userName}
      </Text>
      <Text style={[styles.leaderboardScore, { color: primary }]}>
        {score.toLocaleString()} pts
      </Text>
    </View>
  );
}

// ============ STYLES ============

const styles = StyleSheet.create({
  // Streak
  streakCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  streakEmoji: {
    fontSize: 16,
  },
  streakCount: {
    fontSize: 16,
    fontWeight: '700',
  },
  streakLabel: {
    fontSize: 12,
  },
  streakCard: {
    padding: 16,
  },
  streakMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  streakEmojiLarge: {
    fontSize: 40,
  },
  streakCountLarge: {
    fontSize: 32,
    fontWeight: '700',
  },
  streakLabelLarge: {
    fontSize: 14,
  },
  longestStreak: {
    fontSize: 12,
    marginTop: 8,
  },

  // Level
  levelCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  levelBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  levelNumber: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  xpBarSmall: {
    width: 60,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  levelCard: {
    padding: 16,
  },
  levelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  levelBadgeLarge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  levelNumberLarge: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  levelInfo: {
    flex: 1,
  },
  levelTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  xpText: {
    fontSize: 12,
    marginTop: 2,
  },
  xpBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  xpFill: {
    height: '100%',
    borderRadius: 4,
  },

  // Badge
  badgeContainer: {
    borderRadius: 16,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeName: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 60,
  },
  badgeProgress: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    right: 4,
    height: 3,
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  badgeProgressFill: {
    height: '100%',
  },

  // Badges section
  badgesSection: {
    marginTop: 16,
  },
  badgesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  badgesTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  badgesCount: {
    fontSize: 13,
    fontWeight: '600',
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 12,
  },

  // XP Toast
  xpToast: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  xpToastText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  xpToastReason: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
  },

  // Badge Modal
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeModal: {
    width: 280,
    padding: 24,
    borderRadius: 24,
    alignItems: 'center',
  },
  badgeUnlockedTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
    marginBottom: 16,
  },
  badgeUnlockedIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  badgeUnlockedName: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  badgeUnlockedDesc: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  badgeModalButton: {
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 20,
  },
  badgeModalButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },

  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statCard: {
    flex: 1,
    minWidth: 70,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  statEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
  },

  // Leaderboard
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  rankContainer: {
    width: 32,
    alignItems: 'center',
  },
  rankEmoji: {
    fontSize: 20,
  },
  rankNumber: {
    fontSize: 14,
    fontWeight: '600',
  },
  leaderboardName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    marginLeft: 8,
  },
  leaderboardScore: {
    fontSize: 14,
    fontWeight: '700',
  },
});
