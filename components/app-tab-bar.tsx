import { type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type AppTabBarProps = BottomTabBarProps & {
  compact?: boolean;
  iconSize?: number;
};

export default function AppTabBar(props: AppTabBarProps) {
  const { state, descriptors, navigation, compact = false, iconSize = 24 } = props;
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const focusedOptions = descriptors[state.routes[state.index]?.key]?.options ?? {};
  const barStyle = (StyleSheet.flatten(focusedOptions.tabBarStyle) || {}) as any;
  const baseHeight = compact ? 60 : 70;
  const height = baseHeight + (insets.bottom || 0);

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: barStyle.backgroundColor ?? colors.card,
          borderTopColor: barStyle.borderTopColor ?? colors.border,
          borderTopWidth: barStyle.borderTopWidth ?? StyleSheet.hairlineWidth,
          paddingTop: compact ? 4 : 6,
          paddingBottom: (compact ? 6 : 10) + (insets.bottom || 0),
          height,
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const color = focused ? options.tabBarActiveTintColor ?? colors.text : options.tabBarInactiveTintColor ?? colors.text;
        const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : options.title ?? route.name;
        const showLabel = options.tabBarShowLabel !== false && !compact;
        const icon = options.tabBarIcon?.({ focused, color, size: iconSize });
        const labelStyle = StyleSheet.flatten(options.tabBarLabelStyle) || {};

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        const onLongPress = () => {
          navigation.emit({
            type: 'tabLongPress',
            target: route.key,
          });
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            onLongPress={onLongPress}
            onPressIn={() => {
              if (Platform.OS === 'ios') {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
            }}
            style={({ pressed }) => [styles.item, pressed ? styles.itemPressed : null]}
          >
            {icon}
            {showLabel ? <Text style={[styles.label, { color }, labelStyle]}>{label}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  itemPressed: {
    opacity: 0.7,
  },
  label: {
    fontSize: 11,
    marginTop: 4,
    fontWeight: '600',
  },
});

