import { describe, expect, test } from 'vitest';
import {
  ComicPipelineQueue,
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
