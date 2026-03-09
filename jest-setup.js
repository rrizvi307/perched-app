/**
 * Jest setup file
 * Runs before each test suite
 */

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(() => Promise.resolve()),
  getItem: jest.fn(() => Promise.resolve(null)),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
  getAllKeys: jest.fn(() => Promise.resolve([])),
  multiSet: jest.fn(() => Promise.resolve()),
  multiGet: jest.fn(() => Promise.resolve([])),
  multiRemove: jest.fn(() => Promise.resolve()),
}));

// Mock NetInfo
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(() => Promise.resolve({ isConnected: true })),
  addEventListener: jest.fn(() => jest.fn()),
}));

// Mock Expo Localization
jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageTag: 'en-US' }]),
}));

// Mock Firebase
jest.mock('./services/firebaseClient', () => ({
  ensureFirebase: jest.fn(() => ({
    firestore: jest.fn(() => ({
      collection: jest.fn(() => ({
        doc: jest.fn(() => ({
          get: jest.fn(() => Promise.resolve({ exists: false, data: () => null })),
          set: jest.fn(() => Promise.resolve()),
          update: jest.fn(() => Promise.resolve()),
          delete: jest.fn(() => Promise.resolve()),
        })),
        where: jest.fn(() => ({
          get: jest.fn(() => Promise.resolve({ empty: true, docs: [] })),
        })),
        add: jest.fn(() => Promise.resolve({ id: 'mock-id' })),
        get: jest.fn(() => Promise.resolve({ empty: true, docs: [] })),
      })),
    })),
    auth: jest.fn(() => ({
      currentUser: null,
    })),
  })),
  getFirebaseUser: jest.fn(() => null),
}));

// Mock analytics
jest.mock('./services/analytics', () => ({
  track: jest.fn(),
  identify: jest.fn(),
}));

// Suppress console errors in tests (optional)
global.console = {
  ...console,
  error: jest.fn(),
  warn: jest.fn(),
};
