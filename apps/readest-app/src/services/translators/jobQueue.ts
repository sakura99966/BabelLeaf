import type { TranslationSourceAnchor } from './anchors';

export type TranslationJobKind = 'chapter' | 'book';
export type TranslationJobStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';
export type TranslationJobItemStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export interface TranslationJobItem {
  id: string;
  text: string;
  chapterId?: string;
  sourceLocator?: string;
  sourceAnchor?: TranslationSourceAnchor;
  translatedText?: string;
  status: TranslationJobItemStatus;
  attempts: number;
  error?: string;
}

export interface TranslationJobSnapshot {
  id: string;
  kind: TranslationJobKind;
  bookHash: string;
  /** Optional display metadata; older persisted jobs do not contain it. */
  bookTitle?: string;
  /** Set when the snapshot was reconstructed from a previous process run. */
  recovered?: boolean;
  provider: string;
  sourceLang: string;
  targetLang: string;
  status: TranslationJobStatus;
  total: number;
  completed: number;
  failed: number;
  cancelled: number;
  maxAttempts: number;
  updatedAt: number;
  items: TranslationJobItem[];
}

export interface TranslationJobInput {
  id: string;
  kind: TranslationJobKind;
  bookHash: string;
  bookTitle?: string;
  provider: string;
  sourceLang: string;
  targetLang: string;
  items: Array<
    Pick<TranslationJobItem, 'id' | 'text'> &
      Partial<Pick<TranslationJobItem, 'chapterId' | 'sourceLocator' | 'sourceAnchor'>>
  >;
  concurrency?: number;
  /** Maximum provider attempts for one item. Defaults to one. */
  maxAttempts?: number;
  /** A durable snapshot recovered after an interrupted application run. */
  initialSnapshot?: TranslationJobSnapshot;
}

export type TranslateJobItem = (item: TranslationJobItem, signal: AbortSignal) => Promise<string>;

export type TranslationJobListener = (snapshot: TranslationJobSnapshot) => void;

const clampConcurrency = (value: number | undefined): number =>
  Math.max(1, Math.min(4, Math.floor(value ?? 2)));

const clampAttempts = (value: number | undefined): number =>
  Math.max(1, Math.min(5, Math.floor(value ?? 1)));

const errorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  return typeof error === 'string' && error ? error : 'Translation failed';
};

const copyItem = (item: TranslationJobItem): TranslationJobItem => ({ ...item });

/**
 * Bounded, pauseable translation work queue. The queue is platform agnostic;
 * callers can persist the emitted snapshots through TranslationJobStore.
 */
export class TranslationJobQueue {
  private readonly concurrency: number;
  private readonly maxAttempts: number;
  private readonly translate: TranslateJobItem;
  private readonly controller = new AbortController();
  private readonly listeners = new Set<TranslationJobListener>();
  private snapshot: TranslationJobSnapshot;
  private runPromise: Promise<TranslationJobSnapshot> | undefined;

  constructor(input: TranslationJobInput, translate: TranslateJobItem) {
    this.concurrency = clampConcurrency(input.concurrency);
    this.maxAttempts = clampAttempts(input.maxAttempts ?? input.initialSnapshot?.maxAttempts);
    this.translate = translate;
    this.snapshot = this.createSnapshot(input);
  }

  private createSnapshot(input: TranslationJobInput): TranslationJobSnapshot {
    const recovered = input.initialSnapshot;
    if (recovered) {
      const identity = [
        ['id', recovered.id, input.id],
        ['kind', recovered.kind, input.kind],
        ['bookHash', recovered.bookHash, input.bookHash],
        ['provider', recovered.provider, input.provider],
        ['sourceLang', recovered.sourceLang, input.sourceLang],
        ['targetLang', recovered.targetLang, input.targetLang],
      ] as const;
      const mismatch = identity.find(([, previous, current]) => previous !== current);
      if (mismatch) {
        throw new Error(`Translation job identity changed: ${mismatch[0]}`);
      }
    }
    const recoveredItems = new Map(recovered?.items.map((item) => [item.id, item]) ?? []);
    const items = input.items.map((item) => {
      const previous = recoveredItems.get(item.id);
      if (previous && previous.text !== item.text) {
        throw new Error(`Translation job source changed: ${item.id}`);
      }
      if (!previous) {
        return { ...item, status: 'pending' as const, attempts: 0 };
      }

      // A process interrupted while an item was running must be retried. A
      // completed or failed item remains durable and can be explicitly retried.
      if (previous.status === 'running') {
        return {
          ...item,
          status: 'pending' as const,
          attempts: previous.attempts ?? 0,
          error: undefined,
          translatedText: undefined,
        };
      }
      if (previous.status === 'cancelled') {
        return {
          ...item,
          status: 'pending' as const,
          attempts: 0,
          error: undefined,
          translatedText: undefined,
        };
      }
      return {
        ...item,
        status: previous.status,
        attempts: previous.attempts ?? 0,
        ...(previous.translatedText ? { translatedText: previous.translatedText } : {}),
        ...(previous.error ? { error: previous.error } : {}),
      };
    });
    const recoveredStatus = recovered?.status ?? 'queued';
    const status =
      recoveredStatus === 'running'
        ? 'paused'
        : recoveredStatus === 'cancelled' && items.some((item) => item.status === 'pending')
          ? 'queued'
          : recoveredStatus;
    const snapshot: TranslationJobSnapshot = {
      id: input.id,
      kind: input.kind,
      bookHash: input.bookHash,
      ...(input.bookTitle ? { bookTitle: input.bookTitle } : {}),
      ...(recovered ? { recovered: true } : {}),
      provider: input.provider,
      sourceLang: input.sourceLang,
      targetLang: input.targetLang,
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
      items,
    };
    this.snapshot = snapshot;
    this.updateCounts();
    return snapshot;
  }

