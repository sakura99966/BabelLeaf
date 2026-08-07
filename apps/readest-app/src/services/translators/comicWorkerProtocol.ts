/**
 * Versioned local comic/scanned-page worker contract.
 *
 * The reader owns this protocol and sidecar model. OCR/detection engines are
 * replaceable adapters, so a Python desktop benchmark or a future Rust/ONNX
 * worker cannot leak process assumptions into the shared UI or translation
 * queue.
 */

export const COMIC_WORKER_PROTOCOL = 'babelleaf.comic-worker';
export const COMIC_WORKER_PROTOCOL_VERSION = 1 as const;
export const MAX_COMIC_WORKER_REGIONS = 2_000;
export const MAX_COMIC_WORKER_PAGES = 10_000;
export const MAX_COMIC_WORKER_IMAGE_PIXELS = 80_000_000;

export type ComicWorkerCapability =
  | 'detect'
  | 'ocr'
  | 'inpaint'
  | 'typeset'
  | 'vertical-text'
  | 'rtl'
  | 'ruby'
  | 'cpu-fallback'
  | 'text-layer';

export interface ComicWorkerDescriptor {
  protocol: typeof COMIC_WORKER_PROTOCOL;
  protocolVersion: typeof COMIC_WORKER_PROTOCOL_VERSION;
  engine: string;
  engineVersion: string;
  capabilities: ComicWorkerCapability[];
  languages: string[];
  maxWorkers: number;
  modelId?: string;
}

export interface ComicWorkerPageInput {
  pageId: string;
  width: number;
  height: number;
  format: 'png' | 'jpeg' | 'webp' | 'avif' | 'pdf';
  /** Local reference only; raw page bytes never leave the local worker. */
  localRef: string;
}

export interface ComicWorkerJobRequest {
  protocol: typeof COMIC_WORKER_PROTOCOL;
  protocolVersion: typeof COMIC_WORKER_PROTOCOL_VERSION;
  requestId: string;
  bookHash: string;
  pages: ComicWorkerPageInput[];
  sourceLangs: string[];
  targetLang?: string;
  options?: {
    detect?: boolean;
    ocr?: boolean;
    verticalText?: boolean;
    maxPages?: number;
    maxRegionsPerPage?: number;
  };
}

export interface ComicTextRegion {
  id: string;
  pageId: string;
  polygon: Array<{ x: number; y: number }>;
  orientation: 'horizontal' | 'vertical' | 'mixed';
  language?: string;
  text?: string;
  confidence?: number;
  readingOrder: number;
  engine: string;
  model?: string;
  ruby?: Array<{
    text: string;
    baseText?: string;
    position?: 'before' | 'after' | 'above' | 'below';
  }>;
}

export interface ComicWorkerPageResult {
  pageId: string;
  width: number;
  height: number;
  regions: ComicTextRegion[];
  status: 'completed' | 'failed' | 'cancelled';
  error?: string;
}

export interface ComicWorkerResult {
  requestId: string;
  bookHash: string;
  pages: ComicWorkerPageResult[];
}

export type ComicWorkerEvent =
  | { type: 'capabilities'; descriptor: ComicWorkerDescriptor }
  | {
      type: 'progress';
      requestId: string;
      completedPages: number;
      totalPages: number;
      currentPageId?: string;
    }
  | { type: 'result'; result: ComicWorkerResult }
  | { type: 'error'; requestId: string; code: string; message: string; retryable: boolean }
  | { type: 'cancelled'; requestId: string };

export interface ComicWorkerEngineContext {
  signal: AbortSignal;
  reportProgress: (completedPages: number, totalPages: number, currentPageId?: string) => void;
}

