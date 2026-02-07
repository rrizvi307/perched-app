/**
 * Gamification Service
 *
 * Adds engagement mechanics to keep users coming back:
 * - Check-in streaks
 * - Achievement badges
 * - Explorer levels
 * - Leaderboards
 */

import { ensureFirebase } from './firebaseClient';

// ============ TYPES ============

export type BadgeId =
  // Exploration badges
  | 'first_checkin'
  | 'explorer_5'
  | 'explorer_10'
  | 'explorer_25'
  | 'explorer_50'
  | 'explorer_100'
  // Streak badges
  | 'streak_3'
  | 'streak_7'
  | 'streak_14'
  | 'streak_30'
  // Category badges
  | 'coffee_lover'      // 10 coffee shop check-ins
  | 'bookworm'          // 10 library check-ins
  | 'remote_warrior'    // 10 coworking check-ins
  // Social badges
  | 'social_butterfly'  // Check in with 5 different friends
  | 'influencer'        // 10 people saved a spot you reviewed
  | 'reviewer'          // Write 10 reviews
  // Discovery badges
  | 'hidden_gem_hunter' // Visit 5 hidden gems
  | 'trendsetter'       // Visit 3 spots before they became trending
  | 'early_bird'        // 10 check-ins before 8am
  | 'night_owl'         // 10 check-ins after 10pm
  // Seasonal
  | 'weekend_warrior'   // 10 weekend check-ins
  | 'regular'           // Visit same spot 10 times
  | 'variety_seeker';   // Visit 20 unique spots in a month

export type Badge = {
  id: BadgeId;
  name: string;
  description: string;
  emoji: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  unlockedAt?: number;
  progress?: number; // 0-100
  requirement: number;
  currentCount?: number;
};

export type UserGamificationProfile = {
  userId: string;

  // Level system
  level: number;
  xp: number;
  xpToNextLevel: number;

  // Streaks
  currentStreak: number;
  longestStreak: number;
  lastCheckInDate: string; // YYYY-MM-DD

  // Stats
  totalCheckIns: number;
  uniqueSpotsVisited: number;
  reviewsWritten: number;

  // Badges
  badges: Badge[];
  recentUnlocks: Badge[]; // Last 3 unlocked badges

  // Last updated
  lastUpdated: number;
};

export type LeaderboardEntry = {
  userId: string;
  userName: string;
  userPhotoUrl?: string;
  score: number;
  rank: number;
};

// ============ BADGE DEFINITIONS ============

