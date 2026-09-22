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
  test('rejects invalid writes without replacing either readable recovery copy', async () => {
    const { files, fs } = makeFileSystem();
    const store = new TranslationJobStore(fs);
    await store.save(snapshot);
    const before = new Map(files);
    await expect(store.save({ ...snapshot, completed: 99 })).rejects.toThrow(/count/);
    expect(files).toEqual(before);
  });

  test('captures a validated snapshot before asynchronous filesystem preparation', async () => {
    const { fs } = makeFileSystem();
    const input = { ...snapshot, items: snapshot.items.map((item) => ({ ...item })) };
    const store = new TranslationJobStore({
      ...fs,
      createDir: async () => {
        input.items[0]!.text = 'changed after save started';
        input.completed = 99;
      },
    });
    await store.save(input);
    await expect(store.load(snapshot.id)).resolves.toEqual(snapshot);
  });

  test.each([
    'total',
    'completed',
    'failed',
    'cancelled',
  ] as const)('rejects inconsistent persisted %s counts', (field) => {
    expect(() =>
      parseTranslationJob({
        schemaVersion: 1,
        snapshot: {
          ...snapshot,
          [field]: snapshot[field] + 1,
        },
      }),
    ).toThrow(/count/);
  });

  test('rejects duplicate item identities before recovery', () => {
    expect(() =>
      parseTranslationJob({
        schemaVersion: 1,
        snapshot: {
          ...snapshot,
          total: 2,
          items: [snapshot.items[0], snapshot.items[0]],
        },
      }),
    ).toThrow(/Duplicate/);
  });

  test('rejects oversized job text and item arrays', () => {
    expect(() =>
      parseTranslationJob({
        schemaVersion: 1,
        snapshot: {
          ...snapshot,
          items: [{ ...snapshot.items[0], text: 'x'.repeat(1_048_577) }],
        },
      }),
    ).toThrow(/limit/);
    expect(() =>
      parseTranslationJob({
        schemaVersion: 1,
        snapshot: {
          ...snapshot,
          total: 100_001,
          items: new Array(100_001),
        },
      }),
    ).toThrow(/limit/);
  });

  test('saves and restores a durable job snapshot with a backup', async () => {
    const { files, fs } = makeFileSystem();
    const store = new TranslationJobStore(fs);

    await store.save(snapshot);

    expect(files.has(`Data/${getTranslationJobPath(snapshot.id)}`)).toBe(true);
    expect(files.has(`Data/${getTranslationJobPath(snapshot.id)}.bak`)).toBe(true);
    await expect(store.load(snapshot.id)).resolves.toEqual(snapshot);
  });

  test('recovers the valid backup when the main snapshot has inconsistent counts', async () => {
    const { files, fs } = makeFileSystem();
    const store = new TranslationJobStore(fs);
    await store.save(snapshot);
    files.set(
      `Data/${getTranslationJobPath(snapshot.id)}`,
      JSON.stringify({
        schemaVersion: 1,
        snapshot: { ...snapshot, completed: 99 },
      }),
    );
    await expect(store.load(snapshot.id)).resolves.toEqual(snapshot);
  });

  test('dashboard listing also recovers schema-invalid main data from the backup', async () => {
    const { files, fs } = makeFileSystem();
    const store = new TranslationJobStore({
      ...fs,
      readDir: async () => [{ path: `${snapshot.id}.json`, size: 1 }],
    });
    await store.save(snapshot);
    files.set(
      `Data/${getTranslationJobPath(snapshot.id)}`,
      JSON.stringify({
        schemaVersion: 1,
        snapshot: { ...snapshot, completed: 99 },
      }),
    );
    await expect(store.list()).resolves.toEqual([snapshot]);
  });

  test('counts nested anchor strings in the job text budget', () => {
    const locator = 'x'.repeat(1_048_576);
    const items = Array.from({ length: 32 }, (_, index) => ({
      ...snapshot.items[0],
      id: `${index}`,
      sourceAnchor: {
        schemaVersion: 1,
        sectionIndex: 0,
        blockIndex: index,
        chunkIndex: 0,
        textHash: '12345678',
        textLength: 5,
        sourceLocator: locator,
      },
    }));
    expect(() =>
      parseTranslationJob({
        schemaVersion: 1,
        snapshot: {
          ...snapshot,
          total: items.length,
          items,
        },
      }),
    ).toThrow(/limit/);
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
