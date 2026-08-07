# BabelLeaf 0.4.0

## Release purpose

0.4.0 delivers the local OCR foundation required for scanned PDFs, comic
archives, and future image translation. It keeps OCR optional and replaceable;
the base package does not include a general Python runtime, a cloud OCR route,
or unreviewed model weights.

## Delivered scope

- OCR sidecar schema v1 preserving page identity, dimensions, polygons,
  orientation, languages, text, confidence, reading order, ruby metadata,
  engine/model provenance, runtime, errors, and task state.
- Bounded OCR page queue with selection, one-to-four workers, pause, resume,
  cancel, retry, checkpoint, and interrupted-run recovery.
- Atomic local sidecar and task stores under application data.
- Local-only OCR model manifests with checksum, license, language, runtime,
  compatible engine, size, and CPU-fallback declarations.
- Selectable OCR text-layer primitives that do not rewrite PDF, CBZ, FBZ, or
  image sources.
- Explicit OCR diagnostics for text-layer, mixed, image-only, malformed,
  oversized, missing-model, incompatible-device, cancelled, and failed routes.
- OCR fixture matrix and performance budgets for PDF, CBZ, FBZ, and
  platform-provided image-folder manifests.

## Open-source boundary

Readest, foliate-js, and PDF.js remain the reader baseline. The worker and
sidecar contracts are BabelLeaf-owned. PaddleOCR, manga-ocr, manga-ocr-rs,
ONNX Runtime, OpenCV, mokuro, Comic Translate, and BallonsTranslator remain
benchmark or architecture references recorded in `UPSTREAM_INVENTORY.md`;
their complete applications and model weights are not embedded.

## Privacy and data guarantees

- OCR processing is local after explicit local model installation.
- No page bytes, OCR text, model credentials, or arbitrary remote endpoints are
  written to a translation or OCR sidecar.
- No source PDF, archive, image, or folder entry is modified.
- Model packs are not downloaded automatically and are not loaded during
  application startup.

## Deferred scope

0.4.1 adds editable OCR regions, corrections, translation overlays, and review
integration. 0.4.2 adds cleanup, inpainting, typesetting, and separate
translated export. macOS, Android, and iOS qualification remains later in the
roadmap.

See [OCR_FOUNDATION.md](OCR_FOUNDATION.md),
[COMIC_WORKER_PROTOCOL.md](COMIC_WORKER_PROTOCOL.md), and
[DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md).
