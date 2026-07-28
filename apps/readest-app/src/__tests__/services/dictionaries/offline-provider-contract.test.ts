import { describe, expect, it } from 'vitest';

import { getEnabledProviders } from '@/services/dictionaries/registry';
import type { DictionarySettings } from '@/services/dictionaries/types';

describe('offline dictionary provider contract', () => {
  it('does not resolve removed Wikipedia, Wiktionary, or web-search ids', () => {
    const settings: DictionarySettings = {
      providerOrder: [
        'builtin:wiktionary',
        'builtin:wikipedia',
        'web:builtin:google',
        'web:custom',
      ],
      providerEnabled: {
        'builtin:wiktionary': true,
        'builtin:wikipedia': true,
        'web:builtin:google': true,
        'web:custom': true,
      },
    };

    expect(getEnabledProviders({ settings, dictionaries: [] })).toEqual([]);
  });
});
