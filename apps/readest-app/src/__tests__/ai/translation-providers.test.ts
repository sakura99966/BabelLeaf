import { beforeEach, describe, expect, test, vi } from 'vitest';

const { createOpenAICompatible, mockFetch } = vi.hoisted(() => ({
  createOpenAICompatible: vi.fn(() => ({ chatModel: vi.fn() })),
  mockFetch: vi.fn(),
}));

vi.stubGlobal('fetch', mockFetch);
vi.mock('ai-sdk-ollama', () => ({
  createOllama: vi.fn(() => vi.fn()),
}));
vi.mock('@ai-sdk/openai-compatible', () => ({
  createOpenAICompatible,
}));

import { DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import { getAIProvider } from '@/services/ai/providers';
import { OllamaProvider } from '@/services/ai/providers/OllamaProvider';
import { OpenRouterProvider } from '@/services/ai/providers/OpenRouterProvider';
import type { AISettings } from '@/services/ai/types';

describe('translation-only AI providers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('defaults to a local Ollama endpoint only', () => {
    expect(DEFAULT_AI_SETTINGS).toEqual({
      provider: 'ollama',
      ollamaBaseUrl: 'http://127.0.0.1:11434',
      ollamaModel: 'llama3.2',
      openrouterBaseUrl: '',
      openrouterModel: '',
    });
  });

  test('Ollama health check requires only the configured translation model', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [{ name: 'qwen2.5:latest' }] }),
    });
    const provider = new OllamaProvider({
      ...DEFAULT_AI_SETTINGS,
      ollamaModel: 'qwen2.5',
    });

    await expect(provider.healthCheck()).resolves.toBe(true);
  });

  test('OpenAI-compatible provider requires explicit endpoint values', () => {
    expect(() =>
      getAIProvider({ ...DEFAULT_AI_SETTINGS, provider: 'openrouter' }),
    ).toThrow('API key, base URL, and model are required');
  });

  test('OpenAI-compatible provider uses the user endpoint without Readest headers', () => {
    const settings: AISettings = {
      ...DEFAULT_AI_SETTINGS,
      provider: 'openrouter',
      openrouterApiKey: 'secret',
      openrouterBaseUrl: 'https://llm.example/v1/',
      openrouterModel: 'translation-model',
    };

    const provider = new OpenRouterProvider(settings);

    expect(provider.name).toBe('OpenAI-compatible API');
    expect(createOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'custom-openai-compatible',
        baseURL: 'https://llm.example/v1',
        apiKey: 'secret',
      }),
    );
    expect(createOpenAICompatible).toHaveBeenCalledWith(
      expect.not.objectContaining({ headers: expect.anything() }),
    );
  });
});
