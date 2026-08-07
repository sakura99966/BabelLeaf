/**
 * Layout-independent source anchors used by translation artifacts.
 *
 * A DOM range or a page/line coordinate is not portable: pagination, font
 * metrics, writing mode, and window size all change it.  Translation segments
 * therefore carry a small structural anchor made from the section/block
 * identity and a normalized source-text fingerprint.  The reader can resolve
 * it after reopening a book without depending on the previous layout.
 */

export const TRANSLATION_ANCHOR_SCHEMA_VERSION = 1 as const;
export const MAX_ANCHOR_CONTEXT_CHARS = 96;

export interface TranslationSourceAnchor {
  schemaVersion: typeof TRANSLATION_ANCHOR_SCHEMA_VERSION;
  sectionIndex: number;
  blockIndex: number;
  chunkIndex: number;
  textHash: string;
  textLength: number;
  sourceLocator?: string;
  prefix?: string;
  suffix?: string;
}

export interface TranslationAnchorInput {
  sectionIndex: number;
  blockIndex: number;
  chunkIndex: number;
  sourceText: string;
  contextText?: string;
  sourceLocator?: string;
}

export interface TranslationAnchorResolution {
  sectionIndex: number;
  blockIndex: number;
  chunkIndex: number;
  start: number;
  end: number;
  confidence: 'exact' | 'normalized' | 'structural';
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const finiteInteger = (value: unknown, field: string, minimum = 0): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
    throw new Error(`Invalid translation anchor field: ${field}`);
  }
  return value;
};

const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid translation anchor field: ${field}`);
  }
  return value;
};

/** Normalize only layout-insignificant whitespace. Punctuation and CJK text remain unchanged. */
export const normalizeAnchorText = (value: string): string =>
  value
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Small deterministic hash suitable for identity/fingerprint checks, not security. */
export const hashAnchorText = (value: string): string => {
  let hash = 0x811c9dc5;
  for (const char of normalizeAnchorText(value)) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const contextSlice = (value: string | undefined, fromEnd: boolean): string | undefined => {
  if (!value) return undefined;
  const normalized = normalizeAnchorText(value);
  if (!normalized) return undefined;
  return fromEnd
    ? normalized.slice(Math.max(0, normalized.length - MAX_ANCHOR_CONTEXT_CHARS))
    : normalized.slice(0, MAX_ANCHOR_CONTEXT_CHARS);
};

export const createTranslationSourceAnchor = (
  input: TranslationAnchorInput,
): TranslationSourceAnchor => {
  const sourceText = normalizeAnchorText(input.sourceText);
  if (!sourceText) throw new Error('Cannot anchor empty source text');
  return {
    schemaVersion: TRANSLATION_ANCHOR_SCHEMA_VERSION,
    sectionIndex: finiteInteger(input.sectionIndex, 'sectionIndex'),
    blockIndex: finiteInteger(input.blockIndex, 'blockIndex'),
    chunkIndex: finiteInteger(input.chunkIndex, 'chunkIndex'),
    textHash: hashAnchorText(sourceText),
    textLength: sourceText.length,
    ...(input.sourceLocator ? { sourceLocator: input.sourceLocator } : {}),
    ...(contextSlice(input.contextText?.slice(0, input.contextText.length), false)
      ? { prefix: contextSlice(input.contextText, false) }
      : {}),
    ...(contextSlice(input.contextText, true)
      ? { suffix: contextSlice(input.contextText, true) }
      : {}),
  };
};

export const parseTranslationSourceAnchor = (value: unknown): TranslationSourceAnchor => {
  if (!isRecord(value) || value['schemaVersion'] !== TRANSLATION_ANCHOR_SCHEMA_VERSION) {
    throw new Error('Unsupported translation anchor schema');
  }
  const sourceLocator = value['sourceLocator'];
  const prefix = value['prefix'];
  const suffix = value['suffix'];
  return {
    schemaVersion: TRANSLATION_ANCHOR_SCHEMA_VERSION,
    sectionIndex: finiteInteger(value['sectionIndex'], 'sectionIndex'),
    blockIndex: finiteInteger(value['blockIndex'], 'blockIndex'),
    chunkIndex: finiteInteger(value['chunkIndex'], 'chunkIndex'),
    textHash: requiredString(value['textHash'], 'textHash'),
    textLength: finiteInteger(value['textLength'], 'textLength'),
    ...(sourceLocator === undefined
      ? {}
      : { sourceLocator: requiredString(sourceLocator, 'sourceLocator') }),
    ...(prefix === undefined ? {} : { prefix: requiredString(prefix, 'prefix') }),
    ...(suffix === undefined ? {} : { suffix: requiredString(suffix, 'suffix') }),
  };
};

export const serializeTranslationSourceAnchor = (anchor: TranslationSourceAnchor): string =>
  JSON.stringify(parseTranslationSourceAnchor(anchor));

/** Resolve an anchor against the current source segment text. */
export const resolveTranslationSourceAnchor = (
  anchor: TranslationSourceAnchor,
  sourceText: string,
): TranslationAnchorResolution | null => {
  const parsed = parseTranslationSourceAnchor(anchor);
  const trimmed = sourceText.trim();
  const exact = sourceText.indexOf(trimmed);
  if (exact >= 0 && hashAnchorText(sourceText) === parsed.textHash) {
    return {
      sectionIndex: parsed.sectionIndex,
      blockIndex: parsed.blockIndex,
      chunkIndex: parsed.chunkIndex,
      start: exact,
      end: exact + trimmed.length,
      confidence: trimmed === normalizeAnchorText(sourceText) ? 'exact' : 'normalized',
    };
  }

  const normalized = normalizeAnchorText(sourceText);
  if (normalized && hashAnchorText(normalized) === parsed.textHash) {
    return {
      sectionIndex: parsed.sectionIndex,
      blockIndex: parsed.blockIndex,
      chunkIndex: parsed.chunkIndex,
      start: 0,
      end: normalized.length,
      confidence: 'normalized',
    };
  }

  // A structural match is intentionally weaker and must be surfaced to the
  // caller for review. It is useful after benign whitespace/punctuation
  // normalization while preventing silent relocation to an unrelated block.
  if (normalized && normalized.length === parsed.textLength) {
    return {
      sectionIndex: parsed.sectionIndex,
      blockIndex: parsed.blockIndex,
      chunkIndex: parsed.chunkIndex,
      start: 0,
      end: normalized.length,
      confidence: 'structural',
    };
  }
  return null;
};
