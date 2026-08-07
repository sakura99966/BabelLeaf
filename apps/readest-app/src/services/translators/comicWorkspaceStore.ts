import type { BaseDir, FileSystem } from '@/types/system';
import { safeLoadJSON, safeSaveJSON } from '@/services/persistence';
import {
  createComicWorkspaceFromOcrSidecar,
  parseComicWorkspace,
  type ComicWorkspace,
} from './comicWorkspace';
import type { OcrSidecar } from './ocrSidecar';

export const COMIC_WORKSPACE_STORE_BASE: BaseDir = 'Data';
export const COMIC_WORKSPACE_STORE_DIR = 'comic-workspaces';
export const COMIC_WORKSPACE_STORE_SCHEMA_VERSION = 1 as const;

export type ComicWorkspaceStorage = Pick<FileSystem, 'createDir' | 'readFile' | 'writeFile'>;

const safePathPart = (value: string): string => {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_');
  return normalized || 'unknown';
};

export const getComicWorkspacePath = (bookHash: string): string =>
  `${COMIC_WORKSPACE_STORE_DIR}/${safePathPart(bookHash)}.json`;

export class ComicWorkspaceStore {
  constructor(private readonly fs: ComicWorkspaceStorage) {}

  async load(bookHash: string): Promise<ComicWorkspace | null> {
    const raw = await safeLoadJSON<unknown>(
      this.fs,
      getComicWorkspacePath(bookHash),
      COMIC_WORKSPACE_STORE_BASE,
      null,
    );
    if (raw === null) return null;
    const workspace = parseComicWorkspace(raw);
    if (workspace.bookHash !== bookHash) {
      throw new Error('Comic workspace book hash does not match the requested book.');
    }
    return workspace;
  }

  async save(workspace: ComicWorkspace): Promise<void> {
    const normalized = parseComicWorkspace(workspace);
    await this.fs.createDir(COMIC_WORKSPACE_STORE_DIR, COMIC_WORKSPACE_STORE_BASE, true);
    await safeSaveJSON(
      this.fs,
      getComicWorkspacePath(normalized.bookHash),
      COMIC_WORKSPACE_STORE_BASE,
      normalized,
    );
  }

  /** Create a workspace from the OCR sidecar exactly once, preserving the source. */
  async loadOrCreateFromOcr(
    bookHash: string,
    sidecar: OcrSidecar,
    now = Date.now(),
  ): Promise<ComicWorkspace> {
    if (sidecar.bookHash !== bookHash) {
      throw new Error('OCR sidecar book hash does not match the requested book.');
    }
    const existing = await this.load(bookHash);
    if (existing) return existing;
    const created = createComicWorkspaceFromOcrSidecar(sidecar, now);
    await this.save(created);
    return created;
  }
}
