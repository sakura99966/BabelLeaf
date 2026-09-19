import { expect, test } from 'vitest';
import { gzipSync } from 'fflate';
import { sanitizeSvgDocument } from '@/services/transformers/sanitizer';
import { loadDictBody } from '@/services/dictionaries/dictZip';
import { exportComicArchive } from '@/services/translators/comicExportWorker';

test('sanitizes active SVG content without removing ordinary drawing content', () => {
  const result = sanitizeSvgDocument(
    `<svg xmlns="http://www.w3.org/2000/svg" onload="parent.hacked=1"><script>parent.hacked=1</script><foreignObject><iframe srcdoc="bad"></iframe></foreignObject><rect width="10" height="10"/><text>Hello</text></svg>`,
  );
  expect(result).not.toMatch(/script|onload|foreignObject|iframe|srcdoc/);
  expect(result).toContain('<rect');
  expect(result).toContain('Hello');
});

test('native browser gzip stream enforces output budget and supports valid dictionaries', async () => {
  const bytes = gzipSync(new TextEncoder().encode('hello dictionary'));
  const blob = new Blob([bytes]);
  await expect(loadDictBody(blob, { maxOutputBytes: 4 })).rejects.toThrow('limit');
  const body = await loadDictBody(blob);
  expect(new TextDecoder().decode(await body.read(0, 5))).toBe('hello');
});

test('comic export worker produces an archive and transfers page ownership', async () => {
  const bytes = new Uint8Array([1, 2, 3]).buffer;
  const result = await exportComicArchive({
    format: 'cbz',
    outputName: 'test.cbz',
    pages: [{ pageId: 'page', pageIndex: 0, extension: 'png', mimeType: 'image/png', bytes }],
  });
  expect(bytes.byteLength).toBe(0);
  expect(result.fileName).toBe('test.cbz');
  expect(result.archive.byteLength).toBeGreaterThan(3);
});
