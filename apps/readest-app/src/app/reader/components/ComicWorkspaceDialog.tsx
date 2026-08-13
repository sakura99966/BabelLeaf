'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { arch as osArch, platform as osPlatform } from '@tauri-apps/plugin-os';
import Dialog from '@/components/Dialog';
import { useEnv } from '@/context/EnvContext';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useFileSelector, type SelectedFile } from '@/hooks/useFileSelector';
import { useTranslator } from '@/hooks/useTranslator';
import ComicRegionEditor from './ComicRegionEditor';
import ComicMaskEditor from './ComicMaskEditor';
import ComicPolygonEditor from './ComicPolygonEditor';
import ComicTranslationOverlay from './ComicTranslationOverlay';
import OcrTextLayer from './OcrTextLayer';
import {
  ComicEditingSession,
  ComicEditSidecarStore,
  ComicPipelineQueue,
  ComicPipelineStore,
  ComicWorkspaceStore,
  approveComicRegion,
  createEmptyComicEditSidecar,
  cleanupComicImage,
  createInstalledLamaInpaintWorker,
  createComicWorkspaceFromOcrSidecar,
  createInstalledGatedOcrRuntime,
  createComicPipelinePageSetSignature,
  createManualComicRegion,
  createComicWorkspacePage,
  editComicRegion,
  exportComicPages,
  getEffectiveComicRegion,
  mergeComicRegions,
  listOcrModelPacks,
  loadInpaintModelPack,
  loadOcrModelPack,
  parseComicWorkspace,
  parseOcrSidecar,
  rasterizeComicMask,
  recordComicTranslationFailure,
  runComicOcrPages,
  reorderComicRegions,
  revertComicRegion,
  setComicEditPageMask,
  splitComicRegion,
  translateComicRegion,
  createTesseractOcrRuntimeFactory,
  createTrustedTesseractBenchmarkEvidence,
  type ComicEditSidecar,
  type ComicPipelinePage,
  type ComicPipelineSnapshot,
  type ComicMaskSnapshot,
  type ComicRgbaImage,
  type ComicRenderedPage,
  type ComicWorkspace,
  type ComicWorkspacePage,
  type ComicRegionPatch,
  type OcrPageRecord,
  type OcrModelManifest,
  type OcrModelPackStorage,
  type InpaintModelPackStorage,
  type OcrSourceFormat,
  MAX_COMIC_WORKER_IMAGE_PIXELS,
} from '@/services/translators';
import { getTranslator } from '@/services/translators/providers';
import type { TranslatorName } from '@/services/translators';

interface ComicAsset {
  pageId: string;
  pageIndex: number;
  name: string;
  format: 'png' | 'jpeg' | 'webp';
  mimeType: string;
  width: number;
  height: number;
  /** Source bytes are spooled under the current Temp session, not kept in React state. */
  path: string;
  byteLength: number;
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];
const IMPORT_EXTENSIONS = [...IMAGE_EXTENSIONS, 'cbz', 'fbz', 'pdf'];
/** Keep decoded import memory below the desktop idle budget with headroom. */
const MAX_IMPORTED_PAGES = 2_000;
const MAX_IMPORTED_SOURCE_BYTES = 512 * 1024 * 1024;
const MAX_IMPORTED_DECODED_BYTES = 256 * 1024 * 1024;
const MAX_IMPORTED_PAGE_BYTES = 64 * 1024 * 1024;
const MAX_IMPORTED_COMPRESSION_RATIO = 100;
const MAX_IMPORTED_PDF_PAGES = MAX_IMPORTED_PAGES;
const basename = (name: string): string => name.replaceAll('\\', '/').split('/').pop() || name;
const extension = (name: string): string => basename(name).split('.').pop()?.toLowerCase() || '';

const inferImage = (name: string, mimeType: string): ComicAsset['format'] => {
  const ext = extension(name);
  if (mimeType === 'image/png' || ext === 'png') return 'png';
  if (mimeType === 'image/webp' || ext === 'webp') return 'webp';
  return 'jpeg';
};

const imageSize = async (blob: Blob): Promise<{ width: number; height: number }> => {
  if ('createImageBitmap' in globalThis) {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  }
  const url = URL.createObjectURL(blob);
  try {
    const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('Unable to decode comic page image'));
      image.src = url;
    });
    return size;
  } finally {
    URL.revokeObjectURL(url);
  }
};

const drawBlob = async (
  context: CanvasRenderingContext2D,
  blob: Blob,
  width: number,
  height: number,
): Promise<void> => {
  if ('createImageBitmap' in globalThis) {
    const bitmap = await createImageBitmap(blob);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return;
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const value = new Image();
      value.onload = () => resolve(value);
      value.onerror = () => reject(new Error('Unable to decode comic page image'));
      value.src = url;
    });
    context.drawImage(image, 0, 0, width, height);
  } finally {
    URL.revokeObjectURL(url);
  }
};

const readSelected = async (
  selected: SelectedFile,
  appService: NonNullable<ReturnType<typeof useEnv>['appService']>,
): Promise<{ name: string; file: File }> => {
  if (selected.file) return { name: selected.file.name, file: selected.file };
  if (!selected.path) throw new Error('Selected comic file has no local path');
  const file = await appService.openFile(selected.path, 'None');
  return { name: selected.name || file.name || basename(selected.path), file };
};

interface PdfPageRender {
  src: string;
  data?: string;
  onZoom: (input: { doc: Document; scale: number; pageColors?: unknown }) => Promise<void>;
}

const parsePdfViewport = (data: string | undefined): { width: number; height: number } | null => {
  const match = data?.match(/content=["']width=([\d.]+),\s*height=([\d.]+)["']/i);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? { width, height }
    : null;
};

const canvasBlob = (canvas: HTMLCanvasElement): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('PDF page rasterization failed'))),
      'image/jpeg',
      0.95,
    );
  });

/** Rasterize a local PDF one page at a time through the existing PDF.js path. */
async function* extractPdfImages(file: File): AsyncGenerator<File> {
  const { makePDF } = await import('foliate-js/pdf.js');
  const book = (await makePDF(file)) as {
    sections?: Array<{ load: () => Promise<PdfPageRender> }>;
    destroy?: () => void;
  };
  try {
    const sections = book.sections || [];
    if (sections.length === 0) throw new Error('The PDF has no pages');
    if (sections.length > MAX_IMPORTED_PDF_PAGES) throw new Error('PDF exceeds the page limit');
    let totalBytes = 0;
    for (const [index, section] of sections.entries()) {
      const page = await section.load();
      const frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      frame.style.cssText =
        'position:fixed;left:-100000px;top:-100000px;width:1px;height:1px;border:0;opacity:0;';
      const frameLoaded = new Promise<void>((resolve, reject) => {
        frame.addEventListener('load', () => resolve(), { once: true });
        frame.addEventListener(
          'error',
          () => reject(new Error('PDF page document failed to load')),
          { once: true },
        );
      });
      document.body.append(frame);
      frame.src = page.src;
      try {
        await frameLoaded;
        const doc = frame.contentDocument;
        if (!doc?.defaultView) throw new Error('PDF page document is unavailable');
        const viewport = parsePdfViewport(page.data);
        const deviceScale = Math.max(1, Math.min(2, globalThis.devicePixelRatio || 1));
        const initialScale = viewport
          ? Math.min(
              1,
              Math.sqrt(
                MAX_COMIC_WORKER_IMAGE_PIXELS /
                  (viewport.width * viewport.height * deviceScale * deviceScale),
              ),
            )
          : 1;
        await page.onZoom({ doc, scale: initialScale });
        let canvas = doc.querySelector('#canvas canvas');
        if (!(canvas instanceof HTMLCanvasElement)) {
          throw new Error(`PDF page ${index + 1} did not produce an image`);
        }
        if (canvas.width * canvas.height > MAX_COMIC_WORKER_IMAGE_PIXELS) {
          const reduction = Math.sqrt(
            MAX_COMIC_WORKER_IMAGE_PIXELS / (canvas.width * canvas.height),
          );
          await page.onZoom({ doc, scale: initialScale * reduction });
          canvas = doc.querySelector('#canvas canvas');
        }
        if (
          !(canvas instanceof HTMLCanvasElement) ||
          canvas.width * canvas.height > MAX_COMIC_WORKER_IMAGE_PIXELS
        ) {
          throw new Error(`PDF page ${index + 1} exceeds the raster resource limit`);
        }
        const blob = await canvasBlob(canvas);
        totalBytes += blob.size;
        if (totalBytes > MAX_IMPORTED_SOURCE_BYTES) {
          throw new Error('PDF page data exceeds the import byte limit');
        }
        canvas.width = 0;
        canvas.height = 0;
        yield new File([blob], `page-${String(index + 1).padStart(5, '0')}.jpg`, {
          type: 'image/jpeg',
        });
      } finally {
        frame.remove();
      }
    }
  } finally {
    book.destroy?.();
  }
}

