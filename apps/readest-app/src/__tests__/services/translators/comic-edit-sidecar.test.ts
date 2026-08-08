import { describe, expect, test } from 'vitest';
import {
  createEmptyComicEditSidecar,
  parseComicEditSidecar,
  serializeComicEditSidecar,
  setComicEditPageLayout,
  setComicEditPageMask,
  type ComicTypesetLayout,
} from '@/services/translators';

const sidecar = () =>
  createEmptyComicEditSidecar({
    bookHash: 'book-1',
    sourceFormat: 'CBZ',
    pages: [{ pageId: 'page-1', pageIndex: 0, width: 100, height: 100 }],
    now: 100,
  });

const layout: ComicTypesetLayout = {
  version: 1,
  regionId: 'region-1',
  pageId: 'page-1',
  sourceText: 'source',
  translatedText: '译文',
  polygon: [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 50, y: 50 },
  ],
  bounds: { x: 0, y: 0, width: 50, height: 50 },
  style: { fontSizePx: 16, writingMode: 'horizontal-tb', direction: 'ltr' },
  lines: [{ text: '译文', x: 2, y: 2, width: 20, height: 20, fontSizePx: 16 }],
  fontSizePx: 16,
  direction: 'ltr',
  overflow: false,
  clippedCharacters: 0,
};

describe('comic edit sidecar', () => {
  test('stores mask and editable typeset layout without modifying source metadata', () => {
    let current = sidecar();
    current = setComicEditPageMask(current, 'page-1', {
      version: 1,
      width: 100,
      height: 100,
      operations: [{ kind: 'paint', points: [{ x: 1, y: 1 }], radius: 2 }],
    });
    current = setComicEditPageLayout(current, 'page-1', layout);
    const restored = parseComicEditSidecar(JSON.parse(serializeComicEditSidecar(current)));
    expect(restored.pages[0]?.mask?.operations).toHaveLength(1);
    expect(restored.pages[0]?.layouts[0]?.translatedText).toBe('译文');
    expect(JSON.stringify(restored)).not.toContain('apiKey');
  });

  test('rejects dimension changes and hostile style values', () => {
    expect(() =>
      setComicEditPageMask(sidecar(), 'page-1', {
        version: 1,
        width: 20,
        height: 20,
        operations: [],
      }),
    ).toThrow('dimensions');
    expect(() =>
      parseComicEditSidecar({
        ...sidecar(),
        pages: [
          {
            ...sidecar().pages[0],
            layouts: [{ ...layout, style: { fontSizePx: 1000 } }],
          },
        ],
      }),
    ).toThrow();
  });
});
