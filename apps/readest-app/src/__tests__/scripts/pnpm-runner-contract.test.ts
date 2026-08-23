import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../../..');

describe('Git hook package-manager contract', () => {
  it('prefers Corepack so hooks use the repository-declared pnpm version', () => {
    const runner = readFileSync(resolve(repoRoot, 'scripts/pnpm-runner.mjs'), 'utf8');

    expect(runner).toContain('const command = corepack ?? pnpm;');
    expect(runner).not.toContain('let command = pnpm;');
  });
});
