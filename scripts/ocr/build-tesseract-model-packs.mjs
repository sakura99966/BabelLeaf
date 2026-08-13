#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const catalogPath = resolve(scriptDir, 'tessdata-fast-4.1.0.catalog.json');
const DEFAULT_MODELS_DIR = resolve('target/ocr-models/tessdata_fast-4.1.0');
const DEFAULT_OUTPUT_DIR = resolve('target/ocr-models/import-packs');

const parseArgs = () => {
  const values = { modelsDir: DEFAULT_MODELS_DIR, outputDir: DEFAULT_OUTPUT_DIR };
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    const value = process.argv[index + 1];
    if (argument === '--models-dir' && value) {
      values.modelsDir = resolve(value);
      index += 1;
    } else if (argument === '--output' && value) {
      values.outputDir = resolve(value);
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
  }
  return values;
};

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const verifyFile = async (path, expectedSize, expectedHash, label) => {
  const bytes = await readFile(path);
  const actualHash = sha256(bytes);
  if (bytes.byteLength !== expectedSize || actualHash !== expectedHash) {
    throw new Error(
      `${label} does not match the pinned catalog: expected ${expectedSize}/${expectedHash}, got ${bytes.byteLength}/${actualHash}`,
    );
  }
  return bytes;
};

const packChecksum = (artifacts) => {
  const canonical = [...artifacts]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(
      (artifact) =>
        `${artifact.id}\u0000${artifact.fileName}\u0000${artifact.sizeBytes}\u0000${artifact.checksumSha256}`,
    )
    .join('\u0001');
  return sha256(Buffer.from(canonical, 'utf8'));
};

const main = async () => {
  const options = parseArgs();
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  if (catalog.format !== 'babelleaf.ocr-model-catalog' || catalog.schemaVersion !== 1) {
    throw new Error('Unsupported OCR model catalog');
  }
  const licensePath = resolve(options.modelsDir, catalog.license.fileName);
  await verifyFile(
    licensePath,
    catalog.license.sizeBytes,
    catalog.license.sha256,
    'tessdata_fast license',
  );
  const outputs = [];
  for (const model of catalog.models) {
    const sourceModelPath = resolve(options.modelsDir, `${model.name}.traineddata`);
    await verifyFile(sourceModelPath, model.sizeBytes, model.sha256, model.name);
    const outputDir = resolve(options.outputDir, model.id);
    await mkdir(outputDir, { recursive: true });
    const modelFileName = `${model.name}.traineddata`;
    const licenseFileName = 'LICENSE.txt';
    await copyFile(sourceModelPath, resolve(outputDir, modelFileName));
    await copyFile(licensePath, resolve(outputDir, licenseFileName));
    const artifacts = [
      {
        id: 'traineddata',
        fileName: modelFileName,
        sizeBytes: model.sizeBytes,
        checksumSha256: model.sha256,
      },
      {
        id: 'license',
        fileName: licenseFileName,
        sizeBytes: catalog.license.sizeBytes,
        checksumSha256: catalog.license.sha256,
      },
    ];
    const manifest = {
      format: 'babelleaf.ocr-model',
      schemaVersion: 2,
      id: model.id,
      version: catalog.release,
      runtime: 'wasm',
      languages: model.languages,
      license: catalog.license.spdx,
      checksumSha256: packChecksum(artifacts),
      sizeBytes: artifacts.reduce((total, artifact) => total + artifact.sizeBytes, 0),
      source: 'local-import',
      engineCompatibility: ['tesseract-wasm'],
      cpuFallback: true,
      artifacts,
      primaryArtifactId: 'traineddata',
    };
    const provenance = {
      format: 'babelleaf.ocr-model-provenance',
      schemaVersion: 1,
      catalog: 'tessdata-fast-4.1.0.catalog.json',
      source: catalog.source,
      release: catalog.release,
      releaseCommit: catalog.releaseCommit,
      modelFile: modelFileName,
      modelSha256: model.sha256,
      license: catalog.license.spdx,
      manifestSha256: sha256(Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8')),
    };
    await writeFile(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(
      resolve(outputDir, 'provenance.json'),
      `${JSON.stringify(provenance, null, 2)}\n`,
    );
    outputs.push({ id: model.id, outputDir, manifestChecksum: manifest.checksumSha256 });
  }
  process.stdout.write(`${JSON.stringify({ outputs }, null, 2)}\n`);
};

await main();
