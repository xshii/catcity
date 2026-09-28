import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const host = loadEnv(mode, process.cwd(), 'CAT_CITY_').CAT_CITY_PREVIEW_HOST;
  return {
    base: './',
    preview: { allowedHosts: host ? [host] : [] },
    build: {
      outDir: mode === 'test' ? 'dist-test' : 'dist',
      chunkSizeWarningLimit: 1600,
    },
    define: {
      __BUILD_VERSION__: JSON.stringify(
        process.env.BUILD_VERSION ?? '0.1.0-local',
      ),
    },
  };
});
