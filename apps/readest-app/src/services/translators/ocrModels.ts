/** Local-only OCR model-pack manifest and selection helpers. */
export const OCR_MODEL_MANIFEST_FORMAT = 'babelleaf.ocr-model' as const;
export const OCR_MODEL_MANIFEST_SCHEMA_VERSION = 1 as const;
export const MAX_OCR_MODEL_LANGUAGES = 16;
export const MAX_OCR_MODEL_SIZE_BYTES = 4 * 1024 * 1024 * 1024;

export type OcrModelRuntime = 'onnx' | 'native' | 'wasm';

export interface OcrModelManifest {
  format: typeof OCR_MODEL_MANIFEST_FORMAT;
  schemaVersion: typeof OCR_MODEL_MANIFEST_SCHEMA_VERSION;
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

export const parseOcrModelManifest = (value: unknown): OcrModelManifest => {
  if (!isRecord(value)) throw new OcrModelManifestError('Invalid OCR model manifest');
  if (
    value['format'] !== OCR_MODEL_MANIFEST_FORMAT ||
    value['schemaVersion'] !== OCR_MODEL_MANIFEST_SCHEMA_VERSION
  ) {
    throw new OcrModelManifestError('Unsupported OCR model manifest schema');
  }
  const runtime = value['runtime'];
  if (!['onnx', 'native', 'wasm'].includes(String(runtime))) {
    throw new OcrModelManifestError('Invalid OCR model runtime');
  }
  const sizeBytes = value['sizeBytes'];
  if (
    typeof sizeBytes !== 'number' ||
    !Number.isInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > MAX_OCR_MODEL_SIZE_BYTES
  ) {
    throw new OcrModelManifestError('Invalid OCR model size');
  }
  return {
    format: OCR_MODEL_MANIFEST_FORMAT,
    schemaVersion: OCR_MODEL_MANIFEST_SCHEMA_VERSION,
    id: requiredString(value['id'], 'id'),
    version: requiredString(value['version'], 'version'),
    runtime: runtime as OcrModelRuntime,
    languages: requiredStringArray(value['languages'], 'languages', MAX_OCR_MODEL_LANGUAGES),
    license: requiredString(value['license'], 'license'),
    checksumSha256: (() => {
      const checksum = requiredString(value['checksumSha256'], 'checksumSha256');
      if (!/^[a-f0-9]{64}$/i.test(checksum)) {
        throw new OcrModelManifestError('Invalid OCR model checksum');
      }
      return checksum;
    })(),
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
  };
};

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
    }));
  }

  select(sourceLanguages: string[], engine: string): OcrModelSelection | null {
    return selectOcrModel(this.list(), sourceLanguages, engine, new Set(this.manifests.keys()));
  }
}
