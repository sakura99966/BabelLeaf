import type { BookFormat } from '@/types/book';

export type TranslationFormatDiagnosticCode =
  | 'supported'
  | 'text-layer'
  | 'mixed'
  | 'empty-text'
  | 'image-only'
  | 'drm'
  | 'unsupported'
  | 'malformed'
  | 'oversized';

export interface TranslationFormatDiagnostic {
  format: BookFormat | string;
  code: TranslationFormatDiagnosticCode;
  supported: boolean;
  message: string;
}

export const TRANSLATION_FORMAT_LIMITS = {
  maxFileBytes: 512 * 1024 * 1024,
  maxArchiveEntries: 20_000,
  maxUncompressedBytes: 2 * 1024 * 1024 * 1024,
} as const;

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
  options: {
    segmentCount?: number;
    error?: unknown;
    malformed?: boolean;
    fileSizeBytes?: number;
    archiveEntryCount?: number;
    uncompressedBytes?: number;
    pdfContent?: 'text-layer' | 'mixed' | 'image-only';
  } = {},
): TranslationFormatDiagnostic => {
  if (options.malformed) {
    return {
      format,
      code: 'malformed',
      supported: false,
      message: 'The document is malformed or failed validation and was not modified.',
    };
  }
  if (
    (options.fileSizeBytes !== undefined &&
      options.fileSizeBytes > TRANSLATION_FORMAT_LIMITS.maxFileBytes) ||
    (options.archiveEntryCount !== undefined &&
      options.archiveEntryCount > TRANSLATION_FORMAT_LIMITS.maxArchiveEntries) ||
    (options.uncompressedBytes !== undefined &&
      options.uncompressedBytes > TRANSLATION_FORMAT_LIMITS.maxUncompressedBytes)
  ) {
    return {
      format,
      code: 'oversized',
      supported: false,
      message: 'The document exceeds BabelLeaf resource limits and was not opened for translation.',
    };
  }
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
        'Comic archives are image-only in 0.3.2. OCR and text replacement are planned for 0.4.',
    };
  }

  if (format === 'PDF' && options.pdfContent === 'image-only') {
    return {
      format,
      code: 'image-only',
      supported: false,
      message: 'This PDF contains no text layer. OCR is required before translation.',
    };
  }

  if (format === 'PDF' && options.pdfContent === 'mixed') {
    return {
      format,
      code: 'mixed',
      supported: true,
      message:
        'This PDF has both text and image pages; only its selectable text is available before OCR.',
    };
  }

  if (format === 'PDF' && options.pdfContent === 'text-layer') {
    return {
      format,
      code: 'text-layer',
      supported: true,
      message: 'This PDF has a selectable text layer and can be translated locally.',
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
