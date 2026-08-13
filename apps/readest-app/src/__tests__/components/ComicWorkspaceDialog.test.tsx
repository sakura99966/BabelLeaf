import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import ComicWorkspaceDialog from '@/app/reader/components/ComicWorkspaceDialog';
import type { ComicWorkspace } from '@/services/translators';

const mocks = vi.hoisted(() => {
  const selectFiles = vi.fn();
  const deleteFile = vi.fn();
  const deleteDir = vi.fn();
  const createDir = vi.fn();
  const readFile = vi.fn();
  const writeFile = vi.fn();
  const getBlobURL = vi.fn();
  return {
    translate: (key: string) => key,
    selectFiles,
    workspaceLoad: vi.fn(),
    workspaceSave: vi.fn(),
    editLoad: vi.fn(),
    editSave: vi.fn(),
    pipelineLoad: vi.fn(),
    pipelineSave: vi.fn(),
    listOcrPacks: vi.fn(),
    loadOcrPack: vi.fn(),
    trustedOcrEvidence: vi.fn(),
    createOcrFactory: vi.fn(),
    createGatedOcrRuntime: vi.fn(),
    runOcrPages: vi.fn(),
    deleteFile,
    deleteDir,
    createDir,
    readFile,
    writeFile,
    getBlobURL,
    onClose: vi.fn(),
    appService: { deleteFile, deleteDir, createDir, readFile, writeFile, getBlobURL },
  };
});

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: mocks.appService }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => mocks.translate,
}));

vi.mock('@/hooks/useFileSelector', () => ({
  useFileSelector: () => ({ selectFiles: mocks.selectFiles }),
}));

vi.mock('@/hooks/useTranslator', () => ({
  useTranslator: () => ({ translators: [] }),
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getBookData: () => ({
      book: {
        hash: 'book-hash',
        format: 'CBZ',
        primaryLanguage: 'ja',
      },
    }),
  }),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    getViewSettings: () => ({
      translationProvider: 'deepseek',
      translateTargetLang: 'zh-CN',
    }),
  }),
}));

vi.mock('@/services/translators/providers', () => ({
  getTranslator: () => undefined,
}));

vi.mock('@/components/Dialog', () => ({
  default: ({
    isOpen,
    title,
    children,
    onClose,
  }: React.PropsWithChildren<{ isOpen: boolean; title: string; onClose: () => void }>) =>
    isOpen ? (
      <section aria-label={title}>
        <button type='button' onClick={onClose}>
          Close
        </button>
        {children}
      </section>
    ) : null,
}));

vi.mock('@/app/reader/components/ComicRegionEditor', () => ({
  default: ({ page }: { page: { pageId: string; regions: unknown[] } }) => (
    <div data-testid='comic-region-editor'>
      {page.pageId}:{page.regions.length}
    </div>
  ),
}));

vi.mock('@/app/reader/components/ComicMaskEditor', () => ({ default: () => null }));
vi.mock('@/app/reader/components/ComicPolygonEditor', () => ({ default: () => null }));
vi.mock('@/app/reader/components/ComicTranslationOverlay', () => ({ default: () => null }));
vi.mock('@/app/reader/components/OcrTextLayer', () => ({ default: () => null }));

vi.mock('@/services/translators', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/translators')>();
  class ComicWorkspaceStore {
    load(bookHash: string) {
      return mocks.workspaceLoad(bookHash);
    }
    save(workspace: unknown) {
      return mocks.workspaceSave(workspace);
    }
  }
  class ComicEditSidecarStore {
    load(bookHash: string) {
      return mocks.editLoad(bookHash);
    }
    save(sidecar: unknown) {
      return mocks.editSave(sidecar);
    }
  }
  class ComicPipelineStore {
    load(id: string) {
      return mocks.pipelineLoad(id);
    }
    save(snapshot: unknown) {
      return mocks.pipelineSave(snapshot);
    }
  }
  return {
    ...actual,
    ComicWorkspaceStore,
    ComicEditSidecarStore,
    ComicPipelineStore,
    listOcrModelPacks: mocks.listOcrPacks,
    loadOcrModelPack: mocks.loadOcrPack,
    createTrustedTesseractBenchmarkEvidence: mocks.trustedOcrEvidence,
    createTesseractOcrRuntimeFactory: mocks.createOcrFactory,
    createInstalledGatedOcrRuntime: mocks.createGatedOcrRuntime,
    runComicOcrPages: mocks.runOcrPages,
  };
});

