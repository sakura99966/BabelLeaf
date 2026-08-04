import { generateText } from 'ai';

import { DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import { getAIProvider } from '@/services/ai/providers';
import { isLoopbackOllamaUrl } from '@/services/ai/providers/OllamaProvider';
import { AI_TIMEOUTS } from '@/services/ai/utils/retry';
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

const getErrorStatus = (error: unknown): number | undefined => {
  if (!error || typeof error !== 'object') return undefined;
  const value = error as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
  };
  for (const candidate of [value.status, value.statusCode, value.response?.status]) {
    if (typeof candidate === 'number' && Number.isInteger(candidate)) return candidate;
  }
  return undefined;
};

const getSafeErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk|key|token)[-_][A-Za-z0-9._~-]+/gi, '[redacted]')
    .slice(0, 240);
};

/** Convert provider/transport failures into stable, non-sensitive UI errors. */
export const normalizeTranslationProviderError = (
  error: unknown,
  options: { timedOut?: boolean; cancelled?: boolean } = {},
): Error => {
  const errorName =
    error && typeof error === 'object' && 'name' in error
      ? String((error as { name?: unknown }).name)
      : '';
  if (options.cancelled || errorName === 'AbortError') {
    return new Error('Translation request cancelled');
  }
  if (options.timedOut) return new Error('Translation request timed out');
  const status = getErrorStatus(error);
  const message = getSafeErrorMessage(error);
  if (
    status === 401 ||
    status === 403 ||
    /unauthori[sz]ed|invalid api key|forbidden/i.test(message)
  ) {
    return new Error('Translation provider rejected the API key');
  }
  if (status === 429 || /rate.?limit|too many requests/i.test(message)) {
    return new Error('Translation provider rate limit reached; retry later');
  }
  if ((status && status >= 300 && status < 400) || /redirect/i.test(message)) {
    return new Error('Translation request was redirected and blocked');
  }
  if (status === 408 || status === 504 || /timeout|timed out/i.test(message)) {
    return new Error('Translation request timed out');
  }
  if (message === ErrorCodes.PROVIDER_NOT_CONFIGURED || message === ErrorCodes.EMPTY_RESPONSE) {
    return new Error(message);
  }
  return new Error(
    message
      ? `Translation provider request failed: ${message}`
      : 'Translation provider request failed',
  );
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
      const requestController = new AbortController();
      let timedOut = false;
      const abortFromCaller = () => requestController.abort();
      if (signal?.aborted) abortFromCaller();
      else signal?.addEventListener('abort', abortFromCaller, { once: true });
      const timeoutId = setTimeout(() => {
        timedOut = true;
        requestController.abort();
      }, AI_TIMEOUTS.CHAT_STREAM);
      let output: string;
      try {
        output = provider.generateText
          ? await provider.generateText({ system, prompt: text, signal: requestController.signal })
          : provider.getModel
            ? (
                await generateText({
                  model: provider.getModel(),
                  system,
                  prompt: text,
                  abortSignal: requestController.signal,
                })
              ).text
            : '';
      } catch (error) {
        throw normalizeTranslationProviderError(error, {
          timedOut,
          cancelled: signal?.aborted,
        });
      } finally {
        clearTimeout(timeoutId);
        signal?.removeEventListener('abort', abortFromCaller);
      }
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
