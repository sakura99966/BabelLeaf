import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useTextTranslation } from '@/app/reader/hooks/useTextTranslation';
import {
  getTranslationConsentContext,
  useTranslationSessionStore,
} from '@/store/translationSessionStore';

// Generated fixture; no credential, network, user book or filesystem.
const mocks = vi.hoisted(() => ({
  translate: vi.fn(async (_texts: string[], _options?: { signal?: AbortSignal }) => [
    'Audit translated result',
  ]),
  readFile: vi.fn(async () => {
    throw new Error('not found');
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
    select({ getBookData: () => ({ book: { hash: 'audit-reopened-book' } }) }),
}));
vi.mock('@/store/readerProgressStore', () => ({ useBookProgress: () => null }));
vi.mock('@/hooks/useTranslator', () => ({ useTranslator: () => ({ translate: mocks.translate }) }));
vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (text: string) => text }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.settings = {
    translationEnabled: true,
    translationProvider: 'deepseek',
    translateTargetLang: 'zh-CN',
  };
  for (const key of Object.keys(useTranslationSessionStore.getState().grants)) {
    useTranslationSessionStore.getState().revoke(key);
  }
  Object.assign(mocks.appService, {
    readFile: mocks.readFile,
    writeFile: vi.fn(async () => {}),
    createDir: vi.fn(async () => {}),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function openStoredView(enabled: boolean) {
  mocks.settings.translationEnabled = enabled;
  let notify: IntersectionObserverCallback | undefined;
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
  view.innerHTML = '<p>Repository-authored public audit sentence.</p>';
  const hook = renderHook(() => useTextTranslation('audit-reopened-book-1', view));
  await waitFor(() => expect(mocks.readFile).toHaveBeenCalled());
  await act(async () => {
    notify?.(
      observed.map((target) => ({ target, isIntersecting: true }) as IntersectionObserverEntry),
      {} as IntersectionObserver,
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  return {
    hook,
    notifyVisible: async () => {
      await act(async () => {
        notify?.(
          observed.map((target) => ({ target, isIntersecting: true }) as IntersectionObserverEntry),
          {} as IntersectionObserver,
        );
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
    },
  };
}

it('control: a disabled stored view does not dispatch translation on open', async () => {
  await openStoredView(false);
  expect(mocks.translate).not.toHaveBeenCalled();
});

it('roadmap boundary: reopening with a saved enabled flag requires fresh session consent', async () => {
  const { hook } = await openStoredView(true);
  expect(hook.result.current.translationLoadError).toBeNull();
  // No click, toggle, manual translate or retry action occurred in this test.
  // Opening/observing a page must not silently resume a paid cloud request.
  expect(mocks.translate).not.toHaveBeenCalled();
});

it('allows explicit current-session consent and aborts it on close/reopen', async () => {
  const { hook, notifyVisible } = await openStoredView(true);
  await act(async () => {
    useTranslationSessionStore
      .getState()
      .grant('audit-reopened-book-1', getTranslationConsentContext('deepseek', 'zh-CN'));
  });
  await notifyVisible();
  expect(mocks.translate).toHaveBeenCalledTimes(1);
  const signal = mocks.translate.mock.calls[0]?.[1]?.signal;
  expect(signal?.aborted).toBe(false);
  useTranslationSessionStore.getState().revoke('audit-reopened-book-1');
  hook.unmount();
  expect(signal?.aborted).toBe(true);
  mocks.translate.mockClear();
  await openStoredView(true);
  expect(mocks.translate).not.toHaveBeenCalled();
});

it.each([
  'openai',
  'different-target',
])('does not reuse consent across %s contexts', async (change) => {
  const { hook, notifyVisible } = await openStoredView(true);
  await act(async () => {
    useTranslationSessionStore
      .getState()
      .grant('audit-reopened-book-1', getTranslationConsentContext('deepseek', 'zh-CN'));
  });
  const old = useTranslationSessionStore.getState().grants['audit-reopened-book-1']!;
  mocks.settings = {
    ...mocks.settings,
    translationProvider: change === 'openai' ? 'openai' : 'deepseek',
    translateTargetLang: change === 'different-target' ? 'ja' : 'zh-CN',
  };
  hook.rerender();
  await notifyVisible();
  expect(mocks.translate).not.toHaveBeenCalled();
  expect(old.controller.signal.aborted).toBe(true);
});
