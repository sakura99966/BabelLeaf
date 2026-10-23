import { expect, it } from 'vitest';
import { DocumentLoader } from '@/libs/document';

it('fully releases a rendered PDF through the pinned PDF.js loading task', async () => {
  const response = await fetch(new URL('../fixtures/data/sample-alice.pdf', import.meta.url));
  const file = new File([await response.arrayBuffer()], 'sample-alice.pdf', {
    type: 'application/pdf',
  });
  const { book } = await new DocumentLoader(file).open();
  expect((await book.getCover())?.size).toBeGreaterThan(0);
  expect((await book.sections[0]!.createDocument()).body.textContent?.length).toBeGreaterThan(10);
  if (!('destroy' in book) || typeof book.destroy !== 'function')
    throw new Error('Missing PDF resource disposal');
  const disposed: unknown = book.destroy();
  expect(disposed).toBeInstanceOf(Promise);
  await expect(disposed).resolves.toBeUndefined();
  await expect(book.destroy()).resolves.toBeUndefined();
}, 20000);
