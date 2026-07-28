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
        fileAssociations: Array<{ name: string }>;
        windows: { webviewInstallMode: { type: string } };
      };
    };
    const nativeBuild = readSource('src-tauri/build.rs');
    const windowsConfig = readSource('src-tauri/tauri.windows.conf.json');
    const fileAssociationNames = tauriConfig.bundle.fileAssociations.map(({ name }) => name);
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
  });

  test('keeps the disabled desktop updater configuration valid at startup', () => {
    const tauriConfig = JSON.parse(readSource('src-tauri/tauri.conf.json')) as {
      bundle: { createUpdaterArtifacts: boolean };
      plugins: {
        updater?: {
          endpoints?: unknown;
          pubkey?: unknown;
        };
      };
    };
    const tauriEnvironment = readSource('.env.tauri');
    const updaterConfig = tauriConfig.plugins.updater;

    expect(tauriConfig.bundle.createUpdaterArtifacts).toBe(false);
    expect(tauriEnvironment).toContain('NEXT_PUBLIC_DISABLE_UPDATER=true');
    expect(tauriEnvironment).toContain('READEST_DISABLE_UPDATER=true');
    expect(updaterConfig).toBeDefined();
    expect(updaterConfig?.pubkey).toBe('');
    expect(updaterConfig?.endpoints).toEqual([]);
  });
});
