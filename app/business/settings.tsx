import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemeColor } from '@/hooks/use-theme-color';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function BusinessSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const background = useThemeColor({}, 'background');
  const text = useThemeColor({}, 'text');
  const muted = useThemeColor({}, 'muted');
  const border = useThemeColor({}, 'border');

  return (
    <View style={[styles.container, { backgroundColor: background, paddingTop: insets.top + 8 }]}>
      <View style={[styles.header, { borderBottomColor: border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <IconSymbol name="chevron.left" size={20} color={text} />
        </Pressable>
        <Text style={[styles.title, { color: text }]}>Business Settings</Text>
        <View style={styles.backButton} />
      </View>
      <View style={styles.content}>
        <Text style={[styles.body, { color: muted }]}>
          Settings are coming next. Core business flows remain available from the dashboard.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
});
