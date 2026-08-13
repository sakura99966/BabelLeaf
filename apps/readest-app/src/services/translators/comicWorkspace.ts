import type {
  ComicTextRegion,
  ComicWorkerDescriptor,
  ComicWorkerPageInput,
  ComicWorkerPageResult,
} from './comicWorkerProtocol';
import {
  COMIC_WORKER_PROTOCOL,
  COMIC_WORKER_PROTOCOL_VERSION,
  MAX_COMIC_WORKER_IMAGE_PIXELS,
  MAX_COMIC_WORKER_PAGES,
  MAX_COMIC_WORKER_REGIONS,
  parseComicWorkerPageResult,
} from './comicWorkerProtocol';
import type { OcrPageRecord, OcrSidecar, OcrSourceFormat } from './ocrSidecar';
import { parseOcrSidecar } from './ocrSidecar';

/** Versioned editable comic region and translation overlay sidecar. */
export const COMIC_WORKSPACE_FORMAT = 'babelleaf.comic-workspace' as const;
export const COMIC_WORKSPACE_SCHEMA_VERSION = 1 as const;
export const MAX_COMIC_WORKSPACE_TEXT_CHARS = 500_000;
export const MAX_COMIC_WORKSPACE_STYLE_STRING = 128;

export type ComicRegionSource = 'ocr' | 'manual';
export type ComicRegionReviewStatus = 'unreviewed' | 'corrected' | 'approved';
export type ComicRegionTranslationStatus = 'pending' | 'translated' | 'reviewed' | 'failed';
export type ComicRegionOrientation = ComicTextRegion['orientation'];
export type ComicRuby = NonNullable<ComicTextRegion['ruby']>[number];
export type ComicPoint = { x: number; y: number };

export interface ComicRegionManualRevision {
  revision: number;
  updatedAt: number;
  deleted?: boolean;
  polygon?: ComicPoint[];
  orientation?: ComicRegionOrientation;
  language?: string;
  text?: string;
  readingOrder?: number;
  ruby?: ComicRuby[];
  rotationDeg?: number;
}

export interface ComicRegionTranslation {
  sourceText: string;
  sourceRevision: number;
  targetLang: string;
  status: ComicRegionTranslationStatus;
  provider: string;
  model?: string;
  promptVersion: string;
  translatedText?: string;
  machineTranslatedText?: string;
  glossaryVersion?: number;
  error?: string;
  stale?: boolean;
  updatedAt: number;
}

export interface ComicOverlayStyle {
  fontFamily?: string;
  fontSizePx?: number;
  color?: string;
  outlineColor?: string;
  outlineWidthPx?: number;
  backgroundColor?: string;
  textAlign?: 'start' | 'center' | 'end';
  writingMode?: 'horizontal-tb' | 'vertical-rl';
  fit?: 'shrink' | 'clip' | 'overflow';
  rotationDeg?: number;
  lineHeight?: number;
  paddingPx?: number;
}

export interface ComicRegionOverlay {
  style?: ComicOverlayStyle;
  updatedAt: number;
}

export interface ComicWorkspaceRegion {
  id: string;
  pageId: string;
  source: ComicRegionSource;
  machine?: ComicTextRegion;
  machineRevision: number;
  machineStale?: boolean;
  manual?: ComicRegionManualRevision;
  translation?: ComicRegionTranslation;
  overlay?: ComicRegionOverlay;
  reviewStatus: ComicRegionReviewStatus;
  createdAt: number;
  updatedAt: number;
}

export interface ComicWorkspacePage extends ComicWorkerPageInput {
  pageIndex: number;
  regions: ComicWorkspaceRegion[];
  updatedAt: number;
}

export interface ComicWorkspace {
  format: typeof COMIC_WORKSPACE_FORMAT;
  schemaVersion: typeof COMIC_WORKSPACE_SCHEMA_VERSION;
  bookHash: string;
  sourceFingerprint?: string;
  sourceFormat: OcrSourceFormat;
  createdAt: number;
  updatedAt: number;
  revision: number;
  pages: ComicWorkspacePage[];
}

export interface ComicRegionPatch {
  deleted?: boolean;
  polygon?: ComicPoint[];
  orientation?: ComicRegionOrientation;
  language?: string;
  text?: string;
  readingOrder?: number;
  ruby?: ComicRuby[];
  rotationDeg?: number;
  /** Optional exported-overlay style correction kept in the workspace sidecar. */
  overlayStyle?: ComicOverlayStyle;
}

export interface EffectiveComicRegion extends ComicTextRegion {
  source: ComicRegionSource;
  reviewStatus: ComicRegionReviewStatus;
  machineRevision: number;
  machineStale: boolean;
  rotationDeg: number;
  translation?: ComicRegionTranslation;
  overlay?: ComicRegionOverlay;
}

export class ComicWorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComicWorkspaceError';
  }
}

const WORKSPACE_VALIDATION_DESCRIPTOR: ComicWorkerDescriptor = {
  protocol: COMIC_WORKER_PROTOCOL,
  protocolVersion: COMIC_WORKER_PROTOCOL_VERSION,
  engine: 'workspace-validation',
  engineVersion: '1',
  capabilities: ['ocr', 'text-layer', 'ruby', 'vertical-text'],
  languages: ['und'],
  maxWorkers: 1,
};

