#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBabelLeafVersion } from './sbom-metadata.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const applicationVersion = readBabelLeafVersion(repoRoot);
const defaultOutput = resolve(repoRoot, 'target', 'babelleaf-compliance', 'sbom.source.json');
const licenseOverridesPath = resolve(repoRoot, 'scripts', 'sbom-license-overrides.json');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const command = (program, args) => {
  try {
    return {
      ok: true,
      stdout: execFileSync(program, args, {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
    };
  } catch (error) {
    return {
      ok: false,
      stdout: error?.stdout?.toString?.() || '',
      stderr: error?.stderr?.toString?.() || error?.message || String(error),
    };
  }
};

const valueAfter = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const outputPath = resolve(repoRoot, valueAfter('--output', relative(repoRoot, defaultOutput)));
const artifactPath = valueAfter('--artifact', undefined);
const cargoTarget = valueAfter('--target', 'x86_64-pc-windows-msvc');
const strict = process.argv.includes('--strict');
const licenseOverrides = existsSync(licenseOverridesPath) ? readJson(licenseOverridesPath) : {};

const licenseValue = (manifest) => {
  if (typeof manifest.license === 'string' && manifest.license.trim()) return manifest.license.trim();
  if (Array.isArray(manifest.licenses) && manifest.licenses.length > 0) {
    const names = manifest.licenses
      .map((entry) => (typeof entry === 'string' ? entry : entry?.type))
      .filter((entry) => typeof entry === 'string' && entry.trim());
    if (names.length) return names.join(' OR ');
  }
  return 'NOASSERTION';
};

const sourceUrl = (manifest) => {
  if (typeof manifest.repository === 'string') return manifest.repository;
  if (manifest.repository && typeof manifest.repository.url === 'string') return manifest.repository.url;
  if (typeof manifest.homepage === 'string') return manifest.homepage;
  return undefined;
};

const npmPurl = (name, version) => {
  const encoded = name.startsWith('@')
    ? `@${encodeURIComponent(name.slice(1))}`
    : encodeURIComponent(name);
  return `pkg:npm/${encoded}@${encodeURIComponent(version)}`;
};

const packageManifestPaths = (directory, result = []) => {
  if (!existsSync(directory)) return result;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', '.git', 'target', 'dist', 'release'].includes(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) packageManifestPaths(path, result);
    else if (entry.isFile() && entry.name === 'package.json') result.push(path);
  }
  return result;
};

const pnpmArgs = [
  'list',
  '--prod',
  '--json',
  '--depth',
  'Infinity',
  '--recursive',
];
const pnpmEntrypoint = process.env.npm_execpath;
const npmResult =
  pnpmEntrypoint && existsSync(pnpmEntrypoint)
    ? command(process.execPath, [pnpmEntrypoint, ...pnpmArgs])
    : process.platform === 'win32'
      ? command(process.env.ComSpec || 'cmd.exe', [
          '/d',
          '/s',
          '/c',
          `corepack pnpm ${pnpmArgs.join(' ')}`,
        ])
      : command('corepack', ['pnpm', ...pnpmArgs]);
const npmComponents = new Map();
const npmGaps = [];
const skippedNpmPackages = new Set();

if (npmResult.ok) {
  try {
    const projects = JSON.parse(npmResult.stdout);
    const visitDependencies = (dependencies, scope = 'required') => {
      for (const [name, value] of Object.entries(dependencies || {})) {
        const version = typeof value === 'string' ? value : value?.version;
        if (typeof version !== 'string' || !version.trim()) {
          npmGaps.push(`pnpm dependency without a resolved version: ${name}`);
          continue;
        }
        const key = `${name}@${version}`;
        let manifest;
        const manifestPath = value?.path ? resolve(value.path, 'package.json') : undefined;
        if (manifestPath && existsSync(manifestPath)) {
          try {
            manifest = readJson(manifestPath);
          } catch (error) {
            npmGaps.push(
              `Unable to read npm manifest for ${key}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        } else {
          // pnpm reports lock-graph alternatives for other operating systems
          // even without --lockfile-only. A missing package directory means
          // the dependency is not installed in, and cannot enter, this target
          // artifact. Record the exclusion count rather than a false license
          // gap for macOS/Linux/other-architecture native binaries.
          skippedNpmPackages.add(key);
          continue;
        }
        const license = manifest ? licenseValue(manifest) : 'NOASSERTION';
        if (!npmComponents.has(key)) {
          npmComponents.set(key, {
            type: 'library',
            'bom-ref': `npm:${key}`,
            name,
            version,
            purl: npmPurl(name, version),
            scope,
            licenses: [{ license: { id: license } }],
            ...(manifest && sourceUrl(manifest)
              ? { externalReferences: [{ type: 'vcs', url: sourceUrl(manifest) }] }
              : {}),
          });
        } else if (scope === 'required') {
          npmComponents.get(key).scope = 'required';
        }
        if (license === 'NOASSERTION') npmGaps.push(`npm license missing: ${key}`);
        visitDependencies(value?.dependencies, scope);
        visitDependencies(value?.optionalDependencies, 'optional');
      }
    };
    for (const project of Array.isArray(projects) ? projects : [projects]) {
      visitDependencies(project.dependencies, 'required');
      visitDependencies(project.optionalDependencies, 'optional');
    }
  } catch (error) {
    npmGaps.push(`Unable to parse pnpm list output: ${error instanceof Error ? error.message : String(error)}`);
  }
} else {
  npmGaps.push(`pnpm list failed: ${npmResult.stderr}`.slice(0, 1_000));
  // This source-only fallback is deliberately marked incomplete. CI must run
  // the strict command with a working pnpm store before release.
  for (const path of packageManifestPaths(repoRoot)) {
    try {
      const manifest = readJson(path);
      if (!manifest.name || !manifest.version) continue;
      const key = `${manifest.name}@${manifest.version}`;
      if (npmComponents.has(key)) continue;
      const license = licenseValue(manifest);
      npmComponents.set(key, {
        type: 'library',
        'bom-ref': `npm:${key}`,
        name: manifest.name,
        version: manifest.version,
        purl: npmPurl(manifest.name, manifest.version),
        scope: 'required',
        licenses: [{ license: { id: license } }],
        ...(sourceUrl(manifest) ? { externalReferences: [{ type: 'vcs', url: sourceUrl(manifest) }] } : {}),
      });
      if (license === 'NOASSERTION') npmGaps.push(`npm license missing: ${manifest.name}`);
    } catch (error) {
      npmGaps.push(`Unable to read ${relative(repoRoot, path)}: ${error}`);
    }
  }
}

// Compliance evidence must never download crates or package data. A release
// job may populate its cache in a separate, reviewed step before this command.
const cargoResult = command('cargo.exe', [
  'metadata',
  '--format-version',
  '1',
  '--locked',
  '--offline',
  '--filter-platform',
  cargoTarget,
]);
const cargoComponents = [];
const cargoGaps = [];
if (cargoResult.ok) {
  try {
    const metadata = JSON.parse(cargoResult.stdout);
    for (const pkg of metadata.packages || []) {
      const componentKey = `cargo:${pkg.name}@${pkg.version}`;
      const licenseOverride = licenseOverrides[componentKey];
      const license =
        typeof pkg.license === 'string' && pkg.license.trim()
          ? pkg.license
          : typeof licenseOverride?.license === 'string' && licenseOverride.license.trim()
            ? licenseOverride.license.trim()
            : 'NOASSERTION';
      cargoComponents.push({
        type: 'library',
        'bom-ref': componentKey,
        name: pkg.name,
        version: pkg.version,
        purl: `pkg:cargo/${encodeURIComponent(pkg.name)}@${encodeURIComponent(pkg.version)}`,
        licenses: [{ license: { id: license } }],
        ...(licenseOverride?.evidence
          ? {
              properties: [
                { name: 'babelleaf.license.override.evidence', value: licenseOverride.evidence },
              ],
            }
          : {}),
        ...(pkg.source ? { externalReferences: [{ type: 'distribution', url: pkg.source }] } : {}),
        ...(pkg.repository ? { externalReferences: [{ type: 'vcs', url: pkg.repository }] } : {}),
      });
      if (license === 'NOASSERTION') cargoGaps.push(`cargo license missing: ${pkg.name}@${pkg.version}`);
    }
  } catch (error) {
    cargoGaps.push(`Unable to parse cargo metadata: ${error instanceof Error ? error.message : String(error)}`);
  }
} else {
  cargoGaps.push(`cargo metadata failed: ${cargoResult.stderr}`.slice(0, 1_000));
}

const gitHead = command('git.exe', ['rev-parse', 'HEAD']);
const gitStatus = command('git.exe', ['status', '--porcelain']);
const submoduleResult = command('git.exe', ['submodule', 'status', '--recursive']);
const submodules = submoduleResult.ok
  ? submoduleResult.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^[-+ ]?([0-9a-f]+)\s+(.+)$/i);
        return match ? { path: match[2], revision: match[1], raw: line } : { raw: line };
      })
  : [];

const artifact = artifactPath
  ? (() => {
      const absolute = resolve(repoRoot, artifactPath);
      if (!existsSync(absolute) || !statSync(absolute).isFile()) throw new Error(`Artifact does not exist: ${artifactPath}`);
      const bytes = readFileSync(absolute);
      return {
        path: relative(repoRoot, absolute),
        bytes: bytes.byteLength,
        sha256: createHash('sha256').update(bytes).digest('hex').toUpperCase(),
      };
    })()
  : undefined;

const gaps = [...npmGaps, ...cargoGaps];
const document = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  serialNumber: `urn:uuid:${randomUUID()}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: [{ vendor: 'BabelLeaf', name: 'generate-sbom.mjs', version: applicationVersion }],
    component: { type: 'application', name: 'BabelLeaf', version: applicationVersion },
    properties: [
      { name: 'git.head', value: gitHead.ok ? gitHead.stdout.trim() : 'UNKNOWN' },
      { name: 'git.dirty', value: gitStatus.ok && gitStatus.stdout.trim() ? 'true' : 'false' },
      { name: 'pnpm.list.complete', value: npmResult.ok ? 'true' : 'false' },
      { name: 'cargo.target', value: cargoTarget },
    ],
  },
  components: [...npmComponents.values(), ...cargoComponents],
  properties: [
    { name: 'babelleaf.compliance.status', value: gaps.length ? 'INCOMPLETE' : 'SOURCE_COMPLETE' },
    { name: 'babelleaf.compliance.licensePolicy', value: 'NOASSERTION requires manual review' },
    { name: 'babelleaf.npm.excludedAbsentPackages', value: String(skippedNpmPackages.size) },
    ...(submodules.length ? [{ name: 'babelleaf.submodules', value: JSON.stringify(submodules) }] : []),
    ...(artifact ? [{ name: 'babelleaf.artifact.sha256', value: artifact.sha256 }] : []),
  ],
  ...(artifact ? { artifact } : {}),
  gaps,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
console.log(
  `[BabelLeaf] SBOM written: ${relative(repoRoot, outputPath)}; components=${document.components.length}; gaps=${gaps.length}`,
);
if (strict && gaps.length > 0) process.exitCode = 2;
