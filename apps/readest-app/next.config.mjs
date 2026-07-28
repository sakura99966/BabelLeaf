import withBundleAnalyzer from '@next/bundle-analyzer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDev = process.env['NODE_ENV'] === 'development';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: isDev ? undefined : 'export',
  productionBrowserSourceMaps: false,
  pageExtensions: ['jsx', 'tsx'],
  // Note: This feature is required to use the Next.js Image component in SSG mode.
  // See https://nextjs.org/docs/messages/export-image-api for different workarounds.
  images: {
    unoptimized: true,
  },
  devIndicators: false,
  experimental: {
    // Dev caching is on by default since Next 16.1. We deliberately do NOT
    // enable Turbopack's build cache (turbopackFileSystemCacheForBuild, beta):
    // a build interrupted mid-compile leaves a partial cache that the next
    // build mishandles, fanning out workers until it exhausts RAM.
    turbopackFileSystemCacheForDev: true,
  },
  // Configure assetPrefix or else the server won't properly resolve your assets.
  assetPrefix: '',
  reactStrictMode: true,
  serverExternalPackages: ['isows'],
  allowedDevOrigins: ['192.168.2.120'],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      nunjucks: 'nunjucks/browser/nunjucks.js',
      // `js-mdict` is consumed as TS source via tsconfig paths from
      // `packages/js-mdict/src/`; its sources `import 'fflate'` directly.
      // Without an alias, webpack walks up from that source location and
      // can't find fflate (only installed in this app's node_modules).
      fflate: path.resolve(__dirname, 'node_modules/fflate'),
      '@tursodatabase/database-wasm': false,
    };
    return config;
  },
  turbopack: {
    resolveAlias: {
      nunjucks: 'nunjucks/browser/nunjucks.js',
      // Turbopack rejects absolute paths in resolveAlias ("server relative
      // imports not implemented") — use a project-relative path.
      fflate: './node_modules/fflate',
      '@tursodatabase/database-wasm': './src/utils/stub.ts',
    },
  },
  transpilePackages: [
    'ai',
    'ai-sdk-ollama',
    '@ai-sdk/react',
    '@assistant-ui/react',
    '@assistant-ui/react-ai-sdk',
    '@assistant-ui/react-markdown',
    'streamdown',
    ...(isDev
      ? []
      : [
          'i18next-browser-languagedetector',
          'react-i18next',
          'i18next',
          '@tauri-apps',
          'highlight.js',
          'foliate-js',
          'marked',
        ]),
  ],
  async rewrites() {
    return [
      {
        source: '/reader/:ids',
        destination: '/reader?ids=:ids',
      },
      {
        source: '/o/book/:hash/annotation/:id',
        destination: '/o?book=:hash&note=:id',
      },
    ];
  },
};

const withAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
});

export default withAnalyzer(nextConfig);
