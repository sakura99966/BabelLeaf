/** Bounded stream engine shared by the browser worker and non-Worker hosts. */
export async function inflateDictionaryGzip(
  blob: Blob,
  maxOutput: number,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  return inflateDictionaryGzipStream(blob.stream(), blob.size, maxOutput, signal);
}

export async function inflateDictionaryGzipStream(
  input: ReadableStream<Uint8Array<ArrayBuffer>>,
  inputSize: number,
  maxOutput: number,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  signal?.throwIfAborted();
  if (!Number.isSafeInteger(maxOutput) || maxOutput < 1 || maxOutput > 64 * 1024 * 1024)
    throw new Error('Invalid dictionary output limit');
  if (!Number.isSafeInteger(inputSize) || inputSize < 0 || inputSize > 512 * 1024 * 1024)
    throw new Error('Dictionary input limit exceeded');
  const reader = input.pipeThrough(new DecompressionStream('gzip')).getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  let timedOut = false;
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  const timeout = setTimeout(() => {
    timedOut = true;
    cancel();
  }, 30_000);
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (timedOut) throw new Error('Dictionary decompression time limit exceeded');
      if (done) break;
      total += value.byteLength;
      if (total > maxOutput) throw new Error('Dictionary decompression output limit exceeded');
      parts.push(value);
    }
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}
