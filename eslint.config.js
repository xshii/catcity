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
      'coverage/**',
      '.npm-cache/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.node, ...globals.browser } } },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },
  {
    files: ['harness/runner/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/adapters',
                '**/adapters/**',
                '**/tasks',
                '**/tasks/**',
                '**/src',
                '**/src/**',
              ],
              message:
                'Keep game-specific composition in harness/run.ts; the runner uses injected contracts.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/application/**/*.ts', 'src/providers/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'phaser',
            '**/view',
            '**/view/**',
            '**/platform',
            '**/platform/**',
            '**/debug',
            '**/debug/**',
          ],
        },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage'],
    },
  },
  {
    files: ['src/application/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'phaser',
            '**/view',
            '**/view/**',
            '**/platform',
            '**/platform/**',
            '**/debug',
            '**/debug/**',
            '**/providers',
            '**/providers/**',
          ],
        },
      ],
    },
  },
  {
    files: ['src/core/**/*.ts', 'src/content/**/*.ts', 'src/minigames/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'phaser',
            'node:*',
            '**/view',
            '**/view/**',
            '**/platform',
            '**/platform/**',
            '**/application',
            '**/application/**',
            '**/providers',
            '**/providers/**',
            '**/debug',
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
