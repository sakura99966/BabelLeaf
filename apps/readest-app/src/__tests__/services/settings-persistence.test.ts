import { describe, expect, test, vi } from 'vitest';
import { sanitizeSettingsForPersistence, saveSettings } from '@/services/settingsService';
import type { SystemSettings } from '@/types/settings';
import type { FileSystem } from '@/types/system';

const makeSettings = (): SystemSettings =>
  ({
    aiSettings: {
      provider: 'deepseek',
      ollamaBaseUrl: 'http://127.0.0.1:11434',
      ollamaModel: 'qwen2.5',
      deepseekApiKey: 'must-not-reach-disk',
      openrouterApiKey: 'legacy-secret',
      openrouterBaseUrl: 'https://legacy.example.test/v1',
      openrouterModel: 'legacy-model',
    },
  }) as SystemSettings;

describe('settings persistence', () => {
  test('removes the runtime-only API key without mutating in-memory settings', () => {
    const settings = makeSettings();

    const sanitized = sanitizeSettingsForPersistence(settings);

    expect(sanitized.aiSettings.deepseekApiKey).toBeUndefined();
    expect(sanitized.aiSettings.openrouterApiKey).toBeUndefined();
    expect(sanitized.aiSettings.openrouterBaseUrl).toBeUndefined();
    expect(sanitized.aiSettings.openrouterModel).toBeUndefined();
    expect(settings.aiSettings.deepseekApiKey).toBe('must-not-reach-disk');
    expect(settings.aiSettings.openrouterApiKey).toBe('legacy-secret');
  });

  test('never writes the plaintext translation API key to settings files', async () => {
    const writeFile = vi.fn(async () => undefined);
    const fs = { writeFile } as unknown as FileSystem;

    await saveSettings(fs, makeSettings());

    expect(writeFile).toHaveBeenCalledTimes(2);
    for (const [, , json] of writeFile.mock.calls as unknown as Array<
      [unknown, unknown, unknown]
    >) {
      expect(String(json)).not.toContain('must-not-reach-disk');
      expect(String(json)).not.toContain('legacy-secret');
      expect(String(json)).not.toContain('legacy.example.test');
    }
  });
});
