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

jest.mock('expo-file-system', () => {
  const ROOT_DIRS = new Set(['cache://', 'document://']);
  const directories = new Set<string>(ROOT_DIRS);
  const files = new Map<string, number>();

  const createDirectoryMock = jest.fn();
  const deleteFileMock = jest.fn();
  const downloadFileMock = jest.fn();
  const listDirectoryMock = jest.fn();
  const createFileMock = jest.fn();
  const writeFileMock = jest.fn();
  const copyFileMock = jest.fn();

  const toUri = (value: any) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (typeof value?.uri === 'string') return value.uri;
    return '';
  };

  const normalizeDirectoryUri = (uri: string) => {
    if (!uri) return uri;
    return uri.endsWith('/') && !uri.endsWith('://') ? uri.slice(0, -1) : uri;
  };

  const joinUri = (...parts: any[]) => {
    let current = '';
    for (const part of parts.map(toUri).filter(Boolean)) {
      if (!current) {
        current = part;
        continue;
      }
      const next = part.replace(/^\/+/, '');
      current = current.endsWith('/') ? `${current}${next}` : `${current}/${next}`;
    }
    return current;
  };

  const ensureParentDirectory = (uri: string) => {
    const index = uri.lastIndexOf('/');
    if (index <= 0) return;
    const parent = normalizeDirectoryUri(uri.slice(0, index));
    if (parent) directories.add(parent);
  };

  const installDownloadImplementation = (downloadMock: jest.Mock) => {
    downloadMock.mockImplementation(async (url: string, destination: any, options?: any) => {
      const file = destination instanceof File ? destination : new File(destination);
      downloadFileMock(url, file.uri, options);
      ensureParentDirectory(file.uri);
      if (!files.has(file.uri)) files.set(file.uri, 0);
      return file;
    });
  };

  class Directory {
    uri: string;

    constructor(...uris: any[]) {
      this.uri = normalizeDirectoryUri(joinUri(...uris));
    }

    get exists() {
      return directories.has(this.uri);
    }

    create(options?: any) {
      createDirectoryMock(this.uri, options);
      directories.add(this.uri);
    }

    list() {
      listDirectoryMock(this.uri);
      const prefix = `${this.uri}/`;
      return Array.from(files.keys())
        .filter((uri) => uri.startsWith(prefix) && !uri.slice(prefix.length).includes('/'))
        .map((uri) => new File(uri));
    }
  }

  const downloadFileAsync = jest.fn();

  class File {
    static downloadFileAsync = downloadFileAsync;
    uri: string;

    constructor(...uris: any[]) {
      this.uri = joinUri(...uris);
    }

    get name() {
      return this.uri.split('/').pop() || '';
    }

    get exists() {
      return files.has(this.uri);
    }

    get size() {
      return files.get(this.uri) ?? 0;
    }

    info() {
      return { exists: this.exists, size: this.size, uri: this.uri };
    }

    delete() {
      deleteFileMock(this.uri);
      files.delete(this.uri);
    }

    create(options?: any) {
      createFileMock(this.uri, options);
      ensureParentDirectory(this.uri);
      if (!files.has(this.uri) || options?.overwrite) {
        files.set(this.uri, files.get(this.uri) ?? 0);
      }
    }

    write(content: any, options?: any) {
      writeFileMock(this.uri, content, options);
      ensureParentDirectory(this.uri);
      const size = typeof content === 'string' ? content.length : content?.length ?? 0;
      files.set(this.uri, size);
    }

    copy(destination: any) {
      const target = destination instanceof File ? destination : new File(destination);
      copyFileMock(this.uri, target.uri);
      ensureParentDirectory(target.uri);
      files.set(target.uri, files.get(this.uri) ?? 0);
    }
  }

  const Paths = {
    cache: { uri: 'cache://' },
    document: { uri: 'document://' },
  };

  const reset = () => {
    directories.clear();
    ROOT_DIRS.forEach((uri) => directories.add(uri));
    files.clear();
    createDirectoryMock.mockReset();
    deleteFileMock.mockReset();
    downloadFileMock.mockReset();
    listDirectoryMock.mockReset();
    createFileMock.mockReset();
    writeFileMock.mockReset();
    copyFileMock.mockReset();
    downloadFileAsync.mockReset();
    installDownloadImplementation(downloadFileAsync);
  };

  const setDirExists = (uri: string, exists: boolean) => {
    const normalized = normalizeDirectoryUri(uri);
    if (exists) {
      directories.add(normalized);
    } else {
      directories.delete(normalized);
    }
  };

  const setFile = (uri: string, size = 0) => {
    ensureParentDirectory(uri);
    files.set(uri, size);
  };

  reset();

  return {
    Directory,
    File,
    Paths,
    __mock: {
      reset,
      setDirExists,
      setFile,
      createDirectoryMock,
      deleteFileMock,
      downloadFileMock,
      listDirectoryMock,
      createFileMock,
      writeFileMock,
      copyFileMock,
      downloadFileAsync,
    },
  };
});

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

