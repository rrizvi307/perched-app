import * as StoreReview from 'expo-store-review';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { track } from './analytics';

const RATING_PROMPT_KEY = '@perched_rating_prompt';
const MIN_SESSIONS_BEFORE_PROMPT = 5;
const MIN_CHECKINS_BEFORE_PROMPT = 3;
const MIN_DAYS_SINCE_INSTALL = 3;
const DAYS_BETWEEN_PROMPTS = 90; // Don't annoy users

interface RatingPromptData {
  sessionsCount: number;
  checkinsCount: number;
  installDate: number;
  lastPromptDate?: number;
  hasRated: boolean;
  hasDeclined: boolean;
  declineCount: number;
}

/**
 * Get current rating prompt data
 */
async function getRatingPromptData(): Promise<RatingPromptData> {
  try {
    const json = await AsyncStorage.getItem(RATING_PROMPT_KEY);
    if (json) {
      return JSON.parse(json);
    }
  } catch (error) {
    console.error('Failed to get rating prompt data:', error);
  }

  // Default data for new installs
  return {
    sessionsCount: 0,
    checkinsCount: 0,
    installDate: Date.now(),
    hasRated: false,
    hasDeclined: false,
    declineCount: 0,
  };
}

/**
 * Save rating prompt data
 */
async function saveRatingPromptData(data: RatingPromptData): Promise<void> {
  try {
    await AsyncStorage.setItem(RATING_PROMPT_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save rating prompt data:', error);
  }
}

/**
 * Increment session count
 * Call this on app startup
 */
export async function trackAppSession(): Promise<void> {
  const data = await getRatingPromptData();
  data.sessionsCount += 1;
  await saveRatingPromptData(data);

  track('app_session_tracked', {
    sessions_count: data.sessionsCount,
  });
}

/**
 * Increment check-in count
 * Call this after successful check-in
 */
export async function trackCheckinForRating(): Promise<void> {
  const data = await getRatingPromptData();
  data.checkinsCount += 1;
  await saveRatingPromptData(data);
}

/**
 * Check if we should show the rating prompt
 */
export async function shouldShowRatingPrompt(): Promise<boolean> {
  // Check if review functionality is available
  if (!(await StoreReview.hasAction())) {
    return false;
  }

  const data = await getRatingPromptData();

  // Don't prompt if user already rated
  if (data.hasRated) {
    return false;
  }

  // Don't prompt if user declined too many times (2 max)
  if (data.declineCount >= 2) {
    return false;
  }

  // Check if enough time passed since last prompt
  if (data.lastPromptDate) {
    const daysSinceLastPrompt =
      (Date.now() - data.lastPromptDate) / (1000 * 60 * 60 * 24);
    if (daysSinceLastPrompt < DAYS_BETWEEN_PROMPTS) {
      return false;
    }
  }

  // Check if enough time passed since install
  const daysSinceInstall =
    (Date.now() - data.installDate) / (1000 * 60 * 60 * 24);
  if (daysSinceInstall < MIN_DAYS_SINCE_INSTALL) {
    return false;
  }

  // Check if user has enough sessions
  if (data.sessionsCount < MIN_SESSIONS_BEFORE_PROMPT) {
    return false;
  }

  // Check if user has created enough check-ins
  if (data.checkinsCount < MIN_CHECKINS_BEFORE_PROMPT) {
    return false;
  }

  return true;
}

/**
 * Show the native rating prompt
 * Returns true if shown successfully
 */
export async function requestRating(): Promise<boolean> {
  try {
    if (!(await shouldShowRatingPrompt())) {
      return false;
    }

    // Request the review
    await StoreReview.requestReview();

    // Update data
    const data = await getRatingPromptData();
    data.lastPromptDate = Date.now();
    await saveRatingPromptData(data);

    track('rating_prompt_shown', {
      sessions_count: data.sessionsCount,
      checkins_count: data.checkinsCount,
      days_since_install: Math.floor(
        (Date.now() - data.installDate) / (1000 * 60 * 60 * 24)
      ),
    });

    return true;
  } catch (error) {
    console.error('Failed to request rating:', error);
    track('rating_prompt_error', {
      error: String(error),
    });
    return false;
  }
}

/**
 * Mark that user has rated the app
 */
export async function markAsRated(): Promise<void> {
  const data = await getRatingPromptData();
  data.hasRated = true;
  await saveRatingPromptData(data);

  track('user_rated_app', {
    sessions_count: data.sessionsCount,
    checkins_count: data.checkinsCount,
  });
}

/**
 * Mark that user declined to rate
 */
export async function markAsDeclined(): Promise<void> {
  const data = await getRatingPromptData();
  data.hasDeclined = true;
  data.declineCount += 1;
  data.lastPromptDate = Date.now();
  await saveRatingPromptData(data);

  track('user_declined_rating', {
    decline_count: data.declineCount,
  });
}

/**
 * Strategic moments to prompt for rating
 * These are "high-emotion" moments when user is most satisfied
 */
export const RatingTriggers = {
  // After unlocking an achievement
  ACHIEVEMENT_UNLOCKED: 'achievement_unlocked',

  // After completing a milestone (10 check-ins, 7-day streak, etc.)
  MILESTONE_REACHED: 'milestone_reached',

  // After successful friend connection
  FRIEND_ADDED: 'friend_added',

  // After positive interaction (received reactions, comments)
  POSITIVE_SOCIAL: 'positive_social',

  // After exploring multiple spots
  SPOTS_EXPLORED: 'spots_explored',
};

/**
 * Smart rating prompt - shows at optimal moments
 */
export async function promptRatingAtMoment(
  trigger: string
): Promise<boolean> {
  // Only prompt if conditions are met
  if (!(await shouldShowRatingPrompt())) {
    return false;
  }

  // Weight different triggers (some moments are better than others)
  const shouldPromptNow = Math.random() < getTriggerProbability(trigger);

  if (shouldPromptNow) {
    track('rating_triggered_by_moment', {
      trigger,
    });
    return await requestRating();
  }

  return false;
}

/**
 * Get probability of showing prompt based on trigger type
 */
function getTriggerProbability(trigger: string): number {
  switch (trigger) {
    case RatingTriggers.ACHIEVEMENT_UNLOCKED:
      return 0.8; // 80% chance - very high emotion
    case RatingTriggers.MILESTONE_REACHED:
      return 0.7; // 70% chance - proud moment
    case RatingTriggers.FRIEND_ADDED:
      return 0.5; // 50% chance - social validation
    case RatingTriggers.POSITIVE_SOCIAL:
      return 0.6; // 60% chance - feeling appreciated
    case RatingTriggers.SPOTS_EXPLORED:
      return 0.4; // 40% chance - engaged user
    default:
      return 0.3; // 30% chance - fallback
  }
}

/**
 * Reset rating prompt data (for testing only)
 */
export async function resetRatingPromptData(): Promise<void> {
  await AsyncStorage.removeItem(RATING_PROMPT_KEY);
  track('rating_data_reset');
}

/**
 * Get rating prompt statistics (for debugging/analytics)
 */
export async function getRatingStats(): Promise<RatingPromptData> {
  return await getRatingPromptData();
}

export default {
  trackAppSession,
  trackCheckinForRating,
  shouldShowRatingPrompt,
  requestRating,
  promptRatingAtMoment,
  markAsRated,
  markAsDeclined,
  RatingTriggers,
  getRatingStats,
};
