import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { NativeAppService } from '@/services/nativeAppService';
import { TranslationBatchController } from '@/services/translators/batch';
import {
  createTranslationArtifact,
  TranslationArtifactStore,
} from '@/services/translators/artifacts';
import { TranslationJobStore } from '@/services/translators/jobStore';
import {
  ComicWorkspaceStore,
  getComicWorkspacePath,
} from '@/services/translators/comicWorkspaceStore';
import { TRANSLATION_PERFORMANCE_BUDGETS as budgets } from '@/services/translators/formatMatrix';
import { createComicOverlayBlocks } from '@/services/translators/comicOverlay';
import { serializeComicWorkspace } from '@/services/translators/comicWorkspace';
import ComicTranslationOverlay from '@/app/reader/components/ComicTranslationOverlay';
import {
  createPerformanceQueueItems,
  createPerformanceWorkspace,
  percentile95,
} from './performanceFixtures';

const hash = async (value: unknown): Promise<string> =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))),
    ),
  )
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
const frame = (): Promise<number> => new Promise((done) => requestAnimationFrame(done));
const report = (scenario: string) => {
  document.body.textContent = JSON.stringify({ stage: 'performance-running', scenario });
};

/** Actual native atomic storage and browser layout; the provider alone is mocked. */
export async function runNativePerformance(root: string) {
  const service = new NativeAppService(root);
  await service.init();
  await service.createDir('', 'Data', true);
  let atomicWrites = 0;
  const writeAtomic = service.writeFileAtomic.bind(service);
  service.writeFileAtomic = async (...args) => {
    atomicWrites++;
    return writeAtomic(...args);
  };
  const measurements: Array<{
    name: keyof typeof budgets;
    value: number;
    budget: number;
    passed: boolean;
    details: unknown;
  }> = [];
  const record = (name: keyof typeof budgets, value: number, details: unknown) =>
    measurements.push({
      name,
      value,
      budget: budgets[name],
      passed: value <= budgets[name],
      details,
    });

  try {
    for (const count of [20, 5000]) {
      report('translation-' + count);
      const items = createPerformanceQueueItems(count);
      const fixtureSha256 = await hash(items);
      const artifact = createTranslationArtifact({
        bookHash: 'generated-performance-' + count,
        provider: 'deepseek',
        promptVersion: 'translation-v1',
        sourceLang: 'en',
        targetLang: 'zh-CN',
      });
      const artifactStore = new TranslationArtifactStore(service);
      const jobStore = new TranslationJobStore(service);
      const calls = new Map<string, number>();
      let active = 0;
      let peakActive = 0;
      const input = {
        artifact,
        kind: count === 20 ? ('chapter' as const) : ('book' as const),
        items,
        artifactStore,
        jobStore,
        concurrency: 2,
        translate: async (item: { id: string; text: string }) => {
          calls.set(item.id, (calls.get(item.id) ?? 0) + 1);
          active++;
          peakActive = Math.max(peakActive, active);
          try {
            await new Promise((done) => setTimeout(done, 2));
            return '本地模拟译文 ' + item.text;
          } finally {
            active--;
          }
        },
      };
      let controller = new TranslationBatchController(input);
      let paused = false;
      const unsubscribe = controller.subscribe((snapshot) => {
        if (count === 5000 && !paused && snapshot.completed >= 128) {
          paused = true;
          controller.pause();
        }
      });
      const started = performance.now();
      let result = await controller.start();
      unsubscribe();
      let recoveredCompleted = 0;
      if (count === 5000) {
        if (result.status !== 'paused') throw new Error('Full-book checkpoint was not paused');
        const durable = await jobStore.load(result.id);
        const savedArtifact = await artifactStore.load(artifact);
        if (!durable || !savedArtifact || durable.completed < 128)
          throw new Error('Native queue checkpoint was not durable');
        recoveredCompleted = durable.completed;
        controller = new TranslationBatchController({
          ...input,
          artifact: savedArtifact,
          initialJobSnapshot: durable,
        });
        result = await controller.resume();
      }
      await controller.flush();
      const elapsedMs = performance.now() - started;
      const durable = await jobStore.load(result.id);
      const durableArtifact = await artifactStore.load(artifact);
      if (
        result.status !== 'completed' ||
        durable?.completed !== count ||
        durableArtifact?.segments.length !== count ||
        calls.size !== count ||
        [...calls.values()].some((value) => value !== 1) ||
        active !== 0 ||
        peakActive > 2 ||
        controller.hasPendingWrites
      )
        throw new Error('Queue benchmark failed durable/concurrency/exactly-once verification');
      record(count === 20 ? 'chapterTranslationQueueMs' : 'fullBookQueueMs', elapsedMs, {
        segments: count,
        fixtureSha256,
        providerMode: 'local mock, 2ms nominal delay',
        peakActive,
        recoveredCompleted,
        completed: durable.completed,
        durableArtifactSegments: durableArtifact.segments.length,
        paidRequests: 0,
      });
    }

    report('comic-workspace-atomic');
    const workspace = createPerformanceWorkspace();
    const fixtureSha256 = await hash(workspace);
    const workspaceStore = new ComicWorkspaceStore(service);
    const saveSamples: number[] = [];
    const writesBefore = atomicWrites;
    for (let index = 0; index < 8; index++) {
      workspace.updatedAt = 101 + index;
      const started = performance.now();
      await workspaceStore.save(workspace);
      const elapsed = performance.now() - started;
      if (index >= 3) saveSamples.push(elapsed);
    }
    const restored = await workspaceStore.load(workspace.bookHash);
    const contents = await service.readFile(
      getComicWorkspacePath(workspace.bookHash),
      'Data',
      'text',
    );
    if (
      !restored ||
      serializeComicWorkspace(restored) !== serializeComicWorkspace(workspace) ||
      typeof contents !== 'string' ||
      atomicWrites <= writesBefore
    )
      throw new Error('Workspace benchmark did not commit and restore atomic native data');
    const regions = restored.pages.flatMap((page) => page.regions);
    const details = {
      fixtureSha256,
      pages: restored.pages.length,
      regions: regions.length,
      manualRevisions: regions.filter((region) => region.manual).length,
      translations: regions.filter((region) => region.translation).length,
      sidecarBytes: new TextEncoder().encode(contents).byteLength,
      atomicWrites: atomicWrites - writesBefore,
      samplesMs: saveSamples,
      warmupSaves: 3,
      pageBytesLoaded: 0,
    };
    record('comicWorkspaceSaveMs', percentile95(saveSamples), details);

    report('comic-overlay');
    const host = document.createElement('div');
    host.style.cssText = 'position:relative;width:600px;height:900px';
    document.body.append(host);
    const reactRoot = createRoot(host);
    const renderSamples: number[] = [];
    const page = restored.pages[0]!;
    try {
      for (let index = 0; index < 60; index++) {
        await frame();
        const current = {
          ...page,
          regions: page.regions.map((region) => ({
            ...region,
            translation: region.translation
              ? {
                  ...region.translation,
                  translatedText: region.translation.translatedText + ' ' + index,
                }
              : undefined,
          })),
        };
        const started = performance.now();
        flushSync(() =>
          reactRoot.render(React.createElement(ComicTranslationOverlay, { page: current })),
        );
        const overlay = host.querySelector('[data-comic-overlay-page]');
        if (!overlay || overlay.getBoundingClientRect().width !== 600)
          throw new Error('Overlay did not reach a browser layout frame');
        const elapsed = performance.now() - started;
        if (host.querySelectorAll('[data-comic-region]').length !== 45)
          throw new Error('Stale translations were rendered by the real component');
        if (index >= 10) renderSamples.push(elapsed);
      }
    } finally {
      flushSync(() => reactRoot.unmount());
      host.remove();
    }
    record('comicOverlayRenderMs', percentile95(renderSamples), {
      fixtureSha256,
      samplesMs: renderSamples,
      warmupUpdates: 10,
      scope:
        'warmed native WebView2 React commit plus synchronous style/layout; not GPU presentation latency',
      pageRegions: page.regions.length,
      displayedRegions: createComicOverlayBlocks(page).length,
      staleRegionsFiltered: 5,
      pageBytesLoaded: 0,
    });
    return {
      stage: 'performance',
      passed: measurements.every((item) => item.passed),
      measurements,
      atomicWrites,
      source: 'generated local fixtures',
      scope:
        'native queue/checkpoint/workspace and warmed overlay paths, not the complete release matrix',
    };
  } catch (error) {
    return {
      stage: 'performance',
      passed: false,
      error: String(error),
      measurements,
      atomicWrites,
      scope:
        'partial native performance evidence; retain failure, never qualify incomplete scenarios',
    };
  }
}
