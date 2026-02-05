#!/usr/bin/env node

/**
 * Remove console.logs in production builds
 * Run this as part of the build process
 */

// Disable console in production
if (__DEV__ === false) {
  console.log = () => {};
  console.debug = () => {};
  console.warn = () => {};
  // Keep console.error for critical issues
}

// Also export a babel plugin config
module.exports = {
  presets: ['module:metro-react-native-babel-preset'],
  plugins: [
    [
      'transform-remove-console',
      {
        exclude: ['error', 'warn'],
      },
    ],
  ],
  env: {
    production: {
      plugins: ['transform-remove-console'],
    },
  },
};
