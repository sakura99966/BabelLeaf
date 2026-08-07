import type {
  ComicWorkerDescriptor,
  ComicWorkerPageInput,
  ComicWorkerPageResult,
  ComicTextRegion,
} from './comicWorkerProtocol';
import { parseComicWorkerDescriptor } from './comicWorkerProtocol';

/** Stable discriminator for local OCR data exchanged between BabelLeaf installs. */
export const OCR_SIDECAR_FORMAT = 'babelleaf.ocr-sidecar' as const;
export const OCR_SIDECAR_SCHEMA_VERSION = 1 as const;
export const MAX_OCR_SIDECAR_PAGES = 10_000;
export const MAX_OCR_SIDECAR_REGIONS_PER_PAGE = 2_000;
export const MAX_OCR_SIDECAR_TOTAL_TEXT_CHARS = 5_000_000;
export const MAX_OCR_SIDECAR_PAGE_PIXELS = 80_000_000;

export type OcrSourceFormat = 'PDF' | 'CBZ' | 'FBZ' | 'IMAGE_FOLDER';
export type OcrPageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type OcrRuntime = 'cpu' | 'gpu' | 'unknown';

export interface OcrPageRecord extends ComicWorkerPageInput {
  pageIndex: number;
  status: OcrPageStatus;
  regions: ComicTextRegion[];
  updatedAt: number;
  error?: string;
}

export interface OcrSidecar {
  format: typeof OCR_SIDECAR_FORMAT;
  schemaVersion: typeof OCR_SIDECAR_SCHEMA_VERSION;
  bookHash: string;
  sourceFingerprint?: string;
  sourceFormat: OcrSourceFormat;
  engine: string;
  engineVersion: string;
  modelId?: string;
  modelVersion?: string;
  runtime: OcrRuntime;
  createdAt: number;
  updatedAt: number;
  pages: OcrPageRecord[];
}

export class OcrSidecarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OcrSidecarError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new OcrSidecarError(`Invalid OCR sidecar field: ${field}`);
  }
  return value;
};

const finiteInteger = (value: unknown, field: string, minimum = 0): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
    throw new OcrSidecarError(`Invalid OCR sidecar field: ${field}`);
  }
  return value;
};

const finiteNumber = (value: unknown, field: string, minimum = 0): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    throw new OcrSidecarError(`Invalid OCR sidecar field: ${field}`);
  }
  return value;
};

