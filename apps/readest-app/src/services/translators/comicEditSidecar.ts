import type { BaseDir, FileSystem } from '@/types/system';
import { safeLoadJSON, safeSaveJSON } from '@/services/persistence';
import {
  COMIC_IMAGE_PIPELINE_VERSION,
  MAX_COMIC_MASK_OPERATIONS,
  parseComicMaskSnapshot,
  type ComicMaskSnapshot,
} from './comicImagePipeline';
import { MAX_COMIC_WORKER_IMAGE_PIXELS } from './comicWorkerProtocol';
import {
  COMIC_TYPESETTING_VERSION,
  MAX_COMIC_TYPESETTING_CHARS,
  parseComicTypesetStyle,
  type ComicTypesetLayout,
} from './comicTypesetting';
import type { OcrSourceFormat } from './ocrSidecar';

export const COMIC_EDIT_SIDECAR_FORMAT = 'babelleaf.comic-edit-sidecar' as const;
export const COMIC_EDIT_SIDECAR_SCHEMA_VERSION = 1 as const;
export const MAX_COMIC_EDIT_PAGES = 10_000;
export const MAX_COMIC_EDIT_LAYOUTS_PER_PAGE = 2_000;

export interface ComicEditPage {
  pageId: string;
  pageIndex: number;
  width: number;
  height: number;
  mask?: ComicMaskSnapshot;
  layouts: ComicTypesetLayout[];
  revision: number;
  updatedAt: number;
}

export interface ComicEditSidecar {
  format: typeof COMIC_EDIT_SIDECAR_FORMAT;
  schemaVersion: typeof COMIC_EDIT_SIDECAR_SCHEMA_VERSION;
  bookHash: string;
  sourceFingerprint?: string;
  sourceFormat: OcrSourceFormat;
  createdAt: number;
  updatedAt: number;
  revision: number;
  pages: ComicEditPage[];
}

export class ComicEditSidecarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComicEditSidecarError';
  }
}

const sourceFormats = new Set<OcrSourceFormat>(['PDF', 'CBZ', 'FBZ', 'IMAGE_FOLDER']);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim())
    throw new ComicEditSidecarError(`Invalid edit sidecar field: ${field}`);
  return value;
};
const integer = (value: unknown, field: string, minimum = 0): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    throw new ComicEditSidecarError(`Invalid edit sidecar field: ${field}`);
  }
  return value;
};
const finite = (value: unknown, field: string, minimum = 0): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    throw new ComicEditSidecarError(`Invalid edit sidecar field: ${field}`);
  }
  return value;
};

