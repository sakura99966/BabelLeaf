import { beforeEach, describe, expect, test, vi } from 'vitest';

const { createOpenAICompatible, mockFetch, chatModel } = vi.hoisted(() => ({
  chatModel: vi.fn(),
  createOpenAICompatible: vi.fn(() => ({ chatModel })),
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
import {
  DEEPSEEK_API_BASE_URL,
  DEEPSEEK_TRANSLATION_MODEL,
  DeepSeekProvider,
} from '@/services/ai/providers/DeepSeekProvider';
import { OllamaProvider } from '@/services/ai/providers/OllamaProvider';
import type { AISettings } from '@/services/ai/types';

describe('translation-only AI providers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('defaults to the built-in DeepSeek V4 provider while retaining local Ollama', () => {
    expect(DEFAULT_AI_SETTINGS).toEqual({
      provider: 'deepseek',
      ollamaBaseUrl: 'http://127.0.0.1:11434',
      ollamaModel: 'llama3.2',
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

  test('Ollama rejects non-loopback endpoints', () => {
    expect(
      () =>
        new OllamaProvider({
          ...DEFAULT_AI_SETTINGS,
          provider: 'ollama',
          ollamaBaseUrl: 'https://example.com',
        }),
    ).toThrow('Ollama URL must use an HTTP loopback address');
  });

  test('DeepSeek V4 requires an API key but no user-supplied URL or model', () => {
    expect(() => getAIProvider({ ...DEFAULT_AI_SETTINGS, provider: 'deepseek' })).toThrow(
      'API key required',
    );
  });

  test('DeepSeek V4 uses the fixed official endpoint and Flash translation model', async () => {
    const settings: AISettings = {
      ...DEFAULT_AI_SETTINGS,
      provider: 'deepseek',
      deepseekApiKey: 'secret',
    };

    const provider = new DeepSeekProvider(settings);

    expect(provider.name).toBe('DeepSeek V4');
    expect(createOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'deepseek',
        baseURL: DEEPSEEK_API_BASE_URL,
        apiKey: 'secret',
      }),
    );
    provider.getModel();
    expect(chatModel).toHaveBeenCalledWith(DEEPSEEK_TRANSLATION_MODEL);

    mockFetch.mockResolvedValueOnce({ ok: true });
    await expect(provider.healthCheck()).resolves.toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      `${DEEPSEEK_API_BASE_URL}/models`,
      expect.objectContaining({
        headers: { Authorization: 'Bearer secret' },
      }),
    );
  });
});
