import { Platform } from 'react-native';

// Silicon Valley-grade color scheme optimized for addictive engagement
// Inspired by Instagram, TikTok, Twitter, Duolingo
export const Colors = {
  light: {
    // Crisp white backgrounds for maximum contrast
    background: '#FFFFFF',
    surface: '#FAFAFA',
    card: '#FFFFFF',

    // High contrast text
    text: '#0A0A0A',
    muted: '#737373',
    border: '#E5E5E5',

    // Electric purple (Instagram-inspired) - achievement, premium feel
    primary: '#8B5CF6', // Vibrant purple

    // Hot pink accent (TikTok-inspired) - attention, excitement
    accent: '#EC4899', // Hot pink

    // Bright achievement green (Duolingo-inspired)
    success: '#10B981', // Emerald green

    // Urgent red (YouTube/Netflix-inspired)
    danger: '#EF4444', // Bright red

    // Secondary colors for variety
    tint: '#8B5CF6',
    icon: '#737373',
    tabIconDefault: '#A3A3A3',
    tabIconSelected: '#8B5CF6', // Purple when active
    accentSoft: '#FCE7F3', // Soft pink background

    // New dopamine-inducing colors
    streakFire: '#F59E0B', // Vibrant orange for streaks
    notificationBadge: '#EF4444', // Urgent red for notifications
    premiumGold: '#FBBF24', // Premium gold
    socialBlue: '#3B82F6', // Twitter blue for social features
  },
  dark: {
    // True black for OLED optimization (more engaging on modern phones)
    background: '#000000',
    surface: '#0A0A0A',
    card: '#141414',

    // High contrast text for dark mode
    text: '#FFFFFF',
    muted: '#A3A3A3',
    border: '#262626',

    // Brighter, more vibrant purple for dark mode
    primary: '#A78BFA', // Lighter vibrant purple

    // Neon pink for dark mode (pops more)
    accent: '#F472B6', // Lighter hot pink

    // Bright green achievement (glows in dark)
    success: '#34D399', // Lighter emerald

    // Bright danger red
    danger: '#F87171', // Lighter red

    // Secondary colors
    tint: '#A78BFA',
    icon: '#A3A3A3',
    tabIconDefault: '#737373',
    tabIconSelected: '#A78BFA', // Purple when active
    accentSoft: '#27171A', // Dark pink background

    // Dopamine colors for dark mode
    streakFire: '#FBBF24', // Bright orange/gold for dark
    notificationBadge: '#F87171', // Bright red
    premiumGold: '#FCD34D', // Brighter gold
    socialBlue: '#60A5FA', // Lighter blue
  },
};


export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'SF Pro Display',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'New York',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'SF Pro Rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'SF Mono',
  },
  default: {
    sans: 'Avenir Next',
    serif: 'serif',
    rounded: 'Avenir Next',
    mono: 'monospace',
  },
  web: {
    sans: "'SF Pro Display', 'Helvetica Neue', 'Avenir Next', 'Segoe UI', sans-serif",
    serif: "'New York', Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Avenir Next', 'Segoe UI', sans-serif",
    mono: "'SF Mono', SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
  },
});
