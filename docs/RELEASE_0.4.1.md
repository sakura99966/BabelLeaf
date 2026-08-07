# BabelLeaf 0.4.1

## Release purpose

0.4.1 delivers the editable comic-workspace and translation-overlay boundary
on top of the 0.4.0 OCR foundation. The implementation remains local-first and
sidecar-based; source pages are never rewritten and no OCR or translation
request is started implicitly.

## Delivered scope

- Versioned `babelleaf.comic-workspace` sidecar with machine OCR provenance,
  manual revisions, tombstones, review state, translation state, and overlay
  style.
- Region creation, deletion, restoration, polygon/text/orientation/language
  correction, reading-order editing, rotation, split, merge, approval, and
  rollback helpers with bounded validation.
- OCR rerun merge that preserves manual and approved edits, marks stale
  translations, and retains removed machine regions for review.
- Explicit single-region translation using the existing named provider
  adapters, with machine-result retention, review, revert, cancellation via
  `AbortSignal`, and credential-free sidecars.
- Selectable translated overlay and accessible region-editor primitives.
- Atomic workspace store and OCR-sidecar migration path.
- OCR engine/model release gate requiring local installation, provenance,
  license/checksum evidence, platform benchmark evidence, and resource-budget
  compliance.
- Comic workspace fixture matrix and regression tests.

## Deferred scope

0.4.1 does not bundle a production OCR runtime or model weights. The selected
PaddleOCR, manga-ocr, manga-ocr-rs, or ONNX Runtime path must pass the gate in
`ocrEngineGate.ts` before the full 0.4.x OCR acceptance matrix is closed.
Image erasing, inpainting, deterministic typesetting, and translated export
remain 0.4.2 work. Full page-canvas integration and touch-specific geometry
tools remain 0.4.3/platform work.

## Privacy and source guarantees

- Workspace loading and overlay rendering are offline operations.
- Translation is sent only when the caller explicitly invokes the named
  provider adapter.
- API keys, arbitrary endpoints, page bytes, and source files are not stored
  in workspace data.
- Imported files remain byte-for-byte unchanged.

See [COMIC_WORKSPACE.md](COMIC_WORKSPACE.md),
[OCR_FOUNDATION.md](OCR_FOUNDATION.md), and
[DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md).
