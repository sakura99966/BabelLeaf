import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { Book } from '@/types/book';
import BookDetailModal from '@/components/metadata/BookDetailModal';
import { DropdownProvider } from '@/context/DropdownContext';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (value: string) => value,
}));

const appService = {
  getBookFileSize: vi.fn(async () => 1024),
  fetchBookDetails: vi.fn(async () => null),
};

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: { getAppService: async () => appService }, appService }),
}));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ safeAreaInsets: { top: 0, bottom: 0, left: 0, right: 0 } }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({
    settings: {
      metadataSeriesCollapsed: true,
      metadataOthersCollapsed: true,
      metadataDescriptionCollapsed: true,
    },
  }),
}));

vi.mock('@/helpers/settings', () => ({ saveSysSettings: vi.fn() }));
vi.mock('@/services/environment', () => ({ isWebAppPlatform: () => false }));
vi.mock('@/components/BookCover', () => ({ default: () => null }));
vi.mock('@/hooks/useResponsiveSize', () => ({
  useResponsiveSize: (value: number) => value,
  useDefaultIconSize: () => 20,
}));
vi.mock('@/components/Dialog', () => ({
  default: ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) =>
    isOpen ? <div>{children}</div> : null,
}));
vi.mock('@/components/DeleteConfirmAlert', () => ({
  default: ({ onConfirm }: { onConfirm: (purgeData: boolean) => void }) => (
    <div data-testid='delete-confirm'>
      <button onClick={() => onConfirm(false)}>confirm-delete</button>
      <button onClick={() => onConfirm(true)}>confirm-purge</button>
    </div>
  ),
}));

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

describe('BookDetailModal local deletion', () => {
  it('routes library removal through the local delete confirmation', async () => {
    const handleBookDelete = vi.fn();
    const handleBookPurge = vi.fn();

    const { container } = render(
      <DropdownProvider>
        <BookDetailModal
          book={book}
          isOpen
          onClose={vi.fn()}
          handleBookDelete={handleBookDelete}
          handleBookPurge={handleBookPurge}
        />
      </DropdownProvider>,
    );

    fireEvent.click(container.querySelector('button[aria-label="Delete Book Options"]')!);
    fireEvent.click(await screen.findByText('Remove from Library'));
    expect(screen.getByTestId('delete-confirm')).toBeTruthy();

    fireEvent.click(screen.getByText('confirm-purge'));
    expect(handleBookPurge).toHaveBeenCalledWith(book);
    expect(handleBookDelete).not.toHaveBeenCalled();
  });
});
