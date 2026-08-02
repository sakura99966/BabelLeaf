#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageJsonPath = join(repositoryRoot, 'package.json');

function readPackageManager() {
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    const packageManager = packageJson.packageManager;

    if (typeof packageManager !== 'string' || !packageManager.startsWith('pnpm@')) {
      throw new Error('package.json must declare a pnpm packageManager, for example pnpm@11.1.1');
    }

    return packageManager;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[BabelLeaf] Unable to read ${packageJsonPath}: ${message}`);
    process.exit(1);
  }
}

function pathEntries() {
  return (process.env.PATH ?? '')
    .split(process.platform === 'win32' ? ';' : ':')
    .map((entry) => entry.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
}

function findExecutable(names) {
  for (const entry of pathEntries()) {
    for (const name of names) {
      const candidate = join(entry, name);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return undefined;
}

function quoteForCmd(value) {
  if (!/[\s"&|<>^]/.test(value)) {
    return value;
  }

  return `"${value.replace(/(["^])/g, '^$1')}"`;
}

function run(command, args) {
  const isWindowsCommandFile =
    process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(command);

  if (isWindowsCommandFile) {
    const commandLine = [quoteForCmd(command), ...args.map(quoteForCmd)].join(' ');
    return spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', commandLine], {
      cwd: repositoryRoot,
      stdio: 'inherit',
      windowsHide: true,
    });
  }

  return spawn(command, args, {
    cwd: repositoryRoot,
    stdio: 'inherit',
    windowsHide: true,
  });
}

const packageManager = readPackageManager();
const requestedArgs = process.argv.slice(2);
const pnpm = findExecutable(process.platform === 'win32' ? ['pnpm.cmd', 'pnpm.exe', 'pnpm'] : ['pnpm']);
const corepack = findExecutable(
  process.platform === 'win32' ? ['corepack.cmd', 'corepack.exe', 'corepack'] : ['corepack'],
);

let command = pnpm;
let args = requestedArgs;

if (!command && corepack) {
  command = corepack;
  args = ['pnpm', ...requestedArgs];
}

if (!command) {
  console.error(
    `[BabelLeaf] Cannot find pnpm. Expected ${packageManager}. Install pnpm or enable Corepack, then retry.`,
  );
  process.exit(127);
}

const child = run(command, args);

child.on('error', (error) => {
  console.error(`[BabelLeaf] Failed to start ${packageManager}: ${error.message}`);
  process.exit(127);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  }

  process.exit(code ?? 1);
});
