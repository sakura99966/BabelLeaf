import { expect, test, vi } from 'vitest';
import { waitForNativeWindow } from '../../../scripts/native-probe-readiness.mjs';

test('waits for the owned window marker, not just a listening port or stale PID', async () => {
  const readMarker = vi
    .fn()
    .mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }))
    .mockResolvedValueOnce('999')
    .mockResolvedValueOnce('42');
  await waitForNativeWindow({
    pidFile: 'owned.pid',
    expectedPid: 42,
    isAlive: () => true,
    pollMs: 1,
    readMarker,
  });
  expect(readMarker).toHaveBeenCalledTimes(3);
});

test('fails if the spawned application exits before the window is ready', async () => {
  const readMarker = vi.fn();
  await expect(
    waitForNativeWindow({
      pidFile: 'owned.pid',
      expectedPid: 42,
      isAlive: () => false,
      readMarker,
    }),
  ).rejects.toThrow('exited');
  expect(readMarker).not.toHaveBeenCalled();
});

test('fails visibly after a bounded missing-marker wait', async () => {
  const readMarker = vi
    .fn()
    .mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }));
  await expect(
    waitForNativeWindow({
      pidFile: 'owned.pid',
      expectedPid: 42,
      isAlive: () => true,
      timeoutMs: 10,
      pollMs: 1,
      readMarker,
    }),
  ).rejects.toThrow('window-ready');
});

test('does not reinterpret a filesystem access failure as a missing marker', async () => {
  const readMarker = vi
    .fn()
    .mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' }));
  await expect(
    waitForNativeWindow({ pidFile: 'owned.pid', expectedPid: 42, isAlive: () => true, readMarker }),
  ).rejects.toThrow('denied');
});
