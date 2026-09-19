import { expect, test, vi } from 'vitest';
import { collectComicExportPages } from '@/services/translators/comicExport';

test('stops rendering as soon as cumulative bytes exceed the budget', async () => {
  const render = vi.fn(async (id: number) => ({
    pageId: `${id}`,
    pageIndex: id,
    extension: 'png' as const,
    mimeType: 'image/png',
    bytes: new Uint8Array(6),
  }));
  await expect(collectComicExportPages([1, 2, 3], render, undefined, 10)).rejects.toThrow('limit');
  expect(render).toHaveBeenCalledTimes(2);
});

test('rejects too many pages before rendering and respects cancellation', async () => {
  const render = vi.fn();
  await expect(collectComicExportPages(new Array(2001), render)).rejects.toThrow('limit');
  expect(render).not.toHaveBeenCalled();
  const controller = new AbortController();
  controller.abort();
  await expect(collectComicExportPages([1], render, controller.signal)).rejects.toThrow();
});
