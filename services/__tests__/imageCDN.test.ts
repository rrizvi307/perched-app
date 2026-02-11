import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { ensureFirebase } from '../firebaseClient';
import {
  batchUploadImages,
  cacheImage,
  cleanupImageCache,
  clearImageCache,
  generateImageSrcSet,
  getCachedImage,
  getImageCacheStats,
  getOptimizedImageURL,
  initImageCache,
  optimizeImage,
  preloadImages,
  uploadImage,
} from '../imageCDN';

jest.mock('../firebaseClient', () => ({
  ensureFirebase: jest.fn(),
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: {
    JPEG: 'jpeg',
    PNG: 'png',
    WEBP: 'webp',
  },
}));

jest.mock('expo-file-system', () => ({
  cacheDirectory: 'cache://',
  getInfoAsync: jest.fn(),
  makeDirectoryAsync: jest.fn(),
  downloadAsync: jest.fn(),
  readDirectoryAsync: jest.fn(),
  deleteAsync: jest.fn(),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

type StorageMap = Map<string, string>;

function installStorageMock(store: StorageMap) {
  (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
    store.has(key) ? (store.get(key) as string) : null
  );
  (AsyncStorage.setItem as jest.Mock).mockImplementation(async (key: string, value: string) => {
    store.set(key, value);
  });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation(async (key: string) => {
    store.delete(key);
  });
}

function makeFirebaseStorageMock(url = 'https://cdn.test/image.jpg') {
  const put = jest.fn(async () => undefined);
  const getDownloadURL = jest.fn(async () => url);
  const ref = jest.fn(() => ({
    put,
    getDownloadURL,
  }));

  return {
    fb: {
      storage: jest.fn(() => ({ ref })),
    },
    ref,
    put,
    getDownloadURL,
  };
}

describe('imageCDN', () => {
  let store: StorageMap;

  beforeEach(() => {
    jest.clearAllMocks();
    store = new Map<string, string>();
    installStorageMock(store);

    (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true, size: 0 });
    (FileSystem.makeDirectoryAsync as jest.Mock).mockResolvedValue(undefined);
    (FileSystem.downloadAsync as jest.Mock).mockImplementation(async (_url: string, path: string) => ({ uri: path }));
    (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
    (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);

    (ImageManipulator.manipulateAsync as jest.Mock).mockResolvedValue({
      uri: 'file://optimized.jpg',
      width: 600,
      height: 600,
    });

    (Platform as any).OS = 'ios';
    (global as any).fetch = jest.fn(async () => ({
      blob: async () => new Blob(['fake']),
    }));
  });

  describe('initImageCache', () => {
    it('creates cache directory when missing', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: false });
      await initImageCache();
      expect(FileSystem.makeDirectoryAsync).toHaveBeenCalledWith('cache://images/', { intermediates: true });
    });

    it('does not create directory when already present', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: true });
      await initImageCache();
      expect(FileSystem.makeDirectoryAsync).not.toHaveBeenCalled();
    });

    it('handles initialization errors', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockRejectedValueOnce(new Error('fs fail'));
      await expect(initImageCache()).resolves.toBeUndefined();
    });
  });

  describe('optimizeImage', () => {
    it('resizes image with jpeg format by default', async () => {
      const result = await optimizeImage('file://a.jpg', { width: 300, height: 200, quality: 80 });

      expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
        'file://a.jpg',
        [{ resize: { width: 300, height: 200 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );
      expect(result?.uri).toBe('file://optimized.jpg');
    });

    it('uses webp on android when requested', async () => {
      (Platform as any).OS = 'android';
      await optimizeImage('file://android.jpg', { format: 'webp' });
      expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
        'file://android.jpg',
        [],
        { compress: 0.9, format: ImageManipulator.SaveFormat.WEBP }
      );
    });

    it('uses png when requested', async () => {
      await optimizeImage('file://png.jpg', { format: 'png', quality: 70 });
      expect(ImageManipulator.manipulateAsync).toHaveBeenCalledWith(
        'file://png.jpg',
        [],
        { compress: 0.7, format: ImageManipulator.SaveFormat.PNG }
      );
    });

    it('returns null on optimization errors', async () => {
      (ImageManipulator.manipulateAsync as jest.Mock).mockRejectedValueOnce(new Error('opt fail'));
      await expect(optimizeImage('file://x.jpg')).resolves.toBeNull();
    });
  });

  describe('uploadImage', () => {
    it('returns error when firebase is unavailable', async () => {
      (ensureFirebase as jest.Mock).mockReturnValue(null);
      const result = await uploadImage('file://photo.jpg', 'checkins/u1/p1.jpg');
      expect(result).toEqual({ success: false, error: 'Firebase not initialized' });
    });

    it('uploads optimized image and returns download URL', async () => {
      const firebase = makeFirebaseStorageMock('https://cdn.test/success.jpg');
      (ensureFirebase as jest.Mock).mockReturnValue(firebase.fb);

      const result = await uploadImage('file://photo.jpg', 'checkins/u1/p1.jpg');

      expect(result).toEqual({ success: true, url: 'https://cdn.test/success.jpg' });
      expect(firebase.ref).toHaveBeenCalledWith('checkins/u1/p1.jpg');
      expect(firebase.put).toHaveBeenCalled();
      expect(firebase.getDownloadURL).toHaveBeenCalled();
    });

    it('returns optimization error when optimizeImage fails', async () => {
      const firebase = makeFirebaseStorageMock();
      (ensureFirebase as jest.Mock).mockReturnValue(firebase.fb);
      (ImageManipulator.manipulateAsync as jest.Mock).mockRejectedValueOnce(new Error('bad optimize'));

      const result = await uploadImage('file://bad.jpg', 'path.jpg');
      expect(result).toEqual({ success: false, error: 'Failed to optimize image' });
    });

    it('returns upload error when storage put fails', async () => {
      const firebase = makeFirebaseStorageMock();
      firebase.put.mockRejectedValueOnce(new Error('upload fail'));
      (ensureFirebase as jest.Mock).mockReturnValue(firebase.fb);

      const result = await uploadImage('file://photo.jpg', 'path.jpg');
      expect(result).toEqual({ success: false, error: 'Upload failed' });
    });
  });

  describe('URL and srcset helpers', () => {
    it('returns original URL from getOptimizedImageURL', () => {
      expect(getOptimizedImageURL('https://img.test/a.jpg', 'small')).toBe('https://img.test/a.jpg');
    });

    it('generates responsive srcset string', () => {
      const srcSet = generateImageSrcSet('https://img.test/a.jpg', ['small', 'medium', 'large']);
      expect(srcSet).toContain('https://img.test/a.jpg 300w');
      expect(srcSet).toContain('https://img.test/a.jpg 600w');
      expect(srcSet).toContain('https://img.test/a.jpg 1200w');
    });
  });

  describe('cacheImage/getCachedImage/preloadImages', () => {
    it('returns existing cached path when metadata is fresh', async () => {
      store.set(
        '@image_cache_metadata',
        JSON.stringify({
          abc: { uri: 'cache://images/abc', size: 123, timestamp: Date.now() },
        })
      );
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: true, size: 123 });

      const uri = await cacheImage('https://img.test/a.jpg', 'abc');

      expect(uri).toBe('cache://images/abc');
      expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
    });

    it('downloads and stores metadata when cache is stale', async () => {
      store.set(
        '@image_cache_metadata',
        JSON.stringify({
          stale: { uri: 'cache://images/stale', size: 10, timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000 },
        })
      );
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: true, size: 10 });

      const uri = await cacheImage('https://img.test/stale.jpg', 'stale');

      expect(uri).toBe('cache://images/stale');
      expect(FileSystem.downloadAsync).toHaveBeenCalledWith('https://img.test/stale.jpg', 'cache://images/stale');
      const metadata = JSON.parse(store.get('@image_cache_metadata') || '{}');
      expect(metadata.stale).toBeDefined();
    });

    it('downloads image when cache file does not exist', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: false, size: 0 });

      const uri = await cacheImage('https://img.test/new.jpg', 'new');

      expect(uri).toBe('cache://images/new');
      expect(FileSystem.downloadAsync).toHaveBeenCalled();
    });

    it('returns null when cacheImage fails', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockRejectedValueOnce(new Error('fs fail'));
      await expect(cacheImage('https://img.test/err.jpg', 'err')).resolves.toBeNull();
    });

    it('getCachedImage returns cached path on success', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: false, size: 0 });
      const result = await getCachedImage('https://img.test/a.jpg', 'medium');
      expect(result).toContain('cache://images/');
    });

    it('getCachedImage falls back to original URL on cache failure', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockRejectedValueOnce(new Error('fail'));
      const result = await getCachedImage('https://img.test/fallback.jpg', 'small');
      expect(result).toBe('https://img.test/fallback.jpg');
    });

    it('preloads multiple images', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false, size: 0 });
      await preloadImages(['https://img.test/1.jpg', 'https://img.test/2.jpg']);
      expect(FileSystem.downloadAsync).toHaveBeenCalledTimes(2);
    });

    it('preloadImages handles failures gracefully', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockRejectedValue(new Error('fail'));
      await expect(preloadImages(['https://img.test/1.jpg'])).resolves.toBeUndefined();
    });
  });

  describe('cache cleanup and stats', () => {
    it('clearImageCache returns 0 if directory is missing', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: false });
      await expect(clearImageCache()).resolves.toBe(0);
    });

    it('clearImageCache deletes files and clears metadata', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: true });
      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValueOnce(['a.jpg', 'b.jpg']);

      const deleted = await clearImageCache();

      expect(deleted).toBe(2);
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith('cache://images/a.jpg', { idempotent: true });
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@image_cache_metadata');
    });

    it('clearImageCache returns 0 on errors', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockRejectedValueOnce(new Error('boom'));
      await expect(clearImageCache()).resolves.toBe(0);
    });

    it('cleanupImageCache returns 0 when cache dir missing', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: false });
      await expect(cleanupImageCache()).resolves.toBe(0);
    });

    it('cleanupImageCache removes expired files', async () => {
      store.set(
        '@image_cache_metadata',
        JSON.stringify({
          'old.jpg': { uri: 'cache://images/old.jpg', size: 10, timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000 },
          'new.jpg': { uri: 'cache://images/new.jpg', size: 10, timestamp: Date.now() },
        })
      );
      (FileSystem.getInfoAsync as jest.Mock)
        .mockResolvedValueOnce({ exists: true }) // dir info
        .mockResolvedValueOnce({ exists: true, size: 10 }) // old.jpg
        .mockResolvedValueOnce({ exists: true, size: 10 }); // new.jpg
      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValueOnce(['old.jpg', 'new.jpg']);

      const deleted = await cleanupImageCache();
      expect(deleted).toBe(1);
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith('cache://images/old.jpg', { idempotent: true });
    });

    it('cleanupImageCache removes oldest files when over size limit', async () => {
      store.set(
        '@image_cache_metadata',
        JSON.stringify({
          'a.jpg': { uri: 'cache://images/a.jpg', size: 70 * 1024 * 1024, timestamp: Date.now() - 2000 },
          'b.jpg': { uri: 'cache://images/b.jpg', size: 70 * 1024 * 1024, timestamp: Date.now() - 1000 },
        })
      );
      (FileSystem.getInfoAsync as jest.Mock)
        .mockResolvedValueOnce({ exists: true }) // dir
        .mockResolvedValueOnce({ exists: true, size: 70 * 1024 * 1024 }) // a
        .mockResolvedValueOnce({ exists: true, size: 70 * 1024 * 1024 }); // b
      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValueOnce(['a.jpg', 'b.jpg']);

      const deleted = await cleanupImageCache();
      expect(deleted).toBe(1);
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith('cache://images/a.jpg', { idempotent: true });
    });

    it('cleanupImageCache returns 0 on errors', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockRejectedValueOnce(new Error('fail'));
      await expect(cleanupImageCache()).resolves.toBe(0);
    });

    it('getImageCacheStats returns zeroes when dir does not exist', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: false });
      await expect(getImageCacheStats()).resolves.toEqual({ fileCount: 0, totalSize: 0, oldestFile: 0 });
    });

    it('getImageCacheStats returns aggregate metrics', async () => {
      store.set(
        '@image_cache_metadata',
        JSON.stringify({
          'a.jpg': { uri: 'cache://images/a.jpg', size: 100, timestamp: 50 },
          'b.jpg': { uri: 'cache://images/b.jpg', size: 200, timestamp: 20 },
        })
      );
      (FileSystem.getInfoAsync as jest.Mock)
        .mockResolvedValueOnce({ exists: true })
        .mockResolvedValueOnce({ exists: true, size: 100 })
        .mockResolvedValueOnce({ exists: true, size: 200 });
      (FileSystem.readDirectoryAsync as jest.Mock).mockResolvedValueOnce(['a.jpg', 'b.jpg']);

      const stats = await getImageCacheStats();
      expect(stats.fileCount).toBe(2);
      expect(stats.totalSize).toBe(300);
      expect(stats.oldestFile).toBe(20);
    });

    it('getImageCacheStats handles errors', async () => {
      (FileSystem.getInfoAsync as jest.Mock).mockRejectedValueOnce(new Error('fail'));
      await expect(getImageCacheStats()).resolves.toEqual({ fileCount: 0, totalSize: 0, oldestFile: 0 });
    });
  });

  describe('batchUploadImages', () => {
    it('uploads all images and returns results', async () => {
      const firebase = makeFirebaseStorageMock();
      (ensureFirebase as jest.Mock).mockReturnValue(firebase.fb);

      const results = await batchUploadImages([
        { localUri: 'file://1.jpg', path: 'a/1.jpg' },
        { localUri: 'file://2.jpg', path: 'a/2.jpg' },
      ]);

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.success)).toBe(true);
      expect(firebase.ref).toHaveBeenCalledTimes(2);
    });

    it('returns mixed results when some uploads fail', async () => {
      const firebase = makeFirebaseStorageMock();
      (ensureFirebase as jest.Mock).mockReturnValue(firebase.fb);
      (ImageManipulator.manipulateAsync as jest.Mock)
        .mockResolvedValueOnce({ uri: 'file://ok.jpg', width: 600, height: 600 })
        .mockRejectedValueOnce(new Error('opt fail'));

      const results = await batchUploadImages([
        { localUri: 'file://ok.jpg', path: 'a/ok.jpg' },
        { localUri: 'file://bad.jpg', path: 'a/bad.jpg' },
      ]);

      expect(results[0].success).toBe(true);
      expect(results[1]).toEqual({ success: false, error: 'Failed to optimize image' });
    });
  });
});
