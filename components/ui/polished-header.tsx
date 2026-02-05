import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { IconSymbol } from './icon-symbol';
import { useThemeColor } from '@/hooks/use-theme-color';
import { withAlpha } from '@/utils/colors';
import { tokens } from '@/constants/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';

interface PolishedHeaderProps {
  title?: string;
  subtitle?: string;
  leftIcon?: string;
  onLeftPress?: () => void;
  rightIcon?: string;
  onRightPress?: () => void;
  rightText?: string;
  blurred?: boolean;
  transparent?: boolean;
  centerTitle?: boolean;
}

/**
 * Premium header component with blur effect
 * Inspired by iOS, Linear, and Arc Browser
 */
export function PolishedHeader({
  title,
  subtitle,
  leftIcon,
  onLeftPress,
  rightIcon,
  onRightPress,
  rightText,
  blurred = false,
  transparent = false,
  centerTitle = true,
}: PolishedHeaderProps) {
  const insets = useSafeAreaInsets();
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const card = useThemeColor({}, 'card');
  const border = useThemeColor({}, 'border');
  const primary = useThemeColor({}, 'primary');

  const backgroundStyle = transparent
    ? { backgroundColor: 'transparent' }
    : { backgroundColor: card, borderBottomWidth: 1, borderBottomColor: border };

  const content = (
    <View
      style={[
        styles.container,
        backgroundStyle,
        { paddingTop: Math.max(insets.top, 12) },
      ]}
    >
      {/* Left Action */}
      {(leftIcon || onLeftPress) && (
        <Pressable
          onPress={onLeftPress}
          style={({ pressed }) => [
            styles.action,
            pressed && styles.actionPressed,
          ]}
        >
          {leftIcon && (
            <IconSymbol name={leftIcon as any} size={20} color={text} />
          )}
        </Pressable>
      )}

      {/* Title */}
      <View style={[styles.titleContainer, centerTitle && styles.titleCentered]}>
        {title && (
          <Text
            style={[styles.title, { color: text }]}
            numberOfLines={1}
          >
            {title}
          </Text>
        )}
        {subtitle && (
          <Text
            style={[styles.subtitle, { color: muted }]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        )}
      </View>

      {/* Right Action */}
      {(rightIcon || rightText || onRightPress) && (
        <Pressable
          onPress={onRightPress}
          style={({ pressed }) => [
            styles.action,
            styles.rightAction,
            pressed && styles.actionPressed,
          ]}
        >
          {rightText && (
            <Text style={[styles.rightText, { color: primary }]}>
              {rightText}
            </Text>
          )}
          {rightIcon && (
            <IconSymbol name={rightIcon as any} size={20} color={text} />
          )}
        </Pressable>
      )}
    </View>
  );

  if (blurred && Platform.OS !== 'web') {
    return (
      <BlurView intensity={80} tint="light" style={styles.blurContainer}>
        {content}
      </BlurView>
    );
  }

  return content;
}

/**
 * Large header with hero style - for main screens
 */
export function PolishedLargeHeader({
  title,
  subtitle,
  rightIcon,
  onRightPress,
  rightText,
}: Omit<PolishedHeaderProps, 'centerTitle' | 'leftIcon'>) {
  const insets = useSafeAreaInsets();
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const primary = useThemeColor({}, 'primary');

  return (
    <View style={[styles.largeContainer, { paddingTop: Math.max(insets.top, 12) }]}>
      <View style={styles.largeHeader}>
        <View style={styles.largeTitleContainer}>
          {title && (
            <Text style={[styles.largeTitle, { color: text }]}>
              {title}
            </Text>
          )}
          {subtitle && (
            <Text style={[styles.largeSubtitle, { color: muted }]}>
              {subtitle}
            </Text>
          )}
        </View>

        {(rightIcon || rightText || onRightPress) && (
          <Pressable
            onPress={onRightPress}
            style={({ pressed }) => [
              styles.action,
              pressed && styles.actionPressed,
            ]}
          >
            {rightText && (
              <Text style={[styles.rightText, { color: primary }]}>
                {rightText}
              </Text>
            )}
            {rightIcon && (
              <IconSymbol name={rightIcon as any} size={22} color={text} />
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  blurContainer: {
    overflow: 'hidden',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    minHeight: 56,
  },
  action: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightAction: {
    minWidth: 40,
    paddingHorizontal: 8,
    width: 'auto',
  },
  actionPressed: {
    opacity: 0.6,
  },
  titleContainer: {
    flex: 1,
    marginHorizontal: 12,
  },
  titleCentered: {
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  rightText: {
    fontSize: 15,
    fontWeight: '600',
  },
  largeContainer: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  largeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  largeTitleContainer: {
    flex: 1,
    marginRight: 16,
  },
  largeTitle: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 0.3,
    lineHeight: 40,
  },
  largeSubtitle: {
    fontSize: 15,
    marginTop: 4,
    lineHeight: 20,
  },
});
