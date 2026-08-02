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
        provider: 'ollama',
        ollamaBaseUrl: 'http://127.0.0.1:11434',
        ollamaModel: 'qwen2.5',
        openrouterApiKey: 'secret',
        openrouterBaseUrl: 'https://llm.example/v1',
        openrouterModel: 'translation-model',
      },
    });
    getAIProvider.mockReturnValue({ getModel: () => ({ id: 'model' }) });
    getTranslationApiKey.mockReturnValue('secret');
    generateText.mockResolvedValueOnce({ text: '你好' }).mockResolvedValueOnce({ text: '世界' });
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
        provider: 'openrouter',
        openrouterModel: '',
      },
    });
    getTranslationApiKey.mockReturnValue('');

    expect(isTranslatorAvailable(getTranslator('openrouter')!)).toBe(false);
    expect(isTranslatorAvailable(getTranslator('ollama')!)).toBe(true);
  });
});
