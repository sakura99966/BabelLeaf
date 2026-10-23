import { expect, it } from 'vitest';
import { validateLibrarySnapshot, validateSettingsSnapshot } from '@/services/localStateValidation';
import { createRequire } from 'node:module';

it.each([
  null,
  [],
  'corrupt',
  { globalViewSettings: [] },
  { aiSettings: 'bad' },
])('rejects malformed settings instead of merging defaults over corruption: %j', (value) =>
  expect(() => validateSettingsSnapshot(value)).toThrow());
it.each([
  null,
  {},
  [{ title: 'missing identity' }],
])('rejects malformed library snapshots: %j', (value) =>
  expect(() => validateLibrarySnapshot(value)).toThrow());
it('preserves unknown legacy fields while accepting safe known sections', () => {
  const settings = { version: 1, globalViewSettings: {}, legacyPreference: 'kept' };
  expect(validateSettingsSnapshot(settings)).toBe(settings);
  const library = [{ hash: 'safe', format: 'EPUB', legacyMetadata: { kept: true } }];
  expect(validateLibrarySnapshot(library)).toBe(library);
});
it('never prunes dynamically referenced locale keys during extraction', () => {
  const require = createRequire(import.meta.url);
  const config = require('../../../i18next-scanner.config.cjs') as {
    options: { removeUnusedKeys: boolean };
  };
  expect(config.options.removeUnusedKeys).toBe(false);
});
