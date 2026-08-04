import type { BaseDir, FileSystem } from '@/types/system';
import { safeLoadJSON, safeSaveJSON } from '@/services/persistence';

export const TRANSLATION_GLOSSARY_SCHEMA_VERSION = 1 as const;
export const TRANSLATION_GLOSSARY_DIR = 'translation-glossary';
export const TRANSLATION_GLOSSARY_FILENAME = `${TRANSLATION_GLOSSARY_DIR}/entries.json`;
export const TRANSLATION_GLOSSARY_BASE: BaseDir = 'Data';

export interface GlossaryEntry {
  id: string;
  source: string;
  target: string;
  sourceLang?: string;
  targetLang?: string;
  caseSensitive?: boolean;
  enabled?: boolean;
  notes?: string;
  updatedAt: number;
}

export interface TranslationGlossary {
  schemaVersion: typeof TRANSLATION_GLOSSARY_SCHEMA_VERSION;
  updatedAt: number;
  entries: GlossaryEntry[];
}

export interface GlossaryStorage extends Pick<FileSystem, 'createDir' | 'readFile' | 'writeFile'> {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid glossary field: ${field}`);
  }
  return value;
};

const optionalString = (value: unknown, field: string): string | undefined => {
  if (value === undefined) return undefined;
  return requiredString(value, field);
};

const optionalBoolean = (value: unknown, field: string): boolean | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new Error(`Invalid glossary field: ${field}`);
  return value;
};

const parseEntry = (value: unknown, index: number): GlossaryEntry => {
  if (!isRecord(value)) throw new Error(`Invalid glossary entry: ${index}`);
  const updatedAt = value['updatedAt'];
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) {
    throw new Error(`Invalid glossary timestamp: ${index}`);
  }
  const caseSensitive = optionalBoolean(value['caseSensitive'], `entries[${index}].caseSensitive`);
  const enabled = optionalBoolean(value['enabled'], `entries[${index}].enabled`);
  const sourceLang = optionalString(value['sourceLang'], `entries[${index}].sourceLang`);
  const targetLang = optionalString(value['targetLang'], `entries[${index}].targetLang`);
  const notes = optionalString(value['notes'], `entries[${index}].notes`);
  return {
    id: requiredString(value['id'], `entries[${index}].id`),
    source: requiredString(value['source'], `entries[${index}].source`),
    target: requiredString(value['target'], `entries[${index}].target`),
    ...(sourceLang ? { sourceLang } : {}),
    ...(targetLang ? { targetLang } : {}),
    ...(caseSensitive === undefined ? {} : { caseSensitive }),
    ...(enabled === undefined ? {} : { enabled }),
    ...(notes ? { notes } : {}),
    updatedAt,
  };
};

export const createTranslationGlossary = (
  entries: Array<
    Omit<GlossaryEntry, 'id' | 'updatedAt'> & Partial<Pick<GlossaryEntry, 'id' | 'updatedAt'>>
  >,
  updatedAt = Date.now(),
): TranslationGlossary => ({
  schemaVersion: TRANSLATION_GLOSSARY_SCHEMA_VERSION,
  updatedAt,
  entries: entries.map((entry, index) => ({
    id: entry.id?.trim() || `glossary-${index + 1}`,
    source: requiredString(entry.source, `entries[${index}].source`),
    target: requiredString(entry.target, `entries[${index}].target`),
    ...(entry.sourceLang ? { sourceLang: entry.sourceLang } : {}),
    ...(entry.targetLang ? { targetLang: entry.targetLang } : {}),
    ...(entry.caseSensitive === undefined ? {} : { caseSensitive: entry.caseSensitive }),
    ...(entry.enabled === undefined ? {} : { enabled: entry.enabled }),
    ...(entry.notes ? { notes: entry.notes } : {}),
    updatedAt: entry.updatedAt ?? updatedAt,
  })),
});

export const parseTranslationGlossary = (value: unknown): TranslationGlossary => {
  if (!isRecord(value) || value['schemaVersion'] !== TRANSLATION_GLOSSARY_SCHEMA_VERSION) {
    throw new Error('Unsupported translation glossary schema');
  }
  const updatedAt = value['updatedAt'];
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) {
    throw new Error('Invalid glossary timestamp');
  }
  if (!Array.isArray(value['entries'])) throw new Error('Invalid glossary entries');
  const entries = value['entries'].map(parseEntry);
  const ids = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new Error(`Duplicate glossary entry: ${entry.id}`);
    ids.add(entry.id);
  }
  return { schemaVersion: TRANSLATION_GLOSSARY_SCHEMA_VERSION, updatedAt, entries };
};

export const getApplicableGlossaryEntries = (
  glossary: TranslationGlossary | null | undefined,
  sourceLang: string,
  targetLang: string,
): GlossaryEntry[] => {
  if (!glossary) return [];
  const source = sourceLang.toLowerCase();
  const target = targetLang.toLowerCase();
  return glossary.entries
    .filter((entry) => entry.enabled !== false)
    .filter(
      (entry) =>
        (!entry.sourceLang || entry.sourceLang.toLowerCase() === source) &&
        (!entry.targetLang || entry.targetLang.toLowerCase() === target),
    )
    .sort((a, b) => b.source.length - a.source.length);
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

interface GlossaryBinding {
  entry: GlossaryEntry;
  token: string;
}

const matcher = (entry: GlossaryEntry): RegExp =>
  new RegExp(escapeRegExp(entry.source), entry.caseSensitive ? 'g' : 'gi');

/** Replace glossary terms with stable placeholders before an API request. */
export const protectGlossaryTerms = (
  text: string,
  entries: GlossaryEntry[],
): { text: string; bindings: GlossaryBinding[] } => {
  let protectedText = text;
  const bindings: GlossaryBinding[] = [];
  for (const [index, entry] of entries.entries()) {
    const token = `__BABELLEAF_GLOSSARY_${index}__`;
    const next = protectedText.replace(matcher(entry), token);
    if (next !== protectedText) {
      protectedText = next;
      bindings.push({ entry, token });
    }
  }
  return { text: protectedText, bindings };
};

/** Restore protected terms and enforce the target spelling in the response. */
export const restoreGlossaryTerms = (text: string, bindings: GlossaryBinding[]): string => {
  let restored = text;
  for (const { entry, token } of bindings) {
    restored = restored.split(token).join(entry.target);
    restored = restored.replace(matcher(entry), entry.target);
  }
  return restored;
};

export class TranslationGlossaryStore {
  constructor(private readonly fs: GlossaryStorage) {}

  async load(): Promise<TranslationGlossary | null> {
    const raw = await safeLoadJSON<unknown>(
      this.fs,
      TRANSLATION_GLOSSARY_FILENAME,
      TRANSLATION_GLOSSARY_BASE,
      null,
    );
    return raw === null ? null : parseTranslationGlossary(raw);
  }

  async save(glossary: TranslationGlossary): Promise<void> {
    await this.fs.createDir(TRANSLATION_GLOSSARY_DIR, TRANSLATION_GLOSSARY_BASE, true);
    await safeSaveJSON(
      this.fs,
      TRANSLATION_GLOSSARY_FILENAME,
      TRANSLATION_GLOSSARY_BASE,
      parseTranslationGlossary(glossary),
    );
  }
}
