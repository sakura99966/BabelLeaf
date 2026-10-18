import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RUNTIME_VENDORS } from '../../../../../scripts/runtime-vendor-policy.mjs';

const root = resolve(process.cwd(), '../..');
const source = resolve(root, 'packages/foliate-js/node_modules/pdfjs-dist');

describe('pdfjs vendor wasm assets', () => {
  it('copies every decoder referenced by the actual PDF.js main/worker bundles, including JBIG2', () => {
    // Earlier copying missed jbig2.wasm and silently rendered scanned PDFs
    // blank. Check actual source references and copied bytes, not glob text.
    const policy = RUNTIME_VENDORS.find((vendor) => vendor.id === 'pdfjs');
    expect(policy?.sources).toContainEqual({
      directory: 'packages/foliate-js/node_modules/pdfjs-dist/wasm',
      all: true,
    });
    const available = new Set(
      readdirSync(resolve(source, 'wasm')).filter((f) => f.endsWith('.wasm')),
    );
    const referenced = new Set<string>();
    for (const file of ['pdf.min.mjs', 'pdf.worker.min.mjs']) {
      const text = readFileSync(resolve(source, 'legacy/build', file), 'utf8');
      for (const match of text.matchAll(/[A-Za-z0-9_-]+\.wasm/g)) {
        if (available.has(match[0])) referenced.add(match[0]);
      }
    }
    expect(referenced.has('jbig2.wasm')).toBe(true);
    for (const file of available) {
      const packaged = resolve(process.cwd(), 'public/vendor/pdfjs', file);
      expect(existsSync(packaged), 'Missing PDF decoder: ' + file).toBe(true);
      expect(readFileSync(packaged)).toEqual(readFileSync(resolve(source, 'wasm', file)));
    }
  });
});
