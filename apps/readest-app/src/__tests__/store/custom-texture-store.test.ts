import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useCustomTextureStore } from '@/store/customTextureStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { EnvConfigType } from '@/services/environment';
import type { SystemSettings } from '@/types/settings';

beforeEach(() => {
  useCustomTextureStore.setState({ textures: [], loading: false });
  useSettingsStore.setState({ settings: {} as SystemSettings });
});

describe('customTextureStore local lifecycle', () => {
  test('imports a local texture and timestamps it for local sorting', () => {
    const before = Date.now();
    const texture = useCustomTextureStore.getState().addTexture('/images/Paper.png');

    expect(texture.path).toBe('/images/Paper.png');
    expect(texture.downloadedAt).toBeGreaterThanOrEqual(before);
    expect(useCustomTextureStore.getState().textures).toEqual([texture]);
  });

  test('re-import replaces the local entry without creating a duplicate', () => {
    const first = useCustomTextureStore.getState().addTexture('/images/Paper.png', {
      name: 'Paper',
    });
    const second = useCustomTextureStore.getState().addTexture('/images/Paper.png', {
      name: 'Paper',
      animated: true,
    });

    expect(second.id).toBe(first.id);
    expect(second.animated).toBe(true);
    expect(useCustomTextureStore.getState().textures).toHaveLength(1);
  });

  test('removal deletes the entry instead of retaining a tombstone', () => {
    const texture = useCustomTextureStore.getState().addTexture('/images/Paper.png');

    expect(useCustomTextureStore.getState().removeTexture(texture.id)).toBe(true);
    expect(useCustomTextureStore.getState().getAllTextures()).toEqual([]);
  });

  test('persistence excludes runtime blob state', async () => {
    const texture = useCustomTextureStore.getState().addTexture('/images/Paper.png');
    useCustomTextureStore.getState().updateTexture(texture.id, {
      loaded: true,
      blobUrl: 'blob:paper',
    });
    const setSettings = vi.fn();
    const saveSettings = vi.fn();
    useSettingsStore.setState({
      settings: {} as SystemSettings,
      setSettings,
      saveSettings,
    });

    await useCustomTextureStore
      .getState()
      .saveCustomTextures({ getAppService: vi.fn() } as unknown as EnvConfigType);

    const saved = setSettings.mock.calls[0]![0] as SystemSettings;
    expect(saved.customTextures).toHaveLength(1);
    expect(saved.customTextures[0]).not.toHaveProperty('blobUrl');
    expect(saved.customTextures[0]).not.toHaveProperty('loaded');
    expect(saved.customTextures[0]).not.toHaveProperty('error');
  });
});
