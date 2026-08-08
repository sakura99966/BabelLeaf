import type { BaseDir, FileSystem } from '@/types/system';
import { safeLoadJSON, safeSaveJSON } from '@/services/persistence';
import {
  getOcrModelArtifactManifests,
  getOcrModelPrimaryArtifactId,
  parseOcrModelManifest,
  serializeOcrModelManifest,
  type OcrModelArtifactManifest,
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
  /** Primary artifact path kept for legacy runtime factories. */
  modelPath: string;
  artifactPaths: Record<string, string>;
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

export type OcrModelArtifactBytes = ArrayBuffer | Uint8Array;
export type OcrModelArtifactInput =
  | ReadonlyMap<string, OcrModelArtifactBytes>
  | Readonly<Record<string, OcrModelArtifactBytes>>;

const isArrayBuffer = (value: unknown): value is ArrayBuffer => value instanceof ArrayBuffer;

const asBytes = (value: OcrModelArtifactBytes): Uint8Array =>
  value instanceof Uint8Array ? value : new Uint8Array(value);

const asArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

const safePathPart = (value: string): string => {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_');
  return normalized || 'unknown';
};

const getPackDir = (manifest: Pick<OcrModelManifest, 'id' | 'version'>): string =>
  `${OCR_MODEL_PACK_STORE_DIR}/${safePathPart(manifest.id)}/${safePathPart(manifest.version)}`;

type OcrModelPackPathInput = Pick<OcrModelManifest, 'id' | 'version'> &
  Partial<Pick<OcrModelManifest, 'artifacts' | 'primaryArtifactId'>>;

const getPathArtifacts = (
  manifest: OcrModelPackPathInput,
): Array<Pick<OcrModelArtifactManifest, 'id' | 'fileName'>> =>
  manifest.artifacts?.map(({ id, fileName }) => ({ id, fileName })) ?? [
    { id: 'model', fileName: 'model.bin' },
  ];

export const getOcrModelPackPaths = (
  manifest: OcrModelPackPathInput,
): Pick<OcrModelPackRecord, 'manifestPath' | 'modelPath' | 'artifactPaths'> => {
  const dir = getPackDir(manifest);
  const artifactPaths = Object.fromEntries(
    getPathArtifacts(manifest).map((artifact) => [artifact.id, `${dir}/${artifact.fileName}`]),
  );
  const primaryArtifactId = manifest.primaryArtifactId ?? 'model';
  const modelPath = artifactPaths[primaryArtifactId];
  if (!modelPath) throw new OcrModelPackError('OCR primary artifact path is not declared');
  return {
    manifestPath: `${dir}/manifest.json`,
    modelPath,
    artifactPaths,
  };
};

const cloneManifest = (manifest: OcrModelManifest): OcrModelManifest => ({
  ...manifest,
  languages: [...manifest.languages],
  engineCompatibility: [...manifest.engineCompatibility],
  ...(manifest.artifacts
    ? { artifacts: manifest.artifacts.map((artifact) => ({ ...artifact })) }
    : {}),
});

const cloneRecord = (record: OcrModelPackRecord): OcrModelPackRecord => ({
  manifest: cloneManifest(record.manifest),
  manifestPath: record.manifestPath,
  modelPath: record.modelPath,
  artifactPaths: { ...record.artifactPaths },
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
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const owned = view.slice().buffer as ArrayBuffer;
  const digest = await subtle.digest('SHA-256', owned);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * Hash the declared artifact inventory, not the model bytes themselves. Each
 * artifact has its own SHA-256, so this keeps the overall check bounded even
 * for multi-gigabyte model packs while still detecting manifest drift.
 */
export const computeOcrModelPackChecksum = async (
  artifacts: readonly OcrModelArtifactManifest[],
): Promise<string> => {
  const canonical = [...artifacts]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(
      (artifact) =>
        `${artifact.id}\u0000${artifact.fileName}\u0000${artifact.sizeBytes}\u0000${artifact.checksumSha256.toLowerCase()}`,
    )
    .join('\u0001');
  return sha256Hex(new TextEncoder().encode(canonical));
};

const normalizeArtifactInput = (input: InstallOcrModelPackInput): Map<string, Uint8Array> => {
  if (input.artifacts instanceof Map) {
    return new Map([...input.artifacts.entries()].map(([id, bytes]) => [id, asBytes(bytes)]));
  }
  if (input.artifacts) {
    return new Map(Object.entries(input.artifacts).map(([id, bytes]) => [id, asBytes(bytes)]));
  }
  if (input.modelBytes !== undefined) return new Map([['model', asBytes(input.modelBytes)]]);
  return new Map();
};

const verifyDeclaredArtifacts = async (
  manifest: OcrModelManifest,
  input: InstallOcrModelPackInput,
): Promise<Map<string, ArrayBuffer>> => {
  const declarations = getOcrModelArtifactManifests(manifest);
  const inputArtifacts = normalizeArtifactInput(input);
  if (input.modelBytes !== undefined && manifest.artifacts && declarations.length === 1) {
    if (!input.artifacts) {
      inputArtifacts.clear();
      inputArtifacts.set(getOcrModelPrimaryArtifactId(manifest), asBytes(input.modelBytes));
    } else if (!inputArtifacts.has(getOcrModelPrimaryArtifactId(manifest))) {
      inputArtifacts.set(getOcrModelPrimaryArtifactId(manifest), asBytes(input.modelBytes));
    }
  }
  if (inputArtifacts.size !== declarations.length) {
    throw new OcrModelPackError('OCR model artifacts do not match the manifest');
  }
  const verified = new Map<string, ArrayBuffer>();
  for (const artifact of declarations) {
    const bytes = inputArtifacts.get(artifact.id);
    if (!bytes) throw new OcrModelPackError(`Missing OCR model artifact: ${artifact.id}`);
    if (bytes.byteLength !== artifact.sizeBytes) {
      throw new OcrModelPackError(`OCR model artifact size does not match: ${artifact.id}`);
    }
    const checksum = await sha256Hex(bytes);
    if (checksum.toLowerCase() !== artifact.checksumSha256.toLowerCase()) {
      throw new OcrModelPackError(`OCR model artifact checksum does not match: ${artifact.id}`);
    }
    verified.set(artifact.id, asArrayBuffer(bytes));
  }
  const totalSize = declarations.reduce((sum, artifact) => sum + artifact.sizeBytes, 0);
  if (totalSize !== manifest.sizeBytes) {
    throw new OcrModelPackError('OCR model byte size does not match its manifest');
  }
  if (manifest.artifacts) {
    const checksum = await computeOcrModelPackChecksum(declarations);
    if (checksum.toLowerCase() !== manifest.checksumSha256.toLowerCase()) {
      throw new OcrModelPackError('OCR model artifact inventory checksum does not match');
    }
  }
  return verified;
};

export interface InstallOcrModelPackInput {
  manifest: OcrModelManifest;
  /** Legacy single-file input; retained for schema-version 1 packs. */
  modelBytes?: OcrModelArtifactBytes;
  /** Schema-version 2 artifact bytes keyed by the manifest artifact id. */
  artifacts?: OcrModelArtifactInput;
}

/**
 * Install a model only after validating every artifact and the aggregate
 * inventory checksum. The manifest is written last, so an interrupted import
 * cannot become an indexed pack.
 */
export const installOcrModelPack = async (
  fs: OcrModelPackStorage,
  input: InstallOcrModelPackInput,
): Promise<OcrModelPackRecord> => {
  const manifest = parseOcrModelManifest(input.manifest);
  const verifiedArtifacts = await verifyDeclaredArtifacts(manifest, input);
  const paths = getOcrModelPackPaths(manifest);
  const index = await readIndex(fs);
  const existing = index.packs.find(
    (candidate) => candidate.id === manifest.id && candidate.version === manifest.version,
  );
  if (existing) {
    if (
      existing.schemaVersion !== manifest.schemaVersion ||
      existing.sizeBytes !== manifest.sizeBytes ||
      existing.checksumSha256.toLowerCase() !== manifest.checksumSha256.toLowerCase() ||
      serializeOcrModelManifest(existing) !== serializeOcrModelManifest(manifest)
    ) {
      throw new OcrModelPackError(
        'An OCR model pack with this id and version has a different checksum or artifact inventory',
      );
    }
    const existingRecord = { manifest: existing, ...getOcrModelPackPaths(existing) };
    await readAndVerifyOcrModelArtifacts(fs, existingRecord);
    return cloneRecord(existingRecord);
  }
  const nextPacks = index.packs.filter(
    (candidate) => !(candidate.id === manifest.id && candidate.version === manifest.version),
  );
  try {
    await fs.createDir(getPackDir(manifest), OCR_MODEL_PACK_STORE_BASE, true);
    for (const artifact of getOcrModelArtifactManifests(manifest)) {
      const bytes = verifiedArtifacts.get(artifact.id);
      if (!bytes) throw new OcrModelPackError(`Missing verified OCR artifact: ${artifact.id}`);
      await fs.writeFile(paths.artifactPaths[artifact.id]!, OCR_MODEL_PACK_STORE_BASE, bytes);
    }
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
    if (error instanceof OcrModelPackError) throw error;
    throw new OcrModelPackError(`Failed to install OCR model pack: ${String(error)}`);
  }
  return {
    manifest: cloneManifest(manifest),
    ...paths,
  };
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
    persisted.schemaVersion !== manifest.schemaVersion ||
    persisted.checksumSha256.toLowerCase() !== manifest.checksumSha256.toLowerCase() ||
    serializeOcrModelManifest(persisted) !== serializeOcrModelManifest(manifest)
  ) {
    throw new OcrModelPackError('OCR model manifest identity mismatch');
  }
  return { manifest: cloneManifest(persisted), ...getOcrModelPackPaths(persisted) };
};

const verifyReadArtifact = async (
  fs: OcrModelPackStorage,
  path: string,
  artifact: OcrModelArtifactManifest,
): Promise<ArrayBuffer> => {
  const raw = await fs.readFile(path, OCR_MODEL_PACK_STORE_BASE, 'binary');
  if (typeof raw === 'string' || !isArrayBuffer(raw)) {
    throw new OcrModelPackError(`OCR model artifact is not binary data: ${artifact.id}`);
  }
  const bytes = new Uint8Array(raw);
  if (bytes.byteLength !== artifact.sizeBytes) {
    throw new OcrModelPackError(`Installed OCR model artifact size changed: ${artifact.id}`);
  }
  const checksum = await sha256Hex(bytes);
  if (checksum.toLowerCase() !== artifact.checksumSha256.toLowerCase()) {
    throw new OcrModelPackError(`Installed OCR model artifact checksum changed: ${artifact.id}`);
  }
  return raw;
};

export const readAndVerifyOcrModelArtifacts = async (
  fs: OcrModelPackStorage,
  record: OcrModelPackRecord,
): Promise<ReadonlyMap<string, ArrayBuffer>> => {
  const declarations = getOcrModelArtifactManifests(record.manifest);
  const verified = new Map<string, ArrayBuffer>();
  for (const artifact of declarations) {
    const path = record.artifactPaths[artifact.id];
    if (!path) throw new OcrModelPackError(`OCR model artifact path is missing: ${artifact.id}`);
    verified.set(artifact.id, await verifyReadArtifact(fs, path, artifact));
  }
  const totalSize = declarations.reduce((sum, artifact) => sum + artifact.sizeBytes, 0);
  if (totalSize !== record.manifest.sizeBytes) {
    throw new OcrModelPackError('Installed OCR model size changed');
  }
  if (record.manifest.artifacts) {
    const checksum = await computeOcrModelPackChecksum(declarations);
    if (checksum.toLowerCase() !== record.manifest.checksumSha256.toLowerCase()) {
      throw new OcrModelPackError('Installed OCR model artifact inventory changed');
    }
  }
  return verified;
};

export const readAndVerifyOcrModelBytes = async (
  fs: OcrModelPackStorage,
  record: OcrModelPackRecord,
): Promise<ArrayBuffer> => {
  const artifacts = await readAndVerifyOcrModelArtifacts(fs, record);
  const primary = artifacts.get(getOcrModelPrimaryArtifactId(record.manifest));
  if (!primary) throw new OcrModelPackError('Installed OCR primary artifact is missing');
  return primary.slice(0);
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
