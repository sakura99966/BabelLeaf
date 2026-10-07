import { File as NodeFile } from 'node:buffer';
import { expect, test, vi } from 'vitest';
import { MAX_SIDECAR_INPUT_BYTES, readSidecarInput } from '@/services/translators/sidecarInput';

test('reads UTF-8 input through a bounded slice without closing a picker-owned file', async () => {
  const file = new NodeFile(['日本語'], 'sidecar.json') as unknown as File;
  const close = vi.fn();
  Object.assign(file, { close });
  const slice = vi.spyOn(file, 'slice');
  expect(await readSidecarInput(file)).toBe('日本語');
  expect(slice).toHaveBeenCalledWith(0, file.size);
  expect(close).not.toHaveBeenCalled();
});

test.each([
  NaN,
  -1,
  Infinity,
  MAX_SIDECAR_INPUT_BYTES + 1,
])('rejects invalid or excessive size %s before reading and closes owned input', async (size) => {
  const slice = vi.fn();
  const close = vi.fn();
  const file = { size, slice, close } as unknown as File;
  await expect(readSidecarInput(file, true)).rejects.toThrow(/sidecar input/i);
  expect(slice).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledTimes(1);
});

test('closes owned input after a failed native range read', async () => {
  const close = vi.fn();
  const file = {
    size: 8,
    slice: () => ({ size: 8, text: () => Promise.reject(new Error('read failed')) }),
    close,
  } as unknown as File;
  await expect(readSidecarInput(file, true)).rejects.toThrow('read failed');
  expect(close).toHaveBeenCalledTimes(1);
});

test('rejects a file that grows beyond the limit between stat and slice', async () => {
  const text = vi.fn();
  const file = {
    size: 8,
    slice: () => ({ size: MAX_SIDECAR_INPUT_BYTES + 1, text }),
  } as unknown as File;
  await expect(readSidecarInput(file)).rejects.toThrow('Sidecar input exceeds');
  expect(text).not.toHaveBeenCalled();
});
