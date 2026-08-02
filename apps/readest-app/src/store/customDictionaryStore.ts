import { create } from 'zustand';
import { EnvConfigType } from '@/services/environment';
import type { DictionarySettings, ImportedDictionary } from '@/services/dictionaries/types';
import { BUILTIN_PROVIDER_IDS } from '@/services/dictionaries/types';
import { useSettingsStore } from './settingsStore';

const DEFAULT_DICTIONARY_SETTINGS: DictionarySettings = {
  providerOrder: [BUILTIN_PROVIDER_IDS.systemDictionary],
  providerEnabled: {
    // System dictionary is opt-in — enabling it disables the rest (and
    // vice versa) via the settings UI's exclusivity rule. Default off
    // so existing users see no behavior change on upgrade.
    [BUILTIN_PROVIDER_IDS.systemDictionary]: false,
  },
  fontScale: 1,
};

const isOfflineProviderId = (id: string): boolean =>
  id === BUILTIN_PROVIDER_IDS.systemDictionary ||
  (!id.startsWith('builtin:') && !id.startsWith('web:'));

interface DictionaryStoreState {
  /** Imported local dictionaries. */
  dictionaries: ImportedDictionary[];
  settings: DictionarySettings;

  /** Imported entries currently visible, sorted by addedAt descending. */
  getAvailableDictionaries(): ImportedDictionary[];
  getDictionary(id: string): ImportedDictionary | undefined;

  /** Add (or revive) an imported dictionary. New entries are appended to providerOrder + enabled. */
  addDictionary(dict: ImportedDictionary): void;
  /**
   * Clear the transient `unavailable` flag after a local import restores the
   * bundle. No-op when no dictionary has the supplied content id.
   */
  markAvailableByContentId(contentId: string): void;
  /**
   * Patch an imported dictionary's mutable display fields (currently just
   * `name`). The on-disk bundle is untouched. No-op if the id is unknown
   * or refers to a deleted entry.
   */
  updateDictionary(id: string, patch: { name?: string }): void;
  /**
   * Drop one or more existing dictionaries by id and insert `newDict` in
   * the first removed entry's slot in `providerOrder`, inheriting that
   * entry's enabled flag. Used by the importer when a re-imported dict
   * matches an existing one (or several) by name.
   */
  replaceDictionaries(oldIds: string[], newDict: ImportedDictionary): void;
  /** Remove an imported entry by id and clear its display settings. */
  removeDictionary(id: string): boolean;
  /** Replace a subset of provider ids in providerOrder; ignores unknown ids. */
  reorder(ids: string[]): void;
  /** Toggle a provider's enabled flag. Both builtin and imported ids are accepted. */
  setEnabled(id: string, enabled: boolean): void;
  /** Persist the last-used tab id so the popup re-opens on it. */
  setDefaultProviderId(id: string | undefined): void;
  /** Set the dictionary popup font-size multiplier (#4443). */
  setFontScale(scale: number): void;

  /** Hydrate from `settings.customDictionaries` + `settings.dictionarySettings` + check on-disk availability. */
  loadCustomDictionaries(envConfig: EnvConfigType): Promise<void>;
  /** Persist imported dictionary metadata and local display settings. */
  saveCustomDictionaries(envConfig: EnvConfigType): Promise<void>;
}

function toSettingsDict(dict: ImportedDictionary): ImportedDictionary {
  // Strip transient fields before persisting. `unavailable` is recomputed at
  // load time from the actual filesystem state, so don't write it.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { unavailable: _u, ...rest } = dict;
  return rest;
}

