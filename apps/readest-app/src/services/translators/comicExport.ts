import { zipSync } from 'fflate';
import type { BaseDir, FileSystem } from '@/types/system';

/** Versioned, source-preserving export helpers for translated comic pages. */
export const COMIC_EXPORT_VERSION = 1 as const;
/** Export limits are deliberately below the renderer's worst-case RGBA cost. */
export const MAX_COMIC_EXPORT_PAGES = 2_000;
export const MAX_COMIC_EXPORT_PAGE_BYTES = 64 * 1024 * 1024;
export const MAX_COMIC_EXPORT_BYTES = 256 * 1024 * 1024;

export type ComicExportFormat = 'image-set' | 'cbz' | 'zip' | 'pdf';
export type ComicImageExtension = 'png' | 'jpg' | 'jpeg' | 'webp';

export interface ComicRenderedPage {
  pageId: string;
  pageIndex: number;
  extension: ComicImageExtension;
  mimeType: string;
  bytes: ArrayBuffer | Uint8Array;
}

export interface ComicExportInput {
  format: ComicExportFormat;
  outputName: string;
  pages: ComicRenderedPage[];
  sourcePath?: string;
  outputPath?: string;
}

export interface ComicExportFile {
  name: string;
  bytes: Uint8Array;
  mimeType: string;
}

export interface ComicExportResult {
  version: typeof COMIC_EXPORT_VERSION;
  format: ComicExportFormat;
  fileName: string;
  pageCount: number;
  totalBytes: number;
  files: ComicExportFile[];
  archive?: Uint8Array;
}

export class ComicExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComicExportError';
  }
}

const pathPart = (value: string, field: string): string => {
  const normalized = value.trim();
  if (!normalized || normalized === '.' || normalized === '..' || /[\\/\0]/.test(normalized)) {
    throw new ComicExportError(`Invalid comic export ${field}`);
  }
  return normalized.replace(/[^a-zA-Z0-9._-]+/g, '_');
};

const outputPathPart = (value: string): string => {
  const normalized = value.trim().replace(/\\/g, '/');
  if (
    !normalized ||
    normalized.startsWith('/') ||
    /^[a-zA-Z]:\//.test(normalized) ||
    normalized.includes('\0')
  ) {
    throw new ComicExportError('Invalid comic export output path');
  }
  const parts = normalized.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new ComicExportError('Invalid comic export output path');
  }
  return parts.map((part) => safeName(part, 'output path segment')).join('/');
};

const safeName = (value: string, field: string): string => {
  const normalized = pathPart(value, field);
  if (normalized.length > 180) throw new ComicExportError(`Comic export ${field} is too long`);
  return normalized;
};

const normalizePath = (value: string): string =>
  value
    .trim()
    .replace(/[\\/]+/g, '/')
    .replace(/\/$/, '')
    .toLocaleLowerCase();

const toBytes = (value: ArrayBuffer | Uint8Array): Uint8Array =>
  value instanceof Uint8Array ? value.slice() : new Uint8Array(value.slice(0));

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => bytes.slice().buffer;

const extensionFor = (extension: ComicImageExtension): string =>
  extension === 'jpeg' ? 'jpg' : extension;

const archiveExtension = (format: Exclude<ComicExportFormat, 'image-set'>): string =>
  format === 'cbz' ? 'cbz' : format === 'pdf' ? 'pdf' : 'zip';

const concatBytes = (parts: readonly Uint8Array[]): Uint8Array => {
  const length = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
};

const ascii = (value: string): Uint8Array => new TextEncoder().encode(value);

/** Read the dimensions from a baseline/progressive JPEG without decoding it. */
const readJpegDimensions = (bytes: Uint8Array): { width: number; height: number } => {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new ComicExportError('PDF export currently requires JPEG page bytes');
  }
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === undefined) break;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const segmentLength = (bytes[offset]! << 8) | bytes[offset + 1]!;
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    const isFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isFrame && segmentLength >= 7) {
      const height = (bytes[offset + 3]! << 8) | bytes[offset + 4]!;
      const width = (bytes[offset + 5]! << 8) | bytes[offset + 6]!;
      if (width > 0 && height > 0) return { width, height };
    }
    offset += segmentLength;
  }
  throw new ComicExportError('PDF export could not read JPEG dimensions');
};

interface PdfObject {
  body: Uint8Array;
}

/**
 * Build a small, standards-compliant image-only PDF from JPEG pages.
 * The source files are never rewritten; the PDF is a newly generated artifact.
 */
