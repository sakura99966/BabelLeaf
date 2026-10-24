// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lock = readFileSync(resolve(__dirname, '../../../../../Cargo.lock'), 'utf8');

function lockedVersions(name: string): string[] {
  return lock.split('[[package]]').flatMap((entry) => {
    if (entry.match(/^name = "([^"]+)"/m)?.[1] !== name) return [];
    const version = entry.match(/^version = "([^"]+)"/m)?.[1];
    return version ? [version] : [];
  });
}

describe('reviewed Rust security baseline', () => {
  it('retains the compatible Tokio fix for RUSTSEC-2026-0386', () => {
    const versions = lockedVersions('tokio');
    expect(versions).not.toHaveLength(0);
    for (const version of versions) {
      const [major = 0, minor = 0, patch = 0] = version.split('.').map(Number);
      expect(major > 1 || (major === 1 && (minor > 53 || (minor === 53 && patch >= 3)))).toBe(true);
    }
  });

  it('does not restore the withdrawn clipboard-win 5.4.1 release', () => {
    expect(lockedVersions('clipboard-win')).toEqual(['5.4.3']);
  });
});
