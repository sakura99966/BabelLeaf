import { describe, expect, test } from 'vitest';
import {
  ComicEditingSession,
  createEmptyComicEditSidecar,
  type ComicRgbaImage,
} from '@/services/translators';

const image: ComicRgbaImage = {
  width: 10,
  height: 10,
  data: new Uint8Array(10 * 10 * 4),
};

describe('comic editing facade', () => {
  test('persists cleanup edits through a sidecar checkpoint', async () => {
    const saved: number[] = [];
    const session = new ComicEditingSession({
      sidecar: createEmptyComicEditSidecar({
        bookHash: 'book-1',
        sourceFormat: 'CBZ',
        pages: [{ pageId: 'page-1', pageIndex: 0, width: 10, height: 10 }],
      }),
      checkpoint: {
        save: async (sidecar) => {
          saved.push(sidecar.revision);
        },
      },
    });
    const result = await session.cleanupPage('page-1', image, {
      version: 1,
      width: 10,
      height: 10,
      operations: [{ kind: 'paint', points: [{ x: 5, y: 5 }], radius: 1 }],
    });
    expect(result.sidecar.pages[0]?.mask).toBeDefined();
    expect(saved.length).toBe(1);
  });
});
