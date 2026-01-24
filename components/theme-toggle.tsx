import { Colors } from '@/constants/theme';
import { useThemePreference } from '@/contexts/ThemePreferenceContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

export function ThemeToggle() {
  const { preference, setPreference } = useThemePreference();
  const scheme = useColorScheme();
  const c = Colors[scheme ?? 'light'];

  function next() {
    const order: ('system' | 'light' | 'dark')[] = ['system', 'light', 'dark'];
    const idx = order.indexOf(preference);
    const next = order[(idx + 1) % order.length];
    setPreference(next);
  }

  return (
    <Pressable onPress={next} style={[styles.btn, { borderColor: c.border }]}> 
      <Text style={{ color: c.text }}>{preference === 'system' ? 'System' : preference === 'light' ? 'Light' : 'Dark'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
});

export default ThemeToggle;
