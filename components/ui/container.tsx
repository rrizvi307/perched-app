import { tokens } from '@/constants/tokens';
import { useThemeColor } from '@/hooks/use-theme-color';
import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';

export function Container(props: ViewProps) {
  const bg = useThemeColor({}, 'background');
  return <View style={[styles.container, { backgroundColor: bg }, props.style]} {...props} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: tokens.space.s20,
    paddingTop: tokens.space.s20,
    paddingBottom: tokens.space.s24,
  },
});

export default Container;
