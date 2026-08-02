import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/event', () => ({
  emit: vi.fn(async () => undefined),
  listen: vi.fn(),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({ label: 'library' })),
}));
vi.mock('@/services/environment', () => ({ isTauriAppPlatform: () => true }));

import { emit } from '@tauri-apps/api/event';
import {
  broadcastGlobalSettings,
  mergeSyncedGlobalSettings,
  SETTINGS_SYNC_EVENT,
} from '@/utils/settingsSync';
import type { SystemSettings } from '@/types/settings';

const local = {
  localBooksDir: '/books',
  globalViewSettings: { fontSize: 18 },
  globalReadSettings: { pageTurnStyle: 'slide' },
} as unknown as SystemSettings;

describe('local window settings synchronization', () => {
  beforeEach(() => vi.clearAllMocks());

  it('merges global reader settings without changing local storage settings', () => {
    const globalViewSettings = {} as SystemSettings['globalViewSettings'];
    const globalReadSettings = {} as SystemSettings['globalReadSettings'];
    const merged = mergeSyncedGlobalSettings(local, {
      globalViewSettings,
      globalReadSettings,
    });

    expect(merged.localBooksDir).toBe('/books');
    expect(merged.globalViewSettings).toBe(globalViewSettings);
    expect(merged.globalReadSettings).toBe(globalReadSettings);
  });

  it('broadcasts only global settings to sibling local windows', async () => {
    await broadcastGlobalSettings(local);

    expect(emit).toHaveBeenCalledWith(
      SETTINGS_SYNC_EVENT,
      expect.objectContaining({
        sourceLabel: 'library',
        globalViewSettings: local.globalViewSettings,
        globalReadSettings: local.globalReadSettings,
      }),
    );
  });
});
