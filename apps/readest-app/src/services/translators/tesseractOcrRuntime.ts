import type { TextItem, TextUnit } from 'tesseract-wasm';
import {
  COMIC_WORKER_PROTOCOL,
  COMIC_WORKER_PROTOCOL_VERSION,
  type ComicTextRegion,
  type ComicWorkerEngineContext,
  type ComicWorkerJobRequest,
  type ComicWorkerPageInput,
} from './comicWorkerProtocol';
import {
  getOcrModelArtifactManifests,
  getOcrModelPrimaryArtifactId,
  parseOcrModelManifest,
  type OcrModelManifest,
} from './ocrModels';
import type { LocalOcrRuntimeFactory } from './ocrRuntime';
import type { OcrPageBytesSource } from './onnxOcrRuntime';

export const TESSERACT_WASM_ENGINE = 'tesseract-wasm' as const;
export const TESSERACT_WASM_ENGINE_VERSION = '0.11.0' as const;
export const TESSERACT_WASM_WORKER_URL = '/vendor/tesseract/tesseract-worker.js' as const;

export interface TesseractOcrClient {
  loadModel(model: ArrayBuffer): Promise<void>;
  loadImage(image: ImageBitmap | ImageData): Promise<void>;
  getTextBoxes(unit: TextUnit, onProgress?: (progress: number) => void): Promise<TextItem[]>;
  clearImage(): Promise<void>;
  destroy(): Promise<void>;
}

export interface TesseractImageDecodeOptions {
  rotateCounterClockwise: boolean;
}

export type TesseractImageDecoder = (
  bytes: ArrayBuffer,
  page: ComicWorkerPageInput,
  options: TesseractImageDecodeOptions,
) => Promise<ImageBitmap | ImageData>;

export interface CreateTesseractOcrRuntimeFactoryInput {
  pageSource: OcrPageBytesSource;
  createClient?: () => Promise<TesseractOcrClient>;
  decodeImage?: TesseractImageDecoder;
}

export class TesseractOcrRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TesseractOcrRuntimeError';
  }
}

const copyArrayBuffer = (value: ArrayBuffer | Uint8Array): ArrayBuffer => {
  if (value instanceof ArrayBuffer) return value.slice(0);
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
};

const assertLocalPageReference = (localRef: string): void => {
  const windowsDrivePath = /^[a-zA-Z]:[\\/]/.test(localRef);
  const sessionReference = /^session:\/\/[a-zA-Z0-9._~/%-]+$/.test(localRef);
  if (
    !localRef.trim() ||
    localRef.startsWith('//') ||
    (!windowsDrivePath && !sessionReference && /^[a-zA-Z][a-zA-Z\d+.-]*:/i.test(localRef))
  ) {
    throw new TesseractOcrRuntimeError('OCR page references must be local application resources');
  }
};

const mimeTypeForPage = (page: ComicWorkerPageInput): string => {
  if (page.format === 'png') return 'image/png';
  if (page.format === 'jpeg') return 'image/jpeg';
  if (page.format === 'webp') return 'image/webp';
  if (page.format === 'avif') return 'image/avif';
  throw new TesseractOcrRuntimeError('PDF pages must be rasterized locally before OCR');
};

const rotateCounterClockwise = (bitmap: ImageBitmap): ImageData => {
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(bitmap.height, bitmap.width)
      : typeof document !== 'undefined'
        ? Object.assign(document.createElement('canvas'), {
            width: bitmap.height,
            height: bitmap.width,
          })
        : null;
  // `canvas` is a union of HTMLCanvasElement and OffscreenCanvas. TypeScript
  // otherwise combines every getContext overload and retains
  // ImageBitmapRenderingContext even though the literal request is `2d`.
  const context = canvas?.getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null
    | undefined;
  if (!canvas || !context) {
    throw new TesseractOcrRuntimeError('This platform cannot rotate vertical OCR pages');
  }
  context.translate(0, canvas.height);
  context.rotate(-Math.PI / 2);
  context.drawImage(bitmap, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
};

const decodeImage: TesseractImageDecoder = async (bytes, page, options) => {
  if (!('createImageBitmap' in globalThis)) {
    throw new TesseractOcrRuntimeError('This platform cannot decode local OCR page images');
  }
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mimeTypeForPage(page) }));
  if (bitmap.width !== page.width || bitmap.height !== page.height) {
    bitmap.close();
    throw new TesseractOcrRuntimeError('Decoded OCR page dimensions do not match the sidecar');
  }
  if (options.rotateCounterClockwise) {
    try {
      return rotateCounterClockwise(bitmap);
    } finally {
      bitmap.close();
    }
  }
  return bitmap;
};