const SOURCE_FORMATS = new Set<OcrSourceFormat>(['PDF', 'CBZ', 'FBZ', 'IMAGE_FOLDER']);
const ORIENTATIONS = new Set<ComicRegionOrientation>(['horizontal', 'vertical', 'mixed']);
const TRANSLATION_STATUSES = new Set<ComicRegionTranslationStatus>([
  'pending',
  'translated',
  'reviewed',
  'failed',
]);
const REVIEW_STATUSES = new Set<ComicRegionReviewStatus>(['unreviewed', 'corrected', 'approved']);
const TEXT_ALIGNMENTS = new Set<NonNullable<ComicOverlayStyle['textAlign']>>([
  'start',
  'center',
  'end',
]);
const WRITING_MODES = new Set<NonNullable<ComicOverlayStyle['writingMode']>>([
  'horizontal-tb',
  'vertical-rl',
]);
const FIT_MODES = new Set<NonNullable<ComicOverlayStyle['fit']>>(['shrink', 'clip', 'overflow']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ComicWorkspaceError(`Invalid comic workspace field: ${field}`);
  }
  return value;
};

const optionalString = (value: unknown, field: string, max = MAX_COMIC_WORKSPACE_TEXT_CHARS) => {
  if (value === undefined) return undefined;
  const result = requiredString(value, field);
  if (result.length > max)
    throw new ComicWorkspaceError(`Comic workspace text is too large: ${field}`);
  return result;
};

const finiteInteger = (value: unknown, field: string, minimum = 0): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
    throw new ComicWorkspaceError(`Invalid comic workspace field: ${field}`);
  }
  return value;
};

const boundedNumber = (value: unknown, field: string, min: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new ComicWorkspaceError(`Invalid comic workspace field: ${field}`);
  }
  return value;
};

const parseRuby = (value: unknown, field: string): ComicRuby[] => {
  if (!Array.isArray(value) || value.length > 32) {
    throw new ComicWorkspaceError(`Invalid comic workspace field: ${field}`);
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) throw new ComicWorkspaceError(`Invalid comic workspace ruby: ${field}`);
    const position = entry['position'];
    if (
      position !== undefined &&
      !['before', 'after', 'above', 'below'].includes(String(position))
    ) {
      throw new ComicWorkspaceError(`Invalid comic workspace ruby position: ${field}`);
    }
    return {
      text: requiredString(entry['text'], `${field}[${index}].text`),
      ...(entry['baseText'] === undefined
        ? {}
        : { baseText: requiredString(entry['baseText'], `${field}[${index}].baseText`) }),
      ...(position === undefined ? {} : { position: position as ComicRuby['position'] }),
    };
  });
};

const parsePolygon = (
  value: unknown,
  field: string,
  width: number,
  height: number,
): ComicPoint[] => {
  if (!Array.isArray(value) || value.length < 3 || value.length > 64) {
    throw new ComicWorkspaceError(`Invalid comic workspace polygon: ${field}`);
  }
  return value.map((point, index) => {
    if (!isRecord(point)) throw new ComicWorkspaceError(`Invalid comic workspace point: ${field}`);
    const x = boundedNumber(point['x'], `${field}[${index}].x`, 0, width);
    const y = boundedNumber(point['y'], `${field}[${index}].y`, 0, height);
    return { x, y };
  });
};

const parseManualRevision = (
  value: unknown,
  field: string,
  page: Pick<ComicWorkspacePage, 'width' | 'height'>,
): ComicRegionManualRevision => {
  if (!isRecord(value))
    throw new ComicWorkspaceError(`Invalid comic workspace manual revision: ${field}`);
  const orientation = value['orientation'];
  if (orientation !== undefined && !ORIENTATIONS.has(orientation as ComicRegionOrientation)) {
    throw new ComicWorkspaceError(`Invalid comic workspace orientation: ${field}`);
  }
  const text = optionalString(value['text'], `${field}.text`);
  if (text !== undefined && !text.trim())
    throw new ComicWorkspaceError(`Empty comic region text: ${field}`);
  const rotationDeg = value['rotationDeg'];
  return {
    revision: finiteInteger(value['revision'], `${field}.revision`, 1),
    updatedAt: finiteInteger(value['updatedAt'], `${field}.updatedAt`),
    ...(value['deleted'] === undefined ? {} : { deleted: value['deleted'] === true }),
    ...(value['polygon'] === undefined
      ? {}
      : { polygon: parsePolygon(value['polygon'], `${field}.polygon`, page.width, page.height) }),
    ...(orientation === undefined ? {} : { orientation: orientation as ComicRegionOrientation }),
    ...(value['language'] === undefined
      ? {}
      : { language: requiredString(value['language'], `${field}.language`) }),
    ...(text === undefined ? {} : { text }),
    ...(value['readingOrder'] === undefined
      ? {}
      : { readingOrder: finiteInteger(value['readingOrder'], `${field}.readingOrder`) }),
    ...(value['ruby'] === undefined ? {} : { ruby: parseRuby(value['ruby'], `${field}.ruby`) }),
    ...(rotationDeg === undefined
      ? {}
      : { rotationDeg: boundedNumber(rotationDeg, `${field}.rotationDeg`, -360, 360) }),
  };
};