export const useCustomDictionaryStore = create<DictionaryStoreState>((set, get) => ({
  dictionaries: [],
  settings: { ...DEFAULT_DICTIONARY_SETTINGS },

  getAvailableDictionaries: () =>
    get()
      .dictionaries.filter((d) => !d.deletedAt)
      .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0)),

  getDictionary: (id) => get().dictionaries.find((d) => d.id === id),

  addDictionary: (dict) => {
    set((state) => {
      const existingIdx = state.dictionaries.findIndex((d) => d.id === dict.id);
      const dictionaries =
        existingIdx >= 0
          ? state.dictionaries.map((d, i) =>
              i === existingIdx ? { ...dict, deletedAt: undefined } : d,
            )
          : [...state.dictionaries, dict];
      // Fresh imports go to the TOP of providerOrder so the user sees
      // the dict they just added without scrolling. Reviving an
      // existing entry preserves its current slot — we only insert
      // when the id is genuinely new to the order.
      const order = state.settings.providerOrder.includes(dict.id)
        ? state.settings.providerOrder
        : [dict.id, ...state.settings.providerOrder];
      const enabled = { ...state.settings.providerEnabled };
      if (!(dict.id in enabled)) enabled[dict.id] = !dict.unsupported;
      return {
        dictionaries,
        settings: { ...state.settings, providerOrder: order, providerEnabled: enabled },
      };
    });
  },

  markAvailableByContentId: (contentId) => {
    set((state) => ({
      dictionaries: state.dictionaries.map((d) =>
        d.contentId === contentId ? { ...d, unavailable: undefined } : d,
      ),
    }));
  },

  updateDictionary: (id, patch) => {
    set((state) => {
      const idx = state.dictionaries.findIndex((d) => d.id === id);
      if (idx < 0) return state;
      const old = state.dictionaries[idx]!;
      if (old.deletedAt) return state;
      const trimmedName = patch.name?.trim();
      // Reject undefined (no patch), empty (would clear the label), and
      // unchanged (no-op).
      if (!trimmedName || trimmedName === old.name) return state;
      const updated = { ...old, name: trimmedName };
      const dictionaries = state.dictionaries.map((d, i) => (i === idx ? updated : d));
      return { dictionaries };
    });
  },

  replaceDictionaries: (oldIds, newDict) => {
    if (oldIds.length === 0) {
      get().addDictionary(newDict);
      return;
    }
    const oldIdSet = new Set(oldIds);
    set((state) => {
      // Drop all old entries because their disk bundles are gone, then append
      // the replacement.
      const dictionaries = state.dictionaries.filter((d) => !oldIdSet.has(d.id));
      dictionaries.push(newDict);

      // Splice the new id into providerOrder at the first old slot. Drop
      // any further old slots.
      const oldOrder = state.settings.providerOrder;
      const providerOrder: string[] = [];
      let inserted = false;
      for (const id of oldOrder) {
        if (oldIdSet.has(id)) {
          if (!inserted) {
            providerOrder.push(newDict.id);
            inserted = true;
          }
        } else {
          providerOrder.push(id);
        }
      }
      if (!inserted) providerOrder.push(newDict.id);

      // Inherit the first old entry's enabled flag (default to !unsupported
      // if the old wasn't recorded).
      const firstOldId = oldIds[0]!;
      const inheritedEnabled =
        state.settings.providerEnabled[firstOldId] !== undefined
          ? state.settings.providerEnabled[firstOldId] !== false
          : !newDict.unsupported;
      const providerEnabled = { ...state.settings.providerEnabled };
      for (const oldId of oldIds) delete providerEnabled[oldId];
      providerEnabled[newDict.id] = inheritedEnabled;

      return {
        dictionaries,
        settings: { ...state.settings, providerOrder, providerEnabled },
      };
    });
  },

  removeDictionary: (id) => {
    if (!get().dictionaries.some((d) => d.id === id)) return false;
    set((state) => ({
      dictionaries: state.dictionaries.filter((d) => d.id !== id),
      settings: {
        ...state.settings,
        providerOrder: state.settings.providerOrder.filter((p) => p !== id),
        providerEnabled: Object.fromEntries(
          Object.entries(state.settings.providerEnabled).filter(([k]) => k !== id),
        ),
      },
    }));
    return true;
  },

  reorder: (ids) => {
    set((state) => {
      // Keep only ids that still exist; tail any known ids missing from the input.
      const known = new Set(state.settings.providerOrder);
      const filtered = ids.filter((id) => known.has(id));
      const tail = state.settings.providerOrder.filter((id) => !filtered.includes(id));
      return {
        settings: { ...state.settings, providerOrder: [...filtered, ...tail] },
      };
    });
  },

  setEnabled: (id, enabled) => {
    set((state) => {
      // System-dictionary exclusivity is enforced at LOOKUP time:
      // `isSystemDictionaryEnabled` short-circuits to the OS handoff before
      // any in-app provider runs. Persisting each provider's enabled state
      // independently lets the user toggle System on/off without losing
      // their preferred set of in-app providers — every flag is restored
      // verbatim the moment System is turned back off.
      const next: Record<string, boolean> = {
        ...state.settings.providerEnabled,
        [id]: enabled,
      };
      return {
        settings: { ...state.settings, providerEnabled: next },
      };
    });
  },

  setDefaultProviderId: (id) => {
    set((state) => ({
      settings: { ...state.settings, defaultProviderId: id },
    }));
  },

  setFontScale: (scale) => {
    set((state) => ({
      settings: { ...state.settings, fontScale: scale },
    }));
  },

  loadCustomDictionaries: async (envConfig) => {
    try {
      const { settings } = useSettingsStore.getState();
      const persisted = settings?.customDictionaries ?? [];
      const persistedSettings = settings?.dictionarySettings ?? DEFAULT_DICTIONARY_SETTINGS;
      const appService = await envConfig.getAppService();
      const dictionaries = await Promise.all(
        persisted
          .filter((dict) => !dict.deletedAt)
          .map(async (dict) => {
            const exists = await appService.exists(dict.bundleDir, 'Dictionaries');
            return exists ? dict : { ...dict, unavailable: true };
          }),
      );

      // Self-healing migration: discard settings for deleted dictionaries
      // and online providers that are no longer supported.
      const tombstonedIds = new Set(persisted.filter((d) => d.deletedAt).map((d) => d.id));
      const keepProvider = (id: string) => !tombstonedIds.has(id) && isOfflineProviderId(id);

      // Merge defaults to back-fill the system-dictionary sentinel.
      const persistedOrder = persistedSettings.providerOrder.filter(keepProvider);
      const orderSet = new Set(persistedOrder);
      const merged: string[] = persistedOrder.length
        ? [...persistedOrder]
        : [...DEFAULT_DICTIONARY_SETTINGS.providerOrder];
      for (const id of DEFAULT_DICTIONARY_SETTINGS.providerOrder) {
        if (!orderSet.has(id)) {
          merged.push(id);
          orderSet.add(id);
        }
      }
      const persistedEnabled = Object.fromEntries(
        Object.entries(persistedSettings.providerEnabled).filter(([id]) => keepProvider(id)),
      );
      // Keep enabled local providers visible even if an older settings file
      // omitted their providerOrder slot.
      const orphans: string[] = [];
      for (const id of Object.keys(persistedEnabled)) {
        if (!orderSet.has(id)) {
          orphans.push(id);
          orderSet.add(id);
        }
      }
      if (orphans.length > 0) {
        // Insert orphans before the system sentinel so
        // user-imported dicts stay contiguous near the top of the list.
        // If the sentinel is missing, append the orphans at the end.
        const firstBuiltinIdx = merged.indexOf(BUILTIN_PROVIDER_IDS.systemDictionary);
        if (firstBuiltinIdx < 0) {
          merged.push(...orphans);
        } else {
          merged.splice(firstBuiltinIdx, 0, ...orphans);
        }
      }
      const settingsMerged: DictionarySettings = {
        providerOrder: merged,
        providerEnabled: {
          ...DEFAULT_DICTIONARY_SETTINGS.providerEnabled,
          ...persistedEnabled,
        },
        defaultProviderId:
          persistedSettings.defaultProviderId &&
          isOfflineProviderId(persistedSettings.defaultProviderId)
            ? persistedSettings.defaultProviderId
            : undefined,
        fontScale: persistedSettings.fontScale ?? DEFAULT_DICTIONARY_SETTINGS.fontScale,
      };
      set({ dictionaries, settings: settingsMerged });
    } catch (error) {
      console.error('Failed to load custom dictionaries settings:', error);
    }
  },

  saveCustomDictionaries: async (envConfig) => {
    try {
      const { settings, setSettings, saveSettings } = useSettingsStore.getState();
      const { dictionaries, settings: dictSettings } = get();
      // Build a new object so Zustand subscribers observe the update.
      const next = {
        ...settings,
        customDictionaries: dictionaries.map(toSettingsDict),
        dictionarySettings: dictSettings,
      };
      setSettings(next);
      saveSettings(envConfig, next);
    } catch (error) {
      console.error('Failed to save custom dictionaries settings:', error);
      throw error;
    }
  },
}));
