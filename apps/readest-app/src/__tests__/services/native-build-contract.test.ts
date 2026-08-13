import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const readRustVersion = (manifest: string) => manifest.match(/^rust-version = "([^"]+)"$/m)?.[1];

describe('BabelLeaf native build contract', () => {
  test('aligns the application MSRV with the vendored Tauri workspace', () => {
    const rootManifest = readSource('../../Cargo.toml');
    const appManifest = readSource('src-tauri/Cargo.toml');
    const tauriManifest = readSource('../../packages/tauri/Cargo.toml');
    const tauriRustVersion = readRustVersion(tauriManifest);

    expect(tauriRustVersion).toBeDefined();
    expect(readRustVersion(rootManifest)).toBe(tauriRustVersion);
    expect(readRustVersion(appManifest)).toBe(tauriRustVersion);
  });

  test('builds the Windows x64 target and excludes the parked Readest shell extension', () => {
    const appPackage = JSON.parse(readSource('package.json')) as {
      version: string;
      scripts: Record<string, string>;
    };
    const appManifest = readSource('src-tauri/Cargo.toml');
    const tauriConfig = JSON.parse(readSource('src-tauri/tauri.conf.json')) as {
      bundle: {
        fileAssociations: Array<{ name: string; ext: string[] }>;
        windows: { webviewInstallMode: { type: string } };
      };
    };
    const nativeBuild = readSource('src-tauri/build.rs');
    const windowsConfig = readSource('src-tauri/tauri.windows.conf.json');
    const fileAssociationNames = tauriConfig.bundle.fileAssociations.map(({ name }) => name);
    const associatedExtensions = tauriConfig.bundle.fileAssociations.flatMap(({ ext }) => ext);
    const signedBuild = appPackage.scripts['build-win-x64'];
    const unsignedBuild = appPackage.scripts['build-win-x64:unsigned'];

    expect(appPackage.version).not.toBe('0.11.20');
    expect(appManifest).toContain(`version = "${appPackage.version}"`);
    for (const buildScript of [signedBuild, unsignedBuild]) {
      expect(buildScript).toContain('x86_64-pc-windows-msvc');
      expect(buildScript).toContain('--locked');
    }
    expect(unsignedBuild).toContain('--no-sign');
    expect(nativeBuild).not.toContain('build_windows_thumbnail');
    expect(windowsConfig).not.toContain('readest_thumbnail.dll');
    expect(tauriConfig.bundle.windows.webviewInstallMode.type).toBe('offlineInstaller');
    expect(fileAssociationNames.length).toBeGreaterThan(0);
    expect(new Set(fileAssociationNames).size).toBe(fileAssociationNames.length);
    expect(fileAssociationNames.every((name) => name.startsWith('BabelLeaf.'))).toBe(true);
    expect(new Set(associatedExtensions)).toEqual(
      new Set(['epub', 'mobi', 'azw', 'azw3', 'fb2', 'fbz', 'cbz', 'pdf', 'txt', 'md', 'markdown']),
    );
    expect(readSource('src-tauri/src/lib.rs')).toContain('.min_inner_size(480.0, 360.0)');
  });

  test('does not package the removed desktop updater', () => {
    const tauriConfig = JSON.parse(readSource('src-tauri/tauri.conf.json')) as {
      bundle: { createUpdaterArtifacts: boolean };
      plugins: Record<string, unknown>;
    };
    const appPackage = JSON.parse(readSource('package.json')) as {
      dependencies: Record<string, string>;
    };
    const appManifest = readSource('src-tauri/Cargo.toml');
    const rustEntry = readSource('src-tauri/src/lib.rs');
    const tauriEnvironment = readSource('.env.tauri');

    expect(tauriConfig.bundle.createUpdaterArtifacts).toBe(false);
    expect(tauriConfig.plugins).not.toHaveProperty('updater');
    expect(appPackage.dependencies).not.toHaveProperty('@tauri-apps/plugin-updater');
    expect(appManifest).not.toContain('tauri-plugin-updater');
    expect(rustEntry).not.toContain('tauri_plugin_updater');
    expect(tauriEnvironment).not.toContain('DISABLE_UPDATER');
  });

  test('keeps browser-visible NEXT_PUBLIC build variables statically analyzable', () => {
    const clientBuildSources = [
      readSource('src/services/environment.ts'),
      readSource('src/services/nativeAppService.ts'),
      readSource('src/app/layout.tsx'),
    ];

    for (const source of clientBuildSources) {
      expect(source).not.toMatch(/process\.env\[['"]NEXT_PUBLIC_/);
    }
    expect(clientBuildSources[0]).toContain('process.env.NEXT_PUBLIC_APP_PLATFORM');
  });

  test('keeps deterministic file selection behind both native and browser test gates', () => {
    const nativeService = readSource('src/services/nativeAppService.ts');
    const environmentService = readSource('src/services/environment.ts');
    const rustEntry = readSource('src-tauri/src/lib.rs');

    expect(nativeService).toContain("process.env.NEXT_PUBLIC_BABELLEAF_E2E === '1'");
    expect(nativeService).toContain('window.__BABELLEAF_WEBDRIVER__ === true');
    expect(environmentService).toMatch(
      /process\.env\.NEXT_PUBLIC_BABELLEAF_E2E === '1'[\s\S]{0,160}window\.__BABELLEAF_WEBDRIVER__ === true[\s\S]{0,160}process\.env\.NEXT_PUBLIC_BABELLEAF_E2E_DATA_ROOT/,
    );
    expect(rustEntry).toContain('__BABELLEAF_WEBDRIVER_TRAFFIC__');
    expect(rustEntry).toContain('BABELLEAF_WEBDRIVER_WEBVIEW_DATA_DIR');
    expect(rustEntry).toContain('BABELLEAF_WEBDRIVER_EXIT_FILE');
    expect(readSource('scripts/test-tauri.mjs')).toContain('BABELLEAF_WEBDRIVER_WEBVIEW_DATA_DIR');
    expect(readSource('scripts/test-tauri.mjs')).toContain('BABELLEAF_WEBDRIVER_EXIT_FILE');
    expect(readSource('scripts/test-wdio.mjs')).toContain('BABELLEAF_WEBDRIVER_WEBVIEW_DATA_DIR');
    expect(rustEntry).toContain('#[cfg(all(desktop, not(feature = "webdriver")))]');
    expect(rustEntry).toMatch(
      /any\(target_os = "windows", target_os = "linux"\),\s*not\(feature = "webdriver"\)[\s\S]{0,180}register_all/,
    );
    expect(rustEntry).toMatch(
      /#\[cfg\(feature = "webdriver"\)\][\s\S]{0,2400}__BABELLEAF_WEBDRIVER__/,
    );
  });

  test('keeps portable desktop state out of the installed application profile', () => {
    const nativeService = readSource('src/services/nativeAppService.ts');
    const rustEntry = readSource('src-tauri/src/lib.rs');

    expect(nativeService).toMatch(
      /case 'Cache':[\s\S]{0,240}customBaseDir \?\? BaseDirectory\.AppCache[\s\S]{0,240}\/Cache/,
    );
    expect(rustEntry).toMatch(
      /directory[\s\S]{0,80}join\("settings\.json"\)[\s\S]{0,80}is_file\(\)/,
    );
    expect(rustEntry).toContain('TargetKind::Folder');
    expect(rustEntry).toContain('directory.join("logs")');
    expect(rustEntry).toContain('directory.join("EBWebView")');
    expect(rustEntry).toMatch(
      /if is_portable_runtime \{\s*builder\s*\} else \{\s*builder\.plugin\(tauri_plugin_persisted_scope::init\(\)\)/,
    );
    expect(rustEntry).toMatch(/if !is_portable_runtime \{[\s\S]{0,180}register_all\(\)/);
  });

  test('grants the Windows memory target command to local and WebDriver windows', () => {
    const nativeBuild = readSource('src-tauri/build.rs');
    const defaultCapability = readSource('src-tauri/capabilities/default.json');
    const webdriverCapability = readSource('src-tauri/capabilities/webdriver-remote.json');
    const rustEntry = readSource('src-tauri/src/lib.rs');

    expect(rustEntry).toContain('windows::set_webview_memory_usage');
    expect(nativeBuild).toContain('"set_webview_memory_usage"');
    expect(defaultCapability).toContain('"allow-set-webview-memory-usage"');
    expect(webdriverCapability).toContain('"allow-set-webview-memory-usage"');
    expect(webdriverCapability).toContain('"process:allow-exit"');
  });
});
