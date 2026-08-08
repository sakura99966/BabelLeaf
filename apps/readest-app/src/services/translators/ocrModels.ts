/** Local-only OCR model-pack manifest and selection helpers. */
export const OCR_MODEL_MANIFEST_FORMAT = 'babelleaf.ocr-model' as const;
export const OCR_MODEL_MANIFEST_LEGACY_SCHEMA_VERSION = 1 as const;
export const OCR_MODEL_MANIFEST_SCHEMA_VERSION = 2 as const;
export const OCR_MODEL_MANIFEST_SUPPORTED_SCHEMA_VERSIONS = [
  OCR_MODEL_MANIFEST_LEGACY_SCHEMA_VERSION,
  OCR_MODEL_MANIFEST_SCHEMA_VERSION,
] as const;
export const MAX_OCR_MODEL_LANGUAGES = 16;
export const MAX_OCR_MODEL_SIZE_BYTES = 4 * 1024 * 1024 * 1024;
export const MAX_OCR_MODEL_ARTIFACTS = 64;
export const MAX_OCR_MODEL_ARTIFACT_ID_LENGTH = 64;
export const MAX_OCR_MODEL_ARTIFACT_FILE_NAME_LENGTH = 128;

export type OcrModelRuntime = 'onnx' | 'native' | 'wasm';
export type OcrModelManifestSchemaVersion =
  | typeof OCR_MODEL_MANIFEST_LEGACY_SCHEMA_VERSION
  | typeof OCR_MODEL_MANIFEST_SCHEMA_VERSION;

export interface OcrModelArtifactManifest {
  id: string;
  fileName: string;
  sizeBytes: number;
  checksumSha256: string;
}

export interface OcrModelManifest {
  format: typeof OCR_MODEL_MANIFEST_FORMAT;
  schemaVersion: OcrModelManifestSchemaVersion;
  id: string;
  version: string;
  runtime: OcrModelRuntime;
  languages: string[];
  license: string;
  checksumSha256: string;
  sizeBytes: number;
  source: 'local-import';
  engineCompatibility: string[];
  cpuFallback: boolean;
  /** Multi-file model packs are available in schema version 2. */
  artifacts?: OcrModelArtifactManifest[];
  /** The artifact used as the primary model input for legacy runtimes. */
  primaryArtifactId?: string;
}

export type OcrModelAvailability = 'installed' | 'missing' | 'incompatible';

export interface OcrModelSelection {
  manifest: OcrModelManifest;
  availability: OcrModelAvailability;
  missingLanguages: string[];
  reason?: string;
}

