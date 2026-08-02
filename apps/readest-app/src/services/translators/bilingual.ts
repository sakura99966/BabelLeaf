import type { TranslationArtifact, TranslationSegment } from './artifacts';

export interface BilingualTranslationPair {
  id: string;
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  status: Extract<TranslationSegment['status'], 'translated' | 'reviewed'>;
  chapterId?: string;
  sourceLocator?: string;
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
    sourceLang: segment.sourceLang,
    targetLang: segment.targetLang,
    status: segment.status,
    ...(segment.chapterId ? { chapterId: segment.chapterId } : {}),
    ...(segment.sourceLocator ? { sourceLocator: segment.sourceLocator } : {}),
  })),
});
