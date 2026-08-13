import { describe, expect, test, vi } from 'vitest';
import {
  COMIC_WORKER_PROTOCOL,
  COMIC_WORKER_PROTOCOL_VERSION,
  createTesseractOcrRuntimeFactory,
  sha256Hex,
  type ComicWorkerJobRequest,
  type ComicWorkerPageInput,
  type OcrModelManifest,
  type TesseractOcrClient,
} from '@/services/translators';

const page: ComicWorkerPageInput = {
  pageId: 'page-1',
  width: 640,
  height: 960,
  format: 'png',
  localRef: 'comic-session/page-1.png',
};

const request: ComicWorkerJobRequest = {
  protocol: COMIC_WORKER_PROTOCOL,
  protocolVersion: COMIC_WORKER_PROTOCOL_VERSION,
  requestId: 'request-1',
  bookHash: 'book-1',
  pages: [page],
  sourceLangs: ['ja'],
  options: { detect: true, ocr: true, verticalText: true },
};

const createModel = async (runtime: OcrModelManifest['runtime'] = 'wasm') => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  return {
    bytes,
    manifest: {
      format: 'babelleaf.ocr-model',
      schemaVersion: 2,
      id: 'tessdata-fast-jpn',
      version: '4.1.0',
      runtime,
      languages: ['ja'],
      license: 'Apache-2.0',
      checksumSha256: await sha256Hex(bytes),
      sizeBytes: bytes.byteLength,
      source: 'local-import',
      engineCompatibility: ['tesseract-wasm'],
      cpuFallback: true,
      artifacts: [
        {
          id: 'traineddata',
          fileName: 'jpn.traineddata',
          sizeBytes: bytes.byteLength,
          checksumSha256: await sha256Hex(bytes),
        },
      ],
      primaryArtifactId: 'traineddata',
    } satisfies OcrModelManifest,
  };
};

const createClient = () => {
  const calls = {
    model: undefined as ArrayBuffer | undefined,
    image: undefined as ImageBitmap | ImageData | undefined,
    cleared: 0,
    destroyed: 0,
  };
  const client: TesseractOcrClient = {
    loadModel: async (model) => {
      calls.model = model;
    },
    loadImage: async (image) => {
      calls.image = image;
    },
    getTextBoxes: async (_unit, onProgress) => {
      onProgress?.(0.5);
      return [
        {
          rect: { left: 10, top: 20, right: 210, bottom: 70 },
          flags: 0,
          confidence: 0.93,
          text: 'テスト',
        },
        {
          rect: { left: 300, top: 100, right: 340, bottom: 300 },
          flags: 0,
          confidence: 0.82,
          text: '縦書き',
        },
        {
          rect: { left: 0, top: 0, right: 1, bottom: 1 },
          flags: 0,
          confidence: 0,
          text: '   ',
        },
      ];
    },
    clearImage: async () => {
      calls.cleared += 1;
    },
    destroy: async () => {
      calls.destroyed += 1;
    },
  };
  return { calls, client };
};