type StorageMap = Map<string, string>;
const fsMock = (FileSystem as any).__mock as {
  reset: () => void;
  setDirExists: (uri: string, exists: boolean) => void;
  setFile: (uri: string, size?: number) => void;
  createDirectoryMock: jest.Mock;
  deleteFileMock: jest.Mock;
  downloadFileMock: jest.Mock;
  downloadFileAsync: jest.Mock;
};
const CACHE_DIR_URI = 'cache://images';
const cacheFileUri = (name: string) => `${CACHE_DIR_URI}/${name}`;

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
    fsMock.reset();
    fsMock.setDirExists(CACHE_DIR_URI, true);

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
      fsMock.setDirExists(CACHE_DIR_URI, false);
      await initImageCache();
      expect(fsMock.createDirectoryMock).toHaveBeenCalledWith(CACHE_DIR_URI, {
        idempotent: true,
        intermediates: true,
      });
    });

    it('does not create directory when already present', async () => {
      await initImageCache();
      expect(fsMock.createDirectoryMock).not.toHaveBeenCalled();
    });

    it('handles initialization errors', async () => {
      fsMock.setDirExists(CACHE_DIR_URI, false);
      fsMock.createDirectoryMock.mockImplementationOnce(() => {
        throw new Error('fs fail');
      });
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
      fsMock.setFile(cacheFileUri('abc'), 123);

      const uri = await cacheImage('https://img.test/a.jpg', 'abc');

      expect(uri).toBe('cache://images/abc');
      expect(fsMock.downloadFileAsync).not.toHaveBeenCalled();
    });

    it('downloads and stores metadata when cache is stale', async () => {
      store.set(
        '@image_cache_metadata',
        JSON.stringify({
          stale: { uri: 'cache://images/stale', size: 10, timestamp: Date.now() - 8 * 24 * 60 * 60 * 1000 },
        })
      );
      fsMock.setFile(cacheFileUri('stale'), 10);

      const uri = await cacheImage('https://img.test/stale.jpg', 'stale');

      expect(uri).toBe('cache://images/stale');
      expect(fsMock.downloadFileMock).toHaveBeenCalledWith(
        'https://img.test/stale.jpg',
        'cache://images/stale',
        { idempotent: true }
      );
      const metadata = JSON.parse(store.get('@image_cache_metadata') || '{}');
      expect(metadata.stale).toBeDefined();
    });

    it('downloads image when cache file does not exist', async () => {
      const uri = await cacheImage('https://img.test/new.jpg', 'new');

      expect(uri).toBe('cache://images/new');
      expect(fsMock.downloadFileAsync).toHaveBeenCalled();
    });

    it('returns null when cacheImage fails', async () => {
      fsMock.downloadFileAsync.mockRejectedValueOnce(new Error('fs fail'));
      await expect(cacheImage('https://img.test/err.jpg', 'err')).resolves.toBeNull();
    });

    it('getCachedImage returns cached path on success', async () => {
      const result = await getCachedImage('https://img.test/a.jpg', 'medium');
      expect(result).toContain('cache://images/');
    });

    it('getCachedImage falls back to original URL on cache failure', async () => {
      fsMock.downloadFileAsync.mockRejectedValueOnce(new Error('fail'));
      const result = await getCachedImage('https://img.test/fallback.jpg', 'small');
      expect(result).toBe('https://img.test/fallback.jpg');
    });

    it('preloads multiple images', async () => {
      await preloadImages(['https://img.test/1.jpg', 'https://img.test/2.jpg']);
      expect(fsMock.downloadFileAsync).toHaveBeenCalledTimes(2);
    });

    it('preloadImages handles failures gracefully', async () => {
      fsMock.downloadFileAsync.mockRejectedValue(new Error('fail'));
      await expect(preloadImages(['https://img.test/1.jpg'])).resolves.toBeUndefined();
    });
  });

  describe('cache cleanup and stats', () => {
    it('clearImageCache returns 0 if directory is missing', async () => {
      fsMock.setDirExists(CACHE_DIR_URI, false);
      await expect(clearImageCache()).resolves.toBe(0);
    });

    it('clearImageCache deletes files and clears metadata', async () => {
      fsMock.setFile(cacheFileUri('a.jpg'), 12);
      fsMock.setFile(cacheFileUri('b.jpg'), 18);

      const deleted = await clearImageCache();

      expect(deleted).toBe(2);
      expect(fsMock.deleteFileMock).toHaveBeenCalledWith('cache://images/a.jpg');
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@image_cache_metadata');
    });

    it('clearImageCache returns 0 on errors', async () => {
      const existsSpy = jest.spyOn(FileSystem.Directory.prototype, 'exists', 'get').mockImplementationOnce(() => {
        throw new Error('boom');
      });
      await expect(clearImageCache()).resolves.toBe(0);
      existsSpy.mockRestore();
    });

    it('cleanupImageCache returns 0 when cache dir missing', async () => {
      fsMock.setDirExists(CACHE_DIR_URI, false);
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
      fsMock.setFile(cacheFileUri('old.jpg'), 10);
      fsMock.setFile(cacheFileUri('new.jpg'), 10);

      const deleted = await cleanupImageCache();
      expect(deleted).toBe(1);
      expect(fsMock.deleteFileMock).toHaveBeenCalledWith('cache://images/old.jpg');
    });

    it('cleanupImageCache removes oldest files when over size limit', async () => {
      store.set(
        '@image_cache_metadata',
        JSON.stringify({
          'a.jpg': { uri: 'cache://images/a.jpg', size: 70 * 1024 * 1024, timestamp: Date.now() - 2000 },
          'b.jpg': { uri: 'cache://images/b.jpg', size: 70 * 1024 * 1024, timestamp: Date.now() - 1000 },
        })
      );
      fsMock.setFile(cacheFileUri('a.jpg'), 70 * 1024 * 1024);
      fsMock.setFile(cacheFileUri('b.jpg'), 70 * 1024 * 1024);

      const deleted = await cleanupImageCache();
      expect(deleted).toBe(1);
      expect(fsMock.deleteFileMock).toHaveBeenCalledWith('cache://images/a.jpg');
    });

    it('cleanupImageCache returns 0 on errors', async () => {
      const existsSpy = jest.spyOn(FileSystem.Directory.prototype, 'exists', 'get').mockImplementationOnce(() => {
        throw new Error('fail');
      });
      await expect(cleanupImageCache()).resolves.toBe(0);
      existsSpy.mockRestore();
    });

    it('getImageCacheStats returns zeroes when dir does not exist', async () => {
      fsMock.setDirExists(CACHE_DIR_URI, false);
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
      fsMock.setFile(cacheFileUri('a.jpg'), 100);
      fsMock.setFile(cacheFileUri('b.jpg'), 200);

      const stats = await getImageCacheStats();
      expect(stats.fileCount).toBe(2);
      expect(stats.totalSize).toBe(300);
      expect(stats.oldestFile).toBe(20);
    });

    it('getImageCacheStats handles errors', async () => {
      const existsSpy = jest.spyOn(FileSystem.Directory.prototype, 'exists', 'get').mockImplementationOnce(() => {
        throw new Error('fail');
      });
      await expect(getImageCacheStats()).resolves.toEqual({ fileCount: 0, totalSize: 0, oldestFile: 0 });
      existsSpy.mockRestore();
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
