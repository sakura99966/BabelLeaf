import { beforeEach, describe, expect, test, vi } from 'vitest';
import { useCustomFontStore } from '@/store/customFontStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { EnvConfigType } from '@/services/environment';
import type { SystemSettings } from '@/types/settings';

beforeEach(() => {
  useCustomFontStore.setState({ fonts: [], loading: false });
  useSettingsStore.setState({ settings: {} as SystemSettings });
});

describe('customFontStore local lifecycle', () => {
  test('imports a local font and timestamps it for local sorting', () => {
    const before = Date.now();
    const font = useCustomFontStore.getState().addFont('/fonts/Reader.ttf');

    expect(font.path).toBe('/fonts/Reader.ttf');
    expect(font.downloadedAt).toBeGreaterThanOrEqual(before);
    expect(useCustomFontStore.getState().fonts).toEqual([font]);
  });

  test('re-import replaces the local entry without creating a duplicate', () => {
    const first = useCustomFontStore.getState().addFont('/fonts/Reader.ttf', {
      family: 'Reader',
    });
    const second = useCustomFontStore.getState().addFont('/fonts/Reader.ttf', {
      family: 'Reader Updated',
    });

    expect(second.id).toBe(first.id);
    expect(second.family).toBe('Reader Updated');
    expect(useCustomFontStore.getState().fonts).toHaveLength(1);
  });

  test('removal deletes the entry instead of retaining a tombstone', () => {
    const font = useCustomFontStore.getState().addFont('/fonts/Reader.ttf');

    expect(useCustomFontStore.getState().removeFont(font.id)).toBe(true);
    expect(useCustomFontStore.getState().getAllFonts()).toEqual([]);
  });

  test('persistence excludes runtime blob state', async () => {
    const font = useCustomFontStore.getState().addFont('/fonts/Reader.ttf');
    useCustomFontStore.getState().updateFont(font.id, {
      loaded: true,
      blobUrl: 'blob:reader',
    });
    const setSettings = vi.fn();
    const saveSettings = vi.fn();
    useSettingsStore.setState({
      settings: {} as SystemSettings,
      setSettings,
      saveSettings,
    });

    await useCustomFontStore
      .getState()
      .saveCustomFonts({ getAppService: vi.fn() } as unknown as EnvConfigType);

    const saved = setSettings.mock.calls[0]![0] as SystemSettings;
    expect(saved.customFonts).toHaveLength(1);
    expect(saved.customFonts[0]).not.toHaveProperty('blobUrl');
    expect(saved.customFonts[0]).not.toHaveProperty('loaded');
    expect(saved.customFonts[0]).not.toHaveProperty('error');
  });
});