describe('Tesseract WASM OCR runtime', () => {
  test('loads verified local traineddata and maps line boxes to comic regions', async () => {
    const model = await createModel();
    const { calls, client } = createClient();
    const image = {} as ImageData;
    const reportProgress = vi.fn();
    let reads = 0;
    const factory = createTesseractOcrRuntimeFactory({
      pageSource: {
        read: async () => {
          reads += 1;
          return new Uint8Array([9, 8, 7]);
        },
      },
      createClient: async () => client,
      decodeImage: async () => image,
    });

    const runtime = await factory.create(model.manifest, model.bytes.buffer);
    const regions = await runtime.processPage(page, request, {
      signal: new AbortController().signal,
      reportProgress,
    });

    expect(runtime.descriptor).toMatchObject({
      engine: 'tesseract-wasm',
      engineVersion: '0.11.0',
      languages: ['ja'],
      modelId: model.manifest.id,
    });
    expect(reads).toBe(1);
    expect([...new Uint8Array(calls.model!)]).toEqual([...model.bytes]);
    expect(calls.image).toBe(image);
    expect(calls.cleared).toBe(1);
    expect(reportProgress).toHaveBeenCalled();
    expect(regions).toEqual([
      expect.objectContaining({
        id: 'page-1:tesseract:0001',
        text: 'テスト',
        orientation: 'horizontal',
        language: 'ja',
        confidence: 0.93,
      }),
      expect.objectContaining({
        id: 'page-1:tesseract:0002',
        text: '縦書き',
        orientation: 'vertical',
      }),
    ]);

    await runtime.close?.();
    await runtime.close?.();
    expect(calls.destroyed).toBe(1);
    await expect(
      runtime.processPage(page, request, {
        signal: new AbortController().signal,
        reportProgress: () => undefined,
      }),
    ).rejects.toThrow('closed');
  });

  test('rejects remote page references before reading bytes', async () => {
    const model = await createModel();
    const { client } = createClient();
    let reads = 0;
    const runtime = await createTesseractOcrRuntimeFactory({
      pageSource: {
        read: async () => {
          reads += 1;
          return new Uint8Array([1]);
        },
      },
      createClient: async () => client,
      decodeImage: async () => ({}) as ImageData,
    }).create(model.manifest, model.bytes.buffer);

    await expect(
      runtime.processPage({ ...page, localRef: 'https://example.invalid/page.png' }, request, {
        signal: new AbortController().signal,
        reportProgress: () => undefined,
      }),
    ).rejects.toThrow('local application resources');
    expect(reads).toBe(0);
    await runtime.close?.();
  });

  test('requires a compatible WASM model whose primary artifact is traineddata', async () => {
    const { client } = createClient();
    const factory = createTesseractOcrRuntimeFactory({
      pageSource: { read: async () => new Uint8Array([1]) },
      createClient: async () => client,
      decodeImage: async () => ({}) as ImageData,
    });
    const onnx = await createModel('onnx');
    await expect(factory.create(onnx.manifest, onnx.bytes.buffer)).rejects.toThrow(
      'does not use the WASM runtime',
    );
    const wasm = await createModel();
    await expect(
      factory.create(
        {
          ...wasm.manifest,
          artifacts: [{ ...wasm.manifest.artifacts![0]!, fileName: 'model.bin' }],
        },
        wasm.bytes.buffer,
      ),
    ).rejects.toThrow('traineddata');
  });

  test('does not decode a page after cancellation', async () => {
    const model = await createModel();
    const { client } = createClient();
    let decodes = 0;
    const runtime = await createTesseractOcrRuntimeFactory({
      pageSource: { read: async () => new Uint8Array([1]) },
      createClient: async () => client,
      decodeImage: async () => {
        decodes += 1;
        return {} as ImageData;
      },
    }).create(model.manifest, model.bytes.buffer);
    const controller = new AbortController();
    controller.abort();
    await expect(
      runtime.processPage(page, request, {
        signal: controller.signal,
        reportProgress: () => undefined,
      }),
    ).rejects.toThrow('cancelled');
    expect(decodes).toBe(0);
    await runtime.close?.();
  });

  test('pre-rotates vertical models and maps OCR boxes back to source coordinates', async () => {
    const model = await createModel();
    model.manifest.languages = ['ja-vertical'];
    const { client } = createClient();
    client.getTextBoxes = async () => [
      {
        // Source box x=300..340, y=100..300 after a counter-clockwise rotation.
        rect: { left: 100, top: 300, right: 300, bottom: 340 },
        flags: 0,
        confidence: 0.9,
        text: '日 本 語',
      },
    ];
    let rotateCounterClockwise = false;
    const runtime = await createTesseractOcrRuntimeFactory({
      pageSource: { read: async () => new Uint8Array([1]) },
      createClient: async () => client,
      decodeImage: async (_bytes, _page, options) => {
        rotateCounterClockwise = options.rotateCounterClockwise;
        return {} as ImageData;
      },
    }).create(model.manifest, model.bytes.buffer);

    const regions = await runtime.processPage(
      page,
      { ...request, sourceLangs: ['ja-vertical'] },
      { signal: new AbortController().signal, reportProgress: () => undefined },
    );

    expect(rotateCounterClockwise).toBe(true);
    expect(regions[0]).toMatchObject({
      text: '日本語',
      orientation: 'vertical',
      polygon: [
        { x: 300, y: 100 },
        { x: 340, y: 100 },
        { x: 340, y: 300 },
        { x: 300, y: 300 },
      ],
    });
    await runtime.close?.();
  });
});
