import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const requireFromApp = createRequire(path.join(root, 'apps/readest-app/package.json'));
const { createCanvas } = requireFromApp('@napi-rs/canvas');
const ort = requireFromApp('onnxruntime-web/wasm');
const modelPath = path.resolve(
  root,
  'target/inpaint-models/opencv-inpainting-lama/inpainting_lama_2025jan.onnx',
);
const evidenceDir = path.resolve(root, 'target/inpaint-models/lama-verification');
const evidencePath = path.resolve(root, 'target/inpaint-models/lama-verification.json');
const expectedSha256 = '7df918ac3921d3daf0aae1d219776cf0dc4e4935f035af81841b40adcf74fdf2';
const size = 512;
const area = size * size;

const model = await readFile(modelPath);
const modelSha256 = createHash('sha256').update(model).digest('hex');
if (modelSha256 !== expectedSha256) throw new Error(`Unexpected model checksum: ${modelSha256}`);

const image = new Float32Array(area * 3);
const mask = new Float32Array(area);
const sourceRgba = new Uint8ClampedArray(area * 4);
for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) {
    const index = y * size + x;
    const paper = 225 + Math.round(18 * Math.sin(x / 24) * Math.cos(y / 31));
    const line = x > 178 && x < 334 && y > 218 && y < 294 && (x + y) % 17 < 7 ? 20 : paper;
    const r = line;
    const g = line === 20 ? 28 : Math.max(0, paper - 4);
    const b = line === 20 ? 36 : Math.max(0, paper - 10);
    image[index] = b / 255;
    image[area + index] = g / 255;
    image[area * 2 + index] = r / 255;
    sourceRgba[index * 4] = r;
    sourceRgba[index * 4 + 1] = g;
    sourceRgba[index * 4 + 2] = b;
    sourceRgba[index * 4 + 3] = 255;
    if (x >= 172 && x <= 340 && y >= 210 && y <= 302) mask[index] = 1;
  }
}

ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;
ort.env.logLevel = 'error';
const startedAt = performance.now();
const session = await ort.InferenceSession.create(model, {
  executionProviders: ['wasm'],
  executionMode: 'sequential',
  graphOptimizationLevel: 'all',
});
const loadedAt = performance.now();
const result = await session.run({
  image: new ort.Tensor('float32', image, [1, 3, size, size]),
  mask: new ort.Tensor('float32', mask, [1, 1, size, size]),
});
const completedAt = performance.now();
await session.release();
const output = result.output?.data;
if (!(output instanceof Float32Array) || output.length !== area * 3) {
  throw new Error('LaMa output tensor is invalid');
}

let finiteValues = 0;
let changedMaskedPixels = 0;
let maskedPixels = 0;
const outputRgba = sourceRgba.slice();
for (let index = 0; index < area; index += 1) {
  const values = [output[area * 2 + index], output[area + index], output[index]];
  for (const value of values) if (Number.isFinite(value)) finiteValues += 1;
  if (mask[index] === 0) continue;
  maskedPixels += 1;
  for (let channel = 0; channel < 3; channel += 1) {
    const value = Math.max(0, Math.min(255, Math.round(values[channel])));
    if (Math.abs(value - sourceRgba[index * 4 + channel]) >= 4) changedMaskedPixels += 1;
    outputRgba[index * 4 + channel] = value;
  }
}
if (finiteValues !== output.length) throw new Error('LaMa output contains non-finite values');
const changedChannelRatio = changedMaskedPixels / (maskedPixels * 3);
if (changedChannelRatio < 0.25) {
  throw new Error(`LaMa did not materially alter the masked sample: ${changedChannelRatio}`);
}

await mkdir(evidenceDir, { recursive: true });
for (const [name, rgba] of [
  ['input.png', sourceRgba],
  ['output.png', outputRgba],
]) {
  const canvas = createCanvas(size, size);
  const context = canvas.getContext('2d');
  const imageData = context.createImageData(size, size);
  imageData.data.set(rgba);
  context.putImageData(imageData, 0, 0);
  await writeFile(path.join(evidenceDir, name), canvas.toBuffer('image/png'));
}

const evidence = {
  format: 'babelleaf.lama-verification',
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  platform: `${process.platform}-${process.arch}`,
  runtime: { id: 'onnxruntime-web', version: '1.27.0', executionProvider: 'wasm', threads: 1 },
  model: {
    id: 'opencv-inpainting-lama',
    version: '2025jan',
    sourceRevision: 'aee6d22f0a13e5e35af1c9a1c3afd62841fc6f3f',
    license: 'Apache-2.0',
    sizeBytes: model.byteLength,
    sha256: modelSha256,
  },
  test: {
    dimensions: [size, size],
    maskedPixels,
    finiteValues,
    outputValues: output.length,
    changedChannelRatio,
    modelLoadMs: loadedAt - startedAt,
    inferenceMs: completedAt - loadedAt,
    processRssMiB: process.memoryUsage().rss / (1024 * 1024),
    inputImage: 'lama-verification/input.png',
    outputImage: 'lama-verification/output.png',
  },
};
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(evidence));
