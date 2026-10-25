# BabelLeaf 0.4.2

## Release purpose

0.4.2 delivers the local-first comic cleanup, editable typesetting, sidecar,
and source-preserving export services. It does not add a model download path or
embed OCR/inpainting weights in the base installer.

## Delivered scope

- Deterministic RGBA mask processing with paint, erase, restore, expansion, and
  feathering operations under explicit pixel and operation limits.
- Deterministic local fill for masked pixels and an optional local inpainting
  worker boundary with cancellation and dimension validation.
- Horizontal, RTL, and vertical CJK layout calculation with font, size, color,
  outline, alignment, line-height, spacing, rotation, overflow, and fit fields.
- `babelleaf.comic-edit-sidecar` persistence for masks and editable layouts;
  source page bytes are never stored in the sidecar.
- Separate image-set, CBZ, and ZIP export with deterministic names, size
  limits, archive validation, and source-overwrite protection.
- An application-facing `ComicEditingSession` facade that coordinates cleanup,
  typesetting, sidecar checkpoints, and export without flattening the source.

## Verification

The release tests cover deterministic mask operations, cancellation, local
worker boundaries, hostile sidecars, vertical/RTL layout, archive creation,
source protection, and checkpoint persistence. The full release closure also
requires the repository test, type, build, Rust, and Windows installer checks.

## Explicit boundary

PDF writing, native page-canvas integration, production OCR model selection,
and optional inpainting model redistribution remain separate, evidence-driven
gates. A model is never downloaded automatically and no cloud OCR path is
introduced.
