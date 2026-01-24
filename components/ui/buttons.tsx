import { Colors } from '@/constants/theme';
import { tokens } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';
import React from 'react';
import { Pressable, StyleSheet, Text, ViewStyle } from 'react-native';

type BtnProps = {
  title: string;
  onPress?: () => void;
  style?: ViewStyle;
};

export function PrimaryButton({ title, onPress, style }: BtnProps) {
  const bg = useThemeColor({}, 'primary');
  return (
    <Pressable style={[styles.primary, style, { backgroundColor: bg }]} onPress={onPress}>
      <Text style={[styles.primaryText, { color: '#FFFFFF' }]}>{title}</Text>
    </Pressable>
  );
}

export function SecondaryButton({ title, onPress, style }: BtnProps) {
  const scheme = useColorScheme();
  const c = Colors[scheme ?? 'light'];
  const bg = useThemeColor({}, 'surface');
  return (
    <Pressable style={[styles.secondary, style, { borderColor: c.border, backgroundColor: bg }]} onPress={onPress}>
      <Text style={[styles.secondaryText, { color: c.text }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  primary: {
    height: 54,
    borderRadius: tokens.radius.r28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: tokens.space.s16,
    paddingHorizontal: 20,
    // subtle elevation
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 14,
    elevation: 3,
  },
  primaryText: {
    fontSize: 17,
    fontWeight: '700',
  },
  secondary: {
    height: 52,
    borderRadius: tokens.radius.r20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: {
    fontSize: tokens.type.body.fontSize,
    fontWeight: '600',
  },
});

export default { PrimaryButton, SecondaryButton };
