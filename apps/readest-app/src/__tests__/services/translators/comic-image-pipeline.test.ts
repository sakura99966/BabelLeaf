import { describe, expect, test } from 'vitest';
import {
  cleanupComicImage,
  createEmptyComicMask,
  expandComicMask,
  featherComicMask,
  parseComicMaskSnapshot,
  rasterizeComicMask,
  type ComicRgbaImage,
} from '@/services/translators';

const image = (width = 5, height = 5): ComicRgbaImage => ({
  width,
  height,
  data: new Uint8Array(width * height * 4).map((_, index) => (index % 4 === 3 ? 255 : index / 4)),
});

describe('comic image pipeline', () => {
  test('rasterizes paint and erase strokes deterministically', () => {
    const snapshot = parseComicMaskSnapshot({
      version: 1,
      width: 5,
      height: 5,
      operations: [
        { kind: 'paint', points: [{ x: 2, y: 2 }], radius: 1, opacity: 255 },
        { kind: 'erase', points: [{ x: 2, y: 2 }], radius: 0.5 },
      ],
    });
    const mask = rasterizeComicMask(snapshot);
    expect(mask[2 * 5 + 2]).toBe(0);
    expect(mask[1 * 5 + 2]).toBe(255);
  });

  test('expands and feathers without changing dimensions', () => {
    const mask = createEmptyComicMask(5, 5);
    mask[2 * 5 + 2] = 255;
    const expanded = expandComicMask(mask, 5, 5, 1);
    const feathered = featherComicMask(expanded, 5, 5, 1);
    expect(expanded).toHaveLength(25);
    expect(feathered).toHaveLength(25);
    expect(feathered[2 * 5 + 2]).toBeGreaterThan(0);
    expect(feathered[0]).toBeLessThan(feathered[2 * 5 + 2]!);
  });

  test('fills only masked pixels and leaves source image untouched', async () => {
    const source = image();
    source.data.fill(0);
    source.data[12 * 4] = 200;
    source.data[11 * 4] = 10;
    source.data[13 * 4] = 20;
    const original = source.data.slice();
    const mask = createEmptyComicMask(5, 5);
    mask[2 * 5 + 2] = 255;
    const result = await cleanupComicImage(source, mask, { inpaintRadius: 1 });
    expect(result.changedPixels).toBe(1);
    expect(source.data).toEqual(original);
    expect(result.image.data[12 * 4]).not.toBe(original[12 * 4]);
  });

  test('requires a local worker for optional inpainting and honors cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      cleanupComicImage(image(), new Uint8Array(25), { signal: controller.signal }),
    ).rejects.toThrow('cancelled');
    const mask = createEmptyComicMask(5, 5);
    mask[12] = 255;
    await expect(cleanupComicImage(image(), mask, { mode: 'inpaint' })).rejects.toThrow(
      'inpainting worker',
    );
    const workerResult = await cleanupComicImage(
      image(),
      mask,
      { mode: 'inpaint' },
      {
        process: async ({ image: input }) => ({ ...input, data: input.data.slice() }),
      },
    );
    expect(workerResult.mode).toBe('inpaint');
    expect(workerResult.changedPixels).toBe(1);
  });
});
