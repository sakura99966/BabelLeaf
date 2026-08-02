import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };
const originalPlatform = navigator.platform;

beforeEach(() => {
  vi.resetModules();
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, originalEnv);
  delete window.__READEST_CLI_ACCESS;
});

afterEach(() => {
  Object.defineProperty(navigator, 'platform', { value: originalPlatform, configurable: true });
});

describe('environment', () => {
  it('identifies the Tauri and web platforms from the build target', async () => {
    process.env['NEXT_PUBLIC_APP_PLATFORM'] = 'tauri';
    let environment = await import('@/services/environment');
    expect(environment.isTauriAppPlatform()).toBe(true);
    expect(environment.isWebAppPlatform()).toBe(false);

    vi.resetModules();
    process.env['NEXT_PUBLIC_APP_PLATFORM'] = 'web';
    environment = await import('@/services/environment');
    expect(environment.isTauriAppPlatform()).toBe(false);
    expect(environment.isWebAppPlatform()).toBe(true);
  });

  it('detects CLI access and platform shortcuts without a remote runtime config', async () => {
    const { getCommandPaletteShortcut, hasCli, isMacPlatform } = await import(
      '@/services/environment'
    );

    window.__READEST_CLI_ACCESS = true;
    expect(hasCli()).toBe(true);

    Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });
    expect(isMacPlatform()).toBe(true);
    expect(getCommandPaletteShortcut()).toContain('P');
  });

  it('detects installed web apps from display mode', async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn(() => ({ matches: true })) as unknown as typeof window.matchMedia;
    const { isPWA } = await import('@/services/environment');

    expect(isPWA()).toBe(true);
    window.matchMedia = originalMatchMedia;
  });
});
