import { mergeBooknoteSnapshots } from '@/utils/booknoteMerge';
import { BOOK_CONFIG_SCHEMA_VERSION, type BookNote } from '@/types/book';
import { isMissingFileError, withJSONLock, type JSONFileSystem } from './persistence';
import { MAX_SIDECAR_INPUT_BYTES } from './translators/sidecarInput';

type ConfigRecord = Record<string, unknown>;
interface Snapshot {
  bytes: Uint8Array;
  value: ConfigRecord | null;
  recovered?: boolean;
}
interface RecoveryOptions {
  onRecovered?: () => void;
}
class UnsupportedConfigVersion extends Error {}

const isRecord = (value: unknown): value is ConfigRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const validTime = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function validateBookConfigSnapshot(value: unknown): ConfigRecord {
  if (!isRecord(value)) throw new Error('Invalid book configuration object');
  const version = value['schemaVersion'];
  if (version !== undefined && (!Number.isSafeInteger(version) || Number(version) < 0)) {
    throw new Error('Invalid book configuration schema version');
  }
  if (typeof version === 'number' && version > BOOK_CONFIG_SCHEMA_VERSION) {
    throw new UnsupportedConfigVersion('Book configuration requires a newer application version');
  }
  for (const key of ['viewSettings', 'searchConfig']) {
    if (value[key] != null && !isRecord(value[key]))
      throw new Error('Invalid book configuration: ' + key);
  }
  for (const key of ['bookHash', 'metaHash', 'location', 'xpointer']) {
    if (value[key] !== undefined && typeof value[key] !== 'string')
      throw new Error('Invalid book configuration: ' + key);
  }
  if (value['updatedAt'] !== undefined && !validTime(value['updatedAt']))
    throw new Error('Invalid configuration timestamp');
  if (
    value['progress'] !== undefined &&
    (!Array.isArray(value['progress']) ||
      value['progress'].length !== 2 ||
      !value['progress'].every(validTime))
  )
    throw new Error('Invalid book progress');
  if (value['booknotes'] !== undefined) {
    if (!Array.isArray(value['booknotes'])) throw new Error('Invalid book annotations');
    for (const note of value['booknotes']) {
      if (
        !isRecord(note) ||
        typeof note['id'] !== 'string' ||
        !note['id'] ||
        !['annotation', 'bookmark', 'excerpt'].includes(String(note['type']))
      ) {
        throw new Error('Invalid book annotation identity');
      }
      for (const key of ['cfi', 'text', 'note']) {
        if (note[key] !== undefined && typeof note[key] !== 'string')
          throw new Error('Invalid annotation text');
      }
      for (const key of ['updatedAt', 'createdAt', 'deletedAt']) {
        if (note[key] !== undefined && !validTime(note[key]))
          throw new Error('Invalid annotation timestamp');
      }
    }
  }
  const pending: Array<{ item: unknown; depth: number }> = [{ item: value, depth: 0 }];
  while (pending.length) {
    const { item, depth } = pending.pop()!;
    if (depth > 64) throw new Error('Book configuration nesting exceeds resource limit');
    if (item === null || typeof item !== 'object') continue;
    for (const [key, nested] of Object.entries(item)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key))
        throw new Error('Unsafe configuration key');
      if (nested !== null && typeof nested === 'object')
        pending.push({ item: nested, depth: depth + 1 });
    }
  }
  return value;
}

async function readBytes(fs: JSONFileSystem, path: string): Promise<Uint8Array | null> {
  try {
    if (fs.openFile) {
      const file = await fs.openFile(path, 'Books');
      try {
        if (
          !Number.isSafeInteger(file.size) ||
          file.size < 0 ||
          file.size > MAX_SIDECAR_INPUT_BYTES
        ) {
          throw new Error('Book configuration exceeds resource limit');
        }
        const bytes = new Uint8Array(await file.slice(0, file.size).arrayBuffer());
        if (bytes.length > MAX_SIDECAR_INPUT_BYTES)
          throw new Error('Book configuration exceeds resource limit');
        return bytes;
      } finally {
        if ('close' in file && typeof file.close === 'function') await file.close();
      }
    }
    const data = await fs.readFile(path, 'Books', 'binary');
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
    if (bytes.length > MAX_SIDECAR_INPUT_BYTES)
      throw new Error('Book configuration exceeds resource limit');
    return bytes;
  } catch (error) {
    if (isMissingFileError(error)) return null;
    throw new Error('Cannot read book configuration: ' + path, { cause: error });
  }
}

