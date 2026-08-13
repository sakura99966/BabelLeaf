import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, test } from 'vitest';
import { DocumentLoader } from '@/libs/document';
import { extractTranslationItems } from '@/services/translators';

const appRoot = resolve(__dirname, '../../../../');
const repoRoot = resolve(appRoot, '../..');
const sourceManifestPath = join(appRoot, 'test-data', 'FORMAT_FIXTURE_MANIFEST.json');
const generatorPath = join(repoRoot, 'scripts', 'fixtures', 'generate-format-fixtures.mjs');

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

describe('executable format fixture manifest', () => {
  test('generates deterministic hostile inputs and verifies source immutability', async () => {
    const sourceManifest = JSON.parse(readFileSync(sourceManifestPath, 'utf8')) as {
      entries: Array<{
        id: string;
        path: string | null;
        source: string;
        bytes: number | null;
        sha256: string | null;
      }>;
    };
    const output = mkdtempSync(join(tmpdir(), 'babelleaf-format-fixtures-'));

    try {
      execFileSync(
        process.execPath,
        [generatorPath, '--output', output, '--manifest', sourceManifestPath],
        {
          cwd: repoRoot,
          stdio: 'pipe',
          env: { ...process.env, BABELLEAF_FIXTURE_NETWORK: 'disabled' },
        },
      );
      const generatedManifest = JSON.parse(
        readFileSync(join(output, 'FORMAT_FIXTURE_MANIFEST.json'), 'utf8'),
      ) as typeof sourceManifest & {
        generator: { networkPolicy: string };
      };

      expect(generatedManifest.generator.networkPolicy).toBe('none');
      const generatedEntries = generatedManifest.entries.filter(
        (entry) => entry.source === 'generated-local',
      );
      expect(generatedEntries.length).toBeGreaterThanOrEqual(30);
      expect(generatedEntries.map((entry) => entry.id)).toEqual(
        expect.arrayContaining([
          'azw.valid',
          'epub.generated-valid',
          'fbz.image-only',
          'pdf.image-only',
          'image-folder.valid',
        ]),
      );
      expect(
        generatedManifest.entries
          .filter((entry) => entry.source === 'external-required')
          .map((entry) => entry.id),
      ).toEqual([]);
      expect(generatedManifest.entries.find((entry) => entry.id === 'azw3.valid')).toMatchObject({
        path: 'apps/readest-app/src/__tests__/fixtures/data/sample-babelleaf.azw3',
        source: 'repository-owned',
      });

      for (const entry of generatedEntries) {
        expect(entry.path).not.toBeNull();
        const generatedPath = resolve(output, entry.path as string);
        expect(generatedPath.startsWith(`${resolve(output)}${sep}`)).toBe(true);
        const bytes = readFileSync(generatedPath);
        expect(bytes.length).toBe(entry.bytes);
        expect(sha256(bytes)).toBe(entry.sha256);
      }

      for (const entry of sourceManifest.entries.filter(
        (candidate) => candidate.source === 'repository-owned' && candidate.path,
      )) {
        const bytes = readFileSync(join(repoRoot, entry.path as string));
        expect(bytes.length).toBe(entry.bytes);
        expect(sha256(bytes)).toBe(entry.sha256);
      }

      const imageOnlyEntry = generatedEntries.find((entry) => entry.id === 'cbz.image-only');
      const imageOnlyBytes = readFileSync(resolve(output, imageOnlyEntry?.path as string));
      const imageOnlyBook = await new DocumentLoader(
        new File([imageOnlyBytes], 'image-only.cbz', {
          type: 'application/vnd.comicbook+zip',
        }),
      ).open();
      await expect(
        extractTranslationItems(imageOnlyBook.book, { format: 'CBZ' }),
      ).rejects.toMatchObject({ code: 'image-only' });

      const azwEntry = generatedEntries.find((entry) => entry.id === 'azw.valid');
      const azwBytes = readFileSync(resolve(output, azwEntry?.path as string));
      const azwBook = await new DocumentLoader(
        new File([azwBytes], 'valid.azw', { type: 'application/vnd.amazon.ebook' }),
      ).open();
      await expect(
        extractTranslationItems(azwBook.book, { format: 'AZW', maxSegments: 4 }),
      ).resolves.not.toHaveLength(0);

      const sourcePath = join(
        repoRoot,
        'apps/readest-app/src/__tests__/fixtures/data/sample-alice.epub',
      );
      const before = sha256(readFileSync(sourcePath));
      await new DocumentLoader(
        new File([readFileSync(sourcePath)], 'sample-alice.epub', {
          type: 'application/epub+zip',
        }),
      ).open();
      expect(sha256(readFileSync(sourcePath))).toBe(before);
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  }, 60000);
});
