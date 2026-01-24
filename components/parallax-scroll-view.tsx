import React from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';

type Props = {
  headerBackgroundColor?: { light?: string; dark?: string } | string;
  headerImage?: React.ReactNode;
  children?: React.ReactNode;
  style?: ViewStyle;
};

export default function ParallaxScrollView({ headerImage, children, style }: Props) {
  return (
    <ScrollView contentContainerStyle={[styles.container, style]}>
      {headerImage ? <View style={styles.header}>{headerImage}</View> : null}
      <View style={styles.content}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
  },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  content: {
    paddingHorizontal: 24,
  },
});
