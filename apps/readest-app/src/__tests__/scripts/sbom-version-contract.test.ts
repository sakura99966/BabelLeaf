import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readBabelLeafVersion } from '../../../../../scripts/sbom-metadata.mjs';

const repoRoot = resolve(__dirname, '../../../../..');

describe('SBOM release version contract', () => {
  it('reads the application version from the canonical package manifest', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(repoRoot, 'apps/readest-app/package.json'), 'utf8'),
    ) as { version: string };

    expect(readBabelLeafVersion(repoRoot)).toBe(manifest.version);
  });

  it('uses the canonical version for the SBOM application component', () => {
    const generator = readFileSync(resolve(repoRoot, 'scripts/generate-sbom.mjs'), 'utf8');

    expect(generator).toContain(
      "component: { type: 'application', name: 'BabelLeaf', version: applicationVersion }",
    );
    expect(generator).not.toMatch(/component:.*version:\s*['"]\d+\.\d+\.\d+/);
  });

  it('uses Corepack instead of an unrelated ambient pnpm fallback', () => {
    const generator = readFileSync(resolve(repoRoot, 'scripts/generate-sbom.mjs'), 'utf8');

    expect(generator).toContain('corepack pnpm');
    expect(generator).not.toContain('`pnpm ${pnpmArgs.join');
  });

  it('generates an RFC 4122 serial number for each CycloneDX document', () => {
    const generator = readFileSync(resolve(repoRoot, 'scripts/generate-sbom.mjs'), 'utf8');

    expect(generator).toMatch(/serialNumber: `urn:uuid:\$\{randomUUID\(\)\}`/);
    expect(generator).not.toContain('urn:uuid:babelleaf-source-sbom');
  });
});
