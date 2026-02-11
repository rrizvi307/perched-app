/**
 * Image CDN Service
 *
 * Handles image optimization, resizing, and CDN delivery
 */

import { Platform } from 'react-native';
import { ensureFirebase } from './firebaseClient';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type ImageSize = 'thumbnail' | 'small' | 'medium' | 'large' | 'original';

interface ImageTransformOptions {
  width?: number;
  height?: number;
  quality?: number; // 0-100
  format?: 'jpeg' | 'png' | 'webp';
  fit?: 'cover' | 'contain' | 'fill';
}

interface CachedImage {
  uri: string;
  size: number;
  timestamp: number;
}

// FileSystem.cacheDirectory exists at runtime but may not be in types
const IMAGE_CACHE_DIR = `${(FileSystem as any).cacheDirectory ?? ''}images/`;
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
const CACHE_MAX_SIZE = 100 * 1024 * 1024; // 100 MB

const SIZE_PRESETS: Record<ImageSize, ImageTransformOptions> = {
  thumbnail: { width: 150, height: 150, quality: 80, fit: 'cover' },
  small: { width: 300, height: 300, quality: 85, fit: 'cover' },
  medium: { width: 600, height: 600, quality: 90, fit: 'contain' },
  large: { width: 1200, height: 1200, quality: 95, fit: 'contain' },
  original: { quality: 100 },
};

/**
 * Initialize image cache directory
 */
export async function initImageCache(): Promise<void> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(IMAGE_CACHE_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(IMAGE_CACHE_DIR, { intermediates: true });
    }
  } catch (error) {
    console.error('Failed to init image cache:', error);
  }
}

/**
 * Upload image to Firebase Storage with automatic optimization
 */
export async function uploadImage(
  localUri: string,
  path: string, // e.g., "checkins/user123/image.jpg"
  options?: ImageTransformOptions
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const fb = ensureFirebase();
    if (!fb) return { success: false, error: 'Firebase not initialized' };

    // Optimize image before upload
    const optimized = await optimizeImage(localUri, options || SIZE_PRESETS.large);

    if (!optimized) {
      return { success: false, error: 'Failed to optimize image' };
    }

    // Upload to Firebase Storage
    const storage = fb.storage();
    const ref = storage.ref(path);

    const blob = await fetch(optimized.uri).then(res => res.blob());
    await ref.put(blob);

    const downloadURL = await ref.getDownloadURL();

    return { success: true, url: downloadURL };
  } catch (error) {
    console.error('Failed to upload image:', error);
    return { success: false, error: 'Upload failed' };
  }
}

/**
 * Optimize image (resize, compress, convert format)
 */
export async function optimizeImage(
  uri: string,
  options: ImageTransformOptions = SIZE_PRESETS.medium
): Promise<{ uri: string; width: number; height: number } | null> {
  try {
    const actions: ImageManipulator.Action[] = [];

    // Resize if dimensions specified
    if (options.width || options.height) {
      actions.push({
        resize: {
          width: options.width,
          height: options.height,
        },
      });
    }

    // Determine format
    const format = options.format === 'webp' && Platform.OS === 'android'
      ? ImageManipulator.SaveFormat.WEBP
      : options.format === 'png'
      ? ImageManipulator.SaveFormat.PNG
      : ImageManipulator.SaveFormat.JPEG;

    const result = await ImageManipulator.manipulateAsync(
      uri,
      actions,
      {
        compress: (options.quality || 90) / 100,
        format,
      }
    );

    return result;
  } catch (error) {
    console.error('Failed to optimize image:', error);
    return null;
  }
}

/**
 * Get optimized image URL with transformations
 */
export function getOptimizedImageURL(
  originalUrl: string,
  size: ImageSize = 'medium',
  format?: 'jpeg' | 'png' | 'webp'
): string {
  // If using a CDN like Cloudinary or Imgix, apply transformations via URL params
  // For Firebase Storage, we'd need Cloud Functions to handle transformations

  // Example Cloudinary URL transformation:
  // https://res.cloudinary.com/demo/image/upload/w_300,h_300,c_fill,f_webp/sample.jpg

  // For now, return original URL
  // In production, implement CDN transformation logic here
  return originalUrl;
}

