import { describe, expect, test } from 'vitest';
import {
  COMIC_WORKER_PROTOCOL,
  COMIC_WORKER_PROTOCOL_VERSION,
  createEmptyOcrSidecar,
  createComicOverlayBlocks,
  createComicWorkspaceFromOcrSidecar,
  createManualComicRegion,
  editComicRegion,
  evaluateOcrEngineGate,
  getEffectiveComicRegion,
  getComicRegionSourceText,
  mergeComicRegions,
  mergeOcrPageResultIntoWorkspace,
  parseComicWorkspace,
  parseOcrBenchmarkEvidence,
  reviewComicRegionTranslation,
  recordComicTranslationFailure,
  revertComicRegionTranslation,
  serializeComicWorkspace,
  setComicRegionOverlay,
  splitComicRegion,
  translateComicRegion,
  ComicWorkspaceStore,
  type ComicWorkspaceStorage,
  type ComicWorkerDescriptor,
  type OcrModelManifest,
  type TranslationProvider,
} from '@/services/translators';

const descriptor = {
  protocol: COMIC_WORKER_PROTOCOL,
  protocolVersion: COMIC_WORKER_PROTOCOL_VERSION,
  engine: 'local-ocr-test',
  engineVersion: '1.0.0',
  capabilities: ['detect', 'ocr', 'vertical-text', 'ruby', 'cpu-fallback', 'text-layer'],
  languages: ['zh', 'en', 'ja'],
  maxWorkers: 1,
  modelId: 'multilingual-test',
} satisfies ComicWorkerDescriptor;

const page = {
  pageIndex: 0,
  pageId: 'page-1',
  width: 1200,
  height: 1800,
  format: 'png' as const,
  localRef: 'Books/book-1/page-1.png',
};

const createWorkspace = () => {
  const sidecar = createEmptyOcrSidecar({
    bookHash: 'book-1',
    sourceFormat: 'CBZ',
    descriptor,
    pages: [page],
    now: 100,
  });
  sidecar.pages[0]!.status = 'completed';
  sidecar.pages[0]!.regions = [
    {
      id: 'region-1',
      pageId: page.pageId,
      polygon: [
        { x: 20, y: 20 },
        { x: 220, y: 20 },
        { x: 220, y: 120 },
      ],
      orientation: 'horizontal',
      language: 'ja',
      text: '原文',
      readingOrder: 0,
      engine: descriptor.engine,
      model: descriptor.modelId,
    },
  ];
  return createComicWorkspaceFromOcrSidecar(sidecar, 100);
};

