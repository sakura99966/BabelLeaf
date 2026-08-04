import type { BookFormat } from '@/types/book';

export type TranslationFormatDiagnosticCode =
  | 'supported'
  | 'empty-text'
  | 'image-only'
  | 'drm'
  | 'unsupported';

export interface TranslationFormatDiagnostic {
  format: BookFormat | string;
  code: TranslationFormatDiagnosticCode;
  supported: boolean;
  message: string;
}

const DRM_MARKERS = [
  'drm',
  'encrypted',
  'encryption',
  'password',
  'license',
  'rights management',
  'protected',
];

export const isTranslationDRMError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();
  return DRM_MARKERS.some((marker) => normalized.includes(marker));
};

/**
 * Provides a stable, user-facing explanation for the format matrix. This is
 * deliberately separate from DocumentLoader so the reader can keep its
 * existing error behavior while translation can distinguish OCR and DRM.
 */
export const diagnoseTranslationFormat = (
  format: BookFormat | string,
  options: { segmentCount?: number; error?: unknown } = {},
): TranslationFormatDiagnostic => {
  if (options.error && isTranslationDRMError(options.error)) {
    return {
      format,
      code: 'drm',
      supported: false,
      message: 'This book is encrypted or DRM-protected and cannot be translated locally.',
    };
  }

  if (!['EPUB', 'PDF', 'MOBI', 'AZW', 'AZW3', 'FB2', 'FBZ', 'CBZ', 'TXT', 'MD'].includes(format)) {
    return {
      format,
      code: 'unsupported',
      supported: false,
      message: 'This file format is not supported for batch translation.',
    };
  }

  if (format === 'CBZ' || format === 'FBZ') {
    return {
      format,
      code: 'image-only',
      supported: false,
      message:
        'Comic archives are image-only in 0.3. OCR and text replacement are planned for 0.4.',
    };
  }

  if (options.segmentCount === 0) {
    return {
      format,
      code: 'empty-text',
      supported: false,
      message: 'No selectable text was found. Scanned or image-only documents require OCR.',
    };
  }

  return {
    format,
    code: 'supported',
    supported: true,
    message: 'The format is supported for local text extraction and batch translation.',
  };
};