/**
 * Download and cache image locally
 */
export async function cacheImage(
  url: string,
  cacheKey?: string
): Promise<string | null> {
  try {
    const key = cacheKey || generateCacheKey(url);
    const cachePath = `${IMAGE_CACHE_DIR}${key}`;

    // Check if already cached
    const fileInfo = await FileSystem.getInfoAsync(cachePath);
    if (fileInfo.exists) {
      // Check if cache is still valid
      const cacheData = await getCacheMetadata(key);
      if (cacheData && Date.now() - cacheData.timestamp < CACHE_MAX_AGE) {
        return cachePath;
      }
    }

    // Download image
    const downloadResult = await FileSystem.downloadAsync(url, cachePath);

    // Save cache metadata
    await saveCacheMetadata(key, {
      uri: cachePath,
      size: fileInfo.exists ? fileInfo.size || 0 : 0,
      timestamp: Date.now(),
    });

    return downloadResult.uri;
  } catch (error) {
    console.error('Failed to cache image:', error);
    return null;
  }
}

/**
 * Get cached image or download if not cached
 */
export async function getCachedImage(
  url: string,
  size: ImageSize = 'medium'
): Promise<string> {
  // Try to get from cache
  const cacheKey = generateCacheKey(url, size);
  const cached = await cacheImage(url, cacheKey);

  if (cached) {
    return cached;
  }

  // Fallback to original URL
  return url;
}

/**
 * Preload images for better UX
 */
export async function preloadImages(urls: string[]): Promise<void> {
  try {
    await Promise.all(
      urls.map(url => cacheImage(url))
    );
  } catch (error) {
    console.error('Failed to preload images:', error);
  }
}

/**
 * Clear image cache
 */
export async function clearImageCache(): Promise<number> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(IMAGE_CACHE_DIR);
    if (!dirInfo.exists) return 0;

    const files = await FileSystem.readDirectoryAsync(IMAGE_CACHE_DIR);
    let deletedCount = 0;

    for (const file of files) {
      await FileSystem.deleteAsync(`${IMAGE_CACHE_DIR}${file}`, { idempotent: true });
      deletedCount++;
    }

    // Clear metadata
    await AsyncStorage.removeItem('@image_cache_metadata');

    return deletedCount;
  } catch (error) {
    console.error('Failed to clear image cache:', error);
    return 0;
  }
}

/**
 * Clean up old cached images
 */
export async function cleanupImageCache(): Promise<number> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(IMAGE_CACHE_DIR);
    if (!dirInfo.exists) return 0;

    const files = await FileSystem.readDirectoryAsync(IMAGE_CACHE_DIR);
    const now = Date.now();
    let deletedCount = 0;
    let totalSize = 0;

    const fileInfos: Array<{ name: string; size: number; timestamp: number }> = [];

    // Get info for all cached files
    for (const file of files) {
      const filePath = `${IMAGE_CACHE_DIR}${file}`;
      const info = await FileSystem.getInfoAsync(filePath);
      const metadata = await getCacheMetadata(file);

      if (info.exists && info.size) {
        fileInfos.push({
          name: file,
          size: info.size,
          timestamp: metadata?.timestamp || 0,
        });
        totalSize += info.size;
      }
    }

    // Delete files older than CACHE_MAX_AGE
    for (const fileInfo of fileInfos) {
      if (now - fileInfo.timestamp > CACHE_MAX_AGE) {
        await FileSystem.deleteAsync(`${IMAGE_CACHE_DIR}${fileInfo.name}`, { idempotent: true });
        deletedCount++;
        totalSize -= fileInfo.size;
      }
    }

    // If still over size limit, delete oldest files
    if (totalSize > CACHE_MAX_SIZE) {
      const sorted = fileInfos
        .filter(f => now - f.timestamp <= CACHE_MAX_AGE) // Only consider non-expired
        .sort((a, b) => a.timestamp - b.timestamp);

      for (const fileInfo of sorted) {
        if (totalSize <= CACHE_MAX_SIZE) break;

        await FileSystem.deleteAsync(`${IMAGE_CACHE_DIR}${fileInfo.name}`, { idempotent: true });
        deletedCount++;
        totalSize -= fileInfo.size;
      }
    }

    return deletedCount;
  } catch (error) {
    console.error('Failed to cleanup image cache:', error);
    return 0;
  }
}

