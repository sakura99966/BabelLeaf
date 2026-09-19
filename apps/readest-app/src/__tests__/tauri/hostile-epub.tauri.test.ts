import { expect, test } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { DocumentLoader } from '@/libs/document';
import type { Renderer } from '@/types/view';
import { sanitizeSvgDocument } from '@/services/transformers/sanitizer';

/** Locally authored adversarial corpus; no external book or network resource. */
test.each([
  'xhtml',
  'svg',
] as const)('native renderer isolates hostile %s spine content', async (kind) => {
  const marker = `nativeSpineProbe${kind}`;
  const attack = `parent.document.documentElement.setAttribute('${marker}', 'executed')`;
  const content =
    kind === 'svg'
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" onload="${attack}"><script>${attack}</script><text x="20" y="40">Safe reading text</text><rect width="10" height="10"/></svg>`
      : `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Probe</title></head><body onload="${attack}"><script>${attack}</script><p id="text">Safe reading text</p><a href="#text">Local link</a></body></html>`;
  const mime = kind === 'svg' ? 'image/svg+xml' : 'application/xhtml+xml';
  const entries = {
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(
      '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    ),
    'book.opf': strToU8(
      `<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">local-probe</dc:identifier><dc:title>Local probe</dc:title><dc:language>en</dc:language>${kind === 'svg' ? '<meta property="rendition:layout">pre-paginated</meta>' : ''}</metadata><manifest><item id="chapter" href="chapter.${kind}" media-type="${mime}"/></manifest><spine><itemref idref="chapter"/></spine></package>`,
    ),
    [`chapter.${kind}`]: strToU8(content),
  };
  const bytes = zipSync(entries);
  const { book } = await new DocumentLoader(
    new File([bytes.buffer as ArrayBuffer], 'probe.epub'),
  ).open();
  // SVG exercises the production sanitization boundary; XHTML deliberately
  // bypasses the sanitizer to test the renderer's independent sandbox layer.
  book.transformTarget?.addEventListener('data', (event: Event) => {
    const detail = (event as CustomEvent<{ type: string; data: string | Promise<string> }>).detail;
    if (detail.type === 'image/svg+xml')
      detail.data = Promise.resolve(detail.data).then(sanitizeSvgDocument);
  });
  await import('foliate-js/paginator.js');
  await import('foliate-js/fixed-layout.js');
  const renderer = document.createElement(
    kind === 'svg' ? 'foliate-fxl' : 'foliate-paginator',
  ) as Renderer;
  Object.assign(renderer.style, { width: '800px', height: '600px', position: 'absolute' });
  document.body.appendChild(renderer);
  try {
    await renderer.open(book);
    await renderer.goTo({ index: 0 });
    // Fixed layout includes the empty facing-page frame in getContents().
    const chapter = () => renderer.getContents().find((item) => item.index === 0)?.doc;
    await expect.poll(() => chapter()?.documentElement.textContent).toContain('Safe reading text');
    const doc = chapter()!;
    expect(doc.documentElement.textContent).toContain('Safe reading text');
    const frame = doc.defaultView?.frameElement as HTMLIFrameElement | null;
    expect(frame?.sandbox.contains('allow-same-origin')).toBe(true);
    expect(frame?.sandbox.contains('allow-scripts')).toBe(false);
    expect(document.documentElement.getAttribute(marker)).toBeNull();
    if (kind === 'svg') expect(doc.querySelector('script, [onload]')).toBeNull();
    else {
      const range = doc.createRange();
      range.selectNodeContents(doc.querySelector('p')!);
      expect(range.toString()).toBe('Safe reading text');
      expect(doc.querySelector('a')?.getAttribute('href')).toContain('#text');
    }
  } finally {
    renderer.destroy();
    renderer.remove();
    document.documentElement.removeAttribute(marker);
  }
});
