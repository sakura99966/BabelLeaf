import { afterEach, expect, it } from 'vitest';
import { createStarDictProvider } from '@/services/dictionaries/providers/starDictProvider';
import type { ImportedDictionary } from '@/services/dictionaries/types';

const marker = '__babelleafDictionaryScriptSentinel';
const containers: HTMLElement[] = [];

afterEach(() => {
  for (const element of containers.splice(0)) element.remove();
  Reflect.deleteProperty(globalThis, marker);
});

async function lookupHtml(html: string) {
  const encoder = new TextEncoder();
  const content = encoder.encode(html);
  const word = encoder.encode('safe');
  const index = new Uint8Array(word.length + 9);
  index.set(word);
  const view = new DataView(index.buffer);
  view.setUint32(word.length + 1, 0, false);
  view.setUint32(word.length + 5, content.length, false);
  const ifo = [
    "StarDict's dict ifo file",
    'version=2.4.2',
    'wordcount=1',
    'idxfilesize=' + index.length,
    'bookname=Generated security fixture',
    'sametypesequence=h',
    '',
  ].join('\n');
  const files = new Map([
    ['safe.ifo', new File([ifo], 'safe.ifo')],
    ['safe.idx', new File([index], 'safe.idx')],
    ['safe.dict', new File([content], 'safe.dict')],
  ]);
  const dict: ImportedDictionary = {
    id: 'stardict:security',
    kind: 'stardict',
    name: 'Generated fixture',
    bundleDir: 'generated',
    files: { ifo: 'safe.ifo', idx: 'safe.idx', dict: 'safe.dict' },
    addedAt: 1,
  };
  const provider = createStarDictProvider({
    dict,
    fs: {
      async openFile(path: string) {
        const file = files.get(path.split('/').at(-1)!);
        if (!file) throw new Error('Missing generated fixture');
        return file;
      },
    },
  });
  const container = document.createElement('div');
  containers.push(container);
  document.body.append(container);
  expect(
    (await provider.lookup('safe', { container, signal: new AbortController().signal })).ok,
  ).toBe(true);
  return container;
}

it('renders legitimate local HTML without executing dictionary event handlers', async () => {
  const container = await lookupHtml(
    '<p>Safe definition</p><img src="data:,invalid" ' +
      'onerror="globalThis.__babelleafDictionaryScriptSentinel=1">',
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  expect(container.textContent).toContain('Safe definition');
  expect(Reflect.get(globalThis, marker)).toBeUndefined();
  expect(container.querySelector('[onerror],[src]')).toBeNull();
});
