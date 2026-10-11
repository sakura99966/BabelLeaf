import type { ComicExportInput } from './comicExport';

export function exportComicArchive(
  input: ComicExportInput,
  signal?: AbortSignal,
): Promise<{ fileName: string; archive: Uint8Array<ArrayBuffer> }> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../../workers/comic-export.worker.ts', import.meta.url), {
      type: 'module',
    });
    const dispose = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      worker.terminate();
    };
    const abort = () => {
      dispose();
      reject(new DOMException('Export cancelled', 'AbortError'));
    };
    const timer = setTimeout(() => {
      dispose();
      reject(new Error('Comic export time limit exceeded'));
    }, 120_000);
    signal?.addEventListener('abort', abort, { once: true });
    worker.onerror = () => {
      dispose();
      reject(new Error('Comic export worker failed'));
    };
    worker.onmessageerror = () => {
      dispose();
      reject(new Error('Comic export worker message failed'));
    };
    worker.onmessage = (
      event: MessageEvent<{ fileName: string; archive: Uint8Array<ArrayBuffer>; error?: string }>,
    ) => {
      dispose();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data);
    };
    const transfer = input.pages.map((page) =>
      page.bytes instanceof Uint8Array ? (page.bytes.buffer as ArrayBuffer) : page.bytes,
    );
    try {
      worker.postMessage(input, [...new Set(transfer)]);
    } catch (error) {
      dispose();
      reject(error);
    }
  });
}
