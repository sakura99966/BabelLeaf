import { readFileSync, writeFileSync } from 'node:fs';

// Keep security hardening reproducible without pointing the upstream submodule
// at an unpublished local commit. Fail closed if upstream changes the targets.
const files = [
  ['paginator.js', 1],
  ['fixed-layout.js', 2],
];
for (const [name, expected] of files) {
  const path = new URL(`../packages/foliate-js/${name}`, import.meta.url);
  const source = readFileSync(path, 'utf8');
  const pattern = /setAttribute\('sandbox', 'allow-same-origin(?: allow-scripts)?'\)/g;
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== expected) throw new Error(`Unexpected reader sandbox targets: ${name}`);
  const hardened = source.replace(pattern, "setAttribute('sandbox', 'allow-same-origin')");
  if (hardened.includes("'allow-same-origin allow-scripts'")) {
    throw new Error(`Unsafe reader sandbox remains: ${name}`);
  }
  if (hardened !== source) writeFileSync(path, hardened);
}