async function readSnapshot(fs: JSONFileSystem, path: string): Promise<Snapshot | null> {
  const bytes = await readBytes(fs, path);
  if (bytes === null) return null;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { bytes, value: validateBookConfigSnapshot(JSON.parse(text)) };
  } catch (error) {
    if (error instanceof UnsupportedConfigVersion) throw error;
    return { bytes, value: null };
  }
}

const writeAtomic = (fs: JSONFileSystem, path: string, json: string) =>
  fs.writeFileAtomic ? fs.writeFileAtomic(path, 'Books', json) : fs.writeFile(path, 'Books', json);
const equalBytes = (first: Uint8Array, second: Uint8Array) =>
  first.length === second.length && first.every((byte, index) => byte === second[index]);

async function loadUnlocked(fs: JSONFileSystem, path: string): Promise<Snapshot | null> {
  const main = await readSnapshot(fs, path);
  if (main?.value) return main;
  const backup = await readSnapshot(fs, path + '.bak');
  if (backup?.value) {
    if (main) {
      // One bounded recovery slot. Never overwrite a different damaged original
      // or create unbounded timestamped recovery files. A full slot fails closed.
      const recoveryPath = path + '.invalid';
      const recovery = await readBytes(fs, recoveryPath);
      if (recovery && !equalBytes(recovery, main.bytes)) {
        throw new Error('Book configuration recovery slot occupied: ' + recoveryPath);
      }
      if (!recovery) {
        await fs.writeFile(recoveryPath, 'Books', main.bytes.slice().buffer);
        const verified = await readBytes(fs, recoveryPath);
        if (!verified || !equalBytes(verified, main.bytes))
          throw new Error('Invalid recovery copy');
      }
    }
    await writeAtomic(fs, path, new TextDecoder('utf-8', { fatal: true }).decode(backup.bytes));
    return { ...backup, recovered: true };
  }
  if (main || backup) throw new Error('No valid book configuration or recovery backup: ' + path);
  return null;
}

export async function loadRecoverableBookConfig(
  fs: JSONFileSystem,
  path: string,
  options: RecoveryOptions = {},
): Promise<ConfigRecord> {
  const snapshot = await withJSONLock(fs, path, 'Books', () => loadUnlocked(fs, path));
  notifyRecovery(snapshot, options);
  return snapshot?.value ?? {};
}

function notifyRecovery(snapshot: Snapshot | null, options: RecoveryOptions) {
  if (!snapshot?.recovered) return;
  // A presentation callback must never undo or hide a safely committed restore.
  try {
    options.onRecovered?.();
  } catch (error) {
    console.warn('Book configuration recovery notification failed', error);
  }
}

function mergeConfig(previous: ConfigRecord, incoming: ConfigRecord): ConfigRecord {
  const oldIsNewer = Number(previous['updatedAt'] ?? 0) > Number(incoming['updatedAt'] ?? 0);
  const merged = oldIsNewer ? { ...incoming, ...previous } : { ...previous, ...incoming };
  if (previous['booknotes'] !== undefined || incoming['booknotes'] !== undefined) {
    merged['booknotes'] = mergeBooknoteSnapshots(
      previous['booknotes'] as BookNote[] | undefined,
      incoming['booknotes'] as BookNote[] | undefined,
    );
  }
  return merged;
}

export async function saveRecoverableBookConfig(
  fs: JSONFileSystem,
  path: string,
  data: unknown,
  options: RecoveryOptions = {},
): Promise<void> {
  const incoming = validateBookConfigSnapshot(data);
  const json = JSON.stringify(incoming);
  if (new TextEncoder().encode(json).length > MAX_SIDECAR_INPUT_BYTES)
    throw new Error('Book configuration exceeds resource limit');
  // Capture now: callers may mutate their in-memory annotation objects later.
  const captured = JSON.parse(json) as ConfigRecord;
  await withJSONLock(fs, path, 'Books', async () => {
    const previous = await loadUnlocked(fs, path);
    notifyRecovery(previous, options);
    const merged = mergeConfig(previous?.value ?? {}, captured);
    const next = JSON.stringify(merged);
    if (new TextEncoder().encode(next).length > MAX_SIDECAR_INPUT_BYTES)
      throw new Error('Book configuration exceeds resource limit');
    const committed = previous
      ? new TextDecoder('utf-8', { fatal: true }).decode(previous.bytes)
      : next;
    await writeAtomic(fs, path + '.bak', committed);
    await writeAtomic(fs, path, next);
  });
}
