import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import { getAIProvider } from '@/services/ai/providers';

const { nativeFetch } = vi.hoisted(() => ({ nativeFetch: vi.fn<typeof fetch>() }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: nativeFetch }));
vi.mock('@/services/environment', () => ({ isTauriAppPlatform: () => true }));

const endpoint = 'https://index-translate.bilibili.com/v1/chat/completions';
const request = {
  system: 'Translate to Simplified Chinese. Return only the translation.',
  prompt: 'Good morning.',
};
const completion = (content: unknown, finishReason = 'stop') =>
  Response.json({
    choices: [
      {
        finish_reason: finishReason,
        message: { content, reasoning_content: 'not for the reader' },
      },
    ],
  });
const createProvider = () => getAIProvider({ ...DEFAULT_AI_SETTINGS, provider: 'index-translate' });

beforeEach(() => nativeFetch.mockReset());

describe('official Index-Translate preset', () => {
  test('sends only an explicit, unauthenticated text request to the pinned endpoint', async () => {
    const provider = getAIProvider({
      ...DEFAULT_AI_SETTINGS,
      provider: 'index-translate',
      openaiApiKey: 'must-not-be-forwarded',
      deepseekApiKey: 'must-not-be-forwarded',
    });
    expect(provider.requiresAuth).toBe(false);
    await expect(provider.isAvailable()).resolves.toBe(true);
    expect(nativeFetch).not.toHaveBeenCalled();

    const { signal } = new AbortController();
    nativeFetch.mockResolvedValueOnce(completion('<think>not a translation</think>早上好。'));
    await expect(provider.generateText!({ ...request, signal })).resolves.toBe('早上好。');
    const [url, init] = nativeFetch.mock.calls[0]!;
    expect(url).toBe(endpoint);
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      maxRedirections: 0,
      signal,
    });
    const headers = new Headers(init?.headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.has('authorization')).toBe(false);
    expect(headers.has('cookie')).toBe(false);
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'Index-Translate-35B-A3B',
      messages: [{ role: 'user', content: `${request.system}\n\n${request.prompt}` }],
      stream: false,
      temperature: 0,
      max_tokens: 4096,
      chat_template_kwargs: { enable_thinking: false },
    });
    expect(JSON.stringify(init)).not.toContain('must-not-be-forwarded');
  });

  test('connection testing uses only a built-in sample and checks a real completion shape', async () => {
    nativeFetch.mockResolvedValueOnce(completion('你好。'));
    const provider = createProvider();
    await expect(provider.healthCheck()).resolves.toBe(true);
    const [url, init] = nativeFetch.mock.calls[0]!;
    expect(url).toBe(endpoint);
    expect(JSON.parse(String(init?.body))).toMatchObject({
      max_tokens: 32,
      messages: [{ role: 'user', content: expect.stringContaining('Hello.') }],
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    nativeFetch.mockResolvedValueOnce(Response.json({ status: 'ok' }));
    await expect(provider.healthCheck()).resolves.toBe(false);
  });

  test.each([
    ['partial translation', 'length', 'incomplete'],
    ['', 'stop', 'empty response'],
    [null, 'stop', 'invalid response'],
    ['<think>unclosed', 'stop', 'incomplete'],
  ])('rejects invalid output (%s, %s)', async (content, finishReason, failure) => {
    nativeFetch.mockResolvedValueOnce(completion(content, finishReason));
    await expect(createProvider().generateText!(request)).rejects.toThrow(failure);
  });

  test('preserves 429 retry metadata without reading or exposing the error body', async () => {
    const response = new Response('private server details', {
      status: 429,
      headers: { 'retry-after': '12' },
    });
    const cancel = vi.spyOn(response.body!, 'cancel');
    nativeFetch.mockResolvedValueOnce(response);
    await expect(createProvider().generateText!(request)).rejects.toMatchObject({
      message: 'Index-Translate request failed (429)',
      status: 429,
      retryAfter: '12',
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

  test('rejects oversized input and aborted requests before dispatch', async () => {
    const provider = createProvider();
    await expect(
      provider.generateText!({ ...request, prompt: 'x'.repeat(16_385) }),
    ).rejects.toThrow('too large');
    await expect(
      provider.generateText!({ ...request, signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(nativeFetch).not.toHaveBeenCalled();
  });

  test('bounds response bytes even without Content-Length', async () => {
    const cancel = vi.fn();
    nativeFetch.mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(256 * 1024 + 1));
          },
          cancel,
        }),
      ),
    );
    await expect(createProvider().generateText!(request)).rejects.toThrow('response is too large');
    expect(cancel).toHaveBeenCalledOnce();
  });
});
