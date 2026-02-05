// Premium gradient combinations for addictive UI
// Used for premium features, achievements, special moments

export const Gradients = {
  // Instagram-inspired gradient (purple to pink)
  instagram: {
    colors: ['#8B5CF6', '#EC4899'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },

  // Achievement unlock (gold to orange)
  achievement: {
    colors: ['#FBBF24', '#F59E0B'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  },

  // Streak fire (red to orange to yellow)
  streakFire: {
    colors: ['#EF4444', '#F59E0B', '#FBBF24'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  },

  // Premium gold (luxury feel)
  premium: {
    colors: ['#FCD34D', '#FBBF24', '#F59E0B'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },

  // Success celebration (green to teal)
  success: {
    colors: ['#10B981', '#14B8A6'],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 0 },
  },

  // Dark mode variants (more vibrant)
  dark: {
    instagram: {
      colors: ['#A78BFA', '#F472B6'],
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    },
    achievement: {
      colors: ['#FCD34D', '#FBBF24'],
      start: { x: 0, y: 0 },
      end: { x: 1, y: 0 },
    },
    streakFire: {
      colors: ['#F87171', '#FBBF24', '#FCD34D'],
      start: { x: 0, y: 0 },
      end: { x: 1, y: 0 },
    },
    premium: {
      colors: ['#FDE68A', '#FCD34D', '#FBBF24'],
      start: { x: 0, y: 0 },
      end: { x: 1, y: 1 },
    },
    success: {
      colors: ['#34D399', '#2DD4BF'],
      start: { x: 0, y: 0 },
      end: { x: 1, y: 0 },
    },
  },
};

// Gradient presets for common use cases
export const GradientPresets = {
  // For premium CTAs
  premiumButton: Gradients.premium,

  // For achievement cards
  achievementCard: Gradients.achievement,

  // For streak badges
  streakBadge: Gradients.streakFire,

  // For social proof elements
  socialProof: Gradients.instagram,

  // For success messages
  successToast: Gradients.success,
};

// Helper to get gradient based on theme
export function getGradient(
  gradientName: keyof typeof Gradients,
  isDark: boolean
): typeof Gradients.instagram {
  if (isDark && gradientName in Gradients.dark) {
    return Gradients.dark[gradientName as keyof typeof Gradients.dark];
  }
  return Gradients[gradientName];
}