const createBrowserClient = async (): Promise<TesseractOcrClient> => {
  const { OCRClient } = await import('tesseract-wasm');
  const workerURL = new URL(TESSERACT_WASM_WORKER_URL, globalThis.location.href).href;
  return new OCRClient({ workerURL });
};

const assertCompatibleModel = (model: OcrModelManifest): void => {
  if (model.runtime !== 'wasm') {
    throw new TesseractOcrRuntimeError('The selected OCR model does not use the WASM runtime');
  }
  if (!model.engineCompatibility.includes(TESSERACT_WASM_ENGINE)) {
    throw new TesseractOcrRuntimeError(
      'The selected OCR model is incompatible with Tesseract WASM',
    );
  }
  const primaryArtifactId = getOcrModelPrimaryArtifactId(model);
  const primary = getOcrModelArtifactManifests(model).find(
    (artifact) => artifact.id === primaryArtifactId,
  );
  if (!primary?.fileName.toLowerCase().endsWith('.traineddata')) {
    throw new TesseractOcrRuntimeError(
      'The Tesseract WASM primary model artifact must be a traineddata file',
    );
  }
};

const normalizedLanguage = (language: string): string => language.trim().toLowerCase();

const usesVerticalModel = (model: OcrModelManifest): boolean =>
  model.languages.some((language) =>
    /(?:^|[-_])vert(?:ical)?(?:$|[-_])/.test(normalizedLanguage(language)),
  );

const regionLanguage = (request: ComicWorkerJobRequest, model: OcrModelManifest): string => {
  const supported = new Set(model.languages.map(normalizedLanguage));
  return (
    request.sourceLangs.find((language) => {
      const normalized = normalizedLanguage(language);
      return normalized !== 'auto' && supported.has(normalized);
    }) ?? model.languages[0]!
  );
};

const closeBitmap = (image: ImageBitmap | ImageData): void => {
  if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) image.close();
};

const cjkCharacter = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

const normalizeRecognizedText = (value: string, vertical: boolean): string => {
  const trimmed = value.trim();
  if (!vertical) return trimmed;
  return trimmed
    .split(/\s+/)
    .filter(Boolean)
    .reduce((output, token) => {
      if (!output) return token;
      const previous = output.match(/.$/u)?.[0] ?? '';
      const first = token.match(/^./u)?.[0] ?? '';
      return cjkCharacter.test(previous) && cjkCharacter.test(first)
        ? `${output}${token}`
        : `${output} ${token}`;
    }, '');
};

const sourceRectangle = (
  item: TextItem,
  page: ComicWorkerPageInput,
  rotatedCounterClockwise: boolean,
): { left: number; top: number; right: number; bottom: number } => {
  if (!rotatedCounterClockwise) return item.rect;
  return {
    left: page.width - item.rect.bottom,
    top: item.rect.left,
    right: page.width - item.rect.top,
    bottom: item.rect.right,
  };
};

const mapTextItems = (
  items: TextItem[],
  page: ComicWorkerPageInput,
  request: ComicWorkerJobRequest,
  model: OcrModelManifest,
  rotatedCounterClockwise: boolean,
): ComicTextRegion[] => {
  const limit = Math.max(1, Math.min(2_000, request.options?.maxRegionsPerPage ?? 2_000));
  const language = regionLanguage(request, model);
  const regions: ComicTextRegion[] = [];
  for (const item of items) {
    if (regions.length >= limit) break;
    const text = normalizeRecognizedText(item.text, rotatedCounterClockwise);
    const rect = sourceRectangle(item, page, rotatedCounterClockwise);
    const left = Math.max(0, Math.min(page.width, rect.left));
    const top = Math.max(0, Math.min(page.height, rect.top));
    const right = Math.max(left, Math.min(page.width, rect.right));
    const bottom = Math.max(top, Math.min(page.height, rect.bottom));
    if (!text || right <= left || bottom <= top) continue;
    const width = right - left;
    const height = bottom - top;
    const vertical =
      rotatedCounterClockwise || (request.options?.verticalText === true && height > width * 1.2);
    const ordinal = regions.length + 1;
    regions.push({
      id: `${page.pageId}:tesseract:${String(ordinal).padStart(4, '0')}`,
      pageId: page.pageId,
      polygon: [
        { x: left, y: top },
        { x: right, y: top },
        { x: right, y: bottom },
        { x: left, y: bottom },
      ],
      orientation: vertical ? 'vertical' : 'horizontal',
      language,
      text,
      confidence: Math.max(0, Math.min(1, item.confidence)),
      readingOrder: ordinal - 1,
      engine: TESSERACT_WASM_ENGINE,
      model: model.id,
    });
  }
  return regions;
};

