import {
  MAX_COMIC_WORKER_IMAGE_PIXELS,
  MAX_COMIC_WORKER_PAGES,
  type ComicWorkerPageInput,
} from './comicWorkerProtocol';
import type { OcrSourceFormat } from './ocrSidecar';
import { validateComicExportResult, type ComicExportResult } from './comicExport';

/** Restart-safe batch orchestration for OCR, translation, cleanup, typesetting, and export. */
export const COMIC_PIPELINE_FORMAT = 'babelleaf.comic-pipeline' as const;
export const COMIC_PIPELINE_SCHEMA_VERSION = 1 as const;
export const MAX_COMIC_PIPELINE_HISTORY = 2_000;
export const MAX_COMIC_PIPELINE_ERROR = 2_000;
export const MAX_COMIC_CACHE_BYTES = 2 * 1024 * 1024 * 1024;

export type ComicPipelineStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';
export type ComicPipelineItemStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type ComicPipelinePhase = 'ocr' | 'translate' | 'cleanup' | 'typeset' | 'export';

export interface ComicPipelinePage extends ComicWorkerPageInput {
  pageIndex: number;
}

export interface ComicPipelinePageIdentity {
  pageId: string;
  width: number;
  height: number;
  byteLength: number;
}

/**
 * Produces a bounded, deterministic identity for a local page set.
 * It is intentionally independent of image bytes so queue restoration does
 * not require retaining or hashing the source files after import.
 */
export const createComicPipelinePageSetSignature = (
  pages: readonly ComicPipelinePageIdentity[],
): string => {
  let hash = 2_166_136_261;
  for (const page of pages) {
    for (const character of `${page.pageId}:${page.width}x${page.height}:${page.byteLength}|`) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16_777_619);
    }
  }
  return `${pages.length}-${(hash >>> 0).toString(16)}`;
};

export interface ComicPipelineItemResult {
  pageId: string;
  completedAt: number;
  warnings?: string[];
  outputRef?: string;
}

export interface ComicPipelineItem {
  id: string;
  pageIndex: number;
  page: ComicPipelinePage;
  phase: ComicPipelinePhase;
  status: ComicPipelineItemStatus;
  attempts: number;
  result?: ComicPipelineItemResult;
  error?: string;
  updatedAt: number;
}

export interface ComicPipelineHistoryEntry {
  revision: number;
  status: ComicPipelineStatus;
  reason: string;
  at: number;
}

export interface ComicPipelineSnapshot {
  format: typeof COMIC_PIPELINE_FORMAT;
  schemaVersion: typeof COMIC_PIPELINE_SCHEMA_VERSION;
  id: string;
  bookHash: string;
  sourceFingerprint?: string;
  sourceFormat: OcrSourceFormat;
  phase: ComicPipelinePhase;
  engine?: string;
  engineVersion?: string;
  modelId?: string;
  status: ComicPipelineStatus;
  total: number;
  completed: number;
  failed: number;
  cancelled: number;
  maxAttempts: number;
  concurrency: number;
  revision: number;
  updatedAt: number;
  recovered?: boolean;
  items: ComicPipelineItem[];
  history: ComicPipelineHistoryEntry[];
}

export interface ComicPipelineInput {
  id: string;
  bookHash: string;
  sourceFingerprint?: string;
  sourceFormat: OcrSourceFormat;
  phase: ComicPipelinePhase;
  engine?: string;
  engineVersion?: string;
  modelId?: string;
  pages: ComicPipelinePage[];
  concurrency?: number;
  maxAttempts?: number;
  initialSnapshot?: ComicPipelineSnapshot;
  checkpoint?: ComicPipelineCheckpoint;
}

export interface ComicPipelineCheckpoint {
  save(snapshot: ComicPipelineSnapshot): Promise<void>;
}

export interface ComicPipelineCacheEntry {
  id: string;
  path: string;
  sizeBytes: number;
  createdAt: number;
  lastAccessedAt: number;
}

