/**
 * tesseract-wasm 0.11.0 publishes dist/index.d.ts but omits a `types` export
 * condition. Keep this narrow declaration aligned with the API used by the
 * lazy OCR adapter until the upstream package exposes its declarations under
 * moduleResolution=bundler.
 */
declare module 'tesseract-wasm' {
  export type TextUnit = 'line' | 'word';

  export interface TextItem {
    rect: { left: number; top: number; right: number; bottom: number };
    flags: number;
    confidence: number;
    text: string;
  }

  export interface OCRClientInit {
    createWorker?: (url: string) => Worker;
    wasmBinary?: Uint8Array | ArrayBuffer;
    workerURL?: string;
  }

  export class OCRClient {
    constructor(options?: OCRClientInit);
    destroy(): Promise<void>;
    loadModel(model: string | ArrayBuffer): Promise<void>;
    loadImage(image: ImageBitmap | ImageData): Promise<void>;
    clearImage(): Promise<void>;
    getTextBoxes(unit: TextUnit, onProgress?: (progress: number) => void): Promise<TextItem[]>;
  }
}
