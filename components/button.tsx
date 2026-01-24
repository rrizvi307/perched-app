import { Body } from '@/components/ui/typography';
import { useThemeColor } from '@/hooks/use-theme-color';
import React from 'react';
import { Pressable, StyleSheet, TextStyle } from 'react-native';

type Props = {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  style?: any;
  onPress?: () => void;
};

export function Button({ children, variant = 'primary', style, onPress }: Props) {
  const textColor = useThemeColor({}, 'text');
  const primary = useThemeColor({}, 'primary');
  const border = useThemeColor({}, 'border');

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.base,
        variant === 'primary' ? [styles.primary, { backgroundColor: primary }] : undefined,
        variant === 'secondary' ? [styles.secondary, { borderColor: border }] : undefined,
        variant === 'ghost' ? styles.ghost : undefined,
        style,
      ]}
    >
      <Body
        style={
          variant === 'primary'
            ? [styles.primaryText, { color: '#FFFFFF' }]
            : [styles.secondaryText, { color: textColor }]
        }
      >
        {children as any}
      </Body>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primary: {
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  primaryText: {
    fontWeight: '600',
    fontSize: 16,
    marginBottom: 0,
  } as TextStyle,
  secondaryText: {
    fontWeight: '600',
    fontSize: 16,
    marginBottom: 0,
  } as TextStyle,
});
