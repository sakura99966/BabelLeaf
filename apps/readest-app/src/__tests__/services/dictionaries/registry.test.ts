import { beforeEach, describe, expect, it } from 'vitest';

import { __resetRegistryForTests, getEnabledProviders } from '@/services/dictionaries/registry';
import type { DictionarySettings, ImportedDictionary } from '@/services/dictionaries/types';

const fs = { openFile: async () => new File([], '') };

const dictionaries: ImportedDictionary[] = [
  {
    id: 'mdict:one',
    kind: 'mdict',
    name: 'One',
    bundleDir: 'one',
    files: { mdx: 'one.mdx' },
    addedAt: 1,
  },
  {
    id: 'mdict:two',
    kind: 'mdict',
    name: 'Two',
    bundleDir: 'two',
    files: { mdx: 'two.mdx' },
    addedAt: 2,
  },
  {
    id: 'mdict:missing',
    kind: 'mdict',
    name: 'Missing',
    bundleDir: 'missing',
    files: { mdx: 'missing.mdx' },
    addedAt: 3,
    unavailable: true,
  },
];

const settings: DictionarySettings = {
  providerOrder: ['mdict:two', 'mdict:one', 'mdict:missing'],
  providerEnabled: {
    'mdict:two': true,
    'mdict:one': true,
    'mdict:missing': true,
  },
};

describe('local dictionary registry', () => {
  beforeEach(__resetRegistryForTests);

  it('returns enabled local providers in configured order', () => {
    const providers = getEnabledProviders({ settings, dictionaries, fs });
    expect(providers.map((provider) => provider.id)).toEqual(['mdict:two', 'mdict:one']);
  });

  it('skips disabled, unavailable, unsupported, deleted, and unknown entries', () => {
    const providers = getEnabledProviders({
      settings: {
        ...settings,
        providerOrder: ['builtin:wikipedia', 'web:legacy', ...settings.providerOrder],
        providerEnabled: { ...settings.providerEnabled, 'mdict:two': false },
      },
      dictionaries,
      fs,
    });
    expect(providers.map((provider) => provider.id)).toEqual(['mdict:one']);
  });

  it('reuses a provider instance across lookups', () => {
    const first = getEnabledProviders({ settings, dictionaries, fs });
    const second = getEnabledProviders({ settings, dictionaries, fs });
    expect(first[0]).toBe(second[0]);
  });

  it('returns no popup provider without a local filesystem accessor', () => {
    expect(getEnabledProviders({ settings, dictionaries })).toEqual([]);
  });
});
