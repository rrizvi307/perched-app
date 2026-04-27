import { Body } from '@/components/ui/typography';
import { tokens } from '@/constants/tokens';
import { useThemeColor } from '@/hooks/use-theme-color';
import React from 'react';
import { Pressable, StyleSheet, TextStyle, type PressableProps } from 'react-native';

type Props = PressableProps & {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  style?: any;
};

export function Button({
  children,
  variant = 'primary',
  style,
  accessibilityRole = 'button',
  ...pressableProps
}: Props) {
  const textColor = useThemeColor({}, 'text');
  const primary = useThemeColor({}, 'primary');
  const border = useThemeColor({}, 'border');

  return (
    <Pressable
      accessibilityRole={accessibilityRole}
      {...pressableProps}
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
    borderRadius: tokens.radius.r14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: tokens.space.s18,
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

