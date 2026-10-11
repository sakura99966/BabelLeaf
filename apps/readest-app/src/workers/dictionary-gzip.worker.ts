import { inflateDictionaryGzipStream } from '../services/dictionaries/gzipDecompress';

let pending:
  | { controller: ReadableStreamDefaultController<Uint8Array<ArrayBuffer>>; resolve: () => void }
  | undefined;
let started = false;

self.onmessage = async (
  event: MessageEvent<{
    inputSize?: number;
    maxOutput?: number;
    chunk?: Uint8Array<ArrayBuffer>;
    done?: boolean;
  }>,
) => {
  if (started) {
    if (!pending) return;
    const request = pending;
    pending = undefined;
    if (event.data.done) request.controller.close();
    else if (event.data.chunk instanceof Uint8Array) request.controller.enqueue(event.data.chunk);
    else request.controller.error(new Error('Invalid dictionary input chunk'));
    request.resolve();
    return;
  }
  started = true;
  try {
    const input = new ReadableStream<Uint8Array<ArrayBuffer>>({
      pull(controller) {
        return new Promise<void>((resolve) => {
          pending = { controller, resolve };
          self.postMessage({ pull: true });
        });
      },
      cancel() {
        pending?.resolve();
        pending = undefined;
      },
    });
    const bytes = await inflateDictionaryGzipStream(
      input,
      event.data.inputSize ?? -1,
      event.data.maxOutput ?? -1,
    );
    self.postMessage({ bytes }, { transfer: [bytes.buffer] });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : 'Dictionary decompression failed',
    });
  }
};
