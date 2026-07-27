import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('BabelLeaf desktop identity contract', () => {
  test('uses an isolated native identity and parks unverified OS integrations', () => {
    const tauriConfig = readSource('src-tauri/tauri.conf.json');
    const nativeBridge = readSource('src-tauri/plugins/tauri-plugin-native-bridge/src/desktop.rs');
    const nativeApp = readSource('src-tauri/src/lib.rs');
    const nativeBuild = readSource('src-tauri/build.rs');
    const sentryConfig = readSource('src-tauri/src/sentry_config.rs');
    const androidGradle = readSource('src-tauri/gen/android/app/build.gradle.kts');
    const androidManifest = readSource('src-tauri/gen/android/app/src/main/AndroidManifest.xml');
    const parkedNsisHook = readSource('src-tauri/nsis/installer-hooks.nsh');

    expect(tauriConfig).toContain('"productName": "BabelLeaf"');
    expect(tauriConfig).toContain('"mainBinaryName": "babelleaf"');
    expect(tauriConfig).toContain('"identifier": "io.github.sakura99966.babelleaf"');
    expect(tauriConfig).not.toContain('"installerHooks"');
    expect(tauriConfig).not.toContain('"deep-link"');
    expect(nativeBridge).toContain('const KEYRING_SERVICE: &str = "BabelLeaf Safe Storage";');
    expect(nativeApp).toContain('.title("BabelLeaf")');
    expect(nativeApp).not.toContain('sentry::init(');
    expect(nativeBuild).not.toContain('propagate_sentry_dsn');
    expect(sentryConfig).not.toContain('SENTRY_DSN');
    expect(sentryConfig).toMatch(
      /pub extern "C" fn readest_sentry_dsn\(\)[\s\S]*?std::ptr::null\(\)/,
    );
    expect(androidGradle).not.toMatch(/SENTRY_DSN|sentryDsn|sentry-android/);
    expect(androidManifest).not.toContain('io.sentry');
    expect(parkedNsisHook).toContain('!error');
    expect(parkedNsisHook).not.toContain('{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}');
  });

  test('uses BabelLeaf in directly visible app surfaces and retains upstream attribution', () => {
    const layout = readSource('src/app/layout.tsx');
    const libraryMenu = readSource('src/app/library/components/SettingsMenu.tsx');
    const readerMenu = readSource('src/app/reader/components/sidebar/BookMenu.tsx');
    const aboutWindow = readSource('src/components/AboutWindow.tsx');
    const appLock = readSource('src/components/AppLockScreen.tsx');
    const commandRegistry = readSource('src/services/commandRegistry.ts');
    const controlPanel = readSource('src/components/settings/ControlPanel.tsx');

    expect(layout).toContain("const title = 'BabelLeaf");
    expect(layout).not.toContain('Readest');
    expect(libraryMenu).toContain("label={_('About BabelLeaf')}");
    expect(libraryMenu).not.toContain("label={_('About Readest')}");
    expect(readerMenu).toContain("label={_('About BabelLeaf')}");
    expect(readerMenu).not.toContain("label={_('About Readest')}");
    expect(aboutWindow).toContain('Derived from Readest');
    expect(aboutWindow).toContain('Bilingify LLC');
    expect(appLock).toContain('Unlock BabelLeaf');
    expect(appLock).not.toContain('Unlock Readest');
    expect(commandRegistry).toContain("labelKey: _('About BabelLeaf')");
    expect(controlPanel).toContain("isNetworkCapabilityAllowed('telemetry')");
    expect(controlPanel).not.toContain('Help improve Readest');
  });
});
