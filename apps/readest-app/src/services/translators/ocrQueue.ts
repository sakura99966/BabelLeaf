import {
  COMIC_WORKER_PROTOCOL,
  COMIC_WORKER_PROTOCOL_VERSION,
  parseComicWorkerPageResult,
  MAX_COMIC_WORKER_PAGES,
  MAX_COMIC_WORKER_IMAGE_PIXELS,
  type ComicWorkerDescriptor,
  type ComicWorkerPageInput,
  type ComicWorkerPageResult,
} from './comicWorkerProtocol';
import type { OcrPageStatus, OcrSidecar } from './ocrSidecar';
import { mergeOcrWorkerResult, upsertOcrPage } from './ocrSidecar';

export type OcrTaskStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type OcrTaskItemStatus = OcrPageStatus;

export interface OcrTaskItem {
  id: string;
  pageIndex: number;
  page: ComicWorkerPageInput;
  status: OcrTaskItemStatus;
  attempts: number;
  result?: ComicWorkerPageResult;
  error?: string;
}

export interface OcrTaskSnapshot {
  id: string;
  bookHash: string;
  sourceFormat: OcrSidecar['sourceFormat'];
  engine: string;
  engineVersion: string;
  modelId?: string;
  status: OcrTaskStatus;
  total: number;
  completed: number;
  failed: number;
  cancelled: number;
  maxAttempts: number;
  updatedAt: number;
  recovered?: boolean;
  items: OcrTaskItem[];
}

export interface OcrTaskInput {
  id: string;
  bookHash: string;
  sourceFormat: OcrSidecar['sourceFormat'];
  engine: string;
  engineVersion: string;
  modelId?: string;
  pages: Array<ComicWorkerPageInput & { pageIndex: number }>;
  concurrency?: number;
  maxAttempts?: number;
  initialSnapshot?: OcrTaskSnapshot;
}

export type ProcessOcrPage = (
  item: OcrTaskItem,
  signal: AbortSignal,
) => Promise<ComicWorkerPageResult>;
export type OcrTaskListener = (snapshot: OcrTaskSnapshot) => void;

const clampConcurrency = (value: number | undefined): number =>
  Math.max(1, Math.min(4, Math.floor(value ?? 2)));
const clampAttempts = (value: number | undefined): number =>
  Math.max(1, Math.min(5, Math.floor(value ?? 1)));
const errorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return 'OCR page failed';
};
const copyItem = (item: OcrTaskItem): OcrTaskItem => ({
  ...item,
  page: { ...item.page },
  ...(item.result
    ? { result: { ...item.result, regions: item.result.regions.map((region) => ({ ...region })) } }
    : {}),
});

const samePage = (left: OcrTaskItem, right: OcrTaskItem): boolean =>
  left.id === right.id &&
  left.pageIndex === right.pageIndex &&
  left.page.pageId === right.page.pageId &&
  left.page.width === right.page.width &&
  left.page.height === right.page.height &&
  left.page.format === right.page.format &&
  left.page.localRef === right.page.localRef;

