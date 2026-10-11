import { invoke } from '@tauri-apps/api/core';
import { loadDictBody } from '@/services/dictionaries/dictZip';
import { exportComicArchive } from '@/services/translators/comicExportWorker';
import type { ComicRenderedPage } from '@/services/translators/comicExport';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Authored local fixtures; no book content, credentials or network requests. */
export async function runNativeWorkload(root: string) {
  const results: Array<{
    name: string;
    elapsedMs: number;
    maxHeartbeatGapMs: number;
    ticks: number;
  }> = [];
  const measure = async (name: string, action: () => Promise<void>) => {
    let last = performance.now();
    let maxGap = 0;
    let ticks = 0;
    const timer = setInterval(() => {
      const now = performance.now();
      maxGap = Math.max(maxGap, now - last);
      last = now;
      ticks += 1;
    }, 10);
    const started = performance.now();
    try {
      await action();
      await delay(100);
    } finally {
      clearInterval(timer);
    }
    if (ticks === 0 || maxGap > 500)
      throw new Error(`${name} blocked the UI heartbeat: ${maxGap}ms`);
    results.push({
      name,
      elapsedMs: performance.now() - started,
      maxHeartbeatGapMs: maxGap,
      ticks,
    });
  };

  const NativeWorker = globalThis.Worker;
  let activeWorkers = 0;
  let createdWorkers = 0;
  class ObservedWorker extends NativeWorker {
    private disposed = false;
    constructor(url: string | URL, options?: WorkerOptions) {
      super(url, options);
      activeWorkers += 1;
      createdWorkers += 1;
    }
    override terminate() {
      if (!this.disposed) {
        activeWorkers -= 1;
        this.disposed = true;
      }
      super.terminate();
    }
  }
  globalThis.Worker = ObservedWorker;
  try {
    let directoryEntries = 0;
    await measure('native-directory-4096', async () => {
      const files = await invoke<Array<{ path: string }>>('read_dir', {
        path: `${root}/workload`,
        recursive: true,
        extensions: ['txt'],
      });
      directoryEntries = files.length;
      if (directoryEntries !== 4096) throw new Error('Native directory workload lost entries');
    });

    const dictionaryBytes = 32 * 1024 * 1024;
    const raw = new Uint8Array(dictionaryBytes).fill(65);
    const compressed = await new Response(
      new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip')),
    ).blob();
    await measure('dictionary-gzip-32MiB', async () => {
      const body = await loadDictBody(compressed);
      const beginning = await body.read(0, 1);
      const ending = await body.read(dictionaryBytes - 1, 1);
      if (beginning[0] !== 65 || ending[0] !== 65)
        throw new Error('Dictionary workload output mismatch');
      await delay(1000);
    });

    // Eight real, locally generated PNG pages with incompressible pixels.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1024;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable');
    const seeds: Uint8Array<ArrayBuffer>[] = [];
    for (let index = 0; index < 8; index += 1) {
      const pixels = new Uint8ClampedArray(1024 * 1024 * 4);
      for (let offset = 0; offset < pixels.length; offset += 65536)
        crypto.getRandomValues(pixels.subarray(offset, offset + 65536));
      context.putImageData(new ImageData(pixels, 1024, 1024), 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) => (value ? resolve(value) : reject(new Error('PNG encoding failed'))),
          'image/png',
        ),
      );
      seeds.push(new Uint8Array(await blob.arrayBuffer()));
      await delay(0);
    }
    const makePages = (): ComicRenderedPage[] =>
      seeds.map((bytes, pageIndex) => ({
        pageId: `page-${pageIndex}`,
        pageIndex,
        extension: 'png',
        mimeType: 'image/png',
        bytes: bytes.slice(),
      }));
    let archiveBytes = 0;
    const inputBytes = seeds.reduce((sum, bytes) => sum + bytes.byteLength, 0);
    await measure('comic-archive-8-PNG', async () => {
      for (let round = 0; round < 2; round += 1) {
        const pages = makePages();
        const result = await exportComicArchive({ format: 'cbz', outputName: 'workload', pages });
        archiveBytes = result.archive.byteLength;
        if (
          result.archive[0] !== 0x50 ||
          result.archive[1] !== 0x4b ||
          archiveBytes < inputBytes * 0.95
        )
          throw new Error('Comic workload archive is incomplete');
        if (pages.some((page) => page.bytes.byteLength !== 0))
          throw new Error('Comic input buffers were copied instead of transferred');
        if (activeWorkers !== 0) throw new Error('Completed export retained a worker');
        await delay(1000);
      }
    });
    await measure('comic-export-cancellation', async () => {
      const controller = new AbortController();
      const request = exportComicArchive(
        { format: 'cbz', outputName: 'cancelled', pages: makePages() },
        controller.signal,
      );
      setTimeout(() => controller.abort(), 20);
      try {
        await request;
        throw new Error('Cancelled export unexpectedly completed');
      } catch (error) {
        if (!(error instanceof DOMException) || error.name !== 'AbortError') throw error;
      }
      if (activeWorkers !== 0) throw new Error('Cancelled export retained a worker');
    });
    if (activeWorkers !== 0 || createdWorkers < 4)
      throw new Error('Worker lifecycle was not exercised');
    return {
      stage: 'workload',
      directoryEntries,
      dictionaryBytes,
      comicInputBytes: inputBytes,
      archiveBytes,
      createdWorkers,
      activeWorkers,
      heartbeatBudgetMs: 500,
      results,
    };
  } finally {
    globalThis.Worker = NativeWorker;
  }
}
