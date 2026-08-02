import { generateText } from 'ai';

import { DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import { getAIProvider } from '@/services/ai/providers';
import { getTranslationApiKey } from '@/services/ai/translationApiKey';
import type { AIProviderName, AISettings } from '@/services/ai/types';
import { useSettingsStore } from '@/store/settingsStore';

import { ErrorCodes, type TranslationProvider } from '../types';

export type LLMTranslatorName = Extract<AIProviderName, 'ollama' | 'openrouter'>;

const getSettings = (provider: LLMTranslatorName): AISettings => ({
  ...DEFAULT_AI_SETTINGS,
  ...useSettingsStore.getState().settings.aiSettings,
  openrouterApiKey: getTranslationApiKey(),
  provider,
});

const isConfigured = (provider: LLMTranslatorName): boolean => {
  const settings = getSettings(provider);
  if (provider === 'ollama') {
    return Boolean(settings.ollamaBaseUrl?.trim() && settings.ollamaModel?.trim());
  }
  return Boolean(
    settings.openrouterApiKey?.trim() &&
      settings.openrouterBaseUrl?.trim() &&
      settings.openrouterModel?.trim(),
  );
};

const buildSystemPrompt = (sourceLang: string, targetLang: string): string => {
  const source = sourceLang.toUpperCase() === 'AUTO' ? 'the detected source language' : sourceLang;
  return [
    'You are a literary translation engine.',
    `Translate from ${source} to ${targetLang}.`,
    'Preserve meaning, tone, paragraph structure, names, and punctuation.',
    'Return only the translated text. Do not add explanations, labels, or Markdown fences.',
  ].join(' ');
};

const createLLMTranslator = (
  name: LLMTranslatorName,
  label: string,
): TranslationProvider & { name: LLMTranslatorName } => ({
  name,
  label,
  isConfigured: () => isConfigured(name),
  async translate(texts, sourceLang, targetLang, signal) {
    if (!isConfigured(name)) {
      throw new Error(ErrorCodes.PROVIDER_NOT_CONFIGURED);
    }

    const provider = getAIProvider(getSettings(name));
    const model = provider.getModel();
    const system = buildSystemPrompt(sourceLang, targetLang);
    const translated: string[] = [];

    // Reader-level translation already limits active blocks. Sequential
    // dispatch prevents multiplying that concurrency inside one request.
    for (const text of texts) {
      if (!text.trim()) {
        translated.push(text);
        continue;
      }
      const result = await generateText({
        model,
        system,
        prompt: text,
        abortSignal: signal,
      });
      const output = result.text.trim();
      if (!output) {
        throw new Error(ErrorCodes.EMPTY_RESPONSE);
      }
      translated.push(output);
    }

    return translated;
  },
});

export const ollamaTranslator = createLLMTranslator('ollama', 'Ollama (Local)');
export const openAICompatibleTranslator = createLLMTranslator(
  'openrouter',
  'OpenAI-compatible API',
);