const parseLayout = (value: unknown, field: string): ComicTypesetLayout => {
  if (!isRecord(value) || value['version'] !== COMIC_TYPESETTING_VERSION) {
    throw new ComicEditSidecarError(`Unsupported typeset layout: ${field}`);
  }
  const lines = value['lines'];
  if (!Array.isArray(lines) || lines.length > 2_000) {
    throw new ComicEditSidecarError(`Invalid typeset lines: ${field}`);
  }
  const polygon = value['polygon'];
  if (!Array.isArray(polygon) || polygon.length < 3 || polygon.length > 64) {
    throw new ComicEditSidecarError(`Invalid typeset polygon: ${field}`);
  }
  const parsedLines = lines.map((line, index) => {
    if (!isRecord(line)) throw new ComicEditSidecarError(`Invalid typeset line: ${field}/${index}`);
    return {
      text: requiredString(line['text'], `${field}.lines[${index}].text`),
      x: finite(line['x'], `${field}.lines[${index}].x`),
      y: finite(line['y'], `${field}.lines[${index}].y`),
      width: finite(line['width'], `${field}.lines[${index}].width`),
      height: finite(line['height'], `${field}.lines[${index}].height`),
      fontSizePx: finite(line['fontSizePx'], `${field}.lines[${index}].fontSizePx`, 1),
    };
  });
  if (parsedLines.reduce((sum, line) => sum + line.text.length, 0) > MAX_COMIC_TYPESETTING_CHARS) {
    throw new ComicEditSidecarError(`Typeset text is too large: ${field}`);
  }
  const rawStyle = value['style'];
  if (!isRecord(rawStyle)) throw new ComicEditSidecarError(`Invalid typeset style: ${field}`);
  const direction = value['direction'];
  if (direction !== 'ltr' && direction !== 'rtl' && direction !== 'ttb') {
    throw new ComicEditSidecarError(`Invalid typeset direction: ${field}`);
  }
  const boundsValue = value['bounds'];
  if (!isRecord(boundsValue)) throw new ComicEditSidecarError(`Invalid typeset bounds: ${field}`);
  let style: ComicTypesetLayout['style'];
  try {
    style = parseComicTypesetStyle(rawStyle);
  } catch (error) {
    throw new ComicEditSidecarError(
      error instanceof Error
        ? `${error.message}: ${field}.style`
        : `Invalid typeset style: ${field}`,
    );
  }
  const sourceText = requiredString(value['sourceText'], `${field}.sourceText`);
  const translatedText = requiredString(value['translatedText'], `${field}.translatedText`);
  if (
    sourceText.length > MAX_COMIC_TYPESETTING_CHARS ||
    translatedText.length > MAX_COMIC_TYPESETTING_CHARS
  ) {
    throw new ComicEditSidecarError(`Typeset text is too large: ${field}`);
  }
  return {
    version: COMIC_TYPESETTING_VERSION,
    regionId: requiredString(value['regionId'], `${field}.regionId`),
    pageId: requiredString(value['pageId'], `${field}.pageId`),
    sourceText,
    translatedText,
    polygon: polygon.map((point, index) => {
      if (!isRecord(point))
        throw new ComicEditSidecarError(`Invalid typeset point: ${field}/${index}`);
      return {
        x: finite(point['x'], `${field}.polygon[${index}].x`),
        y: finite(point['y'], `${field}.polygon[${index}].y`),
      };
    }),
    bounds: {
      x: finite(boundsValue['x'], `${field}.bounds.x`),
      y: finite(boundsValue['y'], `${field}.bounds.y`),
      width: finite(boundsValue['width'], `${field}.bounds.width`),
      height: finite(boundsValue['height'], `${field}.bounds.height`),
    },
    style,
    lines: parsedLines,
    fontSizePx: finite(value['fontSizePx'], `${field}.fontSizePx`, 1),
    direction,
    overflow: value['overflow'] === true,
    clippedCharacters: integer(value['clippedCharacters'], `${field}.clippedCharacters`),
  };
};

const parsePage = (value: unknown, index: number): ComicEditPage => {
  if (!isRecord(value)) throw new ComicEditSidecarError(`Invalid edit sidecar page: ${index}`);
  const width = integer(value['width'], `pages[${index}].width`, 1);
  const height = integer(value['height'], `pages[${index}].height`, 1);
  if (width * height > MAX_COMIC_WORKER_IMAGE_PIXELS) {
    throw new ComicEditSidecarError(`Edit sidecar page exceeds pixel limits: ${index}`);
  }
  const layouts = value['layouts'];
  if (!Array.isArray(layouts) || layouts.length > MAX_COMIC_EDIT_LAYOUTS_PER_PAGE) {
    throw new ComicEditSidecarError(`Invalid edit sidecar layouts: ${index}`);
  }
  const mask = value['mask'] === undefined ? undefined : parseComicMaskSnapshot(value['mask']);
  if (mask && (mask.width !== width || mask.height !== height)) {
    throw new ComicEditSidecarError(`Edit sidecar mask dimensions changed: ${index}`);
  }
  if (mask && mask.operations.length > MAX_COMIC_MASK_OPERATIONS) {
    throw new ComicEditSidecarError(`Edit sidecar mask operations exceed limits: ${index}`);
  }
  return {
    pageId: requiredString(value['pageId'], `pages[${index}].pageId`),
    pageIndex: integer(value['pageIndex'], `pages[${index}].pageIndex`),
    width,
    height,
    ...(mask ? { mask } : {}),
    layouts: layouts.map((layout, layoutIndex) =>
      parseLayout(layout, `pages[${index}].layouts[${layoutIndex}]`),
    ),
    revision: integer(value['revision'], `pages[${index}].revision`, 1),
    updatedAt: integer(value['updatedAt'], `pages[${index}].updatedAt`),
  };
};