const BADGE_DEFINITIONS: Record<BadgeId, Omit<Badge, 'unlockedAt' | 'progress' | 'currentCount'>> = {
  // Exploration
  first_checkin: {
    id: 'first_checkin',
    name: 'First Steps',
    description: 'Complete your first check-in',
    emoji: '🎉',
    tier: 'bronze',
    requirement: 1,
  },
  explorer_5: {
    id: 'explorer_5',
    name: 'Explorer',
    description: 'Visit 5 unique spots',
    emoji: '🗺️',
    tier: 'bronze',
    requirement: 5,
  },
  explorer_10: {
    id: 'explorer_10',
    name: 'Adventurer',
    description: 'Visit 10 unique spots',
    emoji: '🧭',
    tier: 'silver',
    requirement: 10,
  },
  explorer_25: {
    id: 'explorer_25',
    name: 'Trailblazer',
    description: 'Visit 25 unique spots',
    emoji: '🏔️',
    tier: 'gold',
    requirement: 25,
  },
  explorer_50: {
    id: 'explorer_50',
    name: 'Globetrotter',
    description: 'Visit 50 unique spots',
    emoji: '🌍',
    tier: 'gold',
    requirement: 50,
  },
  explorer_100: {
    id: 'explorer_100',
    name: 'Legend',
    description: 'Visit 100 unique spots',
    emoji: '👑',
    tier: 'platinum',
    requirement: 100,
  },

  // Streaks
  streak_3: {
    id: 'streak_3',
    name: 'Getting Started',
    description: '3-day check-in streak',
    emoji: '🔥',
    tier: 'bronze',
    requirement: 3,
  },
  streak_7: {
    id: 'streak_7',
    name: 'Week Warrior',
    description: '7-day check-in streak',
    emoji: '🔥',
    tier: 'silver',
    requirement: 7,
  },
  streak_14: {
    id: 'streak_14',
    name: 'Committed',
    description: '14-day check-in streak',
    emoji: '🔥',
    tier: 'gold',
    requirement: 14,
  },
  streak_30: {
    id: 'streak_30',
    name: 'Unstoppable',
    description: '30-day check-in streak',
    emoji: '🔥',
    tier: 'platinum',
    requirement: 30,
  },

  // Category
  coffee_lover: {
    id: 'coffee_lover',
    name: 'Coffee Lover',
    description: 'Check in at 10 coffee shops',
    emoji: '☕',
    tier: 'silver',
    requirement: 10,
  },
  bookworm: {
    id: 'bookworm',
    name: 'Bookworm',
    description: 'Check in at 10 libraries',
    emoji: '📚',
    tier: 'silver',
    requirement: 10,
  },
  remote_warrior: {
    id: 'remote_warrior',
    name: 'Remote Warrior',
    description: 'Check in at 10 coworking spaces',
    emoji: '💼',
    tier: 'silver',
    requirement: 10,
  },

  // Social
  social_butterfly: {
    id: 'social_butterfly',
    name: 'Social Butterfly',
    description: 'Check in with 5 different friends',
    emoji: '🦋',
    tier: 'silver',
    requirement: 5,
  },
  influencer: {
    id: 'influencer',
    name: 'Influencer',
    description: '10 people saved a spot you reviewed',
    emoji: '⭐',
    tier: 'gold',
    requirement: 10,
  },
  reviewer: {
    id: 'reviewer',
    name: 'Critic',
    description: 'Write 10 reviews',
    emoji: '✍️',
    tier: 'silver',
    requirement: 10,
  },

  // Discovery
  hidden_gem_hunter: {
    id: 'hidden_gem_hunter',
    name: 'Gem Hunter',
    description: 'Visit 5 hidden gems',
    emoji: '💎',
    tier: 'gold',
    requirement: 5,
  },
  trendsetter: {
    id: 'trendsetter',
    name: 'Trendsetter',
    description: 'Visit 3 spots before they became trending',
    emoji: '🚀',
    tier: 'gold',
    requirement: 3,
  },
  early_bird: {
    id: 'early_bird',
    name: 'Early Bird',
    description: '10 check-ins before 8am',
    emoji: '🌅',
    tier: 'silver',
    requirement: 10,
  },
  night_owl: {
    id: 'night_owl',
    name: 'Night Owl',
    description: '10 check-ins after 10pm',
    emoji: '🦉',
    tier: 'silver',
    requirement: 10,
  },

  // Seasonal
  weekend_warrior: {
    id: 'weekend_warrior',
    name: 'Weekend Warrior',
    description: '10 weekend check-ins',
    emoji: '🎊',
    tier: 'silver',
    requirement: 10,
  },
  regular: {
    id: 'regular',
    name: 'Regular',
    description: 'Visit the same spot 10 times',
    emoji: '🏠',
    tier: 'gold',
    requirement: 10,
  },
  variety_seeker: {
    id: 'variety_seeker',
    name: 'Variety Seeker',
    description: 'Visit 20 unique spots in a month',
    emoji: '🎯',
    tier: 'gold',
    requirement: 20,
  },
};

// ============ LEVEL SYSTEM ============

function calculateLevel(xp: number): { level: number; xpToNextLevel: number } {
  // XP curve: each level requires more XP
  // Level 1: 0 XP, Level 2: 100 XP, Level 3: 250 XP, etc.
  const levels = [0, 100, 250, 500, 1000, 2000, 3500, 5500, 8000, 12000, 20000];

  let level = 1;
  for (let i = 1; i < levels.length; i++) {
    if (xp >= levels[i]) {
      level = i + 1;
    } else {
      break;
    }
  }

  const currentLevelXp = levels[level - 1] || 0;
  const nextLevelXp = levels[level] || levels[levels.length - 1] + 10000;
  const xpToNextLevel = nextLevelXp - xp;

  return { level, xpToNextLevel: Math.max(0, xpToNextLevel) };
}

// XP rewards for actions
const XP_REWARDS = {
  checkIn: 10,
  firstVisit: 25,       // First time at a new spot
  streak3: 50,
  streak7: 100,
  streak14: 200,
  streak30: 500,
  review: 15,
  photoUpload: 10,
  badgeUnlock: 50,
};

// ============ MAIN FUNCTIONS ============

/**
 * Get or create a user's gamification profile
 */
