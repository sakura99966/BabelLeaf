/** Strict local-only manifest for the approved comic inpainting model. */
export const INPAINT_MODEL_MANIFEST_FORMAT = 'babelleaf.inpaint-model' as const;
export const INPAINT_MODEL_MANIFEST_SCHEMA_VERSION = 1 as const;
export const INPAINT_MODEL_ENGINE = 'lama-opencv-512' as const;
export const INPAINT_MODEL_RUNTIME = 'onnxruntime-web' as const;

export interface InpaintModelArtifactManifest {
  id: 'model' | 'license';
  fileName: string;
  sizeBytes: number;
  checksumSha256: string;
}

export interface InpaintModelManifest {
  format: typeof INPAINT_MODEL_MANIFEST_FORMAT;
  schemaVersion: typeof INPAINT_MODEL_MANIFEST_SCHEMA_VERSION;
  id: string;
  version: string;
  runtime: typeof INPAINT_MODEL_RUNTIME;
  engine: typeof INPAINT_MODEL_ENGINE;
  license: string;
  source: 'local-import';
  sourceUrl: string;
  sourceRevision: string;
  inputSize: 512;
  artifacts: [InpaintModelArtifactManifest, InpaintModelArtifactManifest];
}

export class InpaintModelManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InpaintModelManifestError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new InpaintModelManifestError(`Invalid inpainting model field: ${field}`);
  }
  return value;
};

const requiredChecksum = (value: unknown, field: string): string => {
  const checksum = requiredString(value, field).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(checksum)) {
    throw new InpaintModelManifestError(`Invalid inpainting model checksum: ${field}`);
  }
  return checksum;
};

const requiredSize = (value: unknown, field: string): number => {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > 1024 * 1024 * 1024
  ) {
    throw new InpaintModelManifestError(`Invalid inpainting model size: ${field}`);
  }
  return value;
};

const requiredFileName = (value: unknown, field: string): string => {
  const fileName = requiredString(value, field);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(fileName)) {
    throw new InpaintModelManifestError(`Invalid inpainting model file name: ${field}`);
  }
  return fileName;
};

const parseArtifact = (value: unknown, index: number): InpaintModelArtifactManifest => {
  if (!isRecord(value)) {
    throw new InpaintModelManifestError(`Invalid inpainting artifact: ${index}`);
  }
  const id = value['id'];
  if (id !== 'model' && id !== 'license') {
    throw new InpaintModelManifestError(`Invalid inpainting artifact id: ${index}`);
  }
  return {
    id,
    fileName: requiredFileName(value['fileName'], `artifacts[${index}].fileName`),
    sizeBytes: requiredSize(value['sizeBytes'], `artifacts[${index}].sizeBytes`),
    checksumSha256: requiredChecksum(value['checksumSha256'], `artifacts[${index}].checksumSha256`),
  };
};

export const parseInpaintModelManifest = (value: unknown): InpaintModelManifest => {
  if (!isRecord(value)) throw new InpaintModelManifestError('Invalid inpainting model manifest');
  if (
    value['format'] !== INPAINT_MODEL_MANIFEST_FORMAT ||
    value['schemaVersion'] !== INPAINT_MODEL_MANIFEST_SCHEMA_VERSION ||
    value['runtime'] !== INPAINT_MODEL_RUNTIME ||
    value['engine'] !== INPAINT_MODEL_ENGINE ||
    value['source'] !== 'local-import' ||
    value['inputSize'] !== 512
  ) {
    throw new InpaintModelManifestError('Unsupported inpainting model manifest schema');
  }
  if (!Array.isArray(value['artifacts']) || value['artifacts'].length !== 2) {
    throw new InpaintModelManifestError('Inpainting model requires model and license artifacts');
  }
  const artifacts = value['artifacts'].map(parseArtifact);
  const ids = new Set(artifacts.map((artifact) => artifact.id));
  const names = new Set(artifacts.map((artifact) => artifact.fileName.toLowerCase()));
  if (ids.size !== 2 || !ids.has('model') || !ids.has('license') || names.size !== 2) {
    throw new InpaintModelManifestError('Inpainting model artifact inventory is invalid');
  }
  return {
    format: INPAINT_MODEL_MANIFEST_FORMAT,
    schemaVersion: INPAINT_MODEL_MANIFEST_SCHEMA_VERSION,
    id: requiredString(value['id'], 'id'),
    version: requiredString(value['version'], 'version'),
    runtime: INPAINT_MODEL_RUNTIME,
    engine: INPAINT_MODEL_ENGINE,
    license: requiredString(value['license'], 'license'),
    source: 'local-import',
    sourceUrl: requiredString(value['sourceUrl'], 'sourceUrl'),
    sourceRevision: requiredString(value['sourceRevision'], 'sourceRevision'),
    inputSize: 512,
    artifacts: artifacts as [InpaintModelArtifactManifest, InpaintModelArtifactManifest],
  };
};

export const TRUSTED_OPENCV_LAMA_MANIFEST: InpaintModelManifest = {
  format: INPAINT_MODEL_MANIFEST_FORMAT,
  schemaVersion: INPAINT_MODEL_MANIFEST_SCHEMA_VERSION,
  id: 'opencv-inpainting-lama',
  version: '2025jan',
  runtime: INPAINT_MODEL_RUNTIME,
  engine: INPAINT_MODEL_ENGINE,
  license: 'Apache-2.0',
  source: 'local-import',
  sourceUrl: 'https://huggingface.co/opencv/inpainting_lama',
  sourceRevision: 'aee6d22f0a13e5e35af1c9a1c3afd62841fc6f3f',
  inputSize: 512,
  artifacts: [
    {
      id: 'model',
      fileName: 'inpainting_lama_2025jan.onnx',
      sizeBytes: 92_591_623,
      checksumSha256: '7df918ac3921d3daf0aae1d219776cf0dc4e4935f035af81841b40adcf74fdf2',
    },
    {
      id: 'license',
      fileName: 'LICENSE.txt',
      sizeBytes: 11_347,
      checksumSha256: '0d02d0f518d1b068f383b33e5ee100b7e3609e5022b666f827a64135e9ad7a89',
    },
  ],
};

const canonicalManifest = (manifest: InpaintModelManifest): string =>
  JSON.stringify(parseInpaintModelManifest(manifest));

export const isTrustedInpaintModelManifest = (value: unknown): value is InpaintModelManifest => {
  try {
    return (
      canonicalManifest(parseInpaintModelManifest(value)) ===
      canonicalManifest(TRUSTED_OPENCV_LAMA_MANIFEST)
    );
  } catch {
    return false;
  }
};

export const assertTrustedInpaintModelManifest = (value: unknown): InpaintModelManifest => {
  const parsed = parseInpaintModelManifest(value);
  if (!isTrustedInpaintModelManifest(parsed)) {
    throw new InpaintModelManifestError(
      'The inpainting model identity, license, revision, size, or checksum is not approved',
    );
  }
  return parsed;
};

export const serializeInpaintModelManifest = (manifest: InpaintModelManifest): string =>
  JSON.stringify(parseInpaintModelManifest(manifest), null, 2);
