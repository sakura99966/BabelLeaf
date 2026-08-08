import {
  parseComicWorkerDescriptor,
  type ComicWorkerEngine,
  type ComicWorkerJobRequest,
  type ComicWorkerPageInput,
  type ComicWorkerPageResult,
} from './comicWorkerProtocol';
import {
  assertOcrEngineGate,
  type OcrBenchmarkEvidence,
  type OcrEngineGateInput,
} from './ocrEngineGate';
import type { OcrModelManifest } from './ocrModels';
import {
  readAndVerifyOcrModelBytes,
  type OcrModelPackRecord,
  type OcrModelPackStorage,
} from './ocrModelPacks';

/** Adapter boundary for an optional local OCR implementation. */
export interface LocalOcrRuntime {
  descriptor: ComicWorkerEngine['descriptor'];
  model: OcrModelManifest;
  processPage: ComicWorkerEngine['processPage'];
  close?: () => Promise<void> | void;
}

export interface LocalOcrRuntimeFactory {
  create(model: OcrModelManifest, modelBytes: ArrayBuffer): Promise<LocalOcrRuntime>;
}

export interface GatedOcrRuntime {
  engine: ComicWorkerEngine;
  runtime: LocalOcrRuntime;
  gate: ReturnType<typeof assertOcrEngineGate>;
  model: OcrModelManifest;
}

export interface CreateGatedOcrRuntimeInput
  extends Omit<OcrEngineGateInput, 'descriptor' | 'model'> {
  runtime: LocalOcrRuntime;
  evidence?: OcrBenchmarkEvidence;
}

/**
 * Refuse to expose a runtime to the queue until the release gate passes. The
 * runtime remains local and replaceable; no model bytes are loaded here.
 */
export const createGatedOcrRuntime = (input: CreateGatedOcrRuntimeInput): GatedOcrRuntime => {
  const descriptor = parseComicWorkerDescriptor(input.runtime.descriptor);
  const gate = assertOcrEngineGate({
    descriptor,
    model: input.runtime.model,
    installedModelIds: input.installedModelIds,
    sourceLanguages: input.sourceLanguages,
    platform: input.platform,
    ...(input.evidence ? { evidence: input.evidence } : {}),
    ...(input.requiredCapabilities ? { requiredCapabilities: input.requiredCapabilities } : {}),
  });
  return {
    gate,
    model: input.runtime.model,
    runtime: input.runtime,
    engine: {
      descriptor,
      processPage: input.runtime.processPage,
    },
  };
};

export interface CreateInstalledGatedOcrRuntimeInput
  extends Omit<CreateGatedOcrRuntimeInput, 'runtime' | 'installedModelIds'> {
  factory: LocalOcrRuntimeFactory;
  storage: OcrModelPackStorage;
  modelPack: OcrModelPackRecord;
}

/** Verify persisted model bytes before constructing a runtime instance. */
export const createInstalledGatedOcrRuntime = async (
  input: CreateInstalledGatedOcrRuntimeInput,
): Promise<GatedOcrRuntime> => {
  const modelBytes = await readAndVerifyOcrModelBytes(input.storage, input.modelPack);
  const runtime = await input.factory.create(input.modelPack.manifest, modelBytes);
  try {
    if (
      runtime.model.id !== input.modelPack.manifest.id ||
      runtime.model.version !== input.modelPack.manifest.version ||
      runtime.model.checksumSha256.toLowerCase() !==
        input.modelPack.manifest.checksumSha256.toLowerCase()
    ) {
      throw new Error('OCR runtime model does not match the installed model pack');
    }
    return createGatedOcrRuntime({
      ...input,
      runtime,
      installedModelIds: new Set([input.modelPack.manifest.id]),
    });
  } catch (error) {
    await Promise.resolve(runtime.close?.()).catch(() => {});
    throw error;
  }
};

export type OcrRuntimePageProcessor = (
  page: ComicWorkerPageInput,
  request: ComicWorkerJobRequest,
  signal: AbortSignal,
) => Promise<ComicWorkerPageResult>;

/** Convert a gated engine into the queue's page-result callback. */
export const createOcrRuntimePageProcessor =
  (runtime: GatedOcrRuntime): OcrRuntimePageProcessor =>
  async (page, request, signal) => {
    if (signal.aborted) throw new Error('OCR runtime cancelled');
    const regions = await runtime.engine.processPage(page, request, {
      signal,
      reportProgress: () => {},
    });
    if (signal.aborted) throw new Error('OCR runtime cancelled');
    return {
      pageId: page.pageId,
      width: page.width,
      height: page.height,
      regions,
      status: 'completed',
    };
  };

export const closeOcrRuntime = async (runtime: GatedOcrRuntime): Promise<void> => {
  const close = runtime.runtime.close;
  if (close) await close();
};
