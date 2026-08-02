import { describe, expect, it } from 'vitest';

import { getBookContextMenuItemIds } from '@/app/library/utils/libraryUtils';
import type { Book } from '@/types/book';

const createBook = (overrides: Partial<Book> = {}): Book => ({
  hash: 'book-1',
  format: 'EPUB',
  title: 'Test Book',
  author: 'Test Author',
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

describe('getBookContextMenuItemIds', () => {
  it('returns only local actions for a downloaded book', () => {
    expect(getBookContextMenuItemIds(createBook({ downloadedAt: 1 }))).toEqual([
      'select',
      'group',
      'markFinished',
      'markAbandoned',
      'showDetails',
      'showInFinder',
      'delete',
    ]);
  });

  it('uses the correct status actions for a finished book', () => {
    expect(getBookContextMenuItemIds(createBook({ readingStatus: 'finished' }))).toEqual([
      'select',
      'group',
      'markUnread',
      'markAbandoned',
      'clearStatus',
      'showDetails',
      'showInFinder',
      'delete',
    ]);
  });

  it('is deterministic and has no remote transfer actions', () => {
    const items = getBookContextMenuItemIds(createBook({ uploadedAt: 1 }));
    expect(new Set(items).size).toBe(items.length);
    expect(items).not.toContain('upload');
    expect(items).not.toContain('download');
    expect(items).not.toContain('share');
  });
});