export interface ComicPipelineCachePruneResult {
  kept: ComicPipelineCacheEntry[];
  removed: ComicPipelineCacheEntry[];
  totalBytes: number;
  removedBytes: number;
}

export type ProcessComicPipelinePage = (
  item: ComicPipelineItem,
  signal: AbortSignal,
) => Promise<ComicPipelineItemResult>;
export type ComicPipelineListener = (snapshot: ComicPipelineSnapshot) => void;

export interface ComicPipelineStageResult {
  warnings?: string[];
  outputRef?: string;
}

export interface ComicPipelineStage {
  phase: ComicPipelinePhase;
  process(item: ComicPipelineItem, signal: AbortSignal): Promise<ComicPipelineStageResult | void>;
}

export class ComicPipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComicPipelineError';
  }
}

const phases = new Set<ComicPipelinePhase>(['ocr', 'translate', 'cleanup', 'typeset', 'export']);
const sourceFormats = new Set<OcrSourceFormat>(['PDF', 'CBZ', 'FBZ', 'IMAGE_FOLDER']);
const statuses = new Set<ComicPipelineStatus>([
  'queued',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
]);
const itemStatuses = new Set<ComicPipelineItemStatus>([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

/** Composes ordered page stages into one restart-safe queue processor. */
export const composeComicPipelineStages = (
  stages: ComicPipelineStage[],
): ProcessComicPipelinePage => {
  if (!Array.isArray(stages) || stages.length === 0 || stages.length > 5) {
    throw new ComicPipelineError('Comic pipeline must contain one to five stages');
  }
  const seen = new Set<ComicPipelinePhase>();
  for (const stage of stages) {
    if (!phases.has(stage.phase) || seen.has(stage.phase)) {
      throw new ComicPipelineError('Comic pipeline stages must have unique supported phases');
    }
    seen.add(stage.phase);
  }
  return async (item, signal) => {
    const warnings: string[] = [];
    let outputRef: string | undefined;
    for (const stage of stages) {
      if (signal.aborted) throw new ComicPipelineError('Comic pipeline cancelled');
      const result = await stage.process(item, signal);
      if (!result) continue;
      if (result.warnings) warnings.push(...result.warnings.slice(0, 64 - warnings.length));
      if (result.outputRef) outputRef = result.outputRef;
    }
    return {
      pageId: item.page.pageId,
      completedAt: Date.now(),
      ...(warnings.length ? { warnings } : {}),
      ...(outputRef ? { outputRef } : {}),
    };
  };
};

const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ComicPipelineError(`Invalid comic pipeline field: ${field}`);
  }
  return value.trim();
};

const integer = (
  value: unknown,
  field: string,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): number => {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new ComicPipelineError(`Invalid comic pipeline field: ${field}`);
  }
  return value as number;
};

const pageFormat = (value: unknown): ComicPipelinePage['format'] => {
  if (!['png', 'jpeg', 'webp', 'avif', 'pdf'].includes(String(value))) {
    throw new ComicPipelineError('Invalid comic pipeline page format');
  }
  return value as ComicPipelinePage['format'];
};

