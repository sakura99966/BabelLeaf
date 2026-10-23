import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';
import { webdriverio } from '@vitest/browser-webdriverio';
import { loadEnvFile } from './vitest.env.mts';
import path from 'node:path';

// Load .env and .env.tauri so tauri tests have the same env as the desktop app.
const env = { ...loadEnvFile('.env'), ...loadEnvFile('.env.tauri'), CWD: process.cwd(), BABELLEAF_NATIVE_TEST_ROOT: process.env.BABELLEAF_NATIVE_TEST_ROOT };

export default defineConfig({
  plugins: [tsconfigPaths()],
  define: {
    'process.env': JSON.stringify(env),
  },
  resolve: {
    alias: {
      '@pdfjs': path.resolve(__dirname, 'public/vendor/pdfjs'),
      '@simplecc': path.resolve(__dirname, '../../packages/simplecc-wasm/dist/web'),
    },
    conditions: ['development'],
  },
  optimizeDeps: {
    include: [
      '@tauri-apps/plugin-fs',
      '@tauri-apps/plugin-http',
      '@tauri-apps/api/path',
      '@tauri-apps/api/core',
      '@tauri-apps/api/webviewWindow',
      '@zip.js/zip.js',
      'franc-min',
      'iso-639-2',
      'iso-639-3',
      'js-md5',
    ],
    exclude: [
      '@pdfjs/pdf.min.mjs',
      '@readest/turso-database-wasm',
      '@readest/turso-database-wasm-common',
      '@readest/turso-database-common',
    ],
  },
  test: {
    include: ['src/**/*.tauri.test.ts'],
    setupFiles: ['./vitest.tauri.setup.ts'],
    testTimeout: 30000,
    browser: {
      enabled: true,
      api: { host: '127.0.0.1' },
      provider: webdriverio({
        hostname: '127.0.0.1',
        port: 4445,
        capabilities: {
          browserName: 'chrome',
        } as WebdriverIO.Capabilities,
      }),
      instances: [{ browser: 'chrome' }],
    },
  },
});