  getSnapshot(): TranslationJobSnapshot {
    return {
      ...this.snapshot,
      items: this.snapshot.items.map(copyItem),
    };
  }

  subscribe(listener: TranslationJobListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  start(): Promise<TranslationJobSnapshot> {
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

  resume(): Promise<TranslationJobSnapshot> {
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

  /** Requeue all failed items without touching completed translations. */
  retryFailed(): Promise<TranslationJobSnapshot> {
    return this.retryItems(this.snapshot.items.filter((item) => item.status === 'failed'));
  }

  /** Requeue one failed item, useful for a human-reviewed retry action. */
  retryItem(id: string): Promise<TranslationJobSnapshot> {
    const item = this.snapshot.items.find((candidate) => candidate.id === id);
    return this.retryItems(item ? [item] : []);
  }

  /** Explicitly invalidate completed results before a user-requested rerun. */
  invalidateCompleted(): void {
    if (this.snapshot.status === 'running' || this.snapshot.status === 'queued') return;
    let invalidated = false;
    for (const item of this.snapshot.items) {
      if (item.status !== 'completed') continue;
      item.status = 'pending';
      item.attempts = 0;
      delete item.error;
      delete item.translatedText;
      invalidated = true;
    }
    if (invalidated) this.setStatus('queued');
  }

  private retryItems(items: TranslationJobItem[]): Promise<TranslationJobSnapshot> {
    if (this.snapshot.status === 'running' || this.snapshot.status === 'queued') {
      return Promise.resolve(this.getSnapshot());
    }
    for (const item of items) {
      if (item.status !== 'failed') continue;
      item.status = 'pending';
      item.attempts = 0;
      delete item.error;
      delete item.translatedText;
    }
    if (items.some((item) => item.status === 'pending')) {
      this.setStatus('queued');
      return this.start();
    }
    return Promise.resolve(this.getSnapshot());
  }

  cancel(): void {
    if (
      this.snapshot.status === 'completed' ||
      this.snapshot.status === 'failed' ||
      this.snapshot.status === 'cancelled'
    ) {
      return;
    }

    this.controller.abort();
    for (const item of this.snapshot.items) {
      if (item.status === 'pending' || item.status === 'running') {
        item.status = 'cancelled';
        delete item.error;
        delete item.translatedText;
      }
    }
    this.setStatus('cancelled');
  }

  private setStatus(status: TranslationJobStatus): void {
    this.snapshot.status = status;
    this.snapshot.updatedAt = Date.now();
    this.emit();
  }

  private emit(): void {
    const current = this.getSnapshot();
    for (const listener of this.listeners) listener(current);
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

  private takePending(): TranslationJobItem | undefined {
    return this.snapshot.items.find((item) => item.status === 'pending');
  }

  private isCancelled(): boolean {
    return this.snapshot.status === 'cancelled';
  }

  private async worker(): Promise<void> {
    while (this.snapshot.status === 'running' && !this.controller.signal.aborted) {
      const item = this.takePending();
      if (!item) return;

      item.status = 'running';
      item.attempts += 1;
      delete item.error;
      this.updateCounts();
      this.emit();

      try {
        const translatedText = await this.translate(copyItem(item), this.controller.signal);
        if (this.controller.signal.aborted || this.isCancelled()) {
          item.status = 'cancelled';
          delete item.translatedText;
        } else if (!translatedText.trim()) {
          const emptyResponseError = 'Translation provider returned an empty response';
          if (item.attempts < this.maxAttempts) {
            item.status = 'pending';
            item.error = emptyResponseError;
          } else {
            item.status = 'failed';
            item.error = emptyResponseError;
          }
        } else {
          item.status = 'completed';
          item.translatedText = translatedText;
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

  private async drain(): Promise<TranslationJobSnapshot> {
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
}
