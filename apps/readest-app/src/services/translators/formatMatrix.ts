import type { BookFormat } from '@/types/book';
import {
  diagnoseTranslationFormat,
  TRANSLATION_FORMAT_LIMITS,
  type TranslationFormatDiagnostic,
} from './diagnostics';

export interface TranslationFormatFixtureSpec {
  format: BookFormat;
  validFixture: string;
  validFixtureSource: 'repository-owned' | 'generated-local' | 'external-required';
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
    validFixtureSource: 'repository-owned',
    malformedFixture: 'EPUB/malformed.epub',
    encryptedFixture: 'EPUB/encrypted.epub',
    notes: 'reflowable text, malformed ZIP, encrypted marker',
  },
  {
    format: 'PDF',
    validFixture: 'sample-alice.pdf',
    validFixtureSource: 'repository-owned',
    malformedFixture: 'PDF/malformed.pdf',
    emptyOrImageOnlyFixture: 'PDF/image-only.pdf',
    encryptedFixture: 'PDF/encrypted.pdf',
    notes: 'text layer, image-only/mixed classification, malformed PDF',
  },
  {
    format: 'MOBI',
    validFixture: 'sample-war-peace.mobi',
    validFixtureSource: 'repository-owned',
    malformedFixture: 'MOBI/malformed.mobi',
    encryptedFixture: 'MOBI/encrypted.mobi',
    notes: 'MOBI-family parser and explicit unsupported/DRM errors',
  },
  {
    format: 'AZW',
    validFixture: 'AZW/valid.azw',
    validFixtureSource: 'generated-local',
    malformedFixture: 'AZW/malformed.azw',
    encryptedFixture: 'AZW/encrypted.azw',
    notes: 'classic MOBI-family AZW route plus generated malformed and marker cases',
  },
  {
    format: 'AZW3',
    validFixture: 'sample-babelleaf.azw3',
    validFixtureSource: 'repository-owned',
    malformedFixture: 'AZW3/malformed.azw3',
    encryptedFixture: 'AZW3/encrypted.azw3',
    notes: 'native DRM-free KF8 plus generated malformed and marker cases',
  },
  {
    format: 'FB2',
    validFixture: 'sample-metadata.fb2',
    validFixtureSource: 'repository-owned',
    malformedFixture: 'FB2/malformed.fb2',
    encryptedFixture: 'FB2/encrypted.fb2',
    notes: 'XML entity and malformed-content validation',
  },
  {
    format: 'CBZ',
    validFixture: 'sample-metadata.cbz',
    validFixtureSource: 'repository-owned',
    malformedFixture: 'CBZ/malformed.cbz',
    emptyOrImageOnlyFixture: 'CBZ/image-only.cbz',
    encryptedFixture: 'CBZ/encrypted.cbz',
    notes: 'image-only until the 0.4 OCR text-layer workflow',
  },
  {
    format: 'TXT',
    validFixture: 'sample-alice.txt',
    validFixtureSource: 'repository-owned',
    malformedFixture: 'TXT/malformed.txt',
    encryptedFixture: 'TXT/encrypted.txt',
    notes: 'bounded text conversion and empty-file diagnostics',
  },
  {
    format: 'MD',
    validFixture: 'sample-fixture.md',
    validFixtureSource: 'repository-owned',
    malformedFixture: 'MD/malformed.md',
    encryptedFixture: 'MD/encrypted.md',
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
  validFixtureSource: 'repository-owned' | 'generated-local' | 'external-required';
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
    validFixtureSource: 'repository-owned',
    malformedFixture: 'PDF/malformed.pdf',
    imageOnlyFixture: 'PDF/image-only.pdf',
    oversizedFixture: 'PDF/oversized-page.pdf',
    notes: 'text-layer, mixed, and image-only page routing',
  },
  {
    sourceFormat: 'CBZ',
    validFixture: 'sample-metadata.cbz',
    validFixtureSource: 'repository-owned',
    malformedFixture: 'CBZ/malformed.cbz',
    imageOnlyFixture: 'CBZ/image-only.cbz',
    oversizedFixture: 'CBZ/compression-bomb.cbz',
    notes: 'bounded archive pages and local OCR regions',
  },
  {
    sourceFormat: 'FBZ',
    validFixture: 'FBZ/image-only.fbz',
    validFixtureSource: 'generated-local',
    malformedFixture: 'FBZ/malformed.fbz',
    imageOnlyFixture: 'FBZ/image-only.fbz',
    oversizedFixture: 'CBZ/compression-bomb.cbz',
    notes: 'deterministic image-only archive keeps the FBZ page boundary explicit',
  },
  {
    sourceFormat: 'IMAGE_FOLDER',
    validFixture: 'IMAGE_FOLDER/valid.manifest.json',
    validFixtureSource: 'generated-local',
    malformedFixture: 'IMAGE_FOLDER/malformed.manifest.json',
    imageOnlyFixture: 'IMAGE_FOLDER/valid.manifest.json',
    oversizedFixture: 'IMAGE_FOLDER/oversized.manifest.json',
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
