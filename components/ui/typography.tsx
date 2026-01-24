import { Fonts } from '@/constants/theme';
import { tokens } from '@/constants/tokens';
import React from 'react';
import { StyleSheet, Text, TextProps } from 'react-native';

export function Label(props: TextProps) {
  return <Text {...props} style={[styles.label, props.style]}>{props.children}</Text>;
}

export function H1(props: TextProps) {
  return <Text {...props} style={[styles.h1, props.style]}>{props.children}</Text>;
}

export function H2(props: TextProps) {
  return <Text {...props} style={[styles.h2, props.style]}>{props.children}</Text>;
}

export function Body(props: TextProps) {
  return <Text {...props} style={[styles.body, props.style]}>{props.children}</Text>;
}

export function Small(props: TextProps) {
  return <Text {...props} style={[styles.small, props.style]}>{props.children}</Text>;
}

const styles = StyleSheet.create({
  label: {
    fontSize: tokens.type.label.fontSize,
    letterSpacing: tokens.type.label.letterSpacing,
    fontWeight: tokens.type.label.fontWeight as any,
    fontFamily: (Fonts as any)?.rounded || (Fonts as any)?.sans,
    textTransform: 'uppercase',
    opacity: 0.6,
    marginBottom: tokens.space.s12,
  },
  h1: {
    fontSize: tokens.type.h1.fontSize,
    lineHeight: tokens.type.h1.lineHeight,
    fontWeight: tokens.type.h1.fontWeight as any,
    fontFamily: (Fonts as any)?.sans,
    marginBottom: tokens.space.s12,
  },
  h2: {
    fontSize: tokens.type.h2.fontSize,
    lineHeight: tokens.type.h2.lineHeight,
    fontWeight: tokens.type.h2.fontWeight as any,
    fontFamily: (Fonts as any)?.sans,
    letterSpacing: tokens.type.h2.letterSpacing,
    marginBottom: tokens.space.s12,
  },
  body: {
    fontSize: tokens.type.body.fontSize,
    lineHeight: tokens.type.body.lineHeight,
    fontWeight: tokens.type.body.fontWeight as any,
    fontFamily: (Fonts as any)?.sans,
    marginBottom: tokens.space.s16,
  },
  small: {
    fontSize: tokens.type.small.fontSize,
    lineHeight: tokens.type.small.lineHeight,
    fontWeight: tokens.type.small.fontWeight as any,
    fontFamily: (Fonts as any)?.sans,
    marginBottom: tokens.space.s12,
  },
});

export default { Label, H1, H2, Body, Small };
