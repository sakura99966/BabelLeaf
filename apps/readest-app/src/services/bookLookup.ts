import type { Book, BookLookupIndex } from '@/types/book';
import type { OsPlatform } from '@/types/system';

const isRemoteUrl = (value: string): boolean => {
  try {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

export function buildBookLookupIndex(books: Book[], osPlatform?: OsPlatform): BookLookupIndex {
  const byHash = new Map<string, Book>();
  const byMetaKey = new Map<string, Book[]>();
  const byFilePath = new Map<string, Book>();
  for (const book of books) {
    byHash.set(book.hash, book);
    if (book.metaHash && !book.deletedAt) {
      const key = `${book.metaHash}:${book.format}`;
      const list = byMetaKey.get(key);
      if (list) list.push(book);
      else byMetaKey.set(key, [book]);
    }
    if (book.filePath && !isRemoteUrl(book.filePath) && !book.deletedAt) {
      const key = normalizeFilePathForIndex(book.filePath, osPlatform);
      if (key) byFilePath.set(key, book);
    }
  }
  return { byHash, byMetaKey, byFilePath };
}

export function normalizeFilePathForIndex(path: string, osPlatform?: OsPlatform): string {
  if (!path) return '';
  const caseInsensitive =
    osPlatform === 'macos' || osPlatform === 'ios' || osPlatform === 'windows';
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  return caseInsensitive ? normalized.toLowerCase() : normalized;
}

export interface ScannedFileEntry {
  fullPath: string;
  size: number;
}

export function selectNewImportableFiles(
  entries: ScannedFileEntry[],
  opts: {
    extensions: string[];
    minSizeBytes: number;
    existingPaths: Set<string>;
    osPlatform?: OsPlatform;
  },
): ScannedFileEntry[] {
  const extensions = new Set(opts.extensions.map((extension) => extension.toLowerCase()));
  return entries.filter((entry) => {
    const extension = entry.fullPath.split('.').pop()?.toLowerCase() ?? '';
    if (!extensions.has(extension)) return false;
    if (opts.minSizeBytes > 0 && entry.size < opts.minSizeBytes) return false;
    const key = normalizeFilePathForIndex(entry.fullPath, opts.osPlatform);
    return !!key && !opts.existingPaths.has(key);
  });
}

export function collectKnownSourcePaths(books: Book[], osPlatform?: OsPlatform): Set<string> {
  const paths = new Set<string>();
  for (const book of books) {
    for (const path of [book.filePath, ...(book.altFilePaths ?? [])]) {
      if (!path || isRemoteUrl(path)) continue;
      const key = normalizeFilePathForIndex(path, osPlatform);
      if (key) paths.add(key);
    }
  }
  return paths;
}
