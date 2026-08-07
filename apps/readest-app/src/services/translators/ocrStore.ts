import type { BaseDir, FileSystem } from '@/types/system';
import { safeLoadJSON, safeSaveJSON } from '@/services/persistence';
import { parseOcrSidecar, type OcrSidecar } from './ocrSidecar';
import { parseOcrTaskSnapshot, type OcrTaskSnapshot } from './ocrQueue';

export const OCR_STORE_BASE: BaseDir = 'Data';
export const OCR_SIDECAR_STORE_DIR = 'ocr-sidecars';
export const OCR_TASK_STORE_DIR = 'ocr-jobs';
export const OCR_STORE_SCHEMA_VERSION = 1 as const;

export type OcrStorage = Pick<FileSystem, 'createDir' | 'readFile' | 'writeFile'>;

const safePathPart = (value: string): string => {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_');
  return normalized || 'unknown';
};

export const getOcrSidecarPath = (bookHash: string): string =>
  `${OCR_SIDECAR_STORE_DIR}/${safePathPart(bookHash)}.json`;

export const getOcrTaskPath = (taskId: string): string =>
  `${OCR_TASK_STORE_DIR}/${safePathPart(taskId)}.json`;

export class OcrSidecarStore {
  constructor(private readonly fs: OcrStorage) {}

  async load(bookHash: string): Promise<OcrSidecar | null> {
    const raw = await safeLoadJSON<unknown>(
      this.fs,
      getOcrSidecarPath(bookHash),
      OCR_STORE_BASE,
      null,
    );
    return raw === null ? null : parseOcrSidecar(raw);
  }

  async save(sidecar: OcrSidecar): Promise<void> {
    const normalized = parseOcrSidecar(sidecar);
    await this.fs.createDir(OCR_SIDECAR_STORE_DIR, OCR_STORE_BASE, true);
    await safeSaveJSON(this.fs, getOcrSidecarPath(normalized.bookHash), OCR_STORE_BASE, normalized);
  }
}

export interface PersistedOcrTask {
  schemaVersion: typeof OCR_STORE_SCHEMA_VERSION;
  snapshot: OcrTaskSnapshot;
}

export class OcrTaskStore {
  constructor(private readonly fs: OcrStorage) {}

  async load(taskId: string): Promise<OcrTaskSnapshot | null> {
    const raw = await safeLoadJSON<unknown>(this.fs, getOcrTaskPath(taskId), OCR_STORE_BASE, null);
    if (raw === null || typeof raw !== 'object') return null;
    const record = raw as Record<string, unknown>;
    if (record['schemaVersion'] !== OCR_STORE_SCHEMA_VERSION) {
      throw new Error('Unsupported OCR task store schema');
    }
    return parseOcrTaskSnapshot(record['snapshot']);
  }

  async save(snapshot: OcrTaskSnapshot): Promise<void> {
    const normalized = parseOcrTaskSnapshot(snapshot);
    await this.fs.createDir(OCR_TASK_STORE_DIR, OCR_STORE_BASE, true);
    const value: PersistedOcrTask = {
      schemaVersion: OCR_STORE_SCHEMA_VERSION,
      snapshot: normalized,
    };
    await safeSaveJSON(this.fs, getOcrTaskPath(normalized.id), OCR_STORE_BASE, value);
  }
}
