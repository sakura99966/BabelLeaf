import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fixturesDir = path.dirname(fileURLToPath(import.meta.url));

/** Synthetic plain-text book — fast, used for basic import coverage. */
export const SAMPLE_TXT = path.join(fixturesDir, 'books/readest-e2e-sample.txt');

/**
 * A real EPUB ("Alice's Adventures in Wonderland") from the unit-test
 * fixtures. Has multiple chapters and substantial prose, so it exercises
 * reading and annotation flows realistically.
 */
export const SAMPLE_EPUB = path.join(
  fixturesDir,
  '../../src/__tests__/fixtures/data/sample-alice.epub',
);

export const FORMAT_FIXTURES = {
  EPUB: SAMPLE_EPUB,
  PDF: path.join(fixturesDir, '../../src/__tests__/fixtures/data/sample-alice.pdf'),
  MOBI: path.join(fixturesDir, '../../src/__tests__/fixtures/data/sample-war-peace.mobi'),
  AZW3: path.join(fixturesDir, '../../src/__tests__/fixtures/data/sample-babelleaf.azw3'),
  FB2: path.join(fixturesDir, '../../src/__tests__/fixtures/data/sample-metadata.fb2'),
  CBZ: path.join(fixturesDir, '../../src/__tests__/fixtures/data/sample-metadata.cbz'),
  TXT: path.join(fixturesDir, '../../src/__tests__/fixtures/data/sample-alice.txt'),
  Markdown: path.join(fixturesDir, '../../src/__tests__/fixtures/data/sample-fixture.md'),
} as const;