const createImagePdf = (files: readonly ComicExportFile[]): Uint8Array => {
  if (files.length === 0) throw new ComicExportError('PDF export has no pages');
  const objects: PdfObject[] = [];
  const add = (body: Uint8Array): number => {
    objects.push({ body });
    return objects.length;
  };

  const catalogId = add(new Uint8Array());
  const pagesId = add(new Uint8Array());
  const pageIds: number[] = [];
  const imageIds: number[] = [];
  const contentIds: number[] = [];

  for (const file of files) {
    if (!/^image\/(?:jpe?g)$/i.test(file.mimeType)) {
      throw new ComicExportError('PDF export currently requires JPEG page bytes');
    }
    const bytes = file.bytes;
    const { width, height } = readJpegDimensions(bytes);
    const imageId = add(
      concatBytes([
        ascii(
          `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
            `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.byteLength} >>\nstream\n`,
        ),
        bytes,
        ascii('\nendstream'),
      ]),
    );
    const content = ascii(`q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`);
    const contentId = add(
      concatBytes([
        ascii(`<< /Length ${content.byteLength} >>\nstream\n`),
        content,
        ascii('endstream'),
      ]),
    );
    const pageId = add(new Uint8Array());
    imageIds.push(imageId);
    contentIds.push(contentId);
    pageIds.push(pageId);
  }

  objects[catalogId - 1]!.body = ascii(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  objects[pagesId - 1]!.body = ascii(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`,
  );
  for (let index = 0; index < pageIds.length; index += 1) {
    const file = files[index]!;
    const { width, height } = readJpegDimensions(file.bytes);
    objects[pageIds[index]! - 1]!.body = ascii(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${width} ${height}] ` +
        `/Resources << /XObject << /Im0 ${imageIds[index]} 0 R >> >> ` +
        `/Contents ${contentIds[index]} 0 R >>`,
    );
  }

  const header = concatBytes([
    ascii('%PDF-1.4\n%'),
    new Uint8Array([0xff, 0xff, 0xff, 0xff]),
    ascii('\n'),
  ]);
  const parts: Uint8Array[] = [header];
  const offsets: number[] = [0];
  let position = header.byteLength;
  objects.forEach((object, index) => {
    offsets[index + 1] = position;
    const body = concatBytes([ascii(`${index + 1} 0 obj\n`), object.body, ascii('\nendobj\n')]);
    parts.push(body);
    position += body.byteLength;
  });
  const xrefOffset = position;
  parts.push(ascii(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`));
  for (let index = 1; index <= objects.length; index += 1) {
    parts.push(ascii(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`));
  }
  parts.push(
    ascii(
      `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
    ),
  );
  return concatBytes(parts);
};

const validatePages = (pages: ComicRenderedPage[]): ComicRenderedPage[] => {
  if (!Array.isArray(pages) || pages.length === 0 || pages.length > MAX_COMIC_EXPORT_PAGES) {
    throw new ComicExportError('Comic export page count exceeds resource limits');
  }
  const ids = new Set<string>();
  const indexes = new Set<number>();
  return [...pages]
    .sort(
      (left, right) => left.pageIndex - right.pageIndex || left.pageId.localeCompare(right.pageId),
    )
    .map((page, index) => {
      if (!page || typeof page !== 'object')
        throw new ComicExportError(`Invalid comic export page ${index}`);
      if (typeof page.pageId !== 'string' || !page.pageId.trim() || ids.has(page.pageId)) {
        throw new ComicExportError(`Invalid or duplicate comic export page id ${index}`);
      }
      if (
        !Number.isSafeInteger(page.pageIndex) ||
        page.pageIndex < 0 ||
        indexes.has(page.pageIndex)
      ) {
        throw new ComicExportError(`Invalid or duplicate comic export page index ${index}`);
      }
      if (!['png', 'jpg', 'jpeg', 'webp'].includes(page.extension)) {
        throw new ComicExportError(`Unsupported comic export image format ${index}`);
      }
      if (typeof page.mimeType !== 'string' || !/^image\/(png|jpe?g|webp)$/i.test(page.mimeType)) {
        throw new ComicExportError(`Invalid comic export image MIME type ${index}`);
      }
      const bytes = toBytes(page.bytes);
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_COMIC_EXPORT_PAGE_BYTES) {
        throw new ComicExportError(`Comic export page bytes exceed resource limits ${index}`);
      }
      ids.add(page.pageId);
      indexes.add(page.pageIndex);
      return { ...page, bytes };
    });
};

const fileNameFor = (page: ComicRenderedPage, ordinal: number): string => {
  const index = String(page.pageIndex).padStart(5, '0');
  const id = safeName(page.pageId, 'page id').slice(0, 96);
  return `${index}-${id || String(ordinal)}.${extensionFor(page.extension)}`;
};

const hasSensitiveText = (value: string): boolean =>
  /(?:bearer\s+|api[_-]?key|secret|password|token\s*[:=]|sk-[a-z0-9_-]{8,})/i.test(value);

export const exportComicPages = (input: ComicExportInput): ComicExportResult => {
  if (!input || typeof input !== 'object') throw new ComicExportError('Invalid comic export input');
  if (!['image-set', 'cbz', 'zip', 'pdf'].includes(input.format)) {
    throw new ComicExportError('Unsupported comic export format');
  }
  const outputName = safeName(input.outputName, 'output name');
  if (
    input.sourcePath &&
    input.outputPath &&
    normalizePath(input.sourcePath) === normalizePath(input.outputPath)
  ) {
    throw new ComicExportError('Comic export cannot overwrite the source file');
  }
  const pages = validatePages(input.pages);
  const files = pages.map((page, index) => ({
    name: fileNameFor(page, index),
    bytes: page.bytes as Uint8Array,
    mimeType: page.mimeType,
  }));
  const totalBytes = files.reduce((sum, file) => sum + file.bytes.byteLength, 0);
  if (totalBytes > MAX_COMIC_EXPORT_BYTES) {
    throw new ComicExportError('Comic export exceeds the total byte limit');
  }
  if (files.some((file) => hasSensitiveText(file.name))) {
    throw new ComicExportError('Comic export contains a sensitive file name');
  }
  if (input.format === 'image-set') {
    return {
      version: COMIC_EXPORT_VERSION,
      format: input.format,
      fileName: outputName,
      pageCount: files.length,
      totalBytes,
      files,
    };
  }
  if (input.format === 'pdf') {
    const pdf = createImagePdf(files);
    if (pdf.byteLength > MAX_COMIC_EXPORT_BYTES) {
      throw new ComicExportError('Comic PDF exceeds the total byte limit');
    }
    return {
      version: COMIC_EXPORT_VERSION,
      format: input.format,
      fileName: `${outputName.replace(/\.pdf$/i, '')}.pdf`,
      pageCount: files.length,
      totalBytes: pdf.byteLength,
      files,
      archive: pdf,
    };
  }
  const archive = zipSync(Object.fromEntries(files.map((file) => [file.name, file.bytes])), {
    level: 6,
  });
  if (archive.byteLength > MAX_COMIC_EXPORT_BYTES) {
    throw new ComicExportError('Comic archive exceeds the total byte limit');
  }
  return {
    version: COMIC_EXPORT_VERSION,
    format: input.format,
    fileName: `${outputName.replace(/\.(?:cbz|zip)$/i, '')}.${archiveExtension(input.format)}`,
    pageCount: files.length,
    totalBytes: archive.byteLength,
    files,
    archive,
  };
};

export const validateComicExportResult = (result: ComicExportResult): ComicExportResult => {
  if (result.version !== COMIC_EXPORT_VERSION)
    throw new ComicExportError('Unsupported comic export version');
  if (
    result.pageCount !== result.files.length ||
    result.pageCount < 1 ||
    result.pageCount > MAX_COMIC_EXPORT_PAGES
  ) {
    throw new ComicExportError('Comic export page count is invalid');
  }
  if (result.files.some((file) => !file.name || hasSensitiveText(file.name))) {
    throw new ComicExportError('Comic export file names are invalid');
  }
  const bytes = result.files.reduce((sum, file) => sum + file.bytes.byteLength, 0);
  if (bytes > MAX_COMIC_EXPORT_BYTES) throw new ComicExportError('Comic export is too large');
  if (result.format === 'image-set' && result.archive !== undefined) {
    throw new ComicExportError('Image-set export cannot contain an archive');
  }
  if (result.format !== 'image-set' && !(result.archive instanceof Uint8Array)) {
    throw new ComicExportError('Archive export is missing archive bytes');
  }
  return result;
};

export type ComicExportStorage = Pick<FileSystem, 'createDir' | 'writeFile'>;

/** Writes only the generated artifact; the source book is never modified. */
export const writeComicExport = async (
  fs: ComicExportStorage,
  result: ComicExportResult,
  outputPath: string,
  base: BaseDir = 'Data',
): Promise<void> => {
  const normalized = validateComicExportResult(result);
  const output = outputPathPart(outputPath);
  if (normalized.format === 'image-set') {
    await fs.createDir(output, base, true);
    for (const file of normalized.files) {
      await fs.writeFile(`${output}/${file.name}`, base, toArrayBuffer(file.bytes));
    }
    return;
  }
  if (!normalized.archive) throw new ComicExportError('Archive export is missing archive bytes');
  await fs.writeFile(output, base, toArrayBuffer(normalized.archive));
};
