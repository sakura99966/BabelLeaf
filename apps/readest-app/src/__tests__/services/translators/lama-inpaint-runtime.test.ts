import { describe, expect, test, vi } from 'vitest';
import {
  createLamaInpaintWorker,
  LAMA_INPAINT_MODEL_SIZE,
  LAMA_ONNX_WASM_PATH,
} from '@/services/translators';

const createOrt = (outputFactory: () => Float32Array) => {
  const release = vi.fn();
  const run = vi.fn(async (_feeds: Record<string, unknown>) => ({
    output: { data: outputFactory(), dims: [1, 3, 512, 512] },
  }));
  const create = vi.fn(async () => ({
    inputNames: ['image', 'mask'],
    outputNames: ['output'],
    run,
    release,
  }));
  class Tensor {
    constructor(
      public type: string,
      public data: Float32Array,
      public dims: readonly number[],
    ) {}
  }
  const ort = {
    env: { wasm: {}, logLevel: '' },
    Tensor,
    InferenceSession: { create },
  };
  return { ort, create, run, release };
};

const solidOutput = (red: number, green: number, blue: number): Float32Array => {
  const area = LAMA_INPAINT_MODEL_SIZE * LAMA_INPAINT_MODEL_SIZE;
  const output = new Float32Array(area * 3);
  output.fill(blue, 0, area);
  output.fill(green, area, area * 2);
  output.fill(red, area * 2);
  return output;
};

describe('LaMa local inpainting worker', () => {
  test('uses a sequential single-thread WASM session and changes only masked RGB bytes', async () => {
    const mocked = createOrt(() => solidOutput(200, 150, 100));
    const worker = await createLamaInpaintWorker(new ArrayBuffer(1024), {
      importOrt: async () => mocked.ort,
    });
    const source = {
      width: 2,
      height: 2,
      data: new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255]),
    };
    const progress: number[] = [];
    const result = await worker.process({
      image: source,
      mask: new Uint8Array([0, 255, 0, 128]),
      signal: new AbortController().signal,
      reportProgress: (value) => progress.push(value),
    });
    expect(mocked.ort.env.wasm).toEqual({
      wasmPaths: LAMA_ONNX_WASM_PATH,
      numThreads: 1,
      proxy: false,
    });
    expect(mocked.create).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      expect.objectContaining({
        executionProviders: ['wasm'],
        executionMode: 'sequential',
      }),
    );
    expect(result.data.slice(0, 4)).toEqual(source.data.slice(0, 4));
    expect([...result.data.slice(4, 8)]).toEqual([200, 150, 100, 255]);
    expect(result.data.slice(8, 12)).toEqual(source.data.slice(8, 12));
    expect([...result.data.slice(12, 16)]).toEqual([150, 130, 110, 255]);
    expect(progress).toEqual([0.05, 0.25, 0.85, 1]);
    const feeds = mocked.run.mock.calls[0]![0] as Record<
      string,
      { data: Float32Array; dims: readonly number[] }
    >;
    expect(feeds['image']!.dims).toEqual([1, 3, 512, 512]);
    expect(feeds['mask']!.dims).toEqual([1, 1, 512, 512]);
    expect(feeds['mask']!.data.some((value) => value === 1)).toBe(true);
    await worker.close?.();
    expect(mocked.release).toHaveBeenCalledTimes(1);
  });

  test('rejects cancellation, malformed output, and use after close', async () => {
    const mocked = createOrt(() => new Float32Array([1]));
    const worker = await createLamaInpaintWorker(new ArrayBuffer(1024), {
      importOrt: async () => mocked.ort,
    });
    const request = {
      image: { width: 1, height: 1, data: new Uint8Array([1, 2, 3, 255]) },
      mask: new Uint8Array([255]),
      signal: new AbortController().signal,
      reportProgress: vi.fn(),
    };
    await expect(worker.process(request)).rejects.toThrow('invalid output tensor');
    await worker.close?.();
    await expect(worker.process(request)).rejects.toThrow('closed');

    const cancelled = new AbortController();
    cancelled.abort();
    const second = createOrt(() => solidOutput(1, 2, 3));
    const cancellableWorker = await createLamaInpaintWorker(new ArrayBuffer(1024), {
      importOrt: async () => second.ort,
    });
    await expect(
      cancellableWorker.process({ ...request, signal: cancelled.signal }),
    ).rejects.toThrow('cancelled');
    expect(second.run).not.toHaveBeenCalled();
    await cancellableWorker.close?.();
  });
});
