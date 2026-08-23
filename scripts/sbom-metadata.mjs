import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const releaseVersionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export const readBabelLeafVersion = (repoRoot) => {
  const manifestPath = resolve(repoRoot, 'apps', 'readest-app', 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (typeof manifest.version !== 'string' || !releaseVersionPattern.test(manifest.version)) {
    throw new Error(`Invalid BabelLeaf release version in ${manifestPath}`);
  }
  return manifest.version;
};