const restoredWorkspace = {
  format: 'babelleaf.comic-workspace' as const,
  schemaVersion: 1 as const,
  bookHash: 'book-hash',
  sourceFormat: 'CBZ' as const,
  createdAt: 1,
  updatedAt: 1,
  revision: 1,
  pages: [
    {
      pageId: 'page-1',
      pageIndex: 0,
      width: 1000,
      height: 1500,
      format: 'png' as const,
      localRef: 'Books/book-hash/page-1.png',
      updatedAt: 1,
      regions: [],
    },
  ],
};

const trustedOcrModel = {
  format: 'babelleaf.ocr-model' as const,
  schemaVersion: 2 as const,
  id: 'tessdata-fast-jpn',
  version: '4.1.0',
  runtime: 'wasm' as const,
  languages: ['ja'],
  license: 'Apache-2.0',
  checksumSha256: 'a'.repeat(64),
  sizeBytes: 2,
  source: 'local-import' as const,
  engineCompatibility: ['tesseract-wasm'],
  cpuFallback: true,
  artifacts: [
    {
      id: 'traineddata',
      fileName: 'jpn.traineddata',
      sizeBytes: 1,
      checksumSha256: 'b'.repeat(64),
    },
    {
      id: 'license',
      fileName: 'LICENSE.txt',
      sizeBytes: 1,
      checksumSha256: 'c'.repeat(64),
    },
  ],
  primaryArtifactId: 'traineddata',
};

