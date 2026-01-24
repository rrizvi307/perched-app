import { tokens } from '@/constants/tokens';
import { useThemeColor } from '@/hooks/use-theme-color';
import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';

export function Divider(props: ViewProps) {
  const border = useThemeColor({}, 'border');
  return <View style={[styles.divider, { backgroundColor: border }, props.style]} {...props} />;
}

const styles = StyleSheet.create({
  divider: {
    height: 1,
    width: '100%',
    marginVertical: tokens.space.s18,
  },
});

export default Divider;
