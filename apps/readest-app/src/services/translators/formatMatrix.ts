import type { BookFormat } from '@/types/book';
import {
  diagnoseTranslationFormat,
  TRANSLATION_FORMAT_LIMITS,
  type TranslationFormatDiagnostic,
} from './diagnostics';

export interface TranslationFormatFixtureSpec {
  format: BookFormat;
  validFixture: string;
  malformedFixture: string;
  emptyOrImageOnlyFixture?: string;
  encryptedFixture: string;
  notes: string;
}

/**
 * The legal fixture names are tracked in docs and point at locally generated
 * or repository-owned samples only. No online catalog or copyrighted source
 * is downloaded by the test suite.
 */
export const TRANSLATION_FORMAT_FIXTURE_MATRIX: TranslationFormatFixtureSpec[] = [
  {
    format: 'EPUB',
    validFixture: 'sample-alice.epub',
    malformedFixture: 'malformed.epub',
    encryptedFixture: 'encrypted.epub',
    notes: 'reflowable text, malformed ZIP, encrypted marker',
  },
  {
    format: 'PDF',
    validFixture: 'sample-alice.pdf',
    malformedFixture: 'malformed.pdf',
    emptyOrImageOnlyFixture: 'sample-paper.pdf',
    encryptedFixture: 'encrypted.pdf',
    notes: 'text layer, image-only/mixed classification, malformed PDF',
  },
  {
    format: 'MOBI',
    validFixture: 'sample-war-peace.mobi',
    malformedFixture: 'malformed.mobi',
    encryptedFixture: 'encrypted.mobi',
    notes: 'MOBI-family parser and explicit unsupported/DRM errors',
  },
  {
    format: 'AZW',
    validFixture: 'sample-war-peace.azw',
    malformedFixture: 'malformed.azw',
    encryptedFixture: 'encrypted.azw',
    notes: 'extension-preserving MOBI-family fixture',
  },
  {
    format: 'AZW3',
    validFixture: 'sample-war-peace.azw3',
    malformedFixture: 'malformed.azw3',
    encryptedFixture: 'encrypted.azw3',
    notes: 'extension-preserving MOBI-family fixture',
  },
  {
    format: 'FB2',
    validFixture: 'sample-metadata.fb2',
    malformedFixture: 'malformed.fb2',
    encryptedFixture: 'encrypted.fb2',
    notes: 'XML entity and malformed-content validation',
  },
  {
    format: 'CBZ',
    validFixture: 'sample-metadata.cbz',
    malformedFixture: 'malformed.cbz',
    emptyOrImageOnlyFixture: 'sample-metadata.cbz',
    encryptedFixture: 'encrypted.cbz',
    notes: 'image-only until the 0.4 OCR text-layer workflow',
  },
  {
    format: 'TXT',
    validFixture: 'sample-alice.txt',
    malformedFixture: 'malformed.txt',
    encryptedFixture: 'encrypted.txt',
    notes: 'bounded text conversion and empty-file diagnostics',
  },
  {
    format: 'MD',
    validFixture: 'sample-alice.md',
    malformedFixture: 'malformed.md',
    encryptedFixture: 'encrypted.md',
    notes: 'Markdown rendering and sanitization',
  },
];

export interface TranslationResourceMeasurement {
  fileSizeBytes?: number;
  archiveEntryCount?: number;
  uncompressedBytes?: number;
}

export const diagnoseTranslationResource = (
  format: BookFormat | string,
  measurement: TranslationResourceMeasurement,
): TranslationFormatDiagnostic => diagnoseTranslationFormat(format, measurement);

export const TRANSLATION_PERFORMANCE_BUDGETS = {
  coldStartupMs: 2_500,
  idleMemoryMb: 350,
  importMs: 8_000,
  pageTurnMs: 250,
  searchMs: 500,
  chapterTranslationQueueMs: 60_000,
  fullBookQueueMs: 15 * 60_000,
  peakMemoryMb: 1_024,
  diskCacheMb: 1_024,
  packageSizeMb: 250,
  maxFileBytes: TRANSLATION_FORMAT_LIMITS.maxFileBytes,
  ocrPageMs: 15_000,
  ocrPeakMemoryMb: 1_024,
  comicWorkspaceSaveMs: 500,
  comicOverlayRenderMs: 16,
} as const;

export interface PerformanceMeasurement {
  name: keyof typeof TRANSLATION_PERFORMANCE_BUDGETS;
  value: number;
  unit: 'ms' | 'mb';
}

export const checkPerformanceMeasurement = (measurement: PerformanceMeasurement): boolean =>
  measurement.value <= TRANSLATION_PERFORMANCE_BUDGETS[measurement.name];

export interface OcrFormatFixtureSpec {
  sourceFormat: 'PDF' | 'CBZ' | 'FBZ' | 'IMAGE_FOLDER';
  validFixture: string;
  malformedFixture: string;
  imageOnlyFixture: string;
  oversizedFixture: string;
  notes: string;
}

/** Legal local fixtures for the 0.4 OCR and selectable text-layer workflow. */
export const OCR_FORMAT_FIXTURE_MATRIX: OcrFormatFixtureSpec[] = [
  {
    sourceFormat: 'PDF',
    validFixture: 'sample-paper.pdf',
    malformedFixture: 'malformed.pdf',
    imageOnlyFixture: 'sample-scanned.pdf',
    oversizedFixture: 'oversized-page.pdf',
    notes: 'text-layer, mixed, and image-only page routing',
  },
  {
    sourceFormat: 'CBZ',
    validFixture: 'sample-metadata.cbz',
    malformedFixture: 'malformed.cbz',
    imageOnlyFixture: 'sample-metadata.cbz',
    oversizedFixture: 'oversized-page.cbz',
    notes: 'bounded archive pages and local OCR regions',
  },
  {
    sourceFormat: 'FBZ',
    validFixture: 'sample-metadata.fb.zip',
    malformedFixture: 'malformed.fb.zip',
    imageOnlyFixture: 'sample-metadata.fb.zip',
    oversizedFixture: 'oversized-page.fb.zip',
    notes: 'image-page boundary remains explicit for FBZ archives',
  },
  {
    sourceFormat: 'IMAGE_FOLDER',
    validFixture: 'sample-image-folder.manifest.json',
    malformedFixture: 'malformed-image-folder.manifest.json',
    imageOnlyFixture: 'sample-image-folder.manifest.json',
    oversizedFixture: 'oversized-page.manifest.json',
    notes: 'platform-provided folder access; no automatic directory scanning',
  },
];

export interface ComicWorkspaceFixtureSpec {
  sourceFixture: string;
  workspaceFixture: string;
  malformedWorkspaceFixture: string;
  recoveryFixture: string;
  notes: string;
}

/** Legal local fixtures for correction, translation-overlay, and recovery tests. */
export const COMIC_WORKSPACE_FIXTURE_MATRIX: ComicWorkspaceFixtureSpec[] = [
  {
    sourceFixture: 'sample-metadata.cbz',
    workspaceFixture: 'sample-comic-workspace.json',
    malformedWorkspaceFixture: 'malformed-comic-workspace.json',
    recoveryFixture: 'interrupted-comic-workspace.json',
    notes: 'manual region revisions, stale OCR reruns, translation review, and restart recovery',
  },
  {
    sourceFixture: 'sample-scanned.pdf',
    workspaceFixture: 'sample-scanned-workspace.json',
    malformedWorkspaceFixture: 'malformed-scanned-workspace.json',
    recoveryFixture: 'interrupted-scanned-workspace.json',
    notes: 'image-only PDF pages retain source identity and editable OCR state',
  },
];