const errorMessage = (error: unknown): string => {
  const message =
    error instanceof Error && error.message ? error.message : String(error || 'Comic page failed');
  return message
    .replace(/bearer\s+[a-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/(?:api[_-]?key|secret|password|token)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .replace(/sk-[a-z0-9_-]{8,}/gi, 'sk-[redacted]')
    .slice(0, MAX_COMIC_PIPELINE_ERROR);
};

const parseItemResult = (value: unknown, field: string): ComicPipelineItemResult => {
  if (typeof value !== 'object' || value === null) {
    throw new ComicPipelineError(`Invalid comic pipeline result: ${field}`);
  }
  const raw = value as Record<string, unknown>;
  const warnings = raw['warnings'];
  if (warnings !== undefined && (!Array.isArray(warnings) || warnings.length > 64)) {
    throw new ComicPipelineError(`Invalid comic pipeline warnings: ${field}`);
  }
  return {
    pageId: requiredString(raw['pageId'], `${field}.pageId`),
    completedAt: integer(raw['completedAt'], `${field}.completedAt`),
    ...(warnings === undefined
      ? {}
      : {
          warnings: warnings.map((warning, index) =>
            requiredString(warning, `${field}.warnings[${index}]`).slice(0, 500),
          ),
        }),
    ...(raw['outputRef'] === undefined
      ? {}
      : { outputRef: requiredString(raw['outputRef'], `${field}.outputRef`).slice(0, 500) }),
  };
};

const parsePage = (value: unknown, field: string): ComicPipelinePage => {
  if (typeof value !== 'object' || value === null)
    throw new ComicPipelineError(`Invalid comic pipeline page: ${field}`);
  const raw = value as Record<string, unknown>;
  const page = {
    pageId: requiredString(raw['pageId'], `${field}.pageId`),
    width: integer(raw['width'], `${field}.width`, 1),
    height: integer(raw['height'], `${field}.height`, 1),
    format: pageFormat(raw['format']),
    localRef: requiredString(raw['localRef'], `${field}.localRef`),
    pageIndex: integer(raw['pageIndex'], `${field}.pageIndex`),
  } satisfies ComicPipelinePage;
  if (page.width * page.height > MAX_COMIC_WORKER_IMAGE_PIXELS) {
    throw new ComicPipelineError(`Comic pipeline page exceeds pixel limit: ${field}`);
  }
  return page;
};

export const parseComicPipelineSnapshot = (value: unknown): ComicPipelineSnapshot => {
  if (typeof value !== 'object' || value === null)
    throw new ComicPipelineError('Invalid comic pipeline snapshot');
  const raw = value as Record<string, unknown>;
  if (
    raw['format'] !== COMIC_PIPELINE_FORMAT ||
    raw['schemaVersion'] !== COMIC_PIPELINE_SCHEMA_VERSION
  ) {
    throw new ComicPipelineError('Unsupported comic pipeline schema');
  }
  const status = raw['status'];
  const phase = raw['phase'];
  if (!statuses.has(status as ComicPipelineStatus) || !phases.has(phase as ComicPipelinePhase)) {
    throw new ComicPipelineError('Invalid comic pipeline status or phase');
  }
  const sourceFormat = raw['sourceFormat'];
  if (!sourceFormats.has(sourceFormat as OcrSourceFormat)) {
    throw new ComicPipelineError('Invalid comic pipeline source format');
  }
  const rawItems = raw['items'];
  if (
    !Array.isArray(rawItems) ||
    rawItems.length === 0 ||
    rawItems.length > MAX_COMIC_WORKER_PAGES
  ) {
    throw new ComicPipelineError('Invalid comic pipeline items');
  }
  const itemIds = new Set<string>();
  const pageIds = new Set<string>();
  const items = rawItems.map((value, index) => {
    if (typeof value !== 'object' || value === null)
      throw new ComicPipelineError(`Invalid comic pipeline item: ${index}`);
    const item = value as Record<string, unknown>;
    const itemStatus = item['status'];
    if (!itemStatuses.has(itemStatus as ComicPipelineItemStatus))
      throw new ComicPipelineError(`Invalid comic pipeline item status: ${index}`);
    if (item['phase'] !== phase)
      throw new ComicPipelineError(`Comic pipeline item phase changed: ${index}`);
    const parsed = {
      id: requiredString(item['id'], `items[${index}].id`),
      page: parsePage(item['page'], `items[${index}].page`),
      pageIndex: integer(item['pageIndex'], `items[${index}].pageIndex`),
      phase: phase as ComicPipelinePhase,
      status: itemStatus as ComicPipelineItemStatus,
      attempts: integer(item['attempts'], `items[${index}].attempts`, 0, 5),
      ...(item['result'] === undefined
        ? {}
        : { result: parseItemResult(item['result'], `items[${index}].result`) }),
      ...(item['error'] === undefined ? {} : { error: errorMessage(item['error']) }),
      updatedAt: integer(item['updatedAt'], `items[${index}].updatedAt`),
    } satisfies ComicPipelineItem;
    if (parsed.pageIndex !== parsed.page.pageIndex)
      throw new ComicPipelineError(`Comic pipeline page index changed: ${index}`);
    if (itemIds.has(parsed.id) || pageIds.has(parsed.page.pageId))
      throw new ComicPipelineError(`Duplicate comic pipeline item: ${index}`);
    if (parsed.result && parsed.result.pageId !== parsed.page.pageId)
      throw new ComicPipelineError(`Comic pipeline result identity changed: ${index}`);
    itemIds.add(parsed.id);
    pageIds.add(parsed.page.pageId);
    return parsed;
  });
  const historyValue = raw['history'];
  if (!Array.isArray(historyValue) || historyValue.length > MAX_COMIC_PIPELINE_HISTORY) {
    throw new ComicPipelineError('Invalid comic pipeline history');
  }
  const history = historyValue.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null)
      throw new ComicPipelineError(`Invalid pipeline history entry: ${index}`);
    const item = entry as Record<string, unknown>;
    const historyStatus = item['status'];
    if (!statuses.has(historyStatus as ComicPipelineStatus))
      throw new ComicPipelineError(`Invalid pipeline history status: ${index}`);
    return {
      revision: integer(item['revision'], `history[${index}].revision`, 1),
      status: historyStatus as ComicPipelineStatus,
      reason: requiredString(item['reason'], `history[${index}].reason`).slice(0, 200),
      at: integer(item['at'], `history[${index}].at`),
    } satisfies ComicPipelineHistoryEntry;
  });
  const total = integer(raw['total'], 'total', 1, MAX_COMIC_WORKER_PAGES);
  const completed = integer(raw['completed'], 'completed');
  const failed = integer(raw['failed'], 'failed');
  const cancelled = integer(raw['cancelled'], 'cancelled');
  if (
    total !== items.length ||
    completed !== items.filter((item) => item.status === 'completed').length ||
    failed !== items.filter((item) => item.status === 'failed').length ||
    cancelled !== items.filter((item) => item.status === 'cancelled').length
  ) {
    throw new ComicPipelineError('Comic pipeline counts do not match items');
  }
  return {
    format: COMIC_PIPELINE_FORMAT,
    schemaVersion: COMIC_PIPELINE_SCHEMA_VERSION,
    id: requiredString(raw['id'], 'id'),
    bookHash: requiredString(raw['bookHash'], 'bookHash'),
    ...(raw['sourceFingerprint'] === undefined
      ? {}
      : { sourceFingerprint: requiredString(raw['sourceFingerprint'], 'sourceFingerprint') }),
    sourceFormat: sourceFormat as OcrSourceFormat,
    phase: phase as ComicPipelinePhase,
    ...(raw['engine'] === undefined ? {} : { engine: requiredString(raw['engine'], 'engine') }),
    ...(raw['engineVersion'] === undefined
      ? {}
      : { engineVersion: requiredString(raw['engineVersion'], 'engineVersion') }),
    ...(raw['modelId'] === undefined ? {} : { modelId: requiredString(raw['modelId'], 'modelId') }),
    status: status as ComicPipelineStatus,
    total,
    completed,
    failed,
    cancelled,
    maxAttempts: integer(raw['maxAttempts'], 'maxAttempts', 1, 5),
    concurrency: integer(raw['concurrency'], 'concurrency', 1, 4),
    revision: integer(raw['revision'], 'revision', 1),
    updatedAt: integer(raw['updatedAt'], 'updatedAt'),
    ...(raw['recovered'] === undefined ? {} : { recovered: raw['recovered'] === true }),
    items,
    history,
  };
};

