/**
 * Registry for local imported dictionaries.
 *
 * Provider instances are cached by id so parsed indexes and object URLs are
 * reused within a session. The OS dictionary is a sentinel handled by the
 * annotator and is never returned as an in-popup provider.
 */
import type { DictionaryProvider, DictionarySettings, ImportedDictionary } from './types';
import { BUILTIN_PROVIDER_IDS } from './types';
import { isSystemDictionarySupported } from './systemDictionary';
import { createStarDictProvider, type DictionaryFileOpener } from './providers/starDictProvider';
import { createMdictProvider } from './providers/mdictProvider';
import { createDictProvider } from './providers/dictProvider';
import { createSlobProvider } from './providers/slobProvider';

const instanceCache = new Map<string, DictionaryProvider>();

interface RegistryArgs {
  settings: DictionarySettings;
  dictionaries: ImportedDictionary[];
  fs?: DictionaryFileOpener;
}

const getOrCreate = (
  dict: ImportedDictionary,
  fs: DictionaryFileOpener,
): DictionaryProvider | undefined => {
  const cached = instanceCache.get(dict.id);
  if (cached) return cached;

  const provider =
    dict.kind === 'stardict'
      ? createStarDictProvider({ dict, fs })
      : dict.kind === 'mdict'
        ? createMdictProvider({ dict, fs })
        : dict.kind === 'dict'
          ? createDictProvider({ dict, fs })
          : dict.kind === 'slob'
            ? createSlobProvider({ dict, fs })
            : undefined;

  if (provider) instanceCache.set(dict.id, provider);
  return provider;
};

export const getEnabledProviders = ({
  settings,
  dictionaries,
  fs,
}: RegistryArgs): DictionaryProvider[] => {
  if (!fs) return [];

  const dictById = new Map(dictionaries.map((dictionary) => [dictionary.id, dictionary]));
  const providers: DictionaryProvider[] = [];
  for (const id of settings.providerOrder) {
    if (id === BUILTIN_PROVIDER_IDS.systemDictionary) continue;
    // Ignore stale provider ids from releases that included online lookup.
    if (id.startsWith('builtin:') || id.startsWith('web:')) continue;
    if (settings.providerEnabled[id] === false) continue;

    const dict = dictById.get(id);
    if (!dict || dict.deletedAt || dict.unavailable || dict.unsupported) continue;
    const provider = getOrCreate(dict, fs);
    if (provider) providers.push(provider);
  }
  return providers;
};

export const isSystemDictionaryEnabled = (settings: DictionarySettings): boolean =>
  isSystemDictionarySupported() &&
  settings.providerEnabled[BUILTIN_PROVIDER_IDS.systemDictionary] === true;

export const evictProvider = (id: string): void => {
  const cached = instanceCache.get(id);
  cached?.dispose?.();
  instanceCache.delete(id);
};

export const __resetRegistryForTests = (): void => {
  for (const provider of instanceCache.values()) provider.dispose?.();
  instanceCache.clear();
};
