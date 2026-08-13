# BabelLeaf OCR gate hardening checkpoint

> Superseding implementation note, 2026-08-13: the candidate-neutral gate is
> now exercised by the concrete Windows x64 Tesseract WASM path documented in
> `OCR_TESSERACT_RUNTIME.md`. Model bytes remain explicit local imports and are
> not bundled. The historical limitation below still applies to ONNX and other
> unqualified candidates, not to the exact trusted Tesseract catalog.

## Purpose

This checkpoint closes the missing lifecycle pieces around the 0.4.0-0.4.1
local OCR boundary. It does not claim that a production OCR engine or model
has been selected. The release gate remains the authority for that decision.

## Delivered

- `ocrModelPacks.ts` stores explicitly imported model artifacts under
  application data, keeps manifests in a versioned local index, validates the
  declared total and per-file sizes, verifies each SHA-256 before installation,
  verifies the aggregate inventory checksum, and verifies all artifacts again
  before runtime construction.
- Schema-version 1 single-file packs remain readable. Schema-version 2 packs
  support bounded, traversal-safe encoder, decoder, tokenizer, vocabulary, and
  preprocessing artifacts with an explicit primary artifact.
- Reinstalling the same model id and version is idempotent only when the
  checksum is identical. A different checksum is rejected instead of
  replacing a valid pack.
- Removing a model pack updates the index only after the pack directory has
  been removed successfully. Interrupted installs remove the partial pack
  directory before returning an error.
- `ocrRuntime.ts` exposes a replaceable runtime factory. A runtime cannot be
  given to the OCR queue until the engine, model, language, license, checksum,
  platform, benchmark, and resource gates pass.
- `ocrBenchmark.ts` runs bounded local samples and emits deterministic gate
  evidence for page latency, memory, language coverage, and platform. It never
  downloads a model or sends a page to a remote service.
- `onnxOcrRuntime.ts` now provides a model-agnostic ONNX session boundary with
  local page-byte routing, cancellation checks, decoded-region validation, and
  deterministic session cleanup.
- `ocrCandidates.ts` records the current candidate metadata without installing
  code, weights, or a network download path.
- `onnxOcrRuntime.ts` receives only locally verified artifact bytes and keeps
  the primary artifact compatible with the legacy single-file factory API.

## Explicit limitation

No OCR engine implementation or model weights are bundled by this checkpoint.
PaddleOCR, manga-ocr, manga-ocr-rs, and ONNX Runtime remain candidates. A
candidate can become a product dependency only after its runtime adapter,
model provenance, license, benchmark evidence, and minimum-platform resource
measurements pass `ocrEngineGate.ts`. The 0.4.1.2 and 0.4.1.3 adapter
checkpoints are intentionally candidate-neutral and do not close that gate.

## Data and privacy contract

Model artifacts are local application data and are not stored in comic
workspace sidecars. The model index contains manifests only. OCR runtime
construction is explicit and lazy; opening a book, rendering a page, or loading
a workspace does not load model artifacts or make a network request.
