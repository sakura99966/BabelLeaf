import { describe, expect, test } from 'vitest';
import type { BaseDir, FileSystem } from '@/types/system';
import {
  getTranslationJobPath,
  parseTranslationJob,
  TranslationJobStore,
} from '@/services/translators/jobStore';
import type { TranslationJobSnapshot } from '@/services/translators/jobQueue';

const makeFileSystem = () => {
  const files = new Map<string, string>();
  const key = (path: string, base: BaseDir) => `${base}/${path}`;
  const fs = {
    createDir: async () => undefined,
    writeFile: async (path: string, base: BaseDir, content: string) => {
      files.set(key(path, base), content);
    },
    readFile: async (path: string, base: BaseDir, _mode: 'text' | 'binary') => {
      const value = files.get(key(path, base));
      if (value === undefined) throw new Error('not found');
      return value;
    },
    exists: async (path: string, base: BaseDir) => files.has(key(path, base)),
    removeFile: async (path: string, base: BaseDir) => {
      files.delete(key(path, base));
    },
  } as unknown as FileSystem;
  return { files, fs };
};

const snapshot: TranslationJobSnapshot = {
  id: 'translation-book-deepseek-zh-CN-book',
  kind: 'book',
  bookHash: 'book',
  provider: 'deepseek',
  sourceLang: 'en',
  targetLang: 'zh-CN',
  status: 'paused',
  total: 1,
  completed: 0,
  failed: 0,
  cancelled: 0,
  maxAttempts: 3,
  updatedAt: 100,
  items: [
    {
      id: 'chapter-1:0',
      text: 'Hello',
      status: 'pending',
      attempts: 1,
    },
  ],
};

describe('TranslationJobStore', () => {
  test('saves and restores a durable job snapshot with a backup', async () => {
    const { files, fs } = makeFileSystem();
    const store = new TranslationJobStore(fs);

    await store.save(snapshot);

    expect(files.has(`Data/${getTranslationJobPath(snapshot.id)}`)).toBe(true);
    expect(files.has(`Data/${getTranslationJobPath(snapshot.id)}.bak`)).toBe(true);
    await expect(store.load(snapshot.id)).resolves.toEqual(snapshot);
  });

  test('rejects malformed or cross-version snapshots at the trust boundary', () => {
    expect(() => parseTranslationJob({ schemaVersion: 99 })).toThrow('schema');
    expect(() =>
      parseTranslationJob({
        schemaVersion: 1,
        snapshot: { ...snapshot, kind: 'invalid' },
      }),
    ).toThrow('kind');
    expect(() =>
      parseTranslationJob({
        schemaVersion: 1,
        snapshot: {
          ...snapshot,
          items: [{ ...snapshot.items[0], attempts: -1 }],
        },
      }),
    ).toThrow('attempts');
  });

  test('lists valid jobs through the AppService readDirectory/deleteFile bridge', async () => {
    const { files, fs } = makeFileSystem();
    const appService = {
      ...fs,
      readDirectory: async () =>
        Array.from(files.keys())
          .filter((key) => key.startsWith('Data/translation-jobs/'))
          .map((key) => ({ path: key.slice('Data/translation-jobs/'.length), size: 1 })),
      deleteFile: fs.removeFile,
    };
    const store = new TranslationJobStore(appService);
    await store.save({ ...snapshot, updatedAt: 100, bookTitle: 'Book', recovered: true });
    await store.save({
      ...snapshot,
      id: 'translation-other-deepseek-zh-CN-book',
      bookHash: 'other',
      updatedAt: 200,
    });
    files.set('Data/translation-jobs/broken.json', '{broken');

    await expect(store.list({ bookHash: 'book' })).resolves.toMatchObject([
      { id: snapshot.id, bookTitle: 'Book', recovered: true },
    ]);
    await expect(store.prune({ bookHash: 'book', keepLatest: 0 })).resolves.toBe(0);
  });

  test('normalizes Windows directory separators returned by native bridges', async () => {
    const { files, fs } = makeFileSystem();
    await new TranslationJobStore(fs).save(snapshot);
    const store = new TranslationJobStore({
      ...fs,
      readDir: async () => [{ path: `translation-jobs\\${snapshot.id}.json`, size: 1 }],
    });

    await expect(store.list({ bookHash: snapshot.bookHash })).resolves.toMatchObject([
      { id: snapshot.id },
    ]);
    expect(files.has(`Data/${getTranslationJobPath(snapshot.id)}`)).toBe(true);
  });
});
