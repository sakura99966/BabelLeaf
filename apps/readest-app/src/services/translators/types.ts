import type { TranslatorName } from './providers';

export interface TranslationProvider {
  name: string;
  label: string;
  /**
   * Marks a provider as temporarily unavailable. Availability checks and
   * fallback selection skip disabled providers while the registry remains
   * stable for settings migration and display.
   */
  disabled?: boolean;
  /** Runtime configuration check. It must not perform a network request. */
  isConfigured?: () => boolean;
  translate: (
    texts: string[],
    sourceLang: string,
    targetLang: string,
    signal?: AbortSignal,
  ) => Promise<string[]>;
}

export interface TranslationCache {
  [key: string]: string;
}

export interface UseTranslatorOptions {
  provider?: TranslatorName;
  sourceLang?: string;
  targetLang?: string;
  enablePolishing?: boolean;
  enablePreprocessing?: boolean;
}

export const ErrorCodes = {
  PROVIDER_NOT_CONFIGURED: 'Translation provider is not configured',
  EMPTY_RESPONSE: 'Translation provider returned an empty response',
};