export const parseComicEditSidecar = (value: unknown): ComicEditSidecar => {
  if (
    !isRecord(value) ||
    value['format'] !== COMIC_EDIT_SIDECAR_FORMAT ||
    value['schemaVersion'] !== COMIC_EDIT_SIDECAR_SCHEMA_VERSION
  ) {
    throw new ComicEditSidecarError('Unsupported comic edit sidecar schema');
  }
  const sourceFormat = value['sourceFormat'];
  if (typeof sourceFormat !== 'string' || !sourceFormats.has(sourceFormat as OcrSourceFormat)) {
    throw new ComicEditSidecarError('Invalid edit sidecar source format');
  }
  const pages = value['pages'];
  if (!Array.isArray(pages) || pages.length > MAX_COMIC_EDIT_PAGES) {
    throw new ComicEditSidecarError('Invalid edit sidecar pages');
  }
  const parsedPages = pages.map(parsePage);
  const pageIds = new Set<string>();
  const pageIndexes = new Set<number>();
  for (const page of parsedPages) {
    if (pageIds.has(page.pageId))
      throw new ComicEditSidecarError(`Duplicate edit sidecar page: ${page.pageId}`);
    if (pageIndexes.has(page.pageIndex))
      throw new ComicEditSidecarError(`Duplicate edit sidecar page index: ${page.pageIndex}`);
    pageIds.add(page.pageId);
    pageIndexes.add(page.pageIndex);
    const layoutRegionIds = new Set<string>();
    for (const layout of page.layouts) {
      if (layout.pageId !== page.pageId)
        throw new ComicEditSidecarError('Typeset layout page identity changed');
      if (layoutRegionIds.has(layout.regionId))
        throw new ComicEditSidecarError(`Duplicate typeset layout region: ${layout.regionId}`);
      layoutRegionIds.add(layout.regionId);
    }
  }
  return {
    format: COMIC_EDIT_SIDECAR_FORMAT,
    schemaVersion: COMIC_EDIT_SIDECAR_SCHEMA_VERSION,
    bookHash: requiredString(value['bookHash'], 'bookHash'),
    ...(value['sourceFingerprint'] === undefined
      ? {}
      : { sourceFingerprint: requiredString(value['sourceFingerprint'], 'sourceFingerprint') }),
    sourceFormat: sourceFormat as OcrSourceFormat,
    createdAt: integer(value['createdAt'], 'createdAt'),
    updatedAt: integer(value['updatedAt'], 'updatedAt'),
    revision: integer(value['revision'], 'revision', 1),
    pages: parsedPages,
  };
};

export const serializeComicEditSidecar = (sidecar: ComicEditSidecar): string =>
  JSON.stringify(parseComicEditSidecar(sidecar), null, 2);

export const createEmptyComicEditSidecar = (input: {
  bookHash: string;
  sourceFingerprint?: string;
  sourceFormat: OcrSourceFormat;
  pages: Array<Pick<ComicEditPage, 'pageId' | 'pageIndex' | 'width' | 'height'>>;
  now?: number;
}): ComicEditSidecar => {
  const now = input.now ?? Date.now();
  return parseComicEditSidecar({
    format: COMIC_EDIT_SIDECAR_FORMAT,
    schemaVersion: COMIC_EDIT_SIDECAR_SCHEMA_VERSION,
    bookHash: input.bookHash,
    ...(input.sourceFingerprint ? { sourceFingerprint: input.sourceFingerprint } : {}),
    sourceFormat: input.sourceFormat,
    createdAt: now,
    updatedAt: now,
    revision: 1,
    pages: input.pages.map((page) => ({ ...page, layouts: [], revision: 1, updatedAt: now })),
  });
};

const cloneSidecar = (sidecar: ComicEditSidecar): ComicEditSidecar =>
  parseComicEditSidecar(JSON.parse(serializeComicEditSidecar(sidecar)));

