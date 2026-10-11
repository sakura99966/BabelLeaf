import { beforeEach, expect, test } from 'vitest';
import {
  clearCache,
  getCacheKey,
  getCacheStats,
  getFromCache,
  storeInCache,
} from '@/services/translators/cache';

beforeEach(async () => {
  await clearCache();
});

test('prunes old persistent entries during the same transaction as a new cached result', async () => {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('TranslationCache', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    const transaction = db.transaction('translations', 'readwrite');
    const store = transaction.objectStore('translations');
    for (let index = 0; index < 2050; index += 1) {
      const text = `seed-${index}`;
      store.put({
        key: getCacheKey(text, 'en', 'zh', 'deepseek'),
        originalText: text,
        translation: `saved-${index}`,
        provider: 'deepseek',
        sourceLang: 'en',
        targetLang: 'zh',
        timestamp: index,
      });
    }
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
  await storeInCache('fresh', 'new result', 'en', 'zh', 'deepseek', 'model-v1');
  expect((await getCacheStats(true)).dbCacheEntries).toBe(2048);
  expect(await getFromCache('seed-0', 'en', 'zh', 'deepseek')).toBeNull();
  expect(await getFromCache('seed-2049', 'en', 'zh', 'deepseek')).toBe('saved-2049');
  expect(await getFromCache('fresh', 'en', 'zh', 'deepseek', 'model-v1')).toBe('new result');
});

test('large completed results stay available in bounded memory without filling persistent cache', async () => {
  const result = '译'.repeat(40000);
  await storeInCache('source', result, 'en', 'zh', 'deepseek');
  expect(await getFromCache('source', 'en', 'zh', 'deepseek')).toBe(result);
  expect((await getCacheStats(true)).dbCacheEntries).toBe(0);
});

test('persistent entry budget counts UTF-8 bytes rather than UTF-16 characters', async () => {
  const result = '译'.repeat(24000);
  await storeInCache('source', result, 'en', 'zh', 'deepseek');
  expect(await getFromCache('source', 'en', 'zh', 'deepseek')).toBe(result);
  expect((await getCacheStats(true)).dbCacheEntries).toBe(0);
});
