import {
  parseComicWorkerDescriptor,
  parseComicWorkerPageResult,
  type ComicTextRegion,
  type ComicWorkerDescriptor,
  type ComicWorkerEngineContext,
  type ComicWorkerJobRequest,
  type ComicWorkerPageInput,
} from './comicWorkerProtocol';
import type { LocalOcrRuntimeFactory, OcrModelRuntimeArtifacts } from './ocrRuntime';
import {
  getOcrModelArtifactManifests,
  parseOcrModelManifest,
  type OcrModelManifest,
} from './ocrModels';

/**
 * Local page bytes are supplied by a platform adapter. The source must never
 * resolve a remote URL or upload the page; access policy belongs to the caller.
 */
export interface OcrPageBytesSource {
  read(page: ComicWorkerPageInput, signal: AbortSignal): Promise<ArrayBuffer | Uint8Array>;
}

/**
 * This intentionally does not import an ONNX package. ONNX Runtime Web,
 * Node.js, React Native, or a native Tauri bridge can implement this narrow
 * session contract without making the shared reader depend on one runtime.
 */
export interface OnnxOcrInferenceInput {
  page: ComicWorkerPageInput;
  request: ComicWorkerJobRequest;
  imageBytes: ArrayBuffer;
}

export interface OnnxOcrSession {
  run(input: OnnxOcrInferenceInput, context: ComicWorkerEngineContext): Promise<unknown>;
  close?: () => Promise<void> | void;
}

export interface OnnxOcrAdapterDefinition {
  descriptor: ComicWorkerDescriptor;
  createSession: (
    model: OcrModelManifest,
    modelBytes: ArrayBuffer,
    artifacts?: OcrModelRuntimeArtifacts,
  ) => Promise<OnnxOcrSession>;
  decode: (
    output: unknown,
    page: ComicWorkerPageInput,
    request: ComicWorkerJobRequest,
  ) => ComicTextRegion[];
}

export interface CreateOnnxOcrRuntimeFactoryInput {
  adapter: OnnxOcrAdapterDefinition;
  pageSource: OcrPageBytesSource;
}

export class OnnxOcrRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OnnxOcrRuntimeError';
  }
}

const copyArrayBuffer = (value: ArrayBuffer | Uint8Array): ArrayBuffer => {
  if (value instanceof ArrayBuffer) return value.slice(0);
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
};

const assertLocalPageReference = (localRef: string): void => {
  if (/^(?:https?|wss?|data):/i.test(localRef) || localRef.startsWith('//')) {
    throw new OnnxOcrRuntimeError('OCR page references must be local application resources');
  }
};

const assertModelCompatibility = (
  descriptor: ComicWorkerDescriptor,
  model: OcrModelManifest,
): void => {
  if (model.runtime !== 'onnx') {
    throw new OnnxOcrRuntimeError('The selected OCR model does not use the ONNX runtime');
  }
  if (!model.engineCompatibility.includes(descriptor.engine)) {
    throw new OnnxOcrRuntimeError('The selected OCR model is incompatible with the ONNX adapter');
  }
  if (descriptor.modelId && descriptor.modelId !== model.id) {
    throw new OnnxOcrRuntimeError('The ONNX adapter descriptor does not match the model pack');
  }
};

/**
 * Build a LocalOcrRuntimeFactory for an ONNX-backed candidate. Construction
 * only creates an inference session after the model pack has already been
 * checksum-verified by `createInstalledGatedOcrRuntime`; the release gate is
 * still responsible for deciding whether the returned runtime is usable.
 */
export const createOnnxOcrRuntimeFactory = (
  input: CreateOnnxOcrRuntimeFactoryInput,
): LocalOcrRuntimeFactory => {
  const descriptor = parseComicWorkerDescriptor(input.adapter.descriptor);
  return {
    create: async (modelValue, modelBytes, artifactValues) => {
      const model = parseOcrModelManifest(modelValue);
      assertModelCompatibility(descriptor, model);
      if (modelBytes.byteLength === 0) {
        throw new OnnxOcrRuntimeError('The ONNX model pack is empty');
      }
      if (model.artifacts && !artifactValues) {
        throw new OnnxOcrRuntimeError('The multi-file ONNX model pack artifacts are missing');
      }
      const artifacts = new Map<string, ArrayBuffer>();
      if (artifactValues) {
        const declared = new Set(
          getOcrModelArtifactManifests(model).map((artifact) => artifact.id),
        );
        for (const [id, bytes] of artifactValues.entries()) {
          if (!declared.has(id)) {
            throw new OnnxOcrRuntimeError(`The ONNX model pack has an undeclared artifact: ${id}`);
          }
          if (bytes.byteLength === 0) {
            throw new OnnxOcrRuntimeError(`The ONNX model pack artifact is empty: ${id}`);
          }
          artifacts.set(id, bytes.slice(0));
        }
        for (const id of declared) {
          if (!artifacts.has(id)) {
            throw new OnnxOcrRuntimeError(`The ONNX model pack artifact is missing: ${id}`);
          }
        }
      } else {
        artifacts.set('model', modelBytes.slice(0));
      }
      const session = await input.adapter.createSession(model, modelBytes.slice(0), artifacts);
      let closed = false;
      return {
        descriptor,
        model,
        processPage: async (page, request, context) => {
          if (closed) throw new OnnxOcrRuntimeError('The ONNX OCR runtime is closed');
          if (context.signal.aborted) throw new OnnxOcrRuntimeError('OCR runtime cancelled');
          assertLocalPageReference(page.localRef);
          const imageBytes = copyArrayBuffer(await input.pageSource.read(page, context.signal));
          if (context.signal.aborted) throw new OnnxOcrRuntimeError('OCR runtime cancelled');
          const output = await session.run({ page, request, imageBytes }, context);
          if (context.signal.aborted) throw new OnnxOcrRuntimeError('OCR runtime cancelled');
          const regions = input.adapter.decode(output, page, request);
          return parseComicWorkerPageResult(
            {
              pageId: page.pageId,
              width: page.width,
              height: page.height,
              regions,
              status: 'completed',
            },
            descriptor,
          ).regions;
        },
        close: async () => {
          if (closed) return;
          closed = true;
          await session.close?.();
        },
      };
    },
  };
};
