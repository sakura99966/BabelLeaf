import { afterEach, expect, it } from 'vitest';
import { useReaderStore } from '@/store/readerStore';
import { useTranslationSessionStore } from '@/store/translationSessionStore';

afterEach(() => {
  for (const key of Object.keys(useTranslationSessionStore.getState().grants)) {
    useTranslationSessionStore.getState().revoke(key);
  }
});

it('revokes and aborts only the closed reader view without persisting a grant', () => {
  const store = useTranslationSessionStore.getState();
  store.grant('book-1', 'current-context');
  store.grant('book-2', 'other-view');
  const signal = useTranslationSessionStore.getState().grants['book-1']!.controller.signal;
  useReaderStore.getState().clearViewState('book-1');
  expect(signal.aborted).toBe(true);
  expect(useTranslationSessionStore.getState().grants['book-1']).toBeUndefined();
  expect(useTranslationSessionStore.getState().grants['book-2']).toBeDefined();
});
