const DB_NAME = 'TranslationCache';
const DB_VERSION = 1;
const STORE_NAME = 'translations';
const MAX_MEMORY_ENTRIES = 512;
const MAX_MEMORY_BYTES = 8 * 1024 * 1024;
const MAX_DB_ENTRIES = 2048;
const MAX_DB_ENTRY_BYTES = 64 * 1024;

interface CacheEntry {
  key: string;
  translation: string;
  timestamp: number;
  provider: string;
  sourceLang: string;
  targetLang: string;
  originalText: string;
}
interface MemoryEntry {
  translation: string;
  timestamp: number;
  provider: string;
  bytes: number;
}
const memoryCache = new Map<string, MemoryEntry>();
let memoryBytes = 0;

const forget = (key: string) => {
  const entry = memoryCache.get(key);
  if (entry) memoryBytes -= entry.bytes;
  memoryCache.delete(key);
};
const remember = (entry: CacheEntry) => {
  if (typeof entry.key !== 'string' || typeof entry.translation !== 'string') return;
  forget(entry.key);
  // UTF-16 string payload estimate; object/engine overhead is not included.
  const bytes = 2 * (entry.key.length + entry.translation.length);
  if (bytes > MAX_MEMORY_BYTES) return;
  while (memoryCache.size >= MAX_MEMORY_ENTRIES || memoryBytes + bytes > MAX_MEMORY_BYTES)
    forget(memoryCache.keys().next().value!);
  memoryCache.set(entry.key, {
    translation: entry.translation,
    timestamp: entry.timestamp,
    provider: entry.provider,
    bytes,
  });
  memoryBytes += bytes;
};

const openDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(new Error('Could not open IndexedDB'));
    request.onblocked = () => reject(new Error('Translation cache database is blocked'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('provider', 'provider', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });

export const getCacheKey = (
  text: string,
  sourceLang: string,
  targetLang: string,
  provider: string,
  context?: string,
): string =>
  context === undefined
    ? `${provider}:${sourceLang}:${targetLang}:${text}`
    : `${provider}:${JSON.stringify([sourceLang, targetLang, context, text])}`;

export const getFromCache = async (
  text: string,
  sourceLang: string,
  targetLang: string,
  provider: string,
  context?: string,
): Promise<string | null> => {
  if (!text?.trim()) return null;
  const key = getCacheKey(text, sourceLang, targetLang, provider, context);
  const cached = memoryCache.get(key);
  if (cached) {
    memoryCache.delete(key);
    memoryCache.set(key, cached);
    return cached.translation;
  }
  let db: IDBDatabase | undefined;
  try {
    db = await openDatabase();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(key);
    return await new Promise<string | null>((resolve) => {
      transaction.onabort = transaction.onerror = () => resolve(null);
      request.onerror = () => resolve(null);
      request.onsuccess = () => {
        const entry = request.result as CacheEntry | undefined;
        if (!entry || typeof entry.translation !== 'string') {
          resolve(null);
          return;
        }
        remember(entry);
        resolve(entry.translation);
      };
    });
  } catch {
    return null;
  } finally {
    db?.close();
  }
};

export const storeInCache = async (
  text: string,
  translation: string,
  sourceLang: string,
  targetLang: string,
  provider: string,
  context?: string,
): Promise<void> => {
  if (!text?.trim() || !translation) return;
  const entry: CacheEntry = {
    key: getCacheKey(text, sourceLang, targetLang, provider, context),
    translation,
    timestamp: Date.now(),
    provider,
    sourceLang,
    targetLang,
    originalText: text,
  };
  remember(entry);
  // Cache is disposable. Large results remain in durable translation sidecars.
  // Reject large strings before serializing. Escapes/UTF-8 encoding can only
  // increase this lower bound; the bounded serialized entry is checked next.
  const minimumBytes = [entry.key, translation, provider, sourceLang, targetLang, text].reduce(
    (total, value) => total + value.length,
    0,
  );
  if (minimumBytes > MAX_DB_ENTRY_BYTES) return;
  if (new TextEncoder().encode(JSON.stringify(entry)).byteLength > MAX_DB_ENTRY_BYTES) return;
  let db: IDBDatabase | undefined;
  try {
    db = await openDatabase();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.put(entry);
    const count = store.count();
    count.onsuccess = () => {
      let excess = count.result - MAX_DB_ENTRIES;
      if (excess <= 0) return;
      const cursor = store.index('timestamp').openCursor();
      cursor.onsuccess = () => {
        const item = cursor.result;
        if (!item || excess <= 0) return;
        // Retain the just-completed result even if the system clock moved back.
        if (item.primaryKey !== entry.key) {
          item.delete();
          excess -= 1;
        }
        item.continue();
      };
    };
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () =>
        reject(new Error('Translation cache write failed'));
    });
  } catch {
    /* Best-effort cache failure must not discard a completed translation. */
  } finally {
    db?.close();
  }
};

export interface CacheFilterOptions {
  provider?: string;
  maxAge?: number;
}
const matches = (entry: Pick<CacheEntry, 'provider' | 'timestamp'>, filter?: CacheFilterOptions) =>
  (!filter?.provider || entry.provider === filter.provider) &&
  (!filter?.maxAge || Date.now() - entry.timestamp >= filter.maxAge);

export const clearCache = async (filter?: CacheFilterOptions): Promise<number> => {
  let deletedCount = 0;
  for (const [key, entry] of memoryCache) {
    if (matches(entry, filter)) {
      forget(key);
      deletedCount += 1;
    }
  }
  let db: IDBDatabase | undefined;
  try {
    db = await openDatabase();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    if (!filter) store.clear();
    else {
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (matches(cursor.value as CacheEntry, filter)) cursor.delete();
        cursor.continue();
      };
    }
    await new Promise<void>((resolve) => {
      transaction.oncomplete = transaction.onerror = transaction.onabort = () => resolve();
    });
  } catch {
    /* The in-memory cache is still cleared when IndexedDB is unavailable. */
  } finally {
    db?.close();
  }
  return deletedCount;
};

export const getCacheStats = async (
  includeDB = false,
): Promise<{
  memoryCacheEntries: number;
  memoryCacheSizeInBytes: number;
  dbCacheEntries?: number;
  dbCacheSizeInBytes?: number;
}> => {
  const stats = { memoryCacheEntries: memoryCache.size, memoryCacheSizeInBytes: memoryBytes };
  if (!includeDB) return stats;
  let db: IDBDatabase | undefined;
  try {
    db = await openDatabase();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    let dbCacheEntries = 0;
    let dbCacheSizeInBytes = 0;
    const request = transaction.objectStore(STORE_NAME).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      dbCacheEntries += 1;
      dbCacheSizeInBytes += JSON.stringify(cursor.value).length * 2;
      cursor.continue();
    };
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () =>
        reject(new Error('Cache statistics failed'));
    });
    return { ...stats, dbCacheEntries, dbCacheSizeInBytes };
  } catch {
    return stats;
  } finally {
    db?.close();
  }
};
