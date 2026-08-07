import type { BaseDir, FileSystem } from '@/types/system';
import { safeLoadJSON, safeSaveJSON } from '@/services/persistence';
import {
  parseOcrModelManifest,
  serializeOcrModelManifest,
  type OcrModelManifest,
} from './ocrModels';

/** Local model-pack storage is deliberately separate from the startup path. */
export const OCR_MODEL_PACK_STORE_BASE: BaseDir = 'Data';
export const OCR_MODEL_PACK_STORE_DIR = 'ocr-models';
export const OCR_MODEL_PACK_STORE_INDEX = `${OCR_MODEL_PACK_STORE_DIR}/index.json`;
export const OCR_MODEL_PACK_STORE_SCHEMA_VERSION = 1 as const;

export type OcrModelPackStorage = Pick<
  FileSystem,
  'createDir' | 'readFile' | 'writeFile' | 'removeFile' | 'removeDir'
>;

export interface OcrModelPackRecord {
  manifest: OcrModelManifest;
  manifestPath: string;
  modelPath: string;
}

export interface OcrModelPackIndex {
  format: 'babelleaf.ocr-model-index';
  schemaVersion: typeof OCR_MODEL_PACK_STORE_SCHEMA_VERSION;
  packs: OcrModelManifest[];
}

export class OcrModelPackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OcrModelPackError';
  }
}

const isArrayBuffer = (value: unknown): value is ArrayBuffer => value instanceof ArrayBuffer;

const asBytes = (value: ArrayBuffer | Uint8Array): Uint8Array =>
  value instanceof Uint8Array ? value : new Uint8Array(value);

const safePathPart = (value: string): string => {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_');
  return normalized || 'unknown';
};

const getPackDir = (manifest: Pick<OcrModelManifest, 'id' | 'version'>): string =>
  `${OCR_MODEL_PACK_STORE_DIR}/${safePathPart(manifest.id)}/${safePathPart(manifest.version)}`;

export const getOcrModelPackPaths = (
  manifest: Pick<OcrModelManifest, 'id' | 'version'>,
): Pick<OcrModelPackRecord, 'manifestPath' | 'modelPath'> => {
  const dir = getPackDir(manifest);
  return {
    manifestPath: `${dir}/manifest.json`,
    modelPath: `${dir}/model.bin`,
  };
};

const cloneManifest = (manifest: OcrModelManifest): OcrModelManifest => ({
  ...manifest,
  languages: [...manifest.languages],
  engineCompatibility: [...manifest.engineCompatibility],
});

const indexFromValue = (value: unknown): OcrModelPackIndex => {
  if (typeof value !== 'object' || value === null) {
    throw new OcrModelPackError('Invalid OCR model-pack index');
  }
  const raw = value as Record<string, unknown>;
  if (
    raw['format'] !== 'babelleaf.ocr-model-index' ||
    raw['schemaVersion'] !== OCR_MODEL_PACK_STORE_SCHEMA_VERSION ||
    !Array.isArray(raw['packs'])
  ) {
    throw new OcrModelPackError('Unsupported OCR model-pack index schema');
  }
  const packs = raw['packs'].map((manifest) => parseOcrModelManifest(manifest));
  const keys = new Set<string>();
  for (const manifest of packs) {
    const key = `${manifest.id}\u0000${manifest.version}`;
    if (keys.has(key)) throw new OcrModelPackError('Duplicate OCR model-pack entry');
    keys.add(key);
  }
  return {
    format: 'babelleaf.ocr-model-index',
    schemaVersion: OCR_MODEL_PACK_STORE_SCHEMA_VERSION,
    packs,
  };
};

const readIndex = async (fs: OcrModelPackStorage): Promise<OcrModelPackIndex> => {
  const raw = await safeLoadJSON<unknown>(
    fs,
    OCR_MODEL_PACK_STORE_INDEX,
    OCR_MODEL_PACK_STORE_BASE,
    null,
  );
  if (raw === null) {
    return {
      format: 'babelleaf.ocr-model-index',
      schemaVersion: OCR_MODEL_PACK_STORE_SCHEMA_VERSION,
      packs: [],
    };
  }
  return indexFromValue(raw);
};

const writeIndex = async (fs: OcrModelPackStorage, index: OcrModelPackIndex): Promise<void> => {
  await fs.createDir(OCR_MODEL_PACK_STORE_DIR, OCR_MODEL_PACK_STORE_BASE, true);
  await safeSaveJSON(fs, OCR_MODEL_PACK_STORE_INDEX, OCR_MODEL_PACK_STORE_BASE, index);
};

/** Compute a lowercase SHA-256 digest without introducing a native runtime. */
export const sha256Hex = async (bytes: ArrayBuffer | Uint8Array): Promise<string> => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new OcrModelPackError('Web Crypto SHA-256 is unavailable');
  const view = asBytes(bytes);
  const owned = view.slice().buffer as ArrayBuffer;
  const digest = await subtle.digest('SHA-256', owned);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const asArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

export interface InstallOcrModelPackInput {
  manifest: OcrModelManifest;
  modelBytes: ArrayBuffer | Uint8Array;
}

/**
 * Install a model only after validating size and checksum. The manifest is
 * written last, so an interrupted import cannot become an indexed pack.
 */
