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

describe('LLM translation providers', () => {
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
    generateText.mockResolvedValueOnce({ text: '你好' }).mockResolvedValueOnce({ text: '世界' });
  });

  it('exposes named cloud adapters and local Ollama', () => {
    expect(getTranslators().map((provider) => provider.name)).toEqual([
      'deepseek',
      'openai',
      'anthropic',
      'ollama',
    ]);
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
});
