import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import { deviceLogPlugin } from './harness/runner/device-log';

export default defineConfig(({ mode, isPreview }) => {
  const host = loadEnv(mode, process.cwd(), 'CAT_CITY_').CAT_CITY_PREVIEW_HOST;
  return {
    base: './',
    // Only the phone try-out preview receives device debug logs (spec 015 step 3).
    plugins:
      isPreview && mode === 'device-log'
        ? [deviceLogPlugin(resolve('artifacts/device-logs'))]
        : [],
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
