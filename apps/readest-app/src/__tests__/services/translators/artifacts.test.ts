import { describe, expect, test, vi } from 'vitest';
import type { FileSystem } from '@/types/system';
import {
  createTranslationArtifact,
  getTranslationArtifactPath,
  parseTranslationArtifact,
  serializeTranslationArtifact,
  TranslationArtifactStore,
  upsertTranslationSegments,
} from '@/services/translators/artifacts';

const makeArtifact = () =>
  createTranslationArtifact({
    bookHash: 'book/one',
    provider: 'deepseek',
    promptVersion: 'translation-v1',
    sourceLang: 'en',
    targetLang: 'zh-CN',
  });

const makeFileSystem = () => {
  const files = new Map<string, string>();
  const key = (path: string, base: string) => `${base}/${path}`;
  const fs = {
    createDir: vi.fn(async () => undefined),
    writeFile: vi.fn(async (path: string, base: string, content: string) => {
      files.set(key(path, base), content);
    }),
    readFile: vi.fn(async (path: string, base: string) => {
      const value = files.get(key(path, base));
      if (value === undefined) throw new Error('not found');
      return value;
    }),
    exists: vi.fn(async (path: string, base: string) => files.has(key(path, base))),
    removeFile: vi.fn(async (path: string, base: string) => {
      files.delete(key(path, base));
    }),
  } as unknown as FileSystem;
  return { files, fs };
};

describe('translation artifacts', () => {
  test('serializes and validates a versioned artifact while ignoring unknown fields', () => {
    const artifact = makeArtifact();
    const parsed = parseTranslationArtifact({
      ...JSON.parse(serializeTranslationArtifact(artifact)),
      apiKey: 'must-not-be-stored',
    });

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.segments).toEqual([]);
    expect(parsed).not.toHaveProperty('apiKey');
    expect(
      getTranslationArtifactPath({
        bookHash: 'book/one',
        provider: 'deepseek',
        targetLang: 'zh-CN',
      }),
    ).toBe('translation-artifacts/book_one.deepseek.zh-CN.json');
  });

  test('upserts translated segments without replacing source text', () => {
    const artifact = makeArtifact();
    const first = {
      id: 'chapter-1:0',
      sourceText: 'Hello',
      sourceLang: 'en',
      targetLang: 'zh-CN',
      status: 'translated' as const,
      translatedText: '你好',
      updatedAt: 1,
    };
    const updated = upsertTranslationSegments(artifact, [first], 2);
    expect(updated.segments[0]).toMatchObject({ sourceText: 'Hello', translatedText: '你好' });

    const reviewed = upsertTranslationSegments(
      updated,
      [{ ...first, translatedText: '您好', status: 'reviewed' }],
      3,
    );
    expect(reviewed.segments[0]).toMatchObject({
      sourceText: 'Hello',
      translatedText: '您好',
      status: 'reviewed',
    });

    expect(() =>
      upsertTranslationSegments(reviewed, [{ ...first, sourceText: 'Changed' }], 4),
    ).toThrow('source changed');
  });

  test('stores artifacts under Cache and recovers through the safe JSON path', async () => {
    const { files, fs } = makeFileSystem();
    const store = new TranslationArtifactStore(fs);
    const artifact = makeArtifact();

    await store.save(artifact);
    const path = getTranslationArtifactPath(artifact);
    expect(fs.createDir).toHaveBeenCalledWith('translation-artifacts', 'Cache', true);
    expect(files.has(`Cache/${path}`)).toBe(true);
    expect(files.has(`Cache/${path}.bak`)).toBe(true);
    await expect(store.load(artifact)).resolves.toMatchObject({ bookHash: 'book/one' });

    files.set(`Cache/${path}`, '{broken');
    await expect(store.load(artifact)).resolves.toMatchObject({ bookHash: 'book/one' });
    await store.remove(artifact);
    expect(files.has(`Cache/${path}`)).toBe(false);
    expect(files.has(`Cache/${path}.bak`)).toBe(false);
  });

  test('rejects unsupported schema versions', () => {
    expect(() => parseTranslationArtifact({ schemaVersion: 99 })).toThrow('Unsupported');
  });
});
