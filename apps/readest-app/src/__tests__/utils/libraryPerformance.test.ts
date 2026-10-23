import { describe, expect, it, vi } from 'vitest';
import {
  LIBRARY_INTERACTIVE_MARK,
  scheduleLibraryInteractiveMark,
} from '@/utils/libraryPerformance';

const environment = () => {
  let sequence = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const entries: PerformanceEntry[] = [];
  const mark = vi.fn((name: string) => {
    entries.push({ name } as PerformanceEntry);
    return {} as PerformanceMark;
  });
  return {
    requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
      frames.set(++sequence, callback);
      return sequence;
    }),
    cancelAnimationFrame: vi.fn((id: number) => frames.delete(id)),
    performance: { getEntriesByName: () => entries, mark },
    flush: () => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(0));
    },
    frames,
    mark,
  };
};

describe('local library readiness measurement', () => {
  it('marks only after committed UI has had a paint opportunity', () => {
    const browser = environment();
    scheduleLibraryInteractiveMark(browser);
    expect(browser.mark).not.toHaveBeenCalled();
    browser.flush();
    expect(browser.mark).not.toHaveBeenCalled();
    browser.flush();
    expect(browser.mark).toHaveBeenCalledExactlyOnceWith(LIBRARY_INTERACTIVE_MARK);
    expect(browser.frames.size).toBe(0);
  });

  it.each([0, 1])('cancels an unmounted readiness sample after %i frames', (frames) => {
    const browser = environment();
    const cancel = scheduleLibraryInteractiveMark(browser);
    if (frames) browser.flush();
    cancel();
    browser.flush();
    browser.flush();
    expect(browser.mark).not.toHaveBeenCalled();
    expect(browser.frames.size).toBe(0);
  });

  it('bounds repeated and concurrent mounts to one mark per document', () => {
    const browser = environment();
    scheduleLibraryInteractiveMark(browser);
    scheduleLibraryInteractiveMark(browser);
    browser.flush();
    browser.flush();
    scheduleLibraryInteractiveMark(browser);
    browser.flush();
    browser.flush();
    expect(browser.mark).toHaveBeenCalledTimes(1);
    expect(browser.frames.size).toBe(0);
  });

  it('does not break reading when a performance API is unavailable', () => {
    expect(() => scheduleLibraryInteractiveMark(null)()).not.toThrow();
    const browser = environment();
    browser.mark.mockImplementation(() => {
      throw new Error('Unavailable');
    });
    scheduleLibraryInteractiveMark(browser);
    browser.flush();
    expect(() => browser.flush()).not.toThrow();
  });
});
