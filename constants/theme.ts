import { Platform } from 'react-native';

export const Colors = {
  light: {
    background: '#FBFAF8',
    surface: '#FFFFFF',
    card: '#FFFFFF',
    text: '#0E0F12',
    muted: '#6B6F76',
    border: '#E7E8EC',
    primary: '#2F6F5E',
    accent: '#C98B5B',
    success: '#2E7D67',
    danger: '#B24B43',
    tint: '#2F6F5E',
    icon: '#6B6F76',
    tabIconDefault: '#6B6F76',
    tabIconSelected: '#0E0F12',
    accentSoft: '#F2E4D8',
  },
  dark: {
    background: '#0E0F12',
    surface: '#15181C',
    card: '#15181C',
    text: '#F5F6F7',
    muted: '#A4ABB3',
    border: '#2A2F36',
    primary: '#3A8A74',
    accent: '#D39B6F',
    success: '#3A8A74',
    danger: '#D07269',
    tint: '#3A8A74',
    icon: '#A4ABB3',
    tabIconDefault: '#A4ABB3',
    tabIconSelected: '#F5F6F7',
    accentSoft: '#3A2B22',
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