const parseOverlayStyle = (value: unknown, field: string): ComicOverlayStyle => {
  if (!isRecord(value)) throw new ComicWorkspaceError(`Invalid comic overlay style: ${field}`);
  const textAlign = value['textAlign'];
  const writingMode = value['writingMode'];
  const fit = value['fit'];
  if (
    textAlign !== undefined &&
    !TEXT_ALIGNMENTS.has(textAlign as NonNullable<ComicOverlayStyle['textAlign']>)
  ) {
    throw new ComicWorkspaceError(`Invalid comic overlay alignment: ${field}`);
  }
  if (
    writingMode !== undefined &&
    !WRITING_MODES.has(writingMode as NonNullable<ComicOverlayStyle['writingMode']>)
  ) {
    throw new ComicWorkspaceError(`Invalid comic overlay writing mode: ${field}`);
  }
  if (fit !== undefined && !FIT_MODES.has(fit as NonNullable<ComicOverlayStyle['fit']>)) {
    throw new ComicWorkspaceError(`Invalid comic overlay fit mode: ${field}`);
  }
  const stringField = (
    name: keyof Pick<
      ComicOverlayStyle,
      'fontFamily' | 'color' | 'outlineColor' | 'backgroundColor'
    >,
  ) => {
    const candidate = value[name];
    if (candidate === undefined) return undefined;
    const text = requiredString(candidate, `${field}.${name}`);
    if (text.length > MAX_COMIC_WORKSPACE_STYLE_STRING) {
      throw new ComicWorkspaceError(`Comic overlay style is too large: ${field}.${name}`);
    }
    return text;
  };
  return {
    ...(stringField('fontFamily') === undefined ? {} : { fontFamily: stringField('fontFamily') }),
    ...(value['fontSizePx'] === undefined
      ? {}
      : { fontSizePx: boundedNumber(value['fontSizePx'], `${field}.fontSizePx`, 4, 256) }),
    ...(stringField('color') === undefined ? {} : { color: stringField('color') }),
    ...(stringField('outlineColor') === undefined
      ? {}
      : { outlineColor: stringField('outlineColor') }),
    ...(value['outlineWidthPx'] === undefined
      ? {}
      : {
          outlineWidthPx: boundedNumber(value['outlineWidthPx'], `${field}.outlineWidthPx`, 0, 32),
        }),
    ...(stringField('backgroundColor') === undefined
      ? {}
      : { backgroundColor: stringField('backgroundColor') }),
    ...(textAlign === undefined ? {} : { textAlign: textAlign as ComicOverlayStyle['textAlign'] }),
    ...(writingMode === undefined
      ? {}
      : { writingMode: writingMode as ComicOverlayStyle['writingMode'] }),
    ...(fit === undefined ? {} : { fit: fit as ComicOverlayStyle['fit'] }),
    ...(value['rotationDeg'] === undefined
      ? {}
      : { rotationDeg: boundedNumber(value['rotationDeg'], `${field}.rotationDeg`, -360, 360) }),
    ...(value['lineHeight'] === undefined
      ? {}
      : { lineHeight: boundedNumber(value['lineHeight'], `${field}.lineHeight`, 0.5, 4) }),
    ...(value['paddingPx'] === undefined
      ? {}
      : { paddingPx: boundedNumber(value['paddingPx'], `${field}.paddingPx`, 0, 128) }),
  };
};

const parseTranslation = (value: unknown, field: string): ComicRegionTranslation => {
  if (!isRecord(value)) throw new ComicWorkspaceError(`Invalid comic region translation: ${field}`);
  const status = value['status'];
  if (
    typeof status !== 'string' ||
    !TRANSLATION_STATUSES.has(status as ComicRegionTranslationStatus)
  ) {
    throw new ComicWorkspaceError(`Invalid comic region translation status: ${field}`);
  }
  const parseOptionalText = (name: string) => optionalString(value[name], `${field}.${name}`);
  const glossaryVersion = value['glossaryVersion'];
  return {
    sourceText: requiredString(value['sourceText'], `${field}.sourceText`),
    sourceRevision: finiteInteger(value['sourceRevision'], `${field}.sourceRevision`, 1),
    targetLang: requiredString(value['targetLang'], `${field}.targetLang`),
    status: status as ComicRegionTranslationStatus,
    provider: requiredString(value['provider'], `${field}.provider`),
    ...(value['model'] === undefined
      ? {}
      : { model: requiredString(value['model'], `${field}.model`) }),
    promptVersion: requiredString(value['promptVersion'], `${field}.promptVersion`),
    ...(parseOptionalText('translatedText') === undefined
      ? {}
      : { translatedText: parseOptionalText('translatedText') }),
    ...(parseOptionalText('machineTranslatedText') === undefined
      ? {}
      : { machineTranslatedText: parseOptionalText('machineTranslatedText') }),
    ...(glossaryVersion === undefined
      ? {}
      : { glossaryVersion: finiteInteger(glossaryVersion, `${field}.glossaryVersion`) }),
    ...(value['error'] === undefined
      ? {}
      : { error: optionalString(value['error'], `${field}.error`, 100_000) }),
    ...(value['stale'] === undefined ? {} : { stale: value['stale'] === true }),
    updatedAt: finiteInteger(value['updatedAt'], `${field}.updatedAt`),
  };
};

