import type { TranslationProvider } from '../types';
import {
  anthropicTranslator,
  deepSeekTranslator,
  ollamaTranslator,
  openAITranslator,
  type LLMTranslatorName,
} from './llm';

const availableTranslators = [
  deepSeekTranslator,
  openAITranslator,
  anthropicTranslator,
  ollamaTranslator,
] as const;

export type TranslatorName = LLMTranslatorName;

export const getTranslator = (name: TranslatorName): TranslationProvider | undefined =>
  availableTranslators.find((translator) => translator.name === name);

export const getTranslators = (): TranslationProvider[] => [...availableTranslators];

export const isTranslatorAvailable = (translator: TranslationProvider): boolean => {
  if (translator.disabled) return false;
  if (translator.isConfigured && !translator.isConfigured()) return false;
  return true;
};

export const getTranslatorDisplayLabel = (
  translator: TranslationProvider,
  _: (key: string) => string,
): string => {
  if (translator.disabled) return translator.label;
  if (translator.isConfigured && !translator.isConfigured()) {
    return `${translator.label} (${_('Not configured')})`;
  }
  return translator.label;
};
