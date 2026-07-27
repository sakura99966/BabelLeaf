import { beforeEach, describe, expect, test, vi } from 'vitest';

const updaterMocks = vi.hoisted(() => ({
  check: vi.fn(),
  fetch: vi.fn(),
  osType: vi.fn(() => 'windows'),
  setUpdaterWindowVisible: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: updaterMocks.check,
}));

vi.mock('@tauri-apps/plugin-os', () => ({
  type: updaterMocks.osType,
  arch: () => 'x86_64',
}));

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: updaterMocks.fetch,
}));

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  WebviewWindow: class {},
}));

vi.mock('@/components/UpdaterWindow', () => ({
  setUpdaterWindowVisible: updaterMocks.setUpdaterWindowVisible,
}));

vi.mock('@/services/environment', () => ({
  isTauriAppPlatform: () => true,
}));

vi.mock('@/utils/version', () => ({
  getAppVersion: () => '1.0.0',
  isUpdateNewer: () => false,
}));

import { checkAppReleaseNotes, checkForAppUpdates } from '@/helpers/updater';

describe('updater product network policy', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  test('does not invoke update services when updater traffic is disabled', async () => {
    await expect(checkForAppUpdates((key: string) => key, false)).resolves.toBe(false);

    expect(updaterMocks.osType).not.toHaveBeenCalled();
    expect(updaterMocks.check).not.toHaveBeenCalled();
    expect(updaterMocks.fetch).not.toHaveBeenCalled();
    expect(localStorage.getItem('lastAppUpdateCheck')).toBeNull();
  });

  test('does not fetch inherited release notes when updater traffic is disabled', async () => {
    await expect(checkAppReleaseNotes(false)).resolves.toBe(false);

    expect(updaterMocks.fetch).not.toHaveBeenCalled();
    expect(updaterMocks.setUpdaterWindowVisible).not.toHaveBeenCalled();
  });
});
