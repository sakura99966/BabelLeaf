import { describe, expect, test } from 'vitest';
import {
  COMIC_WORKER_PROTOCOL,
  COMIC_WORKER_PROTOCOL_VERSION,
  createComicWorkerAdapter,
  createMockComicOcrEngine,
  parseComicWorkerDescriptor,
  parseComicWorkerRequest,
  type ComicWorkerJobRequest,
} from '@/services/translators';

const request = {
  protocol: COMIC_WORKER_PROTOCOL,
  protocolVersion: COMIC_WORKER_PROTOCOL_VERSION,
  requestId: 'request-1',
  bookHash: 'book-1',
  sourceLangs: ['ja'],
  pages: [
    { pageId: 'page-1', width: 1000, height: 1400, format: 'png', localRef: 'Books/page-1.png' },
  ],
} satisfies ComicWorkerJobRequest;

describe('comic worker protocol', () => {
  test('swaps a mock OCR engine behind the protocol', async () => {
    const adapter = createComicWorkerAdapter(
      createMockComicOcrEngine({
        'page-1': [
          {
            id: 'region-1',
            pageId: 'page-1',
            polygon: [
              { x: 0, y: 0 },
              { x: 10, y: 0 },
              { x: 10, y: 10 },
            ],
            orientation: 'vertical',
            language: 'ja',
            text: 'こんにちは',
            confidence: 0.98,
            readingOrder: 0,
            engine: 'mock',
          },
        ],
      }),
    );
    const events: string[] = [];
    const result = await adapter.process(request, (event) => events.push(event.type));
    expect(adapter.describe().capabilities).toContain('ocr');
    expect(result.pages[0]).toMatchObject({ pageId: 'page-1', status: 'completed' });
    expect(result.pages[0]?.regions[0]).toMatchObject({
      text: 'こんにちは',
      orientation: 'vertical',
    });
    expect(events).toEqual(expect.arrayContaining(['progress', 'result']));
  });

  test('rejects oversized pages and incompatible descriptors', () => {
    expect(() =>
      parseComicWorkerRequest({
        ...request,
        pages: [{ ...request.pages[0], width: 100_000, height: 100_000 }],
      }),
    ).toThrow('pixel limit');
    expect(() =>
      parseComicWorkerDescriptor({ protocol: COMIC_WORKER_PROTOCOL, protocolVersion: 99 }),
    ).toThrow('Unsupported');
  });
});
