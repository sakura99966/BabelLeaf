import { inflateDictionaryGzipStream } from '../services/dictionaries/gzipDecompress';

self.onmessage = async (
  event: MessageEvent<{
    stream: ReadableStream<Uint8Array<ArrayBuffer>>;
    inputSize: number;
    maxOutput: number;
  }>,
) => {
  try {
    const bytes = await inflateDictionaryGzipStream(
      event.data.stream,
      event.data.inputSize,
      event.data.maxOutput,
    );
    self.postMessage({ bytes }, { transfer: [bytes.buffer] });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : 'Dictionary decompression failed',
    });
  }
};
