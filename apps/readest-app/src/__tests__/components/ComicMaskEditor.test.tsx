import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import ComicMaskEditor from '@/app/reader/components/ComicMaskEditor';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const name of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture']) {
    delete (HTMLCanvasElement.prototype as unknown as Record<string, unknown>)[name];
  }
});

const context = {
  setTransform: vi.fn(),
  clearRect: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  strokeStyle: '',
  lineWidth: 0,
  lineCap: 'round',
  lineJoin: 'round',
};

describe('ComicMaskEditor', () => {
  test('writes bounded paint strokes and supports removing the latest stroke', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperties(HTMLCanvasElement.prototype, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      releasePointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
    });
    const onChange = vi.fn();
    render(<ComicMaskEditor width={1000} height={1000} onChange={onChange} />);
    const canvas = screen.getByLabelText('Draw cleanup mask');
    fireEvent.pointerDown(canvas, { button: 0, clientX: 10, clientY: 20, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 30, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 30, clientY: 40, pointerId: 1 });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({
      version: 1,
      width: 1000,
      height: 1000,
      operations: [
        {
          kind: 'paint',
          radius: 12,
          opacity: 255,
        },
      ],
    });

    const mask = onChange.mock.calls[0]?.[0];
    fireEvent.click(screen.getByRole('button', { name: 'Eraser' }));
    expect(screen.getByRole('button', { name: 'Eraser' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    render(<ComicMaskEditor width={1000} height={1000} mask={mask} onChange={onChange} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Undo mask stroke' })[1]!);
    expect(onChange.mock.calls.at(-1)?.[0].operations).toHaveLength(0);
  });
});
