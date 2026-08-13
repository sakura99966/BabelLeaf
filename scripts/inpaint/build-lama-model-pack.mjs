import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceDir = path.resolve(root, 'target/inpaint-models/opencv-inpainting-lama');
const outputDir = path.resolve(root, 'target/inpaint-models/import-packs/opencv-inpainting-lama-2025jan');
const modelSource = path.join(sourceDir, 'inpainting_lama_2025jan.onnx');
const licenseSource = path.join(sourceDir, 'LICENSE');

const catalog = {
  format: 'babelleaf.inpaint-model',
  schemaVersion: 1,
  id: 'opencv-inpainting-lama',
  version: '2025jan',
  runtime: 'onnxruntime-web',
  engine: 'lama-opencv-512',
  license: 'Apache-2.0',
  source: 'local-import',
  sourceUrl: 'https://huggingface.co/opencv/inpainting_lama',
  sourceRevision: 'aee6d22f0a13e5e35af1c9a1c3afd62841fc6f3f',
  inputSize: 512,
  artifacts: [
    {
      id: 'model',
      fileName: 'inpainting_lama_2025jan.onnx',
      sizeBytes: 92_591_623,
      checksumSha256: '7df918ac3921d3daf0aae1d219776cf0dc4e4935f035af81841b40adcf74fdf2',
    },
    {
      id: 'license',
      fileName: 'LICENSE.txt',
      sizeBytes: 11_347,
      checksumSha256: '0d02d0f518d1b068f383b33e5ee100b7e3609e5022b666f827a64135e9ad7a89',
    },
  ],
};

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const verifySource = async (file, artifact) => {
  const bytes = await readFile(file);
  if (bytes.byteLength !== artifact.sizeBytes) {
    throw new Error(`${artifact.id} size mismatch: ${bytes.byteLength}`);
  }
  const checksum = sha256(bytes);
  if (checksum !== artifact.checksumSha256) {
    throw new Error(`${artifact.id} checksum mismatch: ${checksum}`);
  }
  return bytes;
};

const modelBytes = await verifySource(modelSource, catalog.artifacts[0]);
const licenseBytes = await verifySource(licenseSource, catalog.artifacts[1]);
if (!licenseBytes.toString('utf8').includes('Apache License')) {
  throw new Error('The OpenCV model license text is not Apache License');
}

await mkdir(outputDir, { recursive: true });
await copyFile(modelSource, path.join(outputDir, catalog.artifacts[0].fileName));
await copyFile(licenseSource, path.join(outputDir, catalog.artifacts[1].fileName));
await writeFile(path.join(outputDir, 'manifest.json'), `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
await writeFile(
  path.join(outputDir, 'provenance.json'),
  `${JSON.stringify(
    {
      format: 'babelleaf.model-provenance',
      schemaVersion: 1,
      generatedAt: '2026-08-13',
      source: catalog.sourceUrl,
      sourceRevision: catalog.sourceRevision,
      upstreamLicense: catalog.license,
      redistribution: 'local-import-pack-only',
      bundledWithApplication: false,
      downloadedByApplication: false,
      modelSha256: sha256(modelBytes),
    },
    null,
    2,
  )}\n`,
  'utf8',
);

console.log(
  JSON.stringify({ outputDir, modelBytes: modelBytes.byteLength, modelSha256: sha256(modelBytes) }),
);
