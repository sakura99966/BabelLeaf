#!/usr/bin/env node

/**
 * Generate deterministic, local-only hostile input fixtures for the BabelLeaf
 * format/OCR acceptance matrix.
 *
 * The script intentionally uses only Node built-ins. It never downloads a
 * book, follows a URL, or imports a network client. Generated files are test
 * inputs and must not be copied into release packages.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const GENERATOR_ID = 'babelleaf-format-fixtures';
const GENERATOR_VERSION = '1.4.0';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_OUTPUT = join(REPO_ROOT, 'target', GENERATOR_ID);
const REPOSITORY_MOBI_FIXTURE = join(
  REPO_ROOT,
  'apps/readest-app/src/__tests__/fixtures/data/sample-war-peace.mobi',
);

const LIMITS = Object.freeze({
  maxFileBytes: 512 * 1024 * 1024,
  maxArchiveEntries: 20_000,
  maxUncompressedBytes: 2 * 1024 * 1024 * 1024,
});

const ONE_BY_ONE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const parseArgs = (argv) => {
  const args = { output: DEFAULT_OUTPUT, manifest: null, check: false, writeManifest: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--output') {
      args.output = resolve(argv[++index]);
    } else if (value === '--manifest') {
      args.manifest = resolve(argv[++index]);
    } else if (value === '--check') {
      args.check = true;
    } else if (value === '--write-manifest') {
      args.writeManifest = true;
    } else if (value === '--help' || value === '-h') {
      console.log('Usage: node scripts/fixtures/generate-format-fixtures.mjs [--output DIR] [--manifest FILE] [--write-manifest] [--check]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${value}`);
    }
  }
  return args;
};

const crc32 = (input) => {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const u16 = (value) => {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value & 0xffff, 0);
  return buffer;
};

const u32 = (value) => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0, 0);
  return buffer;
};

/** Build a deterministic STORE-only ZIP with optional hostile header values. */
const zip = (entries) => {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data ?? '');
    const crc = crc32(data);
    const compressedSize = entry.compressedSize ?? data.length;
    const uncompressedSize = entry.uncompressedSize ?? data.length;
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(compressedSize),
      u32(uncompressedSize),
      u16(name.length),
      u16(0),
      name,
      data,
    ]);
    localParts.push(local);
    centralParts.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(compressedSize),
        u32(uncompressedSize),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ]),
    );
    offset += local.length;
  }

  const central = Buffer.concat(centralParts);
  const locals = Buffer.concat(localParts);
  return Buffer.concat([
    locals,
    central,
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(central.length),
    u32(locals.length),
    u16(0),
  ]);
};

