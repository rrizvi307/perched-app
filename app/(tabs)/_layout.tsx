import { useAuth } from '@/contexts/AuthContext';
import { Redirect, Tabs, useRootNavigationState, useRouter } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { tokens } from '@/constants/tokens';
import { useThemeColor } from '@/hooks/use-theme-color';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Logo from '@/components/logo';
import AppTabBar from '@/components/app-tab-bar';

export default function TabLayout() {
  const { user } = useAuth();
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const muted = useThemeColor({}, 'muted');
  const border = useThemeColor({}, 'border');
  const primary = useThemeColor({}, 'primary');
  const card = useThemeColor({}, 'card');
  const { width } = useWindowDimensions();
  const compactTabs = width < 360;
  const iconSize = width < 360 ? 22 : width < 420 ? 24 : 26;
  const tabsProps = { tabBar: (props: any) => <AppTabBar {...props} compact={compactTabs} iconSize={iconSize} /> };

  const navReady = !!rootNavigationState?.key;

  if (!navReady) {
    return null;
  }

  if (!user) {
    return <Redirect href="/signin" />;
  }

  if (user && user.email && !user.emailVerified) {
    return <Redirect href="/verify" />;
  }

  return (
    <Tabs
      initialRouteName="feed"
      {...tabsProps}
      screenOptions={{
        tabBarActiveTintColor: primary,
        headerShown: true,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: card },
        headerTitle: () => <Logo size={22} variant="lockup" label="Perched" />,
        lazy: true,
        headerRight: () => (
          <View style={styles.headerRight}>
            <Pressable
              onPress={() => {
                if (!navReady) return;
                router.push('/checkin');
              }}
              accessibilityLabel="New check-in"
              style={({ pressed }) => [
                styles.headerCta,
                { backgroundColor: pressed ? muted : primary, borderColor: border },
              ]}
            >
              <IconSymbol name="plus" size={22} color="#FFFFFF" />
            </Pressable>
          </View>
        ),
        tabBarButton: HapticTab,
        tabBarShowLabel: !compactTabs,
        tabBarLabelStyle: { fontSize: compactTabs ? 10 : 12 },
        tabBarStyle: {
          backgroundColor: card,
          borderTopColor: border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: compactTabs ? 60 : 70,
          paddingTop: compactTabs ? 4 : 6,
          paddingBottom: compactTabs ? 6 : 10,
          width: '100%',
          alignSelf: 'stretch',
          marginHorizontal: 0,
          paddingHorizontal: 0,
          left: 0,
          right: 0,
          justifyContent: 'space-evenly',
        },
        tabBarItemStyle: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
        tabBarInactiveTintColor: muted,
      }}>
      <Tabs.Screen
        name="feed"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={iconSize} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color }) => <IconSymbol size={iconSize} name="map.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: 'Friends',
          tabBarIcon: ({ color }) => <IconSymbol size={iconSize} name="person.2.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <IconSymbol size={iconSize} name="person.fill" color={color} />,
          headerRight: () => (
            <View style={styles.headerRight}>
              <Pressable
                onPress={() => {
                  if (!navReady) return;
                  router.push('/checkin');
                }}
                accessibilityLabel="New check-in"
                style={({ pressed }) => [
                  styles.headerCta,
                  { backgroundColor: pressed ? muted : primary, borderColor: border },
                ]}
              >
                <IconSymbol name="plus" size={22} color="#FFFFFF" />
              </Pressable>
              <Pressable
                onPress={() => {
                  if (!navReady) return;
                  // typedRoutes generation can lag during dev; keep runtime correct and TS unblocked
                  router.push('/settings' as any);
                }}
                accessibilityLabel="Settings"
                style={({ pressed }) => [
                  styles.headerCta,
                  { marginLeft: 10 },
                  { backgroundColor: pressed ? muted : card, borderColor: border },
                ]}
              >
                <IconSymbol name="gearshape" size={20} color={muted} />
              </Pressable>
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerRight: { flexDirection: 'row', alignItems: 'center', marginRight: tokens.space.s12 },
  headerCta: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
