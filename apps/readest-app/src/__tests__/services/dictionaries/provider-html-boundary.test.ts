import { afterEach, expect, it, vi } from 'vitest';
import { createMdictProvider } from '@/services/dictionaries/providers/mdictProvider';
import { createSlobProvider } from '@/services/dictionaries/providers/slobProvider';
import { SlobReader } from '@/services/dictionaries/slobReader';
import { readSlobFile, SLOB_FIXTURE_NAME } from './_slobFixtures';
import type { ImportedDictionary } from '@/services/dictionaries/types';

const payload =
  '<p class="definition">safe meaning</p><img src="data:,x" onerror="alert(1)">' +
  '<iframe srcdoc="bad"></iframe><script>alert(1)</script>' +
  '<style>@import "https://invalid.example/style.css";</style>';

afterEach(() => vi.restoreAllMocks());

it('SLOB HTML reaches the same sanitized boundary as StarDict', async () => {
  vi.spyOn(SlobReader.prototype, 'readBlob').mockResolvedValue({
    contentType: 'text/html',
    data: new TextEncoder().encode(payload),
  });
  const dict: ImportedDictionary = {
    id: 'slob:security',
    kind: 'slob',
    name: 'fixture',
    addedAt: 1,
    bundleDir: 'fixture',
    files: { slob: SLOB_FIXTURE_NAME },
  };
  const provider = createSlobProvider({ dict, fs: { openFile: async () => readSlobFile() } });
  const container = document.createElement('div');
  expect(
    (
      await provider.lookup('hello', {
        container,
        signal: new AbortController().signal,
      })
    ).ok,
  ).toBe(true);
  expect(container.textContent).toContain('safe meaning');
  expect(container.querySelector('[src],[onerror],iframe,script')).toBeNull();
  expect(container.textContent).not.toContain('invalid.example');
});

it('MDict strips hostile HTML before resource lookup, including redirect detection', async () => {
  const { MDX } = await import('js-mdict');
  vi.spyOn(MDX, 'create').mockResolvedValue({
    meta: { encrypt: 0 },
    header: {},
    lookup: async (word: string) => ({ keyText: word, definition: payload }),
  } as unknown as Awaited<ReturnType<typeof MDX.create>>);
  const dict: ImportedDictionary = {
    id: 'mdict:security',
    kind: 'mdict',
    name: 'fixture',
    addedAt: 1,
    bundleDir: 'fixture',
    files: { mdx: 'fixture.mdx' },
  };
  const provider = createMdictProvider({
    dict,
    fs: { openFile: async () => new File(['fixture'], 'fixture.mdx') },
  });
  const container = document.createElement('div');
  expect(
    (
      await provider.lookup('hello', {
        container,
        signal: new AbortController().signal,
      })
    ).ok,
  ).toBe(true);
  const shadow = container.querySelector('.dict-shadow-host')!.shadowRoot!;
  expect(shadow.textContent).toContain('safe meaning');
  expect(shadow.querySelector('[src],[onerror],iframe,script')).toBeNull();
  expect(shadow.textContent).not.toContain('invalid.example');
});
