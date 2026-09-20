import { inflateDictionaryGzip } from './gzipDecompress';

export function decompressDictionaryGzip(
  blob: Blob,
  maxOutput: number,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  signal?.throwIfAborted();
  if (typeof Worker === 'undefined') return inflateDictionaryGzip(blob, maxOutput, signal);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../workers/dictionary-gzip.worker.ts', import.meta.url), {
      type: 'module',
    });
    const dispose = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      worker.terminate();
    };
    const abort = () => {
      dispose();
      reject(new DOMException('Dictionary decompression cancelled', 'AbortError'));
    };
    const timer = setTimeout(() => {
      dispose();
      reject(new Error('Dictionary decompression time limit exceeded'));
    }, 30_000);
    signal?.addEventListener('abort', abort, { once: true });
    worker.onerror = worker.onmessageerror = () => {
      dispose();
      reject(new Error('Dictionary decompression worker failed'));
    };
    worker.onmessage = (
      event: MessageEvent<{ bytes?: Uint8Array<ArrayBuffer>; error?: string }>,
    ) => {
      dispose();
      if (event.data.error) reject(new Error(event.data.error));
      else if (!(event.data.bytes instanceof Uint8Array) || event.data.bytes.byteLength > maxOutput)
        reject(new Error('Invalid dictionary decompression worker result'));
      else resolve(event.data.bytes);
    };
    try {
      worker.postMessage({ blob, maxOutput });
    } catch (error) {
      dispose();
      reject(error);
    }
  });
}
