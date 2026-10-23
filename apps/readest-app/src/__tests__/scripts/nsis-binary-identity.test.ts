import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { compareNsisExecutable } from '../../../scripts/nsis-binary-identity.mjs';

const token = '__TAURI_BUNDLE_TYPE_VAR_UNK';
const fixture = () => Buffer.from('owned test image\0' + token + '\0unchanged payload');
const nsis = (source: Buffer) =>
  Buffer.from(source.toString().replace(token, '__TAURI_BUNDLE_TYPE_VAR_NSS'));
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

it('accepts only the known single Tauri NSIS marker substitution without changing the build bytes', () => {
  const built = fixture();
  const original = Buffer.from(built);
  const installed = nsis(built);
  const result = compareNsisExecutable(built, installed);
  expect(result.passed).toBe(true);
  expect(result.builtSha256).toBe(sha256(built));
  expect(result.expectedNsisSha256).toBe(sha256(installed));
  expect(result.installedSha256).toBe(sha256(installed));
  expect(built).toEqual(original);
});

it('matches upstream first-marker-only behavior while preserving later literal copies', () => {
  expect(() => compareNsisExecutable(Buffer.from('missing'), Buffer.from('missing'))).toThrow();
  const duplicate = Buffer.from(token + token);
  expect(compareNsisExecutable(duplicate, nsis(duplicate)).passed).toBe(true);
  const allPatched = Buffer.from(
    duplicate.toString().replaceAll(token, '__TAURI_BUNDLE_TYPE_VAR_NSS'),
  );
  expect(compareNsisExecutable(duplicate, allPatched).passed).toBe(false);
  const secondPatched = Buffer.from(token + '__TAURI_BUNDLE_TYPE_VAR_NSS');
  expect(compareNsisExecutable(duplicate, secondPatched).passed).toBe(false);
});

it('rejects the unpatched build and other bundle types as an installed NSIS image', () => {
  const built = fixture();
  expect(compareNsisExecutable(built, built).passed).toBe(false);
  const msi = Buffer.from(built.toString().replace(token, '__TAURI_BUNDLE_TYPE_VAR_MSI'));
  expect(compareNsisExecutable(built, msi).passed).toBe(false);
});

it('rejects any changed payload byte even when the expected marker is present', () => {
  const built = fixture();
  const changed = nsis(built);
  changed[0] = changed[0]! ^ 1;
  expect(compareNsisExecutable(built, changed).passed).toBe(false);
});

it('rejects truncated or appended installed bytes', () => {
  const built = fixture();
  const installed = nsis(built);
  expect(compareNsisExecutable(built, installed.subarray(0, -1)).passed).toBe(false);
  expect(compareNsisExecutable(built, Buffer.concat([installed, Buffer.from([0])])).passed).toBe(
    false,
  );
});