const pageFormats = new Set<ComicWorkerPageInput['format']>(['png', 'jpeg', 'webp', 'avif', 'pdf']);
const sourceFormats = new Set<OcrSourceFormat>(['PDF', 'CBZ', 'FBZ', 'IMAGE_FOLDER']);
const pageStatuses = new Set<OcrPageStatus>([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);
const runtimes = new Set<OcrRuntime>(['cpu', 'gpu', 'unknown']);

const parseRuby = (value: unknown, field: string) => {
  if (!Array.isArray(value) || value.length > 32) {
    throw new OcrSidecarError(`Invalid OCR sidecar field: ${field}`);
  }
  return value.map((rubyValue, index) => {
    if (!isRecord(rubyValue)) throw new OcrSidecarError(`Invalid OCR sidecar field: ${field}`);
    const position = rubyValue['position'];
    if (
      position !== undefined &&
      !['before', 'after', 'above', 'below'].includes(String(position))
    ) {
      throw new OcrSidecarError(`Invalid OCR sidecar field: ${field}[${index}].position`);
    }
    return {
      text: requiredString(rubyValue['text'], `${field}[${index}].text`),
      ...(rubyValue['baseText'] === undefined
        ? {}
        : { baseText: requiredString(rubyValue['baseText'], `${field}[${index}].baseText`) }),
      ...(position === undefined
        ? {}
        : { position: position as 'before' | 'after' | 'above' | 'below' }),
    };
  });
};

const parseRegion = (
  value: unknown,
  page: ComicWorkerPageInput,
  index: number,
): ComicTextRegion => {
  if (!isRecord(value)) throw new OcrSidecarError(`Invalid OCR region: ${page.pageId}/${index}`);
  const polygon = value['polygon'];
  if (!Array.isArray(polygon) || polygon.length < 3 || polygon.length > 64) {
    throw new OcrSidecarError(`Invalid OCR polygon: ${page.pageId}/${index}`);
  }
  const parsedPolygon = polygon.map((point, pointIndex) => {
    if (!isRecord(point)) {
      throw new OcrSidecarError(`Invalid OCR point: ${page.pageId}/${index}/${pointIndex}`);
    }
    return {
      x: finiteNumber(point['x'], `regions[${index}].polygon[${pointIndex}].x`),
      y: finiteNumber(point['y'], `regions[${index}].polygon[${pointIndex}].y`),
    };
  });
  if (parsedPolygon.some((point) => point.x > page.width || point.y > page.height)) {
    throw new OcrSidecarError(`OCR polygon exceeds page bounds: ${page.pageId}/${index}`);
  }
  const orientation = value['orientation'];
  if (!['horizontal', 'vertical', 'mixed'].includes(String(orientation))) {
    throw new OcrSidecarError(`Invalid OCR orientation: ${page.pageId}/${index}`);
  }
  const confidence = value['confidence'];
  if (
    confidence !== undefined &&
    (typeof confidence !== 'number' || !Number.isFinite(confidence))
  ) {
    throw new OcrSidecarError(`Invalid OCR confidence: ${page.pageId}/${index}`);
  }
  const text = value['text'];
  if (text !== undefined && (typeof text !== 'string' || text.length > 500_000)) {
    throw new OcrSidecarError(`Invalid OCR text: ${page.pageId}/${index}`);
  }
  return {
    id: requiredString(value['id'], `regions[${index}].id`),
    pageId: page.pageId,
    polygon: parsedPolygon,
    orientation: orientation as ComicTextRegion['orientation'],
    ...(value['language'] === undefined
      ? {}
      : { language: requiredString(value['language'], `regions[${index}].language`) }),
    ...(text === undefined ? {} : { text }),
    ...(confidence === undefined ? {} : { confidence: Math.max(0, Math.min(1, confidence)) }),
    readingOrder: finiteInteger(value['readingOrder'], `regions[${index}].readingOrder`),
    engine: requiredString(value['engine'], `regions[${index}].engine`),
    ...(value['model'] === undefined
      ? {}
      : { model: requiredString(value['model'], `regions[${index}].model`) }),
    ...(value['ruby'] === undefined
      ? {}
      : { ruby: parseRuby(value['ruby'], `regions[${index}].ruby`) }),
  };
};

const parsePage = (value: unknown, index: number): OcrPageRecord => {
  if (!isRecord(value)) throw new OcrSidecarError(`Invalid OCR page: ${index}`);
  const width = finiteInteger(value['width'], `pages[${index}].width`, 1);
  const height = finiteInteger(value['height'], `pages[${index}].height`, 1);
  if (width * height > MAX_OCR_SIDECAR_PAGE_PIXELS) {
    throw new OcrSidecarError(`OCR page exceeds pixel limit: ${index}`);
  }
  const format = value['format'];
  if (typeof format !== 'string' || !pageFormats.has(format as ComicWorkerPageInput['format'])) {
    throw new OcrSidecarError(`Invalid OCR page format: ${index}`);
  }
  const page: ComicWorkerPageInput = {
    pageId: requiredString(value['pageId'], `pages[${index}].pageId`),
    width,
    height,
    format: format as ComicWorkerPageInput['format'],
    localRef: requiredString(value['localRef'], `pages[${index}].localRef`),
  };
  const status = value['status'];
  if (typeof status !== 'string' || !pageStatuses.has(status as OcrPageStatus)) {
    throw new OcrSidecarError(`Invalid OCR page status: ${index}`);
  }
  const rawRegions = value['regions'];
  if (!Array.isArray(rawRegions) || rawRegions.length > MAX_OCR_SIDECAR_REGIONS_PER_PAGE) {
    throw new OcrSidecarError(`Invalid OCR page regions: ${index}`);
  }
  const regions = rawRegions.map((region, regionIndex) => parseRegion(region, page, regionIndex));
  return {
    ...page,
    pageIndex: finiteInteger(value['pageIndex'], `pages[${index}].pageIndex`),
    status: status as OcrPageStatus,
    regions,
    updatedAt: finiteInteger(value['updatedAt'], `pages[${index}].updatedAt`),
    ...(value['error'] === undefined
      ? {}
      : {
          error: (() => {
            const error = requiredString(value['error'], `pages[${index}].error`);
            if (error.length > 100_000) throw new OcrSidecarError('OCR page error is too large');
            return error;
          })(),
        }),
  };
};

export const parseOcrSidecar = (value: unknown): OcrSidecar => {
  if (
    !isRecord(value) ||
    value['format'] !== OCR_SIDECAR_FORMAT ||
    value['schemaVersion'] !== OCR_SIDECAR_SCHEMA_VERSION
  ) {
    throw new OcrSidecarError('Unsupported OCR sidecar schema');
  }
  const sourceFormat = value['sourceFormat'];
  if (typeof sourceFormat !== 'string' || !sourceFormats.has(sourceFormat as OcrSourceFormat)) {
    throw new OcrSidecarError('Invalid OCR sidecar source format');
  }
  const runtime = value['runtime'];
  if (typeof runtime !== 'string' || !runtimes.has(runtime as OcrRuntime)) {
    throw new OcrSidecarError('Invalid OCR sidecar runtime');
  }
  const rawPages = value['pages'];
  if (!Array.isArray(rawPages) || rawPages.length > MAX_OCR_SIDECAR_PAGES) {
    throw new OcrSidecarError('Invalid OCR sidecar pages');
  }
  const pages = rawPages.map(parsePage);
  const ids = new Set<string>();
  const indexes = new Set<number>();
  let totalTextChars = 0;
  for (const page of pages) {
    if (ids.has(page.pageId)) throw new OcrSidecarError(`Duplicate OCR page: ${page.pageId}`);
    if (indexes.has(page.pageIndex)) {
      throw new OcrSidecarError(`Duplicate OCR page index: ${page.pageIndex}`);
    }
    ids.add(page.pageId);
    indexes.add(page.pageIndex);
    for (const region of page.regions) {
      totalTextChars += region.text?.length ?? 0;
      totalTextChars += region.ruby?.reduce((sum, ruby) => sum + ruby.text.length, 0) ?? 0;
      if (totalTextChars > MAX_OCR_SIDECAR_TOTAL_TEXT_CHARS) {
        throw new OcrSidecarError('OCR sidecar text exceeds resource limits');
      }
    }
  }
  return {
    format: OCR_SIDECAR_FORMAT,
    schemaVersion: OCR_SIDECAR_SCHEMA_VERSION,
    bookHash: requiredString(value['bookHash'], 'bookHash'),
    ...(value['sourceFingerprint'] === undefined
      ? {}
      : { sourceFingerprint: requiredString(value['sourceFingerprint'], 'sourceFingerprint') }),
    sourceFormat: sourceFormat as OcrSourceFormat,
    engine: requiredString(value['engine'], 'engine'),
    engineVersion: requiredString(value['engineVersion'], 'engineVersion'),
    ...(value['modelId'] === undefined
      ? {}
      : { modelId: requiredString(value['modelId'], 'modelId') }),
    ...(value['modelVersion'] === undefined
      ? {}
      : { modelVersion: requiredString(value['modelVersion'], 'modelVersion') }),
    runtime: runtime as OcrRuntime,
    createdAt: finiteInteger(value['createdAt'], 'createdAt'),
    updatedAt: finiteInteger(value['updatedAt'], 'updatedAt'),
    pages,
  };
};

export const createEmptyOcrSidecar = (input: {
  bookHash: string;
  sourceFingerprint?: string;
  sourceFormat: OcrSourceFormat;
  descriptor: ComicWorkerDescriptor;
  runtime?: OcrRuntime;
  modelVersion?: string;
  pages: Array<ComicWorkerPageInput & { pageIndex: number }>;
  now?: number;
}): OcrSidecar => {
  const descriptor = parseComicWorkerDescriptor(input.descriptor);
  if (!descriptor.capabilities.includes('ocr')) {
    throw new OcrSidecarError('The selected worker does not provide OCR capability');
  }
  if (input.pages.length === 0 || input.pages.length > MAX_OCR_SIDECAR_PAGES) {
    throw new OcrSidecarError('OCR page count exceeds resource limits');
  }
  const now = input.now ?? Date.now();
  const sidecar: OcrSidecar = {
    format: OCR_SIDECAR_FORMAT,
    schemaVersion: OCR_SIDECAR_SCHEMA_VERSION,
    bookHash: requiredString(input.bookHash, 'bookHash'),
    ...(input.sourceFingerprint ? { sourceFingerprint: input.sourceFingerprint } : {}),
    sourceFormat: input.sourceFormat,
    engine: descriptor.engine,
    engineVersion: descriptor.engineVersion,
    ...(descriptor.modelId ? { modelId: descriptor.modelId } : {}),
    ...(input.modelVersion ? { modelVersion: input.modelVersion } : {}),
    runtime: input.runtime ?? 'unknown',
    createdAt: now,
    updatedAt: now,
    pages: input.pages.map((page) => ({
      ...page,
      status: 'pending',
      regions: [],
      updatedAt: now,
    })),
  };
  return parseOcrSidecar(sidecar);
};

export const upsertOcrPage = (
  sidecar: OcrSidecar,
  page: OcrPageRecord,
  now = Date.now(),
): OcrSidecar => {
  const normalized = parseOcrSidecar(sidecar);
  const parsedPage = parsePage(page, page.pageIndex);
  const index = normalized.pages.findIndex((candidate) => candidate.pageId === parsedPage.pageId);
  if (index < 0) throw new OcrSidecarError(`Unknown OCR page: ${parsedPage.pageId}`);
  const existing = normalized.pages[index]!;
  if (
    existing.width !== parsedPage.width ||
    existing.height !== parsedPage.height ||
    existing.localRef !== parsedPage.localRef
  ) {
    throw new OcrSidecarError(`OCR source page changed: ${parsedPage.pageId}`);
  }
  normalized.pages[index] = { ...parsedPage, pageIndex: existing.pageIndex, updatedAt: now };
  normalized.updatedAt = now;
  return parseOcrSidecar(normalized);
};

export const mergeOcrWorkerResult = (
  sidecar: OcrSidecar,
  result: { bookHash: string; pages: ComicWorkerPageResult[] },
  now = Date.now(),
): OcrSidecar => {
  const normalized = parseOcrSidecar(sidecar);
  if (result.bookHash !== normalized.bookHash)
    throw new OcrSidecarError('OCR book identity changed');
  let next = normalized;
  for (const pageResult of result.pages) {
    const existing = normalized.pages.find((page) => page.pageId === pageResult.pageId);
    if (!existing) throw new OcrSidecarError(`Unknown OCR result page: ${pageResult.pageId}`);
    next = upsertOcrPage(
      next,
      {
        ...existing,
        status: pageResult.status === 'completed' ? 'completed' : pageResult.status,
        regions: pageResult.regions,
        ...(pageResult.error ? { error: pageResult.error } : {}),
        updatedAt: now,
      },
      now,
    );
  }
  return next;
};

export const serializeOcrSidecar = (sidecar: OcrSidecar): string =>
  JSON.stringify(parseOcrSidecar(sidecar), null, 2);
