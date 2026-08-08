import { describe, expect, test } from 'vitest';
import {
  COMIC_WORKER_PROTOCOL,
  COMIC_WORKER_PROTOCOL_VERSION,
  createOnnxOcrRuntimeFactory,
  findOcrCandidate,
  listOcrCandidates,
  computeOcrModelPackChecksum,
  sha256Hex,
  type ComicWorkerDescriptor,
  type ComicWorkerJobRequest,
  type ComicWorkerPageInput,
  type OcrModelManifest,
  type OnnxOcrAdapterDefinition,
} from '@/services/translators';

const descriptor: ComicWorkerDescriptor = {
  protocol: COMIC_WORKER_PROTOCOL,
  protocolVersion: COMIC_WORKER_PROTOCOL_VERSION,
  engine: 'onnx-test',
  engineVersion: '0.1.0',
  capabilities: ['detect', 'ocr', 'text-layer', 'cpu-fallback'],
  languages: ['ja'],
  maxWorkers: 1,
  modelId: 'onnx-test-model',
};

const page: ComicWorkerPageInput = {
  pageId: 'page-1',
  width: 640,
  height: 960,
  format: 'png',
  localRef: 'Books/book-1/page-1.png',
};

const request: ComicWorkerJobRequest = {
  protocol: COMIC_WORKER_PROTOCOL,
  protocolVersion: COMIC_WORKER_PROTOCOL_VERSION,
  requestId: 'request-1',
  bookHash: 'book-1',
  pages: [page],
  sourceLangs: ['ja'],
};

const createModel = async (runtime: OcrModelManifest['runtime'] = 'onnx') => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  return {
    bytes,
    manifest: {
      format: 'babelleaf.ocr-model',
      schemaVersion: 1,
      id: 'onnx-test-model',
      version: '0.1.0',
      runtime,
      languages: ['ja'],
      license: 'MIT',
      checksumSha256: await sha256Hex(bytes),
      sizeBytes: bytes.byteLength,
      source: 'local-import',
      engineCompatibility: ['onnx-test'],
      cpuFallback: true,
    } satisfies OcrModelManifest,
  };
};

