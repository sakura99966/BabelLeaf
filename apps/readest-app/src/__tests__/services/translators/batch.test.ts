import { describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DocumentLoader } from '@/libs/document';
import type { BookDoc } from '@/libs/document';
import type { FileSystem } from '@/types/system';
import {
  createTranslationArtifact,
  TranslationArtifactStore,
} from '@/services/translators/artifacts';
import { extractTranslationItems, TranslationBatchController } from '@/services/translators/batch';
import { TranslationJobStore } from '@/services/translators/jobStore';
import { createTranslationGlossary } from '@/services/translators/glossary';
import { TranslationMemory } from '@/services/translators/memory';

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
  test('keeps existing artifact segments in progress counts', async () => {
    const artifact = createTranslationArtifact({
      bookHash: 'progress-book',
      provider: 'deepseek',
      promptVersion: 'translation-v1',
      sourceLang: 'en',
      targetLang: 'zh-CN',
      segments: [
        {
          id: 'segment-0',
          sourceText: 'Already done',
          translatedText: 'done',
          sourceLang: 'en',
          targetLang: 'zh-CN',
          status: 'translated',
          updatedAt: 1,
        },
      ],
    });
    const translate = vi.fn(async () => 'new translation');
    const controller = new TranslationBatchController({
      artifact,
      items: [
        { id: 'segment-0', text: 'Already done' },
        { id: 'segment-1', text: 'Needs translation' },
      ],
      translate,
    });

    const result = await controller.start();
    expect(result).toMatchObject({ total: 2, completed: 2, status: 'completed' });
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'segment-0', status: 'completed' }),
        expect.objectContaining({ id: 'segment-1', status: 'completed' }),
      ]),
    );
    expect(translate).toHaveBeenCalledTimes(1);
  });

  test('extracts stable segments from the real EPUB and TXT fixtures', async () => {
    const fixture = async (name: string, type: string) => {
      const bytes = readFileSync(resolve(__dirname, '../../fixtures/data', name));
      return (await new DocumentLoader(new File([bytes], name, { type })).open()).book;
    };

    const epubItems = await extractTranslationItems(
      await fixture('sample-alice.epub', 'application/epub+zip'),
      { maxSegments: 40 },
    );
    const txtItems = await extractTranslationItems(
      await fixture('sample-alice.txt', 'text/plain'),
      { maxSegments: 40 },
    );

    expect(epubItems.length).toBeGreaterThan(0);
    expect(txtItems.length).toBeGreaterThan(0);
    expect(epubItems.every((item) => item.sourceLocator?.startsWith('epubcfi('))).toBe(true);
    expect(txtItems.every((item) => item.sourceLocator?.startsWith('epubcfi('))).toBe(true);
    expect(txtItems.some((item) => item.text.includes('Alice'))).toBe(true);
  }, 30000);

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
      sourceAnchor: expect.objectContaining({
        schemaVersion: 1,
        sectionIndex: 0,
        blockIndex: 0,
        chunkIndex: 0,
      }),
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
    expect(result.completed).toBe(2);
    expect(result.total).toBe(2);
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

  test('enforces glossary terms, uses translation memory, and supports human review', async () => {
    const artifact = createTranslationArtifact({
      bookHash: 'glossary-book',
      provider: 'deepseek',
      promptVersion: 'translation-v1',
      sourceLang: 'en',
      targetLang: 'zh-CN',
    });
    const memory = new TranslationMemory();
    const translate = vi.fn(async (item) => `translated ${item.text}`);
    const glossary = createTranslationGlossary([
      { source: 'New York', target: '纽约', sourceLang: 'en', targetLang: 'zh-CN' },
    ]);
    const controller = new TranslationBatchController({
      artifact,
      translationMemory: memory,
      glossary,
      items: [{ id: 'segment-0', text: 'Visit New York.' }],
      translate,
    });

    await controller.start();
    expect(translate).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('__BABELLEAF_GLOSSARY_') }),
      expect.any(AbortSignal),
    );
    expect(controller.getArtifact().segments[0]).toMatchObject({
      status: 'translated',
      translatedText: 'translated Visit 纽约.',
    });

    const reviewed = await controller.reviewSegment('segment-0', '访问纽约。');
    expect(reviewed.segments[0]).toMatchObject({
      status: 'reviewed',
      translatedText: '访问纽约。',
    });

    const memoryHitController = new TranslationBatchController({
      artifact: createTranslationArtifact({
        bookHash: 'memory-book',
        provider: 'deepseek',
        promptVersion: 'translation-v1',
        sourceLang: 'en',
        targetLang: 'zh-CN',
      }),
      translationMemory: memory,
      items: [{ id: 'segment-0', text: 'Visit New York.' }],
      translate,
      glossary,
    });
    await memoryHitController.start();
    expect(translate).toHaveBeenCalledTimes(1);
  });

  test('retries transient failures and recovers a persisted failed job', async () => {
    const { fs } = makeFileSystem();
    const artifactStore = new TranslationArtifactStore(fs);
    const jobStore = new TranslationJobStore(fs);
    const artifact = createTranslationArtifact({
      bookHash: 'retry-book',
      provider: 'deepseek',
      promptVersion: 'translation-v1',
      sourceLang: 'en',
      targetLang: 'zh-CN',
    });
    let calls = 0;
    const translate = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error('temporary');
      return '成功';
    });
    const controller = new TranslationBatchController({
      artifact,
      artifactStore,
      jobStore,
      maxAttempts: 2,
      items: [{ id: 'segment-0', text: 'Retry me' }],
      translate,
    });
    const result = await controller.start();
    expect(result.status).toBe('completed');
    expect(result.items[0]).toMatchObject({ attempts: 2, status: 'completed' });
    await controller.flush();

    const restored = await TranslationBatchController.restore({
      artifact: controller.getArtifact(),
      artifactStore,
      jobStore,
      items: [{ id: 'segment-0', text: 'Retry me' }],
      translate,
    });
    expect(restored.getSnapshot().status).toBe('completed');
    expect(restored.getSnapshot()).toMatchObject({ total: 1, completed: 1, failed: 0 });
    expect(restored.getArtifact().segments[0]?.translatedText).toBe('成功');
  });
});
