'use client';

import React from 'react';
import type { CSSProperties } from 'react';
import {
  comicOverlayPolygonToCss,
  createComicOverlayBlocks,
  type ComicWorkspacePage,
} from '@/services/translators';

export interface ComicTranslationOverlayProps {
  page: ComicWorkspacePage;
  visible?: boolean;
  className?: string;
  onRegionSelect?: (regionId: string) => void;
}

/** Render editable-workspace translations without flattening the source page. */
const ComicTranslationOverlay: React.FC<ComicTranslationOverlayProps> = ({
  page,
  visible = true,
  className,
  onRegionSelect,
}) => {
  const blocks = createComicOverlayBlocks(page);
  if (!visible || blocks.length === 0) return null;

  return (
    <div
      aria-label='Comic translation overlay'
      className={className}
      data-comic-overlay-page={page.pageId}
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: visible ? 'auto' : 'none',
      }}
    >
      {blocks.map((block) => {
        const blockStyle = block.style;
        const style: CSSProperties = {
          position: 'absolute',
          left: `${(block.bounds.x / page.width) * 100}%`,
          top: `${(block.bounds.y / page.height) * 100}%`,
          width: `${(block.bounds.width / page.width) * 100}%`,
          height: `${(block.bounds.height / page.height) * 100}%`,
          clipPath: `polygon(${comicOverlayPolygonToCss(
            block.polygon.map((point) => ({
              x: point.x - block.bounds.x,
              y: point.y - block.bounds.y,
            })),
            block.bounds.width,
            block.bounds.height,
          )})`,
          color: blockStyle?.color ?? '#111827',
          backgroundColor: blockStyle?.backgroundColor ?? 'rgba(255, 255, 255, 0.94)',
          fontFamily: blockStyle?.fontFamily,
          fontSize: blockStyle?.fontSizePx ? `${blockStyle.fontSizePx}px` : undefined,
          lineHeight: blockStyle?.lineHeight,
          padding: blockStyle?.paddingPx ? `${blockStyle.paddingPx}px` : undefined,
          textAlign: blockStyle?.textAlign,
          writingMode:
            blockStyle?.writingMode ??
            (block.orientation === 'vertical' ? 'vertical-rl' : 'horizontal-tb'),
          transform: block.rotationDeg ? `rotate(${block.rotationDeg}deg)` : undefined,
          whiteSpace: 'pre-wrap',
          overflow: blockStyle?.fit === 'overflow' ? 'visible' : 'hidden',
          cursor: onRegionSelect ? 'pointer' : 'default',
          userSelect: visible ? 'text' : 'none',
          WebkitTextStroke:
            blockStyle?.outlineWidthPx && blockStyle.outlineColor
              ? `${blockStyle.outlineWidthPx}px ${blockStyle.outlineColor}`
              : undefined,
        };
        return (
          <button
            key={block.id}
            type='button'
            aria-label={`${block.sourceText}: ${block.translatedText}`}
            data-comic-region={block.id}
            onClick={() => onRegionSelect?.(block.id)}
            style={style}
          >
            {block.translatedText}
          </button>
        );
      })}
    </div>
  );
};

export default ComicTranslationOverlay;
