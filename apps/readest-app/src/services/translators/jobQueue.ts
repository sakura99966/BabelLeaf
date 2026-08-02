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
  translatedText?: string;
  status: TranslationJobItemStatus;
  error?: string;
}

export interface TranslationJobSnapshot {
  id: string;
  kind: TranslationJobKind;
  bookHash: string;
  provider: string;
  sourceLang: string;
  targetLang: string;
  status: TranslationJobStatus;
  total: number;
  completed: number;
  failed: number;
  cancelled: number;
  updatedAt: number;
  items: TranslationJobItem[];
}

export interface TranslationJobInput {
  id: string;
  kind: TranslationJobKind;
  bookHash: string;
  provider: string;
  sourceLang: string;
  targetLang: string;
  items: Array<
    Pick<TranslationJobItem, 'id' | 'text'> &
      Partial<Pick<TranslationJobItem, 'chapterId' | 'sourceLocator'>>
  >;
  concurrency?: number;
}

export type TranslateJobItem = (item: TranslationJobItem, signal: AbortSignal) => Promise<string>;

export type TranslationJobListener = (snapshot: TranslationJobSnapshot) => void;

const clampConcurrency = (value: number | undefined): number =>
  Math.max(1, Math.min(4, Math.floor(value ?? 2)));

const errorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;
  return typeof error === 'string' && error ? error : 'Translation failed';
};

const copyItem = (item: TranslationJobItem): TranslationJobItem => ({ ...item });

/**
 * Bounded, pauseable translation work queue. It keeps all state in memory and
 * deliberately delegates persistence to TranslationArtifactStore so a future
 * UI can save checkpoints without coupling the scheduler to a platform.
 */
export class TranslationJobQueue {
  private readonly concurrency: number;
  private readonly translate: TranslateJobItem;
  private readonly controller = new AbortController();
  private readonly listeners = new Set<TranslationJobListener>();
  private snapshot: TranslationJobSnapshot;
  private runPromise: Promise<TranslationJobSnapshot> | undefined;

  constructor(input: TranslationJobInput, translate: TranslateJobItem) {
    this.concurrency = clampConcurrency(input.concurrency);
    this.translate = translate;
    this.snapshot = {
      id: input.id,
      kind: input.kind,
      bookHash: input.bookHash,
      provider: input.provider,
      sourceLang: input.sourceLang,
      targetLang: input.targetLang,
      status: 'queued',
      total: input.items.length,
      completed: 0,
      failed: 0,
      cancelled: 0,
      updatedAt: Date.now(),
      items: input.items.map((item) => ({ ...item, status: 'pending' })),
    };
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
      delete item.error;
      this.updateCounts();
      this.emit();

      try {
        const translatedText = await this.translate(copyItem(item), this.controller.signal);
        if (this.controller.signal.aborted || this.isCancelled()) {
          item.status = 'cancelled';
          delete item.translatedText;
        } else if (!translatedText.trim()) {
          item.status = 'failed';
          item.error = 'Translation provider returned an empty response';
        } else {
          item.status = 'completed';
          item.translatedText = translatedText;
        }
      } catch (error) {
        if (this.controller.signal.aborted || this.isCancelled()) {
          item.status = 'cancelled';
          delete item.error;
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
