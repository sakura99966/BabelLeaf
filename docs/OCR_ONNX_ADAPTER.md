# BabelLeaf ONNX OCR adapter checkpoint

> Current note, 2026-08-13: this ONNX boundary remains available for future
> candidates, but the selected Windows x64 PC runtime is Tesseract WASM. See
> `OCR_TESSERACT_RUNTIME.md`. No ONNX candidate is release-approved.

## Purpose

This checkpoint provides a model-agnostic local adapter for ONNX-backed OCR
without adding an ONNX package, a Python runtime, or model weights to the base
installer. It is the next implementation step after the 0.4.1 comic workspace
and does not close the production OCR engine gate.

## Boundary

`onnxOcrRuntime.ts` converts an approved platform implementation into the
existing `LocalOcrRuntimeFactory` contract:

- `OcrPageBytesSource` reads a page from a platform-scoped local reference;
- `OnnxOcrSession` owns the provider-specific inference session and its close
  lifecycle;
- `OcrModelManifest` schema version 2 can declare multiple local artifacts;
  the factory receives a copied artifact map after every file has passed its
  declared size and SHA-256 checks. Schema version 1 continues to expose the
  implicit `model.bin` artifact;
- `OnnxOcrAdapterDefinition.decode` converts provider output into validated
  `ComicTextRegion` values;
- cancellation is checked before page access, before inference, and after
  inference;
- page bytes are copied into the local inference call and are never sent to a
  network client by this boundary;
- output is passed through `parseComicWorkerPageResult` before entering the
  queue or sidecar.

The adapter intentionally does not prescribe preprocessing, tensor names,
execution providers, tokenizer files, or model-specific decoding. Those
details belong to the selected candidate and its separately reviewed model
pack. A Web, Node.js, React Native, or native Tauri implementation can satisfy
the same interface. Multi-file packs must provide every declared artifact to
the factory; no artifact is downloaded or resolved from a remote URL.

## Candidate registry

`ocrCandidates.ts` records the current research candidates without installing
or loading them. PaddleOCR is a multilingual candidate. `manga-ocr-rs` is an
experimental Rust/ONNX Japanese candidate. Both remain unapproved until the
candidate's exact code revision, model artifacts, licenses, checksums, sample
quality, platform support, page latency, and peak memory pass the evidence
contract in `ocrEngineGate.ts`.

The registry is metadata only; it is not a download list and it cannot cause a
network request.

## Next gate

The next release-blocking task is to select one candidate and provide the
provenance, model weights, license, quality, and resource evidence required by
`ocrEngineGate.ts`. The multi-artifact storage boundary is now available, but a
real candidate cannot be marked ready until that measured gate is closed.
Image cleanup and typesetting remain outside the scope until then.
