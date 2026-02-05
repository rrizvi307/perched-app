import { Image as ExpoImage, ImageProps as ExpoImageProps } from 'expo-image';
import { useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { tokens } from '@/constants/tokens';

export interface OptimizedImageProps extends Omit<ExpoImageProps, 'source'> {
  source: { uri: string } | number;
  width?: number;
  height?: number;
  aspectRatio?: number;
  blurhash?: string;
  priority?: 'low' | 'normal' | 'high';
  showLoader?: boolean;
}

/**
 * Optimized image component with:
 * - Automatic caching
 * - Progressive loading with blurhash
 * - Memory-efficient rendering
 * - Error handling
 * - Loading states
 */
export function OptimizedImage({
  source,
  width,
  height,
  aspectRatio,
  blurhash,
  priority = 'normal',
  showLoader = true,
  style,
  ...props
}: OptimizedImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const containerStyle = [
    width && { width },
    height && { height },
    aspectRatio && { aspectRatio },
    style,
  ];

  // Generate placeholder blurhash
  const placeholderBlurhash =
    blurhash || 'L6PZfSi_.AyE_3t7t7R**0o#DgR4'; // Default neutral gray blurhash

  return (
    <View style={containerStyle}>
      <ExpoImage
        source={source}
        style={StyleSheet.absoluteFill}
        placeholder={placeholderBlurhash}
        contentFit="cover"
        transition={300}
        priority={priority}
        cachePolicy="memory-disk"
        onLoadStart={() => setIsLoading(true)}
        onLoad={() => {
          setIsLoading(false);
          setHasError(false);
        }}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
        {...props}
      />
      {showLoader && isLoading && (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="small" color={tokens.color.primary} />
        </View>
      )}
      {hasError && (
        <View style={styles.errorContainer}>
          {/* Placeholder for error state - could add an error icon */}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loaderContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  errorContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F5F5F5',
  },
});
