'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import type { ComicPoint } from '@/services/translators';

export interface ComicPolygonEditorProps {
  width: number;
  height: number;
  polygon: readonly ComicPoint[];
  onCommit: (polygon: ComicPoint[]) => void;
}

const MIN_POINTS = 3;

const clamp = (value: number, maximum: number): number =>
  Math.max(0, Math.min(Math.max(0, maximum), value));

/**
 * Pointer-editable polygon handles for the active OCR region.
 *
 * The SVG is an interaction layer only: the source image and OCR sidecar are
 * never mutated until the user releases a handle, at which point the caller
 * persists the validated polygon through the workspace service.
 */
const ComicPolygonEditor: React.FC<ComicPolygonEditorProps> = ({
  width,
  height,
  polygon,
  onCommit,
}) => {
  const _ = useTranslation();
  const svgRef = useRef<SVGSVGElement>(null);
  const [points, setPoints] = useState<ComicPoint[]>(() => polygon.map((point) => ({ ...point })));
  const pointsRef = useRef(points);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const draggingIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (draggingIndex === null) {
      const next = polygon.map((point) => ({ ...point }));
      pointsRef.current = next;
      setPoints(next);
    }
  }, [draggingIndex, polygon]);

  const pointFromEvent = (event: React.PointerEvent<SVGCircleElement>): ComicPoint => {
    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clamp(((event.clientX - rect.left) / Math.max(1, rect.width)) * width, width),
      y: clamp(((event.clientY - rect.top) / Math.max(1, rect.height)) * height, height),
    };
  };

  const commit = () => {
    if (pointsRef.current.length >= MIN_POINTS)
      onCommit(pointsRef.current.map((point) => ({ ...point })));
    draggingIndexRef.current = null;
    setDraggingIndex(null);
  };

  if (points.length < MIN_POINTS) return null;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio='none'
      className='pointer-events-none absolute inset-0 z-10 h-full w-full'
      aria-label={_('Comic polygon editor')}
      role='application'
    >
      <polygon
        points={points.map((point) => `${point.x},${point.y}`).join(' ')}
        fill='rgba(37, 99, 235, 0.12)'
        stroke='rgb(37, 99, 235)'
        strokeWidth={Math.max(2, Math.min(width, height) / 350)}
        vectorEffect='non-scaling-stroke'
        className='pointer-events-none'
      />
      {points.map((point, index) => (
        <circle
          key={index}
          cx={point.x}
          cy={point.y}
          r={Math.max(6, Math.min(width, height) / 70)}
          fill='rgb(255, 255, 255)'
          stroke='rgb(37, 99, 235)'
          strokeWidth={2}
          vectorEffect='non-scaling-stroke'
          className='pointer-events-auto cursor-move touch-none'
          tabIndex={0}
          role='button'
          aria-label={`${_('Move polygon point')} ${index + 1}`}
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            draggingIndexRef.current = index;
            setDraggingIndex(index);
          }}
          onPointerMove={(event) => {
            if (draggingIndexRef.current !== index) return;
            const next = pointFromEvent(event);
            const updated = pointsRef.current.map((candidate, candidateIndex) =>
              candidateIndex === index ? next : candidate,
            );
            pointsRef.current = updated;
            setPoints(updated);
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            if (draggingIndexRef.current === index) commit();
          }}
          onPointerCancel={() => {
            const restored = polygon.map((candidate) => ({ ...candidate }));
            pointsRef.current = restored;
            setPoints(restored);
            draggingIndexRef.current = null;
            setDraggingIndex(null);
          }}
        />
      ))}
    </svg>
  );
};

export default ComicPolygonEditor;
