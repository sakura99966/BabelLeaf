import { inflateDictionaryGzip } from '../services/dictionaries/gzipDecompress';

self.onmessage = async (event: MessageEvent<{ blob: Blob; maxOutput: number }>) => {
  try {
    const bytes = await inflateDictionaryGzip(event.data.blob, event.data.maxOutput);
    self.postMessage({ bytes }, { transfer: [bytes.buffer] });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : 'Dictionary decompression failed',
    });
  }
};
