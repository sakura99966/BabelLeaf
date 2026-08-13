'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  COMIC_IMAGE_PIPELINE_VERSION,
  type ComicMaskOperationKind,
  type ComicMaskPoint,
  type ComicMaskSnapshot,
} from '@/services/translators';
import { useTranslation } from '@/hooks/useTranslation';

export interface ComicMaskEditorProps {
  width: number;
  height: number;
  mask?: ComicMaskSnapshot;
  onChange: (mask: ComicMaskSnapshot) => void;
}

const MAX_STROKE_POINTS = 512;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.max(minimum, Math.min(maximum, value));

/** Local, bounded mask editor. It only writes stroke metadata to the edit sidecar. */
const ComicMaskEditor: React.FC<ComicMaskEditorProps> = ({ width, height, mask, onChange }) => {
  const _ = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokeRef = useRef<ComicMaskPoint[]>([]);
  const [kind, setKind] = useState<ComicMaskOperationKind>('paint');
  const [radius, setRadius] = useState(12);
  const [opacity, setOpacity] = useState(255);
  const [stroke, setStroke] = useState<ComicMaskPoint[]>([]);
  const [drawing, setDrawing] = useState(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cssWidth = Math.max(1, rect.width);
    const cssHeight = Math.max(1, rect.height);
    const dpr = Math.max(1, Math.min(2, globalThis.devicePixelRatio || 1));
    const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
    const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);
    const scaleX = cssWidth / width;
    const scaleY = cssHeight / height;
    const drawStroke = (current: {
      kind: ComicMaskOperationKind;
      points: ComicMaskPoint[];
      radius: number;
      opacity?: number;
    }) => {
      if (current.points.length === 0) return;
      const color =
        current.kind === 'paint'
          ? '255, 70, 70'
          : current.kind === 'erase'
            ? '60, 150, 255'
            : '50, 210, 130';
      context.strokeStyle = `rgba(${color}, ${Math.max(0.12, (current.opacity ?? 255) / 255) * 0.45})`;
      context.lineWidth = Math.max(1, current.radius * 2 * Math.min(scaleX, scaleY));
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.beginPath();
      const first = current.points[0]!;
      context.moveTo(first.x * scaleX, first.y * scaleY);
      for (const point of current.points.slice(1))
        context.lineTo(point.x * scaleX, point.y * scaleY);
      if (current.points.length === 1) context.lineTo(first.x * scaleX + 0.01, first.y * scaleY);
      context.stroke();
    };
    for (const operation of mask?.operations ?? []) drawStroke(operation);
    if (stroke.length > 0) drawStroke({ kind, points: stroke, radius, opacity });
  }, [height, kind, mask, opacity, radius, stroke, width]);

  useEffect(() => {
    draw();
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!parent || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(draw);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [draw]);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): ComicMaskPoint => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - rect.left) / Math.max(1, rect.width)) * width, 0, width - 1),
      y: clamp(((event.clientY - rect.top) / Math.max(1, rect.height)) * height, 0, height - 1),
    };
  };

  const finishStroke = () => {
    const points = strokeRef.current;
    if (points.length === 0) return;
    onChange({
      version: COMIC_IMAGE_PIPELINE_VERSION,
      width,
      height,
      operations: [
        ...(mask?.operations ?? []),
        { kind, points: points.slice(0, MAX_STROKE_POINTS), radius, opacity },
      ],
    });
    strokeRef.current = [];
    setStroke([]);
    setDrawing(false);
  };

  return (
    <div className='absolute inset-0 z-20' aria-label={_('Comic cleanup mask editor')}>
      <canvas
        ref={canvasRef}
        className='absolute inset-0 h-full w-full cursor-crosshair touch-none'
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          const point = pointFromEvent(event);
          strokeRef.current = [point];
          setStroke([point]);
          setDrawing(true);
        }}
        onPointerMove={(event) => {
          if (!drawing) return;
          const next = [...strokeRef.current, pointFromEvent(event)].slice(-MAX_STROKE_POINTS);
          strokeRef.current = next;
          setStroke(next);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
          finishStroke();
        }}
        onPointerCancel={finishStroke}
        aria-label={_('Draw cleanup mask')}
      />
      <div className='absolute start-2 top-2 flex flex-wrap items-center gap-1 rounded bg-base-100/95 p-1 shadow'>
        {(['paint', 'erase', 'restore'] as const).map((option) => (
          <button
            key={option}
            type='button'
            className={`btn btn-xs ${kind === option ? 'btn-primary' : 'btn-ghost'}`}
            aria-pressed={kind === option}
            onClick={() => setKind(option)}
          >
            {_(option === 'paint' ? 'Brush' : option === 'erase' ? 'Eraser' : 'Restore mask')}
          </button>
        ))}
        <label className='flex items-center gap-1 text-xs'>
          {_('Radius')}
          <input
            type='range'
            min={1}
            max={128}
            value={radius}
            onChange={(event) => setRadius(Number(event.target.value))}
            aria-label={_('Mask radius')}
          />
        </label>
        <label className='flex items-center gap-1 text-xs'>
          {_('Opacity')}
          <input
            type='range'
            min={1}
            max={255}
            value={opacity}
            onChange={(event) => setOpacity(Number(event.target.value))}
            aria-label={_('Mask opacity')}
          />
        </label>
        <button
          type='button'
          className='btn btn-ghost btn-xs'
          disabled={!mask?.operations.length}
          onClick={() =>
            onChange({
              version: COMIC_IMAGE_PIPELINE_VERSION,
              width,
              height,
              operations: (mask?.operations ?? []).slice(0, -1),
            })
          }
        >
          {_('Undo mask stroke')}
        </button>
      </div>
    </div>
  );
};

export default ComicMaskEditor;
