#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import canvasModule from '../../apps/readest-app/node_modules/@napi-rs/canvas/index.js';
import { supportsFastBuild } from '../../apps/readest-app/node_modules/tesseract-wasm/dist/lib.js';
import { createOCRClient } from '../../apps/readest-app/node_modules/tesseract-wasm/src/node-worker.js';

const { createCanvas, GlobalFonts } = canvasModule;
const OCR_ENGINE_VERSION = '0.11.0';
const MODEL_RELEASE = '4.1.0';
const MODEL_RELEASE_COMMIT = 'a8ba5063ab8013372a20e300da0c97ee46b92b07';
const DEFAULT_MODELS_DIR = resolve('target/ocr-models/tessdata_fast-4.1.0');
const DEFAULT_OUTPUT = resolve('target/ocr-models/tesseract-wasm-verification.json');
const DEFAULT_IMAGES_DIR = resolve('target/ocr-models/verification-images');

const parseArgs = () => {
  const values = { modelsDir: DEFAULT_MODELS_DIR, output: DEFAULT_OUTPUT, imagesDir: DEFAULT_IMAGES_DIR };
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    const value = process.argv[index + 1];
    if (argument === '--models-dir' && value) {
      values.modelsDir = resolve(value);
      index += 1;
    } else if (argument === '--output' && value) {
      values.output = resolve(value);
      index += 1;
    } else if (argument === '--images-dir' && value) {
      values.imagesDir = resolve(value);
      index += 1;
    } else {
      throw new Error(`Unknown or incomplete argument: ${argument}`);
    }
  }
  return values;
};

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const normalizeText = (value) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');

const editDistance = (left, right) => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
};

const characterAccuracy = (expected, actual) => {
  const normalizedExpected = normalizeText(expected);
  const normalizedActual = normalizeText(actual);
  if (!normalizedExpected) return 0;
  return Math.max(
    0,
    1 - editDistance(normalizedExpected, normalizedActual) / Math.max(normalizedExpected.length, normalizedActual.length),
  );
};

const fontCandidates = {
  latin: ['Arial', 'Segoe UI', 'DejaVu Sans'],
  chinese: ['Microsoft YaHei', 'Noto Sans CJK SC', 'SimHei'],
  japanese: ['Meiryo', 'Yu Gothic', 'Noto Sans CJK JP'],
};

const availableFontNames = new Set(
  (GlobalFonts.families ?? []).map((family) => String(family.family ?? family).toLowerCase()),
);

const chooseFont = (category) =>
  fontCandidates[category].find((font) => availableFontNames.has(font.toLowerCase())) ??
  fontCandidates[category][0];

const horizontalImage = (text, font) => {
  const canvas = createCanvas(1800, 420);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#000000';
  context.font = `96px "${font}"`;
  context.textBaseline = 'middle';
  context.fillText(text, 80, canvas.height / 2);
  return canvas;
};

const verticalImage = (text, font) => {
  const source = createCanvas(500, 1700);
  const sourceContext = source.getContext('2d');
  sourceContext.fillStyle = '#ffffff';
  sourceContext.fillRect(0, 0, source.width, source.height);
  sourceContext.fillStyle = '#000000';
  sourceContext.font = `96px "${font}"`;
  sourceContext.textAlign = 'center';
  sourceContext.textBaseline = 'middle';
  [...text].forEach((character, index) =>
    sourceContext.fillText(character, 250, 120 + index * 125),
  );
  const rotated = createCanvas(source.height, source.width);
  const rotatedContext = rotated.getContext('2d');
  rotatedContext.translate(0, rotated.height);
  rotatedContext.rotate(-Math.PI / 2);
  rotatedContext.drawImage(source, 0, 0);
  return rotated;
};

