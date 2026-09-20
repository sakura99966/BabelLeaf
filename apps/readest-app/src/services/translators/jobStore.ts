import type { AppService, BaseDir, FileSystem } from '@/types/system';
import { safeLoadJSON, safeSaveJSON } from '@/services/persistence';
import type {
  TranslationJobItemStatus,
  TranslationJobSnapshot,
  TranslationJobStatus,
} from './jobQueue';
import { parseTranslationSourceAnchor } from './anchors';

export const TRANSLATION_JOB_STORE_BASE: BaseDir = 'Data';
export const TRANSLATION_JOB_STORE_DIR = 'translation-jobs';
export const TRANSLATION_JOB_SCHEMA_VERSION = 1 as const;
export const MAX_TRANSLATION_JOB_ITEMS = 100_000;
export const MAX_TRANSLATION_JOB_FIELD_CHARS = 1_048_576;
export const MAX_TRANSLATION_JOB_TOTAL_CHARS = 32 * 1_048_576;

export interface TranslationJobStorage
  extends Pick<FileSystem, 'createDir' | 'readFile' | 'writeFile' | 'exists'> {
  readDir?: FileSystem['readDir'];
  readDirectory?: AppService['readDirectory'];
  removeFile?: FileSystem['removeFile'];
  deleteFile?: AppService['deleteFile'];
}

export interface PersistedTranslationJob {
  schemaVersion: typeof TRANSLATION_JOB_SCHEMA_VERSION;
  snapshot: TranslationJobSnapshot;
}

