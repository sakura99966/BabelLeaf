import type { BaseDir, FileSystem } from '@/types/system';
import { safeLoadJSON, safeSaveJSON } from '@/services/persistence';
import { parseComicPipelineSnapshot, type ComicPipelineSnapshot } from './comicPipeline';

/** Durable checkpoint storage for user-started comic batch work. */
export const COMIC_PIPELINE_STORE_BASE: BaseDir = 'Data';
export const COMIC_PIPELINE_STORE_DIR = 'comic-pipelines';

export type ComicPipelineStorage = Pick<FileSystem, 'createDir' | 'readFile' | 'writeFile'>;

const safePathPart = (value: string): string => {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_');
  return normalized || 'unknown';
};

export const getComicPipelinePath = (pipelineId: string): string =>
  `${COMIC_PIPELINE_STORE_DIR}/${safePathPart(pipelineId)}.json`;

export class ComicPipelineStore {
  constructor(private readonly fs: ComicPipelineStorage) {}

  async load(pipelineId: string): Promise<ComicPipelineSnapshot | null> {
    const raw = await safeLoadJSON<unknown>(
      this.fs,
      getComicPipelinePath(pipelineId),
      COMIC_PIPELINE_STORE_BASE,
      null,
    );
    if (raw === null) return null;
    const snapshot = parseComicPipelineSnapshot(raw);
    if (snapshot.id !== pipelineId) {
      throw new Error('Comic pipeline id does not match the requested checkpoint.');
    }
    return snapshot;
  }

  async save(snapshot: ComicPipelineSnapshot): Promise<void> {
    const normalized = parseComicPipelineSnapshot(snapshot);
    await this.fs.createDir(COMIC_PIPELINE_STORE_DIR, COMIC_PIPELINE_STORE_BASE, true);
    await safeSaveJSON(
      this.fs,
      getComicPipelinePath(normalized.id),
      COMIC_PIPELINE_STORE_BASE,
      normalized,
    );
  }
}
