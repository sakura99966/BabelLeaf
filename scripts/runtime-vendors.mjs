import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {
  existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { RUNTIME_VENDORS } from './runtime-vendor-policy.mjs';

const MANIFEST = 'vendor/runtime-manifest.json';
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const slash = (path) => path.split(sep).join('/');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => JSON.stringify(value, null, 2) + '\n';

function inside(root, path) {
  const resolved = resolve(root, path);
  const child = relative(root, resolved);
  if (!child || child === '..' || child.startsWith('..' + sep) || isAbsolute(child))
    throw new Error('Runtime asset path escapes its root: ' + path);
  return resolved;
}

function bytes(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.size > MAX_FILE_BYTES)
    throw new Error('Invalid or oversized runtime source: ' + path);
  return readFileSync(path);
}

function filesIn(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const name = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error('Linked runtime entry is not allowed: ' + name);
    if (entry.isDirectory()) return filesIn(resolve(directory, entry.name), name + '/');
    if (!entry.isFile()) throw new Error('Unexpected runtime entry: ' + name);
    return [name];
  }).sort();
}

function assertOutputPath(root, path) {
  const target = inside(root, path);
  let current = target;
  while (current !== root) {
    let stat;
    try { stat = lstatSync(current); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (stat?.isSymbolicLink())
      throw new Error('Runtime output must not traverse a symbolic link: ' + current);
    current = dirname(current);
  }
  return target;
}

function readComponent(root, vendor) {
  const manifest = vendor.manifest
    ? JSON.parse(bytes(inside(root, vendor.manifest)).toString('utf8'))
    : vendor.component;
  if (!manifest) throw new Error('Runtime component metadata missing: ' + vendor.id);
  const revision = vendor.gitDirectory
    ? execFileSync('git', ['-C', inside(root, vendor.gitDirectory), 'rev-parse', 'HEAD'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
    : undefined;
  const name = vendor.name || manifest.name;
  const version = vendor.versionFromGit ? 'git.' + revision : manifest.version;
  const license = vendor.license || manifest.license;
  if (!name || !version || typeof license !== 'string' || !license.trim() || license === 'NOASSERTION')
    throw new Error('Runtime component version/license missing: ' + vendor.id);
  const repository = manifest.repository?.url || manifest.repository || manifest.homepage;
  return {
    id: vendor.id, name, version, license,
    ...(vendor.manifest ? { manifest: vendor.manifest } : {}),
    ...(revision ? { revision } : {}),
    ...(typeof repository === 'string' ? { repository } : {}),
  };
}

async function plan(root, options) {
  const vendors = options.vendors || RUNTIME_VENDORS;
  const publicRoot = assertOutputPath(root, options.publicRoot || 'apps/readest-app/public');
  const components = [];
  const assets = [];
  const destinations = new Set();
  const ids = new Set();
  let totalBytes = 0;
  let cssTools;
  for (const vendor of vendors) {
    if (ids.has(vendor.id)) throw new Error('Duplicate runtime component: ' + vendor.id);
    ids.add(vendor.id);
    components.push(readComponent(root, vendor));
    for (const source of vendor.sources) {
      const names = source.file ? [null]
        : source.all ? filesIn(inside(root, source.directory)) : source.files;
      if (!names?.length) throw new Error('Empty runtime source: ' + vendor.id);
      for (const name of names) {
        const sourcePath = source.file || source.directory + '/' + name;
        const sourceBytes = bytes(inside(root, sourcePath));
        const sourceSha256 = hash(sourceBytes);
        if (source.expectedSha256 && sourceSha256 !== source.expectedSha256[name])
          throw new Error('Pinned runtime source hash mismatch: ' + sourcePath);
        const path = vendor.directory + '/' + (source.to || source.rename?.[name] || name);
        assertOutputPath(publicRoot, path);
        if (destinations.has(path)) throw new Error('Duplicate runtime destination: ' + path);
        destinations.add(path);
        let output = sourceBytes;
        let transform;
        if (source.transform) {
          if (source.transform !== 'postcss-nested') throw new Error('Unknown runtime transform');
          if (!cssTools) {
            const require = createRequire(resolve(root, 'apps/readest-app/package.json'));
            cssTools = {
              postcss: require('postcss'), nested: require('postcss-nested'),
              versions: {
                postcss: require('postcss/package.json').version,
                'postcss-nested': require('postcss-nested/package.json').version,
              },
            };
          }
          const result = await cssTools.postcss([cssTools.nested]).process(sourceBytes.toString('utf8'), {
            from: undefined, map: false,
          });
          output = Buffer.from(result.css, 'utf8');
          transform = { name: source.transform, versions: cssTools.versions };
        }
        totalBytes += output.length;
        if (output.length > MAX_FILE_BYTES || totalBytes > MAX_TOTAL_BYTES)
          throw new Error('Runtime assets exceed resource budget');
        assets.push({
          path, component: vendor.id, source: sourcePath,
          sourceSha256, sha256: hash(output), bytes: output.length,
          ...(source.origin ? { origin: source.origin } : {}),
          ...(transform ? { transform } : {}), output,
        });
      }
    }
  }
  components.sort((a, b) => a.id.localeCompare(b.id, 'en'));
  assets.sort((a, b) => a.path.localeCompare(b.path, 'en'));
  return { publicRoot, vendors, components, assets, totalBytes };
}

function assertInventory(publicRoot, vendors, assets, allowNextBundles = false) {
  const allowed = new Set([MANIFEST, ...assets.map((asset) => asset.path)]);
  const groups = new Set(['vendor', ...vendors.map((vendor) => vendor.directory.split('/')[0])]);
  const visit = (path) => {
    const absolute = assertOutputPath(publicRoot, path);
    const stat = lstatSync(absolute);
    if (stat.isDirectory()) {
      if (![...allowed].some((entry) => entry.startsWith(path + '/')))
        throw new Error('Unmapped runtime directory: ' + path);
      for (const entry of readdirSync(absolute)) visit(path + '/' + entry);
    } else if (!stat.isFile() || !allowed.has(path)) {
      throw new Error('Unmapped runtime asset: ' + path);
    }
  };
  for (const group of groups) {
    const path = assertOutputPath(publicRoot, group);
    if (existsSync(path)) visit(group);
  }
  if (existsSync(publicRoot)) {
    // _next is generated from the separately inventoried production graph,
    // never a permitted escape hatch for third-party copies in public/.
    for (const entry of readdirSync(publicRoot, { withFileTypes: true })) {
      if (groups.has(entry.name) || (allowNextBundles && entry.name === '_next')) continue;
      const path = assertOutputPath(publicRoot, entry.name);
      const remaining = entry.isDirectory() ? filesIn(path).map((name) => entry.name + '/' + name)
        : [entry.name];
      for (const name of remaining) {
        if (/\.(?:[cm]?js|wasm|woff2?|otf|ttf|bcmap|css)$/i.test(name))
          throw new Error('Unmapped runtime asset outside copy groups: ' + name);
      }
    }
  }
}

function evidence(planned) {
  return {
    schemaVersion: 1, policy: 'BabelLeaf runtime copies v1',
    components: planned.components,
    totalBytes: planned.totalBytes,
    assets: planned.assets.map(({ output: _output, ...asset }) => asset),
  };
}

// Build-only APIs: no IO occurs merely by importing this module.
export async function prepareRuntimeVendors(root, options = {}) {
  root = resolve(root);
  const planned = await plan(root, options);
  // Never silently delete unreviewed/stale output or follow a destination link.
  assertInventory(planned.publicRoot, planned.vendors, planned.assets);
  for (const asset of planned.assets) {
    const target = assertOutputPath(planned.publicRoot, asset.path);
    mkdirSync(dirname(target), { recursive: true });
    if (!existsSync(target) || hash(bytes(target)) !== asset.sha256)
      writeFileSync(target, asset.output);
  }
  const result = evidence(planned);
  const target = assertOutputPath(planned.publicRoot, MANIFEST);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, json(result), 'utf8');
  return result;
}

export async function collectRuntimeVendorEvidence(root, options = {}) {
  root = resolve(root);
  const planned = await plan(root, options);
  assertInventory(planned.publicRoot, planned.vendors, planned.assets, options.allowNextBundles);
  for (const asset of planned.assets) {
    const actual = bytes(assertOutputPath(planned.publicRoot, asset.path));
    if (actual.length !== asset.bytes || hash(actual) !== asset.sha256)
      throw new Error('Runtime output/source mismatch: ' + asset.path);
  }
  return evidence(planned);
}

export async function verifyRuntimeVendorEvidence(root, options = {}) {
  const result = await collectRuntimeVendorEvidence(root, options);
  const publicRoot = inside(resolve(root), options.publicRoot || 'apps/readest-app/public');
  const stored = JSON.parse(bytes(assertOutputPath(publicRoot, MANIFEST)).toString('utf8'));
  if (json(stored) !== json(result))
    throw new Error('Runtime manifest is stale or has been modified; run setup-vendors');
  return result;
}