const parseRegion = (
  value: unknown,
  field: string,
  page: ComicWorkspacePage,
): ComicWorkspaceRegion => {
  if (!isRecord(value)) throw new ComicWorkspaceError(`Invalid comic workspace region: ${field}`);
  const source = value['source'];
  if (source !== 'ocr' && source !== 'manual') {
    throw new ComicWorkspaceError(`Invalid comic workspace region source: ${field}`);
  }
  const machineValue = value['machine'];
  let machine: ComicTextRegion | undefined;
  if (machineValue !== undefined) {
    const result = parseComicWorkerPageResult(
      {
        pageId: page.pageId,
        width: page.width,
        height: page.height,
        regions: [machineValue],
        status: 'completed',
      },
      WORKSPACE_VALIDATION_DESCRIPTOR,
    );
    machine = result.regions[0];
  }
  if (source === 'ocr' && !machine)
    throw new ComicWorkspaceError(`OCR region has no machine result: ${field}`);
  const manual =
    value['manual'] === undefined
      ? undefined
      : parseManualRevision(value['manual'], `${field}.manual`, page);
  if (source === 'manual' && !manual) {
    throw new ComicWorkspaceError(`Manual comic region has no revision: ${field}`);
  }
  if (source === 'manual' && manual && !manual.deleted && (!manual.polygon || !manual.text)) {
    throw new ComicWorkspaceError(`Manual comic region is incomplete: ${field}`);
  }
  const overlayValue = value['overlay'];
  const overlay =
    overlayValue === undefined
      ? undefined
      : (() => {
          if (!isRecord(overlayValue))
            throw new ComicWorkspaceError(`Invalid comic region overlay: ${field}`);
          return {
            ...(overlayValue['style'] === undefined
              ? {}
              : { style: parseOverlayStyle(overlayValue['style'], `${field}.overlay.style`) }),
            updatedAt: finiteInteger(overlayValue['updatedAt'], `${field}.overlay.updatedAt`),
          } satisfies ComicRegionOverlay;
        })();
  const id = requiredString(value['id'], `${field}.id`);
  if (machine && machine.id !== id)
    throw new ComicWorkspaceError(`Comic region identity changed: ${field}`);
  if (machine && machine.pageId !== page.pageId)
    throw new ComicWorkspaceError(`Comic region page changed: ${field}`);
  const machineRevision = finiteInteger(
    value['machineRevision'],
    `${field}.machineRevision`,
    source === 'ocr' ? 1 : 0,
  );
  return {
    id,
    pageId: page.pageId,
    source: source as ComicRegionSource,
    ...(machine ? { machine } : {}),
    machineRevision,
    ...(value['machineStale'] === undefined
      ? {}
      : { machineStale: value['machineStale'] === true }),
    ...(manual ? { manual } : {}),
    ...(value['translation'] === undefined
      ? {}
      : { translation: parseTranslation(value['translation'], `${field}.translation`) }),
    ...(overlay ? { overlay } : {}),
    reviewStatus: (() => {
      const reviewStatus = value['reviewStatus'];
      if (
        typeof reviewStatus !== 'string' ||
        !REVIEW_STATUSES.has(reviewStatus as ComicRegionReviewStatus)
      ) {
        throw new ComicWorkspaceError(`Invalid comic workspace review status: ${field}`);
      }
      return reviewStatus as ComicRegionReviewStatus;
    })(),
    createdAt: finiteInteger(value['createdAt'], `${field}.createdAt`),
    updatedAt: finiteInteger(value['updatedAt'], `${field}.updatedAt`),
  };
};

const parsePage = (value: unknown, index: number): ComicWorkspacePage => {
  if (!isRecord(value)) throw new ComicWorkspaceError(`Invalid comic workspace page: ${index}`);
  const width = finiteInteger(value['width'], `pages[${index}].width`, 1);
  const height = finiteInteger(value['height'], `pages[${index}].height`, 1);
  if (width * height > MAX_COMIC_WORKER_IMAGE_PIXELS) {
    throw new ComicWorkspaceError(`Comic workspace page exceeds pixel limits: ${index}`);
  }
  const format = value['format'];
  if (!['png', 'jpeg', 'webp', 'avif', 'pdf'].includes(String(format))) {
    throw new ComicWorkspaceError(`Invalid comic workspace page format: ${index}`);
  }
  const localRef = requiredString(value['localRef'], `pages[${index}].localRef`);
  if (/^(?:https?:|data:|file:)/i.test(localRef)) {
    throw new ComicWorkspaceError(`Comic workspace page reference must be local: ${index}`);
  }
  const page: ComicWorkspacePage = {
    pageId: requiredString(value['pageId'], `pages[${index}].pageId`),
    width,
    height,
    format: format as ComicWorkerPageInput['format'],
    localRef,
    pageIndex: finiteInteger(value['pageIndex'], `pages[${index}].pageIndex`),
    regions: [],
    updatedAt: finiteInteger(value['updatedAt'], `pages[${index}].updatedAt`),
  };
  const regions = value['regions'];
  if (!Array.isArray(regions) || regions.length > MAX_COMIC_WORKER_REGIONS) {
    throw new ComicWorkspaceError(`Invalid comic workspace regions: ${index}`);
  }
  page.regions = regions.map((region, regionIndex) =>
    parseRegion(region, `pages[${index}].regions[${regionIndex}]`, page),
  );
  return page;
};

