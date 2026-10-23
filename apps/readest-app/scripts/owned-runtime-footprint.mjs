import { lstat, readdir } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

/** Read-only, bounded accounting; links/junctions never expand the owned scope. */
export async function measureOwnedRuntimeFootprint(root, { maxBytes = 1024 * 1024 * 1024, maxEntries = 100000 } = {}) {
  if (typeof root !== 'string' || !isAbsolute(root) || !Number.isSafeInteger(maxBytes)
    || maxBytes <= 0 || !Number.isSafeInteger(maxEntries) || maxEntries <= 0)
    throw new Error('Invalid owned footprint bounds');
  const base = await lstat(root);
  if (!base.isDirectory() || base.isSymbolicLink()) throw new Error('Footprint root must be a real directory');
  const result = { bytes: 0, files: 0, entries: 0, skippedLinks: 0 };
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    let children;
    try {
      const directory = await lstat(current);
      if (directory.isSymbolicLink()) { result.skippedLinks++; continue; }
      children = await readdir(current, { withFileTypes: true });
    } catch (error) { if (error?.code === 'ENOENT') continue; throw error; }
    for (const entry of children) {
      if (++result.entries > maxEntries) throw new Error('Owned footprint entry budget exceeded');
      const path = join(current, entry.name);
      let item;
      try { item = await lstat(path); }
      catch (error) { if (error?.code === 'ENOENT') continue; throw error; }
      if (item.isSymbolicLink()) { result.skippedLinks++; continue; }
      if (item.isDirectory()) pending.push(path);
      else if (item.isFile()) {
        result.files++;
        result.bytes += item.size;
        if (result.bytes > maxBytes) throw new Error('Owned generated disk footprint budget exceeded');
      }
    }
  }
  return result;
}
