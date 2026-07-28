import { describe, expect, it, vi } from 'vitest';

describe('translation cache startup', () => {
  it('does not open IndexedDB or install a timer when the module is imported', async () => {
    vi.resetModules();
    const open = vi.fn();
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    vi.stubGlobal('indexedDB', { open });

    await import('@/services/translators/cache');

    expect(open).not.toHaveBeenCalled();
    expect(setIntervalSpy).not.toHaveBeenCalled();

    setIntervalSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});
