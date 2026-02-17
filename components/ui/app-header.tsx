import Logo from '@/components/logo';
import { useThemeColor } from '@/hooks/use-theme-color';
import type { NativeStackHeaderProps } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from './icon-symbol';

const NO_BACK_ROUTES = new Set(['(tabs)', 'feed', 'explore', 'profile', 'index', 'signin']);

function toTitle(routeName: string, optionsTitle?: string) {
  if (optionsTitle && optionsTitle.trim().length > 0) return optionsTitle;
  const normalized = routeName
    .replace(/[()]/g, '')
    .replace(/[-_]/g, ' ')
    .trim();
  if (!normalized) return 'Perched';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function AppHeader({ navigation, route, options }: NativeStackHeaderProps) {
  const insets = useSafeAreaInsets();
  const text = useThemeColor({}, 'text');
  const border = useThemeColor({}, 'border');
  const card = useThemeColor({}, 'card');
  const canGoBack = navigation.canGoBack() && !NO_BACK_ROUTES.has(route.name);
  const title =
    typeof options.headerTitle === 'string'
      ? options.headerTitle
      : typeof options.title === 'string'
      ? options.title
      : '';
  const resolvedTitle = toTitle(route.name, title);

  return (
    <View
      style={[
        styles.container,
        {
          paddingTop: Math.max(insets.top, 10),
          backgroundColor: card,
          borderBottomColor: border,
        },
      ]}
    >
      <View style={styles.inner}>
        <View style={styles.side}>
          {canGoBack ? (
            <Pressable
              accessibilityLabel="Go back"
              hitSlop={10}
              onPress={() => navigation.goBack()}
              style={({ pressed }) => [styles.backButton, pressed ? styles.pressed : null]}
            >
              <IconSymbol name="chevron.left" size={20} color={text} />
              <Text style={{ color: text, fontWeight: '700', marginLeft: 2 }}>Back</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.center}>
          {resolvedTitle.toLowerCase() === 'perched' ? (
            <Logo size={20} variant="lockup" label="Perched" />
          ) : (
            <Text numberOfLines={1} style={{ color: text, fontWeight: '700', fontSize: 17 }}>
              {resolvedTitle}
            </Text>
          )}
        </View>

        <View style={styles.sideRight} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 8,
    paddingHorizontal: 12,
  },
  inner: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
  },
  side: {
    width: 92,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  sideRight: {
    width: 92,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButton: {
    minHeight: 40,
    minWidth: 44,
    borderRadius: 14,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});