export const parseOcrTaskSnapshot = (value: unknown): OcrTaskSnapshot => {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid OCR task snapshot');
  const raw = value as Record<string, unknown>;
  const resultDescriptor: ComicWorkerDescriptor = {
    protocol: COMIC_WORKER_PROTOCOL,
    protocolVersion: COMIC_WORKER_PROTOCOL_VERSION,
    engine: typeof raw['engine'] === 'string' && raw['engine'] ? raw['engine'] : 'persisted-ocr',
    engineVersion:
      typeof raw['engineVersion'] === 'string' && raw['engineVersion']
        ? raw['engineVersion']
        : 'persisted',
    capabilities: ['ocr'],
    languages: ['und'],
    maxWorkers: 1,
  };
  const status = raw['status'];
  if (
    !['queued', 'running', 'paused', 'completed', 'failed', 'cancelled'].includes(String(status))
  ) {
    throw new Error('Invalid OCR task status');
  }
  const items = raw['items'];
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_COMIC_WORKER_PAGES) {
    throw new Error('Invalid OCR task items');
  }
  const itemIds = new Set<string>();
  const pageIds = new Set<string>();
  const parsedItems = items.map((value, index) => {
    if (typeof value !== 'object' || value === null)
      throw new Error(`Invalid OCR task item ${index}`);
    const item = value as Record<string, unknown>;
    const itemStatus = item['status'];
    if (!['pending', 'running', 'completed', 'failed', 'cancelled'].includes(String(itemStatus))) {
      throw new Error(`Invalid OCR task item status ${index}`);
    }
    const page = item['page'];
    if (typeof page !== 'object' || page === null)
      throw new Error(`Invalid OCR task page ${index}`);
    const pageValue = page as Record<string, unknown>;
    const pageFormat = pageValue['format'];
    if (!['png', 'jpeg', 'webp', 'avif', 'pdf'].includes(String(pageFormat))) {
      throw new Error(`Invalid OCR task page format ${index}`);
    }
    const requiredString = (field: string): string => {
      const candidate = item[field];
      if (typeof candidate !== 'string' || !candidate.trim())
        throw new Error(`Invalid OCR task ${field}`);
      return candidate;
    };
    const pageString = (field: string): string => {
      const candidate = pageValue[field];
      if (typeof candidate !== 'string' || !candidate.trim()) {
        throw new Error(`Invalid OCR task page ${field}`);
      }
      return candidate;
    };
    const integer = (candidate: unknown, field: string, minimum = 0): number => {
      if (typeof candidate !== 'number' || !Number.isInteger(candidate) || candidate < minimum) {
        throw new Error(`Invalid OCR task ${field}`);
      }
      return candidate;
    };
    const id = requiredString('id');
    const pageId = pageString('pageId');
    if (itemIds.has(id)) throw new Error(`Duplicate OCR task item ${id}`);
    if (pageIds.has(pageId)) throw new Error(`Duplicate OCR task page ${pageId}`);
    itemIds.add(id);
    pageIds.add(pageId);
    const width = integer(pageValue['width'], `items[${index}].page.width`, 1);
    const height = integer(pageValue['height'], `items[${index}].page.height`, 1);
    if (width * height > MAX_COMIC_WORKER_IMAGE_PIXELS) {
      throw new Error(`OCR task page exceeds pixel limit ${index}`);
    }
    const rawError = item['error'];
    const error =
      rawError === undefined
        ? undefined
        : (() => {
            const parsedError = requiredString('error');
            if (parsedError.length > 100_000)
              throw new Error(`OCR task error is too large ${index}`);
            return parsedError;
          })();
    return {
      id,
      pageIndex: integer(item['pageIndex'], `items[${index}].pageIndex`),
      page: {
        pageId,
        width,
        height,
        format: pageFormat as ComicWorkerPageInput['format'],
        localRef: pageString('localRef'),
      },
      status: itemStatus as OcrTaskItemStatus,
      attempts: integer(item['attempts'], `items[${index}].attempts`),
      ...(item['result'] === undefined
        ? {}
        : { result: parseComicWorkerPageResult(item['result'], resultDescriptor) }),
      ...(error === undefined ? {} : { error }),
    } satisfies OcrTaskItem;
  });
  const requiredSnapshotString = (field: string): string => {
    const candidate = raw[field];
    if (typeof candidate !== 'string' || !candidate.trim())
      throw new Error(`Invalid OCR task ${field}`);
    return candidate;
  };
  const integer = (candidate: unknown, field: string, minimum = 0): number => {
    if (typeof candidate !== 'number' || !Number.isInteger(candidate) || candidate < minimum) {
      throw new Error(`Invalid OCR task ${field}`);
    }
    return candidate;
  };
  const sourceFormat = requiredSnapshotString('sourceFormat');
  if (!['PDF', 'CBZ', 'FBZ', 'IMAGE_FOLDER'].includes(sourceFormat)) {
    throw new Error('Invalid OCR task source format');
  }
  const total = integer(raw['total'], 'total');
  const completed = integer(raw['completed'], 'completed');
  const failed = integer(raw['failed'], 'failed');
  const cancelled = integer(raw['cancelled'], 'cancelled');
  if (total !== parsedItems.length) throw new Error('OCR task total does not match items');
  const count = (status: OcrTaskItemStatus) =>
    parsedItems.filter((item) => item.status === status).length;
  if (
    completed !== count('completed') ||
    failed !== count('failed') ||
    cancelled !== count('cancelled')
  ) {
    throw new Error('OCR task counts do not match items');
  }
  const maxAttempts = integer(raw['maxAttempts'], 'maxAttempts', 1);
  if (maxAttempts > 5) throw new Error('OCR task maxAttempts exceeds resource limits');
  return {
    id: requiredSnapshotString('id'),
    bookHash: requiredSnapshotString('bookHash'),
    sourceFormat: sourceFormat as OcrSidecar['sourceFormat'],
    engine: requiredSnapshotString('engine'),
    engineVersion: requiredSnapshotString('engineVersion'),
    ...(raw['modelId'] === undefined ? {} : { modelId: requiredSnapshotString('modelId') }),
    status: status as OcrTaskStatus,
    total,
    completed,
    failed,
    cancelled,
    maxAttempts,
    updatedAt: integer(raw['updatedAt'], 'updatedAt'),
    ...(raw['recovered'] === undefined ? {} : { recovered: Boolean(raw['recovered']) }),
    items: parsedItems,
  };
};

