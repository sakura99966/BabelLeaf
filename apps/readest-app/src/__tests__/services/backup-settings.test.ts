import { describe, expect, test } from 'vitest';
import {
  mergeRestoredSettings,
  sanitizeSettingsForBackup,
} from '@/services/backupService';
import type { SystemSettings } from '@/types/settings';

const makeSettings = (overrides: Partial<SystemSettings> = {}): SystemSettings =>
  ({
    version: 4,
    migrationVersion: 2,
    localBooksDir: 'C:/BabelLeaf/Books',
    customRootDir: 'C:/BabelLeaf',
    externalLibraryFolders: ['D:/Books'],
    autoImportFolders: ['D:/Books'],
    lastOpenBooks: ['book-a'],
    screenBrightness: 70,
    libraryViewMode: 'grid',
    libraryColumns: 4,
    aiSettings: {
      provider: 'openrouter',
      ollamaBaseUrl: 'http://127.0.0.1:11434',
      ollamaModel: 'qwen2.5',
      openrouterApiKey: 'secret',
      openrouterBaseUrl: 'https://llm.example/v1',
      openrouterModel: 'translation-model',
    },
    ...overrides,
  }) as SystemSettings;

describe('portable local settings backup', () => {
  test('strips device paths, runtime state, schema versions, and API key', () => {
    const output = sanitizeSettingsForBackup(makeSettings()) as SystemSettings &
      Record<string, unknown>;

    expect(output.localBooksDir).toBeUndefined();
    expect(output.customRootDir).toBeUndefined();
    expect(output.externalLibraryFolders).toBeUndefined();
    expect(output.autoImportFolders).toBeUndefined();
    expect(output.lastOpenBooks).toBeUndefined();
    expect(output.screenBrightness).toBeUndefined();
    expect(output.version).toBeUndefined();
    expect(output.migrationVersion).toBeUndefined();
    expect(output.aiSettings.openrouterApiKey).toBeUndefined();
  });

  test('never includes the translation key', () => {
    const output = sanitizeSettingsForBackup(makeSettings());

    expect(output.aiSettings.openrouterApiKey).toBeUndefined();
  });

  test('preserves current device paths while restoring portable preferences', () => {
    const current = makeSettings({ libraryColumns: 2 });
    const backup = sanitizeSettingsForBackup(makeSettings({ libraryColumns: 7 }));
    const merged = mergeRestoredSettings(current, backup);

    expect(merged.localBooksDir).toBe('C:/BabelLeaf/Books');
    expect(merged.version).toBe(4);
    expect(merged.libraryColumns).toBe(7);
  });
});
