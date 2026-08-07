import type { TranslationProvider } from './types';
import {
  getComicRegionSourceText,
  getComicRegionSourceRevision,
  setComicRegionTranslation,
  type ComicRegionTranslation,
  type ComicWorkspace,
} from './comicWorkspace';

export const COMIC_TRANSLATION_PROMPT_VERSION = 'comic-translation-v1';

export interface ComicTranslationRequest {
  workspace: ComicWorkspace;
  pageId: string;
  regionId: string;
  provider: TranslationProvider;
  sourceLang: string;
  targetLang: string;
  model?: string;
  glossaryVersion?: number;
  signal?: AbortSignal;
}

export interface ComicTranslationResult {
  workspace: ComicWorkspace;
  translatedText: string;
}

const ensureConfigured = (provider: TranslationProvider): void => {
  if (provider.isConfigured && !provider.isConfigured()) {
    throw new Error('Translation provider is not configured');
  }
};

const safeErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk|key|token)[-_][A-Za-z0-9._~-]+/gi, '[redacted]')
    .slice(0, 240);
};

/** Persist a provider failure without writing credentials or arbitrary URLs. */
export const recordComicTranslationFailure = (
  request: ComicTranslationRequest,
  error: unknown,
  now = Date.now(),
): ComicWorkspace => {
  const page = request.workspace.pages.find((candidate) => candidate.pageId === request.pageId);
  const region = page?.regions.find((candidate) => candidate.id === request.regionId);
  const sourceText = region ? getComicRegionSourceText(region) : undefined;
  if (!page || !region || !sourceText)
    throw new Error(`Comic region not found: ${request.regionId}`);
  return setComicRegionTranslation(
    request.workspace,
    request.pageId,
    request.regionId,
    {
      sourceText,
      sourceRevision: getComicRegionSourceRevision(region),
      targetLang: request.targetLang,
      status: 'failed',
      provider: request.provider.name,
      ...(request.model ? { model: request.model } : {}),
      promptVersion: COMIC_TRANSLATION_PROMPT_VERSION,
      error: safeErrorMessage(error) || 'Comic translation failed',
      updatedAt: now,
    },
    now,
  );
};

/**
 * Translate exactly one effective OCR/manual region. The caller invokes this
 * function explicitly; it never starts a request during workspace loading or
 * rendering.
 */
export const translateComicRegion = async (
  request: ComicTranslationRequest,
): Promise<ComicTranslationResult> => {
  ensureConfigured(request.provider);
  const page = request.workspace.pages.find((candidate) => candidate.pageId === request.pageId);
  const region = page?.regions.find((candidate) => candidate.id === request.regionId);
  if (!page || !region) throw new Error(`Comic region not found: ${request.regionId}`);
  const sourceText = getComicRegionSourceText(region);
  if (!sourceText) throw new Error('Comic region has no source text');
  if (!request.targetLang.trim()) throw new Error('Comic translation target language is required');
  const translated = await request.provider.translate(
    [sourceText],
    request.sourceLang,
    request.targetLang,
    request.signal,
  );
  const translatedText = translated[0]?.trim();
  if (!translatedText) throw new Error('Translation provider returned an empty response');
  const translation: ComicRegionTranslation = {
    sourceText,
    sourceRevision: getComicRegionSourceRevision(region),
    targetLang: request.targetLang.trim(),
    status: 'translated',
    provider: request.provider.name,
    ...(request.model ? { model: request.model } : {}),
    promptVersion: COMIC_TRANSLATION_PROMPT_VERSION,
    translatedText,
    machineTranslatedText: translatedText,
    ...(request.glossaryVersion === undefined ? {} : { glossaryVersion: request.glossaryVersion }),
    updatedAt: Date.now(),
  };
  return {
    workspace: setComicRegionTranslation(
      request.workspace,
      request.pageId,
      request.regionId,
      translation,
    ),
    translatedText,
  };
};
