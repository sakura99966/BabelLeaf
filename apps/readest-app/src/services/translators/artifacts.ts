import type { AppService, BaseDir, FileSystem } from '@/types/system';
import { safeLoadJSON, updateJSON, withJSONLock } from '@/services/persistence';
import { parseTranslationSourceAnchor, type TranslationSourceAnchor } from './anchors';

export const TRANSLATION_ARTIFACT_SCHEMA_VERSION = 1 as const;
export const TRANSLATION_ARTIFACT_DIR = 'translation-artifacts';
export const TRANSLATION_PROMPT_VERSION = 'translation-v1';
export const TRANSLATION_ARTIFACT_BASE: BaseDir = 'Data';
const LEGACY_TRANSLATION_ARTIFACT_BASE: BaseDir = 'Cache';
export const MAX_TRANSLATION_SEGMENTS = 100_000;
export const MAX_TRANSLATION_FIELD_CHARS = 1_048_576;
export const MAX_TRANSLATION_TOTAL_CHARS = 32 * 1_048_576;

export type TranslationSegmentStatus = 'pending' | 'translated' | 'reviewed' | 'failed';

export interface TranslationSegment {
  id: string;
  sourceText: string;
  translatedText?: string;
  /** Original machine result retained after a human review edit. */
  machineTranslatedText?: string;
  sourceLang: string;
  targetLang: string;
  status: TranslationSegmentStatus;
  chapterId?: string;
  sourceLocator?: string;
  sourceAnchor?: TranslationSourceAnchor;
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
  glossaryVersion?: number;
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
  if (typeof value === 'string' && value.length > MAX_TRANSLATION_FIELD_CHARS)
    throw new Error(`Translation artifact field exceeds resource limit: ${field}`);
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

  for (const field of [
    'translatedText',
    'machineTranslatedText',
    'chapterId',
    'sourceLocator',
    'error',
  ] as const) {
    const fieldValue = value[field];
    if (fieldValue !== undefined) {
      if (typeof fieldValue !== 'string')
        throw new Error(`Invalid translation artifact field: ${field}`);
      if (fieldValue.length > MAX_TRANSLATION_FIELD_CHARS)
        throw new Error(`Translation artifact field exceeds resource limit: ${field}`);
      segment[field] = fieldValue;
    }
  }

  if (value['sourceAnchor'] !== undefined) {
    segment.sourceAnchor = parseTranslationSourceAnchor(value['sourceAnchor']);
  }

  return segment;
};

export const createTranslationArtifact = (
  input: Omit<TranslationArtifact, 'schemaVersion' | 'updatedAt' | 'segments'> &
    Partial<Pick<TranslationArtifact, 'updatedAt' | 'segments'>>,
): TranslationArtifact => {
  if (
    input.glossaryVersion !== undefined &&
    (!Number.isInteger(input.glossaryVersion) || input.glossaryVersion < 0)
  ) {
    throw new Error('Invalid translation artifact glossary version');
  }
  return {
    schemaVersion: TRANSLATION_ARTIFACT_SCHEMA_VERSION,
    bookHash: requiredString(input.bookHash, 'bookHash'),
    ...(input.sourceFingerprint ? { sourceFingerprint: input.sourceFingerprint } : {}),
    provider: requiredString(input.provider, 'provider'),
    ...(input.model ? { model: input.model } : {}),
    promptVersion: requiredString(input.promptVersion, 'promptVersion'),
    sourceLang: requiredString(input.sourceLang, 'sourceLang'),
    targetLang: requiredString(input.targetLang, 'targetLang'),
    ...(input.glossaryVersion === undefined ? {} : { glossaryVersion: input.glossaryVersion }),
    updatedAt: input.updatedAt ?? Date.now(),
    segments: input.segments ? input.segments.map((segment) => ({ ...segment })) : [],
  };
};

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
  if (value['segments'].length > MAX_TRANSLATION_SEGMENTS)
    throw new Error('Translation artifact segment count exceeds resource limit');
  const ids = new Set<string>();
  const segments: TranslationSegment[] = [];
  let totalChars = 0;
  for (const raw of value['segments']) {
    const segment = parseSegment(raw);
    if (ids.has(segment.id)) throw new Error(`Duplicate translation segment: ${segment.id}`);
    ids.add(segment.id);
    for (const field of [...Object.values(segment), ...Object.values(segment.sourceAnchor ?? {})]) {
      if (typeof field === 'string') totalChars += field.length;
    }
    if (totalChars > MAX_TRANSLATION_TOTAL_CHARS)
      throw new Error('Translation artifact text exceeds resource limit');
    segments.push(segment);
  }

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
    ...(value['glossaryVersion'] === undefined
      ? {}
      : {
          glossaryVersion:
            typeof value['glossaryVersion'] === 'number' &&
            Number.isInteger(value['glossaryVersion']) &&
            value['glossaryVersion'] >= 0
              ? value['glossaryVersion']
              : (() => {
                  throw new Error('Invalid translation artifact glossary version');
                })(),
        }),
    updatedAt,
    segments,
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
      updatedAt: Math.max(now, (existing?.updatedAt ?? -1) + 1),
    });
  }

  return {
    ...artifact,
    updatedAt: Array.from(byId.values()).reduce(
      (latest, segment) => Math.max(latest, segment.updatedAt),
      Math.max(now, artifact.updatedAt),
    ),
    segments: Array.from(byId.values()),
  };
};

