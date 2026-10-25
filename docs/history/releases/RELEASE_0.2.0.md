# BabelLeaf 0.2.0

## Release scope

Version 0.2 delivers the local reading translation workflow for text-based
books. It does not modify the source document and keeps translation results in
versioned local artifacts.

## Delivered

- Reader translation workbench for a selected section or the full book.
- Bounded translation queue with pause, resume, cancellation, and checkpoints.
- Source and translation pairs with paginated bilingual rendering.
- Credential-free JSON sidecar import and export with schema validation.
- Existing built-in DeepSeek V4, OpenAI, Anthropic Claude, and local Ollama
  provider boundaries.
- Portable extraction and artifact services covered by unit tests.

## Verification

- Frontend lint, formatting, build, and Vitest suites passed.
- Rust formatting, clippy, and library tests passed.
- Windows x64 unsigned NSIS package passed preflight and isolated installation,
  startup, uninstall, and user-data preservation checks.

## Deferred to later versions

- Translation memory, glossary enforcement, and interactive review editing.
- Scanned-PDF OCR.
- Comic OCR, text-region detection, inpainting, translated typesetting, and
  editable overlays.
- Signed packages and macOS, Android, and iOS release validation.
