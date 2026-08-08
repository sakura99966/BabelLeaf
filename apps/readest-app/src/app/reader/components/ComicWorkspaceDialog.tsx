'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Dialog from '@/components/Dialog';
import { useEnv } from '@/context/EnvContext';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useFileSelector, type SelectedFile } from '@/hooks/useFileSelector';
import { useTranslator } from '@/hooks/useTranslator';
import ComicRegionEditor from './ComicRegionEditor';
import ComicTranslationOverlay from './ComicTranslationOverlay';
import OcrTextLayer from './OcrTextLayer';
import {
  ComicEditingSession,
  ComicEditSidecarStore,
  ComicWorkspaceStore,
  approveComicRegion,
  createEmptyComicEditSidecar,
  cleanupComicImage,
  createComicWorkspaceFromOcrSidecar,
  createManualComicRegion,
  createComicWorkspacePage,
  editComicRegion,
  exportComicPages,
  getEffectiveComicRegion,
  parseComicWorkspace,
  parseOcrSidecar,
  rasterizeComicMask,
  recordComicTranslationFailure,
  revertComicRegion,
  setComicEditPageMask,
  translateComicRegion,
  type ComicEditSidecar,
  type ComicMaskSnapshot,
  type ComicRgbaImage,
  type ComicRenderedPage,
  type ComicWorkspace,
  type ComicWorkspacePage,
  type ComicRegionPatch,
  type OcrPageRecord,
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
  blob: Blob;
  url: string;
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];
const IMPORT_EXTENSIONS = [...IMAGE_EXTENSIONS, 'cbz', 'fbz', 'pdf'];
const MAX_IMPORTED_PDF_PAGES = 10_000;
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

/** Rasterize a local PDF sequentially through the existing foliate-js PDF.js path. */
const extractPdfImages = async (file: File): Promise<File[]> => {
  const { makePDF } = await import('foliate-js/pdf.js');
  const book = (await makePDF(file)) as {
    sections?: Array<{ load: () => Promise<PdfPageRender> }>;
    destroy?: () => void;
  };
  try {
    const sections = book.sections || [];
    if (sections.length === 0) throw new Error('The PDF has no pages');
    if (sections.length > MAX_IMPORTED_PDF_PAGES) throw new Error('PDF exceeds the page limit');
    const files: File[] = [];
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
        canvas.width = 0;
        canvas.height = 0;
        files.push(
          new File([blob], `page-${String(index + 1).padStart(5, '0')}.jpg`, {
            type: 'image/jpeg',
          }),
        );
      } finally {
        frame.remove();
      }
    }
    return files;
  } finally {
    book.destroy?.();
  }
};

const extractImages = async (selected: { name: string; file: File }): Promise<File[]> => {
  const ext = extension(selected.name);
  if (ext === 'pdf') return extractPdfImages(selected.file);
  if (ext !== 'cbz' && ext !== 'fbz') return [selected.file];
  const { BlobReader, BlobWriter, ZipReader } = await import('@zip.js/zip.js');
  const reader = new ZipReader(new BlobReader(selected.file));
  try {
    const entries = (await reader.getEntries())
      .filter((entry) => !entry.directory && IMAGE_EXTENSIONS.includes(extension(entry.filename)))
      .sort((left, right) =>
        left.filename.localeCompare(right.filename, undefined, { numeric: true }),
      );
    const files: File[] = [];
    for (const entry of entries) {
      if (files.length >= 10_000) throw new Error('Comic archive exceeds the page limit');
      if (!('getData' in entry) || typeof entry.getData !== 'function') continue;
      const blob = await entry.getData(new BlobWriter());
      files.push(new File([blob], basename(entry.filename), { type: blob.type || 'image/*' }));
    }
    if (files.length === 0) throw new Error('No supported images were found in the comic archive');
    return files;
  } finally {
    await reader.close();
  }
};

const revokeAssets = (assets: readonly ComicAsset[]): void => {
  for (const asset of assets) URL.revokeObjectURL(asset.url);
};

