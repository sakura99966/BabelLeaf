import type { AppService } from '@/types/system';

declare global {
  interface Window {
    __READEST_CLI_ACCESS?: boolean;
    __BABELLEAF_WEBDRIVER__?: boolean;
    __BABELLEAF_E2E_FILE_SELECTION?: string[];
    __BABELLEAF_WEBDRIVER_INVOKE_FAILURES__?: Array<{ command: string; error: string }>;
    __BABELLEAF_WEBDRIVER_TRAFFIC__?: Array<{ kind: string; target: string }>;
  }
}

// NEXT_PUBLIC variables must use direct property access in browser code so
// Next.js can replace them at build time. Dynamic bracket access survives into
// the client bundle as `process.env[...]`, where the value is unavailable and
// silently routes a Tauri window through WebAppService.
export const isTauriAppPlatform = () => process.env.NEXT_PUBLIC_APP_PLATFORM === 'tauri';
export const isWebAppPlatform = () => process.env.NEXT_PUBLIC_APP_PLATFORM === 'web';
export const hasCli = () => window.__READEST_CLI_ACCESS === true;
export const isPWA = () => window.matchMedia('(display-mode: standalone)').matches;
export const isMacPlatform = () =>
  typeof window !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

export const getCommandPaletteShortcut = () => (isMacPlatform() ? '⌘⇧P' : 'Ctrl+Shift+P');

export interface EnvConfigType {
  getAppService: () => Promise<AppService>;
}

let nativeAppService: AppService | null = null;
const getNativeAppService = async () => {
  if (!nativeAppService) {
    const { NativeAppService } = await import('@/services/nativeAppService');
    // The native test runners must never reuse the real BabelLeaf profile.
    // Keep the override behind both a compile-time E2E flag and the
    // webdriver-only marker injected by Rust, so neither a production build
    // nor an ordinary browser window can redirect user data through an env
    // variable alone.
    const testDataRoot =
      process.env.NEXT_PUBLIC_BABELLEAF_E2E === '1' && window.__BABELLEAF_WEBDRIVER__ === true
        ? process.env.NEXT_PUBLIC_BABELLEAF_E2E_DATA_ROOT
        : undefined;
    nativeAppService = new NativeAppService(testDataRoot);
    await nativeAppService.init();
  }
  return nativeAppService;
};

let webAppService: AppService | null = null;
const getWebAppService = async () => {
  if (!webAppService) {
    const { WebAppService } = await import('@/services/webAppService');
    webAppService = new WebAppService();
    await webAppService.init();
  }
  return webAppService;
};

const environmentConfig: EnvConfigType = {
  getAppService: async () => {
    if (isTauriAppPlatform()) {
      return getNativeAppService();
    } else {
      return getWebAppService();
    }
  },
};

/**
 * Synchronously returns the app service if it has already been created by
 * {@link environmentConfig.getAppService}; null before first init. The async
 * getter is preferred everywhere — use this only from synchronous code paths
 * that run well after startup (e.g. capability checks during reader render),
 * where the singleton is guaranteed to exist.
 */
export const getInitializedAppService = (): AppService | null => nativeAppService ?? webAppService;

export default environmentConfig;
