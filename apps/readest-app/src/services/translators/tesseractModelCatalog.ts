import {
  getOcrModelArtifactManifests,
  getOcrModelPrimaryArtifactId,
  parseOcrModelManifest,
  type OcrModelManifest,
} from './ocrModels';
import { OCR_ENGINE_GATE_SCHEMA_VERSION, type OcrBenchmarkEvidence } from './ocrEngineGate';
import { TESSERACT_WASM_ENGINE, TESSERACT_WASM_ENGINE_VERSION } from './tesseractOcrRuntime';

const LICENSE_SIZE_BYTES = 11_358;
const LICENSE_SHA256 = 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30';
const MEASURED_AT = 1_786_600_192_869;
const VERIFIED_PLATFORM = 'win32-x64';

export interface TrustedTesseractModel {
  id: string;
  version: '4.1.0';
  fileName: string;
  languages: readonly string[];
  modelSizeBytes: number;
  modelSha256: string;
  licenseSizeBytes: typeof LICENSE_SIZE_BYTES;
  licenseSha256: typeof LICENSE_SHA256;
  packChecksumSha256: string;
  characterAccuracy: number;
  p95PageMs: number;
  peakMemoryMb: number;
}

/**
 * Exact Apache-2.0 tessdata_fast 4.1.0 files verified on Windows x64.
 * Entries are usable as release evidence only when every manifest field and
 * artifact hash matches. No model bytes are bundled or downloaded here.
 */
export const TESSERACT_TRUSTED_MODELS = [
  {
    id: 'tessdata-fast-eng',
    version: '4.1.0',
    fileName: 'eng.traineddata',
    languages: ['en'],
    modelSizeBytes: 4_113_088,
    modelSha256: '7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2',
    licenseSizeBytes: LICENSE_SIZE_BYTES,
    licenseSha256: LICENSE_SHA256,
    packChecksumSha256: 'a46868f12500a90b52750e64fcc61eecc204aaefc636855c25e79fcf3cd379c3',
    characterAccuracy: 1,
    p95PageMs: 139.93,
    peakMemoryMb: 171.26,
  },
  {
    id: 'tessdata-fast-chi-sim',
    version: '4.1.0',
    fileName: 'chi_sim.traineddata',
    languages: ['zh-CN'],
    modelSizeBytes: 2_469_156,
    modelSha256: 'a5fcb6f0db1e1d6d8522f39db4e848f05984669172e584e8d76b6b3141e1f730',
    licenseSizeBytes: LICENSE_SIZE_BYTES,
    licenseSha256: LICENSE_SHA256,
    packChecksumSha256: 'c91c522869fb7fc1376d56843328b11bec3c481cb29827c5c35db9432c815b0d',
    characterAccuracy: 1,
    p95PageMs: 163.52,
    peakMemoryMb: 181.93,
  },
  {
    id: 'tessdata-fast-jpn',
    version: '4.1.0',
    fileName: 'jpn.traineddata',
    languages: ['ja'],
    modelSizeBytes: 2_471_260,
    modelSha256: '1f5de9236d2e85f5fdf4b3c500f2d4926f8d9449f28f5394472d9e8d83b91b4d',
    licenseSizeBytes: LICENSE_SIZE_BYTES,
    licenseSha256: LICENSE_SHA256,
    packChecksumSha256: '6f03204cd785f5e7758bc9b069551ca4f50bcbfd966eb992ddfa6245658db98f',
    characterAccuracy: 1,
    p95PageMs: 148.67,
    peakMemoryMb: 201.05,
  },
  {
    id: 'tessdata-fast-jpn-vertical',
    version: '4.1.0',
    fileName: 'jpn_vert.traineddata',
    languages: ['ja-vertical'],
    modelSizeBytes: 3_037_480,
    modelSha256: 'bf1e2640954691797e2dc14f38533e601b59ee37958698ae0f0b81dc6f09c71b',
    licenseSizeBytes: LICENSE_SIZE_BYTES,
    licenseSha256: LICENSE_SHA256,
    packChecksumSha256: '715ea828d7ce4844fd73866d4384ef6e4328e08c9669391e94121d1f832a9627',
    characterAccuracy: 1,
    p95PageMs: 153.12,
    peakMemoryMb: 225.07,
  },
] as const satisfies readonly TrustedTesseractModel[];

const sameStrings = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const matchesTrustedModel = (model: OcrModelManifest, trusted: TrustedTesseractModel): boolean => {
  const artifacts = getOcrModelArtifactManifests(model);
  const traineddata = artifacts.find((artifact) => artifact.id === 'traineddata');
  const license = artifacts.find((artifact) => artifact.id === 'license');
  return (
    model.schemaVersion === 2 &&
    model.id === trusted.id &&
    model.version === trusted.version &&
    model.runtime === 'wasm' &&
    model.license === 'Apache-2.0' &&
    model.source === 'local-import' &&
    model.cpuFallback &&
    model.engineCompatibility.includes(TESSERACT_WASM_ENGINE) &&
    model.checksumSha256 === trusted.packChecksumSha256 &&
    model.sizeBytes === trusted.modelSizeBytes + trusted.licenseSizeBytes &&
    sameStrings(model.languages, trusted.languages) &&
    getOcrModelPrimaryArtifactId(model) === 'traineddata' &&
    artifacts.length === 2 &&
    traineddata?.fileName === trusted.fileName &&
    traineddata.sizeBytes === trusted.modelSizeBytes &&
    traineddata.checksumSha256 === trusted.modelSha256 &&
    license?.fileName === 'LICENSE.txt' &&
    license.sizeBytes === trusted.licenseSizeBytes &&
    license.checksumSha256 === trusted.licenseSha256
  );
};

export const findTrustedTesseractModel = (
  modelValue: OcrModelManifest,
): TrustedTesseractModel | null => {
  const model = parseOcrModelManifest(modelValue);
  return (
    TESSERACT_TRUSTED_MODELS.find((candidate) => matchesTrustedModel(model, candidate)) ?? null
  );
};

/** Return immutable release evidence only for an exact catalog match. */
export const createTrustedTesseractBenchmarkEvidence = (
  modelValue: OcrModelManifest,
  platform: string,
): OcrBenchmarkEvidence | null => {
  if (platform.trim().toLowerCase() !== VERIFIED_PLATFORM) return null;
  const model = parseOcrModelManifest(modelValue);
  const trusted = findTrustedTesseractModel(model);
  if (!trusted) return null;
  return {
    schemaVersion: OCR_ENGINE_GATE_SCHEMA_VERSION,
    engine: TESSERACT_WASM_ENGINE,
    engineVersion: TESSERACT_WASM_ENGINE_VERSION,
    modelId: model.id,
    modelVersion: model.version,
    languages: [...model.languages],
    platforms: [VERIFIED_PLATFORM],
    sampleCount: 1,
    licenseVerified: true,
    checksumVerified: true,
    p95PageMs: trusted.p95PageMs,
    peakMemoryMb: trusted.peakMemoryMb,
    measuredAt: MEASURED_AT,
  };
};
