import type { BaseDir, FileSystem } from '@/types/system';
import { safeLoadJSON, safeSaveJSON } from '@/services/persistence';
import { sha256Hex } from './ocrModelPacks';
import {
  assertTrustedInpaintModelManifest,
  serializeInpaintModelManifest,
  type InpaintModelArtifactManifest,
  type InpaintModelManifest,
} from './inpaintModels';

export const INPAINT_MODEL_STORE_BASE: BaseDir = 'Data';
export const INPAINT_MODEL_STORE_DIR = 'inpaint-models';
const INDEX_PATH = `${INPAINT_MODEL_STORE_DIR}/index.json`;

export type InpaintModelPackStorage = Pick<
  FileSystem,
  'createDir' | 'readFile' | 'writeFile' | 'removeDir'
>;

export interface InpaintModelPackRecord {
  manifest: InpaintModelManifest;
  manifestPath: string;
  modelPath: string;
  licensePath: string;
}

interface InpaintModelIndex {
  format: 'babelleaf.inpaint-model-index';
  schemaVersion: 1;
  packs: InpaintModelManifest[];
}

export class InpaintModelPackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InpaintModelPackError';
  }
}

const safePart = (value: string): string => value.replace(/[^a-zA-Z0-9._-]+/g, '_');
const packDir = (manifest: Pick<InpaintModelManifest, 'id' | 'version'>): string =>
  `${INPAINT_MODEL_STORE_DIR}/${safePart(manifest.id)}/${safePart(manifest.version)}`;

export const getInpaintModelPackPaths = (
  manifest: InpaintModelManifest,
): Omit<InpaintModelPackRecord, 'manifest'> => {
  const dir = packDir(manifest);
  const model = manifest.artifacts.find((artifact) => artifact.id === 'model')!;
  const license = manifest.artifacts.find((artifact) => artifact.id === 'license')!;
  return {
    manifestPath: `${dir}/manifest.json`,
    modelPath: `${dir}/${model.fileName}`,
    licensePath: `${dir}/${license.fileName}`,
  };
};

const cloneManifest = (manifest: InpaintModelManifest): InpaintModelManifest => ({
  ...manifest,
  artifacts: manifest.artifacts.map((artifact) => ({ ...artifact })) as [
    InpaintModelArtifactManifest,
    InpaintModelArtifactManifest,
  ],
});

const emptyIndex = (): InpaintModelIndex => ({
  format: 'babelleaf.inpaint-model-index',
  schemaVersion: 1,
  packs: [],
});

const readIndex = async (storage: InpaintModelPackStorage): Promise<InpaintModelIndex> => {
  const value = await safeLoadJSON<unknown>(storage, INDEX_PATH, INPAINT_MODEL_STORE_BASE, null);
  if (value === null) return emptyIndex();
  if (typeof value !== 'object' || value === null) {
    throw new InpaintModelPackError('Invalid inpainting model index');
  }
  const raw = value as Record<string, unknown>;
  if (
    raw['format'] !== 'babelleaf.inpaint-model-index' ||
    raw['schemaVersion'] !== 1 ||
    !Array.isArray(raw['packs'])
  ) {
    throw new InpaintModelPackError('Unsupported inpainting model index');
  }
  const packs = raw['packs'].map(assertTrustedInpaintModelManifest);
  if (new Set(packs.map((pack) => `${pack.id}\0${pack.version}`)).size !== packs.length) {
    throw new InpaintModelPackError('Duplicate inpainting model index entry');
  }
  return { format: 'babelleaf.inpaint-model-index', schemaVersion: 1, packs };
};

const writeIndex = async (
  storage: InpaintModelPackStorage,
  index: InpaintModelIndex,
): Promise<void> => {
  await storage.createDir(INPAINT_MODEL_STORE_DIR, INPAINT_MODEL_STORE_BASE, true);
  await safeSaveJSON(storage, INDEX_PATH, INPAINT_MODEL_STORE_BASE, index);
};

const ownedBuffer = (value: ArrayBuffer | Uint8Array): ArrayBuffer => {
  if (value instanceof ArrayBuffer) return value;
  if (value.byteOffset === 0 && value.byteLength === value.buffer.byteLength) {
    return value.buffer as ArrayBuffer;
  }
  return value.slice().buffer as ArrayBuffer;
};

const verifyArtifact = async (
  artifact: InpaintModelArtifactManifest,
  value: ArrayBuffer | Uint8Array | undefined,
): Promise<ArrayBuffer> => {
  if (!value) throw new InpaintModelPackError(`Missing inpainting artifact: ${artifact.id}`);
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  if (bytes.byteLength !== artifact.sizeBytes) {
    throw new InpaintModelPackError(`Inpainting artifact size mismatch: ${artifact.id}`);
  }
  if ((await sha256Hex(bytes)) !== artifact.checksumSha256) {
    throw new InpaintModelPackError(`Inpainting artifact checksum mismatch: ${artifact.id}`);
  }
  return ownedBuffer(bytes);
};

