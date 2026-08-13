import { describe, expect, test, vi } from 'vitest';
import { createSafeAIFetch, isAllowedAIEndpoint } from '@/services/ai/utils/httpFetch';

describe('AI fetch network boundary', () => {
  test('rejects redirects and omits ambient credentials', async () => {
    const baseFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    const safeFetch = createSafeAIFetch(baseFetch);

    await safeFetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer test' },
      body: '{}',
      redirect: 'follow',
      credentials: 'include',
    });

    expect(baseFetch).toHaveBeenCalledWith(
      'https://api.deepseek.com/chat/completions',
      expect.objectContaining({
        redirect: 'error',
        credentials: 'omit',
      }),
    );
  });

  test('allows only fixed providers and loopback Ollama', async () => {
    expect(isAllowedAIEndpoint('https://api.deepseek.com/models')).toBe(true);
    expect(isAllowedAIEndpoint('https://api.openai.com/v1/models')).toBe(true);
    expect(isAllowedAIEndpoint('https://api.anthropic.com/v1/messages')).toBe(true);
    expect(isAllowedAIEndpoint('http://127.0.0.1:11434/api/tags')).toBe(true);
    expect(isAllowedAIEndpoint('https://example.com/collect')).toBe(false);
    expect(isAllowedAIEndpoint('https://api.deepseek.com.evil.test/models')).toBe(false);

    const baseFetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    await expect(createSafeAIFetch(baseFetch)('https://example.com/collect')).rejects.toThrow(
      'outside the BabelLeaf allowlist',
    );
    expect(baseFetch).not.toHaveBeenCalled();
  });
});
