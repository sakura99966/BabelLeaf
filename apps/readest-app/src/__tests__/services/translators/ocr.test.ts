import { describe, expect, test } from 'vitest';
import {
  COMIC_WORKER_PROTOCOL,
  COMIC_WORKER_PROTOCOL_VERSION,
  createMockComicOcrEngine,
  createOcrTextLayerBlocks,
  createEmptyOcrSidecar,
  createOcrPageInputs,
  diagnoseOcrSource,
  inferOcrPageFormat,
  OcrModelRegistry,
  OcrTaskController,
  OcrTaskQueue,
  ocrPageToPlainText,
  parseOcrModelManifest,
  parseOcrSidecar,
  selectOcrModel,
  serializeOcrSidecar,
  type ComicWorkerPageInput,
  type ComicWorkerDescriptor,
  type OcrTaskInput,
} from '@/services/translators';

const page: ComicWorkerPageInput & { pageIndex: number } = {
  pageIndex: 0,
  pageId: 'page-1',
  width: 1200,
  height: 1800,
  format: 'png',
  localRef: 'Books/book-1/page-1.png',
};

const descriptor = {
  protocol: COMIC_WORKER_PROTOCOL,
  protocolVersion: COMIC_WORKER_PROTOCOL_VERSION,
  engine: 'babelleaf-test-ocr',
  engineVersion: '0.4.0-test',
  capabilities: ['detect', 'ocr', 'vertical-text', 'ruby', 'cpu-fallback', 'text-layer'],
  languages: ['zh', 'en', 'ja'],
  maxWorkers: 2,
} satisfies ComicWorkerDescriptor;