export interface InstallInpaintModelPackInput {
  manifest: InpaintModelManifest;
  artifacts: Readonly<Record<'model' | 'license', ArrayBuffer | Uint8Array>>;
}

export const installInpaintModelPack = async (
  storage: InpaintModelPackStorage,
  input: InstallInpaintModelPackInput,
): Promise<InpaintModelPackRecord> => {
  const manifest = assertTrustedInpaintModelManifest(input.manifest);
  const modelArtifact = manifest.artifacts.find((artifact) => artifact.id === 'model')!;
  const licenseArtifact = manifest.artifacts.find((artifact) => artifact.id === 'license')!;
  const model = await verifyArtifact(modelArtifact, input.artifacts.model);
  const license = await verifyArtifact(licenseArtifact, input.artifacts.license);
  const paths = getInpaintModelPackPaths(manifest);
  const index = await readIndex(storage);
  const existing = index.packs.find(
    (pack) => pack.id === manifest.id && pack.version === manifest.version,
  );
  if (existing) {
    const record = { manifest: cloneManifest(existing), ...getInpaintModelPackPaths(existing) };
    await readAndVerifyInpaintModelPack(storage, record);
    return record;
  }
  try {
    await storage.createDir(packDir(manifest), INPAINT_MODEL_STORE_BASE, true);
    await storage.writeFile(paths.modelPath, INPAINT_MODEL_STORE_BASE, model);
    await storage.writeFile(paths.licensePath, INPAINT_MODEL_STORE_BASE, license);
    await storage.writeFile(
      paths.manifestPath,
      INPAINT_MODEL_STORE_BASE,
      serializeInpaintModelManifest(manifest),
    );
    await writeIndex(storage, {
      format: 'babelleaf.inpaint-model-index',
      schemaVersion: 1,
      packs: [...index.packs, manifest],
    });
  } catch (error) {
    await storage.removeDir(packDir(manifest), INPAINT_MODEL_STORE_BASE, true).catch(() => {});
    throw error instanceof InpaintModelPackError
      ? error
      : new InpaintModelPackError(`Failed to install inpainting model: ${String(error)}`);
  }
  return { manifest: cloneManifest(manifest), ...paths };
};

export const listInpaintModelPacks = async (
  storage: InpaintModelPackStorage,
): Promise<InpaintModelManifest[]> => (await readIndex(storage)).packs.map(cloneManifest);

export const loadInpaintModelPack = async (
  storage: InpaintModelPackStorage,
): Promise<InpaintModelPackRecord | null> => {
  const manifest = (await readIndex(storage)).packs[0];
  if (!manifest) return null;
  const paths = getInpaintModelPackPaths(manifest);
  const raw = await storage.readFile(paths.manifestPath, INPAINT_MODEL_STORE_BASE, 'text');
  if (typeof raw !== 'string') throw new InpaintModelPackError('Inpainting manifest is binary');
  const persisted = assertTrustedInpaintModelManifest(JSON.parse(raw));
  if (serializeInpaintModelManifest(persisted) !== serializeInpaintModelManifest(manifest)) {
    throw new InpaintModelPackError('Inpainting manifest identity changed');
  }
  return { manifest: cloneManifest(persisted), ...paths };
};

const readArtifact = async (
  storage: InpaintModelPackStorage,
  path: string,
  artifact: InpaintModelArtifactManifest,
): Promise<ArrayBuffer> => {
  const value = await storage.readFile(path, INPAINT_MODEL_STORE_BASE, 'binary');
  if (typeof value === 'string') {
    throw new InpaintModelPackError(`Inpainting artifact is text: ${artifact.id}`);
  }
  return verifyArtifact(artifact, value);
};

export const readAndVerifyInpaintModelPack = async (
  storage: InpaintModelPackStorage,
  record: InpaintModelPackRecord,
): Promise<{ model: ArrayBuffer; license: ArrayBuffer }> => {
  const manifest = assertTrustedInpaintModelManifest(record.manifest);
  const modelArtifact = manifest.artifacts.find((artifact) => artifact.id === 'model')!;
  const licenseArtifact = manifest.artifacts.find((artifact) => artifact.id === 'license')!;
  return {
    model: await readArtifact(storage, record.modelPath, modelArtifact),
    license: await readArtifact(storage, record.licensePath, licenseArtifact),
  };
};

export const removeInpaintModelPack = async (
  storage: InpaintModelPackStorage,
): Promise<boolean> => {
  const index = await readIndex(storage);
  if (index.packs.length === 0) return false;
  for (const manifest of index.packs) {
    await storage.removeDir(packDir(manifest), INPAINT_MODEL_STORE_BASE, true);
  }
  await writeIndex(storage, emptyIndex());
  return true;
};