export const setComicEditPageMask = (
  sidecar: ComicEditSidecar,
  pageId: string,
  mask: ComicMaskSnapshot | undefined,
  now = Date.now(),
): ComicEditSidecar => {
  const next = cloneSidecar(sidecar);
  const page = next.pages.find((candidate) => candidate.pageId === pageId);
  if (!page) throw new ComicEditSidecarError(`Edit sidecar page not found: ${pageId}`);
  if (mask && (mask.width !== page.width || mask.height !== page.height)) {
    throw new ComicEditSidecarError('Edit sidecar mask dimensions changed');
  }
  page.mask = mask ? parseComicMaskSnapshot(mask) : undefined;
  page.revision += 1;
  page.updatedAt = now;
  next.revision += 1;
  next.updatedAt = now;
  return parseComicEditSidecar(next);
};

export const setComicEditPageLayout = (
  sidecar: ComicEditSidecar,
  pageId: string,
  layout: ComicTypesetLayout,
  now = Date.now(),
): ComicEditSidecar => {
  const next = cloneSidecar(sidecar);
  const page = next.pages.find((candidate) => candidate.pageId === pageId);
  if (!page) throw new ComicEditSidecarError(`Edit sidecar page not found: ${pageId}`);
  const parsed = parseLayout(layout, `page.${pageId}.layout`);
  if (parsed.pageId !== pageId)
    throw new ComicEditSidecarError('Typeset layout page identity changed');
  page.layouts = [
    ...page.layouts.filter((candidate) => candidate.regionId !== parsed.regionId),
    parsed,
  ];
  page.revision += 1;
  page.updatedAt = now;
  next.revision += 1;
  next.updatedAt = now;
  return parseComicEditSidecar(next);
};

export const removeComicEditPageLayout = (
  sidecar: ComicEditSidecar,
  pageId: string,
  regionId: string,
  now = Date.now(),
): ComicEditSidecar => {
  const next = cloneSidecar(sidecar);
  const page = next.pages.find((candidate) => candidate.pageId === pageId);
  if (!page) throw new ComicEditSidecarError(`Edit sidecar page not found: ${pageId}`);
  page.layouts = page.layouts.filter((layout) => layout.regionId !== regionId);
  page.revision += 1;
  page.updatedAt = now;
  next.revision += 1;
  next.updatedAt = now;
  return parseComicEditSidecar(next);
};

export const getComicEditPage = (
  sidecar: ComicEditSidecar,
  pageId: string,
): ComicEditPage | null => {
  const page = sidecar.pages.find((candidate) => candidate.pageId === pageId);
  return page ? parsePage(page, sidecar.pages.indexOf(page)) : null;
};

export const getComicEditSidecarPath = (bookHash: string): string => {
  const safe = bookHash.trim().replace(/[^a-zA-Z0-9._-]+/g, '_') || 'unknown';
  return `comic-edit-sidecars/${safe}.json`;
};

export type ComicEditSidecarStorage = Pick<FileSystem, 'createDir' | 'readFile' | 'writeFile'>;

export class ComicEditSidecarStore {
  constructor(private readonly fs: ComicEditSidecarStorage) {}

  async load(bookHash: string): Promise<ComicEditSidecar | null> {
    const raw = await safeLoadJSON<unknown>(
      this.fs,
      getComicEditSidecarPath(bookHash),
      'Data' as BaseDir,
      null,
    );
    if (raw === null) return null;
    const sidecar = parseComicEditSidecar(raw);
    if (sidecar.bookHash !== bookHash)
      throw new ComicEditSidecarError('Edit sidecar book hash does not match');
    return sidecar;
  }

  async save(sidecar: ComicEditSidecar): Promise<void> {
    const normalized = parseComicEditSidecar(sidecar);
    await this.fs.createDir('comic-edit-sidecars', 'Data' as BaseDir, true);
    await safeSaveJSON(
      this.fs,
      getComicEditSidecarPath(normalized.bookHash),
      'Data' as BaseDir,
      normalized,
    );
  }
}

export const COMIC_EDIT_SIDECAR_PIPELINE_VERSION = COMIC_IMAGE_PIPELINE_VERSION;
