import {
  parseComicWorkerDescriptor,
  type ComicWorkerCapability,
  type ComicWorkerDescriptor,
} from './comicWorkerProtocol';
import type { OcrModelManifest } from './ocrModels';
import { parseOcrModelManifest } from './ocrModels';
import { TRANSLATION_PERFORMANCE_BUDGETS } from './formatMatrix';

/** Evidence required before a local OCR runtime can be selected for release use. */
export const OCR_ENGINE_GATE_SCHEMA_VERSION = 1 as const;
export const MAX_OCR_GATE_PLATFORMS = 16;
export const MAX_OCR_GATE_SAMPLES = 100_000;

export type OcrEngineGateCode =
  | 'ready'
  | 'missing-model'
  | 'engine-mismatch'
  | 'language-unsupported'
  | 'capability-missing'
  | 'license-unverified'
  | 'checksum-unverified'
  | 'benchmark-missing'
  | 'platform-unsupported'
  | 'resource-budget-exceeded';

export interface OcrBenchmarkEvidence {
  schemaVersion: typeof OCR_ENGINE_GATE_SCHEMA_VERSION;
  engine: string;
  engineVersion: string;
  modelId: string;
  modelVersion: string;
  languages: string[];
  platforms: string[];
  sampleCount: number;
  licenseVerified: boolean;
  checksumVerified: boolean;
  p95PageMs: number;
  peakMemoryMb: number;
  measuredAt: number;
}

export interface OcrEngineGateInput {
  descriptor: ComicWorkerDescriptor;
  model: OcrModelManifest;
  installedModelIds: ReadonlySet<string>;
  sourceLanguages: string[];
  platform: string;
  evidence?: OcrBenchmarkEvidence;
  requiredCapabilities?: ComicWorkerCapability[];
}

export interface OcrEngineGateResult {
  code: OcrEngineGateCode;
  ready: boolean;
  message: string;
  missingLanguages: string[];
  missingCapabilities: ComicWorkerCapability[];
  evidence?: OcrBenchmarkEvidence;
}

export class OcrEngineGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OcrEngineGateError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const requiredString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new OcrEngineGateError(`Invalid OCR gate field: ${field}`);
  }
  return value;
};

const finiteNumber = (value: unknown, field: string, minimum = 0): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) {
    throw new OcrEngineGateError(`Invalid OCR gate field: ${field}`);
  }
  return value;
};

const finiteInteger = (value: unknown, field: string, minimum = 0): number => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) {
    throw new OcrEngineGateError(`Invalid OCR gate field: ${field}`);
  }
  return value;
};

const requiredStringArray = (value: unknown, field: string, max: number): string[] => {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) {
    throw new OcrEngineGateError(`Invalid OCR gate field: ${field}`);
  }
  return value.map((item, index) => requiredString(item, `${field}[${index}]`));
};

export const parseOcrBenchmarkEvidence = (value: unknown): OcrBenchmarkEvidence => {
  if (!isRecord(value) || value['schemaVersion'] !== OCR_ENGINE_GATE_SCHEMA_VERSION) {
    throw new OcrEngineGateError('Unsupported OCR benchmark evidence schema');
  }
  const sampleCount = finiteInteger(value['sampleCount'], 'sampleCount', 1);
  if (sampleCount > MAX_OCR_GATE_SAMPLES) {
    throw new OcrEngineGateError('OCR benchmark sample count exceeds resource limits');
  }
  return {
    schemaVersion: OCR_ENGINE_GATE_SCHEMA_VERSION,
    engine: requiredString(value['engine'], 'engine'),
    engineVersion: requiredString(value['engineVersion'], 'engineVersion'),
    modelId: requiredString(value['modelId'], 'modelId'),
    modelVersion: requiredString(value['modelVersion'], 'modelVersion'),
    languages: requiredStringArray(value['languages'], 'languages', 16),
    platforms: requiredStringArray(value['platforms'], 'platforms', MAX_OCR_GATE_PLATFORMS),
    sampleCount,
    licenseVerified: value['licenseVerified'] === true,
    checksumVerified: value['checksumVerified'] === true,
    p95PageMs: finiteNumber(value['p95PageMs'], 'p95PageMs'),
    peakMemoryMb: finiteNumber(value['peakMemoryMb'], 'peakMemoryMb'),
    measuredAt: finiteInteger(value['measuredAt'], 'measuredAt'),
  };
};

