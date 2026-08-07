import {
  parseComicWorkerRequest,
  parseComicWorkerPageResult,
  type ComicWorkerEngine,
  type ComicWorkerPageInput,
  type ComicWorkerJobRequest,
} from './comicWorkerProtocol';
import {
  MAX_OCR_GATE_SAMPLES,
  OCR_ENGINE_GATE_SCHEMA_VERSION,
  type OcrBenchmarkEvidence,
} from './ocrEngineGate';
import type { OcrModelManifest } from './ocrModels';

export interface OcrBenchmarkSample {
  page: ComicWorkerPageInput;
  sourceLanguages: string[];
}

export interface OcrBenchmarkInput {
  engine: ComicWorkerEngine;
  model: OcrModelManifest;
  platform: string;
  samples: OcrBenchmarkSample[];
  licenseVerified: boolean;
  checksumVerified: boolean;
  /** Returns the current process/runtime memory in MiB. */
  readMemoryMb: () => number;
  now?: () => number;
  signal?: AbortSignal;
}

export class OcrBenchmarkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OcrBenchmarkError';
  }
}

const percentile95 = (values: number[]): number => {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) throw new OcrBenchmarkError('OCR benchmark has no samples');
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[index] ?? 0;
};

const finiteMemory = (value: number): number => {
  if (!Number.isFinite(value) || value < 0) {
    throw new OcrBenchmarkError('OCR benchmark memory sample is invalid');
  }
  return value;
};

const buildRequest = (sample: OcrBenchmarkSample, index: number): ComicWorkerJobRequest =>
  parseComicWorkerRequest({
    protocol: 'babelleaf.comic-worker',
    protocolVersion: 1,
    requestId: `benchmark:${index}:${sample.page.pageId}`,
    bookHash: 'benchmark-fixture',
    pages: [sample.page],
    sourceLangs: sample.sourceLanguages,
    options: { detect: true, ocr: true, verticalText: true },
  });

/**
 * Run a bounded local benchmark and emit evidence consumable by the release
 * gate. This function never downloads models or sends page data remotely.
 */
export const benchmarkOcrRuntime = async (
  input: OcrBenchmarkInput,
): Promise<OcrBenchmarkEvidence> => {
  if (!input.platform.trim()) throw new OcrBenchmarkError('OCR benchmark platform is required');
  if (input.samples.length === 0 || input.samples.length > MAX_OCR_GATE_SAMPLES) {
    throw new OcrBenchmarkError('OCR benchmark sample count exceeds resource limits');
  }
  const now = input.now ?? (() => performance.now());
  const latencies: number[] = [];
  let peakMemoryMb = 0;
  const languages = new Set<string>();
  for (const [index, sample] of input.samples.entries()) {
    if (input.signal?.aborted) throw new OcrBenchmarkError('OCR benchmark cancelled');
    for (const language of sample.sourceLanguages) {
      if (language.trim()) languages.add(language.trim());
    }
    const request = buildRequest(sample, index);
    const benchmarkPage = request.pages[0];
    if (!benchmarkPage) throw new OcrBenchmarkError('OCR benchmark page is missing');
    const startedAt = now();
    const regions = await input.engine.processPage(benchmarkPage, request, {
      signal: input.signal ?? new AbortController().signal,
      reportProgress: () => {},
    });
    const elapsed = now() - startedAt;
    if (!Number.isFinite(elapsed) || elapsed < 0) {
      throw new OcrBenchmarkError('OCR benchmark latency sample is invalid');
    }
    parseComicWorkerPageResult(
      {
        pageId: sample.page.pageId,
        width: sample.page.width,
        height: sample.page.height,
        regions,
        status: 'completed',
      },
      input.engine.descriptor,
    );
    latencies.push(elapsed);
    peakMemoryMb = Math.max(peakMemoryMb, finiteMemory(input.readMemoryMb()));
  }
  if (languages.size === 0) {
    throw new OcrBenchmarkError('OCR benchmark has no source languages');
  }
  const measuredAt = Date.now();
  return {
    schemaVersion: OCR_ENGINE_GATE_SCHEMA_VERSION,
    engine: input.engine.descriptor.engine,
    engineVersion: input.engine.descriptor.engineVersion,
    modelId: input.model.id,
    modelVersion: input.model.version,
    languages: [...languages].sort(),
    platforms: [input.platform.trim()],
    sampleCount: input.samples.length,
    licenseVerified: input.licenseVerified,
    checksumVerified: input.checksumVerified,
    p95PageMs: percentile95(latencies),
    peakMemoryMb,
    measuredAt,
  };
};
