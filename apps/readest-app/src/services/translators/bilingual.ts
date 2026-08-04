import type { TranslationArtifact, TranslationSegment } from './artifacts';

export interface BilingualTranslationPair {
  id: string;
  sourceText: string;
  translatedText: string;
  machineTranslatedText?: string;
  sourceLang: string;
  targetLang: string;
  status: TranslationSegment['status'];
  chapterId?: string;
  sourceLocator?: string;
  error?: string;
  provider?: string;
  model?: string;
  glossaryVersion?: number;
}

export interface BilingualTranslationResult {
  bookHash: string;
  sourceLang: string;
  targetLang: string;
  updatedAt: number;
  pairs: BilingualTranslationPair[];
}

const isCompletedSegment = (
  segment: TranslationSegment,
): segment is TranslationSegment & {
  translatedText: string;
  status: 'translated' | 'reviewed';
} =>
  (segment.status === 'translated' || segment.status === 'reviewed') &&
  typeof segment.translatedText === 'string' &&
  segment.translatedText.trim().length > 0;

/**
 * Convert durable segments into an ordered source/translation view model.
 * Source text is always retained verbatim; the renderer decides whether the
 * pair is stacked or shown side by side.
 */
export const toBilingualTranslationResult = (
  artifact: TranslationArtifact,
): BilingualTranslationResult => ({
  bookHash: artifact.bookHash,
  sourceLang: artifact.sourceLang,
  targetLang: artifact.targetLang,
  updatedAt: artifact.updatedAt,
  pairs: artifact.segments.filter(isCompletedSegment).map((segment) => ({
    id: segment.id,
    sourceText: segment.sourceText,
    translatedText: segment.translatedText,
    ...(segment.machineTranslatedText
      ? { machineTranslatedText: segment.machineTranslatedText }
      : {}),
    sourceLang: segment.sourceLang,
    targetLang: segment.targetLang,
    status: segment.status,
    ...(segment.chapterId ? { chapterId: segment.chapterId } : {}),
    ...(segment.sourceLocator ? { sourceLocator: segment.sourceLocator } : {}),
    ...(segment.error ? { error: segment.error } : {}),
    ...(artifact.provider ? { provider: artifact.provider } : {}),
    ...(artifact.model ? { model: artifact.model } : {}),
    ...(artifact.glossaryVersion === undefined
      ? {}
      : { glossaryVersion: artifact.glossaryVersion }),
  })),
});

/** Convert every durable segment into the review workspace view model. */
export const toTranslationReviewPairs = (
  artifact: TranslationArtifact,
): BilingualTranslationPair[] =>
  artifact.segments.map((segment) => ({
    id: segment.id,
    sourceText: segment.sourceText,
    translatedText: segment.translatedText ?? '',
    ...(segment.machineTranslatedText
      ? { machineTranslatedText: segment.machineTranslatedText }
      : {}),
    sourceLang: segment.sourceLang,
    targetLang: segment.targetLang,
    status: segment.status,
    ...(segment.chapterId ? { chapterId: segment.chapterId } : {}),
    ...(segment.sourceLocator ? { sourceLocator: segment.sourceLocator } : {}),
    ...(segment.error ? { error: segment.error } : {}),
    ...(artifact.provider ? { provider: artifact.provider } : {}),
    ...(artifact.model ? { model: artifact.model } : {}),
    ...(artifact.glossaryVersion === undefined
      ? {}
      : { glossaryVersion: artifact.glossaryVersion }),
  }));
