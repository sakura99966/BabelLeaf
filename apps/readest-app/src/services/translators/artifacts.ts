import type { AppService, FileSystem } from '@/types/system';
import { safeLoadJSON, safeSaveJSON } from '@/services/persistence';

export const TRANSLATION_ARTIFACT_SCHEMA_VERSION = 1 as const;
export const TRANSLATION_ARTIFACT_DIR = 'translation-artifacts';
export const TRANSLATION_PROMPT_VERSION = 'translation-v1';

export type TranslationSegmentStatus = 'pending' | 'translated' | 'reviewed' | 'failed';

export interface TranslationSegment {
  id: string;
  sourceText: string;
  translatedText?: string;
  sourceLang: string;
  targetLang: string;
  status: TranslationSegmentStatus;
  chapterId?: string;
  sourceLocator?: string;
  error?: string;
  updatedAt: number;
}

export interface TranslationArtifact {
  schemaVersion: typeof TRANSLATION_ARTIFACT_SCHEMA_VERSION;
  bookHash: string;
  sourceFingerprint?: string;
  provider: string;
  model?: string;
  promptVersion: string;
  sourceLang: string;
  targetLang: string;
  updatedAt: number;
  segments: TranslationSegment[];
}

export interface TranslationArtifactKey {
  bookHash: string;
  provider: string;
  targetLang: string;
}

/**
 * The cache store is deliberately compatible with AppService. It uses only
 * local text-file operations, so the same implementation works on desktop,
 * mobile and the browser-backed development service.
 */
export interface TranslationArtifactStorage
  extends Pick<FileSystem, 'createDir' | 'readFile' | 'writeFile' | 'exists'> {
  removeFile?: FileSystem['removeFile'];
  deleteFile?: AppService['deleteFile'];
}

const SEGMENT_STATUSES = new Set<TranslationSegmentStatus>([
  'pending',
  'translated',
  'reviewed',
  'failed',
]);

