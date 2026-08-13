#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJsonPath = join(repositoryRoot, 'package.json');

const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
const declared = packageJson.packageManager;
if (typeof declared !== 'string' || !/^pnpm@\d+\.\d+\.\d+$/.test(declared)) {
  console.error(`[BabelLeaf] Invalid packageManager in ${packageJsonPath}: ${String(declared)}`);
  process.exit(1);
}

const expected = declared.slice('pnpm@'.length);
let actual = process.env.npm_config_user_agent?.match(/(?:^|\s)pnpm\/(\d+\.\d+\.\d+)/)?.[1];
if (!actual) {
  try {
    actual = execFileSync(process.platform === 'win32' ? 'pnpm' : 'pnpm', ['--version'], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[BabelLeaf] Unable to query pnpm: ${detail}`);
    process.exit(1);
  }
}

if (actual !== expected) {
  console.error(`[BabelLeaf] pnpm ${expected} is required; detected ${actual}.`);
  console.error('[BabelLeaf] Enable Corepack or install the declared pnpm version before continuing.');
  process.exit(1);
}

console.log(`[BabelLeaf] pnpm ${actual} matches ${declared}.`);
