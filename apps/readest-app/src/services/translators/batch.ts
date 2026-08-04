import type { BookDoc } from '@/libs/document';
import type { BookFormat } from '@/types/book';
import {
  createTranslationArtifact,
  type TranslationArtifact,
  TranslationArtifactStore,
  type TranslationSegment,
  upsertTranslationSegments,
} from './artifacts';
import {
  TranslationJobQueue,
  type TranslationJobInput,
  type TranslationJobKind,
  type TranslationJobItem,
  type TranslationJobListener,
  type TranslationJobSnapshot,
  type TranslateJobItem,
} from './jobQueue';
import { TranslationJobStore } from './jobStore';
import {
  getApplicableGlossaryEntries,
  protectGlossaryTerms,
  restoreGlossaryTerms,
  type TranslationGlossary,
} from './glossary';
import { TranslationMemory, type TranslationMemoryQuery } from './memory';
import { isTranslationDRMError } from './diagnostics';

export const MAX_TRANSLATION_SEGMENT_CHARS = 2400;
export const MAX_TRANSLATION_BATCH_SEGMENTS = 5000;

export const getTranslationJobId = (
  artifact: Pick<TranslationArtifact, 'bookHash' | 'provider' | 'targetLang'>,
  kind: TranslationJobKind,
): string => `translation-${artifact.bookHash}-${artifact.provider}-${artifact.targetLang}-${kind}`;

export interface ExtractTranslationItemsOptions {
  maxChars?: number;
  maxSegments?: number;
  sectionIndices?: number[];
  format?: BookFormat;
}

