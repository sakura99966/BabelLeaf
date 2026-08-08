import { describe, expect, test } from 'vitest';
import {
  layoutComicText,
  parseComicTypesetStyle,
  type ComicOverlayBlock,
} from '@/services/translators';

const region: ComicOverlayBlock = {
  id: 'region-1',
  pageId: 'page-1',
  sourceText: 'source',
  translatedText: '这是需要排版的翻译文本',
  polygon: [
    { x: 0, y: 0 },
    { x: 120, y: 0 },
    { x: 120, y: 90 },
  ],
  bounds: { x: 0, y: 0, width: 120, height: 90 },
  orientation: 'horizontal',
  readingOrder: 0,
  rotationDeg: 0,
};

describe('comic typesetting', () => {
  test('shrinks text to fit and produces deterministic line geometry', () => {
    const layout = layoutComicText({ region, style: { fontSizePx: 48, fit: 'shrink' } });
    expect(layout.lines.length).toBeGreaterThan(0);
    expect(layout.fontSizePx).toBeLessThan(48);
    expect(layout.lines.every((line) => line.x >= 0 && line.y >= 0)).toBe(true);
  });

  test('supports RTL and vertical CJK direction modes', () => {
    const rtl = layoutComicText({
      region: { ...region, translatedText: 'abc' },
      style: { direction: 'rtl' },
    });
    expect(rtl.direction).toBe('rtl');
    expect(rtl.lines[0]?.text).toBe('cba');
    const vertical = layoutComicText({
      region,
      style: { writingMode: 'vertical-rl', fontSizePx: 16, fit: 'overflow' },
    });
    expect(vertical.direction).toBe('ttb');
    expect(vertical.lines[0]?.text).toBe('这');
    expect(vertical.lines[0]?.y).toBeLessThan(vertical.lines[1]?.y ?? 0);
  });

  test('rejects hostile persisted styles and oversized text', () => {
    expect(() => parseComicTypesetStyle({ fontSizePx: 1000 })).toThrow();
    expect(() =>
      layoutComicText({
        region: { ...region, translatedText: 'x'.repeat(500_001) },
      }),
    ).toThrow('resource limits');
  });
});
