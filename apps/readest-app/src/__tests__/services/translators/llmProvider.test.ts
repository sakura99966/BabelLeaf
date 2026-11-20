import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateText, getAIProvider, getSettings, getTranslationApiKey } = vi.hoisted(() => ({
  generateText: vi.fn(),
  getAIProvider: vi.fn(),
  getSettings: vi.fn(),
  getTranslationApiKey: vi.fn(),
}));

vi.mock('ai', () => ({ generateText }));
vi.mock('@/services/ai/providers', () => ({ getAIProvider }));
vi.mock('@/services/ai/translationApiKey', () => ({ getTranslationApiKey }));
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: { getState: () => ({ settings: getSettings() }) },
}));

import {
  getTranslator,
  getTranslators,
  isTranslatorAvailable,
} from '@/services/translators/providers';
import { normalizeTranslationProviderError } from '@/services/translators/providers/llm';
import { AI_TIMEOUTS } from '@/services/ai/utils/retry';

describe('LLM translation providers', () => {
  it('distinguishes its internal AbortError deadline from user cancellation', async () => {
    vi.useFakeTimers();
    try {
      getAIProvider.mockReturnValue({
        requiresAuth: false,
        generateText: ({ signal }: { signal: AbortSignal }) =>
          new Promise<string>((_resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true },
            );
          }),
      });
      const result = getTranslator('index-translate')!
        .translate(['Local sample'], 'EN', 'ZH')
        .catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(AI_TIMEOUTS.CHAT_STREAM);
      expect(await result).toEqual(new Error('Translation request timed out'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps caller cancellation separate even when a deadline also expired', () => {
    const error = new DOMException('Aborted', 'AbortError');
    expect(normalizeTranslationProviderError(error, { timedOut: true }).message).toBe(
      'Translation request timed out',
    );
    expect(
      normalizeTranslationProviderError(error, { cancelled: true, timedOut: true }).message,
    ).toBe('Translation request cancelled');
    expect(normalizeTranslationProviderError(error).message).toBe('Translation request cancelled');
  });

  it('preserves HTTP retry metadata through safe error normalization', () => {
    const error = normalizeTranslationProviderError({ status: 429, retryAfter: '30' });
    expect(error).toMatchObject({ status: 429, retryAfter: '30' });
  });
  beforeEach(() => {
    vi.clearAllMocks();
    getSettings.mockReturnValue({
      aiSettings: {
        provider: 'deepseek',
        ollamaBaseUrl: 'http://127.0.0.1:11434',
        ollamaModel: 'qwen2.5',
        deepseekApiKey: 'secret',
      },
    });
    getAIProvider.mockReturnValue({ getModel: () => ({ id: 'model' }) });
    getTranslationApiKey.mockReturnValue('secret');
    generateText
      .mockResolvedValueOnce({ text: '你好', finishReason: 'stop' })
      .mockResolvedValueOnce({ text: '世界', finishReason: 'stop' });
  });

  it('exposes named cloud adapters and local Ollama', () => {
    expect(getTranslators().map((provider) => provider.name)).toEqual([
      'deepseek',
      'openai',
      'anthropic',
      'ollama',
      'index-translate',
    ]);
  });

  it('uses non-secret model and prompt identities for cache isolation without credential access', () => {
    const cloud = getTranslator('deepseek')!.cacheContext!();
    expect(cloud).toContain('deepseek-v4-flash');
    expect(cloud).toContain('translation-v1');
    expect(cloud).not.toContain('secret');
    expect(getTranslationApiKey).not.toHaveBeenCalled();
    const local = getTranslator('ollama')!.cacheContext!();
    getSettings.mockReturnValue({
      aiSettings: { ollamaModel: 'different-local-model', ollamaBaseUrl: 'http://127.0.0.1:11434' },
    });
    expect(getTranslator('ollama')!.cacheContext!()).not.toBe(local);
    expect(getTranslationApiKey).not.toHaveBeenCalled();
  });

  it('rejects truncated SDK output instead of caching a partial translation', async () => {
    generateText.mockReset().mockResolvedValue({ text: 'partial', finishReason: 'length' });
    await expect(getTranslator('deepseek')!.translate(['Hello'], 'EN', 'ZH')).rejects.toThrow(
      'incomplete',
    );
  });

  it('translates with the selected DeepSeek V4 model while preserving blank inputs', async () => {
    const provider = getTranslator('deepseek');
    expect(provider).toBeDefined();

    await expect(provider!.translate(['Hello', '', 'World'], 'EN', 'ZH')).resolves.toEqual([
      '你好',
      '',
      '世界',
    ]);
    expect(getAIProvider).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'deepseek', deepseekApiKey: 'secret' }),
    );
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("You are BabelLeaf's literary translation engine."),
      }),
    );
  });

  it('disables DeepSeek V4 until an API key is configured', () => {
    getSettings.mockReturnValue({
      aiSettings: {
        provider: 'deepseek',
      },
    });
    getTranslationApiKey.mockReturnValue('');

    expect(isTranslatorAvailable(getTranslator('deepseek')!)).toBe(false);
    expect(isTranslatorAvailable(getTranslator('ollama')!)).toBe(true);
  });

  it('requires a provider-specific key for OpenAI and Anthropic', () => {
    getSettings.mockReturnValue({ aiSettings: { provider: 'openai' } });
    getTranslationApiKey.mockReturnValue('');
    expect(isTranslatorAvailable(getTranslator('openai')!)).toBe(false);

    getSettings.mockReturnValue({ aiSettings: { provider: 'anthropic' } });
    expect(isTranslatorAvailable(getTranslator('anthropic')!)).toBe(false);
  });

  it('offers Index-Translate without retrieving credentials or changing the default provider', async () => {
    getTranslationApiKey.mockReturnValue('');
    const translator = getTranslator('index-translate')!;
    expect(isTranslatorAvailable(translator)).toBe(true);
    expect(translator.cacheContext?.()).toContain('Index-Translate-35B-A3B');
    expect(getAIProvider).not.toHaveBeenCalled();
    const generate = vi.fn().mockResolvedValue('你好。');
    getAIProvider.mockReturnValue({ generateText: generate, requiresAuth: false });
    await expect(translator.translate(['Hello.'], 'EN', 'ZH-CN')).resolves.toEqual(['你好。']);
    expect(getAIProvider).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'index-translate' }),
    );
    expect(generate).toHaveBeenCalledOnce();
    expect(getTranslationApiKey).not.toHaveBeenCalled();
    expect(generateText).not.toHaveBeenCalled();
    expect(isTranslatorAvailable(getTranslator('deepseek')!)).toBe(false);
  });

  it('normalizes cancellation, timeout, redirect, rate-limit, and credential failures', () => {
    expect(
      normalizeTranslationProviderError(new DOMException('aborted', 'AbortError')).message,
    ).toBe('Translation request cancelled');
    expect(
      normalizeTranslationProviderError(new Error('timeout'), { timedOut: true }).message,
    ).toBe('Translation request timed out');
    expect(
      normalizeTranslationProviderError({ status: 302, message: 'redirect' }).message,
    ).toContain('redirected');
    expect(normalizeTranslationProviderError({ statusCode: 429 }).message).toContain('rate limit');
    expect(
      normalizeTranslationProviderError({ status: 401, message: 'Bearer sk-secret' }).message,
    ).toBe('Translation provider rejected the API key');
  });
});