const cases = [
  {
    id: 'english-horizontal',
    model: 'eng.traineddata',
    language: 'en',
    expected: 'BabelLeaf offline reader',
    makeImage: () => horizontalImage('BabelLeaf offline reader', chooseFont('latin')),
  },
  {
    id: 'simplified-chinese-horizontal',
    model: 'chi_sim.traineddata',
    language: 'zh-CN',
    expected: '本地漫画翻译测试',
    makeImage: () => horizontalImage('本地漫画翻译测试', chooseFont('chinese')),
  },
  {
    id: 'japanese-horizontal',
    model: 'jpn.traineddata',
    language: 'ja',
    expected: '日本語の漫画翻訳テスト',
    makeImage: () => horizontalImage('日本語の漫画翻訳テスト', chooseFont('japanese')),
  },
  {
    id: 'japanese-vertical',
    model: 'jpn_vert.traineddata',
    language: 'ja-vertical',
    expected: '日本語漫画',
    makeImage: () => verticalImage('日本語漫画', chooseFont('japanese')),
  },
];

const main = async () => {
  const options = parseArgs();
  await mkdir(resolve(options.output, '..'), { recursive: true });
  await mkdir(options.imagesDir, { recursive: true });
  const wasmName = supportsFastBuild() ? 'tesseract-core.wasm' : 'tesseract-core-fallback.wasm';
  const wasmPath = resolve('apps/readest-app/node_modules/tesseract-wasm/dist', wasmName);
  const wasmBytes = await readFile(wasmPath);
  const results = [];

  for (const testCase of cases) {
    const modelPath = resolve(options.modelsDir, testCase.model);
    const modelBytes = await readFile(modelPath);
    const image = testCase.makeImage();
    const imagePath = resolve(options.imagesDir, `${testCase.id}.png`);
    await writeFile(imagePath, image.toBuffer('image/png'));
    const canvasImageData = image
      .getContext('2d')
      .getImageData(0, 0, image.width, image.height);
    const imageData = {
      width: canvasImageData.width,
      height: canvasImageData.height,
      data: new Uint8ClampedArray(canvasImageData.data),
    };
    const rssBefore = process.memoryUsage().rss;
    const client = createOCRClient({ wasmBinary: wasmBytes });
    const startedAt = performance.now();
    let text = '';
    let boxes = [];
    let peakObservedRss = rssBefore;
    try {
      const modelBuffer = modelBytes.buffer.slice(
        modelBytes.byteOffset,
        modelBytes.byteOffset + modelBytes.byteLength,
      );
      await client.loadModel(modelBuffer);
      await client.loadImage(imageData);
      boxes = await client.getTextBoxes('line');
      text = boxes.map((box) => box.text).join('\n');
      peakObservedRss = Math.max(peakObservedRss, process.memoryUsage().rss);
      await client.clearImage();
    } finally {
      await client.destroy();
    }
    const elapsedMs = performance.now() - startedAt;
    const peakMemoryMb = Math.max(0, process.memoryUsage().rss - rssBefore) / (1024 * 1024);
    const accuracy = characterAccuracy(testCase.expected, text);
    results.push({
      id: testCase.id,
      language: testCase.language,
      modelFile: basename(modelPath),
      modelSizeBytes: modelBytes.byteLength,
      modelSha256: sha256(modelBytes),
      imageFile: imagePath,
      imageWidth: image.width,
      imageHeight: image.height,
      expected: testCase.expected,
      actual: text,
      lineCount: boxes.length,
      characterAccuracy: Number(accuracy.toFixed(4)),
      elapsedMs: Number(elapsedMs.toFixed(2)),
      peakMemoryMb: Number((peakObservedRss / (1024 * 1024)).toFixed(2)),
      peakMemoryDeltaMb: Number(peakMemoryMb.toFixed(2)),
      passed: accuracy >= 0.7,
    });
  }

  const report = {
    format: 'babelleaf.tesseract-verification',
    schemaVersion: 1,
    measuredAt: new Date().toISOString(),
    platform: `${process.platform}-${process.arch}`,
    nodeVersion: process.version,
    engine: 'tesseract-wasm',
    engineVersion: OCR_ENGINE_VERSION,
    wasmFile: wasmName,
    wasmSha256: sha256(wasmBytes),
    modelSource: 'https://github.com/tesseract-ocr/tessdata_fast',
    modelRelease: MODEL_RELEASE,
    modelReleaseCommit: MODEL_RELEASE_COMMIT,
    modelLicense: 'Apache-2.0',
    fonts: {
      latin: chooseFont('latin'),
      chinese: chooseFont('chinese'),
      japanese: chooseFont('japanese'),
    },
    results,
    passed: results.every((result) => result.passed),
  };
  await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
};

await main();
