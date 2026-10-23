import { expect, it, vi } from 'vitest';
import { DocumentLoader } from '@/libs/document';

it('fully releases a rendered PDF through the pinned PDF.js loading task', async () => {
  const response = await fetch(new URL('../fixtures/data/sample-alice.pdf', import.meta.url));
  const file = new File([await response.arrayBuffer()], 'sample-alice.pdf', {
    type: 'application/pdf',
  });
  const { book } = await new DocumentLoader(file).open();
  console.info('PDF lifecycle: opened');
  expect((await book.getCover())?.size).toBeGreaterThan(0);
  console.info('PDF lifecycle: cover rendered');
  expect((await book.sections[0]!.createDocument()).body.textContent?.length).toBeGreaterThan(10);
  console.info('PDF lifecycle: text extracted');
  if (!('destroy' in book) || typeof book.destroy !== 'function')
    throw new Error('Missing PDF resource disposal');
  const disposed: unknown = book.destroy();
  expect(disposed).toBeInstanceOf(Promise);
  await expect(disposed).resolves.toBeUndefined();
  console.info('PDF lifecycle: disposed');
  await expect(book.destroy()).resolves.toBeUndefined();
}, 20000);

it('rasterizes a background cover without requiring window animation frames', async () => {
  const response = await fetch(new URL('../fixtures/data/sample-alice.pdf', import.meta.url));
  const file = new File([await response.arrayBuffer()], 'sample-alice.pdf', {
    type: 'application/pdf',
  });
  const { book } = await new DocumentLoader(file).open();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const animation = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
  try {
    const deadline = new Promise<never>((_done, reject) => {
      timeout = setTimeout(
        () => reject(new Error('Background cover waited for a window animation frame')),
        2000,
      );
    });
    const cover = await Promise.race([book.getCover(), deadline]);
    expect(cover?.size).toBeGreaterThan(0);
  } finally {
    animation.mockRestore();
    clearTimeout(timeout);
    await book.destroy?.();
  }
}, 20000);
