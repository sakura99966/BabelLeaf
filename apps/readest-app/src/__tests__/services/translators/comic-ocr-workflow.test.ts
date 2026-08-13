import { describe, expect, test, vi } from 'vitest';
import {
  COMIC_WORKER_PROTOCOL,
  COMIC_WORKER_PROTOCOL_VERSION,
  runComicOcrPages,
  type ComicWorkspace,
  type GatedOcrRuntime,
  type OcrModelManifest,
} from '@/services/translators';

const model: OcrModelManifest = {
  format: 'babelleaf.ocr-model',
  schemaVersion: 1,
  id: 'test-model',
  version: '1',
  runtime: 'wasm',
  languages: ['ja'],
  license: 'Apache-2.0',
  checksumSha256: 'a'.repeat(64),
  sizeBytes: 1,
  source: 'local-import',
  engineCompatibility: ['test-engine'],
  cpuFallback: true,
};

const workspace: ComicWorkspace = {
  format: 'babelleaf.comic-workspace',
  schemaVersion: 1,
  bookHash: 'book-1',
  sourceFormat: 'CBZ',
  createdAt: 1,
  updatedAt: 1,
  revision: 1,
  pages: [0, 1].map((pageIndex) => ({
    pageId: `page-${pageIndex + 1}`,
    pageIndex,
    width: 640,
    height: 960,
    format: 'png',
    localRef: `session://book-1/page-${pageIndex + 1}`,
    regions: [],
    updatedAt: 1,
  })),
};

const createRuntime = () => {
  const close = vi.fn();
  const processPage = vi.fn(async (page) => [
    {
      id: `${page.pageId}:region-1`,
      pageId: page.pageId,
      polygon: [
        { x: 10, y: 10 },
        { x: 200, y: 10 },
        { x: 200, y: 80 },
        { x: 10, y: 80 },
      ],
      orientation: 'horizontal' as const,
      language: 'ja',
      text: `text-${page.pageId}`,
      confidence: 0.9,
      readingOrder: 0,
      engine: 'test-engine',
      model: model.id,
    },
  ]);
  const runtime = {
    model,
    gate: {
      code: 'ready',
      ready: true,
      message: 'ready',
      missingLanguages: [],
      missingCapabilities: [],
    },
    runtime: {
      model,
      descriptor: {
        protocol: COMIC_WORKER_PROTOCOL,
        protocolVersion: COMIC_WORKER_PROTOCOL_VERSION,
        engine: 'test-engine',
        engineVersion: '1',
        capabilities: ['ocr', 'text-layer'],
        languages: ['ja'],
        maxWorkers: 1,
      },
      processPage,
      close,
    },
    engine: {
      descriptor: {
        protocol: COMIC_WORKER_PROTOCOL,
        protocolVersion: COMIC_WORKER_PROTOCOL_VERSION,
        engine: 'test-engine',
        engineVersion: '1',
        capabilities: ['ocr', 'text-layer'],
        languages: ['ja'],
        maxWorkers: 1,
      },
      processPage,
    },
  } as GatedOcrRuntime;
  return { close, processPage, runtime };
};

describe('comic local OCR workflow', () => {
  test('processes selected local pages, checkpoints every result, and closes the runtime', async () => {
    const { close, processPage, runtime } = createRuntime();
    const checkpoints: ComicWorkspace[] = [];
    const progress = vi.fn();

    const result = await runComicOcrPages({
      runtime,
      workspace,
      pageIds: ['page-1', 'page-2'],
      requestId: 'ocr-request-1',
      signal: new AbortController().signal,
      checkpoint: async (value) => {
        checkpoints.push(value);
      },
      onProgress: progress,
    });

    expect(processPage).toHaveBeenCalledTimes(2);
    expect(checkpoints).toHaveLength(2);
    expect(result.completedPageIds).toEqual(['page-1', 'page-2']);
    expect(result.workspace.pages.map((page) => page.regions[0]?.machine?.text)).toEqual([
      'text-page-1',
      'text-page-2',
    ]);
    expect(workspace.pages.every((page) => page.regions.length === 0)).toBe(true);
    expect(progress).toHaveBeenLastCalledWith({ completed: 2, total: 2, pageId: 'page-2' });
    expect(close).toHaveBeenCalledTimes(1);
  });

  test('stops before the next page when cancelled and still closes the runtime', async () => {
    const { close, processPage, runtime } = createRuntime();
    const controller = new AbortController();
    await expect(
      runComicOcrPages({
        runtime,
        workspace,
        pageIds: ['page-1', 'page-2'],
        signal: controller.signal,
        checkpoint: async () => controller.abort(),
      }),
    ).rejects.toThrow('cancelled');
    expect(processPage).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
