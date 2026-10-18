import { expect, it, vi } from 'vitest';
import { BookConfigSaveQueue } from '@/services/bookConfigSaveQueue';
import { ReaderCloseGuard } from '@/services/translators/readerCloseGuard';

it('retains failed writes, prevents close and retries locally without losing the snapshot', async () => {
  const guard = new ReaderCloseGuard();
  const notify = vi.fn();
  const queue = new BookConfigSaveQueue(guard, notify);
  let fail = true;
  const save = vi.fn(async () => {
    if (fail) throw new Error('disk full');
  });
  await expect(queue.save('book-1', save)).rejects.toThrow('disk full');
  expect(guard.needsProtection(['book-1'])).toBe(true);
  await expect(guard.prepare(['book-1'])).rejects.toThrow();
  expect(notify).toHaveBeenCalledWith('book-1', 'disk full');
  fail = false;
  await guard.prepare(['book-1']);
  expect(guard.needsProtection(['book-1'])).toBe(false);
  expect(notify).toHaveBeenLastCalledWith('book-1', null);
});

it('awaits an in-flight configuration write before permitting close', async () => {
  const guard = new ReaderCloseGuard();
  const queue = new BookConfigSaveQueue(guard, () => {});
  let release!: () => void;
  const block = new Promise<void>((resolve) => {
    release = resolve;
  });
  const write = queue.save('book-1', async () => block);
  expect(guard.needsProtection(['book-1'])).toBe(true);
  let closed = false;
  const close = guard.prepare(['book-1']).then(() => {
    closed = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(closed).toBe(false);
  release();
  await Promise.all([write, close]);
  expect(closed).toBe(true);
});

it('serializes writes and only retries the newest dirty snapshot', async () => {
  const guard = new ReaderCloseGuard();
  const queue = new BookConfigSaveQueue(guard, () => {});
  const old = vi.fn(async () => {
    throw new Error('old failed');
  });
  const latest = vi.fn(async () => {});
  await expect(queue.save('book-1', old)).rejects.toThrow();
  await queue.save('book-1', latest);
  await queue.retry('book-1');
  expect(old).toHaveBeenCalledTimes(1);
  expect(latest).toHaveBeenCalledTimes(1);
  expect(guard.needsProtection(['book-1'])).toBe(false);
});

it('bounds a slow-disk burst to the active write and the newest pending snapshot', async () => {
  const queue = new BookConfigSaveQueue(new ReaderCloseGuard(), () => {});
  let started!: () => void;
  let release!: () => void;
  const active = new Promise<void>((resolve) => {
    started = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writes: number[] = [];
  const first = queue.save('book-1', async () => {
    writes.push(0);
    started();
    await blocked;
  });
  await active;
  const pending = Array.from({ length: 100 }, (_, index) =>
    queue.save('book-1', async () => {
      writes.push(index + 1);
    }),
  );
  release();
  await Promise.all([first, ...pending]);
  expect(writes).toEqual([0, 100]);
});
