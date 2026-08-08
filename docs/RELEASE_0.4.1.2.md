# BabelLeaf 0.4.1.2 engineering checkpoint

This is an internal, post-0.4.1 checkpoint. It does not change the package
version; `package.json` and the Tauri manifest remain `0.4.1` until a measured
production OCR candidate closes the mandatory gate.

## Release purpose

0.4.1.2 is an OCR runtime-adapter checkpoint. It makes the existing local
model-pack and engine gate usable by a future ONNX-backed candidate while
keeping the base package small and offline by default.

## Delivered scope

- Model-agnostic `OnnxOcrSession` and `OcrPageBytesSource` contracts.
- Lazy ONNX runtime factory that verifies model runtime and engine identity
  before creating a session.
- Cancellation checks before local page access and around inference.
- Deterministic region validation before queue or sidecar persistence.
- Idempotent runtime close behavior and explicit closed-runtime diagnostics.
- Candidate metadata registry for PaddleOCR and manga-ocr-rs without adding
  either project or its model weights as a dependency.
- Unit tests covering local-byte routing, cancellation, compatibility checks,
  output validation, session cleanup, and candidate registry isolation.

## Deferred and release-blocking items

This checkpoint does not select a production OCR engine, model pack, or
execution provider. No model weights, Python runtime, or network download path
are included. A real candidate must still pass the license, provenance,
checksum, language, platform, quality, page-latency, and peak-memory gates.
The 0.4.2 image-cleanup and typesetting work therefore remains blocked by the
roadmap until that gate is closed.

## Privacy and source guarantees

The adapter accepts only caller-provided local page bytes and has no network
client. It never writes to the source page. OCR output continues to use the
existing versioned sidecar and workspace contracts.