const normalizeText = (value: string): string =>
  value
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const splitLongText = (value: string, maxChars: number): string[] => {
  if (value.length <= maxChars) return [value];
  const chunks: string[] = [];
  let remaining = value;
  while (remaining.length > maxChars) {
    const candidate = remaining.slice(0, maxChars + 1);
    const breakAt = Math.max(candidate.lastIndexOf(' '), candidate.lastIndexOf('\n'));
    const splitAt = breakAt > Math.floor(maxChars * 0.6) ? breakAt : maxChars;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks.filter(Boolean);
};

const TEXT_BLOCK_SELECTOR = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,dt,dd';

const readTextBlocks = (root: Element): string[] =>
  Array.from(root.querySelectorAll(TEXT_BLOCK_SELECTOR))
    // Avoid translating both a blockquote/list item and every nested paragraph.
    .filter((node) => !node.parentElement?.closest(TEXT_BLOCK_SELECTOR))
    .map((node) => normalizeText(node.textContent || ''))
    .filter(Boolean);

const textFromHtml = (html: string): string[] => {
  if (typeof DOMParser === 'undefined') return [normalizeText(html.replace(/<[^>]+>/g, ' '))];
  const document = new DOMParser().parseFromString(html, 'text/html');
  document.querySelectorAll('script,style,noscript,template').forEach((node) => node.remove());
  const blocks = readTextBlocks(document.body);
  if (blocks.length > 0) return blocks;
  return [normalizeText(document.body.textContent || '')].filter(Boolean);
};

const textFromDocument = (document: Document): string[] => {
  document.querySelectorAll('script,style,noscript,template').forEach((node) => node.remove());
  const blocks = document.body ? readTextBlocks(document.body) : [];
  if (blocks.length > 0) return blocks;
  return [normalizeText(document.body?.textContent || '')].filter(Boolean);
};

const loadSectionBlocks = async (section: BookDoc['sections'][number]): Promise<string[]> => {
  if (section.loadText) {
    const text = await section.loadText();
    return text ? textFromHtml(text) : [];
  }
  // Comic readers expose image-page `load()` methods rather than a text
  // document. Treat those pages as empty text so the format diagnostic can
  // report the OCR boundary instead of leaking a TypeError.
  if (typeof section.createDocument !== 'function') return [];
  return textFromDocument(await section.createDocument());
};

/** Extract bounded, stable segment IDs without mutating the source book. */
export class TranslationExtractionError extends Error {
  constructor(
    public readonly code: 'image-only' | 'empty-text' | 'drm' | 'unsupported',
    message: string,
  ) {
    super(message);
    this.name = 'TranslationExtractionError';
  }
}

export const extractTranslationItems = async (
  book: BookDoc,
  options: ExtractTranslationItemsOptions = {},
): Promise<TranslationJobItem[]> => {
  if (options.format === 'CBZ' || options.format === 'FBZ') {
    throw new TranslationExtractionError(
      'image-only',
      'This comic archive contains images only; selectable text is not available for batch translation.',
    );
  }
  const maxChars = Math.max(200, Math.floor(options.maxChars ?? MAX_TRANSLATION_SEGMENT_CHARS));
  const maxSegments = Math.max(
    1,
    Math.floor(options.maxSegments ?? MAX_TRANSLATION_BATCH_SEGMENTS),
  );
  const items: TranslationJobItem[] = [];

  for (const [sectionIndex, section] of book.sections.entries()) {
    if (options.sectionIndices && !options.sectionIndices.includes(sectionIndex)) continue;
    if (section.linear === 'no') continue;
    const chapterId = section.id || `section-${sectionIndex}`;
    let blocks: string[];
    try {
      blocks = await loadSectionBlocks(section);
    } catch (error) {
      if (isTranslationDRMError(error)) {
        throw new TranslationExtractionError(
          'drm',
          'This book is encrypted or DRM-protected and cannot be translated locally.',
        );
      }
      throw error;
    }
    let segmentIndex = 0;
    for (const block of blocks) {
      for (const text of splitLongText(block, maxChars)) {
        if (items.length >= maxSegments) return items;
        items.push({
          id: `${chapterId}:${segmentIndex++}`,
          text,
          chapterId,
          ...(section.cfi ? { sourceLocator: section.cfi } : {}),
          status: 'pending',
          attempts: 0,
        });
      }
    }
  }
  if (items.length === 0 && options.format) {
    throw new TranslationExtractionError(
      'empty-text',
      'No selectable text was found. Scanned or image-only documents require OCR before translation.',
    );
  }
  return items;
};

export interface TranslationBatchControllerInput {
  artifact: TranslationArtifact;
  kind?: TranslationJobKind;
  items: Array<
    Pick<TranslationJobItem, 'id' | 'text'> &
      Partial<Pick<TranslationJobItem, 'chapterId' | 'sourceLocator'>>
  >;
  translate: TranslateJobItem;
  artifactStore?: TranslationArtifactStore;
  jobStore?: TranslationJobStore;
  initialJobSnapshot?: TranslationJobSnapshot;
  glossary?: TranslationGlossary | null;
  translationMemory?: TranslationMemory;
  maxAttempts?: number;
  model?: string;
  concurrency?: number;
}

/**
 * Couples the bounded queue to durable checkpoints. A failed item is retained
 * as a retryable artifact record, while source text is never overwritten.
 */
export class TranslationBatchController {
  private readonly queue: TranslationJobQueue;
  private readonly artifactStore?: TranslationArtifactStore;
  private readonly jobStore?: TranslationJobStore;
  private artifact: TranslationArtifact;
  private checkpoint = Promise.resolve();
  private jobCheckpoint = Promise.resolve();
  private readonly persisted = new Map<string, string>();
  private readonly pendingSegments = new Map<string, TranslationSegment>();
  private pendingJobSnapshot: TranslationJobSnapshot | undefined;
  private artifactCheckpointScheduled = false;
  private jobCheckpointScheduled = false;

  constructor(input: TranslationBatchControllerInput) {
    this.artifact =
      input.model && input.artifact.model !== input.model
        ? { ...input.artifact, model: input.model }
        : input.artifact;
    this.artifactStore = input.artifactStore;
    this.jobStore = input.jobStore;
    const existing = new Map(this.artifact.segments.map((segment) => [segment.id, segment]));
    const pendingItems = input.items.filter((item) => {
      const previous = existing.get(item.id);
      if (previous && previous.sourceText !== item.text) {
        throw new Error(`Translation segment source changed: ${item.id}`);
      }
      return !(
        previous &&
        (previous.status === 'translated' || previous.status === 'reviewed') &&
        Boolean(previous.translatedText?.trim())
      );
    });
    const queueInput: TranslationJobInput = {
      id: getTranslationJobId(this.artifact, input.kind ?? 'book'),
      kind: input.kind ?? 'book',
      bookHash: this.artifact.bookHash,
      provider: this.artifact.provider,
      sourceLang: this.artifact.sourceLang,
      targetLang: this.artifact.targetLang,
      concurrency: input.concurrency,
      maxAttempts: input.maxAttempts,
      initialSnapshot: input.initialJobSnapshot,
      items: pendingItems,
    };
    const glossaryEntries = getApplicableGlossaryEntries(
      input.glossary,
      this.artifact.sourceLang,
      this.artifact.targetLang,
    );
    const translate = async (item: TranslationJobItem, signal: AbortSignal): Promise<string> => {
      const memoryQuery: TranslationMemoryQuery = {
        sourceText: item.text,
        sourceLang: this.artifact.sourceLang,
        targetLang: this.artifact.targetLang,
        provider: this.artifact.provider,
        ...(this.artifact.model ? { model: this.artifact.model } : {}),
        ...(input.glossary ? { glossaryVersion: input.glossary.updatedAt } : {}),
      };
      const memoryHit = input.translationMemory?.lookup(memoryQuery);
      if (memoryHit) return memoryHit;

      const protectedText = protectGlossaryTerms(item.text, glossaryEntries);
      const translated = await input.translate({ ...item, text: protectedText.text }, signal);
      const restored = restoreGlossaryTerms(translated, protectedText.bindings);
      await input.translationMemory?.remember(memoryQuery, restored);
      return restored;
    };
    this.queue = new TranslationJobQueue(queueInput, translate);
    this.queue.subscribe((snapshot) => {
      this.scheduleCheckpoint(snapshot);
      this.scheduleJobCheckpoint(snapshot);
    });
  }

  static async restore(
    input: TranslationBatchControllerInput & { jobStore: TranslationJobStore },
  ): Promise<TranslationBatchController> {
    const kind = input.kind ?? 'book';
    const jobId = getTranslationJobId(input.artifact, kind);
    const initialJobSnapshot = (await input.jobStore.load(jobId)) ?? undefined;
    return new TranslationBatchController({ ...input, initialJobSnapshot });
  }

  getSnapshot(): TranslationJobSnapshot {
    return this.queue.getSnapshot();
  }

  getArtifact(): TranslationArtifact {
    return {
      ...this.artifact,
      segments: this.artifact.segments.map((segment) => ({ ...segment })),
    };
  }

  subscribe(listener: TranslationJobListener): () => void {
    return this.queue.subscribe(listener);
  }

  async start(): Promise<TranslationJobSnapshot> {
    await this.artifactStore?.save(this.artifact);
    const result = await this.queue.start();
    await this.flush();
    return result;
  }

  pause(): void {
    this.queue.pause();
  }

  async resume(): Promise<TranslationJobSnapshot> {
    const result = await this.queue.resume();
    await this.flush();
    return result;
  }

  async retryFailed(): Promise<TranslationJobSnapshot> {
    const result = await this.queue.retryFailed();
    await this.flush();
    return result;
  }

  cancel(): void {
    this.queue.cancel();
  }

  async flush(): Promise<void> {
    await Promise.all([this.checkpoint, this.jobCheckpoint]);
  }

  async reviewSegment(id: string, translatedText: string): Promise<TranslationArtifact> {
    const segment = this.artifact.segments.find((candidate) => candidate.id === id);
    if (!segment) throw new Error(`Translation segment not found: ${id}`);
    if (!translatedText.trim()) throw new Error('Reviewed translation cannot be empty');
    this.artifact = upsertTranslationSegments(
      this.artifact,
      [
        {
          ...segment,
          translatedText: translatedText.trim(),
          status: 'reviewed',
          error: undefined,
          updatedAt: Date.now(),
        },
      ],
      Date.now(),
    );
    await this.artifactStore?.save(this.artifact);
    return this.getArtifact();
  }

  private scheduleCheckpoint(snapshot: TranslationJobSnapshot): void {
    const terminalItems = snapshot.items.filter(
      (item) => item.status === 'completed' || item.status === 'failed',
    );
    const changedItems = terminalItems.filter((item) => {
      const state = `${item.status}:${item.translatedText ?? ''}:${item.error ?? ''}`;
      if (this.persisted.get(item.id) === state) return false;
      this.persisted.set(item.id, state);
      return true;
    });
    if (changedItems.length === 0) return;

    for (const item of changedItems) {
      this.pendingSegments.set(item.id, {
        id: item.id,
        sourceText: item.text,
        sourceLang: this.artifact.sourceLang,
        targetLang: this.artifact.targetLang,
        status: item.status === 'completed' ? 'translated' : 'failed',
        ...(item.translatedText ? { translatedText: item.translatedText } : {}),
        ...(item.error ? { error: item.error } : {}),
        ...(item.chapterId ? { chapterId: item.chapterId } : {}),
        ...(item.sourceLocator ? { sourceLocator: item.sourceLocator } : {}),
        updatedAt: snapshot.updatedAt,
      });
    }
    if (this.artifactCheckpointScheduled) return;
    this.artifactCheckpointScheduled = true;
    this.checkpoint = this.checkpoint
      .then(async () => {
        while (this.pendingSegments.size > 0) {
          const incoming = Array.from(this.pendingSegments.values());
          this.pendingSegments.clear();
          const now = Date.now();
          this.artifact = upsertTranslationSegments(this.artifact, incoming, now);
          await this.artifactStore?.save(this.artifact);
        }
      })
      .finally(() => {
        this.artifactCheckpointScheduled = false;
      });
  }

  private scheduleJobCheckpoint(snapshot: TranslationJobSnapshot): void {
    if (!this.jobStore) return;
    this.pendingJobSnapshot = {
      ...snapshot,
      items: snapshot.items.map((item) => ({ ...item })),
    };
    if (this.jobCheckpointScheduled) return;
    this.jobCheckpointScheduled = true;
    this.jobCheckpoint = this.jobCheckpoint
      .then(async () => {
        while (this.pendingJobSnapshot) {
          const next = this.pendingJobSnapshot;
          this.pendingJobSnapshot = undefined;
          await this.jobStore!.save(next);
        }
      })
      .finally(() => {
        this.jobCheckpointScheduled = false;
      });
  }
}

export const createEmptyTranslationArtifact = (input: {
  bookHash: string;
  provider: string;
  sourceLang: string;
  targetLang: string;
  sourceFingerprint?: string;
  model?: string;
  promptVersion: string;
}): TranslationArtifact => createTranslationArtifact(input);
