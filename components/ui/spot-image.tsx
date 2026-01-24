import { Image as ExpoImage } from 'expo-image';
import React from 'react';
import { Image as RNImage, Platform, StyleSheet } from 'react-native';

type ExpoImageProps = React.ComponentProps<typeof ExpoImage>;

export default function SpotImage({ style, source, cachePolicy, contentFit, transition, ...props }: ExpoImageProps) {
  const resolvedStyle = (Platform.OS === 'web' && style ? StyleSheet.flatten(style as any) : style) as any;
  const normalizedSource = typeof source === 'string' ? { uri: source } : source;
  const uri = (normalizedSource as any)?.uri;
  const useNativeImage = Platform.OS === 'web' && typeof uri === 'string' && (uri.startsWith('blob:') || uri.startsWith('file:') || uri.startsWith('data:'));
  if (useNativeImage) {
    const nativeProps = props as any;
    return (
      <RNImage
        {...nativeProps}
        source={{ uri }}
        resizeMode={(contentFit as any) || 'cover'}
        style={resolvedStyle}
      />
    );
  }
  return (
    <ExpoImage
      {...props}
      source={normalizedSource}
      cachePolicy={cachePolicy || 'memory-disk'}
      contentFit={contentFit || 'cover'}
      transition={transition ?? 120}
      style={resolvedStyle}
    />
  );
}
