/**
 * DictZip reader — shared between StarDict (`.dict.dz`) and DICT (`.dict.dz`).
 *
 * `.dict.dz` is a standard gzip with a FEXTRA "RA" subfield listing the
 * compressed length of each chunk. Each chunk's uncompressed length is
 * exactly `chlen` (the last may be shorter). Chunks are separated by
 * `Z_FULL_FLUSH` (BFINAL=0 + sync marker), so each chunk's deflate stream is
 * non-terminating — `inflateSync` rejects them with "unexpected EOF".
 * fflate's streaming `Inflate.push(bytes, false)` handles them correctly and
 * emits chunk bytes via `ondata`.
 *
 * Both readers share the same lazy chunk decompression strategy. The
 * `loadDictBody` factory probes the candidate `.dict.dz`; when chunk-mode is
 * viable it returns a `DictZipChunkedDict` that decompresses on demand. When
 * the FEXTRA is missing or the probe fails (or the file is plain `.dict`),
 * ordinary gzip uses bounded asynchronous decompression, while raw bodies
 * remain Blob-backed and are read by range.
 */
import { Inflate } from 'fflate';
import { decompressDictionaryGzip } from './gzipWorker';

export const MAX_DICTIONARY_OUTPUT_BYTES = 64 * 1024 * 1024;
const MAX_DICTIONARY_INPUT_BYTES = 512 * 1024 * 1024;
const MAX_DICTIONARY_READ_BYTES = 8 * 1024 * 1024;

function validateRange(offset: number, size: number): void {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(size) ||
    offset < 0 ||
    size < 0 ||
    size > MAX_DICTIONARY_READ_BYTES
  ) {
    throw new Error('Dictionary read limit exceeded');
  }
}

const GZIP_MAGIC = [0x1f, 0x8b];

const isGzip = (bytes: Uint8Array): boolean =>
  bytes.length >= 2 && bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1];

export interface DictZipMeta {
  /** Uncompressed bytes per chunk (last may be shorter). */
  chlen: number;
  /** Compressed bytes per chunk; sums to `compressedDataSize`. */
  chunkSizes: number[];
  /** Byte offset within the file where compressed chunk data begins. */
  compressedDataOffset: number;
}

/**
 * Parse the gzip header + FEXTRA RA subfield. Returns `null` for non-gzip
 * files or gzip files without an RA subfield (those need whole-file gunzip).
 */
export function parseDictZipHeader(bytes: Uint8Array): DictZipMeta | null {
  if (bytes.length < 12 || bytes[0] !== 0x1f || bytes[1] !== 0x8b || bytes[2] !== 0x08) {
    return null;
  }
  const flg = bytes[3]!;
  const hasFEXTRA = (flg & 0b100) !== 0;
  if (!hasFEXTRA) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const xlen = view.getUint16(10, true);
  if (12 + xlen > bytes.length) return null;
  let chlen = 0;
  let chcnt = 0;
  const chunkSizes: number[] = [];

  let p = 12;
  while (p + 4 <= 12 + xlen) {
    const si1 = bytes[p]!;
    const si2 = bytes[p + 1]!;
    const slen = view.getUint16(p + 2, true);
    if (p + 4 + slen > 12 + xlen) return null;
    if (si1 === 0x52 && si2 === 0x41) {
      if (slen < 6) return null;
      // RA subfield: ver(2) + chlen(2) + chcnt(2) + chcnt × chunkSize(2).
      const ver = view.getUint16(p + 4, true);
      if (ver !== 1) return null;
      chlen = view.getUint16(p + 6, true);
      chcnt = view.getUint16(p + 8, true);
      if (!chlen || slen < 6 + chcnt * 2) return null;
      for (let i = 0; i < chcnt; i++) {
        chunkSizes.push(view.getUint16(p + 10 + 2 * i, true));
      }
    }
    p += 4 + slen;
  }
  if (chcnt === 0 || chunkSizes.length !== chcnt) return null;

  // Skip past FEXTRA + optional FNAME, FCOMMENT, FHCRC.
  let offset = 12 + xlen;
  if (flg & 0b1000) {
    while (offset < bytes.length && bytes[offset] !== 0) offset++;
    offset++;
  }
  if (flg & 0b10000) {
    while (offset < bytes.length && bytes[offset] !== 0) offset++;
    offset++;
  }
  if (flg & 0b10) offset += 2;

  return { chlen, chunkSizes, compressedDataOffset: offset };
}