const sourceFormatFor = (bookFormat?: string, importedArchive?: string): OcrSourceFormat => {
  if (importedArchive === 'pdf') return 'PDF';
  if (importedArchive) return importedArchive === 'fbz' ? 'FBZ' : 'CBZ';
  if (bookFormat === 'PDF' || bookFormat === 'CBZ' || bookFormat === 'FBZ') return bookFormat;
  return 'IMAGE_FOLDER';
};

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
  const [assets, setAssets] = useState<ComicAsset[]>([]);
  const [workspace, setWorkspace] = useState<ComicWorkspace | null>(null);
  const [editSidecar, setEditSidecar] = useState<ComicEditSidecar | null>(null);
  const [selectedPageId, setSelectedPageId] = useState('');
  const [selectedRegionId, setSelectedRegionId] = useState<string | undefined>();
  const [showOcrTextLayer, setShowOcrTextLayer] = useState(true);
  const [newRegionText, setNewRegionText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const persistWorkspace = useCallback(
    async (next: ComicWorkspace) => {
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
        setWorkspace(savedWorkspace);
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
    return () => assets.forEach((asset) => URL.revokeObjectURL(asset.url));
  }, [assets]);

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
      const selected = await Promise.all(
        selection.files.map((file) => readSelected(file, appService)),
      );
      const files = (await Promise.all(selected.map(extractImages))).flat();
      let imported: ComicAsset[] = [];
      try {
        for (const [index, file] of files.entries()) {
          const format = inferImage(file.name, file.type);
          const size = await imageSize(file);
          const pageId = `page-${String(index).padStart(5, '0')}-${basename(file.name).replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          imported.push({
            pageId,
            pageIndex: index,
            name: file.name,
            format,
            mimeType: file.type || `image/${format === 'jpeg' ? 'jpeg' : format}`,
            width: size.width,
            height: size.height,
            blob: file,
            url: URL.createObjectURL(file),
          });
        }
      } catch (reason) {
        revokeAssets(imported);
        throw reason;
      }
      const sourceFormat = sourceFormatFor(
        bookData?.book?.format,
        extension(selected[0]?.name || ''),
      );
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
      setAssets((current) => {
        revokeAssets(current);
        return imported;
      });
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
      const result = await session.typesetPage(page);
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

  const renderAsset = async (
    current: ComicAsset,
    currentPage: ComicWorkspacePage,
  ): Promise<ComicRenderedPage> => {
    const canvas = document.createElement('canvas');
    canvas.width = current.width;
    canvas.height = current.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable');
    await drawBlob(context, current.blob, current.width, current.height);
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
      const cleaned = await cleanupComicImage(rgba, rasterizeComicMask(editPage.mask), {
        mode: 'deterministic',
        expandRadius: 2,
        featherRadius: 1,
      });
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
    return {
      pageId: current.pageId,
      pageIndex: current.pageIndex,
      extension: outputMime === 'image/jpeg' ? 'jpg' : 'png',
      mimeType: blob.type || outputMime,
      bytes: await blob.arrayBuffer(),
    };
  };

  const exportPages = async (format: 'cbz' | 'pdf') => {
    if (!workspace || assets.length === 0 || !appService) return;
    setBusy(true);
    setError(null);
    try {
      const pages = [] as ComicRenderedPage[];
      for (const currentPage of workspace.pages) {
        const current = assets.find((candidate) => candidate.pageId === currentPage.pageId);
        if (current) pages.push(await renderAsset(current, currentPage));
      }
      if (pages.length === 0) throw new Error(_('Re-import the source pages before exporting.'));
      if (format === 'pdf') {
        const jpegPages = await Promise.all(
          pages.map(async (page) => {
            if (page.mimeType === 'image/jpeg') return page;
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
            return {
              ...page,
              extension: 'jpg' as const,
              mimeType: 'image/jpeg',
              bytes: await jpeg.arrayBuffer(),
            };
          }),
        );
        pages.splice(0, pages.length, ...jpegPages);
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
            disabled={busy}
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
        </div>
        {error && <p className='text-error text-sm'>{error}</p>}
        {message && <p className='text-success text-sm'>{message}</p>}
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
              {asset && page ? (
                <div className='relative overflow-auto rounded-md border bg-black/10'>
                  <img
                    src={asset.url}
                    alt={asset.name}
                    className='mx-auto block max-h-[60vh] max-w-full object-contain'
                  />
                  {selectableOcrPage && (
                    <OcrTextLayer page={selectableOcrPage} visible={showOcrTextLayer} />
                  )}
                  <ComicTranslationOverlay page={page} onRegionSelect={setSelectedRegionId} />
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
              {selectedRegion && (
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
