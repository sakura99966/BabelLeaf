import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const projectPath = (path: string) => resolve(process.cwd(), path);
const readSource = (path: string) => readFileSync(projectPath(path), 'utf8');

describe('BabelLeaf local runtime contract', () => {
  test('does not initialize telemetry or account and cloud sync providers', () => {
    const providers = readSource('src/components/Providers.tsx');
    const environment = readSource('src/context/EnvContext.tsx');

    for (const forbidden of [
      'posthog-js',
      'CSPostHogProvider',
      'TelemetryConsentDialog',
      'AuthProvider',
      'SyncProvider',
      'initSettingsSync',
    ]) {
      expect(providers).not.toContain(forbidden);
    }
    expect(environment).not.toContain('@/services/sync/');
  });

  test('does not ship hosted-service dependencies in the native application', () => {
    const appPackage = JSON.parse(readSource('package.json')) as {
      dependencies: Record<string, string>;
    };

    for (const dependency of [
      '@opennextjs/cloudflare',
      '@sentry/cli',
      '@stripe/react-stripe-js',
      '@stripe/stripe-js',
      '@supabase/auth-ui-react',
      '@supabase/auth-ui-shared',
      '@supabase/supabase-js',
      'posthog-js',
      'stripe',
    ]) {
      expect(appPackage.dependencies).not.toHaveProperty(dependency);
    }
  });

  test('does not retain hosted API, browser extension, or cloud worker projects', () => {
    for (const path of [
      'src/app/api',
      'src/pages/api',
      'extensions/send-to-readest',
      'workers/iap-reconcile',
      'workers/send-email',
    ]) {
      expect(existsSync(projectPath(path)), `${path} should be removed`).toBe(false);
    }
  });

  test('does not retain retired cloud, sync, feed, or account frontend modules', () => {
    for (const path of [
      'src/services/sync',
      'src/services/opds',
      'src/services/rss',
      'src/services/transferManager.ts',
      'src/services/transferMessages.ts',
      'src/hooks/useSync.ts',
      'src/hooks/useReplicaPull.ts',
      'src/hooks/useTransferQueue.ts',
      'src/hooks/useDiscordPresence.ts',
      'src/libs/shareImport.ts',
      'src/store/customOPDSStore.ts',
      'src/store/feedStore.ts',
      'src/store/fileSyncStore.ts',
      'src/store/transferStore.ts',
      'src/utils/discord.ts',
      'src/app/reader/components/KOSyncResolver.tsx',
    ]) {
      expect(existsSync(projectPath(path)), `${path} should be removed`).toBe(false);
    }

    const ingress = readSource('src/hooks/useAppUrlIngress.ts');
    const annotator = readSource('src/app/reader/components/annotator/Annotator.tsx');
    expect(ingress).not.toContain('@/services/sync/');
    expect(ingress).toContain("'shared-intent'");
    expect(ingress).toContain("'app-incoming-url'");
    expect(annotator).toContain('@/utils/share');
  });

  test('does not expose retired account, billing, clipping, or sync commands through native code', () => {
    const nativeBridgeBuild = readSource('src-tauri/plugins/tauri-plugin-native-bridge/build.rs');
    const nativeBridgeEntry = readSource('src-tauri/plugins/tauri-plugin-native-bridge/src/lib.rs');
    const tauriEntry = readSource('src-tauri/src/lib.rs');

    for (const forbidden of [
      'auth_with_safari',
      'auth_with_custom_tab',
      'iap_is_available',
      'iap_initialize',
      'iap_fetch_products',
      'iap_purchase_product',
      'iap_restore_purchases',
      'get_storefront_region_code',
      'set_sync_passphrase',
      'get_sync_passphrase',
      'clear_sync_passphrase',
      'is_sync_keychain_available',
      'clip_url',
      'install_package',
    ]) {
      expect(nativeBridgeBuild).not.toContain(forbidden);
      expect(nativeBridgeEntry).not.toContain(forbidden);
    }

    expect(tauriEntry).not.toContain('alipays');
    expect(tauriEntry).not.toContain('alipay');
    expect(
      existsSync(
        projectPath(
          'src-tauri/plugins/tauri-plugin-native-bridge/android/src/main/java/ClipUrlController.kt',
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        projectPath(
          'src-tauri/plugins/tauri-plugin-native-bridge/ios/Sources/ClipUrlController.swift',
        ),
      ),
    ).toBe(false);
    expect(
      existsSync(
        projectPath(
          'src-tauri/plugins/tauri-plugin-native-bridge/ios/Sources/StoreKitManager.swift',
        ),
      ),
    ).toBe(false);
  });
});
