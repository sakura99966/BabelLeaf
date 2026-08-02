import type { Book } from '@/types/book';
import type { DeleteAction, FileSystem } from '@/types/system';
import { getDir } from '@/utils/book';
import { resolveBookContentSource } from './bookContent';

/**
 * Removes only BabelLeaf-managed files. Source files imported in-place always
 * remain under the user's control and are never deleted by the library.
 */
export async function deleteBook(
  fs: FileSystem,
  book: Book,
  deleteAction: DeleteAction,
): Promise<void> {
  const source = await resolveBookContentSource(fs, book);
  if (source.kind === 'managed' && deleteAction === 'local') {
    if (await fs.exists(source.path, source.base)) {
      await fs.removeFile(source.path, source.base);
    }
  }

  if (deleteAction === 'purge') {
    const bookDir = getDir(book);
    if (await fs.exists(bookDir, 'Books')) {
      await fs.removeDir(bookDir, 'Books', true);
    }
  }

  book.downloadedAt = null;
}
