import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join, resolve, relative, isAbsolute } from 'node:path';
import {
  prepareRuntimeVendors,
  collectRuntimeVendorEvidence,
  verifyRuntimeVendorEvidence,
} from '../../../../../scripts/runtime-vendors.mjs';

const base = resolve(__dirname, '../../../artifacts/remediation-0.4.6/vendor-tests');
const owned: string[] = [];
afterEach(() => {
  for (const root of owned.splice(0)) {
    const child = relative(base, root);
    if (!child || child.startsWith('..') || isAbsolute(child))
      throw new Error('Unsafe fixture cleanup');
    rmSync(root, { recursive: true, force: true });
  }
});

function fixture() {
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(join(base, 'vendor-'));
  owned.push(root);
  mkdirSync(join(root, 'dep'));
  writeFileSync(
    join(root, 'dep/package.json'),
    JSON.stringify({ name: 'fixture-vendor', version: '1.2.3', license: 'MIT' }),
  );
  writeFileSync(join(root, 'dep/runtime.js'), 'export const fixture = 1;\n');
  const options = {
    publicRoot: 'public',
    vendors: [
      {
        id: 'fixture',
        directory: 'vendor/fixture',
        manifest: 'dep/package.json',
        sources: [{ directory: 'dep', files: ['runtime.js'] }],
      },
    ],
  };
  return { root, options };
}

it('records actual copied runtime package versions and source/output hashes', async () => {
  const { root, options } = fixture();
  await prepareRuntimeVendors(root, options);
  const manifest = await verifyRuntimeVendorEvidence(root, options);
  expect(manifest.components[0]?.name).toBe('fixture-vendor');
  expect(manifest.components[0]?.version).toBe('1.2.3');
  expect(manifest.assets[0]?.sha256).toBe(manifest.assets[0]?.sourceSha256);
});

it.each([
  'tamper',
  'unmapped-file',
  'unmapped-directory',
  'missing',
  'stale-version',
])('fails closed for %s in runtime copies instead of claiming SOURCE_COMPLETE', async (mode) => {
  const { root, options } = fixture();
  await prepareRuntimeVendors(root, options);
  if (mode === 'tamper') writeFileSync(join(root, 'public/vendor/fixture/runtime.js'), 'changed');
  if (mode === 'unmapped-file')
    writeFileSync(join(root, 'public/vendor/fixture/unreviewed.js'), 'unknown');
  if (mode === 'unmapped-directory') {
    mkdirSync(join(root, 'public/vendor/unreviewed'));
    writeFileSync(join(root, 'public/vendor/unreviewed/lib.js'), 'unknown');
  }
  if (mode === 'missing') rmSync(join(root, 'public/vendor/fixture/runtime.js'));
  if (mode === 'stale-version')
    writeFileSync(
      join(root, 'dep/package.json'),
      JSON.stringify({ name: 'fixture-vendor', version: '2.0.0', license: 'MIT' }),
    );
  await expect(verifyRuntimeVendorEvidence(root, options)).rejects.toThrow();
});

it('does not manufacture license completeness from an absent manifest license', async () => {
  const { root, options } = fixture();
  writeFileSync(
    join(root, 'dep/package.json'),
    JSON.stringify({ name: 'fixture-vendor', version: '1.2.3' }),
  );
  await expect(collectRuntimeVendorEvidence(root, options)).rejects.toThrow(/license/i);
});

it('rejects a linked output ancestor before writing any generated file', async () => {
  const { root, options } = fixture();
  mkdirSync(join(root, 'other'));
  mkdirSync(join(root, 'public'));
  symlinkSync(join(root, 'other'), join(root, 'public/vendor'), 'junction');
  await expect(prepareRuntimeVendors(root, options)).rejects.toThrow(/link/i);
});

it('rejects runtime code copied outside the declared vendor directories', async () => {
  const { root, options } = fixture();
  await prepareRuntimeVendors(root, options);
  mkdirSync(join(root, 'public/assets'));
  writeFileSync(join(root, 'public/assets/hidden-library.wasm'), 'unknown');
  await expect(verifyRuntimeVendorEvidence(root, options)).rejects.toThrow(/unmapped/i);
});
