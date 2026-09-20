import { File } from 'node:buffer';
import { afterEach, expect, test, vi } from 'vitest';
import { gzipSync, strToU8 } from 'fflate';
import { loadDictBody } from '@/services/dictionaries/dictZip';
import { decompressDictionaryGzip } from '@/services/dictionaries/gzipWorker';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test('cancels a pending input read without sending a late chunk to a terminated worker', async () => {
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({ cancel });
  const file = { size: 1, stream: () => stream } as unknown as Blob;
  const worker = {
    onmessage: null as ((event: MessageEvent) => Promise<void>) | null,
    onerror: null,
    onmessageerror: null,
    postMessage: vi.fn(),
    terminate: vi.fn(),
  };
  vi.stubGlobal(
    'Worker',
    vi.fn(function () {
      return worker;
    }),
  );
  const abort = new AbortController();
  const result = decompressDictionaryGzip(file, 1024, abort.signal);
  const rejected = expect(result).rejects.toThrow('cancelled');
  const read = worker.onmessage?.({ data: { pull: true } } as MessageEvent);
  abort.abort();
  await rejected;
  await read;
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(worker.terminate).toHaveBeenCalledTimes(1);
  expect(worker.postMessage).toHaveBeenCalledTimes(1);
});

test.each([
  'abort',
  'timeout',
  'error',
  'post',
] as const)('terminates the dictionary worker after %s', async (failureMode) => {
  vi.useFakeTimers();
  const worker = {
    onmessage: null,
    onerror: null as (() => void) | null,
    onmessageerror: null,
    terminate: vi.fn(),
    postMessage: vi.fn(() => {
      if (failureMode === 'post') throw new Error('cannot clone');
    }),
  };
  vi.stubGlobal(
    'Worker',
    vi.fn(function () {
      return worker;
    }),
  );
  const controller = new AbortController();
  const pending = decompressDictionaryGzip(
    new File([], 'test.gz') as unknown as Blob,
    1024,
    controller.signal,
  );
  const rejection = expect(pending).rejects.toThrow();
  if (failureMode === 'abort') controller.abort();
  if (failureMode === 'timeout') await vi.advanceTimersByTimeAsync(30_000);
  if (failureMode === 'error') worker.onerror?.();
  await rejection;
  expect(worker.terminate).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

test('ordinary gzip decompression uses and disposes an available worker', async () => {
  const worker = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    onerror: null,
    onmessageerror: null,
    terminate: vi.fn(),
    postMessage: vi.fn(() =>
      queueMicrotask(() =>
        worker.onmessage?.({
          data: { bytes: new Uint8Array([104, 101, 108, 108, 111]) },
        } as MessageEvent),
      ),
    ),
  };
  const createWorker = vi.fn(function () {
    return worker;
  });
  vi.stubGlobal('Worker', createWorker);
  const blob = new File([gzipSync(strToU8('hello'))], 'test.gz');
  const body = await loadDictBody(blob as unknown as Blob);
  expect(new TextDecoder().decode(await body.read(0, 5))).toBe('hello');
  expect(createWorker).toHaveBeenCalledTimes(1);
  expect(worker.terminate).toHaveBeenCalledTimes(1);
  expect(worker.postMessage.mock.calls[0]).toEqual([{ inputSize: blob.size, maxOutput: 67108864 }]);
});