/**
 * Create a lazy local Tesseract worker. Neither the model nor page bytes are
 * resolved through a URL: the verified traineddata and local page source are
 * passed as buffers only after the user starts OCR.
 */
export const createTesseractOcrRuntimeFactory = (
  input: CreateTesseractOcrRuntimeFactoryInput,
): LocalOcrRuntimeFactory => ({
  create: async (modelValue, modelBytes) => {
    const model = parseOcrModelManifest(modelValue);
    assertCompatibleModel(model);
    if (modelBytes.byteLength === 0) {
      throw new TesseractOcrRuntimeError('The selected Tesseract traineddata is empty');
    }
    const client = await (input.createClient ?? createBrowserClient)();
    try {
      await client.loadModel(modelBytes.slice(0));
    } catch (error) {
      await client.destroy().catch(() => undefined);
      throw error;
    }
    let closed = false;
    let processing = false;
    const rotateVerticalPages = usesVerticalModel(model);
    return {
      descriptor: {
        protocol: COMIC_WORKER_PROTOCOL,
        protocolVersion: COMIC_WORKER_PROTOCOL_VERSION,
        engine: TESSERACT_WASM_ENGINE,
        engineVersion: TESSERACT_WASM_ENGINE_VERSION,
        capabilities: ['detect', 'ocr', 'text-layer', 'vertical-text', 'cpu-fallback'],
        languages: [...model.languages],
        maxWorkers: 1,
        modelId: model.id,
      },
      model,
      processPage: async (
        page: ComicWorkerPageInput,
        request: ComicWorkerJobRequest,
        context: ComicWorkerEngineContext,
      ) => {
        if (closed) throw new TesseractOcrRuntimeError('The Tesseract OCR runtime is closed');
        if (processing) {
          throw new TesseractOcrRuntimeError('The Tesseract OCR runtime only processes one page');
        }
        if (context.signal.aborted) throw new TesseractOcrRuntimeError('OCR runtime cancelled');
        assertLocalPageReference(page.localRef);
        processing = true;
        let image: ImageBitmap | ImageData | undefined;
        try {
          const pageBytes = copyArrayBuffer(await input.pageSource.read(page, context.signal));
          if (context.signal.aborted) throw new TesseractOcrRuntimeError('OCR runtime cancelled');
          if (pageBytes.byteLength === 0) {
            throw new TesseractOcrRuntimeError('The local OCR page is empty');
          }
          image = await (input.decodeImage ?? decodeImage)(pageBytes, page, {
            rotateCounterClockwise: rotateVerticalPages,
          });
          if (context.signal.aborted) throw new TesseractOcrRuntimeError('OCR runtime cancelled');
          await client.loadImage(image);
          closeBitmap(image);
          image = undefined;
          const items = await client.getTextBoxes('line', (progress) => {
            context.reportProgress(
              Math.round(Math.max(0, Math.min(1, progress)) * 100),
              100,
              page.pageId,
            );
          });
          if (context.signal.aborted) throw new TesseractOcrRuntimeError('OCR runtime cancelled');
          context.reportProgress(100, 100, page.pageId);
          return mapTextItems(items, page, request, model, rotateVerticalPages);
        } finally {
          if (image) closeBitmap(image);
          await client.clearImage().catch(() => undefined);
          processing = false;
        }
      },
      close: async () => {
        if (closed) return;
        closed = true;
        await client.destroy();
      },
    };
  },
});