describe('comic workspace', () => {
  test('keeps machine OCR separate from manual corrections and survives round trip', () => {
    let workspace = createWorkspace();
    workspace = editComicRegion(workspace, page.pageId, 'region-1', { text: '人工校正' }, 200);
    const region = workspace.pages[0]!.regions[0]!;
    expect(region.machine?.text).toBe('原文');
    expect(getComicRegionSourceText(region)).toBe('人工校正');
    expect(getEffectiveComicRegion(region)?.text).toBe('人工校正');

    const restored = parseComicWorkspace(JSON.parse(serializeComicWorkspace(workspace)));
    expect(restored.pages[0]!.regions[0]!.manual?.text).toBe('人工校正');
    expect(JSON.stringify(restored)).not.toContain('apiKey');
  });

  test('rerunning OCR updates machine data without overwriting approved manual text', () => {
    let workspace = editComicRegion(
      createWorkspace(),
      page.pageId,
      'region-1',
      { text: '人工校正' },
      200,
    );
    workspace = mergeOcrPageResultIntoWorkspace(
      workspace,
      {
        pageId: page.pageId,
        width: page.width,
        height: page.height,
        status: 'completed',
        regions: [
          {
            id: 'region-1',
            pageId: page.pageId,
            polygon: [
              { x: 40, y: 40 },
              { x: 240, y: 40 },
              { x: 240, y: 140 },
            ],
            orientation: 'horizontal',
            text: '重新识别',
            readingOrder: 0,
            engine: descriptor.engine,
          },
        ],
      },
      300,
    );
    const region = workspace.pages[0]!.regions[0]!;
    expect(region.machine?.text).toBe('重新识别');
    expect(getComicRegionSourceText(region)).toBe('人工校正');
    expect(region.manual?.text).toBe('人工校正');
    expect(region.machineRevision).toBe(2);
  });

  test('supports explicit translation, review, revert, and overlay blocks', async () => {
    const provider: TranslationProvider = {
      name: 'test-provider',
      label: 'Test provider',
      isConfigured: () => true,
      translate: async (texts) => texts.map((text) => `译文:${text}`),
    };
    let workspace = await translateComicRegion({
      workspace: createWorkspace(),
      pageId: page.pageId,
      regionId: 'region-1',
      provider,
      sourceLang: 'ja',
      targetLang: 'zh-CN',
      model: 'test-model',
    }).then((result) => result.workspace);
    expect(workspace.pages[0]!.regions[0]!.translation?.status).toBe('translated');
    workspace = reviewComicRegionTranslation(workspace, page.pageId, 'region-1', '人工译文', 400);
    expect(workspace.pages[0]!.regions[0]!.translation?.machineTranslatedText).toBe('译文:原文');
    workspace = setComicRegionOverlay(
      workspace,
      page.pageId,
      'region-1',
      { fontSizePx: 24, backgroundColor: '#fff' },
      500,
    );
    expect(createComicOverlayBlocks(workspace.pages[0]!)[0]?.translatedText).toBe('人工译文');
    workspace = revertComicRegionTranslation(workspace, page.pageId, 'region-1', 600);
    expect(workspace.pages[0]!.regions[0]!.translation?.translatedText).toBe('译文:原文');
    workspace = editComicRegion(workspace, page.pageId, 'region-1', { text: '修改后的原文' }, 700);
    expect(createComicOverlayBlocks(workspace.pages[0]!)).toHaveLength(0);
    expect(() =>
      reviewComicRegionTranslation(workspace, page.pageId, 'region-1', '旧译文', 800),
    ).toThrow('Comic translation source changed');
    workspace = recordComicTranslationFailure(
      {
        workspace: createWorkspace(),
        pageId: page.pageId,
        regionId: 'region-1',
        provider,
        sourceLang: 'ja',
        targetLang: 'zh-CN',
      },
      new Error('Bearer sk-secret-key'),
      900,
    );
    expect(workspace.pages[0]!.regions[0]!.translation).toMatchObject({ status: 'failed' });
    expect(JSON.stringify(workspace)).not.toContain('sk-secret-key');
  });

  test('creates, splits, merges, and bounds manual regions', () => {
    let workspace = createManualComicRegion(createWorkspace(), page.pageId, {
      id: 'manual-1',
      polygon: [
        { x: 300, y: 300 },
        { x: 500, y: 300 },
        { x: 500, y: 420 },
      ],
      text: '手工区域',
      readingOrder: 1,
    });
    workspace = splitComicRegion(workspace, page.pageId, 'manual-1', {
      newRegionId: 'manual-2',
      first: { text: '手工' },
      second: {
        text: '区域',
        polygon: [
          { x: 500, y: 300 },
          { x: 700, y: 300 },
          { x: 700, y: 420 },
        ],
      },
    });
    expect(workspace.pages[0]!.regions).toHaveLength(3);
    workspace = mergeComicRegions(workspace, page.pageId, ['manual-1', 'manual-2']);
    expect(
      workspace.pages[0]!.regions.find((region) => region.id === 'manual-2')?.manual?.deleted,
    ).toBe(true);
    expect(() =>
      editComicRegion(workspace, page.pageId, 'manual-1', {
        polygon: [
          { x: -1, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
        ],
      }),
    ).toThrow('patch.polygon');
  });

  test('requires verified local model, license, checksum, benchmark, and resource evidence', () => {
    const model = {
      format: 'babelleaf.ocr-model',
      schemaVersion: 1,
      id: 'multilingual-test',
      version: '1.0.0',
      runtime: 'onnx',
      languages: ['zh', 'en', 'ja'],
      license: 'Apache-2.0',
      checksumSha256: 'a'.repeat(64),
      sizeBytes: 1024,
      source: 'local-import',
      engineCompatibility: [descriptor.engine],
      cpuFallback: true,
    } satisfies OcrModelManifest;
    const evidence = parseOcrBenchmarkEvidence({
      schemaVersion: 1,
      engine: descriptor.engine,
      engineVersion: descriptor.engineVersion,
      modelId: model.id,
      modelVersion: model.version,
      languages: ['zh', 'en', 'ja'],
      platforms: ['windows-x64'],
      sampleCount: 100,
      licenseVerified: true,
      checksumVerified: true,
      p95PageMs: 100,
      peakMemoryMb: 512,
      measuredAt: 100,
    });
    const input = {
      descriptor,
      model,
      sourceLanguages: ['ja'],
      platform: 'windows-x64',
      evidence,
    };
    expect(evaluateOcrEngineGate({ ...input, installedModelIds: new Set() }).code).toBe(
      'missing-model',
    );
    expect(
      evaluateOcrEngineGate({ ...input, installedModelIds: new Set([model.id]) }),
    ).toMatchObject({ code: 'ready', ready: true });
    expect(
      evaluateOcrEngineGate({
        ...input,
        installedModelIds: new Set([model.id]),
        evidence: { ...evidence, peakMemoryMb: 2048 },
      }).code,
    ).toBe('resource-budget-exceeded');
  });

  test('persists and restores the workspace through the application-data store', async () => {
    const files = new Map<string, string>();
    const storage: ComicWorkspaceStorage = {
      createDir: async () => undefined,
      readFile: async (path) => {
        const value = files.get(path);
        if (!value) throw new Error('missing file');
        return value;
      },
      writeFile: async (path, _base, content) => {
        if (typeof content !== 'string') throw new Error('expected JSON text');
        files.set(path, content);
      },
    };
    const store = new ComicWorkspaceStore(storage);
    const workspace = createWorkspace();
    await store.save(workspace);
    const restored = await store.load(workspace.bookHash);
    expect(restored?.pages[0]?.regions[0]?.machine?.text).toBe('原文');
    expect(files.has('comic-workspaces/book-1.json')).toBe(true);
  });
});