export const parseComicWorkspace = (value: unknown): ComicWorkspace => {
  if (
    !isRecord(value) ||
    value['format'] !== COMIC_WORKSPACE_FORMAT ||
    value['schemaVersion'] !== COMIC_WORKSPACE_SCHEMA_VERSION
  ) {
    throw new ComicWorkspaceError('Unsupported comic workspace schema');
  }
  const sourceFormat = value['sourceFormat'];
  if (typeof sourceFormat !== 'string' || !SOURCE_FORMATS.has(sourceFormat as OcrSourceFormat)) {
    throw new ComicWorkspaceError('Invalid comic workspace source format');
  }
  const rawPages = value['pages'];
  if (
    !Array.isArray(rawPages) ||
    rawPages.length === 0 ||
    rawPages.length > MAX_COMIC_WORKER_PAGES
  ) {
    throw new ComicWorkspaceError('Invalid comic workspace pages');
  }
  const pages = rawPages.map(parsePage);
  const pageIds = new Set<string>();
  const pageIndexes = new Set<number>();
  let totalText = 0;
  for (const page of pages) {
    if (pageIds.has(page.pageId))
      throw new ComicWorkspaceError(`Duplicate comic workspace page: ${page.pageId}`);
    if (pageIndexes.has(page.pageIndex))
      throw new ComicWorkspaceError(`Duplicate comic workspace page index: ${page.pageIndex}`);
    pageIds.add(page.pageId);
    pageIndexes.add(page.pageIndex);
    const regionIds = new Set<string>();
    for (const region of page.regions) {
      if (regionIds.has(region.id))
        throw new ComicWorkspaceError(`Duplicate comic workspace region: ${region.id}`);
      regionIds.add(region.id);
      totalText += region.machine?.text?.length ?? 0;
      totalText += region.manual?.text?.length ?? 0;
      totalText += region.translation?.translatedText?.length ?? 0;
      if (totalText > MAX_COMIC_WORKSPACE_TEXT_CHARS * 4) {
        throw new ComicWorkspaceError('Comic workspace text exceeds resource limits');
      }
    }
  }
  return {
    format: COMIC_WORKSPACE_FORMAT,
    schemaVersion: COMIC_WORKSPACE_SCHEMA_VERSION,
    bookHash: requiredString(value['bookHash'], 'bookHash'),
    ...(value['sourceFingerprint'] === undefined
      ? {}
      : { sourceFingerprint: requiredString(value['sourceFingerprint'], 'sourceFingerprint') }),
    sourceFormat: sourceFormat as OcrSourceFormat,
    createdAt: finiteInteger(value['createdAt'], 'createdAt'),
    updatedAt: finiteInteger(value['updatedAt'], 'updatedAt'),
    revision: finiteInteger(value['revision'], 'revision'),
    pages,
  };
};

export const serializeComicWorkspace = (workspace: ComicWorkspace): string =>
  JSON.stringify(parseComicWorkspace(workspace), null, 2);

const cloneWorkspace = (workspace: ComicWorkspace): ComicWorkspace =>
  parseComicWorkspace(JSON.parse(serializeComicWorkspace(workspace)));

const touchWorkspace = (workspace: ComicWorkspace, now: number): ComicWorkspace => ({
  ...workspace,
  revision: workspace.revision + 1,
  updatedAt: now,
});

const findPage = (workspace: ComicWorkspace, pageId: string): ComicWorkspacePage => {
  const page = workspace.pages.find((candidate) => candidate.pageId === pageId);
  if (!page) throw new ComicWorkspaceError(`Comic workspace page not found: ${pageId}`);
  return page;
};

const findRegion = (page: ComicWorkspacePage, regionId: string): ComicWorkspaceRegion => {
  const region = page.regions.find((candidate) => candidate.id === regionId);
  if (!region) throw new ComicWorkspaceError(`Comic workspace region not found: ${regionId}`);
  return region;
};

const effectiveSourceText = (region: ComicWorkspaceRegion): string | undefined => {
  if (region.manual?.deleted) return undefined;
  return region.manual?.text?.trim() || region.machine?.text?.trim() || undefined;
};

export const getComicRegionSourceText = (region: ComicWorkspaceRegion): string | undefined =>
  effectiveSourceText(region);

export const getComicRegionSourceRevision = (region: ComicWorkspaceRegion): number =>
  region.manual?.text ? region.manual.revision : region.machineRevision;

export const getEffectiveComicRegion = (
  region: ComicWorkspaceRegion,
): EffectiveComicRegion | null => {
  if (region.manual?.deleted) return null;
  const machine = region.machine;
  const base: ComicTextRegion = machine
    ? {
        ...machine,
        polygon: machine.polygon.map((point) => ({ ...point })),
        ruby: machine.ruby?.map((ruby) => ({ ...ruby })),
      }
    : {
        id: region.id,
        pageId: region.pageId,
        polygon: region.manual?.polygon?.map((point) => ({ ...point })) ?? [],
        orientation: region.manual?.orientation ?? 'horizontal',
        ...(region.manual?.language ? { language: region.manual.language } : {}),
        ...(region.manual?.text ? { text: region.manual.text } : {}),
        readingOrder: region.manual?.readingOrder ?? 0,
        engine: 'manual',
      };
  const manual = region.manual;
  return {
    ...base,
    ...(manual?.polygon ? { polygon: manual.polygon.map((point) => ({ ...point })) } : {}),
    ...(manual?.orientation ? { orientation: manual.orientation } : {}),
    ...(manual?.language ? { language: manual.language } : {}),
    ...(manual?.text !== undefined ? { text: manual.text } : {}),
    ...(manual?.readingOrder === undefined ? {} : { readingOrder: manual.readingOrder }),
    ...(manual?.ruby ? { ruby: manual.ruby.map((ruby) => ({ ...ruby })) } : {}),
    source: region.source,
    reviewStatus: region.reviewStatus,
    machineRevision: region.machineRevision,
    machineStale: region.machineStale === true,
    rotationDeg: manual?.rotationDeg ?? 0,
    ...(region.translation ? { translation: { ...region.translation } } : {}),
    ...(region.overlay
      ? {
          overlay: {
            ...region.overlay,
            style: region.overlay.style ? { ...region.overlay.style } : undefined,
          },
        }
      : {}),
  };
};

