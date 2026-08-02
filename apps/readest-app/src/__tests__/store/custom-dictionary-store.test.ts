import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BUILTIN_PROVIDER_IDS } from '@/services/dictionaries/types';
import type { ImportedDictionary } from '@/services/dictionaries/types';
import { useCustomDictionaryStore } from '@/store/customDictionaryStore';
import { useSettingsStore } from '@/store/settingsStore';

const dictionary = (id: string): ImportedDictionary => ({
  id,
  contentId: `content:${id}`,
  kind: 'mdict',
  name: id,
  bundleDir: id,
  files: { mdx: `${id}.mdx` },
  addedAt: 1,
});

describe('customDictionaryStore local providers', () => {
  beforeEach(() => {
    useCustomDictionaryStore.setState({
      dictionaries: [],
      settings: {
        providerOrder: [BUILTIN_PROVIDER_IDS.systemDictionary],
        providerEnabled: { [BUILTIN_PROVIDER_IDS.systemDictionary]: false },
        fontScale: 1,
      },
    });
  });

  it('adds a local dictionary at the front and enables it', () => {
    useCustomDictionaryStore.getState().addDictionary(dictionary('mdict:new'));

    const state = useCustomDictionaryStore.getState();
    expect(state.settings.providerOrder).toEqual([
      'mdict:new',
      BUILTIN_PROVIDER_IDS.systemDictionary,
    ]);
    expect(state.settings.providerEnabled['mdict:new']).toBe(true);
  });

  it('removes a local dictionary from order and enabled settings', () => {
    useCustomDictionaryStore.getState().addDictionary(dictionary('mdict:remove'));

    expect(useCustomDictionaryStore.getState().removeDictionary('mdict:remove')).toBe(true);
    const state = useCustomDictionaryStore.getState();
    expect(state.settings.providerOrder).not.toContain('mdict:remove');
    expect(state.settings.providerEnabled).not.toHaveProperty('mdict:remove');
    expect(state.dictionaries).toEqual([]);
  });

  it('reorders only known provider ids', () => {
    useCustomDictionaryStore.getState().addDictionary(dictionary('mdict:first'));
    useCustomDictionaryStore.getState().addDictionary(dictionary('mdict:second'));

    useCustomDictionaryStore.getState().reorder(['mdict:first', 'unknown']);

    expect(useCustomDictionaryStore.getState().settings.providerOrder).toEqual([
      'mdict:first',
      'mdict:second',
      BUILTIN_PROVIDER_IDS.systemDictionary,
    ]);
  });

  it('clears a stale unavailable flag after local re-import', () => {
    useCustomDictionaryStore.setState({
      dictionaries: [{ ...dictionary('mdict:local'), unavailable: true }],
    });

    useCustomDictionaryStore.getState().markAvailableByContentId('content:mdict:local');

    expect(useCustomDictionaryStore.getState().dictionaries[0]?.unavailable).toBeUndefined();
  });

  it('migrates legacy online providers and dictionary tombstones out of local settings', async () => {
    const live = dictionary('mdict:live');
    const deleted = { ...dictionary('mdict:deleted'), deletedAt: 1 };
    useSettingsStore.setState((state) => ({
      settings: {
        ...state.settings,
        customDictionaries: [live, deleted],
        dictionarySettings: {
          providerOrder: ['builtin:wiktionary', 'web:builtin:google', live.id, deleted.id],
          providerEnabled: {
            'builtin:wiktionary': true,
            'web:builtin:google': true,
            [live.id]: true,
            [deleted.id]: true,
          },
          defaultProviderId: 'builtin:wiktionary',
          fontScale: 1,
        },
      },
    }));
    const exists = vi.fn(async () => true);

    await useCustomDictionaryStore.getState().loadCustomDictionaries({
      getAppService: async () => ({ exists }) as never,
    });

    const state = useCustomDictionaryStore.getState();
    expect(state.dictionaries).toEqual([live]);
    expect(state.settings).toMatchObject({
      providerOrder: [live.id, BUILTIN_PROVIDER_IDS.systemDictionary],
      providerEnabled: {
        [live.id]: true,
        [BUILTIN_PROVIDER_IDS.systemDictionary]: false,
      },
      defaultProviderId: undefined,
    });
  });
});
