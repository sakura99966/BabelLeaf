import { beforeEach, describe, expect, test, vi } from 'vitest';

const platform = vi.hoisted(() => ({ tauri: false }));
const bridge = vi.hoisted(() => ({
  setSecureItem: vi.fn(async () => ({ success: true })),
  getSecureItem: vi.fn<() => Promise<{ value?: string }>>(async () => ({ value: undefined })),
  clearSecureItem: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/services/environment', () => ({
  isTauriAppPlatform: () => platform.tauri,
}));

vi.mock('@/utils/bridge', () => bridge);

import {
  getTranslationApiKey,
  loadTranslationApiKey,
  saveTranslationApiKey,
  setTranslationApiKeyForSession,
} from '@/services/ai/translationApiKey';

describe('translation API key storage', () => {
  beforeEach(async () => {
    platform.tauri = false;
    await saveTranslationApiKey('');
    vi.clearAllMocks();
  });

  test('keeps browser-development keys in memory only', async () => {
    await saveTranslationApiKey(' browser-secret ');

    expect(getTranslationApiKey()).toBe('browser-secret');
    expect(bridge.setSecureItem).not.toHaveBeenCalled();
    expect(bridge.clearSecureItem).not.toHaveBeenCalled();
  });

  test('makes a newly entered key available before secure persistence completes', () => {
    setTranslationApiKeyForSession(' pending-secret ');

    expect(getTranslationApiKey()).toBe('pending-secret');
    expect(bridge.setSecureItem).not.toHaveBeenCalled();
  });

  test('uses the native secure-item bridge on Tauri', async () => {
    platform.tauri = true;

    await saveTranslationApiKey('native-secret');
    expect(bridge.setSecureItem).toHaveBeenCalledWith({
      key: 'babelleaf.translation.deepseek.api-key',
      value: 'native-secret',
    });

    bridge.getSecureItem.mockResolvedValueOnce({ value: 'stored-secret' });
    await loadTranslationApiKey();
    expect(getTranslationApiKey()).toBe('stored-secret');

    await saveTranslationApiKey('');
    expect(bridge.clearSecureItem).toHaveBeenCalledWith({
      key: 'babelleaf.translation.deepseek.api-key',
    });
  });

  test('does not repurpose a legacy custom-endpoint key as a DeepSeek credential', async () => {
    platform.tauri = true;
    bridge.getSecureItem.mockResolvedValueOnce({ value: undefined });

    await loadTranslationApiKey();

    expect(getTranslationApiKey()).toBe('');
    expect(bridge.setSecureItem).not.toHaveBeenCalled();
  });
});
