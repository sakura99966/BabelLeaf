import { act, renderHook, waitFor, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useTextTranslation } from '@/app/reader/hooks/useTextTranslation';

const mocks = vi.hoisted(() => ({
  translate: vi.fn(async () => ['translated']),
  readFile: vi.fn(async () => {
    throw new Error('access denied');
  }),
  appService: {} as Record<string, unknown>,
  settings: {
    translationEnabled: true,
    translationProvider: 'deepseek',
    translateTargetLang: 'zh-CN',
  },
}));
vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: mocks.appService }),
}));
vi.mock('@/store/readerStore', () => ({
  useReaderStore: (select: (state: unknown) => unknown) =>
    select({ getViewSettings: () => mocks.settings, setIsLoading: () => {} }),
}));
vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: (select: (state: unknown) => unknown) =>
    select({ getBookData: () => ({ book: { hash: 'isolated-book' } }) }),
}));
vi.mock('@/store/readerProgressStore', () => ({ useBookProgress: () => null }));
vi.mock('@/hooks/useTranslator', () => ({ useTranslator: () => ({ translate: mocks.translate }) }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (text: string) => text }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it('does not submit translation after local sidecar loading fails', async () => {
  Object.assign(mocks.appService, {
    readFile: mocks.readFile,
    writeFile: vi.fn(),
    createDir: vi.fn(),
  });
  let notify!: IntersectionObserverCallback;
  const observed: Element[] = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        notify = callback;
      }
      observe(element: Element) {
        observed.push(element);
      }
      disconnect() {}
    },
  );
  const view = document.createElement('div');
  view.innerHTML = '<p>Local source text</p>';
  const { result } = renderHook(() => useTextTranslation('isolated-book-1', view));
  await waitFor(() => expect(mocks.readFile).toHaveBeenCalled());
  await act(async () => {
    notify(
      observed.map((target) => ({ target, isIntersecting: true }) as IntersectionObserverEntry),
      {} as IntersectionObserver,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  expect(mocks.translate).not.toHaveBeenCalled();
  expect(result.current.translationLoadError).toMatch(/readable JSON/);
  await act(async () => {
    await result.current.retryTranslationLoad();
  });
  expect(mocks.translate).not.toHaveBeenCalled();
  expect(result.current.translationLoadError).toMatch(/readable JSON/);
  mocks.readFile.mockRejectedValue(new Error('not found'));
  await act(async () => {
    await result.current.retryTranslationLoad();
  });
  await waitFor(() => expect(mocks.translate).toHaveBeenCalledTimes(1));
  expect(result.current.translationLoadError).toBeNull();
});
