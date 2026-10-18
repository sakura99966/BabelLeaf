import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { RUNTIME_VENDORS } from '../../../../../../scripts/runtime-vendor-policy.mjs';

const appRoot = process.cwd();

describe('Tesseract WASM packaged runtime assets', () => {
  test('ships the worker and both deterministic WASM variants from the pinned package', () => {
    const pkg = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['tesseract-wasm']).toBe('0.11.0');
    expect(pkg.scripts['setup-vendors']).toContain('setup-runtime-vendors.mjs');
    expect(RUNTIME_VENDORS.find((vendor) => vendor.id === 'tesseract')?.sources).toContainEqual({
      directory: 'apps/readest-app/node_modules/tesseract-wasm/dist',
      files: ['tesseract-worker.js', 'tesseract-core.wasm', 'tesseract-core-fallback.wasm'],
    });

    for (const file of [
      'tesseract-worker.js',
      'tesseract-core.wasm',
      'tesseract-core-fallback.wasm',
    ]) {
      const source = resolve(appRoot, 'node_modules/tesseract-wasm/dist', file);
      const packaged = resolve(appRoot, 'public/vendor/tesseract', file);
      expect(statSync(packaged).size).toBe(statSync(source).size);
      expect(readFileSync(packaged)).toEqual(readFileSync(source));
    }
  }, 60_000);
});
