import { Text, Pressable, StyleSheet, ViewStyle, TextStyle, ActivityIndicator } from 'react-native';
import { ReactNode } from 'react';
import { IconSymbol } from './icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import { withAlpha } from '@/utils/colors';
import { tokens } from '@/constants/tokens';
import * as Haptics from 'expo-haptics';

interface PremiumButtonProps {
  onPress: () => void;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'small' | 'medium' | 'large';
  icon?: string;
  iconPosition?: 'left' | 'right';
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

/**
 * Premium button with smooth haptics and animations
 * Inspired by Superhuman, Linear, and Arc Browser
 */
export function PremiumButton({
  onPress,
  children,
  variant = 'primary',
  size = 'medium',
  icon,
  iconPosition = 'left',
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  textStyle,
}: PremiumButtonProps) {
  const primary = useThemeColor({}, 'primary');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const border = useThemeColor({}, 'border');
  const surface = useThemeColor({}, 'surface');
  const danger = '#EF4444';

  const handlePress = async () => {
    if (disabled || loading) return;

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}

    onPress();
  };

  // Size configurations
  const sizeConfig = {
    small: {
      height: 36,
      paddingHorizontal: 16,
      fontSize: 14,
      iconSize: 14,
    },
    medium: {
      height: 44,
      paddingHorizontal: 20,
      fontSize: 15,
      iconSize: 16,
    },
    large: {
      height: 52,
      paddingHorizontal: 24,
      fontSize: 16,
      iconSize: 18,
    },
  }[size];

  // Variant configurations
  const variantConfig = {
    primary: {
      backgroundColor: primary,
      textColor: '#FFFFFF',
      borderColor: primary,
      borderWidth: 0,
    },
    secondary: {
      backgroundColor: withAlpha(primary, 0.1),
      textColor: primary,
      borderColor: primary,
      borderWidth: 1.5,
    },
    ghost: {
      backgroundColor: 'transparent',
      textColor: text,
      borderColor: border,
      borderWidth: 1.5,
    },
    danger: {
      backgroundColor: danger,
      textColor: '#FFFFFF',
      borderColor: danger,
      borderWidth: 0,
    },
  }[variant];

  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        {
          height: sizeConfig.height,
          paddingHorizontal: sizeConfig.paddingHorizontal,
          backgroundColor: variantConfig.backgroundColor,
          borderColor: variantConfig.borderColor,
          borderWidth: variantConfig.borderWidth,
          opacity: isDisabled ? 0.5 : pressed ? 0.9 : 1,
          transform: [{ scale: pressed && !isDisabled ? 0.98 : 1 }],
        },
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variantConfig.textColor} size="small" />
      ) : (
        <>
          {icon && iconPosition === 'left' && (
            <IconSymbol
              name={icon as any}
              size={sizeConfig.iconSize}
              color={variantConfig.textColor}
              style={styles.iconLeft}
            />
          )}
          <Text
            style={[
              styles.text,
              {
                fontSize: sizeConfig.fontSize,
                color: variantConfig.textColor,
              },
              textStyle,
            ]}
          >
            {children}
          </Text>
          {icon && iconPosition === 'right' && (
            <IconSymbol
              name={icon as any}
              size={sizeConfig.iconSize}
              color={variantConfig.textColor}
              style={styles.iconRight}
            />
          )}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    gap: 8,
  },
  fullWidth: {
    width: '100%',
  },
  text: {
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  iconLeft: {
    marginRight: -4,
  },
  iconRight: {
    marginLeft: -4,
  },
});
