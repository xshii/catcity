import type { LocalPublicationConfig } from '../runner/local-publication';

export const localPreview: LocalPublicationConfig = {
  id: 'cat-city-local-preview',
  buildDirectory: 'dist',
  artifactDirectory: 'artifacts/publications',
  port: 4178,
  launch: {
    executable: process.execPath,
    args: [
      'node_modules/vite/bin/vite.js',
      'preview',
      '--outDir',
      '{site}',
      '--host',
      '0.0.0.0',
      '--port',
      '4178',
      '--strictPort',
    ],
  },
};
