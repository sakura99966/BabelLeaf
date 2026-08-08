import { describe, expect, test } from 'vitest';
import {
  COMIC_WORKER_PROTOCOL,
  COMIC_WORKER_PROTOCOL_VERSION,
  benchmarkOcrRuntime,
  createGatedOcrRuntime,
  createInstalledGatedOcrRuntime,
  createOcrRuntimePageProcessor,
  computeOcrModelPackChecksum,
  installOcrModelPack,
  listOcrModelPacks,
  loadOcrModelPack,
  parseOcrModelManifest,
  readAndVerifyOcrModelArtifacts,
  readAndVerifyOcrModelBytes,
  removeOcrModelPack,
  sha256Hex,
  type ComicWorkerEngine,
  type ComicWorkerPageInput,
  type OcrModelManifest,
  type OcrModelPackStorage,
} from '@/services/translators';

const descriptor = {
  protocol: COMIC_WORKER_PROTOCOL,
  protocolVersion: COMIC_WORKER_PROTOCOL_VERSION,
  engine: 'local-ocr-test',
  engineVersion: '1.0.0',
  capabilities: ['detect', 'ocr', 'text-layer', 'cpu-fallback'],
  languages: ['ja', 'en'],
  maxWorkers: 1,
  modelId: 'test-model',
} as const satisfies ComicWorkerEngine['descriptor'];

const page: ComicWorkerPageInput = {
  pageId: 'page-1',
  width: 800,
  height: 1200,
  format: 'png',
  localRef: 'Books/book-1/page-1.png',
};

type TestStorage = OcrModelPackStorage & { files: Map<string, string | ArrayBuffer> };

const createStorage = (failAfterWrite?: number): TestStorage => {
  const files = new Map<string, string | ArrayBuffer>();
  let writes = 0;
  const storage: OcrModelPackStorage = {
    createDir: async () => undefined,
    readFile: async (path, _base, mode) => {
      const value = files.get(path);
      if (value === undefined) throw new Error(`missing: ${path}`);
      if (mode === 'text' && typeof value !== 'string') throw new Error('expected text');
      if (mode === 'binary' && typeof value === 'string') throw new Error('expected binary');
      return value;
    },
    writeFile: async (path, _base, content) => {
      writes += 1;
      if (failAfterWrite !== undefined && writes === failAfterWrite) {
        throw new Error('simulated interrupted import');
      }
      if (typeof content === 'string') files.set(path, content);
      else if (content instanceof ArrayBuffer) files.set(path, content.slice(0));
      else files.set(path, await content.arrayBuffer());
    },
    removeFile: async (path) => {
      files.delete(path);
    },
    removeDir: async (path) => {
      for (const key of files.keys())
        if (key === path || key.startsWith(`${path}/`)) files.delete(key);
    },
  };
  return Object.assign(storage, { files });
};

const createManifest = async (bytes: Uint8Array): Promise<OcrModelManifest> => ({
  format: 'babelleaf.ocr-model',
  schemaVersion: 1,
  id: 'test-model',
  version: '1.0.0',
  runtime: 'wasm',
  languages: ['ja', 'en'],
  license: 'Apache-2.0',
  checksumSha256: await sha256Hex(bytes),
  sizeBytes: bytes.byteLength,
  source: 'local-import',
  engineCompatibility: [descriptor.engine],
  cpuFallback: true,
});

