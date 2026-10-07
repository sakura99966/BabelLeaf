import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useTranslator } from '@/hooks/useTranslator';

const mock = vi.hoisted(() => ({
  context: 'model-one:prompt-one',
  translate: vi.fn(async (texts: string[]) => texts.map((text) => `fresh:${text}`)),
  read: vi.fn(
    async (
      _text: string,
      _source: string,
      _target: string,
      _provider: string,
      context?: string,
    ): Promise<string | null> => (context ? null : 'stale'),
  ),
  write: vi.fn(async () => {}),
}));
vi.mock('@/services/translators', () => {
  const provider = {
    name: 'deepseek',
    cacheContext: () => mock.context,
    translate: mock.translate,
  };
  return {
    getTranslator: () => provider,
    getTranslators: () => [provider],
    getFromCache: mock.read,
    storeInCache: mock.write,
    preprocess: (texts: string[]) => texts,
    polish: (texts: string[]) => texts,
  };
});
beforeEach(() => {
  vi.clearAllMocks();
  mock.context = 'model-one:prompt-one';
});
afterEach(cleanup);

it('bypasses old cache entries when explicitly retranslating', async () => {
  const { result } = renderHook(() => useTranslator());
  await act(async () => {
    expect(await result.current.translate(['source'], { useCache: false })).toEqual([
      'fresh:source',
    ]);
  });
  expect(mock.read).not.toHaveBeenCalled();
});

it('isolates cache reads and writes by the selected model and prompt context', async () => {
  const { result } = renderHook(() => useTranslator());
  await act(async () => {
    await result.current.translate(['source']);
  });
  expect(mock.read).toHaveBeenLastCalledWith(
    'source',
    'AUTO',
    'EN',
    'deepseek',
    'model-one:prompt-one',
  );
  expect(mock.write).toHaveBeenLastCalledWith(
    'source',
    'fresh:source',
    'AUTO',
    'EN',
    'deepseek',
    'model-one:prompt-one',
  );
  mock.context = 'model-two:prompt-one';
  await act(async () => {
    await result.current.translate(['source']);
  });
  expect(mock.read).toHaveBeenLastCalledWith(
    'source',
    'AUTO',
    'EN',
    'deepseek',
    'model-two:prompt-one',
  );
});

it('does not return cached success for an already-cancelled request', async () => {
  const { result } = renderHook(() => useTranslator());
  const controller = new AbortController();
  controller.abort();
  await act(async () => {
    await expect(
      result.current.translate(['source'], { signal: controller.signal }),
    ).rejects.toThrow(/cancel/i);
  });
  expect(mock.translate).not.toHaveBeenCalled();
});

it('does not publish or cache a partial response array', async () => {
  mock.translate.mockResolvedValueOnce(['only-first']);
  const { result } = renderHook(() => useTranslator());
  await act(async () => {
    await expect(result.current.translate(['one', 'two'])).rejects.toThrow(/incomplete/);
  });
  expect(mock.write).not.toHaveBeenCalled();
});
