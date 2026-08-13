import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import {
  useWindowsMemoryTarget,
  WINDOWS_IDLE_MEMORY_DELAY_MS,
} from '@/hooks/useWindowsMemoryTarget';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

const invokeMock = vi.mocked(invoke);

const Harness = ({ enabled = true }: { enabled?: boolean }) => {
  useWindowsMemoryTarget(enabled);
  return null;
};

describe('useWindowsMemoryTarget', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invokeMock.mockClear();
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('requests the best-effort target early enough for the desktop idle gate', () => {
    expect(WINDOWS_IDLE_MEMORY_DELAY_MS).toBe(10_000);
  });

  it('requests low memory only after the foreground idle delay', async () => {
    render(<Harness />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(WINDOWS_IDLE_MEMORY_DELAY_MS - 1);
    });
    expect(invokeMock).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(invokeMock).toHaveBeenCalledWith('set_webview_memory_usage', { low: true });
  });

  it('restores normal memory immediately on activity and restarts the timer', async () => {
    render(<Harness />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WINDOWS_IDLE_MEMORY_DELAY_MS);
    });
    invokeMock.mockClear();

    await act(async () => {
      window.dispatchEvent(new PointerEvent('pointerdown'));
      await Promise.resolve();
    });
    expect(invokeMock).toHaveBeenCalledWith('set_webview_memory_usage', { low: false });

    invokeMock.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WINDOWS_IDLE_MEMORY_DELAY_MS);
    });
    expect(invokeMock).toHaveBeenCalledWith('set_webview_memory_usage', { low: true });
  });

  it('does not register memory targeting outside the Windows app', async () => {
    render(<Harness enabled={false} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(WINDOWS_IDLE_MEMORY_DELAY_MS * 2);
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });
});
