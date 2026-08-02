import { describe, expect, test, vi } from 'vitest';
import type { BookDoc } from '@/libs/document';
import type { FileSystem } from '@/types/system';
import {
  createTranslationArtifact,
  TranslationArtifactStore,
} from '@/services/translators/artifacts';
import { extractTranslationItems, TranslationBatchController } from '@/services/translators/batch';

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

const makeBook = (): BookDoc =>
  ({
    metadata: { title: 'Test', author: 'Author', language: 'en' },
    rendition: { layout: 'reflowable' },
    dir: 'ltr',
    sections: [
      {
        id: 'chapter-1',
        cfi: 'epubcfi(/6/2)',
        size: 20,
        linear: 'yes',
        loadText: async () => '<h1>Chapter</h1><p>Hello world.</p><p>Second block.</p>',
        createDocument: async () => document.implementation.createHTMLDocument('chapter'),
      },
      {
        id: 'cover',
        cfi: 'epubcfi(/6/4)',
        size: 10,
        linear: 'no',
        loadText: async () => '<p>Ignored</p>',
        createDocument: async () => document.implementation.createHTMLDocument('cover'),
      },
    ],
    splitTOCHref: () => [],
    getCover: async () => null,
  }) as BookDoc;

describe('translation batch services', () => {
  test('extracts stable bounded chapter segments and skips non-linear sections', async () => {
    const items = await extractTranslationItems(makeBook());
    const chapterItems = await extractTranslationItems(makeBook(), { sectionIndices: [0] });
    const excludedItems = await extractTranslationItems(makeBook(), { sectionIndices: [1] });

    expect(items.map((item) => item.id)).toEqual(['chapter-1:0', 'chapter-1:1', 'chapter-1:2']);
    expect(chapterItems).toHaveLength(3);
    expect(excludedItems).toHaveLength(0);
    expect(items[0]).toMatchObject({
      text: 'Chapter',
      chapterId: 'chapter-1',
      sourceLocator: 'epubcfi(/6/2)',
    });
  });

  test('checkpoints completed and failed results to the local artifact store', async () => {
    const { fs } = makeFileSystem();
    const store = new TranslationArtifactStore(fs);
    const artifact = createTranslationArtifact({
      bookHash: 'book-hash',
      provider: 'deepseek',
      promptVersion: 'translation-v1',
      sourceLang: 'en',
      targetLang: 'zh-CN',
    });
    const controller = new TranslationBatchController({
      artifact,
      kind: 'chapter',
      artifactStore: store,
      concurrency: 2,
      items: [
        { id: 'chapter-1:0', text: 'Hello', chapterId: 'chapter-1' },
        { id: 'chapter-1:1', text: 'Fail', chapterId: 'chapter-1' },
      ],
      translate: async (item) => {
        if (item.text === 'Fail') throw new Error('provider unavailable');
        return '你好';
      },
    });

    const result = await controller.start();
    const saved = await store.load(artifact);

    expect(result.status).toBe('failed');
    expect(result.kind).toBe('chapter');
    expect(saved?.segments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'chapter-1:0',
          status: 'translated',
          translatedText: '你好',
        }),
        expect.objectContaining({
          id: 'chapter-1:1',
          status: 'failed',
          error: 'provider unavailable',
        }),
      ]),
    );
  });

  test('does not requeue an already translated segment and rejects stale source text', async () => {
    const artifact = createTranslationArtifact({
      bookHash: 'book-hash',
      provider: 'deepseek',
      promptVersion: 'translation-v1',
      sourceLang: 'en',
      targetLang: 'zh-CN',
      segments: [
        {
          id: 'chapter-1:0',
          sourceText: 'Existing',
          translatedText: '已有',
          sourceLang: 'en',
          targetLang: 'zh-CN',
          status: 'translated',
          updatedAt: 1,
        },
      ],
    });
    const translate = vi.fn(async () => 'new');
    const controller = new TranslationBatchController({
      artifact,
      items: [
        { id: 'chapter-1:0', text: 'Existing' },
        { id: 'chapter-1:1', text: 'New' },
      ],
      translate,
    });

    const result = await controller.start();
    expect(result.completed).toBe(1);
    expect(translate).toHaveBeenCalledTimes(1);

    expect(
      () =>
        new TranslationBatchController({
          artifact,
          items: [{ id: 'chapter-1:0', text: 'Changed' }],
          translate,
        }),
    ).toThrow('source changed');
  });
});
