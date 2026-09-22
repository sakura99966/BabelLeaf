import { expect, test, vi } from 'vitest';
import { ReaderCloseGuard } from '@/services/translators/readerCloseGuard';

test('blocks closing during translation and preserves a failed local flush for retry', async () => {
  const guard = new ReaderCloseGuard();
  let busy = true;
  const flush = vi.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined);
  const unregister = guard.register('book', { isBusy: () => busy, hasPending: () => true, flush });
  await expect(guard.prepare(['book'])).rejects.toThrow('running');
  expect(flush).not.toHaveBeenCalled();
  busy = false;
  await expect(guard.prepare(['book'])).rejects.toThrow('disk full');
  expect(guard.needsProtection(['book'])).toBe(true);
  // Successful I/O alone is insufficient if the state still reports dirty data.
  await expect(guard.prepare(['book'])).rejects.toThrow('not saved');
  unregister();
  expect(guard.needsProtection(['book'])).toBe(false);
});

test('checks every reader before starting any flush', async () => {
  const guard = new ReaderCloseGuard();
  const flush = vi.fn();
  guard.register('one', { isBusy: () => false, hasPending: () => true, flush });
  guard.register('two', { isBusy: () => true, hasPending: () => false, flush });
  await expect(guard.prepare(['one', 'two'])).rejects.toThrow();
  expect(flush).not.toHaveBeenCalled();
});

test('does not remove a replacement registration during old reader cleanup', () => {
  const guard = new ReaderCloseGuard();
  const state = { isBusy: () => false, hasPending: () => true, flush: async () => {} };
  const old = guard.register('book', state);
  guard.register('book', { ...state });
  old();
  expect(guard.needsProtection(['book'])).toBe(true);
});
