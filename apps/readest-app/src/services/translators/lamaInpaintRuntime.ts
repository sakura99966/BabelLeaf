import type { ComicInpaintRequest, ComicInpaintWorker, ComicRgbaImage } from './comicImagePipeline';
import {
  loadInpaintModelPack,
  readAndVerifyInpaintModelPack,
  type InpaintModelPackStorage,
} from './inpaintModelPacks';
import { assertTrustedInpaintModelManifest } from './inpaintModels';

export const LAMA_INPAINT_RUNTIME_VERSION = '1.27.0' as const;
export const LAMA_INPAINT_MODEL_SIZE = 512 as const;
export const LAMA_ONNX_WASM_PATH = '/vendor/onnxruntime/' as const;

type TensorData = Float32Array | Uint8Array | Int32Array | BigInt64Array;

interface LamaTensorLike {
  data: TensorData;
  dims?: readonly number[];
}

interface LamaSessionLike {
  inputNames?: readonly string[];
  outputNames?: readonly string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, LamaTensorLike>>;
  release(): Promise<void> | void;
}

interface LamaOrtLike {
  env: {
    wasm: {
      wasmPaths?: string;
      numThreads?: number;
      proxy?: boolean;
    };
    logLevel?: string;
  };
  Tensor: new (type: 'float32', data: Float32Array, dims: readonly number[]) => unknown;
  InferenceSession: {
    create(
      model: ArrayBuffer | Uint8Array,
      options: Record<string, unknown>,
    ): Promise<LamaSessionLike>;
  };
}

export interface LamaInpaintRuntimeDependencies {
  importOrt?: () => Promise<LamaOrtLike>;
}

export class LamaInpaintRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LamaInpaintRuntimeError';
  }
}

const checkCancelled = (signal: AbortSignal): void => {
  if (signal.aborted) throw new LamaInpaintRuntimeError('Comic inpainting cancelled');
};

const clampByte = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

const sampleChannel = (image: ComicRgbaImage, x: number, y: number, channel: number): number => {
  const left = Math.max(0, Math.min(image.width - 1, Math.floor(x)));
  const top = Math.max(0, Math.min(image.height - 1, Math.floor(y)));
  const right = Math.min(image.width - 1, left + 1);
  const bottom = Math.min(image.height - 1, top + 1);
  const dx = x - left;
  const dy = y - top;
  const at = (px: number, py: number) => image.data[(py * image.width + px) * 4 + channel]!;
  const upper = at(left, top) * (1 - dx) + at(right, top) * dx;
  const lower = at(left, bottom) * (1 - dx) + at(right, bottom) * dx;
  return upper * (1 - dy) + lower * dy;
};

const resizeInputToTensor = (image: ComicRgbaImage): Float32Array => {
  const area = LAMA_INPAINT_MODEL_SIZE * LAMA_INPAINT_MODEL_SIZE;
  const tensor = new Float32Array(area * 3);
  const scaleX = image.width / LAMA_INPAINT_MODEL_SIZE;
  const scaleY = image.height / LAMA_INPAINT_MODEL_SIZE;
  for (let y = 0; y < LAMA_INPAINT_MODEL_SIZE; y += 1) {
    const sourceY = (y + 0.5) * scaleY - 0.5;
    for (let x = 0; x < LAMA_INPAINT_MODEL_SIZE; x += 1) {
      const sourceX = (x + 0.5) * scaleX - 0.5;
      const index = y * LAMA_INPAINT_MODEL_SIZE + x;
      // OpenCV's published adapter feeds BGR without channel swapping.
      tensor[index] = sampleChannel(image, sourceX, sourceY, 2) / 255;
      tensor[area + index] = sampleChannel(image, sourceX, sourceY, 1) / 255;
      tensor[area * 2 + index] = sampleChannel(image, sourceX, sourceY, 0) / 255;
    }
  }
  return tensor;
};

const resizeMaskToTensor = (mask: Uint8Array, width: number, height: number): Float32Array => {
  const output = new Float32Array(LAMA_INPAINT_MODEL_SIZE * LAMA_INPAINT_MODEL_SIZE);
  const scaleX = width / LAMA_INPAINT_MODEL_SIZE;
  const scaleY = height / LAMA_INPAINT_MODEL_SIZE;
  for (let y = 0; y < LAMA_INPAINT_MODEL_SIZE; y += 1) {
    const sourceY = Math.max(0, Math.min(height - 1, Math.floor((y + 0.5) * scaleY)));
    for (let x = 0; x < LAMA_INPAINT_MODEL_SIZE; x += 1) {
      const sourceX = Math.max(0, Math.min(width - 1, Math.floor((x + 0.5) * scaleX)));
      output[y * LAMA_INPAINT_MODEL_SIZE + x] = mask[sourceY * width + sourceX]! > 0 ? 1 : 0;
    }
  }
  return output;
};