describe('OCR model packs and runtime gate', () => {
  test('installs, verifies, lists, loads, reads, and removes a local model pack', async () => {
    const storage = createStorage();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const manifest = await createManifest(bytes);
    const installed = await installOcrModelPack(storage, { manifest, modelBytes: bytes });
    expect(installed.manifest.id).toBe('test-model');
    expect(await listOcrModelPacks(storage)).toHaveLength(1);
    const loaded = await loadOcrModelPack(storage, manifest.id);
    expect(loaded?.manifest.version).toBe('1.0.0');
    expect([...new Uint8Array(await readAndVerifyOcrModelBytes(storage, loaded!))]).toEqual([
      1, 2, 3, 4,
    ]);
    expect(await removeOcrModelPack(storage, manifest.id)).toBe(true);
    expect(await listOcrModelPacks(storage)).toHaveLength(0);
  });

  test('installs and restores a schema-version 2 multi-artifact model pack', async () => {
    const storage = createStorage();
    const encoder = new Uint8Array([1, 2, 3, 4]);
    const vocabulary = new Uint8Array([5, 6, 7]);
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
    const manifest: OcrModelManifest = {
      format: 'babelleaf.ocr-model',
      schemaVersion: 2,
      id: 'multi-file-model',
      version: '2.0.0',
      runtime: 'onnx',
      languages: ['ja'],
      license: 'Apache-2.0',
      checksumSha256: await computeOcrModelPackChecksum(artifacts),
      sizeBytes: encoder.byteLength + vocabulary.byteLength,
      source: 'local-import',
      engineCompatibility: ['local-ocr-test'],
      cpuFallback: true,
      artifacts: [...artifacts],
      primaryArtifactId: 'encoder',
    };
    const installed = await installOcrModelPack(storage, {
      manifest,
      artifacts: { encoder, vocab: vocabulary },
    });
    expect(Object.keys(installed.artifactPaths)).toEqual(['encoder', 'vocab']);
    expect(installed.modelPath).toBe(installed.artifactPaths['encoder']);
    const loaded = await loadOcrModelPack(storage, manifest.id);
    expect(loaded?.manifest.schemaVersion).toBe(2);
    const restored = await readAndVerifyOcrModelArtifacts(storage, loaded!);
    expect([...new Uint8Array(restored.get('encoder')!)]).toEqual([...encoder]);
    expect([...new Uint8Array(await readAndVerifyOcrModelBytes(storage, loaded!))]).toEqual([
      ...encoder,
    ]);
  });

  test('rejects missing, duplicate, and unsafe multi-artifact declarations', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const checksum = await sha256Hex(bytes);
    const base = {
      format: 'babelleaf.ocr-model' as const,
      schemaVersion: 2 as const,
      id: 'invalid-model',
      version: '1.0.0',
      runtime: 'onnx' as const,
      languages: ['ja'],
      license: 'MIT',
      checksumSha256: 'a'.repeat(64),
      sizeBytes: bytes.byteLength * 2,
      source: 'local-import' as const,
      engineCompatibility: ['local-ocr-test'],
      cpuFallback: true,
      primaryArtifactId: 'encoder',
    };
    await expect(
      installOcrModelPack(createStorage(), {
        manifest: {
          ...base,
          artifacts: [
            {
              id: 'encoder',
              fileName: 'encoder.onnx',
              sizeBytes: bytes.byteLength,
              checksumSha256: checksum,
            },
            {
              id: 'vocab',
              fileName: 'vocab.txt',
              sizeBytes: bytes.byteLength,
              checksumSha256: checksum,
            },
          ],
        },
        artifacts: { encoder: bytes },
      }),
    ).rejects.toThrow('do not match');
    const completeManifest = {
      ...base,
      checksumSha256: 'b'.repeat(64),
      artifacts: [
        {
          id: 'encoder',
          fileName: 'encoder.onnx',
          sizeBytes: bytes.byteLength,
          checksumSha256: checksum,
        },
        {
          id: 'vocab',
          fileName: 'vocab.txt',
          sizeBytes: bytes.byteLength,
          checksumSha256: checksum,
        },
      ],
    };
    await expect(
      installOcrModelPack(createStorage(), {
        manifest: completeManifest,
        artifacts: { encoder: bytes, vocab: bytes },
      }),
    ).rejects.toThrow('inventory checksum');
    const interrupted = createStorage(2);
    await expect(
      installOcrModelPack(interrupted, {
        manifest: {
          ...completeManifest,
          checksumSha256: await computeOcrModelPackChecksum(completeManifest.artifacts),
        },
        artifacts: { encoder: bytes, vocab: bytes },
      }),
    ).rejects.toThrow('simulated interrupted import');
    expect(interrupted.files.size).toBe(0);
    expect(() =>
      parseOcrModelManifest({
        ...base,
        checksumSha256: 'b'.repeat(64),
        artifacts: [
          {
            id: 'encoder',
            fileName: 'encoder.onnx',
            sizeBytes: bytes.byteLength,
            checksumSha256: checksum,
          },
          {
            id: 'encoder',
            fileName: 'vocab.txt',
            sizeBytes: bytes.byteLength,
            checksumSha256: checksum,
          },
        ],
      }),
    ).toThrow('Duplicate OCR model artifact id');
    expect(() =>
      parseOcrModelManifest({
        ...base,
        checksumSha256: 'b'.repeat(64),
        artifacts: [
          {
            id: 'encoder',
            fileName: '../encoder.onnx',
            sizeBytes: bytes.byteLength,
            checksumSha256: checksum,
          },
          {
            id: 'vocab',
            fileName: 'vocab.txt',
            sizeBytes: bytes.byteLength,
            checksumSha256: checksum,
          },
        ],
      }),
    ).toThrow('file name');
  });

  test('rejects a model when size or checksum evidence is invalid', async () => {
    const storage = createStorage();
    const bytes = new Uint8Array([1, 2, 3]);
    const manifest = await createManifest(new Uint8Array([1, 2, 4]));
    await expect(installOcrModelPack(storage, { manifest, modelBytes: bytes })).rejects.toThrow(
      'checksum',
    );
  });

  test('requires a passing release gate before exposing a runtime to the queue', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const model = await createManifest(bytes);
    const storage = createStorage();
    const modelPack = await installOcrModelPack(storage, { manifest: model, modelBytes: bytes });
    const engine: ComicWorkerEngine = {
      descriptor,
      processPage: async (inputPage) => [
        {
          id: 'region-1',
          pageId: inputPage.pageId,
          polygon: [
            { x: 10, y: 10 },
            { x: 100, y: 10 },
            { x: 100, y: 80 },
          ],
          orientation: 'horizontal',
          language: 'ja',
          text: '漫画',
          readingOrder: 0,
          engine: descriptor.engine,
          model: model.id,
        },
      ],
    };
    const evidence = {
      schemaVersion: 1 as const,
      engine: descriptor.engine,
      engineVersion: descriptor.engineVersion,
      modelId: model.id,
      modelVersion: model.version,
      languages: ['ja'],
      platforms: ['windows-x64'],
      sampleCount: 1,
      licenseVerified: true,
      checksumVerified: true,
      p95PageMs: 100,
      peakMemoryMb: 128,
      measuredAt: 100,
    };
    const gated = createGatedOcrRuntime({
      runtime: { ...engine, model },
      installedModelIds: new Set([model.id]),
      sourceLanguages: ['ja'],
      platform: 'windows-x64',
      evidence,
    });
    const result = await createOcrRuntimePageProcessor(gated)(
      page,
      {
        protocol: COMIC_WORKER_PROTOCOL,
        protocolVersion: COMIC_WORKER_PROTOCOL_VERSION,
        requestId: 'request-1',
        bookHash: 'book-1',
        pages: [page],
        sourceLangs: ['ja'],
      },
      new AbortController().signal,
    );
    expect(result.regions[0]?.text).toBe('漫画');
    let closed = 0;
    const installed = await createInstalledGatedOcrRuntime({
      factory: {
        create: async () => ({
          ...engine,
          model,
          close: () => {
            closed += 1;
          },
        }),
      },
      storage,
      modelPack,
      sourceLanguages: ['ja'],
      platform: 'windows-x64',
      evidence,
    });
    expect(installed.model.id).toBe(model.id);
    await expect(
      createInstalledGatedOcrRuntime({
        factory: {
          create: async () => ({
            ...engine,
            model,
            close: () => {
              closed += 1;
            },
          }),
        },
        storage,
        modelPack,
        sourceLanguages: ['ja'],
        platform: 'windows-x64',
      }),
    ).rejects.toThrow('benchmark evidence');
    expect(closed).toBe(1);
    expect(() =>
      createGatedOcrRuntime({
        runtime: { ...engine, model },
        installedModelIds: new Set([model.id]),
        sourceLanguages: ['ja'],
        platform: 'windows-x64',
      }),
    ).toThrow('benchmark evidence');
    expect(() =>
      createGatedOcrRuntime({
        runtime: { ...engine, model },
        installedModelIds: new Set([model.id]),
        sourceLanguages: ['ja'],
        platform: 'windows-x64',
        evidence: { ...evidence, languages: ['en'] },
      }),
    ).toThrow('cover every requested source language');
  });

  test('creates bounded benchmark evidence from local engine calls', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const model = await createManifest(bytes);
    let now = 0;
    const engine: ComicWorkerEngine = {
      descriptor,
      processPage: async () => [],
    };
    const evidence = await benchmarkOcrRuntime({
      engine,
      model,
      platform: 'windows-x64',
      samples: [
        { page, sourceLanguages: ['ja'] },
        { page: { ...page, pageId: 'page-2' }, sourceLanguages: ['ja'] },
      ],
      licenseVerified: true,
      checksumVerified: true,
      readMemoryMb: () => 128,
      now: () => {
        now += 10;
        return now;
      },
    });
    expect(evidence.sampleCount).toBe(2);
    expect(evidence.p95PageMs).toBe(10);
    expect(evidence.languages).toEqual(['ja']);
  });
});
