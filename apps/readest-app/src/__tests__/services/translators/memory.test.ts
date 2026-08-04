import { describe, expect, test } from 'vitest';
import type { BaseDir, FileSystem } from '@/types/system';
import {
  getTranslationMemoryKey,
  TranslationMemory,
  TranslationMemoryFileStore,
} from '@/services/translators/memory';

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
  } as unknown as FileSystem;
  return { files, fs };
};

const query = {
  sourceText: 'Hello  world',
  sourceLang: 'en',
  targetLang: 'zh-CN',
  provider: 'deepseek',
  glossaryVersion: 1,
};

describe('translation memory', () => {
  test('isolates entries by language, provider, and glossary version', async () => {
    const memory = new TranslationMemory();
    await memory.remember(query, '你好');

    expect(memory.lookup({ ...query, sourceText: 'Hello world' })).toBe('你好');
    expect(memory.lookup({ ...query, provider: 'openai' })).toBeNull();
    expect(memory.lookup({ ...query, glossaryVersion: 2 })).toBeNull();
    expect(getTranslationMemoryKey(query)).not.toBe(
      getTranslationMemoryKey({ ...query, glossaryVersion: 2 }),
    );
  });

  test('persists and hydrates entries while enforcing a bounded limit', async () => {
    const { files, fs } = makeFileSystem();
    const store = new TranslationMemoryFileStore(fs);
    const memory = new TranslationMemory({ maxEntries: 2, store });
    await memory.remember({ ...query, sourceText: 'One' }, '一');
    await memory.remember({ ...query, sourceText: 'Two' }, '二');
    await memory.remember({ ...query, sourceText: 'Three' }, '三');

    expect(memory.size()).toBe(2);
    expect(files.size).toBeGreaterThan(0);
    const restored = await TranslationMemory.load(store, { maxEntries: 2 });
    expect(restored.size()).toBe(2);
    expect(restored.lookup({ ...query, sourceText: 'Three' })).toBe('三');
  });
});
