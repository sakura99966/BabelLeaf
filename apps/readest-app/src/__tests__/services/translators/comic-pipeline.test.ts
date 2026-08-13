import { describe, expect, test } from 'vitest';
import {
  ComicPipelineQueue,
  ComicPipelineStore,
  createComicPipelinePageSetSignature,
  composeComicPipelineStages,
  parseComicPipelineSnapshot,
  pruneComicPipelineCache,
  type ComicPipelineInput,
} from '@/services/translators';

const input = (overrides: Partial<ComicPipelineInput> = {}): ComicPipelineInput => ({
  id: 'job-1',
  bookHash: 'book-1',
  sourceFormat: 'CBZ',
  phase: 'cleanup',
  pages: [0, 1, 2].map((pageIndex) => ({
    pageIndex,
    pageId: `page-${pageIndex}`,
    width: 100,
    height: 100,
    format: 'png' as const,
    localRef: `Books/book-1/${pageIndex}.png`,
  })),
  maxAttempts: 1,
  concurrency: 1,
  ...overrides,
});

describe('comic pipeline queue', () => {
  test('changes the page-set identity when local page metadata changes', () => {
    const pages = [
      { pageId: 'page-0', width: 100, height: 200, byteLength: 1_024 },
      { pageId: 'page-1', width: 300, height: 400, byteLength: 2_048 },
    ];
    expect(createComicPipelinePageSetSignature(pages)).toBe(
      createComicPipelinePageSetSignature(pages),
    );
    expect(
      createComicPipelinePageSetSignature([{ ...pages[0]!, byteLength: 1_025 }, pages[1]!]),
    ).not.toBe(createComicPipelinePageSetSignature(pages));
    expect(createComicPipelinePageSetSignature([{ ...pages[0]!, width: 101 }, pages[1]!])).not.toBe(
      createComicPipelinePageSetSignature(pages),
    );
  });

  test('stores checkpoints under the local Data sidecar without credentials', async () => {
    const files = new Map<string, string>();
    const fs = {
      createDir: async () => undefined,
      readFile: async (path: string) => {
        const value = files.get(path);
        if (value === undefined) throw new Error('missing');
        return value;
      },
      writeFile: async (path: string, _base: 'Data', content: string) => {
        files.set(path, content);
      },
    };
    const store = new ComicPipelineStore(fs);
    const snapshot = new ComicPipelineQueue(input(), async (item) => ({
      pageId: item.page.pageId,
      completedAt: 1,
    })).getSnapshot();
    await store.save(snapshot);
    const restored = await store.load(snapshot.id);
    expect(restored?.id).toBe(snapshot.id);
    expect([...files.keys()]).toEqual(
      expect.arrayContaining(['comic-pipelines/job-1.json', 'comic-pipelines/job-1.json.bak']),
    );
    expect(JSON.stringify(restored)).not.toContain('apiKey');
  });

  test('processes pages, persists checkpoints, and supports selective rerun', async () => {
    const saved: number[] = [];
    const queue = new ComicPipelineQueue(
      input({
        checkpoint: {
          save: async (snapshot) => {
            saved.push(snapshot.revision);
          },
        },
      }),
      async (item) => ({ pageId: item.page.pageId, completedAt: Date.now() }),
    );
    const completed = await queue.start();
    await queue.flushCheckpoint();
    expect(completed.status).toBe('completed');
    expect(completed.completed).toBe(3);
    expect(saved.length).toBeGreaterThan(0);
    const rerun = queue.rerun(['page-1']);
    expect(rerun.status).toBe('queued');
    expect(rerun.items.find((item) => item.page.pageId === 'page-1')?.status).toBe('pending');
    expect((await queue.start()).completed).toBe(3);
  });

  test('retries failed pages explicitly and redacts credentials from errors', async () => {
    let shouldFail = true;
    const queue = new ComicPipelineQueue(input(), async (item) => {
      if (shouldFail) throw new Error('Bearer sk-super-secret-key');
      return { pageId: item.page.pageId, completedAt: Date.now() };
    });
    const failed = await queue.start();
    expect(failed.status).toBe('failed');
    expect(failed.items[0]?.error).not.toContain('super-secret-key');
    shouldFail = false;
    const retried = await queue.retryFailed();
    expect(retried.status).toBe('completed');
  });

  test('defers a retry requested while the failed run is still settling', async () => {
    let shouldFail = true;
    const queue = new ComicPipelineQueue(input({ pages: input().pages.slice(0, 1) }), async () => {
      if (shouldFail) throw new Error('temporary failure');
      return { pageId: 'page-0', completedAt: Date.now() };
    });
    const running = queue.start();
    const retry = queue.retryFailed();
    shouldFail = false;
    const result = await retry;
    await running;
    expect(result.status).toBe('completed');
    expect(result.completed).toBe(1);
  });

  test('recovers interrupted running work as paused pending work', () => {
    const initial = new ComicPipelineQueue(input(), async (item) => ({
      pageId: item.page.pageId,
      completedAt: 1,
    })).getSnapshot();
    initial.status = 'running';
    initial.items[0]!.status = 'running';
    const recovered = new ComicPipelineQueue(
      input({ initialSnapshot: parseComicPipelineSnapshot(initial) }),
      async (item) => ({ pageId: item.page.pageId, completedAt: 1 }),
    ).getSnapshot();
    expect(recovered.recovered).toBe(true);
    expect(recovered.status).toBe('paused');
    expect(recovered.items[0]?.status).toBe('pending');
  });

  test('allows a cancelled queue to rerun selected pages with a fresh abort signal', async () => {
    let calls = 0;
    const queue = new ComicPipelineQueue(input(), async (item, signal) => {
      calls += 1;
      if (calls === 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, 5));
        signal.throwIfAborted();
      }
      return { pageId: item.page.pageId, completedAt: Date.now() };
    });
    const running = queue.start();
    queue.cancel();
    await running;
    expect(queue.getSnapshot().status).toBe('cancelled');
    const rerun = queue.rerun(['page-0']);
    expect(rerun.status).toBe('queued');
    const completed = await queue.start();
    expect(completed.status).toBe('completed');
    expect(completed.completed).toBe(1);
    expect(completed.cancelled).toBe(2);
  });

  test('bounds generated cache by least-recently-used metadata', () => {
    const result = pruneComicPipelineCache(
      [
        { id: 'old', path: 'Data/old', sizeBytes: 8, createdAt: 1, lastAccessedAt: 1 },
        { id: 'new', path: 'Data/new', sizeBytes: 8, createdAt: 2, lastAccessedAt: 2 },
      ],
      8,
    );
    expect(result.kept.map((entry) => entry.id)).toEqual(['new']);
    expect(result.removed.map((entry) => entry.id)).toEqual(['old']);
  });

  test('composes ordered OCR, translation, cleanup, and export stages', async () => {
    const order: string[] = [];
    const process = composeComicPipelineStages([
      {
        phase: 'ocr',
        process: async () => {
          order.push('ocr');
        },
      },
      {
        phase: 'translate',
        process: async () => {
          order.push('translate');
          return { warnings: ['review'] };
        },
      },
      {
        phase: 'cleanup',
        process: async () => {
          order.push('cleanup');
          return { outputRef: 'Data/page-0.png' };
        },
      },
      {
        phase: 'typeset',
        process: async () => {
          order.push('typeset');
        },
      },
      {
        phase: 'export',
        process: async () => {
          order.push('export');
        },
      },
    ]);
    const queue = new ComicPipelineQueue(input({ pages: [input().pages[0]!] }), process);
    const snapshot = await queue.start();
    expect(snapshot.status).toBe('completed');
    expect(order).toEqual(['ocr', 'translate', 'cleanup', 'typeset', 'export']);
    expect(snapshot.items[0]?.result?.warnings).toEqual(['review']);
  });
});