export async function getGamificationProfile(userId: string): Promise<UserGamificationProfile | null> {
  try {
    const fb = ensureFirebase();
    if (!fb) return null;

    const doc = await fb.firestore().collection('gamification').doc(userId).get();

    if (doc.exists) {
      return doc.data() as UserGamificationProfile;
    }

    // Create new profile
    const newProfile: UserGamificationProfile = {
      userId,
      level: 1,
      xp: 0,
      xpToNextLevel: 100,
      currentStreak: 0,
      longestStreak: 0,
      lastCheckInDate: '',
      totalCheckIns: 0,
      uniqueSpotsVisited: 0,
      reviewsWritten: 0,
      badges: [],
      recentUnlocks: [],
      lastUpdated: Date.now(),
    };

    await fb.firestore().collection('gamification').doc(userId).set(newProfile);
    return newProfile;
  } catch (error) {
    console.error('[Gamification] Error getting profile:', error);
    return null;
  }
}

/**
 * Process a check-in and update gamification stats
 */
export async function processCheckIn(
  userId: string,
  checkInData: {
    spotPlaceId: string;
    spotName: string;
    isNewSpot: boolean;
    hasReview?: boolean;
    hasPhoto?: boolean;
    timestamp?: number;
  }
): Promise<{
  xpEarned: number;
  newBadges: Badge[];
  streakUpdated: boolean;
  levelUp: boolean;
}> {
  const result = {
    xpEarned: 0,
    newBadges: [] as Badge[],
    streakUpdated: false,
    levelUp: false,
  };

  try {
    const fb = ensureFirebase();
    if (!fb) return result;

    const profile = await getGamificationProfile(userId);
    if (!profile) return result;

    const now = checkInData.timestamp || Date.now();
    const today = new Date(now).toISOString().split('T')[0];
    const oldLevel = profile.level;

    // Update stats
    profile.totalCheckIns++;

    // Check-in XP
    result.xpEarned += XP_REWARDS.checkIn;

    // First visit bonus
    if (checkInData.isNewSpot) {
      profile.uniqueSpotsVisited++;
      result.xpEarned += XP_REWARDS.firstVisit;
    }

    // Review bonus
    if (checkInData.hasReview) {
      profile.reviewsWritten++;
      result.xpEarned += XP_REWARDS.review;
    }

    // Photo bonus
    if (checkInData.hasPhoto) {
      result.xpEarned += XP_REWARDS.photoUpload;
    }

    // Update streak
    const yesterday = new Date(now - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    if (profile.lastCheckInDate === yesterday) {
      // Continue streak
      profile.currentStreak++;
      result.streakUpdated = true;
    } else if (profile.lastCheckInDate !== today) {
      // Reset streak (unless already checked in today)
      profile.currentStreak = 1;
      result.streakUpdated = true;
    }

    profile.lastCheckInDate = today;

    // Update longest streak
    if (profile.currentStreak > profile.longestStreak) {
      profile.longestStreak = profile.currentStreak;
    }

    // Check for streak XP bonuses
    if (profile.currentStreak === 3) result.xpEarned += XP_REWARDS.streak3;
    if (profile.currentStreak === 7) result.xpEarned += XP_REWARDS.streak7;
    if (profile.currentStreak === 14) result.xpEarned += XP_REWARDS.streak14;
    if (profile.currentStreak === 30) result.xpEarned += XP_REWARDS.streak30;

    // Check for new badges
    const newBadges = checkForNewBadges(profile, checkInData);
    if (newBadges.length > 0) {
      result.newBadges = newBadges;
      result.xpEarned += XP_REWARDS.badgeUnlock * newBadges.length;

      // Add badges to profile
      profile.badges.push(...newBadges);
      profile.recentUnlocks = [...newBadges, ...profile.recentUnlocks].slice(0, 3);
    }

    // Update XP and level
    profile.xp += result.xpEarned;
    const { level, xpToNextLevel } = calculateLevel(profile.xp);
    profile.level = level;
    profile.xpToNextLevel = xpToNextLevel;

    if (level > oldLevel) {
      result.levelUp = true;
    }

    profile.lastUpdated = now;

    // Save profile
    await fb.firestore().collection('gamification').doc(userId).set(profile);

    return result;
  } catch (error) {
    console.error('[Gamification] Error processing check-in:', error);
    return result;
  }
}

/**
 * Check for newly earned badges
 */
function checkForNewBadges(
  profile: UserGamificationProfile,
  checkInData: { spotPlaceId: string; spotName: string }
): Badge[] {
  const newBadges: Badge[] = [];
  const earnedIds = new Set(profile.badges.map(b => b.id));

  const checks: Array<{ id: BadgeId; condition: boolean }> = [
    // Exploration badges
    { id: 'first_checkin', condition: profile.totalCheckIns >= 1 },
    { id: 'explorer_5', condition: profile.uniqueSpotsVisited >= 5 },
    { id: 'explorer_10', condition: profile.uniqueSpotsVisited >= 10 },
    { id: 'explorer_25', condition: profile.uniqueSpotsVisited >= 25 },
    { id: 'explorer_50', condition: profile.uniqueSpotsVisited >= 50 },
    { id: 'explorer_100', condition: profile.uniqueSpotsVisited >= 100 },

    // Streak badges
    { id: 'streak_3', condition: profile.currentStreak >= 3 },
    { id: 'streak_7', condition: profile.currentStreak >= 7 },
    { id: 'streak_14', condition: profile.currentStreak >= 14 },
    { id: 'streak_30', condition: profile.currentStreak >= 30 },

    // Review badge
    { id: 'reviewer', condition: profile.reviewsWritten >= 10 },
  ];

  checks.forEach(({ id, condition }) => {
    if (condition && !earnedIds.has(id)) {
      const def = BADGE_DEFINITIONS[id];
      newBadges.push({
        ...def,
        unlockedAt: Date.now(),
        progress: 100,
        currentCount: def.requirement,
      });
    }
  });

  return newBadges;
}

/**
 * Get badge progress for display
 */
export function getBadgeProgress(profile: UserGamificationProfile): Badge[] {
  const earnedIds = new Set(profile.badges.map(b => b.id));

  return Object.values(BADGE_DEFINITIONS).map(def => {
    if (earnedIds.has(def.id)) {
      const earned = profile.badges.find(b => b.id === def.id)!;
      return { ...def, ...earned, progress: 100 };
    }

    // Calculate progress for unearned badges
    let currentCount = 0;

    switch (def.id) {
      case 'first_checkin':
      case 'explorer_5':
      case 'explorer_10':
      case 'explorer_25':
      case 'explorer_50':
      case 'explorer_100':
        currentCount = profile.uniqueSpotsVisited;
        break;
      case 'streak_3':
      case 'streak_7':
      case 'streak_14':
      case 'streak_30':
        currentCount = profile.currentStreak;
        break;
      case 'reviewer':
        currentCount = profile.reviewsWritten;
        break;
      default:
        currentCount = 0;
    }

    const progress = Math.min(100, Math.round((currentCount / def.requirement) * 100));

    return {
      ...def,
      progress,
      currentCount,
    };
  });
}

// ============ LEADERBOARDS ============

/**
 * Get weekly leaderboard
 */
export async function getWeeklyLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
  try {
    const fb = ensureFirebase();
    if (!fb) return [];

    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    // Get check-ins from last week
    const checkinsSnap = await fb.firestore()
      .collection('checkins')
      .where('createdAt', '>=', new Date(oneWeekAgo))
      .get();

    // Aggregate by user
    const userScores: Record<string, { score: number; name: string; photo?: string }> = {};

    checkinsSnap.docs.forEach(doc => {
      const c = doc.data();
      const userId = c.userId;
      if (!userId) return;

      if (!userScores[userId]) {
        userScores[userId] = {
          score: 0,
          name: c.userName || 'Anonymous',
          photo: c.userPhotoUrl,
        };
      }

      userScores[userId].score += 10; // Points per check-in
    });

    // Sort and rank
    return Object.entries(userScores)
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, limit)
      .map(([userId, data], index) => ({
        userId,
        userName: data.name,
        userPhotoUrl: data.photo,
        score: data.score,
        rank: index + 1,
      }));
  } catch (error) {
    console.error('[Gamification] Error getting leaderboard:', error);
    return [];
  }
}

/**
 * Get all-time leaderboard based on XP
 */
export async function getAllTimeLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
  try {
    const fb = ensureFirebase();
    if (!fb) return [];

    const profilesSnap = await fb.firestore()
      .collection('gamification')
      .orderBy('xp', 'desc')
      .limit(limit)
      .get();

    return profilesSnap.docs.map((doc, index) => {
      const profile = doc.data() as UserGamificationProfile;
      return {
        userId: profile.userId,
        userName: 'User', // Would need to join with user data
        score: profile.xp,
        rank: index + 1,
      };
    });
  } catch (error) {
    console.error('[Gamification] Error getting all-time leaderboard:', error);
    return [];
  }
}
