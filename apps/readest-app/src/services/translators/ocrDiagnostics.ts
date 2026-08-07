import type { BookFormat } from '@/types/book';
import type { OcrSourceFormat } from './ocrSidecar';

export type OcrDiagnosticCode =
  | 'ready'
  | 'text-layer'
  | 'mixed'
  | 'image-only'
  | 'model-missing'
  | 'model-incompatible'
  | 'device-unsupported'
  | 'malformed'
  | 'oversized'
  | 'cancelled'
  | 'failed'
  | 'unsupported';

export interface OcrDiagnostic {
  format: BookFormat | OcrSourceFormat | string;
  code: OcrDiagnosticCode;
  supported: boolean;
  message: string;
  requiresLocalModel?: boolean;
}

export const diagnoseOcrSource = (
  format: BookFormat | OcrSourceFormat | string,
  options: {
    pdfContent?: 'text-layer' | 'mixed' | 'image-only';
    malformed?: boolean;
    oversized?: boolean;
    modelAvailable?: boolean;
    modelCompatible?: boolean;
    deviceSupported?: boolean;
  } = {},
): OcrDiagnostic => {
  if (options.malformed) {
    return {
      format,
      code: 'malformed',
      supported: false,
      message: 'The page source is malformed or failed validation; no source data was modified.',
    };
  }
  if (options.oversized) {
    return {
      format,
      code: 'oversized',
      supported: false,
      message: 'The page source exceeds OCR resource limits and was not processed.',
    };
  }
  if (!['PDF', 'CBZ', 'FBZ', 'IMAGE_FOLDER'].includes(format)) {
    return {
      format,
      code: 'unsupported',
      supported: false,
      message: 'This source is not supported by the local OCR workflow.',
    };
  }
  if (format === 'PDF' && options.pdfContent === 'text-layer') {
    return {
      format,
      code: 'text-layer',
      supported: true,
      message: 'This PDF already has a selectable text layer; OCR is not required for those pages.',
    };
  }
  if (format === 'PDF' && options.pdfContent === 'mixed') {
    return {
      format,
      code: 'mixed',
      supported: true,
      message:
        'This PDF combines selectable and image-only pages; OCR can process image-only pages.',
    };
  }
  if (options.deviceSupported === false) {
    return {
      format,
      code: 'device-unsupported',
      supported: false,
      message: 'This device cannot run the selected local OCR runtime.',
      requiresLocalModel: true,
    };
  }
  if (options.modelCompatible === false) {
    return {
      format,
      code: 'model-incompatible',
      supported: false,
      message: 'The installed OCR model does not support the requested language or runtime.',
      requiresLocalModel: true,
    };
  }
  if (options.modelAvailable === false) {
    return {
      format,
      code: 'model-missing',
      supported: false,
      message: 'Install a compatible OCR model pack locally before starting OCR.',
      requiresLocalModel: true,
    };
  }
  return {
    format,
    code: 'ready',
    supported: true,
    message: 'The source is ready for local OCR processing.',
  };
};

export const ocrSourceFormatForBook = (format: BookFormat | string): OcrSourceFormat | null => {
  if (format === 'PDF' || format === 'CBZ' || format === 'FBZ') return format;
  return null;
};