export const serializeOcrBenchmarkEvidence = (evidence: OcrBenchmarkEvidence): string =>
  JSON.stringify(parseOcrBenchmarkEvidence(evidence), null, 2);

const normalized = (value: string): string => value.trim().toLowerCase();

/**
 * Enforce the production OCR gate without loading a model or making a network
 * request. A platform adapter must provide the actual local runtime separately.
 */
export const evaluateOcrEngineGate = (input: OcrEngineGateInput): OcrEngineGateResult => {
  const descriptor = parseComicWorkerDescriptor(input.descriptor);
  const model = parseOcrModelManifest(input.model);
  const requiredCapabilities = input.requiredCapabilities ?? ['ocr', 'text-layer'];
  const missingCapabilities = requiredCapabilities.filter(
    (capability) => !descriptor.capabilities.includes(capability),
  );
  const requestedLanguages = new Set(input.sourceLanguages.map(normalized));
  const modelLanguages = new Set(model.languages.map(normalized));
  const missingLanguages = [...requestedLanguages].filter(
    (language) => !modelLanguages.has(language),
  );
  const evidence = input.evidence ? parseOcrBenchmarkEvidence(input.evidence) : undefined;
  const result = (code: OcrEngineGateCode, message: string): OcrEngineGateResult => ({
    code,
    ready: code === 'ready',
    message,
    missingLanguages,
    missingCapabilities,
    ...(evidence ? { evidence } : {}),
  });

  if (!input.installedModelIds.has(model.id)) {
    return result('missing-model', 'Install the selected OCR model locally before processing.');
  }
  if (!model.engineCompatibility.includes(descriptor.engine)) {
    return result('engine-mismatch', 'The OCR model is not compatible with the selected engine.');
  }
  if (missingLanguages.length > 0) {
    return result(
      'language-unsupported',
      'The selected OCR model does not cover every source language.',
    );
  }
  if (missingCapabilities.length > 0) {
    return result('capability-missing', 'The selected OCR engine lacks a required capability.');
  }
  if (!evidence) {
    return result(
      'benchmark-missing',
      'The OCR engine and model have no release benchmark evidence.',
    );
  }
  if (
    evidence.engine !== descriptor.engine ||
    evidence.engineVersion !== descriptor.engineVersion ||
    evidence.modelId !== model.id ||
    evidence.modelVersion !== model.version
  ) {
    return result(
      'benchmark-missing',
      'OCR benchmark evidence does not match the selected engine or model.',
    );
  }
  if (!evidence.licenseVerified) {
    return result('license-unverified', 'The OCR engine or model license has not been verified.');
  }
  if (!evidence.checksumVerified) {
    return result('checksum-unverified', 'The installed OCR model checksum has not been verified.');
  }
  if (!evidence.platforms.some((platform) => normalized(platform) === normalized(input.platform))) {
    return result(
      'platform-unsupported',
      'The selected OCR engine has not been validated on this platform.',
    );
  }
  if (
    evidence.p95PageMs > TRANSLATION_PERFORMANCE_BUDGETS.ocrPageMs ||
    evidence.peakMemoryMb > TRANSLATION_PERFORMANCE_BUDGETS.ocrPeakMemoryMb
  ) {
    return result(
      'resource-budget-exceeded',
      'The OCR engine exceeds the approved resource budgets.',
    );
  }
  return result('ready', 'The local OCR engine and model passed the release gate.');
};

export const assertOcrEngineGate = (input: OcrEngineGateInput): OcrEngineGateResult => {
  const result = evaluateOcrEngineGate(input);
  if (!result.ready) throw new OcrEngineGateError(result.message);
  return result;
};