const samePage = (left: ComicPipelinePage, right: ComicPipelinePage): boolean =>
  left.pageId === right.pageId &&
  left.pageIndex === right.pageIndex &&
  left.width === right.width &&
  left.height === right.height &&
  left.format === right.format &&
  left.localRef === right.localRef;

const copyItem = (item: ComicPipelineItem): ComicPipelineItem => ({
  ...item,
  page: { ...item.page },
  ...(item.result
    ? {
        result: {
          ...item.result,
          ...(item.result.warnings ? { warnings: [...item.result.warnings] } : {}),
        },
      }
    : {}),
});

const copySnapshot = (snapshot: ComicPipelineSnapshot): ComicPipelineSnapshot => ({
  ...snapshot,
  items: snapshot.items.map(copyItem),
  history: snapshot.history.map((entry) => ({ ...entry })),
});

const clampConcurrency = (value: number | undefined): number =>
  Math.max(1, Math.min(4, Math.floor(value ?? 2)));
const clampAttempts = (value: number | undefined): number =>
  Math.max(1, Math.min(5, Math.floor(value ?? 2)));

export class ComicPipelineQueue {
  private readonly concurrency: number;
  private readonly maxAttempts: number;
  private readonly processPage: ProcessComicPipelinePage;
  private readonly checkpoint?: ComicPipelineCheckpoint;
  /** Recreated after a user cancellation so a deliberate rerun gets a fresh signal. */
  private controller = new AbortController();
  private readonly listeners = new Set<ComicPipelineListener>();
  private snapshot: ComicPipelineSnapshot;
  private runPromise: Promise<ComicPipelineSnapshot> | undefined;
  private checkpointChain: Promise<void> = Promise.resolve();
  private checkpointError: unknown;