/** Store a human edit without requiring an active translation queue. */
export const reviewTranslationSegment = (
  artifact: TranslationArtifact,
  id: string,
  translatedText: string,
  now = Date.now(),
): TranslationArtifact => {
  const segment = artifact.segments.find((candidate) => candidate.id === id);
  if (!segment) throw new Error(`Translation segment not found: ${id}`);
  if (!translatedText.trim()) throw new Error('Reviewed translation cannot be empty');
  return upsertTranslationSegments(
    artifact,
    [
      {
        ...segment,
        ...(segment.machineTranslatedText || segment.translatedText
          ? { machineTranslatedText: segment.machineTranslatedText ?? segment.translatedText }
          : {}),
        translatedText: translatedText.trim(),
        status: 'reviewed',
        error: undefined,
      },
    ],
    now,
  );
};

/** Restore the last machine result after a reviewer discards a manual edit. */
export const revertTranslationSegment = (
  artifact: TranslationArtifact,
  id: string,
  now = Date.now(),
): TranslationArtifact => {
  const segment = artifact.segments.find((candidate) => candidate.id === id);
  const machineText = segment?.machineTranslatedText ?? segment?.translatedText;
  if (!segment || !machineText?.trim()) {
    throw new Error(`Machine translation not available: ${id}`);
  }
  return upsertTranslationSegments(
    artifact,
    [
      {
        ...segment,
        translatedText: machineText,
        status: 'translated',
        error: undefined,
      },
    ],
    now,
  );
};

const safePathPart = (value: string): string => {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_');
  return normalized || 'unknown';
};

export const getTranslationArtifactPath = (key: TranslationArtifactKey): string =>
  `${TRANSLATION_ARTIFACT_DIR}/${safePathPart(key.bookHash)}.${safePathPart(key.provider)}.${safePathPart(key.targetLang)}.json`;

/** Persistent local-only store. Artifacts live in durable application data. */
export class TranslationArtifactStore {
  constructor(private readonly fs: TranslationArtifactStorage) {}

  private async loadFromBase(
    key: TranslationArtifactKey,
    base: BaseDir,
  ): Promise<TranslationArtifact | null> {
    const filename = getTranslationArtifactPath({ ...key });
    const raw = await safeLoadJSON<unknown>(
      this.fs,
      filename,
      base,
      null,
      parseTranslationArtifact,
    );
    if (raw === null) return null;
    const artifact = parseTranslationArtifact(raw);
    if (
      artifact.bookHash !== key.bookHash ||
      artifact.provider !== key.provider ||
      artifact.targetLang !== key.targetLang
    )
      throw new Error('Translation artifact identity does not match the requested book');
    return artifact;
  }

  async load(key: TranslationArtifactKey): Promise<TranslationArtifact | null> {
    const current = await this.loadFromBase(key, TRANSLATION_ARTIFACT_BASE);
    if (current) return current;

    // One-time migration for artifacts written by 0.2.1. Save to durable
    // storage before removing the cache copy so a failed migration is safe.
    const legacy = await this.loadFromBase(key, LEGACY_TRANSLATION_ARTIFACT_BASE);
    if (!legacy) return null;
    await this.save(legacy);
    await this.removeFromBase(key, LEGACY_TRANSLATION_ARTIFACT_BASE);
    return legacy;
  }

  async save(artifact: TranslationArtifact): Promise<void> {
    const incoming = parseTranslationArtifact(artifact);
    await this.fs.createDir(TRANSLATION_ARTIFACT_DIR, TRANSLATION_ARTIFACT_BASE, true);
    await updateJSON(
      this.fs,
      getTranslationArtifactPath(incoming),
      TRANSLATION_ARTIFACT_BASE,
      (raw) => {
        if (!raw) return incoming;
        const previous = parseTranslationArtifact(raw);
        if (
          previous.bookHash !== incoming.bookHash ||
          previous.provider !== incoming.provider ||
          previous.targetLang !== incoming.targetLang
        )
          throw new Error('Translation artifact identity conflict');
        if (previous.model !== incoming.model || previous.promptVersion !== incoming.promptVersion)
          throw new Error(
            'Translation context conflict; reload the committed artifact before retrying',
          );
        const segments = new Map(previous.segments.map((segment) => [segment.id, segment]));
        for (const next of incoming.segments) {
          const existing = segments.get(next.id);
          if (existing && existing.sourceText !== next.sourceText)
            throw new Error('Translation segment source changed');
          if (
            existing &&
            next.updatedAt === existing.updatedAt &&
            (existing.translatedText !== next.translatedText ||
              existing.status !== next.status ||
              existing.machineTranslatedText !== next.machineTranslatedText)
          )
            throw new Error(
              'Translation edit conflict; reload the committed result before retrying',
            );
          if (!existing || next.updatedAt >= existing.updatedAt) segments.set(next.id, next);
        }
        return parseTranslationArtifact({
          ...incoming,
          updatedAt: Math.max(previous.updatedAt, incoming.updatedAt),
          segments: [...segments.values()],
        });
      },
      parseTranslationArtifact,
    );
  }

  private async removeFromBase(key: TranslationArtifactKey, base: BaseDir): Promise<void> {
    const filename = getTranslationArtifactPath({ ...key });
    await withJSONLock(this.fs, filename, base, async () => {
      for (const candidate of [filename, `${filename}.bak`]) {
        if (!(await this.fs.exists(candidate, base))) continue;
        if (this.fs.removeFile) {
          await this.fs.removeFile(candidate, base);
        } else if (this.fs.deleteFile) {
          await this.fs.deleteFile(candidate, base);
        }
      }
    });
  }

  async remove(key: TranslationArtifactKey): Promise<void> {
    await this.removeFromBase(key, TRANSLATION_ARTIFACT_BASE);
    await this.removeFromBase(key, LEGACY_TRANSLATION_ARTIFACT_BASE);
  }
}
