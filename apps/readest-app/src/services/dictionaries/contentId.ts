import { md5, partialMD5 } from '@/utils/md5';

/**
 * Compute a stable local content id for a dictionary bundle at import time.
 * It combines a sampled hash of the primary file with its byte size and the
 * sorted bundle filenames. Existing imports keep the same id algorithm that
 * was previously hosted in the removed sync adapter.
 *
 * Stardict primary = .ifo (small text; partialMD5 is effectively full-hash).
 * MDict primary    = .mdx (body).
 * DICT primary     = .dict.dz (compressed body).
 * Slob primary     = .slob (single-file bundle).
 *
 * Identical bundle content produces the same id, which supports local deduplication.
 */
export const computeDictionaryContentId = async (
  primary: File,
  filenames: string[],
): Promise<string> => {
  const partial = await partialMD5(primary);
  const sortedFilenames = [...filenames].sort();
  return md5(`${partial}|${primary.size}|${sortedFilenames.join(',')}`);
};