  constructor(input: ComicPipelineInput, processPage: ProcessComicPipelinePage) {
    if (
      !Array.isArray(input.pages) ||
      input.pages.length === 0 ||
      input.pages.length > MAX_COMIC_WORKER_PAGES
    ) {
      throw new ComicPipelineError('Comic pipeline page count exceeds resource limits');
    }
    this.concurrency = clampConcurrency(input.concurrency);
    this.maxAttempts = clampAttempts(input.maxAttempts ?? input.initialSnapshot?.maxAttempts);
    this.processPage = processPage;
    this.checkpoint = input.checkpoint;
    this.snapshot = this.createSnapshot(input);
    this.scheduleCheckpoint();
  }

  private createSnapshot(input: ComicPipelineInput): ComicPipelineSnapshot {
    const recovered = input.initialSnapshot
      ? parseComicPipelineSnapshot(input.initialSnapshot)
      : undefined;
    if (recovered) {
      const identity: Array<[string, string | undefined, string | undefined]> = [
        ['id', recovered.id, input.id],
        ['bookHash', recovered.bookHash, input.bookHash],
        ['sourceFingerprint', recovered.sourceFingerprint, input.sourceFingerprint],
        ['sourceFormat', recovered.sourceFormat, input.sourceFormat],
        ['phase', recovered.phase, input.phase],
        ['engine', recovered.engine, input.engine],
        ['engineVersion', recovered.engineVersion, input.engineVersion],
        ['modelId', recovered.modelId, input.modelId],
      ];
      const mismatch = identity.find(([, previous, current]) => previous !== current);
      if (mismatch) throw new ComicPipelineError(`Comic pipeline identity changed: ${mismatch[0]}`);
    }
    const previous = new Map(recovered?.items.map((item) => [item.id, item]) ?? []);
    const now = Date.now();
    const items = input.pages.map((page) => {
      const item: ComicPipelineItem = {
        id: `${input.id}:${page.pageIndex}:${page.pageId}`,
        pageIndex: page.pageIndex,
        page: { ...page },
        phase: input.phase,
        status: 'pending',
        attempts: 0,
        updatedAt: now,
      };
      const old = previous.get(item.id);
      if (!old) return item;
      if (!samePage(item.page, old.page))
        throw new ComicPipelineError(`Comic pipeline source page changed: ${item.id}`);
      if (old.status === 'running' || old.status === 'cancelled') {
        return { ...item, attempts: old.attempts, status: 'pending' as const };
      }
      return {
        ...item,
        status: old.status,
        attempts: old.attempts,
        updatedAt: old.updatedAt,
        ...(old.result ? { result: old.result } : {}),
        ...(old.error ? { error: old.error } : {}),
      };
    });
    const recoveredStatus = recovered?.status ?? 'queued';
    const status: ComicPipelineStatus =
      recoveredStatus === 'running'
        ? 'paused'
        : recoveredStatus === 'cancelled' && items.some((item) => item.status === 'pending')
          ? 'queued'
          : recoveredStatus === 'completed' && items.some((item) => item.status === 'pending')
            ? 'paused'
            : recoveredStatus;
    const snapshot: ComicPipelineSnapshot = {
      format: COMIC_PIPELINE_FORMAT,
      schemaVersion: COMIC_PIPELINE_SCHEMA_VERSION,
      id: input.id,
      bookHash: input.bookHash,
      ...(input.sourceFingerprint ? { sourceFingerprint: input.sourceFingerprint } : {}),
      sourceFormat: input.sourceFormat,
      phase: input.phase,
      ...(input.engine ? { engine: input.engine } : {}),
      ...(input.engineVersion ? { engineVersion: input.engineVersion } : {}),
      ...(input.modelId ? { modelId: input.modelId } : {}),
      status,
      total: items.length,
      completed: 0,
      failed: 0,
      cancelled: 0,
      maxAttempts: this.maxAttempts,
      concurrency: this.concurrency,
      revision: recovered?.revision ?? 1,
      updatedAt: now,
      ...(recovered ? { recovered: true } : {}),
      items,
      history: recovered?.history.length
        ? recovered.history
        : [{ revision: 1, status, reason: 'created', at: now }],
    };
    this.snapshot = snapshot;
    this.updateCounts();
    return snapshot;
  }

