import { readFileSync, writeFileSync } from 'node:fs';

// Keep security hardening reproducible without pointing the upstream submodule
// at an unpublished local commit. Fail closed if upstream changes the targets.
const files = [
  ['paginator.js', 1],
  ['fixed-layout.js', 2],
];
for (const [name, expected] of files) {
  const path = new URL(`../packages/foliate-js/${name}`, import.meta.url);
  const source = readFileSync(path, 'utf8');
  const pattern = /setAttribute\('sandbox', 'allow-same-origin(?: allow-scripts)?'\)/g;
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== expected) throw new Error(`Unexpected reader sandbox targets: ${name}`);
  const hardened = source.replace(pattern, "setAttribute('sandbox', 'allow-same-origin')");
  if (hardened.includes("'allow-same-origin allow-scripts'")) {
    throw new Error(`Unsafe reader sandbox remains: ${name}`);
  }
  if (hardened !== source) writeFileSync(path, hardened);
}

// PDF documents are untrusted local content too. Evaluation is already
// disabled in getDocument; scripting must also be off in annotation widgets.
const pdfPath = new URL('../packages/foliate-js/pdf.js', import.meta.url);
const pdfSource = readFileSync(pdfPath, 'utf8');
const annotationTarget = /annotations: await page\.getAnnotations\(\),(?:\r?\n[ \t]*enableScripting: false,\r?\n[ \t]*hasJSActions: false,)?/g;
if ([...pdfSource.matchAll(annotationTarget)].length !== 1)
  throw new Error('Unexpected PDF annotation scripting target');
let hardenedPdf = pdfSource.replace(annotationTarget,
  'annotations: await page.getAnnotations(),\n        enableScripting: false,\n        hasJSActions: false,');
if (!hardenedPdf.includes('isEvalSupported: false'))
  throw new Error('PDF JavaScript evaluation must remain disabled');
// PDF.js 6 owns worker teardown on PDFDocumentLoadingTask, not DocumentProxy.
// Return its promise so owners can await complete worker/transport disposal.
const disposalTarget = /(?:return pdf\.loadingTask\.destroy\(\)|pdf\.destroy\(\))/g;
if ([...hardenedPdf.matchAll(disposalTarget)].length !== 1)
  throw new Error('Unexpected PDF document disposal target');
hardenedPdf = hardenedPdf.replace(disposalTarget, 'return pdf.loadingTask.destroy()');
if (hardenedPdf !== pdfSource) writeFileSync(pdfPath, hardenedPdf);
