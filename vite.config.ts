import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  build: {
    outDir: mode === 'test' ? 'dist-test' : 'dist',
    chunkSizeWarningLimit: 1600,
  },
  define: {
    __BUILD_VERSION__: JSON.stringify(
      process.env.BUILD_VERSION ?? '0.1.0-local',
    ),
  },
}));
