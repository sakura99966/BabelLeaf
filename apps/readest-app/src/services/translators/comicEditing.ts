import {
  cleanupComicImage,
  parseComicMaskSnapshot,
  rasterizeComicMask,
  type ComicCleanupOptions,
  type ComicInpaintWorker,
  type ComicMaskSnapshot,
  type ComicRgbaImage,
  type ComicCleanupResult,
} from './comicImagePipeline';
import {
  exportComicPages,
  type ComicExportInput,
  type ComicExportResult,
  type ComicRenderedPage,
} from './comicExport';
import {
  layoutComicPageText,
  type ComicTypesetLayout,
  type ComicTypesetStyle,
} from './comicTypesetting';
import {
  setComicEditPageLayout,
  setComicEditPageMask,
  type ComicEditSidecar,
} from './comicEditSidecar';
import type { ComicWorkspacePage } from './comicWorkspace';

/** Application-facing facade that keeps comic edits in a sidecar and never flattens the source. */
export class ComicEditingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComicEditingError';
  }
}

export interface ComicEditingCheckpoint {
  save(sidecar: ComicEditSidecar): Promise<void>;
}

export interface ComicEditingSessionOptions {
  sidecar: ComicEditSidecar;
  checkpoint?: ComicEditingCheckpoint;
}

export interface ComicCleanupPageResult {
  sidecar: ComicEditSidecar;
  cleanup: ComicCleanupResult;
}

export class ComicEditingSession {
  private sidecar: ComicEditSidecar;
  private readonly checkpoint?: ComicEditingCheckpoint;

  constructor(options: ComicEditingSessionOptions) {
    this.sidecar = options.sidecar;
    this.checkpoint = options.checkpoint;
  }

  getSidecar(): ComicEditSidecar {
    return JSON.parse(JSON.stringify(this.sidecar)) as ComicEditSidecar;
  }

  async cleanupPage(
    pageId: string,
    image: ComicRgbaImage,
    maskSnapshot: ComicMaskSnapshot,
    options: ComicCleanupOptions = {},
    worker?: ComicInpaintWorker,
  ): Promise<ComicCleanupPageResult> {
    const page = this.sidecar.pages.find((candidate) => candidate.pageId === pageId);
    if (!page) throw new ComicEditingError(`Comic edit page not found: ${pageId}`);
    if (page.width !== image.width || page.height !== image.height) {
      throw new ComicEditingError('Comic cleanup image dimensions do not match the sidecar');
    }
    const parsedMask = parseComicMaskSnapshot(maskSnapshot);
    if (parsedMask.width !== image.width || parsedMask.height !== image.height) {
      throw new ComicEditingError('Comic cleanup mask dimensions do not match the image');
    }
    const cleanup = await cleanupComicImage(image, rasterizeComicMask(parsedMask), options, worker);
    this.sidecar = setComicEditPageMask(this.sidecar, pageId, parsedMask);
    await this.persist();
    return { sidecar: this.getSidecar(), cleanup };
  }

  async typesetPage(
    page: ComicWorkspacePage,
    styles: Readonly<Record<string, ComicTypesetStyle>> = {},
  ): Promise<{ sidecar: ComicEditSidecar; layouts: ComicTypesetLayout[] }> {
    const sidecarPage = this.sidecar.pages.find((candidate) => candidate.pageId === page.pageId);
    if (!sidecarPage) throw new ComicEditingError(`Comic edit page not found: ${page.pageId}`);
    if (sidecarPage.width !== page.width || sidecarPage.height !== page.height) {
      throw new ComicEditingError('Comic typesetting page dimensions do not match the sidecar');
    }
    const layouts = layoutComicPageText(page, styles);
    for (const layout of layouts)
      this.sidecar = setComicEditPageLayout(this.sidecar, page.pageId, layout);
    await this.persist();
    return { sidecar: this.getSidecar(), layouts };
  }

  exportPages(
    format: ComicExportInput['format'],
    outputName: string,
    pages: ComicRenderedPage[],
    sourcePath?: string,
    outputPath?: string,
  ): ComicExportResult {
    return exportComicPages({
      format,
      outputName,
      pages,
      ...(sourcePath ? { sourcePath } : {}),
      ...(outputPath ? { outputPath } : {}),
    });
  }

  private async persist(): Promise<void> {
    if (this.checkpoint) await this.checkpoint.save(this.getSidecar());
  }
}