export interface ComicWorkerEngine {
  descriptor: ComicWorkerDescriptor;
  processPage: (
    page: ComicWorkerPageInput,
    request: ComicWorkerJobRequest,
    context: ComicWorkerEngineContext,
  ) => Promise<ComicTextRegion[]>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid worker field: ${field}`);
  return value;
};

const finiteInteger = (value: unknown, field: string, minimum = 0): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
    throw new Error(`Invalid worker field: ${field}`);
  }
  return value;
};

const finiteNumber = (value: unknown, field: string, minimum = 0): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    throw new Error(`Invalid worker field: ${field}`);
  }
  return value;
};

const CAPABILITIES = new Set<ComicWorkerCapability>([
  'detect',
  'ocr',
  'inpaint',
  'typeset',
  'vertical-text',
  'rtl',
  'ruby',
  'cpu-fallback',
  'text-layer',
]);

export const parseComicWorkerDescriptor = (value: unknown): ComicWorkerDescriptor => {
  if (!isRecord(value)) throw new Error('Invalid comic worker descriptor');
  if (value['protocol'] !== COMIC_WORKER_PROTOCOL || value['protocolVersion'] !== 1) {
    throw new Error('Unsupported comic worker protocol');
  }
  if (!Array.isArray(value['capabilities']) || !Array.isArray(value['languages'])) {
    throw new Error('Invalid comic worker capabilities');
  }
  const capabilities = value['capabilities'].map((capability, index) => {
    if (typeof capability !== 'string' || !CAPABILITIES.has(capability as ComicWorkerCapability)) {
      throw new Error(`Invalid comic worker capability: ${index}`);
    }
    return capability as ComicWorkerCapability;
  });
  return {
    protocol: COMIC_WORKER_PROTOCOL,
    protocolVersion: COMIC_WORKER_PROTOCOL_VERSION,
    engine: requiredString(value['engine'], 'engine'),
    engineVersion: requiredString(value['engineVersion'], 'engineVersion'),
    capabilities,
    languages: value['languages'].map((language, index) =>
      requiredString(language, `languages[${index}]`),
    ),
    maxWorkers: Math.max(1, Math.min(4, finiteInteger(value['maxWorkers'], 'maxWorkers', 1))),
    ...(value['modelId'] === undefined
      ? {}
      : { modelId: requiredString(value['modelId'], 'modelId') }),
  };
};

export const parseComicWorkerRequest = (value: unknown): ComicWorkerJobRequest => {
  if (!isRecord(value)) throw new Error('Invalid comic worker request');
  if (value['protocol'] !== COMIC_WORKER_PROTOCOL || value['protocolVersion'] !== 1) {
    throw new Error('Unsupported comic worker protocol');
  }
  const pages = value['pages'];
  if (!Array.isArray(pages) || pages.length === 0 || pages.length > MAX_COMIC_WORKER_PAGES) {
    throw new Error('Invalid comic worker pages');
  }
  const parsedPages = pages.map((page, index) => {
    if (!isRecord(page)) throw new Error(`Invalid comic worker page: ${index}`);
    const width = finiteInteger(page['width'], `pages[${index}].width`, 1);
    const height = finiteInteger(page['height'], `pages[${index}].height`, 1);
    if (width * height > MAX_COMIC_WORKER_IMAGE_PIXELS)
      throw new Error(`Comic page exceeds pixel limit: ${index}`);
    const format = page['format'];
    if (!['png', 'jpeg', 'webp', 'avif', 'pdf'].includes(String(format))) {
      throw new Error(`Invalid comic worker page format: ${index}`);
    }
    return {
      pageId: requiredString(page['pageId'], `pages[${index}].pageId`),
      width,
      height,
      format: format as ComicWorkerPageInput['format'],
      localRef: requiredString(page['localRef'], `pages[${index}].localRef`),
    };
  });
  const sourceLangs = value['sourceLangs'];
  if (!Array.isArray(sourceLangs) || sourceLangs.length === 0 || sourceLangs.length > 16) {
    throw new Error('Invalid comic worker source languages');
  }
  return {
    protocol: COMIC_WORKER_PROTOCOL,
    protocolVersion: COMIC_WORKER_PROTOCOL_VERSION,
    requestId: requiredString(value['requestId'], 'requestId'),
    bookHash: requiredString(value['bookHash'], 'bookHash'),
    pages: parsedPages,
    sourceLangs: sourceLangs.map((language, index) =>
      requiredString(language, `sourceLangs[${index}]`),
    ),
    ...(value['targetLang'] === undefined
      ? {}
      : { targetLang: requiredString(value['targetLang'], 'targetLang') }),
    ...(isRecord(value['options'])
      ? { options: value['options'] as ComicWorkerJobRequest['options'] }
      : {}),
  };
};

const validateRegions = (
  regions: unknown[],
  page: ComicWorkerPageInput,
  descriptor: ComicWorkerDescriptor,
): ComicTextRegion[] => {
  if (regions.length > MAX_COMIC_WORKER_REGIONS)
    throw new Error(`Worker returned too many regions for page ${page.pageId}`);
  return regions.map((region, index) => {
    if (!isRecord(region)) throw new Error(`Invalid worker region: ${page.pageId}/${index}`);
    const polygon = region['polygon'];
    if (!Array.isArray(polygon) || polygon.length < 3 || polygon.length > 64)
      throw new Error(`Invalid worker polygon: ${page.pageId}/${index}`);
    const parsedPolygon = polygon.map((point, pointIndex) => {
      if (!isRecord(point))
        throw new Error(`Invalid worker point: ${page.pageId}/${index}/${pointIndex}`);
      return {
        x: finiteNumber(point['x'], 'point.x'),
        y: finiteNumber(point['y'], 'point.y'),
      };
    });
    if (parsedPolygon.some((point) => point.x > page.width || point.y > page.height)) {
      throw new Error(`Worker polygon exceeds page bounds: ${page.pageId}/${index}`);
    }
    const orientation = region['orientation'];
    if (!['horizontal', 'vertical', 'mixed'].includes(String(orientation)))
      throw new Error(`Invalid worker orientation: ${page.pageId}/${index}`);
    return {
      id: requiredString(region['id'], `regions[${index}].id`),
      pageId: page.pageId,
      polygon: parsedPolygon,
      orientation: orientation as ComicTextRegion['orientation'],
      ...(region['language'] === undefined
        ? {}
        : { language: requiredString(region['language'], 'region.language') }),
      ...(region['text'] === undefined
        ? {}
        : { text: requiredString(region['text'], 'region.text') }),
      ...(region['confidence'] === undefined
        ? {}
        : {
            confidence: Math.max(
              0,
              Math.min(1, finiteNumber(region['confidence'], 'region.confidence')),
            ),
          }),
      readingOrder: finiteInteger(region['readingOrder'], `regions[${index}].readingOrder`),
      engine: requiredString(region['engine'] || descriptor.engine, `regions[${index}].engine`),
      ...(region['model'] === undefined
        ? {}
        : { model: requiredString(region['model'], 'region.model') }),
      ...(region['ruby'] === undefined
        ? {}
        : {
            ruby: (() => {
              if (!Array.isArray(region['ruby']) || region['ruby'].length > 32) {
                throw new Error(`Invalid worker ruby: ${page.pageId}/${index}`);
              }
              return region['ruby'].map((rubyValue, rubyIndex) => {
                if (!isRecord(rubyValue)) {
                  throw new Error(`Invalid worker ruby: ${page.pageId}/${index}/${rubyIndex}`);
                }
                const position = rubyValue['position'];
                if (
                  position !== undefined &&
                  !['before', 'after', 'above', 'below'].includes(String(position))
                ) {
                  throw new Error(`Invalid worker ruby position: ${page.pageId}/${index}`);
                }
                return {
                  text: requiredString(rubyValue['text'], 'ruby.text'),
                  ...(rubyValue['baseText'] === undefined
                    ? {}
                    : { baseText: requiredString(rubyValue['baseText'], 'ruby.baseText') }),
                  ...(position === undefined
                    ? {}
                    : { position: position as 'before' | 'after' | 'above' | 'below' }),
                };
              });
            })(),
          }),
    };
  });
};

export interface ComicWorkerAdapter {
  describe(): ComicWorkerDescriptor;
  process(
    request: ComicWorkerJobRequest,
    onEvent?: (event: ComicWorkerEvent) => void,
  ): Promise<ComicWorkerResult>;
  cancel(requestId: string): void;
}

/** Validate a persisted page result before it enters an OCR sidecar or queue. */
export const parseComicWorkerPageResult = (
  value: unknown,
  descriptor: ComicWorkerDescriptor,
): ComicWorkerPageResult => {
  if (!isRecord(value)) throw new Error('Invalid comic worker page result');
  const pageId = requiredString(value['pageId'], 'pageId');
  const width = finiteInteger(value['width'], 'width', 1);
  const height = finiteInteger(value['height'], 'height', 1);
  if (width * height > MAX_COMIC_WORKER_IMAGE_PIXELS) {
    throw new Error('Comic worker result exceeds pixel limit');
  }
  const status = value['status'];
  if (!['completed', 'failed', 'cancelled'].includes(String(status))) {
    throw new Error('Invalid comic worker page result status');
  }
  const regions = value['regions'];
  if (!Array.isArray(regions)) throw new Error('Invalid comic worker page result regions');
  const parsedPage: ComicWorkerPageInput = {
    pageId,
    width,
    height,
    format: 'png',
    localRef: `result:${pageId}`,
  };
  return {
    pageId,
    width,
    height,
    regions: validateRegions(regions, parsedPage, descriptor),
    status: status as ComicWorkerPageResult['status'],
    ...(value['error'] === undefined ? {} : { error: requiredString(value['error'], 'error') }),
  };
};

/** Create an in-process adapter for tests and early platform bring-up. */
export const createComicWorkerAdapter = (engine: ComicWorkerEngine): ComicWorkerAdapter => {
  const descriptor = parseComicWorkerDescriptor(engine.descriptor);
  const controllers = new Map<string, AbortController>();
  return {
    describe: () => ({
      ...descriptor,
      capabilities: [...descriptor.capabilities],
      languages: [...descriptor.languages],
    }),
    cancel: (requestId) => controllers.get(requestId)?.abort(),
    process: async (request, onEvent = () => undefined) => {
      const parsed = parseComicWorkerRequest(request);
      const controller = new AbortController();
      controllers.set(parsed.requestId, controller);
      const pages: ComicWorkerResult['pages'] = [];
      try {
        for (const [index, page] of parsed.pages.entries()) {
          if (controller.signal.aborted) {
            onEvent({ type: 'cancelled', requestId: parsed.requestId });
            return { requestId: parsed.requestId, bookHash: parsed.bookHash, pages };
          }
          try {
            const regions = await engine.processPage(page, parsed, {
              signal: controller.signal,
              reportProgress: (completedPages, totalPages, currentPageId) =>
                onEvent({
                  type: 'progress',
                  requestId: parsed.requestId,
                  completedPages,
                  totalPages,
                  currentPageId,
                }),
            });
            pages.push({
              pageId: page.pageId,
              width: page.width,
              height: page.height,
              regions: validateRegions(regions, page, descriptor),
              status: 'completed',
            });
          } catch (error) {
            if (controller.signal.aborted) {
              onEvent({ type: 'cancelled', requestId: parsed.requestId });
              return { requestId: parsed.requestId, bookHash: parsed.bookHash, pages };
            }
            pages.push({
              pageId: page.pageId,
              width: page.width,
              height: page.height,
              regions: [],
              status: 'failed',
              error: error instanceof Error ? error.message : String(error),
            });
            const failedPage = pages[pages.length - 1];
            onEvent({
              type: 'error',
              requestId: parsed.requestId,
              code: 'page-failed',
              message: failedPage?.error || 'Worker page failed',
              retryable: true,
            });
          }
          onEvent({
            type: 'progress',
            requestId: parsed.requestId,
            completedPages: index + 1,
            totalPages: parsed.pages.length,
            currentPageId: page.pageId,
          });
        }
        const result = { requestId: parsed.requestId, bookHash: parsed.bookHash, pages };
        onEvent({ type: 'result', result });
        return result;
      } finally {
        controllers.delete(parsed.requestId);
      }
    },
  };
};

export const createMockComicOcrEngine = (
  regionsByPage: Record<string, ComicTextRegion[]> = {},
): ComicWorkerEngine => ({
  descriptor: {
    protocol: COMIC_WORKER_PROTOCOL,
    protocolVersion: COMIC_WORKER_PROTOCOL_VERSION,
    engine: 'babelleaf-mock-ocr',
    engineVersion: '0.4.0-test',
    capabilities: ['detect', 'ocr', 'vertical-text', 'ruby', 'cpu-fallback', 'text-layer'],
    languages: ['zh', 'en', 'ja'],
    maxWorkers: 1,
  },
  processPage: async (page, _request, context) => {
    if (context.signal.aborted) throw new Error('Worker cancelled');
    return (regionsByPage[page.pageId] ?? []).map((region) => ({ ...region, pageId: page.pageId }));
  },
});
