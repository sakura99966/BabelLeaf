// Build/test-only identity check. Tauri temporarily patches one bundle marker
// when packaging, then restores the original bare executable (bundle.rs).
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isUint8Array } from 'node:util/types';

const originalMarker = Buffer.from('__TAURI_BUNDLE_TYPE_VAR_UNK');
const nsisMarker = Buffer.from('__TAURI_BUNDLE_TYPE_VAR_NSS');
const maxBytes = 256 * 1024 * 1024;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function compareNsisExecutable(built, installed) {
  if (!isUint8Array(built) || !isUint8Array(installed)
    || !built.byteLength || !installed.byteLength || built.byteLength > maxBytes || installed.byteLength > maxBytes)
    throw new Error('Invalid or unbounded executable image');
  const image = Buffer.from(built.buffer, built.byteOffset, built.byteLength);
  const offset = image.indexOf(originalMarker);
  // Match upstream kmp::index_of: patch the first occurrence only. Rust may
  // retain another copy of the literal; every later byte stays hash-covered.
  if (offset < 0) throw new Error('Original Tauri bundle marker is missing');
  const expectedNsisSha256 = createHash('sha256')
    .update(image.subarray(0, offset)).update(nsisMarker)
    .update(image.subarray(offset + originalMarker.length)).digest('hex');
  const installedSha256 = sha256(installed);
  return { passed: built.byteLength === installed.byteLength && installedSha256 === expectedNsisSha256,
    builtSha256: sha256(built), expectedNsisSha256, installedSha256,
    markerOffset: offset, markerReplacements: 1,
    scope: 'only the single upstream UNK-to-NSS marker substitution; no other byte normalization' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = (flag) => {
    const index = process.argv.indexOf(flag);
    if (index < 0 || !process.argv[index + 1] || process.argv[index + 1].startsWith('--'))
      throw new Error('Missing ' + flag);
    const path = resolve(process.argv[index + 1]);
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > maxBytes)
      throw new Error('Expected a bounded plain executable file');
    return readFileSync(path);
  };
  const result = compareNsisExecutable(input('--built'), input('--installed'));
  console.log(JSON.stringify(result));
  if (!result.passed) process.exitCode = 1;
}