/**
 * Inflate a single DictZip chunk via fflate's streaming `Inflate`. The
 * chunk's deflate stream ends at `Z_FULL_FLUSH` (BFINAL=0 — `inflateSync`
 * would reject), so we push with `final=false` and capture the data emitted
 * by `ondata`. Returns `null` on failure.
 */
export function inflateChunkStreaming(chunkBytes: Uint8Array): Uint8Array | null {
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    const inf = new Inflate();
    inf.ondata = (data, _final) => {
      total += data.length;
      if (total > 65535) throw new Error('DictZip chunk output limit exceeded');
      parts.push(data);
    };
    // A tiny input step bounds allocation before ondata can enforce output limits.
    for (let start = 0; start < chunkBytes.length; start += 64)
      inf.push(chunkBytes.subarray(start, start + 64), false);
  } catch {
    return null;
  }
  if (!total) return null;
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/**
 * Bounded LRU. Tiny enough we don't bother with a real linked-list
 * implementation; reusing the Map insertion order is fine.
 */
export class LRU<K, V> {
  private readonly max: number;
  private readonly map = new Map<K, V>();

  constructor(max: number) {
    this.max = max;
  }

  get(key: K): V | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.max) {
      const first = this.map.keys().next().value as K | undefined;
      if (first !== undefined) this.map.delete(first);
    }
  }
}

/** Body of a DICT-style dict file — supports random-access uncompressed reads. */
export interface DictBody {
  read(offset: number, size: number): Promise<Uint8Array>;
}

class BufferedDictBody implements DictBody {
  constructor(private readonly buf: Uint8Array) {}
  async read(offset: number, size: number): Promise<Uint8Array> {
    validateRange(offset, size);
    return this.buf.subarray(offset, offset + size);
  }
}

class BlobDictBody implements DictBody {
  constructor(private readonly blob: Blob) {}
  async read(offset: number, size: number): Promise<Uint8Array> {
    validateRange(offset, size);
    return new Uint8Array(await this.blob.slice(offset, offset + size).arrayBuffer());
  }
}

class DictZipChunkedDict implements DictBody {
  private readonly chunkOffsets: number[];
  private readonly chunkCache: LRU<number, Uint8Array>;

  constructor(
    private readonly blob: Blob,
    private readonly meta: DictZipMeta,
    cacheSize: number,
  ) {
    this.chunkCache = new LRU<number, Uint8Array>(cacheSize);
    const offsets: number[] = [];
    let acc = meta.compressedDataOffset;
    for (const cs of meta.chunkSizes) {
      offsets.push(acc);
      acc += cs;
    }
    this.chunkOffsets = offsets;
  }

  async read(offset: number, size: number): Promise<Uint8Array> {
    validateRange(offset, size);
    if (!size) return new Uint8Array();
    const chlen = this.meta.chlen;
    const startChunk = Math.floor(offset / chlen);
    const endChunk = Math.floor((offset + size - 1) / chlen);
    if (endChunk >= this.meta.chunkSizes.length)
      throw new Error('DictZip chunk range exceeds body');

    if (startChunk === endChunk) {
      const chunk = await this.getChunk(startChunk);
      const local = offset - startChunk * chlen;
      return chunk.subarray(local, local + size);
    }
    const parts: Uint8Array[] = [];
    let totalLen = 0;
    for (let i = startChunk; i <= endChunk; i++) {
      const chunk = await this.getChunk(i);
      parts.push(chunk);
      totalLen += chunk.length;
    }
    const combined = new Uint8Array(totalLen);
    let pos = 0;
    for (const p of parts) {
      combined.set(p, pos);
      pos += p.length;
    }
    const local = offset - startChunk * chlen;
    return combined.subarray(local, local + size);
  }