export const installOcrModelPack = async (
  fs: OcrModelPackStorage,
  input: InstallOcrModelPackInput,
): Promise<OcrModelPackRecord> => {
  const manifest = parseOcrModelManifest(input.manifest);
  const bytes = asBytes(input.modelBytes);
  if (bytes.byteLength !== manifest.sizeBytes) {
    throw new OcrModelPackError('OCR model byte size does not match its manifest');
  }
  const checksum = await sha256Hex(bytes);
  if (checksum.toLowerCase() !== manifest.checksumSha256.toLowerCase()) {
    throw new OcrModelPackError('OCR model checksum does not match its manifest');
  }
  const paths = getOcrModelPackPaths(manifest);
  const index = await readIndex(fs);
  const existing = index.packs.find(
    (candidate) => candidate.id === manifest.id && candidate.version === manifest.version,
  );
  if (existing) {
    if (
      existing.sizeBytes !== manifest.sizeBytes ||
      existing.checksumSha256.toLowerCase() !== manifest.checksumSha256.toLowerCase()
    ) {
      throw new OcrModelPackError(
        'An OCR model pack with this id and version has a different checksum',
      );
    }
    const existingRecord = { manifest: existing, ...paths };
    await readAndVerifyOcrModelBytes(fs, existingRecord);
    return { manifest: cloneManifest(existing), ...paths };
  }
  const nextPacks = index.packs.filter(
    (candidate) => !(candidate.id === manifest.id && candidate.version === manifest.version),
  );
  try {
    await fs.createDir(getPackDir(manifest), OCR_MODEL_PACK_STORE_BASE, true);
    await fs.writeFile(paths.modelPath, OCR_MODEL_PACK_STORE_BASE, asArrayBuffer(bytes));
    await fs.writeFile(
      paths.manifestPath,
      OCR_MODEL_PACK_STORE_BASE,
      serializeOcrModelManifest(manifest),
    );
    await writeIndex(fs, {
      format: 'babelleaf.ocr-model-index',
      schemaVersion: OCR_MODEL_PACK_STORE_SCHEMA_VERSION,
      packs: [...nextPacks, manifest].sort((left, right) =>
        `${left.id}:${left.version}`.localeCompare(`${right.id}:${right.version}`),
      ),
    });
  } catch (error) {
    await fs.removeDir(getPackDir(manifest), OCR_MODEL_PACK_STORE_BASE, true).catch(() => {});
    throw new OcrModelPackError(`Failed to install OCR model pack: ${String(error)}`);
  }
  return { manifest: cloneManifest(manifest), ...paths };
};

export const listOcrModelPacks = async (fs: OcrModelPackStorage): Promise<OcrModelManifest[]> =>
  (await readIndex(fs)).packs.map(cloneManifest);

export const loadOcrModelPack = async (
  fs: OcrModelPackStorage,
  id: string,
  version?: string,
): Promise<OcrModelPackRecord | null> => {
  const index = await readIndex(fs);
  const candidates = index.packs.filter(
    (manifest) => manifest.id === id && (version === undefined || manifest.version === version),
  );
  const manifest = candidates.sort((left, right) => right.version.localeCompare(left.version))[0];
  if (!manifest) return null;
  const paths = getOcrModelPackPaths(manifest);
  const rawManifest = await fs.readFile(paths.manifestPath, OCR_MODEL_PACK_STORE_BASE, 'text');
  if (typeof rawManifest !== 'string') throw new OcrModelPackError('OCR model manifest is binary');
  const persisted = parseOcrModelManifest(JSON.parse(rawManifest));
  if (
    persisted.id !== manifest.id ||
    persisted.version !== manifest.version ||
    persisted.checksumSha256.toLowerCase() !== manifest.checksumSha256.toLowerCase()
  ) {
    throw new OcrModelPackError('OCR model manifest identity mismatch');
  }
  return { manifest: cloneManifest(persisted), ...paths };
};

export const readAndVerifyOcrModelBytes = async (
  fs: OcrModelPackStorage,
  record: OcrModelPackRecord,
): Promise<ArrayBuffer> => {
  const raw = await fs.readFile(record.modelPath, OCR_MODEL_PACK_STORE_BASE, 'binary');
  if (typeof raw === 'string' || !isArrayBuffer(raw)) {
    throw new OcrModelPackError('OCR model bytes are not binary data');
  }
  const bytes = new Uint8Array(raw);
  if (bytes.byteLength !== record.manifest.sizeBytes) {
    throw new OcrModelPackError('Installed OCR model size changed');
  }
  const checksum = await sha256Hex(bytes);
  if (checksum.toLowerCase() !== record.manifest.checksumSha256.toLowerCase()) {
    throw new OcrModelPackError('Installed OCR model checksum changed');
  }
  return raw;
};

export const removeOcrModelPack = async (
  fs: OcrModelPackStorage,
  id: string,
  version?: string,
): Promise<boolean> => {
  const index = await readIndex(fs);
  const removed = index.packs.filter(
    (manifest) => manifest.id === id && (version === undefined || manifest.version === version),
  );
  if (removed.length === 0) return false;
  for (const manifest of removed) {
    await fs.removeDir(getPackDir(manifest), OCR_MODEL_PACK_STORE_BASE, true);
  }
  await writeIndex(fs, {
    format: 'babelleaf.ocr-model-index',
    schemaVersion: OCR_MODEL_PACK_STORE_SCHEMA_VERSION,
    packs: index.packs.filter(
      (manifest) =>
        !(manifest.id === id && (version === undefined || manifest.version === version)),
    ),
  });
  return true;
};
