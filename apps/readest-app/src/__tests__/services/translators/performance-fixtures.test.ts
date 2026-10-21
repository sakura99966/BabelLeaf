import { expect, it } from 'vitest';
import {
  createPerformanceWorkspace,
  createPerformanceQueueItems,
  percentile95,
} from '../../fixtures/performanceFixtures';
import { createComicOverlayBlocks } from '@/services/translators/comicOverlay';
import { parseComicWorkspace } from '@/services/translators/comicWorkspace';

it('authors a deterministic bounded workspace with corrections and stale translations', () => {
  const workspace = createPerformanceWorkspace();
  expect(createPerformanceWorkspace()).toEqual(workspace);
  expect(parseComicWorkspace(workspace)).toEqual(workspace);
  expect(workspace.pages).toHaveLength(20);
  const regions = workspace.pages.flatMap((page) => page.regions);
  expect(regions).toHaveLength(1000);
  expect(regions.filter((region) => region.manual)).toHaveLength(100);
  expect(regions.filter((region) => region.translation)).toHaveLength(1000);
  expect(workspace.pages.flatMap(createComicOverlayBlocks)).toHaveLength(900);
});

it.each([20, 5000])('authors %i unique queue segments without a provider client', (count) => {
  const items = createPerformanceQueueItems(count);
  expect(items).toHaveLength(count);
  expect(new Set(items.map((item) => item.id)).size).toBe(count);
  expect(items.every((item) => item.text.trim() && item.chapterId)).toBe(true);
  expect(createPerformanceQueueItems(count)).toEqual(items);
});

it('uses the nearest-rank p95 without mutating samples', () => {
  const samples = Array.from({ length: 50 }, (_, index) => 50 - index);
  expect(percentile95(samples)).toBe(48);
  expect(samples[0]).toBe(50);
});

it.each([
  { samples: [] },
  { samples: [Number.NaN] },
  { samples: [Number.POSITIVE_INFINITY] },
  { samples: [-1] },
])('refuses invalid benchmark evidence', ({ samples }) =>
  expect(() => percentile95(samples)).toThrow());
