import { describe, expect, test, vi } from 'vitest';

vi.mock('@/utils/config', () => ({
  getDefaultMaxBlockSize: vi.fn(() => 1600),
  getDefaultMaxInlineSize: vi.fn(() => 720),
}));
vi.mock('@/utils/misc', () => ({
  stubTranslation: vi.fn((key: string) => key),
  getOSPlatform: vi.fn(() => 'windows'),
}));

import {
  BOOK_ACCEPT_FORMATS,
  DEFAULT_SYSTEM_SETTINGS,
  LOCAL_BOOKS_SUBDIR,
  LOCAL_DICTIONARIES_SUBDIR,
  LOCAL_FONTS_SUBDIR,
  LOCAL_IMAGES_SUBDIR,
  SUPPORTED_BOOK_EXTS,
} from '@/services/constants';

describe('local reader constants', () => {
  test('keeps the required local book formats', () => {
    expect(SUPPORTED_BOOK_EXTS).toEqual(
      expect.arrayContaining(['epub', 'mobi', 'azw3', 'cbz', 'pdf', 'txt']),
    );
    expect(BOOK_ACCEPT_FORMATS).toContain('.epub');
  });

  test('uses local application data directories', () => {
    expect(LOCAL_BOOKS_SUBDIR).toMatch(/Books$/);
    expect(LOCAL_FONTS_SUBDIR).toMatch(/Fonts$/);
    expect(LOCAL_IMAGES_SUBDIR).toMatch(/Images$/);
    expect(LOCAL_DICTIONARIES_SUBDIR).toMatch(/Dictionaries$/);
  });

  test('does not initialize retired account or cloud-sync settings', () => {
    expect(DEFAULT_SYSTEM_SETTINGS).not.toHaveProperty('kosync');
    expect(DEFAULT_SYSTEM_SETTINGS).not.toHaveProperty('readwise');
    expect(DEFAULT_SYSTEM_SETTINGS).not.toHaveProperty('webdav');
    expect(DEFAULT_SYSTEM_SETTINGS).not.toHaveProperty('googleDrive');
    expect(DEFAULT_SYSTEM_SETTINGS).not.toHaveProperty('s3');
    expect(DEFAULT_SYSTEM_SETTINGS).not.toHaveProperty('onedrive');
    expect(DEFAULT_SYSTEM_SETTINGS).not.toHaveProperty('syncCategories');
  });
});
