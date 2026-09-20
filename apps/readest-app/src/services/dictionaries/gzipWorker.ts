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
    // NativeFile/RemoteFile are lazy Blob subclasses with empty native backing
    // storage. Transfer a stream, not the Blob's structured-clone representation.
    let inputReader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | undefined;
    const dispose = () => {
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
      const reader = blob.stream().getReader();
      inputReader = reader;
      const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
        async pull(controller) {
          const next = await reader.read();
          if (next.done) controller.close();
          else controller.enqueue(next.value);
        },
        cancel: (reason) => reader.cancel(reason),
      });
      worker.postMessage({ stream, inputSize: blob.size, maxOutput }, [stream]);
    } catch (error) {
      dispose();
      reject(error);
    }
  });
}