const JOB_STATUSES = new Set<TranslationJobStatus>([
  'queued',
  'running',
  'paused',
  'completed',
  'failed',
  'cancelled',
]);
const ITEM_STATUSES = new Set<TranslationJobItemStatus>([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

const safePathPart = (value: string): string => {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_');
  return normalized || 'unknown';
};

export const getTranslationJobPath = (jobId: string): string =>
  `${TRANSLATION_JOB_STORE_DIR}/${safePathPart(jobId)}.json`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const requiredString = (value: unknown, field: string): string => {
  if (typeof value === 'string' && value.length > MAX_TRANSLATION_JOB_FIELD_CHARS)
    throw new Error(`Translation job field exceeds resource limit: ${field}`);
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid translation job field: ${field}`);
  }
  return value;
};

const finiteInteger = (value: unknown, field: string, minimum = 0): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`Invalid translation job field: ${field}`);
  }
  return value;
};

export const parseTranslationJob = (value: unknown): PersistedTranslationJob => {
  if (!isRecord(value) || value['schemaVersion'] !== TRANSLATION_JOB_SCHEMA_VERSION) {
    throw new Error('Unsupported translation job schema');
  }
  const raw = value['snapshot'];
  if (!isRecord(raw)) throw new Error('Invalid translation job snapshot');
  const status = raw['status'];
  if (typeof status !== 'string' || !JOB_STATUSES.has(status as TranslationJobStatus)) {
    throw new Error('Invalid translation job status');
  }
  const rawItems = raw['items'];
  if (!Array.isArray(rawItems)) throw new Error('Invalid translation job items');
  if (rawItems.length > MAX_TRANSLATION_JOB_ITEMS)
    throw new Error('Translation job item count exceeds resource limit');
  const ids = new Set<string>();
  let totalChars = 0;
  const items = rawItems.map((itemValue, index) => {
    if (!isRecord(itemValue)) throw new Error(`Invalid translation job item: ${index}`);
    const itemStatus = itemValue['status'];
    if (
      typeof itemStatus !== 'string' ||
      !ITEM_STATUSES.has(itemStatus as TranslationJobItemStatus)
    ) {
      throw new Error(`Invalid translation job item status: ${index}`);
    }
    const item = {
      id: requiredString(itemValue['id'], `items[${index}].id`),
      text: requiredString(itemValue['text'], `items[${index}].text`),
      status: itemStatus as TranslationJobItemStatus,
      attempts: finiteInteger(itemValue['attempts'], `items[${index}].attempts`),
      ...(itemValue['chapterId'] === undefined
        ? {}
        : { chapterId: requiredString(itemValue['chapterId'], `items[${index}].chapterId`) }),
      ...(itemValue['sourceLocator'] === undefined
        ? {}
        : {
            sourceLocator: requiredString(
              itemValue['sourceLocator'],
              `items[${index}].sourceLocator`,
            ),
          }),
      ...(itemValue['sourceAnchor'] === undefined
        ? {}
        : { sourceAnchor: parseTranslationSourceAnchor(itemValue['sourceAnchor']) }),
      ...(itemValue['translatedText'] === undefined
        ? {}
        : {
            translatedText: requiredString(
              itemValue['translatedText'],
              `items[${index}].translatedText`,
            ),
          }),
      ...(itemValue['error'] === undefined
        ? {}
        : { error: requiredString(itemValue['error'], `items[${index}].error`) }),
    };
    if (ids.has(item.id)) throw new Error('Duplicate translation job item identity');
    ids.add(item.id);
    for (const value of [...Object.values(item), ...Object.values(item.sourceAnchor ?? {})]) {
      if (typeof value === 'string') totalChars += value.length;
    }
    if (totalChars > MAX_TRANSLATION_JOB_TOTAL_CHARS)
      throw new Error('Translation job text exceeds resource limit');
    return item;
  });

  const counts = { total: items.length, completed: 0, failed: 0, cancelled: 0 };
  for (const item of items) {
    if (item.status === 'completed' || item.status === 'failed' || item.status === 'cancelled')
      counts[item.status]++;
  }
  for (const field of ['total', 'completed', 'failed', 'cancelled'] as const) {
    if (finiteInteger(raw[field], `snapshot.${field}`) !== counts[field])
      throw new Error(`Inconsistent translation job count: ${field}`);
  }

  return {
    schemaVersion: TRANSLATION_JOB_SCHEMA_VERSION,
    snapshot: {
      id: requiredString(raw['id'], 'snapshot.id'),
      kind:
        raw['kind'] === 'chapter' || raw['kind'] === 'book'
          ? raw['kind']
          : (() => {
              throw new Error('Invalid translation job kind');
            })(),
      bookHash: requiredString(raw['bookHash'], 'snapshot.bookHash'),
      ...(raw['bookTitle'] === undefined
        ? {}
        : { bookTitle: requiredString(raw['bookTitle'], 'snapshot.bookTitle') }),
      ...(raw['recovered'] === undefined
        ? {}
        : typeof raw['recovered'] === 'boolean'
          ? { recovered: raw['recovered'] }
          : (() => {
              throw new Error('Invalid translation job recovered flag');
            })()),
      provider: requiredString(raw['provider'], 'snapshot.provider'),
      sourceLang: requiredString(raw['sourceLang'], 'snapshot.sourceLang'),
      targetLang: requiredString(raw['targetLang'], 'snapshot.targetLang'),
      status: status as TranslationJobStatus,
      total: finiteInteger(raw['total'], 'snapshot.total'),
      completed: finiteInteger(raw['completed'], 'snapshot.completed'),
      failed: finiteInteger(raw['failed'], 'snapshot.failed'),
      cancelled: finiteInteger(raw['cancelled'], 'snapshot.cancelled'),
      maxAttempts: finiteInteger(raw['maxAttempts'], 'snapshot.maxAttempts', 1),
      updatedAt: finiteInteger(raw['updatedAt'], 'snapshot.updatedAt'),
      items,
    },
  };
};

export class TranslationJobStore {
  constructor(private readonly fs: TranslationJobStorage) {}

  async load(jobId: string): Promise<TranslationJobSnapshot | null> {
    const raw = await safeLoadJSON<unknown>(
      this.fs,
      getTranslationJobPath(jobId),
      TRANSLATION_JOB_STORE_BASE,
      null,
      parseTranslationJob,
    );
    return raw === null ? null : parseTranslationJob(raw).snapshot;
  }

  async save(snapshot: TranslationJobSnapshot): Promise<void> {
    // Validate and detach mutable caller state before the first filesystem await.
    // A rejected write must not replace either committed recovery copy.
    const validated = parseTranslationJob({
      schemaVersion: TRANSLATION_JOB_SCHEMA_VERSION,
      snapshot,
    });
    await this.fs.createDir(TRANSLATION_JOB_STORE_DIR, TRANSLATION_JOB_STORE_BASE, true);
    await safeSaveJSON(
      this.fs,
      getTranslationJobPath(validated.snapshot.id),
      TRANSLATION_JOB_STORE_BASE,
      validated,
    );
  }

  async remove(jobId: string): Promise<void> {
    const filename = getTranslationJobPath(jobId);
    if (!this.fs.removeFile && !this.fs.deleteFile) return;
    for (const candidate of [filename, `${filename}.bak`]) {
      if (await this.fs.exists(candidate, TRANSLATION_JOB_STORE_BASE)) {
        if (this.fs.removeFile) {
          await this.fs.removeFile(candidate, TRANSLATION_JOB_STORE_BASE);
        } else {
          await this.fs.deleteFile!(candidate, TRANSLATION_JOB_STORE_BASE);
        }
      }
    }
  }

  /** List durable jobs for the dashboard without requiring a known job id. */
  async list(options: { bookHash?: string } = {}): Promise<TranslationJobSnapshot[]> {
    if (!this.fs.readDir && !this.fs.readDirectory) return [];
    const files = this.fs.readDir
      ? await this.fs.readDir(TRANSLATION_JOB_STORE_DIR, TRANSLATION_JOB_STORE_BASE)
      : await this.fs.readDirectory!(TRANSLATION_JOB_STORE_DIR, TRANSLATION_JOB_STORE_BASE);
    const snapshots: TranslationJobSnapshot[] = [];
    for (const file of files) {
      const relativePath = file.path.replaceAll('\\', '/');
      const filename = relativePath.startsWith(`${TRANSLATION_JOB_STORE_DIR}/`)
        ? relativePath
        : `${TRANSLATION_JOB_STORE_DIR}/${relativePath}`;
      if (!/\.json$/i.test(filename) || /\.bak$/i.test(filename)) continue;
      try {
        const raw = await safeLoadJSON<unknown>(
          this.fs,
          filename,
          TRANSLATION_JOB_STORE_BASE,
          null,
          parseTranslationJob,
        );
        if (raw === null) continue;
        const snapshot = parseTranslationJob(raw).snapshot;
        if (!options.bookHash || snapshot.bookHash === options.bookHash) snapshots.push(snapshot);
      } catch (reason) {
        // A malformed historical job must not prevent the dashboard from
        // showing valid jobs. The file remains available for diagnostics.
        console.warn(`Ignoring malformed translation job ${filename}:`, reason);
      }
    }
    return snapshots.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Remove only old terminal history, keeping active/recoverable jobs intact. */
  async prune(options: { bookHash?: string; keepLatest?: number } = {}): Promise<number> {
    const keepLatest = Math.max(0, Math.floor(options.keepLatest ?? 20));
    const jobs = await this.list({ bookHash: options.bookHash });
    const terminal = jobs.filter((job) =>
      ['completed', 'failed', 'cancelled'].includes(job.status),
    );
    const removable = terminal.slice(keepLatest);
    for (const job of removable) await this.remove(job.id);
    return removable.length;
  }
}