/** Bounded, pauseable OCR page queue with restart-safe snapshots. */
export class OcrTaskQueue {
  private readonly concurrency: number;
  private readonly maxAttempts: number;
  private readonly processPage: ProcessOcrPage;
  private readonly controller = new AbortController();
  private readonly listeners = new Set<OcrTaskListener>();
  private snapshot: OcrTaskSnapshot;
  private runPromise: Promise<OcrTaskSnapshot> | undefined;

  constructor(input: OcrTaskInput, processPage: ProcessOcrPage) {
    if (input.pages.length === 0 || input.pages.length > MAX_COMIC_WORKER_PAGES) {
      throw new Error('OCR task page count exceeds resource limits');
    }
    this.concurrency = clampConcurrency(input.concurrency);
    this.maxAttempts = clampAttempts(input.maxAttempts ?? input.initialSnapshot?.maxAttempts);
    this.processPage = processPage;
    this.snapshot = this.createSnapshot(input);
  }

  private createSnapshot(input: OcrTaskInput): OcrTaskSnapshot {
    const recovered = input.initialSnapshot
      ? parseOcrTaskSnapshot(input.initialSnapshot)
      : undefined;
    if (recovered) {
      const identity: Array<[string, string | undefined, string | undefined]> = [
        ['id', recovered.id, input.id],
        ['bookHash', recovered.bookHash, input.bookHash],
        ['sourceFormat', recovered.sourceFormat, input.sourceFormat],
        ['engine', recovered.engine, input.engine],
        ['engineVersion', recovered.engineVersion, input.engineVersion],
        ['modelId', recovered.modelId, input.modelId],
      ];
      const mismatch = identity.find(([, previous, current]) => previous !== current);
      if (mismatch) throw new Error(`OCR task identity changed: ${mismatch[0]}`);
    }
    const previous = new Map(recovered?.items.map((item) => [item.id, item]) ?? []);
    const items = input.pages.map((page) => {
      const item: OcrTaskItem = {
        id: `${input.id}:${page.pageIndex}:${page.pageId}`,
        pageIndex: page.pageIndex,
        page: { ...page },
        status: 'pending',
        attempts: 0,
      };
      const old = previous.get(item.id);
      if (!old) return item;
      if (!samePage(item, old)) throw new Error(`OCR task source page changed: ${item.id}`);
      if (old.status === 'running' || old.status === 'cancelled') {
        return { ...item, attempts: old.attempts, status: 'pending' as const };
      }
      return {
        ...item,
        status: old.status as OcrTaskItemStatus,
        attempts: old.attempts,
        ...(old.result ? { result: old.result } : {}),
        ...(old.error ? { error: old.error } : {}),
      };
    });
    const recoveredStatus = recovered?.status ?? 'queued';
    const status: OcrTaskStatus =
      recoveredStatus === 'running'
        ? 'paused'
        : recoveredStatus === 'cancelled' && items.some((item) => item.status === 'pending')
          ? 'queued'
          : recoveredStatus;
    const snapshot: OcrTaskSnapshot = {
      id: input.id,
      bookHash: input.bookHash,
      sourceFormat: input.sourceFormat,
      engine: input.engine,
      engineVersion: input.engineVersion,
      ...(input.modelId ? { modelId: input.modelId } : {}),
      status:
        status === 'completed' && items.some((item) => item.status === 'pending')
          ? 'paused'
          : status,
      total: items.length,
      completed: 0,
      failed: 0,
      cancelled: 0,
      maxAttempts: this.maxAttempts,
      updatedAt: Date.now(),
      ...(recovered ? { recovered: true } : {}),
      items,
    };
    this.snapshot = snapshot;
    this.updateCounts();
    return snapshot;
  }

  getSnapshot(): OcrTaskSnapshot {
    return { ...this.snapshot, items: this.snapshot.items.map(copyItem) };
  }

