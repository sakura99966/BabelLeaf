import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BookConfigSaveWarning } from '@/app/reader/components/BookConfigSaveWarning';
import { useBookDataStore } from '@/store/bookDataStore';

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (text: string) => text }));
const originalRetry = useBookDataStore.getState().retryConfigSave;
afterEach(() => {
  cleanup();
  useBookDataStore.setState({ configSaveErrors: {}, retryConfigSave: originalRetry });
});

it('keeps failed annotation writes visible and offers an explicit local retry', async () => {
  const retry = vi.fn(async () => {});
  useBookDataStore.setState({
    configSaveErrors: { 'book-1': 'disk full' },
    retryConfigSave: retry,
  });
  render(<BookConfigSaveWarning bookKeys={['book-1']} />);
  expect(screen.getByRole('alert').textContent).toContain('Book changes not saved');
  expect(screen.getByRole('alert').textContent).toContain('disk full');
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(retry).toHaveBeenCalledWith('book-1');
  await act(async () => useBookDataStore.setState({ configSaveErrors: {} }));
  expect(screen.queryByRole('alert')).toBeNull();
});
