import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { Book } from '@/types/book';
import BookDetailView from '@/components/metadata/BookDetailView';
import { DropdownProvider } from '@/context/DropdownContext';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (value: string) => value,
}));
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({
    settings: {
      metadataSeriesCollapsed: true,
      metadataOthersCollapsed: true,
      metadataDescriptionCollapsed: true,
      librarySkeuomorphicCovers: false,
    },
  }),
}));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ envConfig: {}, appService: null }) }));
vi.mock('@/helpers/settings', () => ({ saveSysSettings: vi.fn() }));
vi.mock('@/components/BookCover', () => ({ default: () => null }));

afterEach(cleanup);

const book: Book = {
  hash: 'book-1',
  title: 'Local book',
  author: 'Author',
  format: 'EPUB',
  createdAt: 1,
  updatedAt: 1,
  downloadedAt: 1,
};

const renderView = (options: Partial<React.ComponentProps<typeof BookDetailView>> = {}) =>
  render(
    <DropdownProvider>
      <BookDetailView
        book={book}
        metadata={null}
        fileSize={1024}
        onDelete={vi.fn()}
        {...options}
      />
    </DropdownProvider>,
  );

describe('BookDetailView local actions', () => {
  it('shows only local deletion actions', () => {
    const { container, queryByText } = renderView();
    fireEvent.click(container.querySelector('button[aria-label="Delete Book Options"]')!);

    expect(screen.getByText('Remove from Library')).toBeTruthy();
    expect(queryByText('Remove from Cloud Only')).toBeNull();
    expect(queryByText('Remove from Cloud & Device')).toBeNull();
  });

  it('exports only when the local file is available', () => {
    const onExport = vi.fn();
    const { container } = renderView({ onExport });
    fireEvent.click(container.querySelector('button[aria-label="More Actions"]')!);
    fireEvent.click(screen.getByText('Export Book'));

    expect(onExport).toHaveBeenCalledTimes(1);
  });
});
