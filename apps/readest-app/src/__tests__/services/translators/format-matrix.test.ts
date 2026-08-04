import { beforeAll, describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DocumentLoader } from '@/libs/document';
import type { BookFormat } from '@/types/book';
import { diagnoseTranslationFormat, extractTranslationItems } from '@/services/translators';

const fixture = (name: string, type: string) => {
  const bytes = readFileSync(resolve(__dirname, '../../fixtures/data', name));
  return new File([bytes], name, { type });
};

describe('translation format matrix', () => {
  beforeAll(async () => {
    await import('foliate-js/pdf.js');
    const pdfjsLib = (globalThis as Record<string, unknown>)['pdfjsLib'] as {
      GlobalWorkerOptions: { workerSrc: string };
    };
    const vendorDir = join(process.cwd(), 'public/vendor');
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      `file://${join(vendorDir, 'pdfjs/pdf.worker.min.mjs')}`,
    ).href;
  });

  test.each([
    ['EPUB', 'sample-alice.epub', 'application/epub+zip'],
    ['PDF', 'sample-alice.pdf', 'application/pdf'],
    ['MOBI', 'sample-war-peace.mobi', 'application/x-mobipocket-ebook'],
    ['AZW', 'sample-war-peace.mobi', 'application/x-mobipocket-ebook'],
    ['AZW3', 'sample-war-peace.mobi', 'application/x-mobipocket-ebook'],
    ['FB2', 'sample-metadata.fb2', 'application/x-fictionbook+xml'],
    ['TXT', 'sample-alice.txt', 'text/plain'],
    ['MD', 'sample-alice.txt', 'text/plain'],
  ])(
    'extracts text from the supported %s route',
    async (format, fixtureName, type) => {
      const filename =
        format === 'AZW'
          ? 'sample-war-peace.azw'
          : format === 'AZW3'
            ? 'sample-war-peace.azw3'
            : format === 'MD'
              ? 'sample-alice.md'
              : fixtureName;
      const file = new File([fixture(fixtureName, type)], filename, {
        type: format === 'MD' ? 'text/markdown' : type,
      });
      const opened = await new DocumentLoader(file).open();
      const items = await extractTranslationItems(opened.book, {
        format: format as BookFormat,
        maxSegments: 20,
      });
      expect(items.length).toBeGreaterThan(0);
    },
    60000,
  );

  test('reports comic archives and OCR/DRM limitations explicitly', async () => {
    const file = fixture('sample-metadata.cbz', 'application/vnd.comicbook+zip');
    const opened = await new DocumentLoader(file).open();
    await expect(extractTranslationItems(opened.book, { format: 'CBZ' })).rejects.toMatchObject({
      code: 'image-only',
    });
    expect(diagnoseTranslationFormat('PDF', { segmentCount: 0 }).code).toBe('empty-text');
    expect(diagnoseTranslationFormat('EPUB', { error: new Error('DRM encrypted') }).code).toBe(
      'drm',
    );
    expect(diagnoseTranslationFormat('XYZ').code).toBe('unsupported');
  }, 30000);
});
