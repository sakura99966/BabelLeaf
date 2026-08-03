import { describe, expect, test, vi } from 'vitest';
import { createSafeAIFetch } from '@/services/ai/utils/httpFetch';

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
});
