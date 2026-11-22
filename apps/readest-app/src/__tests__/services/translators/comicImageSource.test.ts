import { expect, test, vi } from 'vitest';
import { readComicImageBlob } from '@/services/translators/comicImageSource';

const readBlob = (blob: Blob) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
const source = (size = 3) => {
  const file = Object.assign(new File([], 'native-page.png'), {
    arrayBuffer: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
    close: vi.fn(async () => undefined),
  });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};
test('materializes native file bytes rather than passing its empty internal Blob to a decoder', async () => {
  const file = source();
  expect((await readBlob(file)).byteLength).toBe(0);
  const blob = await readComicImageBlob(file, 3, 'image/png');
  expect(blob).not.toBe(file);
  expect(new Uint8Array(await readBlob(blob))).toEqual(new Uint8Array([1, 2, 3]));
  expect(blob.type).toBe('image/png');
  expect(file.close).toHaveBeenCalledOnce();
});
test.each([
  0,
  -1,
  Number.NaN,
  64 * 1024 * 1024 + 1,
])('rejects invalid or oversized native sources before allocating: %s', async (size) => {
  const file = source(size);
  await expect(readComicImageBlob(file, size, 'image/png')).rejects.toThrow();
  expect(file.arrayBuffer).not.toHaveBeenCalled();
  expect(file.close).toHaveBeenCalledOnce();
});
test('rejects changed or truncated spooled sources and always closes their handles', async () => {
  const changed = source(4);
  await expect(readComicImageBlob(changed, 3, 'image/png')).rejects.toThrow();
  expect(changed.arrayBuffer).not.toHaveBeenCalled();
  expect(changed.close).toHaveBeenCalledOnce();
  const truncated = source(4);
  await expect(readComicImageBlob(truncated, 4, 'image/png')).rejects.toThrow();
  expect(truncated.close).toHaveBeenCalledOnce();
});
test('closes the native handle when reading fails', async () => {
  const file = source();
  file.arrayBuffer.mockRejectedValueOnce(new Error('Disk read failed'));
  await expect(readComicImageBlob(file, 3, 'image/png')).rejects.toThrow('Disk read failed');
  expect(file.close).toHaveBeenCalledOnce();
});
