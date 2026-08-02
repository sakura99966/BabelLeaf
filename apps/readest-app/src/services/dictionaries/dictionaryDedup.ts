import type { ImportedDictionary } from './types';

/**
 * Resolve which existing (non-deleted) entries the incoming bundle should
 * replace. Match by contentId first (stable per file content; survives
 * user-driven renames), fall back to name when either side lacks contentId
 * (legacy bundles imported before the contentId field existed).
 *
 * Returns all matching existing entries — multiple are possible when the
 * user previously imported the same file more than once.
 */
export const findExistingDictionaryMatches = (
  incoming: ImportedDictionary,
  existing: ImportedDictionary[],
): ImportedDictionary[] => {
  const live = existing.filter((d) => !d.deletedAt);

  if (incoming.contentId) {
    const byContent = live.filter((d) => d.contentId === incoming.contentId);
    if (byContent.length > 0) return byContent;
    // contentId is set on the incoming side but no existing entry has it.
    // Fall through to name match for legacy entries (contentId-less) that
    // could correspond to the same file under a previous import.
  }

  return live.filter((d) => !d.contentId && d.name === incoming.name);
};

/**
 * Preserve durable local state when a live dictionary is re-imported.
 *
 * The fresh import owns parsed/file-backed fields (`id`, `bundleDir`,
 * `files`, `contentId`, `kind`, `lang`, unsupported status). The existing
 * live entry owns user/local continuity fields: display name, original
 * import time.
 */
export const preserveLiveDictionaryState = (
  incoming: ImportedDictionary,
  matches: ImportedDictionary[],
): ImportedDictionary => {
  if (matches.length === 0) return { ...incoming };
  const first = matches[0]!;
  return {
    ...incoming,
    name: first.name,
    addedAt: first.addedAt,
  };
};
