import type { Book } from '@/types/book';
import type { DeleteAction, FileSystem } from '@/types/system';
import { getCoverFilename, getDir } from '@/utils/book';
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
  if (deleteAction === 'cloud') return;

  const source = await resolveBookContentSource(fs, book);
  if (source.kind === 'managed' && deleteAction !== 'purge') {
    if (await fs.exists(source.path, source.base)) {
      await fs.removeFile(source.path, source.base);
    }
  }

  if (deleteAction === 'purge') {
    const bookDir = getDir(book);
    if (await fs.exists(bookDir, 'Books')) {
      await fs.removeDir(bookDir, 'Books', true);
    }
    const ttsCacheDir = `tts-cache/${book.hash}`;
    if (await fs.exists(ttsCacheDir, 'Cache')) {
      await fs.removeDir(ttsCacheDir, 'Cache', true);
    }
  } else if (
    deleteAction === 'both' &&
    (await fs.exists(getCoverFilename(book), 'Books'))
  ) {
    await fs.removeFile(getCoverFilename(book), 'Books');
  }

  if (deleteAction === 'local' || deleteAction === 'purge') {
    book.downloadedAt = null;
    return;
  }

  book.deletedAt = Date.now();
  book.downloadedAt = null;
  book.coverDownloadedAt = null;
  book.uploadedAt = null;
}