beforeEach(() => {
  for (const mock of [
    mocks.selectFiles,
    mocks.workspaceLoad,
    mocks.workspaceSave,
    mocks.editLoad,
    mocks.editSave,
    mocks.pipelineLoad,
    mocks.pipelineSave,
    mocks.listOcrPacks,
    mocks.loadOcrPack,
    mocks.trustedOcrEvidence,
    mocks.createOcrFactory,
    mocks.createGatedOcrRuntime,
    mocks.runOcrPages,
    mocks.deleteFile,
    mocks.deleteDir,
    mocks.createDir,
    mocks.readFile,
    mocks.writeFile,
    mocks.getBlobURL,
    mocks.onClose,
  ]) {
    mock.mockReset();
  }
  mocks.selectFiles.mockResolvedValue({ files: [], error: null });
  mocks.workspaceLoad.mockResolvedValue(null);
  mocks.workspaceSave.mockResolvedValue(undefined);
  mocks.editLoad.mockResolvedValue(null);
  mocks.editSave.mockResolvedValue(undefined);
  mocks.pipelineLoad.mockResolvedValue(null);
  mocks.pipelineSave.mockResolvedValue(undefined);
  mocks.listOcrPacks.mockResolvedValue([]);
  mocks.trustedOcrEvidence.mockReturnValue(null);
  mocks.writeFile.mockResolvedValue(undefined);
  mocks.getBlobURL.mockResolvedValue('blob:comic-page');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ComicWorkspaceDialog', () => {
  test('opens offline with an empty local workspace and surfaces picker failures', async () => {
    mocks.selectFiles.mockResolvedValue({ files: [], error: 'picker unavailable' });
    render(<ComicWorkspaceDialog bookKey='book-hash-window' isOpen onClose={mocks.onClose} />);

    await waitFor(() => expect(mocks.workspaceLoad).toHaveBeenCalledWith('book-hash'));
    expect(mocks.editLoad).toHaveBeenCalledWith('book-hash');
    expect(
      screen.getByText(
        'Import local image files, a CBZ/FBZ archive, or a PDF to begin. OCR model packs are managed in Settings → AI Translation.',
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Import pages / CBZ / FBZ / PDF' }));
    await waitFor(() => expect(screen.getByText('picker unavailable')).toBeTruthy());
    expect(mocks.workspaceSave).not.toHaveBeenCalled();
  });

  test('restores a sidecar and persists a new manual region without modifying its source reference', async () => {
    mocks.workspaceLoad.mockResolvedValue(restoredWorkspace);
    render(<ComicWorkspaceDialog bookKey='book-hash-window' isOpen onClose={mocks.onClose} />);

    await waitFor(() => expect(screen.getByText('1. page-1')).toBeTruthy());
    expect(document.body.textContent).toContain('1 pages in sidecar');
    expect(
      screen.getByText('Re-import the source pages to edit or export this sidecar.'),
    ).toBeTruthy();
    expect(screen.getByTestId('comic-region-editor').textContent).toBe('page-1:0');

    fireEvent.change(screen.getByRole('textbox', { name: 'New OCR region text' }), {
      target: { value: ' 手工文本 ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add region' }));

    await waitFor(() => expect(mocks.workspaceSave).toHaveBeenCalledTimes(1));
    const saved = mocks.workspaceSave.mock.calls[0]![0];
    expect(saved.pages[0].localRef).toBe('Books/book-hash/page-1.png');
    expect(saved.pages[0].regions).toHaveLength(1);
    expect(saved.pages[0].regions[0].manual.text).toBe('手工文本');
    expect(screen.getByTestId('comic-region-editor').textContent).toBe('page-1:1');
  });

  test('runs an explicitly selected verified local OCR pack and checkpoints its page result', async () => {
    mocks.workspaceLoad.mockResolvedValue(restoredWorkspace);
    mocks.listOcrPacks.mockResolvedValue([trustedOcrModel]);
    mocks.trustedOcrEvidence.mockReturnValue({
      engine: 'tesseract-wasm',
      modelId: trustedOcrModel.id,
      platforms: ['win32-x64'],
    });
    mocks.loadOcrPack.mockResolvedValue({ manifest: trustedOcrModel });
    mocks.createOcrFactory.mockReturnValue({ create: vi.fn() });
    mocks.createGatedOcrRuntime.mockResolvedValue({ model: trustedOcrModel });
    mocks.runOcrPages.mockImplementation(
      async (input: {
        workspace: ComicWorkspace;
        pageIds: string[];
        checkpoint: (workspace: ComicWorkspace) => Promise<void>;
        onProgress?: (progress: { completed: number; total: number; pageId: string }) => void;
      }) => {
        const next = structuredClone(input.workspace);
        const now = Date.now();
        next.pages[0]!.regions = [
          {
            id: 'page-1:tesseract:0001',
            pageId: 'page-1',
            source: 'ocr',
            machine: {
              id: 'page-1:tesseract:0001',
              pageId: 'page-1',
              polygon: [
                { x: 10, y: 10 },
                { x: 200, y: 10 },
                { x: 200, y: 80 },
                { x: 10, y: 80 },
              ],
              orientation: 'horizontal',
              language: 'ja',
              text: '日本語',
              readingOrder: 0,
              engine: 'tesseract-wasm',
              model: trustedOcrModel.id,
            },
            machineRevision: 1,
            reviewStatus: 'unreviewed',
            createdAt: now,
            updatedAt: now,
          },
        ];
        await input.checkpoint(next);
        input.onProgress?.({ completed: 1, total: 1, pageId: 'page-1' });
        return { workspace: next, completedPageIds: ['page-1'] };
      },
    );
    const bitmapClose = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 1000, height: 1500, close: bitmapClose })),
    );
    const pageFile = new File([new Uint8Array([1, 2, 3])], 'page.png', {
      type: 'image/png',
    });
    mocks.selectFiles.mockResolvedValue({
      files: [{ name: pageFile.name, file: pageFile }],
      error: null,
    });

    render(<ComicWorkspaceDialog bookKey='book-hash-window' isOpen onClose={mocks.onClose} />);
    await waitFor(() => expect(screen.getByText(/tessdata-fast-jpn/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Import pages / CBZ / FBZ / PDF' }));
    await waitFor(() =>
      expect(
        screen.getByText('Pages imported. Add OCR regions manually or load an OCR sidecar.'),
      ).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Run local OCR' }));

    await waitFor(() =>
      expect(screen.getByText(/Local OCR completed and saved to the sidecar/)).toBeTruthy(),
    );
    expect(mocks.loadOcrPack).toHaveBeenCalledWith(
      expect.any(Object),
      trustedOcrModel.id,
      trustedOcrModel.version,
    );
    expect(mocks.createGatedOcrRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceLanguages: ['ja'],
        requiredCapabilities: ['ocr', 'text-layer'],
      }),
    );
    expect(mocks.runOcrPages).toHaveBeenCalledWith(
      expect.objectContaining({ pageIds: ['page-1'] }),
    );
    const saved = mocks.workspaceSave.mock.calls.at(-1)![0];
    expect(saved.pages[0].regions[0].machine.text).toBe('日本語');
    expect(saved.pages[0].localRef).toBe('session://book-hash/page-1');
    expect(screen.getByText('1/1 · page-1')).toBeTruthy();
    expect(bitmapClose).toHaveBeenCalledTimes(1);
  });

  test('does not load local sidecars while closed', async () => {
    render(
      <ComicWorkspaceDialog bookKey='book-hash-window' isOpen={false} onClose={mocks.onClose} />,
    );

    expect(screen.queryByLabelText('Comic workspace')).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.workspaceLoad).not.toHaveBeenCalled();
    expect(mocks.editLoad).not.toHaveBeenCalled();
  });
});