export class OcrModelManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OcrModelManifestError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new OcrModelManifestError(`Invalid OCR model field: ${field}`);
  }
  return value;
};
const requiredStringArray = (value: unknown, field: string, max: number): string[] => {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) {
    throw new OcrModelManifestError(`Invalid OCR model field: ${field}`);
  }
  return value.map((item, index) => requiredString(item, `${field}[${index}]`));
};
const requiredChecksum = (value: unknown, field: string): string => {
  const checksum = requiredString(value, field);
  if (!/^[a-f0-9]{64}$/i.test(checksum)) {
    throw new OcrModelManifestError(`Invalid OCR model checksum: ${field}`);
  }
  return checksum.toLowerCase();
};
const requiredPositiveSize = (value: unknown, field: string): number => {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > MAX_OCR_MODEL_SIZE_BYTES
  ) {
    throw new OcrModelManifestError(`Invalid OCR model size: ${field}`);
  }
  return value;
};
const requiredArtifactId = (value: unknown, field: string): string => {
  const id = requiredString(value, field);
  if (id.length > MAX_OCR_MODEL_ARTIFACT_ID_LENGTH || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(id)) {
    throw new OcrModelManifestError(`Invalid OCR model artifact id: ${field}`);
  }
  return id;
};
const requiredArtifactFileName = (value: unknown, field: string): string => {
  const fileName = requiredString(value, field);
  if (
    fileName.length > MAX_OCR_MODEL_ARTIFACT_FILE_NAME_LENGTH ||
    fileName === '.' ||
    fileName === '..' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(fileName)
  ) {
    throw new OcrModelManifestError(`Invalid OCR model artifact file name: ${field}`);
  }
  return fileName;
};
const parseArtifacts = (value: unknown): OcrModelArtifactManifest[] => {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_OCR_MODEL_ARTIFACTS) {
    throw new OcrModelManifestError('Invalid OCR model artifacts');
  }
  const ids = new Set<string>();
  const fileNames = new Set<string>();
  const artifacts = value.map((item, index) => {
    if (!isRecord(item)) throw new OcrModelManifestError(`Invalid OCR model artifact[${index}]`);
    const id = requiredArtifactId(item['id'], `artifacts[${index}].id`);
    const fileName = requiredArtifactFileName(item['fileName'], `artifacts[${index}].fileName`);
    if (ids.has(id)) throw new OcrModelManifestError('Duplicate OCR model artifact id');
    if (fileNames.has(fileName))
      throw new OcrModelManifestError('Duplicate OCR model artifact file');
    ids.add(id);
    fileNames.add(fileName);
    return {
      id,
      fileName,
      sizeBytes: requiredPositiveSize(item['sizeBytes'], `artifacts[${index}].sizeBytes`),
      checksumSha256: requiredChecksum(
        item['checksumSha256'],
        `artifacts[${index}].checksumSha256`,
      ),
    } satisfies OcrModelArtifactManifest;
  });
  const totalSize = artifacts.reduce((sum, artifact) => sum + artifact.sizeBytes, 0);
  if (totalSize > MAX_OCR_MODEL_SIZE_BYTES) {
    throw new OcrModelManifestError('OCR model artifacts exceed the maximum size');
  }
  return artifacts;
};

export const parseOcrModelManifest = (value: unknown): OcrModelManifest => {
  if (!isRecord(value)) throw new OcrModelManifestError('Invalid OCR model manifest');
  const schemaVersion = value['schemaVersion'];
  if (
    value['format'] !== OCR_MODEL_MANIFEST_FORMAT ||
    !OCR_MODEL_MANIFEST_SUPPORTED_SCHEMA_VERSIONS.includes(
      schemaVersion as OcrModelManifestSchemaVersion,
    )
  ) {
    throw new OcrModelManifestError('Unsupported OCR model manifest schema');
  }
  const runtime = value['runtime'];
  if (!['onnx', 'native', 'wasm'].includes(String(runtime))) {
    throw new OcrModelManifestError('Invalid OCR model runtime');
  }
  const sizeBytes = requiredPositiveSize(value['sizeBytes'], 'sizeBytes');
  const checksumSha256 = requiredChecksum(value['checksumSha256'], 'checksumSha256');
  const artifacts =
    schemaVersion === OCR_MODEL_MANIFEST_SCHEMA_VERSION
      ? parseArtifacts(value['artifacts'])
      : undefined;
  const primaryArtifactId =
    schemaVersion === OCR_MODEL_MANIFEST_SCHEMA_VERSION
      ? requiredArtifactId(value['primaryArtifactId'], 'primaryArtifactId')
      : undefined;
  if (artifacts && !artifacts.some((artifact) => artifact.id === primaryArtifactId)) {
    throw new OcrModelManifestError('OCR primary artifact is not declared');
  }
  if (artifacts && artifacts.reduce((sum, artifact) => sum + artifact.sizeBytes, 0) !== sizeBytes) {
    throw new OcrModelManifestError('OCR model size does not match its artifacts');
  }
  return {
    format: OCR_MODEL_MANIFEST_FORMAT,
    schemaVersion: schemaVersion as OcrModelManifestSchemaVersion,
    id: requiredString(value['id'], 'id'),
    version: requiredString(value['version'], 'version'),
    runtime: runtime as OcrModelRuntime,
    languages: requiredStringArray(value['languages'], 'languages', MAX_OCR_MODEL_LANGUAGES),
    license: requiredString(value['license'], 'license'),
    checksumSha256,
    sizeBytes,
    source:
      value['source'] === 'local-import'
        ? 'local-import'
        : (() => {
            throw new OcrModelManifestError('OCR models must be installed from a local import');
          })(),
    engineCompatibility: requiredStringArray(
      value['engineCompatibility'],
      'engineCompatibility',
      16,
    ),
    cpuFallback: value['cpuFallback'] === true,
    ...(artifacts ? { artifacts, primaryArtifactId } : {}),
  };
};

