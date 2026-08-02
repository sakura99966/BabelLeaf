import type { BookDoc } from '@/libs/document';
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

export const MAX_TRANSLATION_SEGMENT_CHARS = 2400;
export const MAX_TRANSLATION_BATCH_SEGMENTS = 5000;

export interface ExtractTranslationItemsOptions {
  maxChars?: number;
  maxSegments?: number;
  sectionIndices?: number[];
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
  return textFromDocument(await section.createDocument());
};

/** Extract bounded, stable segment IDs without mutating the source book. */
export const extractTranslationItems = async (
  book: BookDoc,
  options: ExtractTranslationItemsOptions = {},
): Promise<TranslationJobItem[]> => {
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
    const blocks = await loadSectionBlocks(section);
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
        });
      }
    }
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
  concurrency?: number;
}

/**
 * Couples the bounded queue to durable checkpoints. A failed item is retained
 * as a retryable artifact record, while source text is never overwritten.
 */
export class TranslationBatchController {
  private readonly queue: TranslationJobQueue;
  private readonly artifactStore?: TranslationArtifactStore;
  private artifact: TranslationArtifact;
  private checkpoint = Promise.resolve();
  private readonly persisted = new Map<string, string>();

  constructor(input: TranslationBatchControllerInput) {
    this.artifact = input.artifact;
    this.artifactStore = input.artifactStore;
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
      id: `translation-${this.artifact.bookHash}-${this.artifact.targetLang}-${input.kind ?? 'book'}`,
      kind: input.kind ?? 'book',
      bookHash: this.artifact.bookHash,
      provider: this.artifact.provider,
      sourceLang: this.artifact.sourceLang,
      targetLang: this.artifact.targetLang,
      concurrency: input.concurrency,
      items: pendingItems,
    };
    this.queue = new TranslationJobQueue(queueInput, input.translate);
    this.queue.subscribe((snapshot) => this.scheduleCheckpoint(snapshot));
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

  cancel(): void {
    this.queue.cancel();
  }

  async flush(): Promise<void> {
    await this.checkpoint;
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

    this.checkpoint = this.checkpoint.then(async () => {
      const incoming: TranslationSegment[] = changedItems.map((item) => ({
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
      }));
      this.artifact = upsertTranslationSegments(this.artifact, incoming, snapshot.updatedAt);
      await this.artifactStore?.save(this.artifact);
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
