import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  validatePackagedRuntimeManifest,
  dispatchPackagedProbeResponse,
  makePackagedProbePolicy,
  validatePackagedLibraryTiming,
} from '../../../scripts/packaged-runtime-manifest.mjs';

const fixture = () => ({
  schemaVersion: 1,
  components: [{ id: 'fixture', name: 'fixture', version: '1.0.0', license: 'MIT' }],
  assets: [
    { path: 'vendor/fixture/codec.wasm', component: 'fixture', bytes: 1, sha256: '0'.repeat(64) },
  ],
  totalBytes: 1,
});

it('measures launch to an interactive painted library, not observer polling', () => {
  expect(
    validatePackagedLibraryTiming(
      { timeOrigin: 1_000_100, startTime: 600, marks: 1, enabledImportButton: true },
      1_000_000,
    ),
  ).toEqual({
    launchToInteractiveMs: 700,
    navigationToInteractiveMs: 600,
    scope: 'committed library after a paint opportunity',
  });
});

it.each([
  { timeOrigin: Number.NaN },
  { timeOrigin: 0 },
  { startTime: -1 },
  { startTime: Number.POSITIVE_INFINITY },
  { startTime: 61_000 },
  { marks: 0 },
  { marks: 2 },
  { enabledImportButton: false },
])('rejects missing, duplicate, unbounded or noninteractive startup evidence', (override) => {
  expect(() =>
    validatePackagedLibraryTiming(
      { timeOrigin: 1_000_100, startTime: 600, marks: 1, enabledImportButton: true, ...override },
      1_000_000,
    ),
  ).toThrow();
});

it('scopes an elevated WebView2 probe policy to one random disposable executable', () => {
  const name = 'BabelLeafProbe-' + 'a'.repeat(32) + '.exe';
  const policy = makePackagedProbePolicy(name, 55000);
  expect(policy.name).toBe(name);
  expect(policy.key).toBe(
    'SOFTWARE\\Policies\\Microsoft\\Edge\\WebView2\\AdditionalBrowserArguments',
  );
  expect(policy.value).toBe('--remote-debugging-port=55000 --remote-debugging-address=127.0.0.1');
});

it.each([
  '*',
  'babelleaf.exe',
  'other.exe',
  '../BabelLeafProbe-' + 'a'.repeat(32) + '.exe',
])('refuses a policy target outside the disposable binary allowlist', (name) =>
  expect(() => makePackagedProbePolicy(name, 55000)).toThrow());

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
  expect(workflow.indexOf('run: pnpm test:windows-installer')).toBeLessThan(
    workflow.indexOf('run: pnpm test:windows-packaged-runtime'),
  );
});

it('dispatches only an outstanding numeric protocol id to an owned callable, once', () => {
  const handler = vi.fn();
  const callbacks = new Map<number, unknown>([
    [1, handler],
    [2, 'not a function'],
  ]);
  for (const input of [{ id: '__proto__' }, { id: 0 }, { id: 3 }, { id: 2 }, null])
    expect(dispatchPackagedProbeResponse(callbacks, input)).toBe(false);
  expect(handler).not.toHaveBeenCalled();
  expect(dispatchPackagedProbeResponse(callbacks, { id: 1 })).toBe(true);
  expect(dispatchPackagedProbeResponse(callbacks, { id: 1 })).toBe(false);
  expect(handler).toHaveBeenCalledTimes(1);
});