  getSnapshot(): ComicPipelineSnapshot {
    return copySnapshot(this.snapshot);
  }

  subscribe(listener: ComicPipelineListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  async flushCheckpoint(): Promise<void> {
    await this.checkpointChain;
    if (this.checkpointError) throw this.checkpointError;
  }

  start(): Promise<ComicPipelineSnapshot> {
    if (
      this.snapshot.status === 'completed' ||
      this.snapshot.status === 'failed' ||
      this.snapshot.status === 'cancelled'
    ) {
      return Promise.resolve(this.getSnapshot());
    }
    if (this.runPromise) return this.runPromise;
    if (this.controller.signal.aborted) this.controller = new AbortController();
    this.setStatus('running', 'started');
    const run = this.drain();
    this.runPromise = run;
    void run.then(() => {
      if (this.runPromise === run) this.runPromise = undefined;
    });
    return run;
  }

  pause(): void {
    if (this.snapshot.status === 'queued' || this.snapshot.status === 'running')
      this.setStatus('paused', 'paused by user');
  }

  resume(): Promise<ComicPipelineSnapshot> {
    if (this.snapshot.status === 'paused') {
      if (this.runPromise)
        return this.runPromise.then(() =>
          this.snapshot.status === 'paused' ? this.start() : this.getSnapshot(),
        );
      return this.start();
    }
    return Promise.resolve(this.getSnapshot());
  }

  retryFailed(): Promise<ComicPipelineSnapshot> {
    if (this.runPromise) {
      return this.runPromise.then(() => this.retryFailed());
    }
    if (this.snapshot.status === 'running' || this.snapshot.status === 'queued')
      return Promise.resolve(this.getSnapshot());
    let changed = false;
    for (const item of this.snapshot.items) {
      if (item.status !== 'failed') continue;
      item.status = 'pending';
      item.attempts = 0;
      item.updatedAt = Date.now();
      delete item.error;
      delete item.result;
      changed = true;
    }
    if (!changed) return Promise.resolve(this.getSnapshot());
    this.snapshot.status = 'queued';
    this.commit('retry failed pages');
    return this.start();
  }

  rerun(pageIds: string[]): ComicPipelineSnapshot {
    if (this.snapshot.status === 'running' || this.snapshot.status === 'queued') {
      throw new ComicPipelineError('Pause the comic pipeline before selecting pages to rerun');
    }
    if (this.runPromise) {
      throw new ComicPipelineError(
        'Wait for the cancelled comic pipeline to finish before rerunning',
      );
    }
    const selected = new Set(pageIds);
    if (selected.size === 0)
      throw new ComicPipelineError('At least one comic pipeline page is required');
    let changed = false;
    for (const item of this.snapshot.items) {
      if (!selected.has(item.page.pageId)) continue;
      item.status = 'pending';
      item.attempts = 0;
      item.updatedAt = Date.now();
      delete item.error;
      delete item.result;
      changed = true;
    }
    if (!changed) throw new ComicPipelineError('No selected comic pipeline pages exist');
    this.snapshot.status = 'queued';
    this.commit('selected pages queued for rerun');
    return this.getSnapshot();
  }

  cancel(): void {
    if (['completed', 'failed', 'cancelled'].includes(this.snapshot.status)) return;
    this.controller.abort();
    for (const item of this.snapshot.items) {
      if (item.status === 'pending' || item.status === 'running') {
        item.status = 'cancelled';
        item.updatedAt = Date.now();
        delete item.error;
        delete item.result;
      }
    }
    this.setStatus('cancelled', 'cancelled by user');
  }

  cleanupHistory(maxEntries = 200): ComicPipelineSnapshot {
    const limit = Math.max(1, Math.min(MAX_COMIC_PIPELINE_HISTORY, Math.floor(maxEntries)));
    this.snapshot.history = this.snapshot.history.slice(-limit);
    this.commit('history pruned');
    return this.getSnapshot();
  }

  private setStatus(status: ComicPipelineStatus, reason: string): void {
    if (this.snapshot.status === status) {
      this.commit(reason);
      return;
    }
    this.snapshot.status = status;
    this.commit(reason);
  }

  private commit(reason: string): void {
    this.updateCounts();
    this.snapshot.revision += 1;
    this.snapshot.updatedAt = Date.now();
    this.snapshot.history = [
      ...this.snapshot.history,
      {
        revision: this.snapshot.revision,
        status: this.snapshot.status,
        reason: reason.slice(0, 200),
        at: this.snapshot.updatedAt,
      },
    ].slice(-MAX_COMIC_PIPELINE_HISTORY);
    this.emit();
    this.scheduleCheckpoint();
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  private scheduleCheckpoint(): void {
    if (!this.checkpoint) return;
    const snapshot = this.getSnapshot();
    this.checkpointChain = this.checkpointChain
      .then(() => this.checkpoint!.save(snapshot))
      .catch((error) => {
        this.checkpointError = error;
      });
  }

  private updateCounts(): void {
    this.snapshot.completed = this.snapshot.items.filter(
      (item) => item.status === 'completed',
    ).length;
    this.snapshot.failed = this.snapshot.items.filter((item) => item.status === 'failed').length;
    this.snapshot.cancelled = this.snapshot.items.filter(
      (item) => item.status === 'cancelled',
    ).length;
  }

  private takePending(): ComicPipelineItem | undefined {
    return this.snapshot.items.find((item) => item.status === 'pending');
  }

  private async worker(): Promise<void> {
    while (this.snapshot.status === 'running' && !this.controller.signal.aborted) {
      const item = this.takePending();
      if (!item) return;
      item.status = 'running';
      item.attempts += 1;
      item.updatedAt = Date.now();
      delete item.error;
      this.commit(`page started: ${item.page.pageId}`);
      try {
        const result = await this.processPage(copyItem(item), this.controller.signal);
        if (this.controller.signal.aborted || this.isCancelled()) {
          item.status = 'cancelled';
          delete item.result;
        } else if (result.pageId !== item.page.pageId) {
          item.status = item.attempts < this.maxAttempts ? 'pending' : 'failed';
          item.error = 'Comic worker returned a different page identity';
        } else {
          item.status = 'completed';
          item.result = parseItemResult(result, `result.${item.page.pageId}`);
        }
      } catch (error) {
        if (this.controller.signal.aborted || this.isCancelled()) {
          item.status = 'cancelled';
          delete item.error;
        } else if (item.attempts < this.maxAttempts) {
          item.status = 'pending';
          item.error = errorMessage(error);
        } else {
          item.status = 'failed';
          item.error = errorMessage(error);
        }
      }
      item.updatedAt = Date.now();
      this.commit(`page ${item.status}: ${item.page.pageId}`);
    }
  }

  private async drain(): Promise<ComicPipelineSnapshot> {
    await Promise.all(Array.from({ length: this.concurrency }, () => this.worker()));
    if (this.snapshot.status === 'cancelled') {
      this.commit('cancelled workers drained');
      return this.getSnapshot();
    }
    if (this.snapshot.status === 'paused') return this.getSnapshot();
    this.updateCounts();
    this.setStatus(
      this.snapshot.failed > 0 ? 'failed' : 'completed',
      this.snapshot.failed > 0 ? 'completed with failures' : 'completed',
    );
    return this.getSnapshot();
  }

  private isCancelled(): boolean {
    return this.snapshot.status === 'cancelled';
  }
}

/** Evict least-recently-used generated artifacts without touching source files. */
export const pruneComicPipelineCache = (
  entries: ComicPipelineCacheEntry[],
  maxBytes = MAX_COMIC_CACHE_BYTES,
): ComicPipelineCachePruneResult => {
  if (!Array.isArray(entries)) throw new ComicPipelineError('Invalid comic cache entries');
  if (!Number.isFinite(maxBytes) || maxBytes < 0) {
    throw new ComicPipelineError('Invalid comic cache byte limit');
  }
  const limit = Math.max(0, Math.min(MAX_COMIC_CACHE_BYTES, Math.floor(maxBytes)));
  const normalized = entries.map((entry, index) => {
    if (
      !entry ||
      typeof entry.id !== 'string' ||
      !entry.id.trim() ||
      typeof entry.path !== 'string' ||
      !entry.path.trim()
    ) {
      throw new ComicPipelineError(`Invalid comic cache entry: ${index}`);
    }
    if (
      !Number.isSafeInteger(entry.sizeBytes) ||
      entry.sizeBytes < 0 ||
      !Number.isSafeInteger(entry.createdAt) ||
      entry.createdAt < 0 ||
      !Number.isSafeInteger(entry.lastAccessedAt) ||
      entry.lastAccessedAt < 0
    ) {
      throw new ComicPipelineError(`Invalid comic cache metadata: ${index}`);
    }
    return { ...entry };
  });
  const ordered = [...normalized].sort(
    (left, right) => right.lastAccessedAt - left.lastAccessedAt || right.createdAt - left.createdAt,
  );
  const kept: ComicPipelineCacheEntry[] = [];
  const removed: ComicPipelineCacheEntry[] = [];
  let totalBytes = 0;
  for (const entry of ordered) {
    if (totalBytes + entry.sizeBytes <= limit) {
      kept.push(entry);
      totalBytes += entry.sizeBytes;
    } else {
      removed.push(entry);
    }
  }
  return {
    kept,
    removed,
    totalBytes,
    removedBytes: removed.reduce((sum, entry) => sum + entry.sizeBytes, 0),
  };
};

export const validateComicPipelineExport = (
  result: ComicExportResult,
  expectedPageIds: string[] = [],
): ComicExportResult => {
  const normalized = validateComicExportResult(result);
  if (expectedPageIds.length > 0) {
    const names = new Set(normalized.files.map((file) => file.name));
    if (normalized.pageCount !== expectedPageIds.length)
      throw new ComicPipelineError('Comic export page count does not match pipeline');
    for (const pageId of expectedPageIds) {
      if (![...names].some((name) => name.includes(pageId)))
        throw new ComicPipelineError(`Comic export is missing page: ${pageId}`);
    }
  }
  return normalized;
};
