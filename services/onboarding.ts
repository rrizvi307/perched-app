/**
 * Onboarding Progress Tracking
 *
 * Tracks user progress through onboarding flow and completion status
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface OnboardingProgress {
  completed: boolean;
  currentStep: number;
  steps: {
    welcome: boolean;
    featureTour: boolean;
    locationPermission: boolean;
    campusSelection: boolean;
    firstCheckin: boolean;
    friendInvites: boolean;
  };
  startedAt: number;
  completedAt: number | null;
}

const ONBOARDING_KEY = '@perched_onboarding_progress';

/**
 * Get user's onboarding progress
 */
export async function getOnboardingProgress(userId: string): Promise<OnboardingProgress> {
  try {
    const json = await AsyncStorage.getItem(`${ONBOARDING_KEY}_${userId}`);
    if (json) {
      return JSON.parse(json);
    }
  } catch (error) {
    console.warn('Failed to load onboarding progress:', error);
  }

  // Default progress
  return {
    completed: false,
    currentStep: 0,
    steps: {
      welcome: false,
      featureTour: false,
      locationPermission: false,
      campusSelection: false,
      firstCheckin: false,
      friendInvites: false,
    },
    startedAt: Date.now(),
    completedAt: null,
  };
}

/**
 * Update onboarding progress
 */
export async function updateOnboardingProgress(
  userId: string,
  updates: Partial<OnboardingProgress>
): Promise<OnboardingProgress> {
  try {
    const current = await getOnboardingProgress(userId);
    const updated = { ...current, ...updates };

    // Check if all steps are completed
    const allStepsComplete = Object.values(updated.steps).every(step => step);
    if (allStepsComplete && !updated.completed) {
      updated.completed = true;
      updated.completedAt = Date.now();
    }

    await AsyncStorage.setItem(`${ONBOARDING_KEY}_${userId}`, JSON.stringify(updated));
    return updated;
  } catch (error) {
    console.error('Failed to update onboarding progress:', error);
    throw error;
  }
}

/**
 * Mark a specific onboarding step as completed
 */
export async function completeOnboardingStep(
  userId: string,
  step: keyof OnboardingProgress['steps']
): Promise<OnboardingProgress> {
  try {
    const current = await getOnboardingProgress(userId);
    const updated = {
      ...current,
      steps: {
        ...current.steps,
        [step]: true,
      },
    };

    // Update current step number based on completion
    const completedSteps = Object.values(updated.steps).filter(s => s).length;
    updated.currentStep = completedSteps;

    return await updateOnboardingProgress(userId, updated);
  } catch (error) {
    console.error('Failed to complete onboarding step:', error);
    throw error;
  }
}

/**
 * Check if user has completed onboarding
 */
export async function hasCompletedOnboarding(userId: string): Promise<boolean> {
  try {
    const progress = await getOnboardingProgress(userId);
    return progress.completed;
  } catch (error) {
    console.warn('Failed to check onboarding completion:', error);
    return false;
  }
}

/**
 * Reset onboarding progress (for testing or re-onboarding)
 */
export async function resetOnboardingProgress(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${ONBOARDING_KEY}_${userId}`);
  } catch (error) {
    console.warn('Failed to reset onboarding progress:', error);
  }
}

/**
 * Get onboarding completion rate (0-100)
 */
export function getCompletionRate(progress: OnboardingProgress): number {
  const totalSteps = Object.keys(progress.steps).length;
  const completedSteps = Object.values(progress.steps).filter(s => s).length;
  return Math.round((completedSteps / totalSteps) * 100);
}

/**
 * Get next incomplete step
 */
export function getNextStep(progress: OnboardingProgress): keyof OnboardingProgress['steps'] | null {
  const stepOrder: Array<keyof OnboardingProgress['steps']> = [
    'welcome',
    'featureTour',
    'locationPermission',
    'campusSelection',
    'firstCheckin',
    'friendInvites',
  ];

  for (const step of stepOrder) {
    if (!progress.steps[step]) {
      return step;
    }
  }

  return null;
}
