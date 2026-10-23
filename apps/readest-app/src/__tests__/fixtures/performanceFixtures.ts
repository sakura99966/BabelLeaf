import {
  COMIC_WORKSPACE_FORMAT,
  COMIC_WORKSPACE_SCHEMA_VERSION,
  type ComicWorkspace,
} from '@/services/translators/comicWorkspace';

export function percentile95(samples: readonly number[]): number {
  if (
    !samples.length ||
    samples.length > 10_000 ||
    samples.some((value) => !Number.isFinite(value) || value < 0)
  )
    throw new Error('Invalid performance samples');
  return [...samples].sort((left, right) => left - right)[Math.ceil(samples.length * 0.95) - 1]!;
}

export function createPerformanceQueueItems(count: number) {
  if (!Number.isInteger(count) || count <= 0 || count > 5000)
    throw new Error('Invalid fixture size');
  return Array.from({ length: count }, (_, index) => ({
    id: 'segment-' + index,
    chapterId: 'chapter-' + Math.floor(index / 250),
    text:
      'Generated local performance segment ' + index + '. No external book or provider is used.',
  }));
}

export function createPerformanceWorkspace(): ComicWorkspace {
  const bookHash = 'generated-performance-comic';
  return {
    format: COMIC_WORKSPACE_FORMAT,
    schemaVersion: COMIC_WORKSPACE_SCHEMA_VERSION,
    bookHash,
    sourceFormat: 'CBZ',
    createdAt: 100,
    updatedAt: 100,
    revision: 1,
    pages: Array.from({ length: 20 }, (_, pageIndex) => {
      const pageId = 'page-' + pageIndex;
      return {
        pageIndex,
        pageId,
        width: 1200,
        height: 1800,
        format: 'png',
        localRef: 'generated-local/' + pageId + '.png',
        updatedAt: 100,
        regions: Array.from({ length: 50 }, (_, index) => {
          const id = pageId + '-region-' + index;
          const x = (index % 10) * 110 + 5;
          const y = Math.floor(index / 10) * 200 + 5;
          const corrected = index % 10 === 1;
          const sourceText = corrected
            ? 'Corrected local text ' + id
            : 'Generated local text ' + id;
          return {
            id,
            pageId,
            source: 'ocr',
            machineRevision: 1,
            machine: {
              id,
              pageId,
              polygon: [
                { x, y },
                { x: x + 100, y },
                { x: x + 100, y: y + 160 },
                { x, y: y + 160 },
              ],
              orientation: 'horizontal',
              language: 'en',
              text: 'Generated local text ' + id,
              readingOrder: index,
              engine: 'generated-local',
            },
            ...(corrected ? { manual: { revision: 1, updatedAt: 100, text: sourceText } } : {}),
            translation: {
              sourceText,
              sourceRevision: 1,
              targetLang: 'zh-CN',
              status: 'translated',
              provider: 'deepseek',
              promptVersion: 'translation-v1',
              translatedText: '本地生成的性能测试译文 ' + id,
              stale: index % 10 === 0,
              updatedAt: 100,
            },
            reviewStatus: corrected ? 'corrected' : 'unreviewed',
            createdAt: 100,
            updatedAt: 100,
          };
        }),
      };
    }),
  };
}
