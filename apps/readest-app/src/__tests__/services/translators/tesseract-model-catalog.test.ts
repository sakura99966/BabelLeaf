import { describe, expect, test } from 'vitest';
import {
  COMIC_WORKER_PROTOCOL,
  COMIC_WORKER_PROTOCOL_VERSION,
  TESSERACT_TRUSTED_MODELS,
  TESSERACT_WASM_ENGINE,
  TESSERACT_WASM_ENGINE_VERSION,
  createTrustedTesseractBenchmarkEvidence,
  evaluateOcrEngineGate,
  type ComicWorkerDescriptor,
  type OcrModelManifest,
} from '@/services/translators';

const manifestFor = (entry: (typeof TESSERACT_TRUSTED_MODELS)[number]): OcrModelManifest => ({
  format: 'babelleaf.ocr-model',
  schemaVersion: 2,
  id: entry.id,
  version: entry.version,
  runtime: 'wasm',
  languages: [...entry.languages],
  license: 'Apache-2.0',
  checksumSha256: entry.packChecksumSha256,
  sizeBytes: entry.modelSizeBytes + entry.licenseSizeBytes,
  source: 'local-import',
  engineCompatibility: [TESSERACT_WASM_ENGINE],
  cpuFallback: true,
  artifacts: [
    {
      id: 'traineddata',
      fileName: entry.fileName,
      sizeBytes: entry.modelSizeBytes,
      checksumSha256: entry.modelSha256,
    },
    {
      id: 'license',
      fileName: 'LICENSE.txt',
      sizeBytes: entry.licenseSizeBytes,
      checksumSha256: entry.licenseSha256,
    },
  ],
  primaryArtifactId: 'traineddata',
});

describe('trusted Tesseract model catalog', () => {
  test('provides release-gate evidence only for every exact pinned model pack', () => {
    expect(TESSERACT_TRUSTED_MODELS.map((entry) => entry.id)).toEqual([
      'tessdata-fast-eng',
      'tessdata-fast-chi-sim',
      'tessdata-fast-jpn',
      'tessdata-fast-jpn-vertical',
    ]);
    for (const entry of TESSERACT_TRUSTED_MODELS) {
      const model = manifestFor(entry);
      const evidence = createTrustedTesseractBenchmarkEvidence(model, 'win32-x64');
      expect(evidence).toMatchObject({
        engine: TESSERACT_WASM_ENGINE,
        engineVersion: TESSERACT_WASM_ENGINE_VERSION,
        modelId: model.id,
        modelVersion: model.version,
        languages: model.languages,
        platforms: ['win32-x64'],
        licenseVerified: true,
        checksumVerified: true,
      });
      const descriptor: ComicWorkerDescriptor = {
        protocol: COMIC_WORKER_PROTOCOL,
        protocolVersion: COMIC_WORKER_PROTOCOL_VERSION,
        engine: TESSERACT_WASM_ENGINE,
        engineVersion: TESSERACT_WASM_ENGINE_VERSION,
        capabilities: ['detect', 'ocr', 'text-layer', 'vertical-text', 'cpu-fallback'],
        languages: [...model.languages],
        maxWorkers: 1,
        modelId: model.id,
      };
      expect(
        evaluateOcrEngineGate({
          descriptor,
          model,
          installedModelIds: new Set([model.id]),
          sourceLanguages: model.languages,
          platform: 'win32-x64',
          evidence: evidence!,
        }),
      ).toMatchObject({ ready: true, code: 'ready' });
    }
  });

  test('rejects altered model identity, model checksum, license, and unsupported platforms', () => {
    const model = manifestFor(TESSERACT_TRUSTED_MODELS[0]!);
    expect(
      createTrustedTesseractBenchmarkEvidence(
        {
          ...model,
          artifacts: model.artifacts!.map((artifact, index) =>
            index === 0 ? { ...artifact, checksumSha256: '0'.repeat(64) } : artifact,
          ),
        },
        'win32-x64',
      ),
    ).toBeNull();
    expect(
      createTrustedTesseractBenchmarkEvidence({ ...model, license: 'Unknown' }, 'win32-x64'),
    ).toBeNull();
    expect(
      createTrustedTesseractBenchmarkEvidence({ ...model, id: 'renamed-model' }, 'win32-x64'),
    ).toBeNull();
    expect(createTrustedTesseractBenchmarkEvidence(model, 'darwin-arm64')).toBeNull();
  });
});
