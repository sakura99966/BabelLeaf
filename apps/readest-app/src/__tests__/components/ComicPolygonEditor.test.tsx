import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import ComicPolygonEditor from '@/app/reader/components/ComicPolygonEditor';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const name of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture']) {
    delete (SVGElement.prototype as unknown as Record<string, unknown>)[name];
  }
});

describe('ComicPolygonEditor', () => {
  test('commits a dragged polygon point in image coordinates', () => {
    vi.spyOn(SVGSVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 200,
      height: 100,
      right: 200,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    Object.defineProperties(SVGElement.prototype, {
      setPointerCapture: { configurable: true, value: vi.fn() },
      releasePointerCapture: { configurable: true, value: vi.fn() },
      hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
    });
    const onCommit = vi.fn();
    render(
      <ComicPolygonEditor
        width={1000}
        height={500}
        polygon={[
          { x: 100, y: 100 },
          { x: 900, y: 100 },
          { x: 900, y: 400 },
          { x: 100, y: 400 },
        ]}
        onCommit={onCommit}
      />,
    );

    const handle = screen.getByRole('button', { name: 'Move polygon point 1' });
    fireEvent.pointerDown(handle, { button: 0, clientX: 20, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 40, clientY: 20, pointerId: 1 });
    fireEvent.pointerUp(handle, { clientX: 40, clientY: 20, pointerId: 1 });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.calls[0]?.[0][0]).toEqual({ x: 200, y: 100 });
  });
});
