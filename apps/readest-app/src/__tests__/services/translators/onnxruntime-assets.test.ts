import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const appRoot = process.cwd();
const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

describe('ONNX Runtime packaged assets', () => {
  test('copies only the pinned external-WASM CPU runtime needed by local LaMa', () => {
    const pkg = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies['onnxruntime-web']).toBe('1.27.0');
    expect(pkg.scripts['setup-vendors']).toContain('setup-onnxruntime');
    expect(pkg.scripts['copy-onnxruntime']).toContain('ort-wasm-simd-threaded.mjs');
    expect(pkg.scripts['copy-onnxruntime']).toContain('ort-wasm-simd-threaded.wasm');
    for (const file of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
      const source = resolve(appRoot, 'node_modules/onnxruntime-web/dist', file);
      const packaged = resolve(appRoot, 'public/vendor/onnxruntime', file);
      expect(statSync(packaged).size).toBe(statSync(source).size);
      expect(sha256(packaged)).toBe(sha256(source));
    }
  });
});
