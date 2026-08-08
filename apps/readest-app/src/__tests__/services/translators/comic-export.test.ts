import { unzipSync } from 'fflate';
import { describe, expect, test } from 'vitest';
import {
  exportComicPages,
  validateComicExportResult,
  writeComicExport,
  type ComicExportStorage,
} from '@/services/translators';

const page = (pageIndex: number, pageId = `page-${pageIndex}`) => ({
  pageId,
  pageIndex,
  extension: 'png' as const,
  mimeType: 'image/png',
  bytes: new Uint8Array([pageIndex, 1, 2]),
});

const jpegPage = (pageIndex: number) => ({
  pageId: `jpeg-${pageIndex}`,
  pageIndex,
  extension: 'jpg' as const,
  mimeType: 'image/jpeg',
  // SOI + SOF0 (1x1 RGB) + EOI. The PDF writer embeds the bytes unchanged.
  bytes: new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03, 0x01, 0x11, 0x00, 0x02,
    0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9,
  ]),
});

describe('comic export', () => {
  test('creates deterministic CBZ and preserves page names', () => {
    const result = exportComicPages({
      format: 'cbz',
      outputName: 'translated.cbz',
      pages: [page(1), page(0)],
    });
    expect(result.fileName).toBe('translated.cbz');
    expect(result.archive).toBeInstanceOf(Uint8Array);
    const entries = unzipSync(result.archive!);
    expect(Object.keys(entries)).toEqual(['00000-page-0.png', '00001-page-1.png']);
  });

  test('writes image sets to a separate output directory', async () => {
    const writes = new Map<string, ArrayBuffer>();
    const storage: ComicExportStorage = {
      createDir: async () => undefined,
      writeFile: async (path, _base, content) => {
        writes.set(path, content as ArrayBuffer);
      },
    };
    const result = exportComicPages({ format: 'image-set', outputName: 'set', pages: [page(0)] });
    await writeComicExport(storage, result, 'exports/set');
    expect([...writes.keys()]).toEqual(['exports/set/00000-page-0.png']);
  });

  test('rejects source overwrite and invalid output artifacts', () => {
    expect(() =>
      exportComicPages({
        format: 'zip',
        outputName: 'same.zip',
        sourcePath: 'Books/source.cbz',
        outputPath: 'Books/source.cbz',
        pages: [page(0)],
      }),
    ).toThrow('overwrite');
    const result = exportComicPages({ format: 'zip', outputName: 'translated', pages: [page(0)] });
    expect(validateComicExportResult(result).pageCount).toBe(1);
  });

  test('creates a separate image-only PDF from JPEG pages', () => {
    const result = exportComicPages({
      format: 'pdf',
      outputName: 'translated.pdf',
      pages: [jpegPage(0)],
    });
    expect(result.fileName).toBe('translated.pdf');
    expect(new TextDecoder().decode(result.archive?.slice(0, 8))).toBe('%PDF-1.4');
    expect(validateComicExportResult(result).format).toBe('pdf');
  });
});
