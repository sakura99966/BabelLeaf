'use client';

import React from 'react';
import type { CSSProperties } from 'react';
import { createOcrTextLayerBlocks, ocrPolygonToCss } from '@/services/translators';
import type { OcrPageRecord } from '@/services/translators';

export interface OcrTextLayerProps {
  page: Pick<OcrPageRecord, 'pageId' | 'width' | 'height' | 'regions'>;
  visible?: boolean;
  className?: string;
}

/**
 * A transparent, selectable OCR overlay. The source image remains untouched;
 * callers place this layer over a page-sized image or PDF canvas.
 */
const OcrTextLayer: React.FC<OcrTextLayerProps> = ({ page, visible = true, className }) => {
  const blocks = createOcrTextLayerBlocks(page);
  if (blocks.length === 0) return null;

  return (
    <div
      aria-label='OCR text layer'
      className={className}
      data-ocr-page={page.pageId}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: visible ? 'auto' : 'none',
        userSelect: visible ? 'text' : 'none',
      }}
    >
      {blocks.map((block) => {
        const style: CSSProperties = {
          position: 'absolute',
          left: `${(block.bounds.x / page.width) * 100}%`,
          top: `${(block.bounds.y / page.height) * 100}%`,
          width: `${(block.bounds.width / page.width) * 100}%`,
          height: `${(block.bounds.height / page.height) * 100}%`,
          clipPath: `polygon(${ocrPolygonToCss(
            block.polygon.map((point) => ({
              x: point.x - block.bounds.x,
              y: point.y - block.bounds.y,
            })),
            block.bounds.width,
            block.bounds.height,
          )})`,
          color: 'transparent',
          backgroundColor: visible ? 'rgba(255, 255, 255, 0.001)' : 'transparent',
          cursor: visible ? 'text' : 'default',
          writingMode: block.orientation === 'vertical' ? 'vertical-rl' : 'horizontal-tb',
          whiteSpace: 'pre-wrap',
          overflow: 'hidden',
        };
        return (
          <span
            key={block.id}
            aria-label={block.text}
            data-ocr-region={block.id}
            lang={block.language}
            style={style}
          >
            {block.text}
          </span>
        );
      })}
    </div>
  );
};

export default OcrTextLayer;