describe('ONNX OCR runtime adapter boundary', () => {
  test('passes local page bytes through a replaceable session and closes it', async () => {
    const model = await createModel();
    let received: ArrayBuffer | undefined;
    let closed = 0;
    const adapter: OnnxOcrAdapterDefinition = {
      descriptor,
      createSession: async (_manifest, modelBytes) => {
        expect(modelBytes).toEqual(model.bytes.buffer);
        return {
          run: async (input) => {
            received = input.imageBytes;
            return { text: 'テスト' };
          },
          close: () => {
            closed += 1;
          },
        };
      },
      decode: (output, inputPage) => [
        {
          id: 'region-1',
          pageId: inputPage.pageId,
          polygon: [
            { x: 10, y: 10 },
            { x: 120, y: 10 },
            { x: 120, y: 80 },
          ],
          orientation: 'horizontal',
          language: 'ja',
          text: (output as { text: string }).text,
          readingOrder: 0,
          engine: descriptor.engine,
          model: model.manifest.id,
        },
      ],
    };
    let reads = 0;
    const factory = createOnnxOcrRuntimeFactory({
      adapter,
      pageSource: {
        read: async () => {
          reads += 1;
          return new Uint8Array([9, 8, 7]);
        },
      },
    });
    const runtime = await factory.create(model.manifest, model.bytes.buffer);
    const result = await runtime.processPage(page, request, {
      signal: new AbortController().signal,
      reportProgress: () => undefined,
    });
    expect(reads).toBe(1);
    expect([...new Uint8Array(received!)]).toEqual([9, 8, 7]);
    expect(result[0]?.text).toBe('テスト');
    await runtime.close?.();
    await runtime.close?.();
    expect(closed).toBe(1);
    await expect(
      runtime.processPage(page, request, {
        signal: new AbortController().signal,
        reportProgress: () => undefined,
      }),
    ).rejects.toThrow('closed');
  });

  test('does not read a page after cancellation and rejects non-ONNX models', async () => {
    const model = await createModel();
    const adapter: OnnxOcrAdapterDefinition = {
      descriptor,
      createSession: async () => ({
        run: async () => [],
      }),
      decode: () => [],
    };
    let reads = 0;
    const factory = createOnnxOcrRuntimeFactory({
      adapter,
      pageSource: {
        read: async () => {
          reads += 1;
          return new Uint8Array([1]);
        },
      },
    });
    const runtime = await factory.create(model.manifest, model.bytes.buffer);
    const controller = new AbortController();
    controller.abort();
    await expect(
      runtime.processPage(page, request, {
        signal: controller.signal,
        reportProgress: () => undefined,
      }),
    ).rejects.toThrow('cancelled');
    expect(reads).toBe(0);
    const wasmModel = await createModel('wasm');
    await expect(factory.create(wasmModel.manifest, wasmModel.bytes.buffer)).rejects.toThrow(
      'does not use the ONNX runtime',
    );
  });

  test('rejects remote page references before invoking the page source', async () => {
    const model = await createModel();
    let reads = 0;
    const factory = createOnnxOcrRuntimeFactory({
      adapter: {
        descriptor,
        createSession: async () => ({ run: async () => [] }),
        decode: () => [],
      },
      pageSource: {
        read: async () => {
          reads += 1;
          return new Uint8Array([1]);
        },
      },
    });
    const runtime = await factory.create(model.manifest, model.bytes.buffer);
    await expect(
      runtime.processPage({ ...page, localRef: 'https://example.invalid/page.png' }, request, {
        signal: new AbortController().signal,
        reportProgress: () => undefined,
      }),
    ).rejects.toThrow('local application resources');
    expect(reads).toBe(0);
  });

  test('passes verified multi-file model artifacts to the provider session', async () => {
    const encoder = new Uint8Array([1, 2, 3]);
    const vocabulary = new Uint8Array([4, 5]);
    const artifacts = [
      {
        id: 'encoder',
        fileName: 'encoder.onnx',
        sizeBytes: encoder.byteLength,
        checksumSha256: await sha256Hex(encoder),
      },
      {
        id: 'vocab',
        fileName: 'vocab.txt',
        sizeBytes: vocabulary.byteLength,
        checksumSha256: await sha256Hex(vocabulary),
      },
    ] as const;
    const model: OcrModelManifest = {
      format: 'babelleaf.ocr-model',
      schemaVersion: 2,
      id: descriptor.modelId!,
      version: descriptor.engineVersion,
      runtime: 'onnx',
      languages: ['ja'],
      license: 'MIT',
      checksumSha256: await computeOcrModelPackChecksum(artifacts),
      sizeBytes: encoder.byteLength + vocabulary.byteLength,
      source: 'local-import',
      engineCompatibility: [descriptor.engine],
      cpuFallback: true,
      artifacts: [...artifacts],
      primaryArtifactId: 'encoder',
    };
    let received: ReadonlyMap<string, ArrayBuffer> | undefined;
    const factory = createOnnxOcrRuntimeFactory({
      adapter: {
        descriptor,
        createSession: async (_model, _modelBytes, modelArtifacts) => {
          received = modelArtifacts;
          return { run: async () => [] };
        },
        decode: () => [],
      },
      pageSource: { read: async () => new Uint8Array([1]) },
    });
    await factory.create(
      model,
      encoder.buffer,
      new Map([
        ['encoder', encoder.buffer],
        ['vocab', vocabulary.buffer],
      ]),
    );
    expect([...received!.keys()]).toEqual(['encoder', 'vocab']);
    expect([...new Uint8Array(received!.get('vocab')!)]).toEqual([...vocabulary]);
    await expect(factory.create(model, encoder.buffer)).rejects.toThrow('artifacts are missing');
  });

  test('exposes candidate metadata without mutating the registry', () => {
    const candidates = listOcrCandidates();
    expect(candidates.map((candidate) => candidate.id)).toEqual(['paddleocr-onnx', 'manga-ocr-rs']);
    expect(findOcrCandidate('manga-ocr-rs')?.status).toBe('adapter-ready');
    candidates[0]!.languages.push('en');
    expect(findOcrCandidate('paddleocr-onnx')?.languages).toEqual(['zh', 'en', 'ja']);
    expect(findOcrCandidate('unknown')).toBeNull();
  });
});
