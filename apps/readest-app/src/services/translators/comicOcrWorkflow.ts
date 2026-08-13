import {
  COMIC_WORKER_PROTOCOL,
  COMIC_WORKER_PROTOCOL_VERSION,
  type ComicWorkerJobRequest,
  type ComicWorkerPageInput,
} from './comicWorkerProtocol';
import { mergeOcrPageResultIntoWorkspace, type ComicWorkspace } from './comicWorkspace';
import { closeOcrRuntime, createOcrRuntimePageProcessor, type GatedOcrRuntime } from './ocrRuntime';

export interface ComicOcrWorkflowProgress {
  completed: number;
  total: number;
  pageId: string;
}

export interface RunComicOcrPagesInput {
  runtime: GatedOcrRuntime;
  workspace: ComicWorkspace;
  pageIds: string[];
  signal: AbortSignal;
  requestId?: string;
  checkpoint: (workspace: ComicWorkspace) => Promise<void> | void;
  onProgress?: (progress: ComicOcrWorkflowProgress) => void;
}

export interface ComicOcrWorkflowResult {
  workspace: ComicWorkspace;
  completedPageIds: string[];
}

export class ComicOcrWorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComicOcrWorkflowError';
  }
}

const assertActive = (signal: AbortSignal): void => {
  if (signal.aborted) throw new ComicOcrWorkflowError('Comic OCR was cancelled');
};

const requestId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `ocr-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * Run one gated local runtime sequentially over selected pages. Each page is
 * merged and checkpointed before the next starts, preserving manual edits and
 * making interruption recovery deterministic.
 */
export const runComicOcrPages = async (
  input: RunComicOcrPagesInput,
): Promise<ComicOcrWorkflowResult> => {
  const ids = [...new Set(input.pageIds)];
  if (ids.length === 0) throw new ComicOcrWorkflowError('Select at least one comic page for OCR');
  const selected = ids.map((id) => {
    const page = input.workspace.pages.find((candidate) => candidate.pageId === id);
    if (!page) throw new ComicOcrWorkflowError(`Comic OCR page is unavailable: ${id}`);
    return {
      pageId: page.pageId,
      width: page.width,
      height: page.height,
      format: page.format,
      localRef: page.localRef,
    } satisfies ComicWorkerPageInput;
  });
  const request: ComicWorkerJobRequest = {
    protocol: COMIC_WORKER_PROTOCOL,
    protocolVersion: COMIC_WORKER_PROTOCOL_VERSION,
    requestId: input.requestId ?? requestId(),
    bookHash: input.workspace.bookHash,
    pages: selected,
    sourceLangs: [...input.runtime.model.languages],
    options: {
      detect: true,
      ocr: true,
      verticalText: input.runtime.engine.descriptor.capabilities.includes('vertical-text'),
      maxPages: selected.length,
    },
  };
  const processPage = createOcrRuntimePageProcessor(input.runtime);
  const completedPageIds: string[] = [];
  let current = input.workspace;
  try {
    for (const page of selected) {
      assertActive(input.signal);
      const result = await processPage(page, request, input.signal);
      assertActive(input.signal);
      current = mergeOcrPageResultIntoWorkspace(current, result);
      await input.checkpoint(current);
      completedPageIds.push(page.pageId);
      input.onProgress?.({
        completed: completedPageIds.length,
        total: selected.length,
        pageId: page.pageId,
      });
    }
    return { workspace: current, completedPageIds };
  } finally {
    await closeOcrRuntime(input.runtime);
  }
};
