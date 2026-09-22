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
    // Lazy Files cannot be cloned; WebKit cannot transfer ReadableStreams.
    // Supply one chunk per worker request, using portable ArrayBuffer transfers.
    let inputReader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | undefined;
    let settled = false;
    let reading = false;
    const dispose = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      worker.terminate();
      if (inputReader) {
        const reader = inputReader;
        inputReader = undefined;
        void reader
          .cancel()
          .catch(() => {})
          .finally(() => reader.releaseLock());
      }
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
    worker.onmessage = async (
      event: MessageEvent<{ pull?: boolean; bytes?: Uint8Array<ArrayBuffer>; error?: string }>,
    ) => {
      if (settled) return;
      if (event.data.pull) {
        if (reading || !inputReader) {
          dispose();
          reject(new Error('Invalid dictionary worker read request'));
          return;
        }
        reading = true;
        try {
          const next = await inputReader.read();
          if (settled) return;
          if (next.done) worker.postMessage({ done: true });
          else {
            // Do not detach buffers potentially retained by a file adapter cache.
            const chunk = new Uint8Array(next.value);
            worker.postMessage({ chunk }, [chunk.buffer]);
          }
        } catch (error) {
          dispose();
          reject(error);
        } finally {
          reading = false;
        }
        return;
      }
      dispose();
      if (event.data.error) reject(new Error(event.data.error));
      else if (!(event.data.bytes instanceof Uint8Array) || event.data.bytes.byteLength > maxOutput)
        reject(new Error('Invalid dictionary decompression worker result'));
      else resolve(event.data.bytes);
    };
    try {
      inputReader = blob.stream().getReader();
      worker.postMessage({ inputSize: blob.size, maxOutput });
    } catch (error) {
      dispose();
      reject(error);
    }
  });
}
