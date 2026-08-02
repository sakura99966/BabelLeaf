import {
  TRANSLATION_ARTIFACT_SCHEMA_VERSION,
  type TranslationArtifact,
  type TranslationSegment,
  parseTranslationArtifact,
} from './artifacts';

/** Stable discriminator used for files exchanged between BabelLeaf installs. */
export const TRANSLATION_SIDECAR_FORMAT = 'babelleaf.translation-sidecar' as const;
export const TRANSLATION_SIDECAR_SCHEMA_VERSION = 1 as const;

export interface TranslationSidecar {
  format: typeof TRANSLATION_SIDECAR_FORMAT;
  schemaVersion: typeof TRANSLATION_SIDECAR_SCHEMA_VERSION;
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Build a portable copy without credentials or cache-specific fields. */
export const createTranslationSidecar = (artifact: TranslationArtifact): TranslationSidecar => {
  const normalized = parseTranslationArtifact(artifact);
  return {
    format: TRANSLATION_SIDECAR_FORMAT,
    schemaVersion: TRANSLATION_SIDECAR_SCHEMA_VERSION,
    bookHash: normalized.bookHash,
    ...(normalized.sourceFingerprint ? { sourceFingerprint: normalized.sourceFingerprint } : {}),
    provider: normalized.provider,
    ...(normalized.model ? { model: normalized.model } : {}),
    promptVersion: normalized.promptVersion,
    sourceLang: normalized.sourceLang,
    targetLang: normalized.targetLang,
    updatedAt: normalized.updatedAt,
    segments: normalized.segments.map((segment) => ({ ...segment })),
  };
};

/**
 * Parse an imported file at the trust boundary. Unknown fields, including an
 * accidentally supplied API key, are discarded by the artifact validator.
 */
export const parseTranslationSidecar = (value: unknown): TranslationSidecar => {
  if (
    !isRecord(value) ||
    value['format'] !== TRANSLATION_SIDECAR_FORMAT ||
    value['schemaVersion'] !== TRANSLATION_SIDECAR_SCHEMA_VERSION
  ) {
    throw new Error('Unsupported translation sidecar schema');
  }

  const artifactValue = { ...value };
  delete artifactValue['format'];
  const artifact = parseTranslationArtifact({
    ...artifactValue,
    schemaVersion: TRANSLATION_ARTIFACT_SCHEMA_VERSION,
  });
  return createTranslationSidecar(artifact);
};

export const serializeTranslationSidecar = (artifact: TranslationArtifact): string =>
  JSON.stringify(createTranslationSidecar(artifact), null, 2);

export const translationSidecarToArtifact = (sidecar: TranslationSidecar): TranslationArtifact => {
  const normalized = parseTranslationSidecar(sidecar);
  return parseTranslationArtifact({
    ...normalized,
    schemaVersion: TRANSLATION_ARTIFACT_SCHEMA_VERSION,
  });
};
