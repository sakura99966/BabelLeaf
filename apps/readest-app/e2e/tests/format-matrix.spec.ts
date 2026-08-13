import { expect, test } from '../fixtures/base';
import { FORMAT_FIXTURES } from '../fixtures/books';
import { LibraryPage } from '../pages/LibraryPage';

test.describe('Local format import matrix', () => {
  for (const [format, filePath] of Object.entries(FORMAT_FIXTURES)) {
    test(`imports a local ${format} sample without network access`, async ({ page }) => {
      const library = new LibraryPage(page);
      await library.goto();
      await expect(library.emptyState).toBeVisible();

      await library.importBook(filePath);

      await expect(library.bookshelf).toBeVisible();
      await expect(library.bookCards()).toHaveCount(1);
    });
  }
});