describe('OCR foundation', () => {
  test('round-trips a credential-free OCR sidecar with ruby metadata', () => {
    const sidecar = createEmptyOcrSidecar({
      bookHash: 'book-1',
      sourceFingerprint: 'source-1',
      sourceFormat: 'CBZ',
      descriptor,
      runtime: 'cpu',
      pages: [page],
      now: 100,
    });
    sidecar.pages[0]!.status = 'completed';
    sidecar.pages[0]!.regions = [
      {
        id: 'region-1',
        pageId: 'page-1',
        polygon: [
          { x: 10, y: 20 },
          { x: 220, y: 20 },
          { x: 220, y: 120 },
        ],
        orientation: 'vertical',
        language: 'ja',
        text: '漢字',
        confidence: 0.97,
        readingOrder: 0,
        engine: 'babelleaf-test-ocr',
        ruby: [{ text: 'かんじ', baseText: '漢字', position: 'above' }],
      },
    ];
    const restored = parseOcrSidecar(JSON.parse(serializeOcrSidecar(sidecar)));
    expect(restored.pages[0]).toMatchObject({ status: 'completed', pageId: 'page-1' });
    expect(restored.pages[0]?.regions[0]?.ruby?.[0]).toMatchObject({ text: 'かんじ' });
    expect(JSON.stringify(restored)).not.toContain('apiKey');
    const hostile = JSON.parse(serializeOcrSidecar(sidecar)) as Record<string, unknown>;
    const hostilePages = hostile['pages'] as Array<Record<string, unknown>>;
    const hostileRegions = hostilePages[0]!['regions'] as Array<Record<string, unknown>>;
    hostileRegions[0]!['polygon'] = [
      { x: 0, y: 0 },
      { x: 9_999, y: 0 },
      { x: 0, y: 10 },
    ];
    expect(() => parseOcrSidecar(hostile)).toThrow('page bounds');
  });

  test('builds a selectable text layer without changing the page image', () => {
    const sidecar = createEmptyOcrSidecar({
      bookHash: 'book-1',
      sourceFormat: 'PDF',
      descriptor,
      pages: [page],
    });
    sidecar.pages[0]!.regions = [
      {
        id: 'second',
        pageId: 'page-1',
        polygon: [
          { x: 600, y: 800 },
          { x: 800, y: 800 },
          { x: 800, y: 900 },
        ],
        orientation: 'horizontal',
        text: 'World',
        readingOrder: 1,
        engine: 'test',
      },
      {
        id: 'first',
        pageId: 'page-1',
        polygon: [
          { x: 10, y: 20 },
          { x: 200, y: 20 },
          { x: 200, y: 120 },
        ],
        orientation: 'horizontal',
        text: 'Hello',
        readingOrder: 0,
        engine: 'test',
      },
    ];
    const blocks = createOcrTextLayerBlocks(sidecar.pages[0]!);
    expect(blocks.map((block) => block.text)).toEqual(['Hello', 'World']);
    expect(ocrPageToPlainText(sidecar.pages[0]!)).toBe('Hello\nWorld');
    expect(sidecar.pages[0]?.localRef).toBe(page.localRef);
  });

  test('runs bounded OCR tasks and checkpoints sidecar state', async () => {
    const sidecar = createEmptyOcrSidecar({
      bookHash: 'book-1',
      sourceFormat: 'CBZ',
      descriptor,
      pages: [page],
    });
    const engine = createMockComicOcrEngine({
      'page-1': [
        {
          id: 'region-1',
          pageId: 'page-1',
          polygon: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
          ],
          orientation: 'horizontal',
          text: '本地',
          readingOrder: 0,
          engine: 'babelleaf-test-ocr',
        },
      ],
    });
    let savedSidecar = 0;
    let savedTask = 0;
    const controller = new OcrTaskController({
      sidecar,
      pages: [page],
      sidecarCheckpoint: { save: async () => void savedSidecar++ },
      taskCheckpoint: { save: async () => void savedTask++ },
      processPage: async (item, signal) => ({
        pageId: item.page.pageId,
        width: item.page.width,
        height: item.page.height,
        regions: await engine.processPage(
          item.page,
          {
            protocol: COMIC_WORKER_PROTOCOL,
            protocolVersion: COMIC_WORKER_PROTOCOL_VERSION,
            requestId: 'ocr-1',
            bookHash: 'book-1',
            pages: [item.page],
            sourceLangs: ['zh'],
          },
          { signal, reportProgress: () => undefined },
        ),
        status: 'completed',
      }),
    });
    const result = await controller.start();
    expect(result.status).toBe('completed');
    expect(controller.getSidecar().pages[0]?.regions[0]?.text).toBe('本地');
    expect(savedSidecar).toBeGreaterThan(0);
    expect(savedTask).toBeGreaterThan(0);
  });

  test('recovers interrupted tasks and retries failed pages', async () => {
    let calls = 0;
    const input: OcrTaskInput = {
      id: 'task-1',
      bookHash: 'book-1',
      sourceFormat: 'CBZ',
      engine: descriptor.engine,
      engineVersion: descriptor.engineVersion,
      pages: [page],
      maxAttempts: 1,
      initialSnapshot: {
        id: 'task-1',
        bookHash: 'book-1',
        sourceFormat: 'CBZ',
        engine: descriptor.engine,
        engineVersion: descriptor.engineVersion,
        status: 'running',
        total: 1,
        completed: 0,
        failed: 0,
        cancelled: 0,
        maxAttempts: 1,
        updatedAt: 1,
        items: [
          {
            id: 'task-1:0:page-1',
            pageIndex: 0,
            page,
            status: 'running',
            attempts: 1,
          },
        ],
      },
    };
    const queue = new OcrTaskQueue(input, async (item) => {
      calls += 1;
      if (calls === 1) throw new Error('temporary OCR failure');
      return {
        pageId: item.page.pageId,
        width: item.page.width,
        height: item.page.height,
        regions: [],
        status: 'completed',
      };
    });
    expect(queue.getSnapshot()).toMatchObject({ status: 'paused', recovered: true });
    expect((await queue.resume()).status).toBe('failed');
    expect((await queue.retryFailed()).status).toBe('completed');
    expect(calls).toBe(2);
  });

  test('requires local models and ranks installed compatible packs first', () => {
    const manifest = parseOcrModelManifest({
      format: 'babelleaf.ocr-model',
      schemaVersion: 1,
      id: 'multilingual-base',
      version: '1.0.0',
      runtime: 'onnx',
      languages: ['zh', 'en', 'ja'],
      license: 'Apache-2.0',
      checksumSha256: 'a'.repeat(64),
      sizeBytes: 1024,
      source: 'local-import',
      engineCompatibility: ['onnx-runtime'],
      cpuFallback: true,
    });
    expect(
      selectOcrModel([manifest], ['ja'], 'onnx-runtime', new Set(['multilingual-base']))
        ?.availability,
    ).toBe('installed');
    expect(diagnoseOcrSource('CBZ', { modelAvailable: false })).toMatchObject({
      code: 'model-missing',
      supported: false,
      requiresLocalModel: true,
    });
    const registry = new OcrModelRegistry([manifest]);
    expect(registry.select(['zh', 'ja'], 'onnx-runtime')?.availability).toBe('installed');
    expect(inferOcrPageFormat('page.JPG')).toBe('jpeg');
    expect(createOcrPageInputs([page])).toHaveLength(1);
    expect(() => createOcrPageInputs([{ ...page, pageId: 'page-1' }, page])).toThrow(
      'Duplicate OCR page',
    );
  });
});
