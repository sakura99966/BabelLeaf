import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import ComicTranslationOverlay from '@/app/reader/components/ComicTranslationOverlay';
import OcrTextLayer from '@/app/reader/components/OcrTextLayer';
import type { ComicWorkspacePage, OcrPageRecord } from '@/services/translators';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const comicPage: ComicWorkspacePage = {
  pageId: 'page-1',
  pageIndex: 0,
  width: 1000,
  height: 1500,
  format: 'png',
  localRef: 'Books/book-1/page-1.png',
  updatedAt: 1,
  regions: [
    {
      id: 'region-1',
      pageId: 'page-1',
      source: 'ocr',
      machine: {
        id: 'region-1',
        pageId: 'page-1',
        polygon: [
          { x: 100, y: 150 },
          { x: 400, y: 150 },
          { x: 400, y: 450 },
          { x: 100, y: 450 },
        ],
        orientation: 'vertical',
        language: 'ja',
        text: ' 原文 ',
        readingOrder: 0,
        engine: 'test-ocr',
      },
      machineRevision: 1,
      translation: {
        sourceText: '原文',
        sourceRevision: 1,
        targetLang: 'zh-CN',
        status: 'translated',
        provider: 'test-provider',
        promptVersion: 'test-v1',
        translatedText: ' 译文 ',
        updatedAt: 1,
      },
      overlay: {
        style: {
          color: '#123456',
          backgroundColor: '#ffffff',
          fontSizePx: 24,
          lineHeight: 1.4,
          paddingPx: 3,
          textAlign: 'center',
          outlineColor: '#000000',
          outlineWidthPx: 1,
          fit: 'overflow',
        },
        updatedAt: 1,
      },
      reviewStatus: 'unreviewed',
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 'stale-region',
      pageId: 'page-1',
      source: 'manual',
      machineRevision: 0,
      manual: {
        revision: 1,
        updatedAt: 1,
        polygon: [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
          { x: 50, y: 50 },
        ],
        orientation: 'horizontal',
        text: '旧原文',
        readingOrder: 1,
      },
      translation: {
        sourceText: '旧原文',
        sourceRevision: 1,
        targetLang: 'zh-CN',
        status: 'translated',
        provider: 'test-provider',
        promptVersion: 'test-v1',
        translatedText: '旧译文',
        stale: true,
        updatedAt: 1,
      },
      reviewStatus: 'corrected',
      createdAt: 1,
      updatedAt: 1,
    },
  ],
};

const ocrPage: Pick<OcrPageRecord, 'pageId' | 'width' | 'height' | 'regions'> = {
  pageId: 'page-1',
  width: 1000,
  height: 1500,
  regions: [
    {
      id: 'second',
      pageId: 'page-1',
      polygon: [
        { x: 600, y: 600 },
        { x: 900, y: 600 },
        { x: 900, y: 900 },
      ],
      orientation: 'horizontal',
      language: 'en',
      text: ' World ',
      readingOrder: 1,
      engine: 'test-ocr',
    },
    {
      id: 'first',
      pageId: 'page-1',
      polygon: [
        { x: -50, y: 150 },
        { x: 200, y: 150 },
        { x: 200, y: 450 },
      ],
      orientation: 'vertical',
      language: 'ja',
      text: ' 縦 書き ',
      readingOrder: 0,
      engine: 'test-ocr',
    },
    {
      id: 'blank',
      pageId: 'page-1',
      polygon: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
      orientation: 'horizontal',
      text: '   ',
      readingOrder: 2,
      engine: 'test-ocr',
    },
  ],
};

describe('ComicTranslationOverlay', () => {
  test('renders only current translations with page-relative styling and selection', () => {
    const onRegionSelect = vi.fn();
    const { container } = render(
      <ComicTranslationOverlay
        page={comicPage}
        className='overlay-class'
        onRegionSelect={onRegionSelect}
      />,
    );

    const overlay = screen.getByLabelText('Comic translation overlay');
    const button = screen.getByRole('button', { name: '原文: 译文' });
    expect(overlay.className).toBe('overlay-class');
    expect(container.querySelectorAll('[data-comic-region]')).toHaveLength(1);
    expect(button.getAttribute('data-comic-region')).toBe('region-1');
    expect(button.textContent).toBe('译文');
    expect(button.style.left).toBe('10%');
    expect(button.style.top).toBe('10%');
    expect(button.style.width).toBe('30%');
    expect(button.style.height).toBe('20%');
    expect(button.style.color).toBe('rgb(18, 52, 86)');
    expect(button.style.backgroundColor).toBe('rgb(255, 255, 255)');
    expect(button.style.fontSize).toBe('24px');
    expect(button.style.writingMode).toBe('vertical-rl');
    expect(button.style.overflow).toBe('visible');
    expect(button.style.clipPath).toContain('polygon(');
    expect(button.style.webkitTextStroke).toBe('1px #000000');

    fireEvent.click(button);
    expect(onRegionSelect).toHaveBeenCalledWith('region-1');
  });

  test('does not expose a disabled or empty overlay', () => {
    const { rerender } = render(<ComicTranslationOverlay page={comicPage} visible={false} />);
    expect(screen.queryByLabelText('Comic translation overlay')).toBeNull();

    rerender(<ComicTranslationOverlay page={{ ...comicPage, regions: [] }} />);
    expect(screen.queryByLabelText('Comic translation overlay')).toBeNull();
  });
});

describe('OcrTextLayer', () => {
  test('renders selectable OCR regions in reading order with bounded page-relative geometry', () => {
    const { container } = render(<OcrTextLayer page={ocrPage} className='ocr-class' />);

    const layer = screen.getByLabelText('OCR text layer');
    const regions = Array.from(container.querySelectorAll<HTMLElement>('[data-ocr-region]'));
    expect(layer.className).toBe('ocr-class');
    expect(regions.map((region) => region.dataset['ocrRegion'])).toEqual(['first', 'second']);
    expect(regions[0]!.getAttribute('lang')).toBe('ja');
    expect(regions[0]!.getAttribute('aria-label')).toBe('縦 書き');
    expect(regions[0]!.style.left).toBe('0%');
    expect(regions[0]!.style.top).toBe('10%');
    expect(regions[0]!.style.width).toBe('20%');
    expect(regions[0]!.style.height).toBe('20%');
    expect(regions[0]!.style.writingMode).toBe('vertical-rl');
    expect(regions[0]!.style.clipPath).toContain('polygon(');
    expect(regions[1]!.getAttribute('lang')).toBe('en');
    expect(regions[1]!.textContent).toBe('World');
  });

  test('does not expose a disabled or empty text layer', () => {
    const { rerender } = render(<OcrTextLayer page={ocrPage} visible={false} />);
    expect(screen.queryByLabelText('OCR text layer')).toBeNull();

    rerender(<OcrTextLayer page={{ ...ocrPage, regions: [] }} />);
    expect(screen.queryByLabelText('OCR text layer')).toBeNull();
  });
});
