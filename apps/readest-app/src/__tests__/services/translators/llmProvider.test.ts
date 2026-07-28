import { beforeEach, describe, expect, it, vi } from 'vitest';

const { generateText, getAIProvider, getSettings } = vi.hoisted(() => ({
  generateText: vi.fn(),
  getAIProvider: vi.fn(),
  getSettings: vi.fn(),
}));

vi.mock('ai', () => ({ generateText }));
vi.mock('@/services/ai/providers', () => ({ getAIProvider }));
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
        enabled: true,
        provider: 'ollama',
        ollamaBaseUrl: 'http://127.0.0.1:11434',
        ollamaModel: 'qwen2.5',
        ollamaEmbeddingModel: 'nomic-embed-text',
        openrouterApiKey: 'secret',
        openrouterBaseUrl: 'https://llm.example/v1',
        openrouterModel: 'translation-model',
        spoilerProtection: true,
        maxContextChunks: 10,
        indexingMode: 'on-demand',
      },
    });
    getAIProvider.mockReturnValue({ getModel: () => ({ id: 'model' }) });
    generateText
      .mockResolvedValueOnce({ text: '你好' })
      .mockResolvedValueOnce({ text: '世界' });
  });

  it('exposes only Ollama and OpenAI-compatible translators', () => {
    expect(getTranslators().map((provider) => provider.name)).toEqual(['ollama', 'openrouter']);
  });

  it('translates with the selected custom LLM while preserving blank inputs', async () => {
    const provider = getTranslator('openrouter');
    expect(provider).toBeDefined();

    await expect(provider!.translate(['Hello', '', 'World'], 'EN', 'ZH')).resolves.toEqual([
      '你好',
      '',
      '世界',
    ]);
    expect(getAIProvider).toHaveBeenCalledWith(expect.objectContaining({ provider: 'openrouter' }));
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it('disables an OpenAI-compatible endpoint until an API key and model are configured', () => {
    getSettings.mockReturnValue({
      aiSettings: {
        enabled: true,
        provider: 'openrouter',
        openrouterApiKey: '',
        openrouterModel: '',
      },
    });

    expect(isTranslatorAvailable(getTranslator('openrouter')!)).toBe(false);
    expect(isTranslatorAvailable(getTranslator('ollama')!)).toBe(true);
  });
});