const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid translation artifact field: ${field}`);
  }
  return value;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parseSegment = (value: unknown): TranslationSegment => {
  if (!isRecord(value)) throw new Error('Invalid translation artifact segment');

  const status = value['status'];
  if (typeof status !== 'string' || !SEGMENT_STATUSES.has(status as TranslationSegmentStatus)) {
    throw new Error('Invalid translation artifact segment status');
  }

  const updatedAt = value['updatedAt'];
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) {
    throw new Error('Invalid translation artifact segment timestamp');
  }

  const segment: TranslationSegment = {
    id: requiredString(value['id'], 'segments[].id'),
    sourceText: requiredString(value['sourceText'], 'segments[].sourceText'),
    sourceLang: requiredString(value['sourceLang'], 'segments[].sourceLang'),
    targetLang: requiredString(value['targetLang'], 'segments[].targetLang'),
    status: status as TranslationSegmentStatus,
    updatedAt,
  };

  for (const field of ['translatedText', 'chapterId', 'sourceLocator', 'error'] as const) {
    const fieldValue = value[field];
    if (fieldValue !== undefined) {
      if (typeof fieldValue !== 'string')
        throw new Error(`Invalid translation artifact field: ${field}`);
      segment[field] = fieldValue;
    }
  }

  return segment;
};

export const createTranslationArtifact = (
  input: Omit<TranslationArtifact, 'schemaVersion' | 'updatedAt' | 'segments'> &
    Partial<Pick<TranslationArtifact, 'updatedAt' | 'segments'>>,
): TranslationArtifact => ({
  schemaVersion: TRANSLATION_ARTIFACT_SCHEMA_VERSION,
  bookHash: requiredString(input.bookHash, 'bookHash'),
  ...(input.sourceFingerprint ? { sourceFingerprint: input.sourceFingerprint } : {}),
  provider: requiredString(input.provider, 'provider'),
  ...(input.model ? { model: input.model } : {}),
  promptVersion: requiredString(input.promptVersion, 'promptVersion'),
  sourceLang: requiredString(input.sourceLang, 'sourceLang'),
  targetLang: requiredString(input.targetLang, 'targetLang'),
  updatedAt: input.updatedAt ?? Date.now(),
  segments: input.segments ? input.segments.map((segment) => ({ ...segment })) : [],
});

/**
 * Parse an artifact at a trust boundary. Credentials and arbitrary fields are
 * intentionally ignored; malformed or unknown schema versions are rejected.
 */
export const parseTranslationArtifact = (value: unknown): TranslationArtifact => {
  if (!isRecord(value) || value['schemaVersion'] !== TRANSLATION_ARTIFACT_SCHEMA_VERSION) {
    throw new Error('Unsupported translation artifact schema');
  }

  const updatedAt = value['updatedAt'];
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) {
    throw new Error('Invalid translation artifact timestamp');
  }
  if (!Array.isArray(value['segments'])) throw new Error('Invalid translation artifact segments');

  return {
    schemaVersion: TRANSLATION_ARTIFACT_SCHEMA_VERSION,
    bookHash: requiredString(value['bookHash'], 'bookHash'),
    ...(value['sourceFingerprint'] === undefined
      ? {}
      : { sourceFingerprint: requiredString(value['sourceFingerprint'], 'sourceFingerprint') }),
    provider: requiredString(value['provider'], 'provider'),
    ...(value['model'] === undefined ? {} : { model: requiredString(value['model'], 'model') }),
    promptVersion: requiredString(value['promptVersion'], 'promptVersion'),
    sourceLang: requiredString(value['sourceLang'], 'sourceLang'),
    targetLang: requiredString(value['targetLang'], 'targetLang'),
    updatedAt,
    segments: value['segments'].map(parseSegment),
  };
};

export const serializeTranslationArtifact = (artifact: TranslationArtifact): string =>
  JSON.stringify(parseTranslationArtifact(artifact), null, 2);

/**
 * Merge translated segments without replacing the source text. A mismatched
 * segment id is rejected so a stale job cannot write a translation over a new
 * book revision.
 */
export const upsertTranslationSegments = (
  artifact: TranslationArtifact,
  incoming: TranslationSegment[],
  now = Date.now(),
): TranslationArtifact => {
  const byId = new Map(artifact.segments.map((segment) => [segment.id, { ...segment }]));

  for (const next of incoming) {
    const existing = byId.get(next.id);
    if (existing && existing.sourceText !== next.sourceText) {
      throw new Error(`Translation segment source changed: ${next.id}`);
    }
    byId.set(next.id, {
      ...(existing ?? {}),
      ...next,
      sourceText: existing?.sourceText ?? next.sourceText,
      updatedAt: now,
    });
  }

  return {
    ...artifact,
    updatedAt: now,
    segments: Array.from(byId.values()),
  };
};

const safePathPart = (value: string): string => {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_');
  return normalized || 'unknown';
};

export const getTranslationArtifactPath = (key: TranslationArtifactKey): string =>
  `${TRANSLATION_ARTIFACT_DIR}/${safePathPart(key.bookHash)}.${safePathPart(key.provider)}.${safePathPart(key.targetLang)}.json`;

/** Persistent local-only store. The Cache base keeps artifacts out of backups. */
export class TranslationArtifactStore {
  constructor(private readonly fs: TranslationArtifactStorage) {}

  async load(key: TranslationArtifactKey): Promise<TranslationArtifact | null> {
    const filename = getTranslationArtifactPath({ ...key });
    const raw = await safeLoadJSON<unknown>(this.fs, filename, 'Cache', null);
    return raw === null ? null : parseTranslationArtifact(raw);
  }

  async save(artifact: TranslationArtifact): Promise<void> {
    await this.fs.createDir(TRANSLATION_ARTIFACT_DIR, 'Cache', true);
    await safeSaveJSON(this.fs, getTranslationArtifactPath(artifact), 'Cache', artifact);
  }

  async remove(key: TranslationArtifactKey): Promise<void> {
    const filename = getTranslationArtifactPath({ ...key });
    for (const candidate of [filename, `${filename}.bak`]) {
      if (!(await this.fs.exists(candidate, 'Cache'))) continue;
      if (this.fs.removeFile) {
        await this.fs.removeFile(candidate, 'Cache');
      } else if (this.fs.deleteFile) {
        await this.fs.deleteFile(candidate, 'Cache');
      }
    }
  }
}
