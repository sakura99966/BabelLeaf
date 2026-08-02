import { generateText } from 'ai';

import { DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import { getAIProvider } from '@/services/ai/providers';
import { isLoopbackOllamaUrl } from '@/services/ai/providers/OllamaProvider';
import {
  getTranslationApiKey,
  type TranslationApiKeyProvider,
} from '@/services/ai/translationApiKey';
import type { ActiveAIProviderName, AISettings } from '@/services/ai/types';
import { useSettingsStore } from '@/store/settingsStore';

import { ErrorCodes, type TranslationProvider } from '../types';

export type LLMTranslatorName = ActiveAIProviderName;

const getSettings = (provider: LLMTranslatorName): AISettings => {
  const settings: AISettings = {
    ...DEFAULT_AI_SETTINGS,
    ...useSettingsStore.getState().settings.aiSettings,
    provider,
  };

  if (provider === 'deepseek' || provider === 'openai' || provider === 'anthropic') {
    const key = getTranslationApiKey(provider as TranslationApiKeyProvider);
    if (provider === 'deepseek') settings.deepseekApiKey = key;
    if (provider === 'openai') settings.openaiApiKey = key;
    if (provider === 'anthropic') settings.anthropicApiKey = key;
  }

  return settings;
};

const isConfigured = (provider: LLMTranslatorName): boolean => {
  const settings = getSettings(provider);
  if (provider === 'ollama') {
    return Boolean(
      settings.ollamaBaseUrl?.trim() &&
        isLoopbackOllamaUrl(settings.ollamaBaseUrl) &&
        settings.ollamaModel?.trim(),
    );
  }
  if (provider === 'deepseek') return Boolean(settings.deepseekApiKey?.trim());
  if (provider === 'openai') return Boolean(settings.openaiApiKey?.trim());
  return Boolean(settings.anthropicApiKey?.trim());
};

const buildSystemPrompt = (sourceLang: string, targetLang: string): string => {
  const source = sourceLang.toUpperCase() === 'AUTO' ? 'the detected source language' : sourceLang;
  return [
    "You are BabelLeaf's literary translation engine.",
    `Translate from ${source} to ${targetLang}.`,
    'Preserve the original meaning, tone, paragraph structure, names, formatting, and punctuation.',
    'Return only the translated text. Do not add explanations, labels, notes, or Markdown fences.',
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
    const system = buildSystemPrompt(sourceLang, targetLang);
    const translated: string[] = [];

    // Reader-level translation already limits active blocks. Sequential
    // dispatch prevents multiplying that concurrency inside one request.
    for (const text of texts) {
      if (!text.trim()) {
        translated.push(text);
        continue;
      }
      const output = provider.generateText
        ? await provider.generateText({ system, prompt: text, signal })
        : provider.getModel
          ? (
              await generateText({
                model: provider.getModel(),
                system,
                prompt: text,
                abortSignal: signal,
              })
            ).text
          : '';
      const normalizedOutput = output.trim();
      if (!normalizedOutput) {
        throw new Error(ErrorCodes.EMPTY_RESPONSE);
      }
      translated.push(normalizedOutput);
    }

    return translated;
  },
});

export const deepSeekTranslator = createLLMTranslator('deepseek', 'DeepSeek V4');
export const ollamaTranslator = createLLMTranslator('ollama', 'Ollama (Local)');
export const openAITranslator = createLLMTranslator('openai', 'OpenAI');
export const anthropicTranslator = createLLMTranslator('anthropic', 'Anthropic Claude');
