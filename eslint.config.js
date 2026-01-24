// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    rules: {
      // Expo + TS path aliases (tsconfig `paths`) aren't resolved by eslint-import without extra resolver deps.
      'import/no-unresolved': 'off',
    },
  },
  {
    settings: {
      'import/resolver': {
        node: {
          extensions: [
            '.js',
            '.jsx',
            '.ts',
            '.tsx',
            '.d.ts',
            '.native.ts',
            '.native.tsx',
            '.web.ts',
            '.web.tsx',
          ],
        },
        typescript: {
          project: './tsconfig.json',
        },
      },
    },
  },
]);