  subscribe(listener: OcrTaskListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  start(): Promise<OcrTaskSnapshot> {
    if (this.snapshot.status === 'completed' || this.snapshot.status === 'failed') {
      return Promise.resolve(this.getSnapshot());
    }
    if (this.snapshot.status === 'cancelled') return Promise.resolve(this.getSnapshot());
    if (this.runPromise) return this.runPromise;
    this.setStatus('running');
    const run = this.drain();
    this.runPromise = run;
    void run.then(() => {
      if (this.runPromise === run) this.runPromise = undefined;
    });
    return run;
  }

  pause(): void {
    if (this.snapshot.status === 'queued' || this.snapshot.status === 'running') {
      this.setStatus('paused');
    }
  }

  resume(): Promise<OcrTaskSnapshot> {
    if (this.snapshot.status === 'paused') {
      if (this.runPromise) {
        return this.runPromise.then(() =>
          this.snapshot.status === 'paused' ? this.start() : this.getSnapshot(),
        );
      }
      return this.start();
    }
    return Promise.resolve(this.getSnapshot());
  }

  retryFailed(): Promise<OcrTaskSnapshot> {
    if (this.snapshot.status === 'running' || this.snapshot.status === 'queued') {
      return Promise.resolve(this.getSnapshot());
    }
    for (const item of this.snapshot.items) {
      if (item.status !== 'failed') continue;
      item.status = 'pending';
      item.attempts = 0;
      delete item.error;
      delete item.result;
    }
    if (this.snapshot.items.some((item) => item.status === 'pending')) {
      this.setStatus('queued');
      return this.start();
    }
    return Promise.resolve(this.getSnapshot());
  }

  cancel(): void {
    if (['completed', 'failed', 'cancelled'].includes(this.snapshot.status)) return;
    this.controller.abort();
    for (const item of this.snapshot.items) {
      if (item.status === 'pending' || item.status === 'running') {
        item.status = 'cancelled';
        delete item.error;
        delete item.result;
      }
    }
    this.setStatus('cancelled');
  }

  private setStatus(status: OcrTaskStatus): void {
    this.snapshot.status = status;
    this.snapshot.updatedAt = Date.now();
    this.emit();
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  private updateCounts(): void {
    this.snapshot.completed = this.snapshot.items.filter(
      (item) => item.status === 'completed',
    ).length;
    this.snapshot.failed = this.snapshot.items.filter((item) => item.status === 'failed').length;
    this.snapshot.cancelled = this.snapshot.items.filter(
      (item) => item.status === 'cancelled',
    ).length;
    this.snapshot.updatedAt = Date.now();
  }

  private takePending(): OcrTaskItem | undefined {
    return this.snapshot.items.find((item) => item.status === 'pending');
  }

  private async worker(): Promise<void> {
    while (this.snapshot.status === 'running' && !this.controller.signal.aborted) {
      const item = this.takePending();
      if (!item) return;
      item.status = 'running';
      item.attempts += 1;
      delete item.error;
      this.emit();
      try {
        const result = await this.processPage(copyItem(item), this.controller.signal);
        if (this.controller.signal.aborted || this.isCancelled()) {
          item.status = 'cancelled';
          delete item.result;
        } else if (
          result.pageId !== item.page.pageId ||
          result.width !== item.page.width ||
          result.height !== item.page.height
        ) {
          item.status = 'failed';
          item.error = 'OCR worker returned a different page identity';
        } else {
          item.status =
            result.status === 'failed'
              ? 'failed'
              : result.status === 'cancelled'
                ? 'cancelled'
                : 'completed';
          item.result = result;
          if (result.error) item.error = result.error;
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
      this.updateCounts();
      this.emit();
    }
  }

  private async drain(): Promise<OcrTaskSnapshot> {
    await Promise.all(Array.from({ length: this.concurrency }, () => this.worker()));
    if (this.snapshot.status === 'cancelled') {
      this.updateCounts();
      this.emit();
      return this.getSnapshot();
    }
    if (this.snapshot.status === 'paused') return this.getSnapshot();
    this.updateCounts();
    this.setStatus(this.snapshot.failed > 0 ? 'failed' : 'completed');
    return this.getSnapshot();
  }

  private isCancelled(): boolean {
    return this.snapshot.status === 'cancelled';
  }
}

export interface OcrSidecarCheckpoint {
  save(sidecar: OcrSidecar): Promise<void>;
}

export interface OcrTaskCheckpoint {
  save(snapshot: OcrTaskSnapshot): Promise<void>;
}

/** Couples the queue to a durable OCR sidecar and restart snapshot. */
export class OcrTaskController {
  private readonly queue: OcrTaskQueue;
  private readonly sidecarCheckpoint?: OcrSidecarCheckpoint;
  private readonly taskCheckpoint?: OcrTaskCheckpoint;
  private sidecar: OcrSidecar;
  private sidecarFlush = Promise.resolve();
  private taskFlush = Promise.resolve();
  private pendingSidecar?: OcrSidecar;
  private pendingTask?: OcrTaskSnapshot;
  private sidecarScheduled = false;
  private taskScheduled = false;

  constructor(input: {
    sidecar: OcrSidecar;
    pages: OcrTaskInput['pages'];
    processPage: ProcessOcrPage;
    sidecarCheckpoint?: OcrSidecarCheckpoint;
    taskCheckpoint?: OcrTaskCheckpoint;
    initialSnapshot?: OcrTaskSnapshot;
    concurrency?: number;
    maxAttempts?: number;
  }) {
    this.sidecar = input.sidecar;
    this.sidecarCheckpoint = input.sidecarCheckpoint;
    this.taskCheckpoint = input.taskCheckpoint;
    this.queue = new OcrTaskQueue(
      {
        id: `${input.sidecar.bookHash}:ocr`,
        bookHash: input.sidecar.bookHash,
        sourceFormat: input.sidecar.sourceFormat,
        engine: input.sidecar.engine,
        engineVersion: input.sidecar.engineVersion,
        ...(input.sidecar.modelId ? { modelId: input.sidecar.modelId } : {}),
        pages: input.pages,
        concurrency: input.concurrency,
        maxAttempts: input.maxAttempts,
        initialSnapshot: input.initialSnapshot,
      },
      input.processPage,
    );
    this.queue.subscribe((snapshot) => {
      this.pendingTask = snapshot;
      this.scheduleTaskCheckpoint();
      const completed = snapshot.items.filter(
        (item) =>
          item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled',
      );
      if (completed.length === 0) return;
      let next = this.sidecar;
      for (const item of completed) {
        const page = next.pages.find((candidate) => candidate.pageId === item.page.pageId);
        if (!page) continue;
        const result = item.result;
        if (result) {
          next = mergeOcrWorkerResult(
            next,
            { bookHash: next.bookHash, pages: [result] },
            snapshot.updatedAt,
          );
        } else if (item.status === 'failed' || item.status === 'cancelled') {
          next = upsertOcrPage(
            next,
            {
              ...page,
              status: item.status,
              regions: [],
              ...(item.status === 'failed' ? { error: item.error ?? 'OCR page failed' } : {}),
              ...(item.status === 'cancelled' ? { error: undefined } : {}),
              updatedAt: snapshot.updatedAt,
            },
            snapshot.updatedAt,
          );
        }
      }
      this.sidecar = next;
      this.pendingSidecar = next;
      this.scheduleSidecarCheckpoint();
    });
  }

  getSnapshot(): OcrTaskSnapshot {
    return this.queue.getSnapshot();
  }

  getSidecar(): OcrSidecar {
    return {
      ...this.sidecar,
      pages: this.sidecar.pages.map((page) => ({
        ...page,
        regions: page.regions.map((region) => ({ ...region })),
      })),
    };
  }

  subscribe(listener: OcrTaskListener): () => void {
    return this.queue.subscribe(listener);
  }

  start(): Promise<OcrTaskSnapshot> {
    return this.queue.start().then(async (snapshot) => {
      await this.flush();
      return snapshot;
    });
  }

  pause(): void {
    this.queue.pause();
  }

  resume(): Promise<OcrTaskSnapshot> {
    return this.queue.resume().then(async (snapshot) => {
      await this.flush();
      return snapshot;
    });
  }

  retryFailed(): Promise<OcrTaskSnapshot> {
    return this.queue.retryFailed().then(async (snapshot) => {
      await this.flush();
      return snapshot;
    });
  }

  cancel(): void {
    this.queue.cancel();
  }

  async flush(): Promise<void> {
    await Promise.all([this.sidecarFlush, this.taskFlush]);
  }

  private scheduleSidecarCheckpoint(): void {
    if (!this.sidecarCheckpoint || !this.pendingSidecar || this.sidecarScheduled) return;
    this.sidecarScheduled = true;
    this.sidecarFlush = this.sidecarFlush
      .then(async () => {
        while (this.pendingSidecar) {
          const next = this.pendingSidecar;
          this.pendingSidecar = undefined;
          await this.sidecarCheckpoint!.save(next);
        }
      })
      .finally(() => {
        this.sidecarScheduled = false;
      });
  }

  private scheduleTaskCheckpoint(): void {
    if (!this.taskCheckpoint || !this.pendingTask || this.taskScheduled) return;
    this.taskScheduled = true;
    this.taskFlush = this.taskFlush
      .then(async () => {
        while (this.pendingTask) {
          const next = this.pendingTask;
          this.pendingTask = undefined;
          await this.taskCheckpoint!.save(next);
        }
      })
      .finally(() => {
        this.taskScheduled = false;
      });
  }
}