const normalizePatch = (patch: ComicRegionPatch, page: ComicWorkspacePage): ComicRegionPatch => {
  const normalized: ComicRegionPatch = {};
  if (patch.deleted !== undefined) normalized.deleted = patch.deleted === true;
  if (patch.polygon !== undefined)
    normalized.polygon = parsePolygon(patch.polygon, 'patch.polygon', page.width, page.height);
  if (patch.orientation !== undefined) {
    if (!ORIENTATIONS.has(patch.orientation))
      throw new ComicWorkspaceError('Invalid comic region orientation');
    normalized.orientation = patch.orientation;
  }
  if (patch.language !== undefined)
    normalized.language = requiredString(patch.language, 'patch.language');
  if (patch.text !== undefined) {
    const text = optionalString(patch.text, 'patch.text');
    if (!text?.trim()) throw new ComicWorkspaceError('Comic region text cannot be empty');
    normalized.text = text;
  }
  if (patch.readingOrder !== undefined)
    normalized.readingOrder = finiteInteger(patch.readingOrder, 'patch.readingOrder');
  if (patch.ruby !== undefined) normalized.ruby = parseRuby(patch.ruby, 'patch.ruby');
  if (patch.rotationDeg !== undefined)
    normalized.rotationDeg = boundedNumber(patch.rotationDeg, 'patch.rotationDeg', -360, 360);
  if (patch.overlayStyle !== undefined) {
    normalized.overlayStyle = parseOverlayStyle(patch.overlayStyle, 'patch.overlayStyle');
  }
  return normalized;
};

const markTranslationStale = (region: ComicWorkspaceRegion, previousText: string | undefined) => {
  const nextText = effectiveSourceText(region);
  if (region.translation && nextText !== previousText) {
    region.translation = {
      ...region.translation,
      stale: true,
      status: 'pending',
      error: undefined,
      updatedAt: region.updatedAt,
    };
  }
};

export const createComicWorkspaceFromOcrSidecar = (
  input: OcrSidecar,
  now = Date.now(),
): ComicWorkspace => {
  const sidecar = parseOcrSidecar(input);
  return parseComicWorkspace({
    format: COMIC_WORKSPACE_FORMAT,
    schemaVersion: COMIC_WORKSPACE_SCHEMA_VERSION,
    bookHash: sidecar.bookHash,
    ...(sidecar.sourceFingerprint ? { sourceFingerprint: sidecar.sourceFingerprint } : {}),
    sourceFormat: sidecar.sourceFormat,
    createdAt: now,
    updatedAt: now,
    revision: 0,
    pages: sidecar.pages.map((page) => ({
      pageId: page.pageId,
      pageIndex: page.pageIndex,
      width: page.width,
      height: page.height,
      format: page.format,
      localRef: page.localRef,
      updatedAt: now,
      regions: page.regions.map((machine) => ({
        id: machine.id,
        pageId: page.pageId,
        source: 'ocr',
        machine,
        machineRevision: 1,
        reviewStatus: 'unreviewed',
        createdAt: now,
        updatedAt: now,
      })),
    })),
  });
};

export const editComicRegion = (
  workspace: ComicWorkspace,
  pageId: string,
  regionId: string,
  patch: ComicRegionPatch,
  now = Date.now(),
): ComicWorkspace => {
  const next = cloneWorkspace(workspace);
  const page = findPage(next, pageId);
  const region = findRegion(page, regionId);
  const previousText = effectiveSourceText(region);
  const normalized = normalizePatch(patch, page);
  const { overlayStyle, ...manualPatch } = normalized;
  region.manual = {
    revision: (region.manual?.revision ?? 0) + 1,
    updatedAt: now,
    ...(region.manual ?? {}),
    ...manualPatch,
  };
  if (overlayStyle) region.overlay = { style: overlayStyle, updatedAt: now };
  region.reviewStatus = 'corrected';
  region.updatedAt = now;
  page.updatedAt = now;
  markTranslationStale(region, previousText);
  return parseComicWorkspace(touchWorkspace(next, now));
};

export const approveComicRegion = (
  workspace: ComicWorkspace,
  pageId: string,
  regionId: string,
  now = Date.now(),
): ComicWorkspace => {
  const next = cloneWorkspace(workspace);
  const page = findPage(next, pageId);
  const region = findRegion(page, regionId);
  if (region.manual?.deleted)
    throw new ComicWorkspaceError('Deleted comic region cannot be approved');
  region.reviewStatus = 'approved';
  region.updatedAt = now;
  page.updatedAt = now;
  return parseComicWorkspace(touchWorkspace(next, now));
};

export const revertComicRegion = (
  workspace: ComicWorkspace,
  pageId: string,
  regionId: string,
  now = Date.now(),
): ComicWorkspace => {
  const next = cloneWorkspace(workspace);
  const page = findPage(next, pageId);
  const region = findRegion(page, regionId);
  if (!region.machine)
    throw new ComicWorkspaceError('Manual-only comic region has no OCR revision to revert');
  const previousText = effectiveSourceText(region);
  delete region.manual;
  region.reviewStatus = region.machine ? 'unreviewed' : 'corrected';
  region.updatedAt = now;
  page.updatedAt = now;
  markTranslationStale(region, previousText);
  return parseComicWorkspace(touchWorkspace(next, now));
};

