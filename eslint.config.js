import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'dist-test/**',
      'artifacts/**',
      'test-results/**',
      'playwright-report/**',
      '.npm-cache/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  {
    files: ['src/core/**/*.ts', 'src/content/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'phaser',
            'node:*',
            '**/view/**',
            '**/platform/**',
            '**/application/**',
            '**/providers/**',
            '**/debug/**',
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'fetch',
        'Date',
        'performance',
        'setTimeout',
        'setInterval',
        'crypto',
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use RandomService with persisted state.',
        },
      ],
    },
  },
);
