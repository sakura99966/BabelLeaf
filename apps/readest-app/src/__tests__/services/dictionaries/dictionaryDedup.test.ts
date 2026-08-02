import { describe, expect, test } from 'vitest';
import {
  findExistingDictionaryMatches,
  preserveLiveDictionaryState,
} from '@/services/dictionaries/dictionaryDedup';
import type { ImportedDictionary } from '@/services/dictionaries/types';

const baseDict = (overrides: Partial<ImportedDictionary> = {}): ImportedDictionary => ({
  id: 'bundle-1',
  contentId: 'content-hash-A',
  kind: 'mdict',
  name: 'Webster Original',
  bundleDir: 'bundle-1',
  files: { mdx: 'webster.mdx' },
  addedAt: 0,
  ...overrides,
});

describe('findExistingDictionaryMatches', () => {
  test('matches by content id even after a local rename', () => {
    const existing = baseDict({ id: 'old', name: 'My Renamed Dict' });
    const incoming = baseDict({ id: 'new', name: 'Webster Original' });

    expect(findExistingDictionaryMatches(incoming, [existing])).toEqual([existing]);
  });

  test('falls back to name for a legacy entry without a content id', () => {
    const legacy = baseDict({ id: 'old', contentId: undefined });
    const incoming = baseDict({ id: 'new' });

    expect(findExistingDictionaryMatches(incoming, [legacy])).toEqual([legacy]);
  });

  test('does not conflate different content ids with the same title', () => {
    const existing = baseDict({ id: 'old', contentId: 'content-hash-A', name: 'Webster' });
    const incoming = baseDict({ id: 'new', contentId: 'content-hash-B', name: 'Webster' });

    expect(findExistingDictionaryMatches(incoming, [existing])).toEqual([]);
  });

  test('ignores legacy tombstones during migration', () => {
    const deleted = baseDict({ id: 'old', deletedAt: Date.now() });
    const incoming = baseDict({ id: 'new' });

    expect(findExistingDictionaryMatches(incoming, [deleted])).toEqual([]);
  });

  test('returns all duplicate live entries so the importer can collapse them', () => {
    const first = baseDict({ id: 'old-1' });
    const second = baseDict({ id: 'old-2' });
    const incoming = baseDict({ id: 'new' });

    expect(findExistingDictionaryMatches(incoming, [first, second])).toEqual([first, second]);
  });
});

describe('preserveLiveDictionaryState', () => {
  test('keeps the existing display name and original import time', () => {
    const existing = baseDict({ id: 'old', name: 'User Label', addedAt: 123 });
    const incoming = baseDict({ id: 'new', name: 'Parsed Label', addedAt: 456 });

    const result = preserveLiveDictionaryState(incoming, [existing]);

    expect(result.name).toBe('User Label');
    expect(result.addedAt).toBe(123);
  });

  test('keeps file-backed fields from the new local bundle', () => {
    const existing = baseDict({
      id: 'old',
      contentId: 'old-content',
      bundleDir: 'old-dir',
      files: { mdx: 'old.mdx' },
      unavailable: true,
    });
    const incoming = baseDict({
      id: 'new',
      contentId: 'new-content',
      bundleDir: 'new-dir',
      files: { mdx: 'new.mdx' },
      unavailable: undefined,
    });

    const result = preserveLiveDictionaryState(incoming, [existing]);

    expect(result).toMatchObject({
      id: 'new',
      contentId: 'new-content',
      bundleDir: 'new-dir',
      files: { mdx: 'new.mdx' },
    });
    expect(result.unavailable).toBeUndefined();
  });

  test('returns a new unchanged record when no match exists', () => {
    const incoming = baseDict({ id: 'new' });
    const result = preserveLiveDictionaryState(incoming, []);

    expect(result).toEqual(incoming);
    expect(result).not.toBe(incoming);
  });
});
