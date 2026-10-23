import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { verifyRuntimeVendorEvidence } from '../../../../../scripts/runtime-vendors.mjs';
import { RUNTIME_VENDORS } from '../../../../../scripts/runtime-vendor-policy.mjs';

const root = resolve(process.cwd(), '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

it('disables PDF document scripting at the annotation-layer boundary', () => {
  const source = read('packages/foliate-js/pdf.js');
  expect(source).toMatch(/AnnotationLayer[\s\S]*?render\(\{[\s\S]*?enableScripting:\s*false/);
  expect(source).toMatch(/AnnotationLayer[\s\S]*?render\(\{[\s\S]*?hasJSActions:\s*false/);
});

it('reproducibly disposes the PDF.js loading task and awaits comic extraction teardown', () => {
  const source = read('packages/foliate-js/pdf.js');
  expect(source).toContain('return pdf.loadingTask.destroy()');
  expect(source).toContain(
    "await page.render({ canvasContext, viewport, intent: 'print' }).promise",
  );
  expect(source).not.toMatch(/\bpdf\.destroy\(\)/);
  const owner = read('apps/readest-app/src/app/reader/components/ComicWorkspaceDialog.tsx');
  expect(owner).toContain('await book.destroy?.();');
});

it('requires verified copied-runtime evidence before declaring SBOM source completeness', () => {
  const source = read('scripts/generate-sbom.mjs');
  expect(source).toContain('verifyRuntimeVendorEvidence');
  expect(source).toContain('...runtimeGaps');
  expect(source).toContain('...runtimeComponents');
  expect(source).toContain('babelleaf.runtime.assets');
});

it('checks final static-output copies before every production build can be embedded by Tauri', () => {
  const manifest = JSON.parse(read('apps/readest-app/package.json')) as {
    scripts: Record<string, string>;
  };
  for (const name of ['build', 'build-web', 'build-tauri']) {
    expect(manifest.scripts[name]).toContain('&& pnpm check:all');
  }
});

it('reconciles all installed runtime copies, notices, versions and hashes', async () => {
  const manifest = await verifyRuntimeVendorEvidence(root);
  expect(manifest.components.map((component: { id: string }) => component.id).sort()).toEqual([
    'inter',
    'jieba',
    'onnxruntime',
    'pdfjs',
    'pdfjs-styles',
    'simplecc',
    'tesseract',
  ]);
  expect(manifest.assets.length).toBeGreaterThan(200);
  expect(
    manifest.assets.some(
      (asset: { path: string }) => asset.path === 'vendor/onnxruntime/ThirdPartyNotices.txt',
    ),
  ).toBe(true);
});

it('retains native process-interruption qualification for ordinary book annotations', () => {
  const runner = read('apps/readest-app/scripts/test-windows-crash-recovery.mjs');
  const fixture = read('apps/readest-app/src/__tests__/fixtures/native-crash.ts');
  for (const phase of ['config-before-main', 'config-after-main', 'recover-config']) {
    expect(runner.includes(phase)).toBe(true);
    expect(fixture.includes(phase)).toBe(true);
  }
});

it('builds notices without requiring the uninitialized OpenCC development submodule', () => {
  const simplecc = RUNTIME_VENDORS.find((vendor) => vendor.id === 'simplecc');
  expect(JSON.stringify(simplecc?.sources)).not.toContain('packages/simplecc-wasm/OpenCC/');
  expect(JSON.stringify(simplecc?.sources)).toContain('licenses/runtime/OpenCC-');
});

it('archives only successfully installed and hash-verified Windows candidates with a strict SBOM', () => {
  const workflow = read('.github/workflows/pull-request.yml');
  const verify = workflow.indexOf(
    '- name: verify packaged UI hydration and embedded runtime hashes',
  );
  const archive = workflow.indexOf('- name: archive verified Windows candidate');
  const upload = workflow.indexOf('- name: upload verified Windows candidate');
  expect(archive).toBeGreaterThan(verify);
  expect(upload).toBeGreaterThan(archive);
  const step = workflow.slice(archive, upload);
  expect(step).toContain('$probe.executableSha256');
  expect(step).toContain('$probe.probeSourceCommit');
  expect(step).toContain('success.txt');
  expect(step).toContain('generate-sbom.mjs --strict --artifact');
  expect(step).toContain('candidate-inventory.json');
  expect(step).toContain('Get-FileHash');
  expect(
    workflow.slice(upload, workflow.indexOf('- name: upload installer smoke failure logs')),
  ).toContain('if-no-files-found: error');
});

it('requires the installed executable to match the exact build before accepting its launch', () => {
  const installer = read('apps/readest-app/scripts/test-windows-installer.ps1');
  const check = installer.indexOf('Installed executable hash differs from the built candidate');
  expect(check).toBeGreaterThan(0);
  expect(check).toBeLessThan(installer.indexOf('$applicationProcess = Start-Process'));
  expect(installer).toContain('Get-FileHash -LiteralPath $applicationPath');
  expect(installer).toContain('Installed executable SHA256: $installedExecutableHash');
});