const sampleOutput = (output: Float32Array, channel: number, x: number, y: number): number => {
  const size = LAMA_INPAINT_MODEL_SIZE;
  const area = size * size;
  const left = Math.max(0, Math.min(size - 1, Math.floor(x)));
  const top = Math.max(0, Math.min(size - 1, Math.floor(y)));
  const right = Math.min(size - 1, left + 1);
  const bottom = Math.min(size - 1, top + 1);
  const dx = x - left;
  const dy = y - top;
  const at = (px: number, py: number) => output[channel * area + py * size + px]!;
  const upper = at(left, top) * (1 - dx) + at(right, top) * dx;
  const lower = at(left, bottom) * (1 - dx) + at(right, bottom) * dx;
  return upper * (1 - dy) + lower * dy;
};

const compositeOutput = (
  image: ComicRgbaImage,
  mask: Uint8Array,
  output: Float32Array,
): ComicRgbaImage => {
  const expected = 3 * LAMA_INPAINT_MODEL_SIZE * LAMA_INPAINT_MODEL_SIZE;
  if (output.length !== expected || output.some((value) => !Number.isFinite(value))) {
    throw new LamaInpaintRuntimeError('LaMa returned invalid output tensor data');
  }
  const result = { width: image.width, height: image.height, data: image.data.slice() };
  const scaleX = LAMA_INPAINT_MODEL_SIZE / image.width;
  const scaleY = LAMA_INPAINT_MODEL_SIZE / image.height;
  for (let y = 0; y < image.height; y += 1) {
    const modelY = (y + 0.5) * scaleY - 0.5;
    for (let x = 0; x < image.width; x += 1) {
      const alpha = mask[y * image.width + x]! / 255;
      if (alpha === 0) continue;
      const modelX = (x + 0.5) * scaleX - 0.5;
      const target = (y * image.width + x) * 4;
      const channels = [
        sampleOutput(output, 2, modelX, modelY),
        sampleOutput(output, 1, modelX, modelY),
        sampleOutput(output, 0, modelX, modelY),
      ];
      for (let channel = 0; channel < 3; channel += 1) {
        const source = image.data[target + channel]!;
        result.data[target + channel] = clampByte(
          source * (1 - alpha) + channels[channel]! * alpha,
        );
      }
    }
  }
  return result;
};

const defaultImportOrt = async (): Promise<LamaOrtLike> =>
  (await import('onnxruntime-web/wasm')) as unknown as LamaOrtLike;

export const createLamaInpaintWorker = async (
  modelBytes: ArrayBuffer,
  dependencies: LamaInpaintRuntimeDependencies = {},
): Promise<ComicInpaintWorker> => {
  if (modelBytes.byteLength < 1024)
    throw new LamaInpaintRuntimeError('LaMa model bytes are invalid');
  const ort = await (dependencies.importOrt ?? defaultImportOrt)();
  ort.env.wasm.wasmPaths = LAMA_ONNX_WASM_PATH;
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.logLevel = 'error';
  const session = await ort.InferenceSession.create(modelBytes, {
    executionProviders: ['wasm'],
    executionMode: 'sequential',
    graphOptimizationLevel: 'all',
    enableCpuMemArena: true,
    enableMemPattern: true,
  });
  if (
    session.inputNames &&
    (!session.inputNames.includes('image') || !session.inputNames.includes('mask'))
  ) {
    await session.release();
    throw new LamaInpaintRuntimeError('LaMa input tensor names are incompatible');
  }
  let closed = false;
  return {
    async process(request: ComicInpaintRequest): Promise<ComicRgbaImage> {
      if (closed) throw new LamaInpaintRuntimeError('LaMa inpainting worker is closed');
      checkCancelled(request.signal);
      if (request.mask.byteLength !== request.image.width * request.image.height) {
        throw new LamaInpaintRuntimeError('LaMa mask dimensions do not match the image');
      }
      request.reportProgress(0.05);
      const image = resizeInputToTensor(request.image);
      const mask = resizeMaskToTensor(request.mask, request.image.width, request.image.height);
      checkCancelled(request.signal);
      request.reportProgress(0.25);
      const result = await session.run({
        image: new ort.Tensor('float32', image, [1, 3, 512, 512]),
        mask: new ort.Tensor('float32', mask, [1, 1, 512, 512]),
      });
      checkCancelled(request.signal);
      const tensor = result['output'] ?? result[session.outputNames?.[0] ?? ''];
      if (!tensor || !(tensor.data instanceof Float32Array)) {
        throw new LamaInpaintRuntimeError('LaMa output tensor is missing or incompatible');
      }
      request.reportProgress(0.85);
      const composited = compositeOutput(request.image, request.mask, tensor.data);
      request.reportProgress(1);
      return composited;
    },
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      await session.release();
    },
  };
};

export const createInstalledLamaInpaintWorker = async (
  storage: InpaintModelPackStorage,
  dependencies: LamaInpaintRuntimeDependencies = {},
): Promise<ComicInpaintWorker> => {
  const record = await loadInpaintModelPack(storage);
  if (!record) throw new LamaInpaintRuntimeError('Install the approved local LaMa model first');
  assertTrustedInpaintModelManifest(record.manifest);
  const verified = await readAndVerifyInpaintModelPack(storage, record);
  return createLamaInpaintWorker(verified.model, dependencies);
};
