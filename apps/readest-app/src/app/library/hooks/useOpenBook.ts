import { Dispatch, SetStateAction, useCallback } from 'react';
import { Book } from '@/types/book';
import { useEnv } from '@/context/EnvContext';
import { useSettingsStore } from '@/store/settingsStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useAppRouter } from '@/hooks/useAppRouter';
import { eventDispatcher } from '@/utils/event';
import { navigateToReader, showReaderWindow } from '@/utils/nav';

interface UseOpenBookOptions {
  setLoading: Dispatch<SetStateAction<boolean>>;
}

/**
 * Shared "open this book" flow used both by per-item taps (`BookshelfItem`) and
 * the recently-read shelf. Centralizing it keeps the availability handling in
 * one place: cloud-synced books (which arrive on other devices as metadata +
 * progress without the file blob) are downloaded on demand, and a stale
 * in-place record is dropped instead of bouncing the user into a broken reader.
 */
export const useOpenBook = ({ setLoading }: UseOpenBookOptions) => {
  const _ = useTranslation();
  const router = useAppRouter();
  const { appService } = useEnv();
  const { settings } = useSettingsStore();

  const makeBookAvailable = useCallback(
    async (book: Book) => {
      const loadingTimeout = setTimeout(() => setLoading(true), 200);
      try {
        return !!(await appService?.isBookAvailable(book));
      } finally {
        clearTimeout(loadingTimeout);
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appService, setLoading],
  );

  const openBook = useCallback(
    async (book: Book) => {
      const available = await makeBookAvailable(book);
      if (!available) {
        eventDispatcher.dispatch('toast', {
          message: _('Book file no longer exists. Confirm deletion to remove it from the library.'),
          type: 'info',
        });
        eventDispatcher.dispatch('delete-books', { ids: [book.hash] });
        return;
      }
      if (appService?.hasWindow && settings.openBookInNewWindow) {
        showReaderWindow(appService, [book.hash]);
      } else {
        setTimeout(() => {
          navigateToReader(router, [book.hash]);
        }, 0);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appService, makeBookAvailable, settings.openBookInNewWindow],
  );

  return { openBook, makeBookAvailable };
};
