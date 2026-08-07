import type { ComicWorkerPageInput } from './comicWorkerProtocol';
import { MAX_COMIC_WORKER_IMAGE_PIXELS, MAX_COMIC_WORKER_PAGES } from './comicWorkerProtocol';

export interface OcrPageSourceDescriptor {
  pageIndex: number;
  pageId: string;
  width: number;
  height: number;
  format: ComicWorkerPageInput['format'];
  /** A local path or app-scoped resource reference; never a remote URL. */
  localRef: string;
}

export class OcrSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OcrSourceError';
  }
}

const supportedFormats = new Set<ComicWorkerPageInput['format']>([
  'png',
  'jpeg',
  'webp',
  'avif',
  'pdf',
]);

const validatePage = (page: OcrPageSourceDescriptor): OcrPageSourceDescriptor => {
  if (!Number.isInteger(page.pageIndex) || page.pageIndex < 0) {
    throw new OcrSourceError(`Invalid OCR page index: ${page.pageId}`);
  }
  if (!page.pageId.trim() || !page.localRef.trim()) {
    throw new OcrSourceError('OCR page identity and local reference are required');
  }
  if (
    !Number.isInteger(page.width) ||
    !Number.isInteger(page.height) ||
    page.width < 1 ||
    page.height < 1 ||
    page.width * page.height > MAX_COMIC_WORKER_IMAGE_PIXELS
  ) {
    throw new OcrSourceError(`OCR page exceeds pixel limits: ${page.pageId}`);
  }
  if (!supportedFormats.has(page.format)) {
    throw new OcrSourceError(`Unsupported OCR page format: ${page.format}`);
  }
  return { ...page };
};

/** Validate and normalize a page manifest without reading or copying page bytes. */
export const createOcrPageInputs = (
  pages: OcrPageSourceDescriptor[],
): Array<ComicWorkerPageInput & { pageIndex: number }> => {
  if (pages.length === 0 || pages.length > MAX_COMIC_WORKER_PAGES) {
    throw new OcrSourceError('OCR page count exceeds resource limits');
  }
  const ids = new Set<string>();
  const indexes = new Set<number>();
  return pages.map((page) => {
    const normalized = validatePage(page);
    if (ids.has(normalized.pageId))
      throw new OcrSourceError(`Duplicate OCR page: ${normalized.pageId}`);
    if (indexes.has(normalized.pageIndex)) {
      throw new OcrSourceError(`Duplicate OCR page index: ${normalized.pageIndex}`);
    }
    ids.add(normalized.pageId);
    indexes.add(normalized.pageIndex);
    return normalized;
  });
};

export const inferOcrPageFormat = (name: string, mimeType = ''): ComicWorkerPageInput['format'] => {
  const extension = name.toLowerCase().split('.').pop() ?? '';
  if (mimeType === 'application/pdf' || extension === 'pdf') return 'pdf';
  if (mimeType === 'image/png' || extension === 'png') return 'png';
  if (mimeType === 'image/webp' || extension === 'webp') return 'webp';
  if (mimeType === 'image/avif' || extension === 'avif') return 'avif';
  if (
    mimeType === 'image/jpeg' ||
    mimeType === 'image/jpg' ||
    ['jpg', 'jpeg'].includes(extension)
  ) {
    return 'jpeg';
  }
  throw new OcrSourceError(`Unsupported OCR image extension: ${name}`);
};
