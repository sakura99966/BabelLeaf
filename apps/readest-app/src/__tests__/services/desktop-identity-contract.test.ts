import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('BabelLeaf desktop identity contract', () => {
  test('uses an isolated native identity and parks unverified OS integrations', () => {
    const tauriConfig = readSource('src-tauri/tauri.conf.json');
    const nativeBridge = readSource('src-tauri/plugins/tauri-plugin-native-bridge/src/desktop.rs');
    const nativeApp = readSource('src-tauri/src/lib.rs');
    const nativeBuild = readSource('src-tauri/build.rs');
    const androidGradle = readSource('src-tauri/gen/android/app/build.gradle.kts');
    const androidManifest = readSource('src-tauri/gen/android/app/src/main/AndroidManifest.xml');

    expect(tauriConfig).toContain('"productName": "BabelLeaf"');
    expect(tauriConfig).toContain('"mainBinaryName": "babelleaf"');
    expect(tauriConfig).toContain('"identifier": "io.github.sakura99966.babelleaf"');
    expect(tauriConfig).not.toContain('"installerHooks"');
    expect(tauriConfig).not.toContain('"deep-link"');
    expect(nativeBridge).toContain('const KEYRING_SERVICE: &str = "BabelLeaf Safe Storage";');
    expect(nativeApp).toContain('.title("BabelLeaf")');
    expect(nativeApp).not.toContain('sentry::init(');
    expect(nativeApp).not.toContain('sentry_config');
    expect(nativeBuild).not.toContain('propagate_sentry_dsn');
    expect(existsSync(resolve(process.cwd(), 'src-tauri/src/sentry_config.rs'))).toBe(false);
    expect(androidGradle).not.toMatch(/SENTRY_DSN|sentryDsn|sentry-android/);
    expect(androidManifest).not.toContain('io.sentry');
    expect(existsSync(resolve(process.cwd(), 'src-tauri/nsis/installer-hooks.nsh'))).toBe(false);
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
    expect(controlPanel).not.toContain('telemetry');
    expect(controlPanel).not.toContain('Help improve Readest');
  });

  test('isolates mobile bundle identities and removes retired mobile integrations', () => {
    const androidGradle = readSource('src-tauri/gen/android/app/build.gradle.kts');
    const androidManifest = readSource('src-tauri/gen/android/app/src/main/AndroidManifest.xml');
    const iosInfo = readSource('src-tauri/Info-ios.plist');
    const iosProject = readSource('src-tauri/gen/apple/project.yml');

    expect(androidGradle).toContain('namespace = "io.github.sakura99966.babelleaf"');
    expect(androidGradle).toContain('applicationId = "io.github.sakura99966.babelleaf"');
    expect(androidManifest).not.toContain('REQUEST_INSTALL_PACKAGES');
    expect(androidManifest).not.toContain('com.android.vending.BILLING');
    expect(androidManifest).not.toContain('web.readest.com');
    expect(androidManifest).not.toContain('readest-onedrive');
    expect(androidManifest).not.toContain('googleusercontent.apps');

    expect(iosInfo).toContain('<string>io.github.sakura99966.babelleaf</string>');
    expect(iosInfo).toContain('<string>babelleaf</string>');
    expect(iosInfo).not.toContain('readest-onedrive');
    expect(iosInfo).not.toContain('googleusercontent.apps');

    expect(iosProject).toContain('bundleIdPrefix: io.github.sakura99966.babelleaf');
    expect(iosProject).not.toContain('Sentry');
    expect(iosProject).not.toContain('ShareExtension');
    expect(iosProject).not.toContain('In-App Purchase');
  });
});
