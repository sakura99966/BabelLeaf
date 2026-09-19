import { Blob as NodeBlob } from 'node:buffer';
import { gzipSync, deflateSync } from 'fflate';
import { expect, test } from 'vitest';
import { loadDictBody } from '@/services/dictionaries/dictZip';

test('rejects a later RA chunk expanding beyond its declared chunk length', async () => {
  const chunks = [
    deflateSync(new TextEncoder().encode('a')),
    deflateSync(new TextEncoder().encode('bc')),
  ];
  const header = new Uint8Array(26);
  header.set([0x1f, 0x8b, 8, 4]);
  const data = new DataView(header.buffer);
  data.setUint16(10, 14, true);
  header.set([0x52, 0x41], 12);
  data.setUint16(14, 10, true);
  data.setUint16(16, 1, true);
  data.setUint16(18, 1, true);
  data.setUint16(20, 2, true);
  data.setUint16(22, chunks[0]!.length, true);
  data.setUint16(24, chunks[1]!.length, true);
  const blob = new NodeBlob([header, ...chunks, new Uint8Array(8)]) as unknown as Blob;
  const body = await loadDictBody(blob);
  await expect(body.read(1, 1)).rejects.toThrow('chunk');
});

test('rejects gzip expansion over the actual output budget', async () => {
  const gzip = gzipSync(new Uint8Array(100_000));
  const blob = new NodeBlob([gzip]) as unknown as Blob;
  await expect(loadDictBody(blob, { maxOutputBytes: 4096 })).rejects.toThrow('limit');
});

test('cancels before decompressing and range-reads raw dictionary bodies', async () => {
  const blob = new NodeBlob(['hello']) as unknown as Blob;
  const controller = new AbortController();
  controller.abort();
  await expect(loadDictBody(blob, { signal: controller.signal })).rejects.toThrow();
});
