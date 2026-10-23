import { expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { measureOwnedRuntimeFootprint } from '../../../scripts/owned-runtime-footprint.mjs';

it('bounds owned cache/profile bytes without following a junction to other data', async () => {
  const root = await mkdtemp(join(tmpdir(), 'babelleaf-footprint-'));
  try {
    await mkdir(join(root, 'profile'));
    await mkdir(join(root, 'outside'));
    await writeFile(join(root, 'profile', 'cache'), new Uint8Array(123));
    await writeFile(join(root, 'outside', 'not-ours'), new Uint8Array(999));
    await symlink(
      join(root, 'outside'),
      join(root, 'profile', 'junction'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    expect(await measureOwnedRuntimeFootprint(join(root, 'profile'))).toEqual({
      bytes: 123,
      files: 1,
      entries: 2,
      skippedLinks: 1,
    });
    await expect(
      measureOwnedRuntimeFootprint(join(root, 'profile'), { maxBytes: 122 }),
    ).rejects.toThrow();
    await expect(
      measureOwnedRuntimeFootprint(join(root, 'profile'), { maxEntries: 1 }),
    ).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it('refuses an unresolved or unbounded measurement scope', async () => {
  await expect(measureOwnedRuntimeFootprint('.')).rejects.toThrow();
  await expect(measureOwnedRuntimeFootprint(tmpdir(), { maxEntries: 0 })).rejects.toThrow();
});