async function* extractImages(selected: { name: string; file: File }): AsyncGenerator<File> {
  const ext = extension(selected.name);
  if (ext === 'pdf') {
    yield* extractPdfImages(selected.file);
    return;
  }
  if (ext !== 'cbz' && ext !== 'fbz') {
    yield selected.file;
    return;
  }
  const { BlobReader, BlobWriter, ZipReader } = await import('@zip.js/zip.js');
  const reader = new ZipReader(new BlobReader(selected.file));
  try {
    const entries = (await reader.getEntries())
      .filter((entry) => !entry.directory && IMAGE_EXTENSIONS.includes(extension(entry.filename)))
      .sort((left, right) =>
        left.filename.localeCompare(right.filename, undefined, { numeric: true }),
      );
    let totalBytes = 0;
    for (const entry of entries) {
      const declaredSize =
        typeof entry.uncompressedSize === 'number' && Number.isFinite(entry.uncompressedSize)
          ? entry.uncompressedSize
          : 0;
      const compressedSize =
        typeof entry.compressedSize === 'number' && Number.isFinite(entry.compressedSize)
          ? entry.compressedSize
          : 0;
      if (
        declaredSize > MAX_IMPORTED_PAGE_BYTES ||
        declaredSize > MAX_IMPORTED_SOURCE_BYTES ||
        totalBytes + declaredSize > MAX_IMPORTED_SOURCE_BYTES
      ) {
        throw new Error('Comic archive exceeds the uncompressed byte limit');
      }
      if (compressedSize > 0 && declaredSize > compressedSize * MAX_IMPORTED_COMPRESSION_RATIO) {
        throw new Error('Comic archive compression ratio exceeds the safety limit');
      }
      if (!('getData' in entry) || typeof entry.getData !== 'function') continue;
      const blob = await entry.getData(new BlobWriter());
      if (blob.size > MAX_IMPORTED_PAGE_BYTES) {
        throw new Error('Comic archive page exceeds the per-page byte limit');
      }
      totalBytes += blob.size;
      if (totalBytes > MAX_IMPORTED_SOURCE_BYTES) {
        throw new Error('Comic archive exceeds the uncompressed byte limit');
      }
      yield new File([blob], basename(entry.filename), { type: blob.type || 'image/*' });
    }
    if (entries.length === 0)
      throw new Error('No supported images were found in the comic archive');
  } finally {
    await reader.close();
  }
}

const revokeObjectUrl = (url: string | null | undefined): void => {
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
};

const cleanupComicAssets = async (
  assets: readonly ComicAsset[],
  appService: NonNullable<ReturnType<typeof useEnv>['appService']> | null,
): Promise<void> => {
  if (!appService) return;
  await Promise.all(
    assets.map(async (asset) => {
      try {
        await appService.deleteFile(asset.path, 'Temp');
      } catch {
        // Temp cleanup is best effort; a later bounded profile cleanup removes leftovers.
      }
    }),
  );
};

const sourceFormatFor = (bookFormat?: string, importedArchive?: string): OcrSourceFormat => {
  if (importedArchive === 'pdf') return 'PDF';
  if (importedArchive) return importedArchive === 'fbz' ? 'FBZ' : 'CBZ';
  if (bookFormat === 'PDF' || bookFormat === 'CBZ' || bookFormat === 'FBZ') return bookFormat;
  return 'IMAGE_FOLDER';
};

const toOcrModelStorage = (
  appService: NonNullable<ReturnType<typeof useEnv>['appService']>,
): OcrModelPackStorage => ({
  createDir: appService.createDir.bind(appService),
  readFile: appService.readFile.bind(appService),
  writeFile: appService.writeFile.bind(appService),
  removeFile: appService.deleteFile.bind(appService),
  removeDir: appService.deleteDir.bind(appService),
});

const toInpaintModelStorage = (
  appService: NonNullable<ReturnType<typeof useEnv>['appService']>,
): InpaintModelPackStorage => ({
  createDir: appService.createDir.bind(appService),
  readFile: appService.readFile.bind(appService),
  writeFile: appService.writeFile.bind(appService),
  removeDir: appService.deleteDir.bind(appService),
});

const localOcrPlatform = (): string => {
  try {
    const platform = osPlatform();
    const architecture = osArch();
    const normalizedPlatform = platform === 'windows' ? 'win32' : platform;
    const normalizedArchitecture = architecture === 'x86_64' ? 'x64' : architecture;
    return `${normalizedPlatform}-${normalizedArchitecture}`;
  } catch {
    return /Windows/i.test(globalThis.navigator?.userAgent ?? '') ? 'win32-x64' : 'unsupported';
  }
};

const ocrModelKey = (model: Pick<OcrModelManifest, 'id' | 'version'>): string =>
  `${model.id}\u0000${model.version}`;

interface ComicWorkspaceDialogProps {
  bookKey: string;
  isOpen: boolean;
  onClose: () => void;
}

