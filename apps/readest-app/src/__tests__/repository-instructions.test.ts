// @vitest-environment node

import { execFileSync } from 'node:child_process';
import { lstatSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRoot = resolve(__dirname, '../..');
const repoRoot = resolve(appRoot, '../..');
const entryPath = 'apps/readest-app/CLAUDE.md';
const guidePath = 'apps/readest-app/AGENTS.md';

function git(args: string[]): string {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
}

describe('portable repository instructions', () => {
  it('records CLAUDE.md as ordinary Markdown rather than a platform-dependent link', () => {
    const entry = git(['ls-files', '--stage', '--', entryPath]);
    expect(entry.split(' ')[0]).toBe('100644');
    expect(lstatSync(resolve(repoRoot, entryPath)).isSymbolicLink()).toBe(false);
  });

  it('imports the shared guide without duplicating or replacing its rules', () => {
    const entry = readFileSync(resolve(repoRoot, entryPath), 'utf8');
    expect(entry.replaceAll('\r\n', '\n')).toMatch(/^@AGENTS\.md$/m);
    const guide = readFileSync(resolve(repoRoot, guidePath), 'utf8');
    for (const rule of ['test-first.md', 'typescript.md', 'verification.md']) {
      expect(guide).toContain(rule);
      expect(lstatSync(resolve(appRoot, '.claude/rules', rule)).isFile()).toBe(true);
    }
  });

  it.each(['false', 'true'])('survives a fresh core.symlinks=%s checkout', (symlinks) => {
    const checkout = mkdtempSync(join(tmpdir(), 'babelleaf-instructions-'));
    try {
      const prefix = `${checkout.replaceAll('\\', '/')}/`;
      git([
        '-c',
        `core.symlinks=${symlinks}`,
        'checkout-index',
        `--prefix=${prefix}`,
        '--',
        entryPath,
        guidePath,
      ]);
      const entry = resolve(checkout, entryPath);
      expect(lstatSync(entry).isSymbolicLink()).toBe(false);
      expect(lstatSync(entry).isFile()).toBe(true);
      expect(readFileSync(entry, 'utf8').replaceAll('\r\n', '\n')).toMatch(/^@AGENTS\.md$/m);
      expect(readFileSync(resolve(checkout, guidePath), 'utf8')).toContain(
        '# BabelLeaf Development Guide',
      );
    } finally {
      rmSync(checkout, { recursive: true, force: true });
    }
  });
});
