import type { BaseDir, FileSystem } from '@/types/system';
import { safeLoadJSON, safeSaveJSON } from '@/services/persistence';

export const TRANSLATION_MEMORY_SCHEMA_VERSION = 1 as const;
export const TRANSLATION_MEMORY_DIR = 'translation-memory';
export const TRANSLATION_MEMORY_FILENAME = `${TRANSLATION_MEMORY_DIR}/entries.json`;
export const TRANSLATION_MEMORY_BASE: BaseDir = 'Data';
export const DEFAULT_TRANSLATION_MEMORY_LIMIT = 5000;

export interface TranslationMemoryEntry {
  key: string;
  sourceText: string;
  translatedText: string;
  sourceLang: string;
  targetLang: string;
  provider: string;
  model?: string;
  glossaryVersion?: number;
  updatedAt: number;
  hits: number;
}

export interface TranslationMemoryData {
  schemaVersion: typeof TRANSLATION_MEMORY_SCHEMA_VERSION;
  updatedAt: number;
  entries: TranslationMemoryEntry[];
}

export interface TranslationMemoryQuery {
  sourceText: string;
  sourceLang: string;
  targetLang: string;
  provider: string;
  model?: string;
  glossaryVersion?: number;
}

export interface TranslationMemoryStorage
  extends Pick<FileSystem, 'createDir' | 'readFile' | 'writeFile'> {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid translation memory field: ${field}`);
  }
  return value;
};

const finiteInteger = (value: unknown, field: string, minimum = 0): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
    throw new Error(`Invalid translation memory field: ${field}`);
  }
  return value;
};

const normalizeText = (value: string): string => value.replace(/\s+/g, ' ').trim();

export const getTranslationMemoryKey = (query: TranslationMemoryQuery): string =>
  JSON.stringify([
    query.provider.trim().toLowerCase(),
    query.model?.trim().toLowerCase() || '',
    query.sourceLang.trim().toLowerCase(),
    query.targetLang.trim().toLowerCase(),
    query.glossaryVersion ?? 0,
    normalizeText(query.sourceText),
  ]);

const parseEntry = (value: unknown, index: number): TranslationMemoryEntry => {
  if (!isRecord(value)) throw new Error(`Invalid translation memory entry: ${index}`);
  const updatedAt = value['updatedAt'];
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) {
    throw new Error(`Invalid translation memory timestamp: ${index}`);
  }
  return {
    key: requiredString(value['key'], `entries[${index}].key`),
    sourceText: requiredString(value['sourceText'], `entries[${index}].sourceText`),
    translatedText: requiredString(value['translatedText'], `entries[${index}].translatedText`),
    sourceLang: requiredString(value['sourceLang'], `entries[${index}].sourceLang`),
    targetLang: requiredString(value['targetLang'], `entries[${index}].targetLang`),
    provider: requiredString(value['provider'], `entries[${index}].provider`),
    ...(value['model'] === undefined
      ? {}
      : { model: requiredString(value['model'], `entries[${index}].model`) }),
    ...(value['glossaryVersion'] === undefined
      ? {}
      : {
          glossaryVersion: finiteInteger(
            value['glossaryVersion'],
            `entries[${index}].glossaryVersion`,
          ),
        }),
    updatedAt,
    hits: finiteInteger(value['hits'], `entries[${index}].hits`),
  };
};

export const parseTranslationMemory = (value: unknown): TranslationMemoryData => {
  if (!isRecord(value) || value['schemaVersion'] !== TRANSLATION_MEMORY_SCHEMA_VERSION) {
    throw new Error('Unsupported translation memory schema');
  }
  const updatedAt = value['updatedAt'];
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) {
    throw new Error('Invalid translation memory timestamp');
  }
  if (!Array.isArray(value['entries'])) throw new Error('Invalid translation memory entries');
  const entries = value['entries'].map(parseEntry);
  const keys = new Set<string>();
  for (const entry of entries) {
    if (keys.has(entry.key)) throw new Error(`Duplicate translation memory entry: ${entry.key}`);
    keys.add(entry.key);
  }
  return { schemaVersion: TRANSLATION_MEMORY_SCHEMA_VERSION, updatedAt, entries };
};

export class TranslationMemoryFileStore {
  constructor(private readonly fs: TranslationMemoryStorage) {}

  async load(): Promise<TranslationMemoryData | null> {
    const raw = await safeLoadJSON<unknown>(
      this.fs,
      TRANSLATION_MEMORY_FILENAME,
      TRANSLATION_MEMORY_BASE,
      null,
    );
    return raw === null ? null : parseTranslationMemory(raw);
  }

  async save(data: TranslationMemoryData): Promise<void> {
    await this.fs.createDir(TRANSLATION_MEMORY_DIR, TRANSLATION_MEMORY_BASE, true);
    await safeSaveJSON(
      this.fs,
      TRANSLATION_MEMORY_FILENAME,
      TRANSLATION_MEMORY_BASE,
      parseTranslationMemory(data),
    );
  }
}

export class TranslationMemory {
  private readonly maxEntries: number;
  private readonly store?: TranslationMemoryFileStore;
  private readonly entries = new Map<string, TranslationMemoryEntry>();

  constructor(options: { maxEntries?: number; store?: TranslationMemoryFileStore } = {}) {
    this.maxEntries = Math.max(
      1,
      Math.min(20_000, Math.floor(options.maxEntries ?? DEFAULT_TRANSLATION_MEMORY_LIMIT)),
    );
    this.store = options.store;
  }

  static async load(
    store: TranslationMemoryFileStore,
    options: { maxEntries?: number } = {},
  ): Promise<TranslationMemory> {
    const memory = new TranslationMemory({ ...options, store });
    await memory.hydrate();
    return memory;
  }

  async hydrate(): Promise<void> {
    const data = await this.store?.load();
    if (!data) return;
    this.entries.clear();
    for (const entry of data.entries) this.entries.set(entry.key, { ...entry });
    this.evictIfNeeded();
  }

  lookup(query: TranslationMemoryQuery): string | null {
    const key = getTranslationMemoryKey(query);
    const entry = this.entries.get(key);
    if (!entry) return null;
    entry.hits += 1;
    entry.updatedAt = Date.now();
    return entry.translatedText;
  }

  async remember(query: TranslationMemoryQuery, translatedText: string): Promise<void> {
    const normalized = translatedText.trim();
    if (!normalized) return;
    const key = getTranslationMemoryKey(query);
    const previous = this.entries.get(key);
    this.entries.set(key, {
      key,
      sourceText: query.sourceText,
      translatedText: normalized,
      sourceLang: query.sourceLang,
      targetLang: query.targetLang,
      provider: query.provider,
      ...(query.model ? { model: query.model } : {}),
      ...(query.glossaryVersion === undefined ? {} : { glossaryVersion: query.glossaryVersion }),
      updatedAt: Date.now(),
      hits: previous?.hits ?? 0,
    });
    this.evictIfNeeded();
    await this.persist();
  }

  async persist(): Promise<void> {
    await this.store?.save({
      schemaVersion: TRANSLATION_MEMORY_SCHEMA_VERSION,
      updatedAt: Date.now(),
      entries: Array.from(this.entries.values()).map((entry) => ({ ...entry })),
    });
  }

  async clear(): Promise<void> {
    this.entries.clear();
    await this.persist();
  }

  async remove(key: string): Promise<boolean> {
    const removed = this.entries.delete(key);
    if (removed) await this.persist();
    return removed;
  }

  /** Replace entries from a validated portable export and apply the limit. */
  async replace(data: TranslationMemoryData): Promise<void> {
    const parsed = parseTranslationMemory(data);
    this.entries.clear();
    for (const entry of parsed.entries) this.entries.set(entry.key, { ...entry });
    this.evictIfNeeded();
    await this.persist();
  }

  size(): number {
    return this.entries.size;
  }

  getLimit(): number {
    return this.maxEntries;
  }

  getStats(): { entries: number; limit: number; oldestUpdatedAt: number | null } {
    const oldestUpdatedAt = Array.from(this.entries.values()).reduce<number | null>(
      (oldest, entry) => (oldest === null ? entry.updatedAt : Math.min(oldest, entry.updatedAt)),
      null,
    );
    return { entries: this.entries.size, limit: this.maxEntries, oldestUpdatedAt };
  }

  snapshot(): TranslationMemoryData {
    return {
      schemaVersion: TRANSLATION_MEMORY_SCHEMA_VERSION,
      updatedAt: Date.now(),
      entries: Array.from(this.entries.values()).map((entry) => ({ ...entry })),
    };
  }

  private evictIfNeeded(): void {
    while (this.entries.size > this.maxEntries) {
      const oldest = Array.from(this.entries.values()).sort((a, b) => {
        if (a.updatedAt !== b.updatedAt) return a.updatedAt - b.updatedAt;
        return a.hits - b.hits;
      })[0];
      if (!oldest) return;
      this.entries.delete(oldest.key);
    }
  }
}