/** Desktop comic/scanned-page editor. Bytes stay in the session and exports are separate files. */
const ComicWorkspaceDialog: React.FC<ComicWorkspaceDialogProps> = ({
  bookKey,
  isOpen,
  onClose,
}) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const { getBookData } = useBookDataStore();
  const { getViewSettings } = useReaderStore();
  const { selectFiles } = useFileSelector(appService, _);
  const bookData = getBookData(bookKey);
  const bookHash = bookData?.book?.hash || bookKey.split('-')[0] || bookKey;
  const viewSettings = getViewSettings(bookKey);
  const providerName = (viewSettings?.translationProvider || 'deepseek') as TranslatorName;
  const targetLang = viewSettings?.translateTargetLang || 'zh-CN';
  const sourceLang = bookData?.book?.primaryLanguage || 'auto';
  const { translators } = useTranslator({ provider: providerName, sourceLang, targetLang });
  const provider = useMemo(
    () =>
      getTranslator(providerName) ||
      translators.find((candidate) => candidate.name === providerName),
    [providerName, translators],
  );
  const workspaceStore = useMemo(
    () => (appService ? new ComicWorkspaceStore(appService) : null),
    [appService],
  );
  const editStore = useMemo(
    () => (appService ? new ComicEditSidecarStore(appService) : null),
    [appService],
  );
  const pipelineStore = useMemo(
    () => (appService ? new ComicPipelineStore(appService) : null),
    [appService],
  );
  const ocrModelStorage = useMemo(
    () => (appService ? toOcrModelStorage(appService) : null),
    [appService],
  );
  const inpaintModelStorage = useMemo(
    () => (appService ? toInpaintModelStorage(appService) : null),
    [appService],
  );
  const ocrPlatform = useMemo(localOcrPlatform, []);
  const [assets, setAssets] = useState<ComicAsset[]>([]);
  const [assetUrl, setAssetUrl] = useState<string | null>(null);
  const [cleanupPreviewUrl, setCleanupPreviewUrl] = useState<string | null>(null);
  const importBatchRef = useRef(0);
  const [workspace, setWorkspace] = useState<ComicWorkspace | null>(null);
  const workspaceRef = useRef<ComicWorkspace | null>(null);
  const [workspaceUndo, setWorkspaceUndo] = useState<ComicWorkspace[]>([]);
  const [workspaceRedo, setWorkspaceRedo] = useState<ComicWorkspace[]>([]);
  const [editSidecar, setEditSidecar] = useState<ComicEditSidecar | null>(null);
  const [selectedPageId, setSelectedPageId] = useState('');
  const [selectedRegionId, setSelectedRegionId] = useState<string | undefined>();
  const [showOcrTextLayer, setShowOcrTextLayer] = useState(true);
  const [showMaskEditor, setShowMaskEditor] = useState(false);
  const [useLamaInpaint, setUseLamaInpaint] = useState(false);
  const [lamaAvailable, setLamaAvailable] = useState(false);
  const [newRegionText, setNewRegionText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pipelineSnapshot, setPipelineSnapshot] = useState<ComicPipelineSnapshot | null>(null);
  const [pipelineSelectedPageIds, setPipelineSelectedPageIds] = useState<string[]>([]);
  const [pipelineRange, setPipelineRange] = useState('');
  const pipelineQueueRef = useRef<ComicPipelineQueue | null>(null);
  const [ocrModels, setOcrModels] = useState<OcrModelManifest[]>([]);
  const [selectedOcrModel, setSelectedOcrModel] = useState('');
  const [ocrScope, setOcrScope] = useState<'page' | 'book'>('page');
  const [ocrRunning, setOcrRunning] = useState(false);
  const [ocrProgress, setOcrProgress] = useState({ completed: 0, total: 0, pageId: '' });
  const ocrAbortRef = useRef<AbortController | null>(null);
  const pipelineId = `${bookHash}:translate:${providerName}:${targetLang}:${createComicPipelinePageSetSignature(
    assets.map(({ pageId, width, height, byteLength }) => ({
      pageId,
      width,
      height,
      byteLength,
    })),
  )}`;

  const persistWorkspace = useCallback(
    async (next: ComicWorkspace, options: { recordHistory?: boolean } = {}) => {
      if (options.recordHistory !== false && workspaceRef.current) {
        setWorkspaceUndo((history) => [...history.slice(-49), workspaceRef.current!]);
        setWorkspaceRedo([]);
      }
      workspaceRef.current = next;
      setWorkspace(next);
      if (workspaceStore) await workspaceStore.save(next);
    },
    [workspaceStore],
  );
  const persistEditSidecar = useCallback(
    async (next: ComicEditSidecar) => {
      setEditSidecar(next);
      if (editStore) await editStore.save(next);
    },
    [editStore],
  );

  useEffect(() => {
    if (!isOpen || !workspaceStore || !editStore) return;
    let active = true;
    setError(null);
    void Promise.all([workspaceStore.load(bookHash), editStore.load(bookHash)])
      .then(([savedWorkspace, savedEdit]) => {
        if (!active) return;
        workspaceRef.current = savedWorkspace;
        setWorkspace(savedWorkspace);
        setWorkspaceUndo([]);
        setWorkspaceRedo([]);
        setEditSidecar(savedEdit);
        setSelectedPageId(savedWorkspace?.pages[0]?.pageId || '');
        setSelectedRegionId(undefined);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      active = false;
    };
  }, [bookHash, editStore, isOpen, workspaceStore]);

  useEffect(() => {
    if (!isOpen || !ocrModelStorage) return;
    let active = true;
    void listOcrModelPacks(ocrModelStorage)
      .then((models) => {
        if (!active) return;
        setOcrModels(models);
        setSelectedOcrModel((current) => {
          const currentModel = models.find((model) => ocrModelKey(model) === current);
          if (currentModel && createTrustedTesseractBenchmarkEvidence(currentModel, ocrPlatform)) {
            return current;
          }
          const firstReady = models.find((model) =>
            createTrustedTesseractBenchmarkEvidence(model, ocrPlatform),
          );
          return firstReady ? ocrModelKey(firstReady) : '';
        });
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      active = false;
    };
  }, [isOpen, ocrModelStorage, ocrPlatform]);

  useEffect(() => {
    if (!isOpen || !inpaintModelStorage) return;
    let active = true;
    void loadInpaintModelPack(inpaintModelStorage)
      .then((record) => {
        if (!active) return;
        setLamaAvailable(Boolean(record));
        if (!record) setUseLamaInpaint(false);
      })
      .catch((reason: unknown) => {
        if (active) {
          setLamaAvailable(false);
          setUseLamaInpaint(false);
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    return () => {
      active = false;
    };
  }, [inpaintModelStorage, isOpen]);

  useEffect(
    () => () => {
      ocrAbortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    return () => {
      void cleanupComicAssets(assets, appService);
    };
  }, [appService, assets]);

  useEffect(() => {
    setCleanupPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  }, [selectedPageId]);

  useEffect(
    () => () => {
      if (cleanupPreviewUrl) URL.revokeObjectURL(cleanupPreviewUrl);
    },
    [cleanupPreviewUrl],
  );

  useEffect(() => {
    let active = true;
    setAssetUrl(null);
    const current = assets.find((candidate) => candidate.pageId === selectedPageId);
    if (!current || !appService) return;
    void appService
      .getBlobURL(current.path, 'Temp')
      .then((url) => {
        if (active) setAssetUrl(url);
        else revokeObjectUrl(url);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      active = false;
      setAssetUrl((url) => {
        revokeObjectUrl(url);
        return null;
      });
    };
  }, [appService, assets, selectedPageId]);

  /**
   * Restore a user-started translation queue only after the matching local
   * pages have been re-imported. The checkpoint contains page identities and
   * statuses, never image bytes or provider credentials.
   */
  useEffect(() => {
    if (!isOpen || !pipelineStore || !workspace || assets.length === 0) return;
    const existing = pipelineQueueRef.current?.getSnapshot();
    if (existing?.id === pipelineId) {
      const unsubscribe = pipelineQueueRef.current?.subscribe(setPipelineSnapshot);
      return () => unsubscribe?.();
    }
    let active = true;
    let unsubscribe: (() => void) | undefined;
    const pages: ComicPipelinePage[] = workspace.pages.map((candidate) => ({
      pageId: candidate.pageId,
      pageIndex: candidate.pageIndex,
      width: candidate.width,
      height: candidate.height,
      format: candidate.format,
      localRef: candidate.localRef,
    }));
    void pipelineStore
      .load(pipelineId)
      .then((saved) => {
        if (!active) return;
        const queue = new ComicPipelineQueue(
          {
            id: pipelineId,
            bookHash,
            sourceFingerprint: workspace.sourceFingerprint,
            sourceFormat: workspace.sourceFormat,
            phase: 'translate',
            engine: 'provider-translation',
            engineVersion: '1',
            modelId: providerName,
            pages,
            concurrency: 1,
            maxAttempts: 2,
            ...(saved ? { initialSnapshot: saved } : {}),
            checkpoint: { save: (snapshot) => pipelineStore.save(snapshot) },
          },
          async (item, signal) => {
            if (!provider) throw new Error(_('Translation provider is not configured.'));
            let currentWorkspace = workspaceRef.current;
            if (!currentWorkspace) throw new Error(_('Comic workspace is not loaded.'));
            const currentPage = currentWorkspace.pages.find(
              (candidate) => candidate.pageId === item.page.pageId,
            );
            if (!currentPage) throw new Error(_('The selected comic page is no longer available.'));
            let translatedCount = 0;
            for (const region of currentPage.regions) {
              if (signal.aborted) throw new Error(_('Comic translation was cancelled.'));
              const effective = getEffectiveComicRegion(region);
              const sourceText = effective?.text?.trim();
              if (!effective || !sourceText) continue;
              const existingTranslation = effective.translation;
              if (
                existingTranslation &&
                existingTranslation.targetLang === targetLang &&
                existingTranslation.translatedText?.trim() &&
                !existingTranslation.stale &&
                existingTranslation.status !== 'failed'
              ) {
                continue;
              }
              try {
                const result = await translateComicRegion({
                  workspace: currentWorkspace,
                  pageId: currentPage.pageId,
                  regionId: region.id,
                  provider,
                  sourceLang,
                  targetLang,
                  signal,
                });
                currentWorkspace = result.workspace;
                await persistWorkspace(currentWorkspace, { recordHistory: false });
                translatedCount += 1;
              } catch (reason: unknown) {
                try {
                  currentWorkspace = recordComicTranslationFailure(
                    {
                      workspace: currentWorkspace,
                      pageId: currentPage.pageId,
                      regionId: region.id,
                      provider,
                      sourceLang,
                      targetLang,
                    },
                    reason,
                  );
                  await persistWorkspace(currentWorkspace, { recordHistory: false });
                } catch {
                  // Preserve the provider failure as the queue item error.
                }
                throw reason;
              }
            }
            return {
              pageId: item.page.pageId,
              completedAt: Date.now(),
              ...(translatedCount === 0
                ? { warnings: [_('No untranslated text regions were found on this page.')] }
                : {}),
            };
          },
        );
        pipelineQueueRef.current = queue;
        unsubscribe = queue.subscribe(setPipelineSnapshot);
        setPipelineSelectedPageIds(queue.getSnapshot().items.map((entry) => entry.page.pageId));
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [
    assets.length,
    bookHash,
    isOpen,
    persistWorkspace,
    pipelineId,
    pipelineStore,
    provider,
    providerName,
    sourceLang,
    targetLang,
    workspace,
    _,
  ]);

  useEffect(() => {
    if (isOpen) return;
    pipelineQueueRef.current?.pause();
    ocrAbortRef.current?.abort();
  }, [isOpen]);

  useEffect(() => {
    if (isOpen || assets.length === 0) return;
    const closingAssets = assets;
    setAssets([]);
    setSelectedPageId('');
    setSelectedRegionId(undefined);
    void cleanupComicAssets(closingAssets, appService);
  }, [appService, assets, isOpen]);

  const undoWorkspace = async () => {
    const previous = workspaceUndo.at(-1);
    const current = workspaceRef.current;
    if (!previous || !current) return;
    setWorkspaceUndo((history) => history.slice(0, -1));
    setWorkspaceRedo((history) => [...history.slice(-49), current]);
    await persistWorkspace(previous, { recordHistory: false });
    setMessage(_('Last comic region change undone.'));
  };

  const redoWorkspace = async () => {
    const next = workspaceRedo.at(-1);
    const current = workspaceRef.current;
    if (!next || !current) return;
    setWorkspaceRedo((history) => history.slice(0, -1));
    setWorkspaceUndo((history) => [...history.slice(-49), current]);
    await persistWorkspace(next, { recordHistory: false });
    setMessage(_('Last comic region change reapplied.'));
  };

  const importPages = async () => {
    if (!appService) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const selection = await selectFiles({
        type: 'generic',
        multiple: true,
        extensions: IMPORT_EXTENSIONS,
        accept: IMPORT_EXTENSIONS.map((item) => `.${item}`).join(', '),
        dialogTitle: _('Import comic pages or CBZ archive'),
      });
      if (selection.error) throw new Error(selection.error);
      if (selection.files.length === 0) return;
      // Process each selected source and spool each extracted page immediately.
      // No multi-select, archive, or PDF extraction result is retained as an
      // in-memory page array.
      const firstSelectedName = selection.files[0]?.name || '';
      let imported: ComicAsset[] = [];
      const importBatch = importBatchRef.current++;
      const tempDir = `comic-sessions/${bookHash.replace(/[^a-zA-Z0-9._-]/g, '_')}/batch-${importBatch}`;
      try {
        let decodedBytes = 0;
        let sourceBytes = 0;
        let pageIndex = 0;
        for (const selectedFile of selection.files) {
          const local = await readSelected(selectedFile, appService);
          for await (const file of extractImages(local)) {
            const index = pageIndex++;
            if (index >= MAX_IMPORTED_PAGES) throw new Error('Comic import exceeds the page limit');
            sourceBytes += file.size;
            if (sourceBytes > MAX_IMPORTED_SOURCE_BYTES) {
              throw new Error('Comic import exceeds the source byte limit');
            }
            const format = inferImage(file.name, file.type);
            const size = await imageSize(file);
            decodedBytes += size.width * size.height * 4;
            if (decodedBytes > MAX_IMPORTED_DECODED_BYTES) {
              throw new Error('Comic import exceeds the decoded memory limit');
            }
            const pageId = `page-${String(index).padStart(5, '0')}-${basename(file.name).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
            const path = `${tempDir}/${pageId}.${format === 'jpeg' ? 'jpg' : format}`;
            await appService.writeFile(path, 'Temp', file);
            imported.push({
              pageId,
              pageIndex: index,
              name: file.name,
              format,
              mimeType: file.type || `image/${format === 'jpeg' ? 'jpeg' : format}`,
              width: size.width,
              height: size.height,
              path,
              byteLength: file.size,
            });
          }
        }
      } catch (reason) {
        await cleanupComicAssets(imported, appService);
        throw reason;
      }
      const sourceFormat = sourceFormatFor(bookData?.book?.format, extension(firstSelectedName));
      const now = Date.now();
      const canRestoreWorkspace =
        workspace &&
        workspace.pages.length === imported.length &&
        workspace.pages.every((candidate, index) => {
          const incoming = imported[index]!;
          return (
            candidate.pageIndex === incoming.pageIndex &&
            candidate.width === incoming.width &&
            candidate.height === incoming.height
          );
        });
      if (canRestoreWorkspace && workspace) {
        imported = imported.map((asset) => {
          const previous = workspace.pages.find(
            (candidate) => candidate.pageIndex === asset.pageIndex,
          );
          return previous ? { ...asset, pageId: previous.pageId } : asset;
        });
      }
      const pages = imported.map((asset) => {
        const previous = canRestoreWorkspace
          ? workspace.pages.find((candidate) => candidate.pageIndex === asset.pageIndex)
          : undefined;
        return previous
          ? {
              ...previous,
              localRef: `session://${bookHash}/${asset.pageId}`,
              updatedAt: now,
            }
          : createComicWorkspacePage({
              pageId: asset.pageId,
              pageIndex: asset.pageIndex,
              width: asset.width,
              height: asset.height,
              format: asset.format,
              localRef: `session://${bookHash}/${asset.pageId}`,
            });
      });
      const nextWorkspace = canRestoreWorkspace
        ? parseComicWorkspace({
            ...workspace,
            sourceFormat,
            pages,
            updatedAt: now,
            revision: workspace.revision + 1,
          })
        : parseComicWorkspace({
            format: 'babelleaf.comic-workspace',
            schemaVersion: 1,
            bookHash,
            sourceFormat,
            createdAt: now,
            updatedAt: now,
            revision: 0,
            pages,
          });
      const nextEdit =
        canRestoreWorkspace && editSidecar
          ? {
              ...editSidecar,
              sourceFormat,
              pages: imported.map((asset) => {
                const previous = editSidecar.pages.find(
                  (candidate) => candidate.pageIndex === asset.pageIndex,
                );
                return previous
                  ? { ...previous, pageId: pages[asset.pageIndex]!.pageId, updatedAt: now }
                  : {
                      pageId: pages[asset.pageIndex]!.pageId,
                      pageIndex: asset.pageIndex,
                      width: asset.width,
                      height: asset.height,
                      layouts: [],
                      revision: 1,
                      updatedAt: now,
                    };
              }),
              updatedAt: now,
              revision: editSidecar.revision + 1,
            }
          : createEmptyComicEditSidecar({
              bookHash,
              sourceFormat,
              pages: imported.map((asset) => ({
                pageId: pages[asset.pageIndex]!.pageId,
                pageIndex: asset.pageIndex,
                width: asset.width,
                height: asset.height,
              })),
              now,
            });
      setAssets(() => imported);
      await persistWorkspace(nextWorkspace);
      await persistEditSidecar(nextEdit);
      setSelectedPageId(imported[0]?.pageId || '');
      setSelectedRegionId(undefined);
      setMessage(_('Pages imported. Add OCR regions manually or load an OCR sidecar.'));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const importOcrSidecar = async () => {
    if (!appService || !workspaceStore || !editStore) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const selection = await selectFiles({
        type: 'generic',
        multiple: false,
        extensions: ['json'],
        accept: '.json',
        dialogTitle: _('Import OCR sidecar'),
      });
      if (selection.error) throw new Error(selection.error);
      const selected = selection.files[0];
      if (!selected) return;
      const loaded = await readSelected(selected, appService);
      const sidecar = parseOcrSidecar(JSON.parse(await loaded.file.text()));
      if (sidecar.bookHash !== bookHash) {
        throw new Error(_('The OCR sidecar belongs to a different book.'));
      }
      const nextWorkspace = createComicWorkspaceFromOcrSidecar(sidecar);
      const nextEdit = createEmptyComicEditSidecar({
        bookHash,
        sourceFingerprint: sidecar.sourceFingerprint,
        sourceFormat: sidecar.sourceFormat,
        pages: sidecar.pages,
      });
      await persistWorkspace(nextWorkspace);
      await persistEditSidecar(nextEdit);
      setSelectedPageId(nextWorkspace.pages[0]?.pageId || '');
      setSelectedRegionId(undefined);
      setMessage(_('OCR sidecar imported. Re-import matching source pages to preview or export.'));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const page = workspace?.pages.find((candidate) => candidate.pageId === selectedPageId);
  const asset = assets.find((candidate) => candidate.pageId === selectedPageId);
  const selectedRegion = page?.regions.find((region) => region.id === selectedRegionId);
  const selectableOcrPage = page
    ? ({
        pageId: page.pageId,
        pageIndex: page.pageIndex,
        width: page.width,
        height: page.height,
        format: page.format,
        localRef: page.localRef,
        status: 'completed',
        updatedAt: page.updatedAt,
        regions: page.regions
          .map((region) => getEffectiveComicRegion(region))
          .filter((region): region is NonNullable<typeof region> => Boolean(region))
          .map((region) => ({
            id: region.id,
            pageId: page.pageId,
            polygon: region.polygon,
            orientation: region.orientation,
            language: region.language,
            text: region.text,
            readingOrder: region.readingOrder,
            engine: region.engine,
            model: region.model,
          })),
      } satisfies OcrPageRecord)
    : null;

  const runLocalOcr = async () => {
    if (!workspace || !appService || !ocrModelStorage) return;
    const model = ocrModels.find((candidate) => ocrModelKey(candidate) === selectedOcrModel);
    if (!model) {
      setError(_('Import and select a verified local OCR model pack first.'));
      return;
    }
    const evidence = createTrustedTesseractBenchmarkEvidence(model, ocrPlatform);
    if (!evidence) {
      setError(
        _('This OCR model or platform has no matching checksum, license, and benchmark evidence.'),
      );
      return;
    }
    const pageIds =
      ocrScope === 'page'
        ? page
          ? [page.pageId]
          : []
        : workspace.pages.map((item) => item.pageId);
    if (pageIds.length === 0) {
      setError(_('Select at least one locally imported comic page for OCR.'));
      return;
    }
    const assetByPage = new Map(assets.map((item) => [item.pageId, item]));
    const unavailable = pageIds.find((pageId) => !assetByPage.has(pageId));
    if (unavailable) {
      setError(_('Re-import every selected source page before starting local OCR.'));
      return;
    }
    const controller = new AbortController();
    ocrAbortRef.current?.abort();
    ocrAbortRef.current = controller;
    setOcrRunning(true);
    setOcrProgress({ completed: 0, total: pageIds.length, pageId: '' });
    setError(null);
    setMessage(null);
    try {
      const modelPack = await loadOcrModelPack(ocrModelStorage, model.id, model.version);
      if (!modelPack) throw new Error(_('The selected local OCR model pack is unavailable.'));
      const factory = createTesseractOcrRuntimeFactory({
        pageSource: {
          read: async (inputPage, signal) => {
            if (signal.aborted) throw new Error(_('Comic OCR was cancelled.'));
            const source = assetByPage.get(inputPage.pageId);
            if (!source) throw new Error(_('The local comic page is unavailable.'));
            if (source.width !== inputPage.width || source.height !== inputPage.height) {
              throw new Error(_('The local comic page dimensions changed after import.'));
            }
            const bytes = await appService.readFile(source.path, 'Temp', 'binary');
            if (!(bytes instanceof ArrayBuffer)) {
              throw new Error(_('The local comic page is not binary image data.'));
            }
            return bytes;
          },
        },
      });
      const runtime = await createInstalledGatedOcrRuntime({
        factory,
        storage: ocrModelStorage,
        modelPack,
        sourceLanguages: [...model.languages],
        platform: ocrPlatform,
        evidence,
        requiredCapabilities: ['ocr', 'text-layer'],
      });
      let firstCheckpoint = true;
      const result = await runComicOcrPages({
        runtime,
        workspace,
        pageIds,
        signal: controller.signal,
        checkpoint: async (next) => {
          await persistWorkspace(next, { recordHistory: firstCheckpoint });
          firstCheckpoint = false;
        },
        onProgress: setOcrProgress,
      });
      setMessage(
        `${_('Local OCR completed and saved to the sidecar.')} ${result.completedPageIds.length}/${pageIds.length}`,
      );
    } catch (reason: unknown) {
      if (controller.signal.aborted) {
        setMessage(_('Local OCR cancelled; completed pages remain saved.'));
      } else {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
    } finally {
      if (ocrAbortRef.current === controller) ocrAbortRef.current = null;
      setOcrRunning(false);
    }
  };

  const cancelLocalOcr = () => {
    ocrAbortRef.current?.abort();
  };

  const runComicPipeline = async () => {
    const queue = pipelineQueueRef.current;
    if (!queue) {
      setError(_('Re-import the comic pages before starting a batch translation.'));
      return;
    }
    setError(null);
    try {
      const result = await (queue.getSnapshot().status === 'paused'
        ? queue.resume()
        : queue.start());
      setPipelineSnapshot(result);
      setMessage(_('Comic batch translation checkpoint saved locally.'));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const pauseComicPipeline = () => {
    pipelineQueueRef.current?.pause();
    setPipelineSnapshot(pipelineQueueRef.current?.getSnapshot() || null);
  };

  const cancelComicPipeline = () => {
    pipelineQueueRef.current?.cancel();
    setPipelineSnapshot(pipelineQueueRef.current?.getSnapshot() || null);
    setMessage(_('Comic batch translation cancelled; completed pages remain saved.'));
  };

  const retryComicPipeline = async () => {
    const queue = pipelineQueueRef.current;
    if (!queue) return;
    setError(null);
    try {
      const result = await queue.retryFailed();
      setPipelineSnapshot(result);
      setMessage(_('Failed comic pages were queued again.'));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const rerunSelectedComicPages = () => {
    const queue = pipelineQueueRef.current;
    if (!queue) return;
    setError(null);
    try {
      setPipelineSnapshot(queue.rerun(pipelineSelectedPageIds));
      setMessage(_('Selected comic pages were queued for rerun.'));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const applyComicPipelineRange = () => {
    if (!pipelineSnapshot) return;
    const total = pipelineSnapshot.total;
    const value = pipelineRange.trim();
    if (!value) {
      setPipelineSelectedPageIds(pipelineSnapshot.items.map((item) => item.page.pageId));
      return;
    }
    const selected = new Set<number>();
    for (const token of value.split(',')) {
      const trimmed = token.trim();
      const range = trimmed.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!range) {
        setError(_('Page ranges must use values such as 1-3,5.'));
        return;
      }
      const start = Number(range[1]);
      const end = Number(range[2] || range[1]);
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 1 ||
        end < start ||
        end > total
      ) {
        setError(_('The selected page range is outside the imported comic.'));
        return;
      }
      for (let index = start; index <= end; index += 1) selected.add(index - 1);
    }
    setPipelineSelectedPageIds(
      pipelineSnapshot.items
        .filter((item) => selected.has(item.page.pageIndex))
        .map((item) => item.page.pageId),
    );
  };

  const patchRegion = async (regionId: string, patch: ComicRegionPatch) => {
    if (!workspace || !page) return;
    try {
      await persistWorkspace(editComicRegion(workspace, page.pageId, regionId, patch));
      setMessage(_('Region correction saved.'));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const approveRegion = async (regionId: string) => {
    if (!workspace || !page) return;
    try {
      await persistWorkspace(approveComicRegion(workspace, page.pageId, regionId));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const revertRegion = async (regionId: string) => {
    if (!workspace || !page) return;
    try {
      await persistWorkspace(revertComicRegion(workspace, page.pageId, regionId));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const addRegion = async () => {
    if (!workspace || !page || !newRegionText.trim()) return;
    try {
      const next = createManualComicRegion(workspace, page.pageId, {
        id: `manual-${Date.now()}`,
        polygon: [
          { x: page.width * 0.05, y: page.height * 0.05 },
          { x: page.width * 0.95, y: page.height * 0.05 },
          { x: page.width * 0.95, y: page.height * 0.95 },
          { x: page.width * 0.05, y: page.height * 0.95 },
        ],
        text: newRegionText.trim(),
        language: sourceLang === 'auto' ? undefined : sourceLang,
        readingOrder: page.regions.length,
      });
      const id = next.pages
        .find((candidate) => candidate.pageId === page.pageId)
        ?.regions.at(-1)?.id;
      await persistWorkspace(next);
      setSelectedRegionId(id);
      setNewRegionText('');
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const splitSelectedRegion = async () => {
    if (!workspace || !page || !selectedRegion) return;
    const effective = getEffectiveComicRegion(selectedRegion);
    const sourceText = effective?.text?.trim() || '';
    if (!effective || sourceText.length < 2) {
      setError(_('The selected region needs at least two characters before it can be split.'));
      return;
    }
    const midpoint = Math.max(1, Math.floor(sourceText.length / 2));
    const space = sourceText.lastIndexOf(' ', midpoint);
    const splitAt = space > 0 ? space : midpoint;
    const firstText = sourceText.slice(0, splitAt).trim();
    const secondText = sourceText.slice(splitAt).trim();
    if (!firstText || !secondText) {
      setError(_('The selected region could not be split into two non-empty texts.'));
      return;
    }
    const xs = effective.polygon.map((point) => point.x);
    const ys = effective.polygon.map((point) => point.y);
    const left = Math.max(0, Math.min(...xs));
    const right = Math.min(page.width, Math.max(...xs));
    const top = Math.max(0, Math.min(...ys));
    const bottom = Math.min(page.height, Math.max(...ys));
    const verticalSplit = effective.orientation === 'vertical';
    const split = verticalSplit ? left + (right - left) / 2 : top + (bottom - top) / 2;
    const firstPolygon = verticalSplit
      ? [
          { x: left, y: top },
          { x: split, y: top },
          { x: split, y: bottom },
          { x: left, y: bottom },
        ]
      : [
          { x: left, y: top },
          { x: right, y: top },
          { x: right, y: split },
          { x: left, y: split },
        ];
    const secondPolygon = verticalSplit
      ? [
          { x: split, y: top },
          { x: right, y: top },
          { x: right, y: bottom },
          { x: split, y: bottom },
        ]
      : [
          { x: left, y: split },
          { x: right, y: split },
          { x: right, y: bottom },
          { x: left, y: bottom },
        ];
    try {
      const newRegionId = `${selectedRegion.id}-split-${Date.now()}`;
      const next = splitComicRegion(workspace, page.pageId, selectedRegion.id, {
        newRegionId,
        first: {
          text: firstText,
          polygon: firstPolygon,
          orientation: effective.orientation,
          language: effective.language,
          readingOrder: effective.readingOrder,
        },
        second: {
          text: secondText,
          polygon: secondPolygon,
          orientation: effective.orientation,
          language: effective.language,
          readingOrder: effective.readingOrder + 1,
        },
      });
      await persistWorkspace(next);
      setSelectedRegionId(newRegionId);
      setMessage(_('Comic region split and saved.'));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const mergeSelectedWithNext = async () => {
    if (!workspace || !page || !selectedRegion) return;
    const active = page.regions
      .filter((region) => !region.manual?.deleted)
      .sort(
        (left, right) =>
          (getEffectiveComicRegion(left)?.readingOrder ?? Number.MAX_SAFE_INTEGER) -
          (getEffectiveComicRegion(right)?.readingOrder ?? Number.MAX_SAFE_INTEGER),
      );
    const index = active.findIndex((region) => region.id === selectedRegion.id);
    const nextRegion = index >= 0 ? active[index + 1] : undefined;
    if (!nextRegion) {
      setError(_('There is no following active region to merge.'));
      return;
    }
    try {
      await persistWorkspace(
        mergeComicRegions(workspace, page.pageId, [selectedRegion.id, nextRegion.id]),
      );
      setMessage(_('Comic regions merged and saved.'));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const moveSelectedRegion = async (direction: -1 | 1) => {
    if (!workspace || !page || !selectedRegion) return;
    const active = page.regions
      .filter((region) => !region.manual?.deleted)
      .sort(
        (left, right) =>
          (getEffectiveComicRegion(left)?.readingOrder ?? Number.MAX_SAFE_INTEGER) -
          (getEffectiveComicRegion(right)?.readingOrder ?? Number.MAX_SAFE_INTEGER),
      );
    const index = active.findIndex((region) => region.id === selectedRegion.id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= active.length) {
      setError(_('The selected region is already at the edge of the reading order.'));
      return;
    }
    const ordered = active.map((region) => region.id);
    [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];
    try {
      await persistWorkspace(reorderComicRegions(workspace, page.pageId, ordered));
      setMessage(_('Comic reading order saved.'));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const translateSelected = async () => {
    if (!workspace || !page || !selectedRegion || !provider) return;
    setBusy(true);
    setError(null);
    try {
      const result = await translateComicRegion({
        workspace,
        pageId: page.pageId,
        regionId: selectedRegion.id,
        provider,
        sourceLang,
        targetLang,
      });
      await persistWorkspace(result.workspace);
      setMessage(_('Translation completed and saved to the local workspace.'));
    } catch (reason: unknown) {
      try {
        await persistWorkspace(
          recordComicTranslationFailure(
            {
              workspace,
              pageId: page.pageId,
              regionId: selectedRegion.id,
              provider,
              sourceLang,
              targetLang,
            },
            reason,
          ),
        );
      } catch {
        // Keep the original provider error visible when failure persistence is unavailable.
      }
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const typesetSelected = async () => {
    if (!workspace || !editSidecar || !page || !selectedRegion) return;
    setBusy(true);
    setError(null);
    try {
      const session = new ComicEditingSession({
        sidecar: editSidecar,
        checkpoint: { save: persistEditSidecar },
      });
      const effective = getEffectiveComicRegion(selectedRegion);
      const result = await session.typesetPage(
        page,
        effective?.overlay?.style ? { [selectedRegion.id]: effective.overlay.style } : {},
      );
      setEditSidecar(result.sidecar);
      setMessage(_('Typesetting layout saved.'));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const eraseSelectedRegion = async () => {
    if (!editSidecar || !page || !selectedRegion) return;
    const effective = getEffectiveComicRegion(selectedRegion);
    if (!effective) return;
    const existing = editSidecar.pages.find((candidate) => candidate.pageId === page.pageId)?.mask;
    const left = Math.max(0, Math.floor(Math.min(...effective.polygon.map((point) => point.x))));
    const right = Math.min(
      page.width - 1,
      Math.ceil(Math.max(...effective.polygon.map((point) => point.x))),
    );
    const top = Math.max(0, Math.floor(Math.min(...effective.polygon.map((point) => point.y))));
    const bottom = Math.min(
      page.height - 1,
      Math.ceil(Math.max(...effective.polygon.map((point) => point.y))),
    );
    const radius = Math.max(2, Math.min(32, Math.round(Math.min(page.width, page.height) / 180)));
    const rowStep = Math.max(1, Math.ceil((bottom - top) / 166));
    const points = [] as Array<{ x: number; y: number }>;
    for (let y = top; y <= bottom && points.length < 500; y += rowStep) {
      points.push({ x: left, y }, { x: right, y }, { x: left, y });
    }
    if (points.length === 0) points.push({ x: left, y: top });
    const mask: ComicMaskSnapshot = {
      version: 1,
      width: page.width,
      height: page.height,
      operations: [
        ...(existing?.operations || []),
        {
          kind: 'paint',
          points,
          radius,
          opacity: 255,
        },
      ],
    };
    try {
      await persistEditSidecar(setComicEditPageMask(editSidecar, page.pageId, mask));
      setMessage(_('Erase mask saved. It will be applied to the exported copy.'));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const updatePageMask = async (mask: ComicMaskSnapshot) => {
    if (!editSidecar || !page) return;
    try {
      setCleanupPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      await persistEditSidecar(setComicEditPageMask(editSidecar, page.pageId, mask));
      setMessage(_('Cleanup mask saved to the local sidecar.'));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const previewLamaCleanup = async () => {
    if (!asset || !page || !inpaintModelStorage) return;
    setBusy(true);
    setError(null);
    setMessage(_('Loading local LaMa model...'));
    let worker: Awaited<ReturnType<typeof createInstalledLamaInpaintWorker>> | undefined;
    try {
      worker = await createInstalledLamaInpaintWorker(inpaintModelStorage);
      const rendered = await renderAsset(asset, page, worker);
      const previewBytes =
        rendered.bytes instanceof Uint8Array
          ? (rendered.bytes.buffer.slice(
              rendered.bytes.byteOffset,
              rendered.bytes.byteOffset + rendered.bytes.byteLength,
            ) as ArrayBuffer)
          : rendered.bytes;
      const preview = URL.createObjectURL(new Blob([previewBytes], { type: rendered.mimeType }));
      setCleanupPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return preview;
      });
      setMessage(_('Local LaMa cleanup preview rendered without changing the source.'));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      try {
        await worker?.close?.();
      } catch (reason: unknown) {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
      setBusy(false);
    }
  };

  const renderAsset = async (
    current: ComicAsset,
    currentPage: ComicWorkspacePage,
    inpaintWorker?: Awaited<ReturnType<typeof createInstalledLamaInpaintWorker>>,
  ): Promise<ComicRenderedPage> => {
    if (!appService) throw new Error('Comic source storage is unavailable');
    const sourceFile = await appService.openFile(current.path, 'Temp');
    const canvas = document.createElement('canvas');
    canvas.width = current.width;
    canvas.height = current.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable');
    await drawBlob(context, sourceFile, current.width, current.height);
    const editPage = editSidecar?.pages.find(
      (candidate) => candidate.pageId === currentPage.pageId,
    );
    if (editPage?.mask) {
      const source = context.getImageData(0, 0, current.width, current.height);
      const rgba: ComicRgbaImage = {
        width: current.width,
        height: current.height,
        data: new Uint8Array(source.data),
      };
      const cleaned = await cleanupComicImage(
        rgba,
        rasterizeComicMask(editPage.mask),
        {
          mode: inpaintWorker ? 'inpaint' : 'deterministic',
          expandRadius: 2,
          featherRadius: 1,
        },
        inpaintWorker,
      );
      context.putImageData(
        new ImageData(new Uint8ClampedArray(cleaned.image.data), current.width, current.height),
        0,
        0,
      );
    }
    if (workspace) {
      for (const region of currentPage.regions) {
        const effective = getEffectiveComicRegion(region);
        const translated = effective?.translation?.translatedText;
        if (!effective || !translated || effective.translation?.stale) continue;
        const bounds = {
          left: Math.min(...effective.polygon.map((point) => point.x)),
          top: Math.min(...effective.polygon.map((point) => point.y)),
          right: Math.max(...effective.polygon.map((point) => point.x)),
          bottom: Math.max(...effective.polygon.map((point) => point.y)),
        };
        const layout = editPage?.layouts.find((candidate) => candidate.regionId === effective.id);
        const style = layout?.style || effective.overlay?.style;
        context.save();
        context.fillStyle = style?.backgroundColor || 'rgba(255,255,255,0.94)';
        context.fillRect(
          bounds.left,
          bounds.top,
          bounds.right - bounds.left,
          bounds.bottom - bounds.top,
        );
        context.fillStyle = style?.color || '#111827';
        context.strokeStyle = style?.outlineColor || 'transparent';
        context.lineWidth = style?.outlineWidthPx || 0;
        context.textBaseline = 'top';
        const drawText = (text: string, x: number, y: number, maxWidth?: number, size?: number) => {
          const fontSize =
            size || style?.fontSizePx || Math.max(12, Math.floor((bounds.bottom - bounds.top) / 5));
          context.font = `${fontSize}px ${style?.fontFamily || 'sans-serif'}`;
          if (context.lineWidth > 0 && style?.outlineColor) {
            context.strokeText(text, x, y, maxWidth);
          }
          context.fillText(text, x, y, maxWidth);
        };
        if (layout?.lines.length) {
          context.textAlign = 'left';
          for (const line of layout.lines)
            drawText(line.text, line.x, line.y, line.width, line.fontSizePx);
        } else {
          context.textAlign = style?.textAlign === 'center' ? 'center' : 'left';
          drawText(
            translated,
            bounds.left + (context.textAlign === 'center' ? (bounds.right - bounds.left) / 2 : 4),
            bounds.top + 4,
            Math.max(1, bounds.right - bounds.left - 8),
          );
        }
        context.restore();
      }
    }
    const outputMime = current.format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error('Canvas export failed'))),
        outputMime,
        0.95,
      );
    });
    const bytes = await blob.arrayBuffer();
    // Release the decoded canvas before the next page is rendered. The
    // returned bytes are owned by the bounded export validator.
    canvas.width = 0;
    canvas.height = 0;
    return {
      pageId: current.pageId,
      pageIndex: current.pageIndex,
      extension: outputMime === 'image/jpeg' ? 'jpg' : 'png',
      mimeType: blob.type || outputMime,
      bytes,
    };
  };

  const exportPages = async (format: 'cbz' | 'pdf') => {
    if (!workspace || assets.length === 0 || !appService) return;
    setBusy(true);
    setError(null);
    let inpaintWorker: Awaited<ReturnType<typeof createInstalledLamaInpaintWorker>> | undefined;
    try {
      if (useLamaInpaint) {
        if (!inpaintModelStorage) throw new Error(_('Local inpainting storage is unavailable.'));
        setMessage(_('Loading local LaMa model...'));
        inpaintWorker = await createInstalledLamaInpaintWorker(inpaintModelStorage);
      }
      const pages = [] as ComicRenderedPage[];
      for (const currentPage of workspace.pages) {
        const current = assets.find((candidate) => candidate.pageId === currentPage.pageId);
        if (current) pages.push(await renderAsset(current, currentPage, inpaintWorker));
      }
      if (pages.length === 0) throw new Error(_('Re-import the source pages before exporting.'));
      if (format === 'pdf') {
        // Convert one page at a time so a PDF export never holds both the
        // complete source-image set and a second complete JPEG set.
        for (let index = 0; index < pages.length; index += 1) {
          const page = pages[index]!;
          if (page.mimeType === 'image/jpeg') continue;
          const blob = new Blob([new Uint8Array(page.bytes).buffer], { type: page.mimeType });
          const canvas = document.createElement('canvas');
          const currentAsset = assets.find((candidate) => candidate.pageId === page.pageId);
          canvas.width = currentAsset?.width || 1;
          canvas.height = currentAsset?.height || 1;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('Canvas 2D is unavailable');
          await drawBlob(context, blob, canvas.width, canvas.height);
          const jpeg = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (value) => (value ? resolve(value) : reject(new Error('JPEG conversion failed'))),
              'image/jpeg',
              0.95,
            ),
          );
          canvas.width = 0;
          canvas.height = 0;
          pages[index] = {
            ...page,
            extension: 'jpg',
            mimeType: 'image/jpeg',
            bytes: await jpeg.arrayBuffer(),
          };
        }
      }
      const result = exportComicPages({
        format,
        outputName: `${bookData?.book?.title || 'translated-comic'}.${format}`,
        pages,
      });
      const archiveBytes = result.archive!;
      await appService.saveFile(
        result.fileName,
        archiveBytes.buffer.slice(
          archiveBytes.byteOffset,
          archiveBytes.byteOffset + archiveBytes.byteLength,
        ) as ArrayBuffer,
        {
          mimeType: format === 'pdf' ? 'application/pdf' : 'application/vnd.comicbook+zip',
        },
      );
      setMessage(_('Translated copy exported without changing the source.'));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      try {
        await inpaintWorker?.close?.();
      } catch (reason: unknown) {
        setError(reason instanceof Error ? reason.message : String(reason));
      }
      setBusy(false);
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={_('Comic workspace')}
      snapHeight={0.92}
      useOverlayScroll
    >
      <div className='space-y-3 pb-4'>
        <div className='flex flex-wrap items-center gap-2'>
          <button
            className='btn btn-primary btn-sm'
            onClick={() => void importPages()}
            disabled={busy || ['queued', 'running'].includes(pipelineSnapshot?.status || '')}
          >
            {_('Import pages / CBZ / FBZ / PDF')}
          </button>
          <span className='text-base-content/60 text-xs'>
            {assets.length} {_('pages loaded')}
          </span>
          {workspace && (
            <span className='text-base-content/60 text-xs'>
              {workspace.pages.length} {_('pages in sidecar')}
            </span>
          )}
          <button
            className='btn btn-outline btn-sm'
            onClick={() => void importOcrSidecar()}
            disabled={busy}
          >
            {_('Import OCR sidecar')}
          </button>
          <button
            className='btn btn-ghost btn-sm'
            onClick={() => void undoWorkspace()}
            disabled={busy || workspaceUndo.length === 0}
            aria-label={_('Undo')}
          >
            {_('Undo')}
          </button>
          <button
            className='btn btn-ghost btn-sm'
            onClick={() => void redoWorkspace()}
            disabled={busy || workspaceRedo.length === 0}
            aria-label={_('Redo')}
          >
            {_('Redo')}
          </button>
        </div>
        {error && <p className='text-error text-sm'>{error}</p>}
        {message && <p className='text-success text-sm'>{message}</p>}
        {workspace && (
          <section className='space-y-2 rounded-md border p-3' aria-label={_('Local comic OCR')}>
            <div className='flex flex-wrap items-center gap-2'>
              <strong className='text-sm'>{_('Local comic OCR')}</strong>
              <select
                className='select select-bordered select-sm min-w-56'
                value={selectedOcrModel}
                onChange={(event) => setSelectedOcrModel(event.target.value)}
                disabled={ocrRunning}
                aria-label={_('OCR model pack')}
              >
                <option value=''>{_('Select a verified OCR model')}</option>
                {ocrModels.map((model) => {
                  const ready = Boolean(
                    createTrustedTesseractBenchmarkEvidence(model, ocrPlatform),
                  );
                  return (
                    <option key={ocrModelKey(model)} value={ocrModelKey(model)} disabled={!ready}>
                      {model.id} · {model.languages.join(', ')} ·{' '}
                      {ready ? _('verified') : _('not release-verified')}
                    </option>
                  );
                })}
              </select>
              <select
                className='select select-bordered select-sm'
                value={ocrScope}
                onChange={(event) => setOcrScope(event.target.value as 'page' | 'book')}
                disabled={ocrRunning}
                aria-label={_('OCR page scope')}
              >
                <option value='page'>{_('Current page')}</option>
                <option value='book'>{_('All imported pages')}</option>
              </select>
              <button
                className='btn btn-primary btn-sm'
                onClick={() => void runLocalOcr()}
                disabled={ocrRunning || !selectedOcrModel || assets.length === 0}
              >
                {ocrRunning ? _('Running OCR...') : _('Run local OCR')}
              </button>
              <button
                className='btn btn-outline btn-sm'
                onClick={cancelLocalOcr}
                disabled={!ocrRunning}
              >
                {_('Cancel OCR')}
              </button>
              {ocrProgress.total > 0 && (
                <span className='text-base-content/60 text-xs' role='status'>
                  {ocrProgress.completed}/{ocrProgress.total}
                  {ocrProgress.pageId ? ` · ${ocrProgress.pageId}` : ''}
                </span>
              )}
            </div>
            <p className='text-base-content/60 text-xs'>
              {_(
                'OCR runs only after this button is pressed. Page bytes and imported model files remain local; results are checkpointed in the sidecar after every page.',
              )}
            </p>
          </section>
        )}
        {workspace && pipelineSnapshot && (
          <section
            className='space-y-2 rounded-md border p-3'
            aria-label={_('Comic batch translation')}
          >
            <div className='flex flex-wrap items-center gap-2'>
              <strong className='text-sm'>{_('Comic batch translation')}</strong>
              <span className='text-base-content/60 text-xs'>
                {pipelineSnapshot.completed}/{pipelineSnapshot.total} {_('pages completed')} ·{' '}
                {_(pipelineSnapshot.status)}
                {pipelineSnapshot.recovered ? ` · ${_('recovered')}` : ''}
              </span>
              <div className='ml-auto flex flex-wrap gap-2'>
                <button
                  className='btn btn-primary btn-sm'
                  onClick={() => void runComicPipeline()}
                  disabled={['running', 'completed', 'failed', 'cancelled'].includes(
                    pipelineSnapshot.status,
                  )}
                >
                  {pipelineSnapshot.status === 'paused' ? _('Resume') : _('Start')}
                </button>
                <button
                  className='btn btn-outline btn-sm'
                  onClick={pauseComicPipeline}
                  disabled={!['queued', 'running'].includes(pipelineSnapshot.status)}
                >
                  {_('Pause')}
                </button>
                <button
                  className='btn btn-outline btn-sm'
                  onClick={cancelComicPipeline}
                  disabled={!['queued', 'running', 'paused'].includes(pipelineSnapshot.status)}
                >
                  {_('Cancel')}
                </button>
                <button
                  className='btn btn-outline btn-sm'
                  onClick={() => void retryComicPipeline()}
                  disabled={pipelineSnapshot.failed === 0 || pipelineSnapshot.status === 'running'}
                >
                  {_('Retry failed')}
                </button>
                <button
                  className='btn btn-outline btn-sm'
                  onClick={rerunSelectedComicPages}
                  disabled={
                    pipelineSelectedPageIds.length === 0 ||
                    ['queued', 'running'].includes(pipelineSnapshot.status)
                  }
                >
                  {_('Rerun selected')}
                </button>
              </div>
            </div>
            <div
              className='h-2 overflow-hidden rounded bg-base-200'
              role='progressbar'
              aria-valuemin={0}
              aria-valuemax={pipelineSnapshot.total}
              aria-valuenow={pipelineSnapshot.completed}
            >
              <div
                className='h-full bg-primary transition-all'
                style={{
                  width: `${Math.round((pipelineSnapshot.completed / Math.max(1, pipelineSnapshot.total)) * 100)}%`,
                }}
              />
            </div>
            <div className='flex flex-wrap items-center gap-2 text-xs'>
              <span className='text-base-content/60'>{_('Select pages to rerun')}</span>
              <input
                className='input input-bordered input-xs w-32'
                value={pipelineRange}
                onChange={(event) => setPipelineRange(event.target.value)}
                placeholder='1-3,5'
                aria-label={_('Page range')}
              />
              <button className='btn btn-ghost btn-xs' onClick={applyComicPipelineRange}>
                {_('Apply range')}
              </button>
              <span className='text-base-content/60'>
                {pipelineSelectedPageIds.length} {_('selected')}
              </span>
            </div>
            <div className='grid max-h-32 gap-1 overflow-auto sm:grid-cols-2 lg:grid-cols-4'>
              {pipelineSnapshot.items.map((item) => (
                <label key={item.id} className='flex items-center gap-1 text-xs'>
                  <input
                    type='checkbox'
                    checked={pipelineSelectedPageIds.includes(item.page.pageId)}
                    onChange={(event) =>
                      setPipelineSelectedPageIds((current) =>
                        event.target.checked
                          ? [...new Set([...current, item.page.pageId])]
                          : current.filter((pageId) => pageId !== item.page.pageId),
                      )
                    }
                  />
                  <span className='truncate'>
                    {item.page.pageIndex + 1}. {item.status}
                    {item.error ? ` · ${item.error}` : ''}
                  </span>
                </label>
              ))}
            </div>
            <p className='text-base-content/60 text-xs'>
              {_(
                'This queue translates existing OCR or manually entered regions. OCR is started separately above; no mock OCR is used.',
              )}
            </p>
          </section>
        )}
        {!workspace && (
          <p className='text-base-content/60 rounded-md border p-3 text-sm'>
            {_(
              'Import local image files, a CBZ/FBZ archive, or a PDF to begin. OCR model packs are managed in Settings → AI Translation.',
            )}
          </p>
        )}
        {workspace && (
          <div className='grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)_300px]'>
            <div className='space-y-1 overflow-auto rounded-md border p-1 lg:max-h-[62vh]'>
              {workspace.pages.map((candidate) => (
                <button
                  key={candidate.pageId}
                  className={`btn btn-ghost btn-sm w-full justify-start ${candidate.pageId === selectedPageId ? 'btn-active' : ''}`}
                  onClick={() => {
                    setSelectedPageId(candidate.pageId);
                    setSelectedRegionId(undefined);
                  }}
                >
                  {candidate.pageIndex + 1}.{' '}
                  {assets.find((item) => item.pageId === candidate.pageId)?.name ||
                    candidate.pageId}
                </button>
              ))}
            </div>
            <div className='space-y-2'>
              {asset && page && assetUrl ? (
                <div className='relative overflow-auto rounded-md border bg-black/10'>
                  <div className='relative mx-auto w-fit max-w-full'>
                    <img
                      src={cleanupPreviewUrl || assetUrl}
                      alt={asset.name}
                      className='mx-auto block max-h-[60vh] max-w-full object-contain'
                    />
                    {selectableOcrPage && (
                      <OcrTextLayer page={selectableOcrPage} visible={showOcrTextLayer} />
                    )}
                    <ComicTranslationOverlay page={page} onRegionSelect={setSelectedRegionId} />
                    {selectedRegion && !selectedRegion.manual?.deleted && !showMaskEditor && (
                      <ComicPolygonEditor
                        width={page.width}
                        height={page.height}
                        polygon={getEffectiveComicRegion(selectedRegion)?.polygon || []}
                        onCommit={(polygon) => void patchRegion(selectedRegion.id, { polygon })}
                      />
                    )}
                    {showMaskEditor && editSidecar && (
                      <ComicMaskEditor
                        width={page.width}
                        height={page.height}
                        mask={
                          editSidecar.pages.find((candidate) => candidate.pageId === page.pageId)
                            ?.mask
                        }
                        onChange={(mask) => void updatePageMask(mask)}
                      />
                    )}
                  </div>
                </div>
              ) : (
                <p className='text-base-content/60 rounded-md border p-3 text-sm'>
                  {_('Re-import the source pages to edit or export this sidecar.')}
                </p>
              )}
              {page && (
                <div className='flex flex-wrap gap-2'>
                  <button
                    className='btn btn-ghost btn-sm'
                    onClick={() => setShowOcrTextLayer((value) => !value)}
                  >
                    {showOcrTextLayer ? _('Hide OCR text layer') : _('Show OCR text layer')}
                  </button>
                  <button
                    className={`btn btn-ghost btn-sm ${showMaskEditor ? 'btn-active' : ''}`}
                    onClick={() => setShowMaskEditor((value) => !value)}
                    disabled={!editSidecar}
                    aria-pressed={showMaskEditor}
                  >
                    {_('Edit cleanup mask')}
                  </button>
                  <label className='flex items-center gap-2 text-xs'>
                    <input
                      type='checkbox'
                      className='checkbox checkbox-sm'
                      checked={useLamaInpaint}
                      onChange={(event) => setUseLamaInpaint(event.target.checked)}
                      disabled={!lamaAvailable || busy}
                      aria-label={_('Use local LaMa cleanup on export')}
                    />
                    {_('Use local LaMa cleanup on export')}
                    {!lamaAvailable && ` · ${_('model not installed')}`}
                  </label>
                  <button
                    className='btn btn-outline btn-sm'
                    onClick={() => void previewLamaCleanup()}
                    disabled={
                      busy ||
                      !lamaAvailable ||
                      !editSidecar?.pages.find((candidate) => candidate.pageId === page.pageId)
                        ?.mask
                    }
                  >
                    {_('Preview local LaMa cleanup')}
                  </button>
                  {cleanupPreviewUrl && (
                    <button
                      className='btn btn-ghost btn-sm'
                      onClick={() => {
                        URL.revokeObjectURL(cleanupPreviewUrl);
                        setCleanupPreviewUrl(null);
                      }}
                    >
                      {_('Clear cleanup preview')}
                    </button>
                  )}
                  <input
                    className='input input-bordered input-sm min-w-48 flex-1'
                    value={newRegionText}
                    onChange={(event) => setNewRegionText(event.target.value)}
                    placeholder={_('New OCR region text')}
                    aria-label={_('New OCR region text')}
                  />
                  <button
                    className='btn btn-outline btn-sm'
                    onClick={() => void addRegion()}
                    disabled={!newRegionText.trim()}
                  >
                    {_('Add region')}
                  </button>
                </div>
              )}
            </div>
            <div className='space-y-3'>
              {page && (
                <ComicRegionEditor
                  page={page}
                  selectedRegionId={selectedRegionId}
                  onSelect={setSelectedRegionId}
                  onPatch={(regionId, patch) => void patchRegion(regionId, patch)}
                  onDelete={(regionId) => void patchRegion(regionId, { deleted: true })}
                  onRestore={(regionId) => void patchRegion(regionId, { deleted: false })}
                  onApprove={(regionId) => void approveRegion(regionId)}
                  onRevert={(regionId) => void revertRegion(regionId)}
                />
              )}
              {selectedRegion && !selectedRegion.manual?.deleted && (
                <div className='flex flex-wrap gap-2'>
                  <button
                    className='btn btn-primary btn-sm'
                    onClick={() => void translateSelected()}
                    disabled={busy || !provider}
                  >
                    {_('Translate selected region')}
                  </button>
                  <button
                    className='btn btn-outline btn-sm'
                    onClick={() => void typesetSelected()}
                    disabled={busy || !editSidecar}
                  >
                    {_('Save typesetting')}
                  </button>
                  <button
                    className='btn btn-outline btn-sm'
                    onClick={() => void eraseSelectedRegion()}
                    disabled={busy || !editSidecar}
                  >
                    {_('Erase selected region')}
                  </button>
                  <button
                    className='btn btn-outline btn-sm'
                    onClick={() => void splitSelectedRegion()}
                    disabled={busy}
                  >
                    {_('Split region')}
                  </button>
                  <button
                    className='btn btn-outline btn-sm'
                    onClick={() => void mergeSelectedWithNext()}
                    disabled={busy}
                  >
                    {_('Merge with next')}
                  </button>
                  <button
                    className='btn btn-ghost btn-sm'
                    onClick={() => void moveSelectedRegion(-1)}
                    disabled={busy}
                    aria-label={_('Move region up')}
                  >
                    {_('Move up')}
                  </button>
                  <button
                    className='btn btn-ghost btn-sm'
                    onClick={() => void moveSelectedRegion(1)}
                    disabled={busy}
                    aria-label={_('Move region down')}
                  >
                    {_('Move down')}
                  </button>
                </div>
              )}
              {page && (
                <div className='flex flex-wrap gap-2 border-t pt-2'>
                  <button
                    className='btn btn-outline btn-sm'
                    onClick={() => void exportPages('cbz')}
                    disabled={busy || assets.length === 0}
                  >
                    {_('Export CBZ')}
                  </button>
                  <button
                    className='btn btn-outline btn-sm'
                    onClick={() => void exportPages('pdf')}
                    disabled={busy || assets.length === 0}
                  >
                    {_('Export PDF')}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
};

export default ComicWorkspaceDialog;
