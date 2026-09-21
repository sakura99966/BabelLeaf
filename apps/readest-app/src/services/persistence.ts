import { FileSystem, BaseDir } from '@/types/system';
import { MAX_SIDECAR_INPUT_BYTES, readSidecarInput } from './translators/sidecarInput';

/**
 * JSON persistence only needs the text read/write portion of the platform
 * filesystem. Keeping this contract narrow lets local-first feature stores
 * reuse the AppService boundary without depending on native-only helpers.
 */
export type JSONFileSystem = Pick<FileSystem, 'readFile' | 'writeFile' | 'writeFileAtomic'> &
  Partial<Pick<FileSystem, 'openFile'>>;

const writes = new WeakMap<JSONFileSystem, Map<string, Promise<void>>>();

// Native adapters include stable OS error numbers even with localized messages.
// Unknown I/O failures are not evidence that a file is absent.
const isMissingFileError = (error: unknown): boolean => {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')
    return true;
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return /\bENOENT\b|\(os error [23]\)|\bno such file or directory\b|^(?:file )?not found(?:$|:)|^missing$/i.test(
    message,
  );
};

/** Serialize a transaction, including cross-window access on the same origin. */
export async function withJSONLock<T>(
  fs: JSONFileSystem,
  filename: string,
  base: BaseDir,
  action: () => Promise<T>,
): Promise<T> {
  const key = `${base}:${filename.replaceAll('\\', '/').toLowerCase()}`;
  let paths = writes.get(fs);
  if (!paths) {
    paths = new Map();
    writes.set(fs, paths);
  }
  const previous = paths.get(key) ?? Promise.resolve();
  const run = previous.then(async () =>
    typeof navigator !== 'undefined' && navigator.locks
      ? await navigator.locks.request(`babelleaf-json:${key}`, action)
      : await action(),
  );
  // A rejected write must not poison future writes. The caller still sees rejection.
  const tail = run.then(
    () => {},
    () => {},
  );
  paths.set(key, tail);
  void tail.then(() => {
    if (paths.get(key) === tail) paths.delete(key);
  });
  return run;
}

async function loadJSONFile(
  fs: JSONFileSystem,
  path: string,
  base: BaseDir,
): Promise<{
  success: boolean;
  data?: unknown;
  error?: unknown;
  corrupt?: boolean;
  readFailed?: boolean;
}> {
  try {
    const txt = fs.openFile
      ? await readSidecarInput(await fs.openFile(path, base), true)
      : await fs.readFile(path, base, 'text');
    if (typeof txt === 'string' && txt.length > MAX_SIDECAR_INPUT_BYTES)
      throw new Error('JSON input exceeds resource limit');
    if (!txt || typeof txt !== 'string' || txt.trim().length === 0) {
      return { success: false, corrupt: true, error: 'File is empty or invalid' };
    }
    try {
      const data = JSON.parse(txt as string);
      return { success: true, data };
    } catch (parseError) {
      return { success: false, corrupt: true, error: `JSON parse error: ${parseError}` };
    }
  } catch (error) {
    return { success: false, error, readFailed: !isMissingFileError(error) };
  }
}

/**
 * Safely loads a JSON file with automatic backup fallback.
 * If the main file is corrupted, attempts to load from backup.
 */
export async function safeLoadJSON<T>(
  fs: JSONFileSystem,
  filename: string,
  base: BaseDir,
  defaultValue: T,
  validate?: (value: unknown) => unknown,
): Promise<T> {
  return withJSONLock(fs, filename, base, () =>
    loadJSONUnlocked(fs, filename, base, defaultValue, validate),
  );
}

async function loadJSONUnlocked<T>(
  fs: JSONFileSystem,
  filename: string,
  base: BaseDir,
  defaultValue: T,
  validate?: (value: unknown) => unknown,
): Promise<T> {
  const backupFilename = `${filename}.bak`;
  let validationError: unknown;
  const mainResult = await loadJSONFile(fs, filename, base);
  if (mainResult.success) {
    try {
      return (validate ? validate(mainResult.data) : mainResult.data) as T;
    } catch (error) {
      validationError = error;
    }
  }

  const backupResult = await loadJSONFile(fs, backupFilename, base);
  if (backupResult.success) {
    let data: unknown;
    try {
      data = validate ? validate(backupResult.data) : backupResult.data;
    } catch (error) {
      throw new Error(`No schema-valid JSON copy: ${filename}`, { cause: error });
    }
    try {
      const backupData = JSON.stringify(data, null, 2);
      if (!mainResult.readFailed) await writeJSONCopy(fs, filename, base, backupData);
    } catch (error) {
      console.info(`Failed to restore ${filename} from backup:`, error);
    }
    return data as T;
  }

  if (validationError)
    throw new Error(`No schema-valid JSON copy: ${filename}`, { cause: validationError });
  if (
    validate &&
    (mainResult.corrupt || backupResult.corrupt || mainResult.readFailed || backupResult.readFailed)
  )
    throw new Error(`No readable JSON copy: ${filename}`, {
      cause: mainResult.error ?? backupResult.error,
    });
  return defaultValue;
}

/**
 * Native files use temporary-file replacement; other adapters retain two-copy
 * recovery. The pair is not a single atomic transaction. Preserve the previous
 * readable main before replacement; never put an uncommitted update over it.
 */
const writeJSONCopy = (fs: JSONFileSystem, filename: string, base: BaseDir, json: string) =>
  fs.writeFileAtomic
    ? fs.writeFileAtomic(filename, base, json)
    : fs.writeFile(filename, base, json);

async function saveJSONUnlocked(
  fs: JSONFileSystem,
  filename: string,
  base: BaseDir,
  json: string,
): Promise<void> {
  const main = await loadJSONFile(fs, filename, base);
  if (main.readFailed)
    throw new Error(`Cannot read existing JSON copy: ${filename}`, { cause: main.error });
  if (main.success) {
    await writeJSONCopy(fs, `${filename}.bak`, base, JSON.stringify(main.data));
  } else {
    const backup = await loadJSONFile(fs, `${filename}.bak`, base);
    if (backup.readFailed)
      throw new Error(`Cannot read existing JSON backup: ${filename}`, { cause: backup.error });
    // Bootstrap two-copy recovery only when neither copy is readable. A valid
    // recovery copy must survive retries against a missing or damaged main.
    if (!backup.success) await writeJSONCopy(fs, `${filename}.bak`, base, json);
  }
  await writeJSONCopy(fs, filename, base, json);
}

export async function updateJSON<T>(
  fs: JSONFileSystem,
  filename: string,
  base: BaseDir,
  update: (previous: unknown) => T,
  validate?: (value: unknown) => unknown,
): Promise<void> {
  await withJSONLock(fs, filename, base, async () => {
    const previous = await loadJSONUnlocked<unknown>(fs, filename, base, null, validate);
    const data = JSON.stringify(update(previous));
    await saveJSONUnlocked(fs, filename, base, data);
  });
}

export async function safeSaveJSON(
  fs: JSONFileSystem,
  filename: string,
  base: BaseDir,
  data: unknown,
): Promise<void> {
  const jsonData = JSON.stringify(data);

  await withJSONLock(fs, filename, base, async () => {
    try {
      await saveJSONUnlocked(fs, filename, base, jsonData);
    } catch (error) {
      console.error(`Failed to save ${filename}:`, error);
      throw new Error(`Failed to save ${filename}: ${error}`);
    }
  });
}