/**
 * Get cache statistics
 */
export async function getImageCacheStats(): Promise<{
  fileCount: number;
  totalSize: number;
  oldestFile: number;
}> {
  try {
    const dirInfo = await FileSystem.getInfoAsync(IMAGE_CACHE_DIR);
    if (!dirInfo.exists) {
      return { fileCount: 0, totalSize: 0, oldestFile: 0 };
    }

    const files = await FileSystem.readDirectoryAsync(IMAGE_CACHE_DIR);
    let totalSize = 0;
    let oldestTimestamp = Date.now();

    for (const file of files) {
      const filePath = `${IMAGE_CACHE_DIR}${file}`;
      const info = await FileSystem.getInfoAsync(filePath);
      const metadata = await getCacheMetadata(file);

      if (info.exists && info.size) {
        totalSize += info.size;
        if (metadata && metadata.timestamp < oldestTimestamp) {
          oldestTimestamp = metadata.timestamp;
        }
      }
    }

    return {
      fileCount: files.length,
      totalSize,
      oldestFile: oldestTimestamp,
    };
  } catch (error) {
    console.error('Failed to get cache stats:', error);
    return { fileCount: 0, totalSize: 0, oldestFile: 0 };
  }
}

/**
 * Generate responsive image srcset for web
 */
export function generateImageSrcSet(
  baseUrl: string,
  sizes: ImageSize[] = ['small', 'medium', 'large']
): string {
  return sizes
    .map(size => {
      const preset = SIZE_PRESETS[size];
      const url = getOptimizedImageURL(baseUrl, size);
      return `${url} ${preset.width}w`;
    })
    .join(', ');
}

/**
 * Batch upload multiple images
 */
export async function batchUploadImages(
  images: Array<{ localUri: string; path: string; options?: ImageTransformOptions }>
): Promise<Array<{ success: boolean; url?: string; error?: string }>> {
  return Promise.all(
    images.map(({ localUri, path, options }) =>
      uploadImage(localUri, path, options)
    )
  );
}

// Helper functions

function generateCacheKey(url: string, size?: ImageSize): string {
  const hash = simpleHash(url);
  return size ? `${hash}_${size}` : hash;
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

async function getCacheMetadata(key: string): Promise<CachedImage | null> {
  try {
    const metadataJson = await AsyncStorage.getItem('@image_cache_metadata');
    if (!metadataJson) return null;

    const metadata = JSON.parse(metadataJson);
    return metadata[key] || null;
  } catch {
    return null;
  }
}

async function saveCacheMetadata(key: string, data: CachedImage): Promise<void> {
  try {
    const metadataJson = await AsyncStorage.getItem('@image_cache_metadata');
    const metadata = metadataJson ? JSON.parse(metadataJson) : {};

    metadata[key] = data;

    await AsyncStorage.setItem('@image_cache_metadata', JSON.stringify(metadata));
  } catch (error) {
    console.error('Failed to save cache metadata:', error);
  }
}

export default {
  init: initImageCache,
  upload: uploadImage,
  optimize: optimizeImage,
  getOptimized: getOptimizedImageURL,
  cache: cacheImage,
  getCached: getCachedImage,
  preload: preloadImages,
  clear: clearImageCache,
  cleanup: cleanupImageCache,
  getStats: getImageCacheStats,
  generateSrcSet: generateImageSrcSet,
  batchUpload: batchUploadImages,
};