export const deleteComicRegion = (
  workspace: ComicWorkspace,
  pageId: string,
  regionId: string,
  now = Date.now(),
): ComicWorkspace => editComicRegion(workspace, pageId, regionId, { deleted: true }, now);

export const restoreComicRegion = (
  workspace: ComicWorkspace,
  pageId: string,
  regionId: string,
  now = Date.now(),
): ComicWorkspace => editComicRegion(workspace, pageId, regionId, { deleted: false }, now);

export const createManualComicRegion = (
  workspace: ComicWorkspace,
  pageId: string,
  input: {
    id: string;
    polygon: ComicPoint[];
    text: string;
    orientation?: ComicRegionOrientation;
    language?: string;
    readingOrder?: number;
    ruby?: ComicRuby[];
    rotationDeg?: number;
  },
  now = Date.now(),
): ComicWorkspace => {
  const next = cloneWorkspace(workspace);
  const page = findPage(next, pageId);
  if (page.regions.some((region) => region.id === input.id)) {
    throw new ComicWorkspaceError(`Comic workspace region already exists: ${input.id}`);
  }
  const patch = normalizePatch(input, page);
  if (!patch.polygon || !patch.text)
    throw new ComicWorkspaceError('Manual comic region polygon and text are required');
  page.regions.push({
    id: input.id,
    pageId,
    source: 'manual',
    machineRevision: 0,
    manual: { revision: 1, updatedAt: now, ...patch },
    reviewStatus: 'corrected',
    createdAt: now,
    updatedAt: now,
  });
  page.updatedAt = now;
  return parseComicWorkspace(touchWorkspace(next, now));
};

export const splitComicRegion = (
  workspace: ComicWorkspace,
  pageId: string,
  regionId: string,
  input: { newRegionId: string; first: ComicRegionPatch; second: ComicRegionPatch },
  now = Date.now(),
): ComicWorkspace => {
  const original = findRegion(findPage(workspace, pageId), regionId);
  const sourceText = getComicRegionSourceText(original) ?? '';
  const first = input.first.text ?? sourceText;
  const second = input.second.text;
  if (!second?.trim())
    throw new ComicWorkspaceError('A split comic region needs text for the new region');
  let next = editComicRegion(workspace, pageId, regionId, { ...input.first, text: first }, now);
  const firstRegion = findRegion(findPage(next, pageId), regionId);
  const firstEffective = getEffectiveComicRegion(firstRegion);
  const secondPolygon = input.second.polygon ?? firstEffective?.polygon;
  if (!secondPolygon) throw new ComicWorkspaceError('A split comic region needs a second polygon');
  next = createManualComicRegion(
    next,
    pageId,
    {
      id: input.newRegionId,
      polygon: secondPolygon,
      text: second,
      orientation: input.second.orientation ?? firstEffective?.orientation,
      language: input.second.language ?? firstEffective?.language,
      readingOrder: input.second.readingOrder ?? (firstEffective?.readingOrder ?? 0) + 1,
      ruby: input.second.ruby,
      rotationDeg: input.second.rotationDeg,
    },
    now,
  );
  return next;
};

export const mergeComicRegions = (
  workspace: ComicWorkspace,
  pageId: string,
  regionIds: string[],
  now = Date.now(),
): ComicWorkspace => {
  if (regionIds.length < 2)
    throw new ComicWorkspaceError('At least two comic regions are required to merge');
  const page = findPage(workspace, pageId);
  const regions = regionIds.map((id) => findRegion(page, id));
  const effective = regions
    .map((region) => getEffectiveComicRegion(region))
    .filter(Boolean) as EffectiveComicRegion[];
  if (effective.length !== regions.length)
    throw new ComicWorkspaceError('Deleted comic regions cannot be merged');
  const polygon = effective.flatMap((region) => region.polygon.map((point) => ({ ...point })));
  let next = editComicRegion(
    workspace,
    pageId,
    regionIds[0]!,
    {
      polygon,
      text: effective
        .map((region) => region.text ?? '')
        .filter(Boolean)
        .join('\n'),
      readingOrder: Math.min(...effective.map((region) => region.readingOrder)),
    },
    now,
  );
  for (const id of regionIds.slice(1)) next = deleteComicRegion(next, pageId, id, now);
  return next;
};

export const reorderComicRegions = (
  workspace: ComicWorkspace,
  pageId: string,
  orderedRegionIds: string[],
  now = Date.now(),
): ComicWorkspace => {
  const next = cloneWorkspace(workspace);
  const page = findPage(next, pageId);
  const active = page.regions.filter((region) => !region.manual?.deleted);
  if (
    active.length !== orderedRegionIds.length ||
    new Set(orderedRegionIds).size !== active.length
  ) {
    throw new ComicWorkspaceError(
      'Region reorder must include every active comic region exactly once',
    );
  }
  const byId = new Map(page.regions.map((region) => [region.id, region]));
  orderedRegionIds.forEach((id, index) => {
    const region = byId.get(id);
    if (!region || region.manual?.deleted)
      throw new ComicWorkspaceError(`Unknown active region: ${id}`);
    region.manual = {
      ...(region.manual ?? { revision: 0, updatedAt: now }),
      revision: (region.manual?.revision ?? 0) + 1,
      updatedAt: now,
      readingOrder: index,
    };
    region.reviewStatus = 'corrected';
    region.updatedAt = now;
  });
  page.updatedAt = now;
  return parseComicWorkspace(touchWorkspace(next, now));
};