  private async getChunk(i: number): Promise<Uint8Array> {
    const cached = this.chunkCache.get(i);
    if (cached) return cached;
    const start = this.chunkOffsets[i]!;
    const compressedSize = this.meta.chunkSizes[i]!;
    const compressed = new Uint8Array(
      await this.blob.slice(start, start + compressedSize).arrayBuffer(),
    );
    const inflated = inflateChunkStreaming(compressed);
    if (!inflated) throw new Error(`Failed to inflate DictZip chunk ${i}`);
    if (
      inflated.length > this.meta.chlen ||
      (i < this.meta.chunkSizes.length - 1 && inflated.length !== this.meta.chlen)
    ) {
      throw new Error(`Invalid DictZip chunk length: ${i}`);
    }
    this.chunkCache.set(i, inflated);
    return inflated;
  }
}

async function probeChunkInflate(blob: Blob, meta: DictZipMeta): Promise<boolean> {
  if (meta.chunkSizes.length === 0) return false;
  const compressedEnd =
    meta.compressedDataOffset + meta.chunkSizes.reduce((sum, size) => sum + size, 0);
  if (meta.chunkSizes.some((size) => size === 0) || compressedEnd > blob.size - 8) return false;
  const cs = meta.chunkSizes[0]!;
  const start = meta.compressedDataOffset;
  const compressed = new Uint8Array(await blob.slice(start, start + cs).arrayBuffer());
  const inflated = inflateChunkStreaming(compressed);
  return !!inflated && inflated.length > 0 && inflated.length <= meta.chlen;
}

export interface LoadDictBodyOpts {
  /** LRU size for decompressed chunks in chunk mode. Defaults to 16. */
  chunkCacheSize?: number;
  maxOutputBytes?: number;
  signal?: AbortSignal;
}

/**
 * Open a `.dict[.dz]` body for random-access reads. Tries lazy DictZip chunk
 * mode first (header probe + chunk-0 inflate); ordinary gzip uses bounded
 * streaming decompression. Raw `.dict` remains range-readable.
 */
export async function loadDictBody(blob: Blob, opts: LoadDictBodyOpts = {}): Promise<DictBody> {
  opts.signal?.throwIfAborted();
  if (blob.size > MAX_DICTIONARY_INPUT_BYTES) throw new Error('Dictionary input limit exceeded');
  const cacheSize = Math.max(1, Math.min(32, opts.chunkCacheSize ?? 16));
  const maxOutput = Math.min(
    MAX_DICTIONARY_OUTPUT_BYTES,
    opts.maxOutputBytes ?? MAX_DICTIONARY_OUTPUT_BYTES,
  );
  if (!Number.isSafeInteger(maxOutput) || maxOutput < 1)
    throw new Error('Invalid dictionary output limit');
  // Read just the gzip header + FEXTRA region (much less than the whole
  // file). 64 KB is enormously generous — even thousands of chunks fit
  // in a few KB.
  const headBuf = await blob.slice(0, Math.min(blob.size, 64 * 1024)).arrayBuffer();
  const head = new Uint8Array(headBuf);
  if (isGzip(head)) {
    const meta = parseDictZipHeader(head);
    if (meta && (await probeChunkInflate(blob, meta))) {
      return new DictZipChunkedDict(blob, meta, cacheSize);
    }
    return new BufferedDictBody(await decompressDictionaryGzip(blob, maxOutput, opts.signal));
  }
  return new BlobDictBody(blob);
}
