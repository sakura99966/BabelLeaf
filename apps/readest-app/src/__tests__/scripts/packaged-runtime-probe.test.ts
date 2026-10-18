import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validatePackagedRuntimeManifest } from '../../../scripts/packaged-runtime-manifest.mjs';

const fixture = () => ({
  schemaVersion: 1,
  components: [{ id: 'fixture', name: 'fixture', version: '1.0.0', license: 'MIT' }],
  assets: [
    { path: 'vendor/fixture/codec.wasm', component: 'fixture', bytes: 1, sha256: '0'.repeat(64) },
  ],
  totalBytes: 1,
});

it('accepts the bounded generated runtime-copy shape', () => {
  const input = fixture();
  expect(validatePackagedRuntimeManifest(input)).toBe(input);
});

it.each([
  'https://example.invalid/file',
  '//example.invalid/file',
  'vendor/../file',
  '/vendor/file',
])('rejects nonlocal or escaping asset paths before launching the probe: %s', (path) => {
  const input = fixture();
  input.assets[0]!.path = path;
  expect(() => validatePackagedRuntimeManifest(input)).toThrow();
});

it.each([
  'oversize',
  'bad-hash',
  'unknown-component',
  'duplicate',
  'missing-license',
  'wrong-total',
])('fails closed for %s in packaged-resource evidence', (mode) => {
  const input = fixture();
  if (mode === 'oversize') input.assets[0]!.bytes = 256 * 1024 * 1024;
  if (mode === 'bad-hash') input.assets[0]!.sha256 = 'invalid';
  if (mode === 'unknown-component') input.assets[0]!.component = 'unknown';
  if (mode === 'duplicate')
    input.assets.push({ ...input.assets[0]!, path: 'vendor/FIXTURE/codec.wasm' });
  if (mode === 'missing-license') input.components[0]!.license = '';
  if (mode === 'wrong-total') input.totalBytes = 2;
  expect(() => validatePackagedRuntimeManifest(input)).toThrow();
});

it('makes actual packaged-library hydration and embedded asset checks a Windows CI gate', () => {
  const app = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
  };
  expect(app.scripts['test:windows-packaged-runtime']).toContain('test-packaged-runtime.mjs');
  const workflow = readFileSync(
    resolve(process.cwd(), '../../.github/workflows/pull-request.yml'),
    'utf8',
  );
  expect(workflow).toContain('run: pnpm test:windows-packaged-runtime');
});