export const setComicRegionTranslation = (
  workspace: ComicWorkspace,
  pageId: string,
  regionId: string,
  translation: ComicRegionTranslation,
  now = Date.now(),
): ComicWorkspace => {
  const next = cloneWorkspace(workspace);
  const page = findPage(next, pageId);
  const region = findRegion(page, regionId);
  if (region.manual?.deleted)
    throw new ComicWorkspaceError('Deleted comic region cannot be translated');
  const sourceText = effectiveSourceText(region);
  if (!sourceText) throw new ComicWorkspaceError('Comic region has no source text');
  if (translation.sourceRevision !== getComicRegionSourceRevision(region)) {
    throw new ComicWorkspaceError('Comic translation source revision changed');
  }
  if (translation.sourceText !== sourceText)
    throw new ComicWorkspaceError('Comic translation source changed');
  if (!translation.targetLang.trim() || !translation.provider.trim())
    throw new ComicWorkspaceError('Comic translation provider and target language are required');
  region.translation = {
    ...translation,
    sourceText,
    updatedAt: now,
  };
  region.updatedAt = now;
  page.updatedAt = now;
  return parseComicWorkspace(touchWorkspace(next, now));
};

export const reviewComicRegionTranslation = (
  workspace: ComicWorkspace,
  pageId: string,
  regionId: string,
  translatedText: string,
  now = Date.now(),
): ComicWorkspace => {
  const page = findPage(workspace, pageId);
  const region = findRegion(page, regionId);
  const translation = region.translation;
  if (!translation) throw new ComicWorkspaceError(`Comic translation not found: ${regionId}`);
  const text = optionalString(translatedText, 'translatedText');
  if (!text) throw new ComicWorkspaceError('Reviewed comic translation cannot be empty');
  return setComicRegionTranslation(
    workspace,
    pageId,
    regionId,
    {
      ...translation,
      translatedText: text,
      machineTranslatedText: translation.machineTranslatedText ?? translation.translatedText,
      status: 'reviewed',
      stale: false,
      error: undefined,
      updatedAt: now,
    },
    now,
  );
};

export const revertComicRegionTranslation = (
  workspace: ComicWorkspace,
  pageId: string,
  regionId: string,
  now = Date.now(),
): ComicWorkspace => {
  const page = findPage(workspace, pageId);
  const region = findRegion(page, regionId);
  const translation = region.translation;
  const machineText = translation?.machineTranslatedText ?? translation?.translatedText;
  if (!translation || !machineText?.trim())
    throw new ComicWorkspaceError(`Machine comic translation not available: ${regionId}`);
  return setComicRegionTranslation(
    workspace,
    pageId,
    regionId,
    {
      ...translation,
      translatedText: machineText,
      status: 'translated',
      stale: false,
      error: undefined,
      updatedAt: now,
    },
    now,
  );
};

export const setComicRegionOverlay = (
  workspace: ComicWorkspace,
  pageId: string,
  regionId: string,
  style: ComicOverlayStyle,
  now = Date.now(),
): ComicWorkspace => {
  const next = cloneWorkspace(workspace);
  const page = findPage(next, pageId);
  const region = findRegion(page, regionId);
  const parsedStyle = parseOverlayStyle(style, 'style');
  region.overlay = { style: parsedStyle, updatedAt: now };
  region.updatedAt = now;
  page.updatedAt = now;
  return parseComicWorkspace(touchWorkspace(next, now));
};

export const mergeOcrPageResultIntoWorkspace = (
  workspace: ComicWorkspace,
  result: ComicWorkerPageResult,
  now = Date.now(),
): ComicWorkspace => {
  const next = cloneWorkspace(workspace);
  const page = findPage(next, result.pageId);
  const parsed = parseComicWorkerPageResult(result, WORKSPACE_VALIDATION_DESCRIPTOR);
  if (parsed.width !== page.width || parsed.height !== page.height)
    throw new ComicWorkspaceError('OCR result page dimensions changed');
  const incomingById = new Map(parsed.regions.map((region) => [region.id, region]));
  for (const region of page.regions) {
    const incoming = incomingById.get(region.id);
    if (!incoming) {
      if (region.machine) region.machineStale = true;
      continue;
    }
    const previousText = effectiveSourceText(region);
    region.machine = incoming;
    region.machineRevision += 1;
    region.machineStale = false;
    region.updatedAt = now;
    markTranslationStale(region, previousText);
    incomingById.delete(region.id);
  }
  for (const incoming of incomingById.values()) {
    page.regions.push({
      id: incoming.id,
      pageId: page.pageId,
      source: 'ocr',
      machine: incoming,
      machineRevision: 1,
      reviewStatus: 'unreviewed',
      createdAt: now,
      updatedAt: now,
    });
  }
  page.updatedAt = now;
  return parseComicWorkspace(touchWorkspace(next, now));
};

export const createComicWorkspacePage = (
  page: OcrPageRecord | (ComicWorkerPageInput & { pageIndex: number }),
  now = Date.now(),
): ComicWorkspacePage => ({
  pageId: page.pageId,
  pageIndex: page.pageIndex,
  width: page.width,
  height: page.height,
  format: page.format,
  localRef: page.localRef,
  regions: [],
  updatedAt: now,
});
