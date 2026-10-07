// Read-only source probes. Run from repository root with node.
// In-memory files and mocked provider responses only; no API keys or network calls.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../..');
const app = path.join(root, 'apps/readest-app');
const req = createRequire(path.join(app, 'package.json'));
const ts = require(path.join(root, 'node_modules/typescript'));
const cache = new Map();
const mocks = new Map();
const cspConfig = JSON.parse(fs.readFileSync(path.join(app, 'src-tauri/tauri.conf.json'), 'utf8')).app.security.csp;
const csp = Object.entries(cspConfig).map(([key, value]) => `${key} ${value}`).join('; ');
function load(file) {
  file = path.resolve(file);
  if (!path.extname(file)) file += '.ts';
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} };
  cache.set(file, mod);
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const localRequire = (id) => {
    if (mocks.has(id)) return mocks.get(id);
    if (id.startsWith('@/')) return load(path.join(app, 'src', id.slice(2)));
    if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id));
    return req(id);
  };
  vm.runInThisContext(`(function(require,module,exports){${js}\n})`, { filename: file })(localRequire, mod, mod.exports);
  return mod.exports;
}
const src = (name) => path.join(app, 'src', name);
const results = [];
async function main() {
  const { safeSaveJSON, safeLoadJSON } = load(src('services/persistence.ts'));
  const files = new Map();
  let releaseOld;
  const oldBlocked = new Promise((resolve) => { releaseOld = resolve; });
  let oldStarted;
  const started = new Promise((resolve) => { oldStarted = resolve; });
  const storage = {
    async writeFile(name, base, data) {
      if (name === 'state.json' && JSON.parse(data).revision === 1) {
        oldStarted();
        await oldBlocked;
      }
      files.set(name, data);
    },
    async readFile(name) { return files.get(name); },
  };
  const older = safeSaveJSON(storage, 'state.json', 'Data', { revision: 1 });
  await started;
  await safeSaveJSON(storage, 'state.json', 'Data', { revision: 2 });
  releaseOld();
  await older;
  const recovered = await safeLoadJSON(storage, 'state.json', 'Data', null);
  assert.equal(recovered.revision, 1);
  assert.equal(JSON.parse(files.get('state.json.bak')).revision, 2);
  results.push({ id: 'AUD-03', reproduced: true, mainRevision: recovered.revision, backupRevision: 2 });

  mocks.set('../utils/httpFetch', { getAIFetch: () => async () => new Response(JSON.stringify({
    content: [{ type: 'text', text: 'partial translation' }], stop_reason: 'max_tokens',
  }), { status: 200 }) });
  const { AnthropicProvider } = load(src('services/ai/providers/AnthropicProvider.ts'));
  const provider = new AnthropicProvider({ anthropicApiKey: 'audit-placeholder' });
  const output = await provider.generateText({ system: 'translate', prompt: 'local synthetic text' });
  assert.equal(output, 'partial translation');
  results.push({ id: 'AUD-04', reproduced: true, stopReason: 'max_tokens', acceptedAsSuccess: output });

  const { TranslationBatchController, createEmptyTranslationArtifact } = load(src('services/translators/batch.ts'));
  let failOnce = true;
  let savedJobs = 0;
  const unhandled = [];
  const onUnhandled = (error) => unhandled.push(String(error));
  process.on('unhandledRejection', onUnhandled);
  const controller = new TranslationBatchController({
    artifact: createEmptyTranslationArtifact({ bookHash: 'audit', provider: 'deepseek', sourceLang: 'en', targetLang: 'zh-CN', promptVersion: 'translation-v1' }),
    items: [{ id: 'one', text: 'one' }],
    translate: async () => 'translated',
    jobStore: { async save() { if (failOnce) { failOnce = false; throw new Error('synthetic disk failure'); } savedJobs++; } },
  });
  await new Promise((resolve) => setImmediate(resolve));
  await controller.start().catch(() => {});
  await new Promise((resolve) => setImmediate(resolve));
  await controller.flush().catch(() => {});
  assert.equal(savedJobs, 0);
  assert.equal(controller.getSnapshot().status, 'completed');
  process.removeListener('unhandledRejection', onUnhandled);
  results.push({ id: 'AUD-05', reproduced: true, successfulWritesAfterOneTransientFailure: savedJobs, queueStatus: controller.getSnapshot().status, unhandledRejections: unhandled.length });

  const { gzipSync } = req('fflate');
  const { loadDictBody } = load(src('services/dictionaries/dictZip.ts'));
  const expandedSize = 4 * 1024 * 1024;
  const compressed = gzipSync(new Uint8Array(expandedSize));
  const body = await loadDictBody(new Blob([compressed]));
  const expanded = await body.read(0, expandedSize);
  assert.equal(expanded.byteLength, expandedSize);
  results.push({ id: 'AUD-06', reproduced: true, compressedBytes: compressed.byteLength, expandedBytes: expanded.byteLength, note: 'bounded demonstration only; no OOM attempted' });

  const { chromium } = req('@playwright/test');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/*', (route) => {
      const name = new URL(route.request().url()).pathname.slice(1);
      if (['epub.js', 'epubcfi.js'].includes(name)) {
        return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(path.join(root, 'packages/foliate-js', name), 'utf8') });
      }
      return route.fulfill({ contentType: 'text/html', headers: { 'Content-Security-Policy': csp }, body: '<html><body>audit</body></html>' });
    });
    await page.goto('http://audit.invalid/');
    const proof = await page.evaluate(async () => {
      window.auditSentinel = 'untouched';
      const iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');
      const url = URL.createObjectURL(new Blob(['<script>parent.auditSentinel="book-script-executed"</script>'], { type: 'text/html' }));
      iframe.src = url;
      await new Promise((resolve) => { iframe.onload = resolve; document.body.appendChild(iframe); });
      const value = window.auditSentinel;
      iframe.remove();
      URL.revokeObjectURL(url);
      return value;
    });
    assert.equal(proof, 'book-script-executed');
    results.push({ id: 'AUD-01', reproduced: true, boundary: 'same-origin blob iframe primitive; application allowScript branch inspected separately', parentMutation: proof });
    const svgProof = await page.evaluate(async () => {
      const { EPUB } = await import('/epub.js');
      const entries = {
        'META-INF/container.xml': '<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
        'book.opf': '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">audit</dc:identifier><dc:title>Audit</dc:title><dc:language>en</dc:language><meta property="rendition:layout">pre-paginated</meta></metadata><manifest><item id="page" href="page.svg" media-type="image/svg+xml"/></manifest><spine><itemref idref="page"/></spine></package>',
        'page.svg': '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" onload="parent.auditSvgSentinel=\'svg-inline-executed\'"><text x="5" y="20">audit</text></svg>',
      };
      const book = await new EPUB({
        entries: Object.keys(entries).map((filename) => ({ filename })),
        loadText: async (name) => entries[name] ?? null,
        loadBlob: async (name) => new Blob([entries[name] ?? '']),
        getSize: (name) => entries[name]?.length ?? 0,
        sha1: async () => new ArrayBuffer(20),
      }).init();
      let htmlSanitizerReached = false;
      book.transformTarget.addEventListener('load', (event) => { if (event.detail.isScript) event.detail.allow = false; });
      // Same MIME gate as FoliateViewer.getDocTransformHandler, with allowScript=false.
      book.transformTarget.addEventListener('data', (event) => {
        if (['application/xhtml+xml', 'text/html'].includes(event.detail.type)) {
          htmlSanitizerReached = true;
          event.detail.data = '<html><body>sanitized placeholder</body></html>';
        }
      });
      const url = await book.sections[0].load();
      window.auditSvgSentinel = 'untouched';
      const iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts');
      iframe.src = url;
      await new Promise((resolve) => { iframe.onload = resolve; document.body.appendChild(iframe); });
      const result = { htmlSanitizerReached, parentMutation: window.auditSvgSentinel };
      iframe.remove();
      book.destroy();
      return result;
    });
    assert.equal(svgProof.htmlSanitizerReached, false);
    assert.equal(svgProof.parentMutation, 'svg-inline-executed');
    results.push({ id: 'AUD-01-SVG', reproduced: true, boundary: 'real EPUB loader plus application MIME gate; Chromium iframe, not installed Tauri IPC', ...svgProof });
  } finally { await browser.close(); }
  console.log(JSON.stringify({ source: '56048657b2cb9dc27492f19f002b352beb68d91f', results }, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
