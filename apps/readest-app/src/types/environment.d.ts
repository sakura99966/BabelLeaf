export {};

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NEXT_PUBLIC_APP_PLATFORM?: 'tauri' | 'web';
      NEXT_PUBLIC_BABELLEAF_E2E?: '1';
      NEXT_PUBLIC_BABELLEAF_E2E_DATA_ROOT?: string;
      NEXT_PUBLIC_DIST_CHANNEL?: string;
      NEXT_PUBLIC_PORTABLE_APP?: string;
    }
  }
}
