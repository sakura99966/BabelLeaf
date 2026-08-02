import { describe, expect, it, vi } from 'vitest';

import { ingestFile } from '@/services/ingestService';
import type { Book } from '@/types/book';
import type { AppService } from '@/types/system';
import type { SystemSettings } from '@/types/settings';

const makeBook = (): Book => ({
  hash: 'book-1',
  title: 'Test Book',
  author: 'Author',
  format: 'EPUB',
  createdAt: 1,
  updatedAt: 1,
});

const makeDeps = (roots: string[] = [], appBooksPrefix?: string) => {
  const importBook = vi.fn(async () => makeBook());
  return {
    appService: {
      importBook,
      osPlatform: 'linux',
    } as unknown as AppService,
    settings: { externalLibraryFolders: roots } as unknown as SystemSettings,
    appBooksPrefix,
    importBook,
  };
};

describe('ingestFile', () => {
  it('imports a normal local file as a managed copy', async () => {
    const { appService, settings, importBook } = makeDeps();
    const result = await ingestFile({ file: '/downloads/book.epub', books: [] }, { appService, settings });

    expect(result?.hash).toBe('book-1');
    expect(importBook).toHaveBeenCalledWith('/downloads/book.epub', [], {
      lookupIndex: undefined,
      transient: undefined,
      inPlace: false,
    });
  });

  it('keeps files under an explicitly configured library root in place', async () => {
    const { appService, settings, importBook } = makeDeps(['/library']);
    await ingestFile({ file: '/library/novel.epub', books: [] }, { appService, settings });

    const options = (importBook.mock.calls[0] as unknown as [unknown, unknown, { inPlace: boolean }])[2];
    expect(options).toMatchObject({ inPlace: true });
  });

  it('does not treat the managed Books directory as an external library root', async () => {
    const { appService, settings, importBook } = makeDeps(['/app'], '/app/Books');
    await ingestFile(
      { file: '/app/Books/book-1/book.epub', books: [] },
      { appService, settings, appBooksPrefix: '/app/Books' },
    );

    const options = (importBook.mock.calls[0] as unknown as [unknown, unknown, { inPlace: boolean }])[2];
    expect(options).toMatchObject({ inPlace: false });
  });

  it('adds a local import to the requested group and applies a subject tag', async () => {
    const { appService, settings } = makeDeps();
    const result = await ingestFile(
      {
        file: '/downloads/book.epub',
        books: [],
        groupId: 'fiction',
        groupName: 'Fiction',
        subjectTag: 'translated',
      },
      { appService, settings },
    );

    expect(result).toMatchObject({
      groupId: 'fiction',
      groupName: 'Fiction',
      tags: ['translated'],
    });
  });
});
