#!/usr/bin/env node

/**
 * Generate BabelLeaf's repository-owned DRM-free KF8/AZW3 qualification file.
 *
 * The converter is supplied explicitly and is never downloaded by this
 * script. Its release hash and version are pinned below. The source EPUB is
 * generated locally by generate-format-fixtures.mjs. PalmDB creation and
 * modification timestamps are normalized so the resulting test asset is
 * byte-for-byte reproducible.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FORMAT_GENERATOR = join(REPO_ROOT, 'scripts', 'fixtures', 'generate-format-fixtures.mjs');
const DEFAULT_OUTPUT = join(
  REPO_ROOT,
  'apps',
  'readest-app',
  'src',
  '__tests__',
  'fixtures',
  'data',
  'sample-babelleaf.azw3',
);
const KINDLING_VERSION = '0.31.0';
const KINDLING_WINDOWS_SHA256 =
  '122581beef68e052a0636fb782cb7a465656f868cfcfccfb0231cde389215ede';
const FIXED_PALM_TIMESTAMP = 3_850_070_400; // 2026-01-01T00:00:00Z in the Palm epoch.

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const parseArgs = (argv) => {
  const args = { kindling: '', output: DEFAULT_OUTPUT };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--kindling') args.kindling = resolve(argv[++index]);
    else if (value === '--output') args.output = resolve(argv[++index]);
    else if (value === '--help' || value === '-h') {
      console.log(
        'Usage: node scripts/fixtures/generate-azw3-fixture.mjs --kindling FILE [--output FILE]',
      );
      process.exit(0);
    } else throw new Error(`Unknown argument: ${value}`);
  }
  if (!args.kindling) throw new Error('--kindling FILE is required');
  return args;
};

const assertPinnedTool = (kindling) => {
  const binary = readFileSync(kindling);
  const actualHash = sha256(binary);
  if (actualHash !== KINDLING_WINDOWS_SHA256) {
    throw new Error(
      `Kindling SHA-256 mismatch: expected ${KINDLING_WINDOWS_SHA256}, received ${actualHash}`,
    );
  }
  const version = execFileSync(kindling, ['--version'], { encoding: 'utf8' }).trim();
  if (version !== `kindling ${KINDLING_VERSION}`) {
    throw new Error(`Unsupported Kindling version: ${version}`);
  }
};

const normalizePalmDbTimestamps = (bytes) => {
  if (bytes.length < 80 || bytes.subarray(60, 68).toString('ascii') !== 'BOOKMOBI') {
    throw new Error('Generated AZW3 does not contain a BOOKMOBI PalmDB header');
  }
  const normalized = Buffer.from(bytes);
  normalized.writeUInt32BE(FIXED_PALM_TIMESTAMP, 36);
  normalized.writeUInt32BE(FIXED_PALM_TIMESTAMP, 40);
  return normalized;
};

const assertDrmFreeKf8 = (kindling, output) => {
  const dump = execFileSync(kindling, ['dump', output], { encoding: 'utf8' });
  if (!/^mobi\.file_version = 8$/m.test(dump)) {
    throw new Error('Generated AZW3 is not a native KF8 file');
  }
  if (!/^palmdoc\.encryption = 0$/m.test(dump)) {
    throw new Error('Generated AZW3 is not DRM-free');
  }
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  assertPinnedTool(args.kindling);
  const working = mkdtempSync(join(tmpdir(), 'babelleaf-azw3-'));
  try {
    const formats = join(working, 'formats');
    execFileSync(process.execPath, [FORMAT_GENERATOR, '--output', formats], {
      cwd: REPO_ROOT,
      stdio: 'pipe',
    });
    const input = join(formats, 'EPUB', 'generated-valid.epub');
    const rawOutput = join(working, 'sample-babelleaf.raw.azw3');
    execFileSync(
      args.kindling,
      [
        'build',
        input,
        '--output',
        rawOutput,
        '--no-embed-source',
        '--no-hd-images',
        '--creator-tag',
      ],
      { cwd: REPO_ROOT, stdio: 'pipe' },
    );
    const outputBytes = normalizePalmDbTimestamps(readFileSync(rawOutput));
    mkdirSync(dirname(args.output), { recursive: true });
    writeFileSync(args.output, outputBytes);
    assertDrmFreeKf8(args.kindling, args.output);

    const provenance = {
      schemaVersion: 1,
      fixture: 'sample-babelleaf.azw3',
      source: 'repository-authored deterministic EPUB',
      sourceGenerator: 'babelleaf-format-fixtures@1.4.0',
      converter: {
        name: 'Kindling',
        version: KINDLING_VERSION,
        commit: '7e3e8d7',
        license: 'MIT',
        windowsSha256: KINDLING_WINDOWS_SHA256,
        releaseUrl: `https://github.com/ciscoriordan/kindling/releases/tag/v${KINDLING_VERSION}`,
      },
      normalization: {
        palmCreationTimestamp: FIXED_PALM_TIMESTAMP,
        palmModificationTimestamp: FIXED_PALM_TIMESTAMP,
      },
      output: {
        bytes: outputBytes.length,
        sha256: sha256(outputBytes),
        fileVersion: 8,
        encryption: 0,
      },
      usage: 'test-only; never copied into application release packages',
    };
    writeFileSync(
      `${args.output}.provenance.json`,
      `${JSON.stringify(provenance, null, 2)}\n`,
      'utf8',
    );
    console.log(
      `[BabelLeaf] generated DRM-free KF8 fixture ${args.output} (${outputBytes.length} bytes, ${provenance.output.sha256})`,
    );
  } finally {
    rmSync(working, { recursive: true, force: true });
  }
};

main();