/** Return the declared artifacts, including the implicit legacy model.bin. */
export const getOcrModelArtifactManifests = (
  manifest: OcrModelManifest,
): OcrModelArtifactManifest[] =>
  manifest.artifacts
    ? manifest.artifacts.map((artifact) => ({ ...artifact }))
    : [
        {
          id: 'model',
          fileName: 'model.bin',
          sizeBytes: manifest.sizeBytes,
          checksumSha256: manifest.checksumSha256,
        },
      ];

export const getOcrModelPrimaryArtifactId = (manifest: OcrModelManifest): string =>
  manifest.primaryArtifactId ?? 'model';

export const serializeOcrModelManifest = (manifest: OcrModelManifest): string =>
  JSON.stringify(parseOcrModelManifest(manifest), null, 2);

export const selectOcrModel = (
  manifests: OcrModelManifest[],
  sourceLanguages: string[],
  engine: string,
  installedIds: ReadonlySet<string>,
): OcrModelSelection | null => {
  const requested = new Set(sourceLanguages.map((language) => language.toLowerCase()));
  const candidates = manifests
    .map(parseOcrModelManifest)
    .filter((manifest) => manifest.engineCompatibility.includes(engine))
    .map((manifest) => {
      const missingLanguages = [...requested].filter(
        (language) => !manifest.languages.some((candidate) => candidate.toLowerCase() === language),
      );
      const availability: OcrModelAvailability = !installedIds.has(manifest.id)
        ? 'missing'
        : missingLanguages.length > 0
          ? 'incompatible'
          : 'installed';
      return {
        manifest,
        availability,
        missingLanguages,
        ...(availability === 'missing'
          ? { reason: 'Install this model pack locally before starting OCR.' }
          : availability === 'incompatible'
            ? { reason: 'The model does not cover every requested source language.' }
            : {}),
      } satisfies OcrModelSelection;
    })
    .sort((left, right) => {
      const rank = { installed: 0, missing: 1, incompatible: 2 } as const;
      return rank[left.availability] - rank[right.availability];
    });
  return candidates[0] ?? null;
};

/** In-memory registry used by platform adapters; model bytes remain local. */
export class OcrModelRegistry {
  private readonly manifests = new Map<string, OcrModelManifest>();

  constructor(initial: OcrModelManifest[] = []) {
    for (const manifest of initial) this.install(manifest);
  }

  install(manifest: OcrModelManifest): OcrModelManifest {
    const normalized = parseOcrModelManifest(manifest);
    this.manifests.set(normalized.id, normalized);
    return normalized;
  }

  remove(id: string): boolean {
    return this.manifests.delete(id);
  }

  list(): OcrModelManifest[] {
    return [...this.manifests.values()].map((manifest) => ({
      ...manifest,
      languages: [...manifest.languages],
      engineCompatibility: [...manifest.engineCompatibility],
      ...(manifest.artifacts
        ? {
            artifacts: manifest.artifacts.map((artifact) => ({ ...artifact })),
          }
        : {}),
    }));
  }

  select(sourceLanguages: string[], engine: string): OcrModelSelection | null {
    return selectOcrModel(this.list(), sourceLanguages, engine, new Set(this.manifests.keys()));
  }
}
