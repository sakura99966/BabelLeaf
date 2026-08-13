import { test as base, expect } from '@playwright/test';
import { LibraryPage } from '../pages/LibraryPage';
import { ReaderPage } from '../pages/ReaderPage';
import { SAMPLE_EPUB } from './books';

type Fixtures = {
  /**
   * Imports a book (the sample EPUB by default), opens it, and returns a
   * {@link ReaderPage} that is ready to interact with.
   */
  openBook: (filePath?: string) => Promise<ReaderPage>;
};

/**
 * Base test fixture for the web e2e lane.
 *
 * - Overrides `page` to suppress the demo-book auto-import that `useDemoBooks`
 *   performs on a fresh web session (see `src/app/library/hooks/useDemoBooks.ts`),
 *   so every test starts from a deterministic empty library.
 * - Adds the `openBook` action fixture so reading/annotation specs do not
 *   repeat the import-and-open boilerplate.
 */
export const test = base.extend<Fixtures>({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      const originalStartViewTransition = document.startViewTransition?.bind(document);
      if (originalStartViewTransition) {
        const pending = new Set<Promise<void>>();
        const failures: string[] = [];
        document.startViewTransition = (callback) => {
          const transition = originalStartViewTransition(callback);
          const settled = Promise.allSettled([
            transition.ready,
            transition.updateCallbackDone,
            transition.finished,
          ]).then((results) => {
            for (const result of results) {
              if (result.status === 'rejected') failures.push(String(result.reason));
            }
          });
          pending.add(settled);
          void settled.finally(() => pending.delete(settled));
          return transition;
        };
        Object.defineProperty(window, '__BABELLEAF_E2E_VIEW_TRANSITIONS__', {
          value: { pending, failures },
          configurable: false,
          writable: false,
        });
      }
      try {
        window.localStorage.setItem('demoBooksFetched', 'true');
        // Keep the browser lane locale-independent. The application follows
        // navigator.language when no preference exists, while the assertions
        // intentionally use the stable English accessibility labels.
        window.localStorage.setItem('i18nextLng', 'en');
      } catch {
        // localStorage may be unavailable in some contexts; ignore.
      }
    });
    await use(page);
    if (!page.isClosed()) {
      const failures = await page.evaluate(async () => {
        const tracker = (
          window as unknown as {
            __BABELLEAF_E2E_VIEW_TRANSITIONS__?: {
              pending: Set<Promise<void>>;
              failures: string[];
            };
          }
        ).__BABELLEAF_E2E_VIEW_TRANSITIONS__;
        if (!tracker) return [];
        await Promise.all([...tracker.pending]);
        return tracker.failures;
      });
      expect(failures, 'route view transitions must settle before page teardown').toEqual([]);
    }
  },
  openBook: async ({ page }, use) => {
    await use(async (filePath = SAMPLE_EPUB) => {
      const library = new LibraryPage(page);
      await library.goto();
      await library.importBook(filePath);
      await expect(library.bookCards()).toHaveCount(1);
      await library.openFirstBook();

      const reader = new ReaderPage(page);
      await reader.waitForReady();
      return reader;
    });
  },
});

export { expect };
