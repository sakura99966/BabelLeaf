import { afterEach, expect, it } from 'vitest';
import { createStarDictProvider } from '@/services/dictionaries/providers/starDictProvider';
import { findDictionaryAnchor } from '@/services/dictionaries/safeDictionaryContent';
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
  const shadow = container.querySelector('.dict-shadow-host')!.shadowRoot!;
  expect(shadow.textContent).toContain('Safe definition');
  expect(Reflect.get(globalThis, marker)).toBeUndefined();
  expect(shadow.querySelector('[onerror],[src]')).toBeNull();
});

it('keeps dictionary selectors out of application chrome while preserving local styles', async () => {
  const chrome = document.createElement('div');
  chrome.id = 'babelleaf-app-chrome-sentinel';
  chrome.style.color = 'rgb(10, 20, 30)';
  chrome.textContent = 'Application chrome';
  containers.push(chrome);
  document.body.append(chrome);
  const container = await lookupHtml(
    '<style>#babelleaf-app-chrome-sentinel { color: rgb(210, 20, 30) !important; }' +
      '.local-definition { color: rgb(4, 50, 60); }</style>' +
      '<p class="local-definition">Scoped definition</p>',
  );
  expect(getComputedStyle(chrome).color).toBe('rgb(10, 20, 30)');
  const shadow = container.querySelector('.dict-shadow-host')?.shadowRoot;
  expect(shadow).toBeTruthy();
  expect(getComputedStyle(shadow!.querySelector('.local-definition')!).color).toBe(
    'rgb(4, 50, 60)',
  );
});

it('clips fixed dictionary overlays to a trusted outer boundary', async () => {
  const chrome = document.createElement('div');
  chrome.style.cssText = 'position:fixed;left:0;top:0;width:50px;height:50px;z-index:1';
  chrome.textContent = 'Application controls';
  containers.push(chrome);
  document.body.append(chrome);
  const canHitTest = document.elementFromPoint(20, 20) === chrome;
  const container = await lookupHtml(
    '<style>:host { position: fixed !important; inset: 0 !important; z-index: 2147483647; }' +
      '.hostile-overlay { position: fixed; inset: 0; z-index: 2147483647; background: red; }' +
      '</style><p>Definition</p><div class="hostile-overlay">Not application UI</div>',
  );
  container.style.cssText = 'position:relative;margin-top:200px;width:200px';
  const shadow = container.querySelector('.dict-shadow-host')!.shadowRoot!;
  const boundary = shadow.host.parentElement!;
  const overlay = shadow.querySelector('.hostile-overlay')!;
  const containedRect = overlay.getBoundingClientRect();
  expect(containedRect.y).toBeCloseTo(boundary.getBoundingClientRect().y, 1);
  expect(containedRect.width).toBeCloseTo(boundary.getBoundingClientRect().width, 1);
  // Hidden WebKitGTK windows do not expose a hit-testing surface. Geometry
  // remains exercised there; visible Chromium/WebView2 additionally hit-test.
  if (canHitTest) expect(document.elementFromPoint(20, 20)).toBe(chrome);
  // Positive control: removing our trusted containment really lets fixed
  // content escape to the viewport, so the geometry assertion is meaningful.
  boundary.style.contain = 'none';
  expect(overlay.getBoundingClientRect().y).not.toBeCloseTo(containedRect.y, 1);
  boundary.style.contain = 'layout paint style';
});

it('preserves font scaling and composed explicit link clicks for isolated HTML', async () => {
  const container = await lookupHtml(
    '<p>Local definition</p><a href="https://example.invalid/explicit"><strong>Reference</strong></a>',
  );
  container.dataset['dictContent'] = '';
  const style = document.createElement('style');
  style.textContent =
    '[data-dict-content] .dict-shadow-host::part(dict-content) {' +
    'font-size: calc(var(--dict-font-scale, 1) * 0.875rem); }';
  container.append(style);
  const shadow = container.querySelector('.dict-shadow-host')!.shadowRoot!;
  const body = shadow.querySelector('[part="dict-content"]')!;
  const base = parseFloat(getComputedStyle(body).fontSize);
  container.style.setProperty('--dict-font-scale', '1.5');
  expect(parseFloat(getComputedStyle(body).fontSize)).toBeCloseTo(base * 1.5, 1);
  let delegatedLink: HTMLAnchorElement | null = null;
  container.addEventListener('click', (event) => {
    event.preventDefault();
    expect(event.target).toBe(shadow.host);
    delegatedLink = findDictionaryAnchor(event, container);
  });
  shadow
    .querySelector('strong')!
    .dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, cancelable: true }));
  expect(delegatedLink).toBe(shadow.querySelector('a'));
});
