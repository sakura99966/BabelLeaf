import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

const syncMocks = vi.hoisted(() => {
  const startAutoSync = vi.fn();
  const loadSettings = vi.fn().mockResolvedValue({ replicaDeviceId: 'existing-device' });
  const appService = { loadSettings };

  return {
    appService,
    bootstrapReplicaAdapters: vi.fn(),
    createSettingsCursorStore: vi.fn(),
    enableReplicaAutoPersist: vi.fn(),
    getAppService: vi.fn().mockResolvedValue(appService),
    initReplicaSync: vi.fn(() => ({ manager: { startAutoSync } })),
    startAutoSync,
    startReplicaTransferIntegration: vi.fn(),
  };
});

vi.mock('@/services/environment', () => ({
  default: {
    getAppService: syncMocks.getAppService,
  },
}));

vi.mock('@/services/sync/replicaBootstrap', () => ({
  bootstrapReplicaAdapters: syncMocks.bootstrapReplicaAdapters,
}));

vi.mock('@/services/sync/replicaSync', () => ({
  initReplicaSync: syncMocks.initReplicaSync,
}));

vi.mock('@/services/sync/replicaCursorStore', () => ({
  createSettingsCursorStore: syncMocks.createSettingsCursorStore,
}));

vi.mock('@/services/sync/replicaTransferIntegration', () => ({
  startReplicaTransferIntegration: syncMocks.startReplicaTransferIntegration,
}));

vi.mock('@/services/sync/replicaPersist', () => ({
  enableReplicaAutoPersist: syncMocks.enableReplicaAutoPersist,
}));

import { EnvProvider } from '@/context/EnvContext';

describe('EnvProvider network policy', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  test('keeps local replica setup but does not start remote sync for an existing device', async () => {
    render(
      <EnvProvider>
        <div>library</div>
      </EnvProvider>,
    );

    await waitFor(() => {
      expect(syncMocks.getAppService).toHaveBeenCalledOnce();
      expect(syncMocks.appService.loadSettings).toHaveBeenCalledOnce();
    });

    expect(syncMocks.bootstrapReplicaAdapters).toHaveBeenCalledOnce();
    expect(syncMocks.enableReplicaAutoPersist).toHaveBeenCalledOnce();
    expect(syncMocks.initReplicaSync).not.toHaveBeenCalled();
    expect(syncMocks.startAutoSync).not.toHaveBeenCalled();
    expect(syncMocks.startReplicaTransferIntegration).not.toHaveBeenCalled();
  });
});
