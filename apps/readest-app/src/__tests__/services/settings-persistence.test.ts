import { describe, expect, test, vi } from 'vitest';
import {
  loadSettings,
  sanitizeSettingsForPersistence,
  saveSettings,
} from '@/services/settingsService';
import { DEFAULT_SYSTEM_SETTINGS } from '@/services/constants';
import type { SystemSettings } from '@/types/settings';
import type { FileSystem } from '@/types/system';

const makeSettings = (): SystemSettings =>
  ({
    aiSettings: {
      provider: 'deepseek',
      ollamaBaseUrl: 'http://127.0.0.1:11434',
      ollamaModel: 'qwen2.5',
      deepseekApiKey: 'must-not-reach-disk',
      openaiApiKey: 'openai-secret',
      anthropicApiKey: 'anthropic-secret',
      openrouterApiKey: 'legacy-secret',
      openrouterBaseUrl: 'https://legacy.example.test/v1',
      openrouterModel: 'legacy-model',
    },
  }) as SystemSettings;

describe('settings persistence', () => {
  test('retains the explicitly selected Index-Translate preset when reloading settings', async () => {
    const snapshot = {
      ...DEFAULT_SYSTEM_SETTINGS,
      aiSettings: { ...DEFAULT_SYSTEM_SETTINGS.aiSettings, provider: 'index-translate' },
      globalReadSettings: {
        ...DEFAULT_SYSTEM_SETTINGS.globalReadSettings,
        translationProvider: 'index-translate',
      },
      globalViewSettings: {
        ...DEFAULT_SYSTEM_SETTINGS.globalViewSettings,
        translationProvider: 'index-translate',
      },
    };
    const fs = {
      readFile: vi.fn(async () => JSON.stringify(snapshot)),
      writeFile: vi.fn(async () => undefined),
      getPrefix: vi.fn(async () => ''),
    } as unknown as FileSystem;
    const settings = await loadSettings({
      fs,
      isMobile: false,
      isEink: false,
      isAppDataSandbox: false,
    });
    expect(settings.aiSettings.provider).toBe('index-translate');
    expect(settings.globalReadSettings.translationProvider).toBe('index-translate');
    expect(settings.globalViewSettings.translationProvider).toBe('index-translate');
  });
  test('removes the runtime-only API key without mutating in-memory settings', () => {
    const settings = makeSettings();

    const sanitized = sanitizeSettingsForPersistence(settings);

    expect(sanitized.aiSettings.deepseekApiKey).toBeUndefined();
    expect(sanitized.aiSettings.openaiApiKey).toBeUndefined();
    expect(sanitized.aiSettings.anthropicApiKey).toBeUndefined();
    expect(sanitized.aiSettings.openrouterApiKey).toBeUndefined();
    expect(sanitized.aiSettings.openrouterBaseUrl).toBeUndefined();
    expect(sanitized.aiSettings.openrouterModel).toBeUndefined();
    expect(settings.aiSettings.deepseekApiKey).toBe('must-not-reach-disk');
    expect(settings.aiSettings.openrouterApiKey).toBe('legacy-secret');
  });

  test('never writes the plaintext translation API key to settings files', async () => {
    const writeFile = vi.fn(async () => undefined);
    const fs = {
      writeFile,
      readFile: async () => {
        throw new Error('File not found');
      },
    } as unknown as FileSystem;

    await saveSettings(fs, makeSettings());

    expect(writeFile).toHaveBeenCalledTimes(2);
    for (const [, , json] of writeFile.mock.calls as unknown as Array<
      [unknown, unknown, unknown]
    >) {
      expect(String(json)).not.toContain('must-not-reach-disk');
      expect(String(json)).not.toContain('openai-secret');
      expect(String(json)).not.toContain('anthropic-secret');
      expect(String(json)).not.toContain('legacy-secret');
      expect(String(json)).not.toContain('legacy.example.test');
    }
  });
});
