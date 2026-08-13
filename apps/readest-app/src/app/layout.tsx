import * as React from 'react';
import type { Metadata, Viewport } from 'next';
import { ViewTransitions } from 'next-view-transitions';
import { EnvProvider } from '@/context/EnvContext';
import Providers from '@/components/Providers';

import '../styles/globals.css';

const url = 'https://github.com/sakura99966/BabelLeaf';
const title = 'BabelLeaf — 本地优先的多语言阅读器';
const description =
  'BabelLeaf 是面向简体中文用户的本地优先阅读器，支持 EPUB、PDF、MOBI、漫画等内容，' +
  '并为中英日文阅读、自定义大模型翻译和双语对照能力持续演进。';

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title: {
    default: title,
    template: '%s | BabelLeaf',
  },
  description,
  generator: 'Next.js',
  manifest: '/manifest.json',
  keywords: ['babelleaf', 'epub', 'pdf', 'mobi', 'comic', 'ebook', 'reader', 'AI translation'],
  authors: [
    {
      name: 'BabelLeaf contributors',
      url,
    },
  ],
  icons: {
    icon: [{ url: '/icon.png' }, { url: '/favicon.ico' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: {
    capable: true,
    title: 'BabelLeaf',
    statusBarStyle: 'default',
  },
  openGraph: {
    type: 'website',
    url,
    title,
    description,
  },
  twitter: {
    card: 'summary',
    title,
    description,
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  // `interactive-widget=resizes-content` is appended client-side on
  // Android only — see Providers.tsx. Other browsers warn about the
  // unrecognized key on every page load, so we keep it out of SSR.
};

// In Tauri mobile dev the page origin doesn't match the dev server, so
// Next.js's `getSocketUrl` builds an unreachable HMR URL (see
// `next/dist/client/dev/hot-reloader/get-socket-url.js`):
//   - iOS sim:        page at `tauri://localhost`        → `wss://localhost/_next/...`
//     (no port, non-http scheme falls through to `wss:`)
//   - Android emul.:  page at `http://tauri.localhost`   → `ws://tauri.localhost/_next/...`
//     (`tauri.localhost` is intercepted by Tauri's asset handler, but
//     WebSocket frames bypass the interceptor and the dev server is on the
//     host machine, reachable from the emulator as `10.0.2.2`)
// Rewrite the WebSocket constructor before the HMR client runs.
// When `--host <ip>` is passed, tauri-cli exports `TAURI_DEV_HOST=<ip>`
// before invoking `beforeDevCommand`, so we forward that as `devHost` and
// use it for the rewrite (the dev server must also bind to the same address
// — typically `next dev -H 0.0.0.0`).
function patchTauriHmrWebSocket(devHost?: string) {
  const isIosTauriProxy = location.protocol === 'tauri:' && location.hostname === 'localhost';
  const isAndroidTauriProxy =
    location.protocol === 'http:' && location.hostname === 'tauri.localhost';
  if (!isIosTauriProxy && !isAndroidTauriProxy) return;

  // Priority: explicit --host > platform default loopback alias.
  // iOS Simulator can reach the host's localhost directly.
  // Android emulator reaches the host machine via 10.0.2.2.
  const hmrHost = devHost
    ? `${devHost}:3000`
    : isIosTauriProxy
      ? 'localhost:3000'
      : '10.0.2.2:3000';
  const brokenHostPattern = /^wss?:\/\/(localhost|tauri\.localhost)(?=\/_next\/)/;

  const OriginalWebSocket = window.WebSocket;
  class PatchedWebSocket extends OriginalWebSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      const urlStr = url instanceof URL ? url.href : url;
      const rewritten =
        typeof urlStr === 'string' && brokenHostPattern.test(urlStr)
          ? urlStr.replace(brokenHostPattern, `ws://${hmrHost}`)
          : url;
      super(rewritten, protocols);
    }
  }
  window.WebSocket = PatchedWebSocket;
}

const shouldInjectDevHmrPatch =
  process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_APP_PLATFORM === 'tauri';
const devHmrPatchScript = `(${patchTauriHmrWebSocket.toString()})(${JSON.stringify(
  process.env['TAURI_DEV_HOST'],
)});`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang='zh-CN'
      className={process.env.NEXT_PUBLIC_APP_PLATFORM === 'tauri' ? 'edge-to-edge' : ''}
    >
      <head>
        {shouldInjectDevHmrPatch ? (
          <script dangerouslySetInnerHTML={{ __html: devHmrPatchScript }} />
        ) : null}
      </head>
      <body>
        <ViewTransitions>
          <EnvProvider>
            <Providers>{children}</Providers>
          </EnvProvider>
        </ViewTransitions>
      </body>
    </html>
  );
}
