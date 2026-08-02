/**
 * CustomDictionaries — system-dictionary exclusivity lock.
 *
 * Older persisted settings can leave the System Dictionary "enabled" on a
 * platform that does not support the OS handoff (web, Linux, Windows). On
 * those platforms the row is hidden and the feature is a no-op at lookup time,
 * so it must not lock the other provider toggles. On supported platforms,
 * enabling it remains exclusive and locks the rest.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

import CustomDictionaries from '@/components/settings/CustomDictionaries';
import { useCustomDictionaryStore } from '@/store/customDictionaryStore';
import { BUILTIN_PROVIDER_IDS } from '@/services/dictionaries/types';
import type { DictionarySettings, ImportedDictionary } from '@/services/dictionaries/types';

// Per-test platform control. `isSystemDictionaryEnabled` (real, from the
// registry) reads `isSystemDictionarySupported`, so toggling these flips both
// the row visibility and the lock gate the component now relies on.
const platform = vi.hoisted(() => ({ supported: false, available: false }));
vi.mock('@/services/dictionaries/systemDictionary', () => ({
  isSystemDictionarySupported: () => platform.supported,
  isSystemDictionaryAvailable: () => platform.available,
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string) => s,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: {}, envConfig: {} }),
}));

vi.mock('@/hooks/useFileSelector', () => ({
  useFileSelector: () => ({ selectFiles: vi.fn() }),
}));

const LOCKED_TITLE = 'Disable System Dictionary first to change this.';

const localDictionaries: ImportedDictionary[] = [
  {
    id: 'mdict:first',
    kind: 'mdict',
    name: 'First',
    bundleDir: 'first',
    files: { mdx: 'first.mdx' },
    addedAt: 1,
  },
  {
    id: 'mdict:second',
    kind: 'mdict',
    name: 'Second',
    bundleDir: 'second',
    files: { mdx: 'second.mdx' },
    addedAt: 2,
  },
];

const seedSettings = (settings: DictionarySettings) => {
  useCustomDictionaryStore.setState({
    dictionaries: localDictionaries,
    settings,
    // The mount effect calls loadCustomDictionaries; no-op it so it can't
    // clobber the seeded state with on-disk defaults.
    loadCustomDictionaries: async () => {},
    saveCustomDictionaries: async () => {},
  });
};

const enabledSystemSettings: DictionarySettings = {
  providerOrder: [BUILTIN_PROVIDER_IDS.systemDictionary, 'mdict:first', 'mdict:second'],
  providerEnabled: {
    // Stale persisted value from an earlier platform or release.
    [BUILTIN_PROVIDER_IDS.systemDictionary]: true,
    'mdict:first': true,
    'mdict:second': true,
  },
};

const getToggles = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));

beforeEach(() => {
  platform.supported = false;
  platform.available = false;
});

afterEach(() => {
  cleanup();
});

describe('CustomDictionaries — system-dictionary lock', () => {
  it('does not lock other toggles when System Dictionary is unsupported on this platform', () => {
    // Web: not supported. System Dictionary row is hidden and the stale flag
    // must not lock local dictionaries.
    platform.supported = false;
    platform.available = false;
    seedSettings(enabledSystemSettings);

    const { container } = render(<CustomDictionaries onBack={() => {}} />);
    const toggles = getToggles(container);

    // Two visible rows (System Dictionary hidden on this platform).
    expect(toggles).toHaveLength(2);
    expect(toggles.every((t) => !t.disabled)).toBe(true);
    expect(toggles.some((t) => t.title === LOCKED_TITLE)).toBe(false);
  });

  it('locks other toggles when System Dictionary is supported and enabled', () => {
    // macOS: supported. Enabling System Dictionary is exclusive, so the other
    // providers stay read-only while the System row itself remains toggleable.
    platform.supported = true;
    platform.available = true;
    seedSettings(enabledSystemSettings);

    const { container } = render(<CustomDictionaries onBack={() => {}} />);
    const toggles = getToggles(container);

    // All three rows visible (System Dictionary first per providerOrder).
    expect(toggles).toHaveLength(3);
    const [systemToggle, ...otherToggles] = toggles;
    expect(systemToggle!.disabled).toBe(false);
    expect(systemToggle!.title).not.toBe(LOCKED_TITLE);
    expect(otherToggles.every((t) => t.disabled)).toBe(true);
    expect(otherToggles.every((t) => t.title === LOCKED_TITLE)).toBe(true);
  });
});
