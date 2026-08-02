import { describe, expect, test, vi } from 'vitest';
import { TranslationJobQueue } from '@/services/translators/jobQueue';

const makeInput = (count = 4, concurrency = 2) => ({
  id: 'job-1',
  kind: 'chapter' as const,
  bookHash: 'book-hash',
  provider: 'deepseek',
  sourceLang: 'en',
  targetLang: 'zh-CN',
  concurrency,
  items: Array.from({ length: count }, (_, index) => ({
    id: `segment-${index}`,
    text: `Text ${index}`,
  })),
});

const waitFor = async (predicate: () => boolean): Promise<void> => {
  const deadline = Date.now() + 1000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for queue state');
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
};

describe('TranslationJobQueue', () => {
  test('completes work with bounded concurrency and progress snapshots', async () => {
    let active = 0;
    let maximumActive = 0;
    const snapshots: string[] = [];
    const translate = vi.fn(async (item: { text: string }) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return `译文:${item.text}`;
    });
    const queue = new TranslationJobQueue(makeInput(5, 2), translate);
    queue.subscribe((snapshot) => snapshots.push(`${snapshot.completed}/${snapshot.total}`));

    const result = await queue.start();

    expect(result.status).toBe('completed');
    expect(result.completed).toBe(5);
    expect(result.failed).toBe(0);
    expect(maximumActive).toBeLessThanOrEqual(2);
    expect(result.items.every((item) => item.status === 'completed')).toBe(true);
    expect(snapshots).toContain('5/5');
  });

  test('keeps failed items isolated and marks the job failed', async () => {
    const queue = new TranslationJobQueue(makeInput(3, 1), async (item) => {
      if (item.id === 'segment-1') throw new Error('provider unavailable');
      if (item.id === 'segment-2') return '';
      return 'ok';
    });

    const result = await queue.start();

    expect(result.status).toBe('failed');
    expect(result.completed).toBe(1);
    expect(result.failed).toBe(2);
    expect(result.items[1]).toMatchObject({ status: 'failed', error: 'provider unavailable' });
    expect(result.items[2]).toMatchObject({ status: 'failed' });
  });

  test('pauses after active work and resumes pending segments', async () => {
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const queue = new TranslationJobQueue(makeInput(3, 1), async (item) => {
      if (item.id === 'segment-0') await firstGate;
      return `译文:${item.text}`;
    });
    const running = queue.start();
    await waitFor(() => queue.getSnapshot().items[0]?.status === 'running');
    queue.pause();
    releaseFirst();

    const paused = await running;
    expect(paused.status).toBe('paused');
    expect(paused.completed).toBe(1);
    expect(paused.items.filter((item) => item.status === 'pending')).toHaveLength(2);

    const completed = await queue.resume();
    expect(completed.status).toBe('completed');
    expect(completed.completed).toBe(3);
  });

  test('cancels pending and running work through a shared abort signal', async () => {
    let abortSeen = false;
    const queue = new TranslationJobQueue(makeInput(3, 1), async (_item, signal) => {
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          abortSeen = true;
          reject(new Error('aborted'));
        });
      });
      return 'never';
    });
    const running = queue.start();
    await waitFor(() => queue.getSnapshot().items[0]?.status === 'running');
    queue.cancel();

    const cancelled = await running;
    expect(abortSeen).toBe(true);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelled).toBe(3);
    expect(cancelled.items.every((item) => item.status === 'cancelled')).toBe(true);
  });
});