const epub = ({ empty = false, encrypted = false, remote = false } = {}) => {
  const chapter = empty
    ? '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Empty</title></head><body/></html>'
    : `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>BabelLeaf fixture</title></head><body><p>A local fixture for validation.</p>${remote ? '<img src="https://example.com/remote.png" alt="remote resource"/>' : ''}</body></html>`;
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">babelleaf-fixture</dc:identifier><dc:title>BabelLeaf fixture</dc:title><dc:creator>BabelLeaf contributors</dc:creator><dc:language>en</dc:language><meta name="cover" content="cover"/></metadata>
  <manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/></manifest>
  <spine><itemref idref="chapter"/></spine>
</package>`;
  const entries = [
    { name: 'mimetype', data: 'application/epub+zip' },
    {
      name: 'META-INF/container.xml',
      data: '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    },
    { name: 'OEBPS/content.opf', data: opf },
    { name: 'OEBPS/chapter.xhtml', data: chapter },
    {
      name: 'OEBPS/nav.xhtml',
      data: '<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">BabelLeaf fixture</a></li></ol></nav></body></html>',
    },
    { name: 'OEBPS/cover.png', data: ONE_BY_ONE_PNG },
  ];
  if (encrypted) {
    entries.push({
      name: 'META-INF/rights.xml',
      data: '<?xml version="1.0"?><rights xmlns="http://www.ischo.org/ns/rights/">DRM encrypted test fixture</rights>',
    });
  }
  return zip(entries);
};

const pdf = ({ imageOnly = false, malformed = false, encrypted = false, oversized = false } = {}) => {
  if (malformed) return Buffer.from('%PDF-1.7\n% malformed BabelLeaf fixture\n', 'ascii');
  if (encrypted) return Buffer.from('%PDF-1.7\n% DRM encrypted BabelLeaf fixture\n', 'ascii');
  if (oversized) return Buffer.from('%PDF-1.7\n1 0 obj\n<< /Length 2147483648 >>\nendobj\n', 'ascii');

  const objects = [];
  const add = (value) => objects.push(Buffer.from(value, 'binary'));
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  if (imageOnly) {
    add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1 1] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>');
    add('<< /Length 17 >>\nstream\nq 1 0 0 1 0 0 cm /Im1 Do Q\nendstream');
    add('<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 1 >>\nstream\n\x00\nendstream');
  } else {
    add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>');
    add('<< /Length 35 >>\nstream\nBT /F1 12 Tf 72 720 Td (BabelLeaf) Tj ET\nendstream');
  }
  const header = Buffer.from('%PDF-1.7\n% BabelLeaf fixture\n', 'ascii');
  const parts = [header];
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.concat(parts).length);
    parts.push(Buffer.from(`${index + 1} 0 obj\n`, 'ascii'), objects[index], Buffer.from('\nendobj\n', 'ascii'));
  }
  const xrefOffset = Buffer.concat(parts).length;
  const xref = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n'];
  for (let index = 1; index < offsets.length; index += 1) {
    xref.push(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`);
  }
  parts.push(Buffer.from(xref.join(''), 'ascii'));
  parts.push(Buffer.from(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`, 'ascii'));
  return Buffer.concat(parts);
};

const text = (value) => Buffer.from(value, 'utf8');

const generatedCases = () => [
  { id: 'epub.generated-valid', format: 'EPUB', kind: 'valid-source', path: 'EPUB/generated-valid.epub', data: epub(), expectedDiagnostic: 'supported', nativeFormat: true, notes: 'Repository-authored source used to generate the DRM-free KF8/AZW3 qualification fixture.' },
  { id: 'epub.empty', format: 'EPUB', kind: 'empty', path: 'EPUB/empty.epub', data: epub({ empty: true }), expectedDiagnostic: 'empty-text', nativeFormat: true },
  { id: 'epub.malformed', format: 'EPUB', kind: 'malformed', path: 'EPUB/malformed.epub', data: Buffer.from('not a ZIP container', 'ascii'), expectedDiagnostic: 'malformed', nativeFormat: true },
  { id: 'epub.encrypted', format: 'EPUB', kind: 'encrypted-marker', path: 'EPUB/encrypted.epub', data: epub({ encrypted: true }), expectedDiagnostic: 'drm', nativeFormat: true, notes: 'Synthetic rights marker; not a DRM circumvention fixture.' },
  { id: 'epub.remote-resource', format: 'EPUB', kind: 'remote-resource', path: 'EPUB/remote-resource.epub', data: epub({ remote: true }), expectedDiagnostic: 'supported', nativeFormat: true, notes: 'External resource is a policy test; the reader must not fetch it implicitly.' },
  { id: 'epub.path-traversal', format: 'EPUB', kind: 'path-traversal', path: 'EPUB/path-traversal.epub', data: zip([{ name: 'mimetype', data: 'application/epub+zip' }, { name: '../outside.txt', data: 'must remain inside extraction root' }]), expectedDiagnostic: 'malformed', nativeFormat: true },
  { id: 'pdf.image-only', format: 'PDF', kind: 'image-only', path: 'PDF/image-only.pdf', data: pdf({ imageOnly: true }), expectedDiagnostic: 'image-only', nativeFormat: true },
  { id: 'pdf.malformed', format: 'PDF', kind: 'malformed', path: 'PDF/malformed.pdf', data: pdf({ malformed: true }), expectedDiagnostic: 'malformed', nativeFormat: true },
  { id: 'pdf.encrypted', format: 'PDF', kind: 'encrypted-marker', path: 'PDF/encrypted.pdf', data: pdf({ encrypted: true }), expectedDiagnostic: 'drm', nativeFormat: true, notes: 'Synthetic marker; not a real encrypted document.' },
  { id: 'pdf.oversized', format: 'PDF', kind: 'resource-limit', path: 'PDF/oversized-page.pdf', data: pdf({ oversized: true }), expectedDiagnostic: 'oversized', nativeFormat: true, notes: 'Declared stream length exceeds the resource budget without allocating the payload.' },
  { id: 'mobi.malformed', format: 'MOBI', kind: 'malformed', path: 'MOBI/malformed.mobi', data: text('BOOKMOBI truncated PalmDB fixture'), expectedDiagnostic: 'malformed', nativeFormat: false, notes: 'Malformed-case only; valid MOBI remains a repository-owned sample.' },
  { id: 'mobi.empty', format: 'MOBI', kind: 'empty', path: 'MOBI/empty.mobi', data: Buffer.alloc(0), expectedDiagnostic: 'empty-text', nativeFormat: false },
  { id: 'mobi.encrypted', format: 'MOBI', kind: 'encrypted-marker', path: 'MOBI/encrypted.mobi', data: text('BOOKMOBI DRM encrypted test fixture'), expectedDiagnostic: 'drm', nativeFormat: false, notes: 'Synthetic marker; no DRM is bypassed.' },
  { id: 'azw.valid', format: 'AZW', kind: 'valid', path: 'AZW/valid.azw', data: readFileSync(REPOSITORY_MOBI_FIXTURE), expectedDiagnostic: 'supported', nativeFormat: true, license: 'derived from the repository-owned DRM-free MOBI test fixture; test-only copy', notes: 'AZW is the classic MOBI-family container under the Amazon extension; byte identity is retained so only extension routing differs.' },
  { id: 'azw.malformed', format: 'AZW', kind: 'malformed', path: 'AZW/malformed.azw', data: text('AZW truncated test fixture'), expectedDiagnostic: 'malformed', nativeFormat: false, notes: 'Malformed companion to the locally generated DRM-free AZW route fixture.' },
  { id: 'azw.encrypted', format: 'AZW', kind: 'encrypted-marker', path: 'AZW/encrypted.azw', data: text('AZW DRM encrypted test fixture'), expectedDiagnostic: 'drm', nativeFormat: false, notes: 'Synthetic marker; no DRM is bypassed.' },
  { id: 'azw3.malformed', format: 'AZW3', kind: 'malformed', path: 'AZW3/malformed.azw3', data: text('AZW3 truncated test fixture'), expectedDiagnostic: 'malformed', nativeFormat: false, notes: 'Valid native AZW3 must be supplied as an external legal sample.' },
  { id: 'azw3.encrypted', format: 'AZW3', kind: 'encrypted-marker', path: 'AZW3/encrypted.azw3', data: text('AZW3 DRM encrypted test fixture'), expectedDiagnostic: 'drm', nativeFormat: false, notes: 'Synthetic marker; no DRM is bypassed.' },
  { id: 'fb2.empty', format: 'FB2', kind: 'empty', path: 'FB2/empty.fb2', data: text('<?xml version="1.0" encoding="UTF-8"?><FictionBook><body/></FictionBook>'), expectedDiagnostic: 'empty-text', nativeFormat: true },
  { id: 'fb2.malformed', format: 'FB2', kind: 'malformed', path: 'FB2/malformed.fb2', data: text('<?xml version="1.0"?><FictionBook><body>'), expectedDiagnostic: 'malformed', nativeFormat: true },
  { id: 'fb2.encrypted', format: 'FB2', kind: 'encrypted-marker', path: 'FB2/encrypted.fb2', data: text('<FictionBook><description>DRM encrypted test fixture</description></FictionBook>'), expectedDiagnostic: 'drm', nativeFormat: true, notes: 'Synthetic marker; not a rights-management bypass test.' },
  { id: 'cbz.image-only', format: 'CBZ', kind: 'image-only', path: 'CBZ/image-only.cbz', data: zip([{ name: '001.png', data: ONE_BY_ONE_PNG }]), expectedDiagnostic: 'image-only', nativeFormat: true },
  { id: 'cbz.malformed', format: 'CBZ', kind: 'malformed', path: 'CBZ/malformed.cbz', data: Buffer.from('not a ZIP archive', 'ascii'), expectedDiagnostic: 'malformed', nativeFormat: true },
  { id: 'cbz.encrypted', format: 'CBZ', kind: 'encrypted-marker', path: 'CBZ/encrypted.cbz', data: zip([{ name: 'DRM.txt', data: 'encrypted test fixture' }]), expectedDiagnostic: 'drm', nativeFormat: true, notes: 'Synthetic marker; encrypted ZIP support is not claimed.' },
  { id: 'cbz.path-traversal', format: 'CBZ', kind: 'path-traversal', path: 'CBZ/path-traversal.cbz', data: zip([{ name: '../outside.png', data: ONE_BY_ONE_PNG }]), expectedDiagnostic: 'malformed', nativeFormat: true },
  { id: 'cbz.compression-bomb', format: 'CBZ', kind: 'compression-bomb', path: 'CBZ/compression-bomb.cbz', data: zip([{ name: 'bomb.bin', data: Buffer.from('x'), compressedSize: 1, uncompressedSize: LIMITS.maxUncompressedBytes + 1 }]), expectedDiagnostic: 'oversized', nativeFormat: true, notes: 'Header-only size declaration avoids allocating gigabytes.' },
  { id: 'fbz.image-only', format: 'FBZ', kind: 'image-only', path: 'FBZ/image-only.fbz', data: zip([{ name: '001.png', data: ONE_BY_ONE_PNG }]), expectedDiagnostic: 'image-only', nativeFormat: true },
  { id: 'fbz.malformed', format: 'FBZ', kind: 'malformed', path: 'FBZ/malformed.fbz', data: Buffer.from('not a ZIP archive', 'ascii'), expectedDiagnostic: 'malformed', nativeFormat: true },
  { id: 'fbz.path-traversal', format: 'FBZ', kind: 'path-traversal', path: 'FBZ/path-traversal.fbz', data: zip([{ name: '../outside.png', data: ONE_BY_ONE_PNG }]), expectedDiagnostic: 'malformed', nativeFormat: true },
  { id: 'txt.empty', format: 'TXT', kind: 'empty', path: 'TXT/empty.txt', data: Buffer.alloc(0), expectedDiagnostic: 'empty-text', nativeFormat: true },
  { id: 'txt.malformed', format: 'TXT', kind: 'malformed', path: 'TXT/malformed.txt', data: Buffer.from([0xff, 0xfe, 0x00, 0x00]), expectedDiagnostic: 'malformed', nativeFormat: true, notes: 'Invalid UTF-8 marker for decoder validation.' },
  { id: 'txt.encrypted', format: 'TXT', kind: 'encrypted-marker', path: 'TXT/encrypted.txt', data: text('DRM encrypted test fixture'), expectedDiagnostic: 'drm', nativeFormat: true, notes: 'Synthetic marker only.' },
  { id: 'md.empty', format: 'MD', kind: 'empty', path: 'MD/empty.md', data: Buffer.alloc(0), expectedDiagnostic: 'empty-text', nativeFormat: true },
  { id: 'md.malformed', format: 'MD', kind: 'malformed', path: 'MD/malformed.md', data: text('---\ntitle: [unterminated\n---\n# fixture'), expectedDiagnostic: 'malformed', nativeFormat: true },
  { id: 'md.encrypted', format: 'MD', kind: 'encrypted-marker', path: 'MD/encrypted.md', data: text('DRM encrypted test fixture'), expectedDiagnostic: 'drm', nativeFormat: true, notes: 'Synthetic marker only.' },
  { id: 'image-folder.valid', format: 'IMAGE_FOLDER', kind: 'manifest', path: 'IMAGE_FOLDER/valid.manifest.json', data: text(JSON.stringify({ version: 1, sourceType: 'IMAGE_FOLDER', pages: ['001.png'], policy: 'explicit-user-selection' }, null, 2) + '\n'), expectedDiagnostic: 'supported', nativeFormat: true },
  { id: 'image-folder.malformed', format: 'IMAGE_FOLDER', kind: 'malformed', path: 'IMAGE_FOLDER/malformed.manifest.json', data: text('{"version":1,"pages":'), expectedDiagnostic: 'malformed', nativeFormat: true },
  { id: 'image-folder.path-traversal', format: 'IMAGE_FOLDER', kind: 'path-traversal', path: 'IMAGE_FOLDER/path-traversal.manifest.json', data: text(JSON.stringify({ version: 1, pages: ['../outside.png'] }) + '\n'), expectedDiagnostic: 'malformed', nativeFormat: true },
  { id: 'image-folder.oversized', format: 'IMAGE_FOLDER', kind: 'resource-limit', path: 'IMAGE_FOLDER/oversized.manifest.json', data: text(JSON.stringify({ version: 1, declaredBytes: LIMITS.maxFileBytes + 1, pages: [] }) + '\n'), expectedDiagnostic: 'oversized', nativeFormat: true },
];

const repositoryCases = () => {
  return [
    { id: 'epub.valid', format: 'EPUB', kind: 'valid', path: 'apps/readest-app/src/__tests__/fixtures/data/sample-alice.epub', nativeFormat: true, expectedDiagnostic: 'supported', license: 'repository-owned test fixture; verify upstream redistribution terms before release' },
    { id: 'pdf.valid', format: 'PDF', kind: 'valid', path: 'apps/readest-app/src/__tests__/fixtures/data/sample-alice.pdf', nativeFormat: true, expectedDiagnostic: 'text-layer', license: 'repository-owned test fixture; verify upstream redistribution terms before release' },
    { id: 'pdf.mixed-or-image', format: 'PDF', kind: 'mixed-or-image-only', path: 'apps/readest-app/src/__tests__/fixtures/data/sample-paper.pdf', nativeFormat: true, expectedDiagnostic: 'mixed-or-image-only', license: 'repository-owned test fixture; verify upstream redistribution terms before release' },
    { id: 'mobi.valid', format: 'MOBI', kind: 'valid', path: 'apps/readest-app/src/__tests__/fixtures/data/sample-war-peace.mobi', nativeFormat: true, expectedDiagnostic: 'supported', license: 'repository-owned test fixture; verify upstream redistribution terms before release' },
    { id: 'fb2.valid', format: 'FB2', kind: 'valid', path: 'apps/readest-app/src/__tests__/fixtures/data/sample-metadata.fb2', nativeFormat: true, expectedDiagnostic: 'supported', license: 'repository-owned test fixture; verify upstream redistribution terms before release' },
    { id: 'cbz.valid', format: 'CBZ', kind: 'image-only', path: 'apps/readest-app/src/__tests__/fixtures/data/sample-metadata.cbz', nativeFormat: true, expectedDiagnostic: 'image-only', license: 'repository-owned test fixture; verify upstream redistribution terms before release' },
    { id: 'txt.valid', format: 'TXT', kind: 'valid', path: 'apps/readest-app/src/__tests__/fixtures/data/sample-alice.txt', nativeFormat: true, expectedDiagnostic: 'supported', license: 'repository-owned test fixture; verify upstream redistribution terms before release' },
    { id: 'md.valid', format: 'MD', kind: 'valid', path: 'apps/readest-app/src/__tests__/fixtures/data/sample-fixture.md', nativeFormat: true, expectedDiagnostic: 'supported', license: 'repository-owned test fixture; verify upstream redistribution terms before release' },
    { id: 'azw3.valid', format: 'AZW3', kind: 'valid', path: 'apps/readest-app/src/__tests__/fixtures/data/sample-babelleaf.azw3', nativeFormat: true, expectedDiagnostic: 'supported', license: 'repository-authored DRM-free KF8 test fixture generated with pinned MIT-licensed Kindling v0.31.0; see adjacent provenance JSON' },
  ].map((entry) => ({
    ...entry,
    exists: entry.path ? (() => {
      try {
        statSync(join(REPO_ROOT, entry.path));
        return true;
      } catch {
        return false;
      }
    })() : false,
  }));
};

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

const buildManifest = (output, generated) => {
  const generatedEntries = generated.map((entry) => {
    const absolute = join(output, entry.path);
    const data = readFileSync(absolute);
    return {
      id: entry.id,
      format: entry.format,
      kind: entry.kind,
      path: entry.path.replaceAll('\\', '/'),
      bytes: data.length,
      sha256: sha256(data),
      expectedDiagnostic: entry.expectedDiagnostic,
      nativeFormat: entry.nativeFormat,
      source: 'generated-local',
      license: entry.license ?? 'test-only synthetic fixture; never included in release packages',
      generator: `${GENERATOR_ID}@${GENERATOR_VERSION}`,
      maxProcessingMs: entry.format === 'PDF' ? 30_000 : 10_000,
      maxMemoryMb: entry.kind === 'compression-bomb' || entry.kind === 'resource-limit' ? 256 : 512,
      cleanup: 'remove generated output after verification',
      notes: entry.notes ?? '',
    };
  });

  const repoEntries = repositoryCases().map((entry) => {
    const absolute = entry.path ? join(REPO_ROOT, entry.path) : null;
    const data = absolute && entry.exists ? readFileSync(absolute) : null;
    return {
      id: entry.id,
      format: entry.format,
      kind: entry.kind,
      path: entry.path,
      bytes: data?.length ?? null,
      sha256: data ? sha256(data) : null,
      expectedDiagnostic: entry.expectedDiagnostic,
      nativeFormat: entry.nativeFormat,
      source: entry.kind === 'external-required' ? 'external-required' : 'repository-owned',
      license: entry.license,
      generator: null,
      maxProcessingMs: entry.format === 'PDF' ? 60_000 : 30_000,
      maxMemoryMb: 1_024,
      cleanup: 'preserve repository fixture; do not copy to release output',
      notes: entry.sourceExtension ? `Current fixture is ${entry.sourceExtension}; native Markdown sample is required before acceptance.` : '',
    };
  });

  return {
    schemaVersion: 1,
    generatedAt: 'deterministic-at-verification-time',
    generator: { id: GENERATOR_ID, version: GENERATOR_VERSION, entrypoint: 'scripts/fixtures/generate-format-fixtures.mjs', networkPolicy: 'none' },
    limits: LIMITS,
    entries: [...repoEntries, ...generatedEntries],
    acceptanceRules: [
      'Generated cases are hostile test inputs only and are never release content.',
      'Entries with source=external-required keep the corresponding acceptance item open until a legal native sample is supplied.',
      'Every generated file is checked by byte size and SHA-256 before the matrix can pass.',
      'A source file hash is checked before and after parser tests; imported originals are immutable.',
    ],
  };
};

const writeGenerated = (output) => {
  mkdirSync(output, { recursive: true });
  const generated = generatedCases();
  for (const entry of generated) {
    const target = join(output, entry.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, entry.data);
  }
  const manifest = buildManifest(output, generated);
  const manifestPath = join(output, 'FORMAT_FIXTURE_MANIFEST.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { manifest, manifestPath, generated };
};

const checkManifest = (manifestPath, output) => {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (manifest.generator?.networkPolicy !== 'none') throw new Error('Fixture generator network policy must be none.');
  const failures = [];
  for (const entry of manifest.entries ?? []) {
    if (entry.source !== 'generated-local') continue;
    const target = join(output, entry.path);
    try {
      const data = readFileSync(target);
      if (data.length !== entry.bytes) failures.push(`${entry.id}: byte size mismatch`);
      if (sha256(data) !== entry.sha256) failures.push(`${entry.id}: SHA-256 mismatch`);
    } catch (error) {
      failures.push(`${entry.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures.length) throw new Error(`Fixture manifest verification failed:\n${failures.join('\n')}`);
  return manifest;
};

const assertManifestMatches = (expectedPath, actualManifest) => {
  const expected = JSON.parse(readFileSync(expectedPath, 'utf8'));
  const comparable = (entry) => ({
    id: entry.id,
    format: entry.format,
    kind: entry.kind,
    path: entry.path,
    bytes: entry.bytes,
    sha256: entry.sha256,
    expectedDiagnostic: entry.expectedDiagnostic,
    nativeFormat: entry.nativeFormat,
    source: entry.source,
  });
  const expectedEntries = new Map((expected.entries ?? []).map((entry) => [entry.id, comparable(entry)]));
  const actualEntries = new Map((actualManifest.entries ?? []).map((entry) => [entry.id, comparable(entry)]));
  const failures = [];
  if (expected.generator?.id !== actualManifest.generator?.id || expected.generator?.version !== actualManifest.generator?.version) {
    failures.push('generator identity/version mismatch');
  }
  if (expectedEntries.size !== actualEntries.size) failures.push('manifest entry count mismatch');
  for (const [id, expectedEntry] of expectedEntries) {
    const actualEntry = actualEntries.get(id);
    if (!actualEntry) {
      failures.push(`${id}: missing entry`);
      continue;
    }
    if (JSON.stringify(expectedEntry) !== JSON.stringify(actualEntry)) failures.push(`${id}: entry metadata or SHA-256 mismatch`);
  }
  if (failures.length) throw new Error(`Tracked fixture manifest is stale:\n${failures.join('\n')}`);
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  const generated = writeGenerated(args.output);
  if (args.writeManifest && !args.manifest) {
    throw new Error('--write-manifest requires --manifest FILE.');
  }
  if (args.writeManifest && args.manifest) {
    mkdirSync(dirname(args.manifest), { recursive: true });
    writeFileSync(args.manifest, `${JSON.stringify(generated.manifest, null, 2)}\n`, 'utf8');
  }
  const manifest = checkManifest(generated.manifestPath, args.output);
  if (args.manifest) assertManifestMatches(args.manifest, manifest);
  const missingExternal = manifest.entries.filter((entry) => entry.source === 'external-required' && !entry.path).map((entry) => entry.id);
  console.log(`[BabelLeaf] generated ${generated.generated.length} local format fixtures at ${relative(REPO_ROOT, args.output)}`);
  console.log(`[BabelLeaf] checked ${manifest.entries.length} manifest entries; external-required=${missingExternal.length}`);
};

main();
