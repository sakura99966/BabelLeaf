# BabelLeaf 0.4.1.3 engineering checkpoint

This is an internal post-0.4.1 checkpoint. It does not change the package
version; `package.json` and the Tauri manifest remain `0.4.1` until a measured
production OCR candidate closes the mandatory gate.

## Release purpose

0.4.1.3 makes the local OCR model-pack boundary capable of representing real
multi-file ONNX exports while preserving the existing single-file format. It
is an adapter and storage checkpoint, not a production OCR engine selection.

## Delivered scope

- Schema-version 1 single-file manifests remain readable and use the implicit
  `model.bin` artifact.
- Schema-version 2 manifests declare bounded, traversal-safe artifact IDs and
  file names, a primary artifact, per-file sizes, and per-file SHA-256 values.
- The aggregate inventory checksum is calculated from the canonical artifact
  declarations, so verification does not concatenate multi-gigabyte model
  files in memory.
- Installation rejects missing, extra, duplicate, unsafe, oversized, truncated,
  and checksum-mismatched artifacts before indexing the pack.
- Interrupted installation removes the partial pack directory; reinstalling an
  identical id/version and artifact inventory remains idempotent.
- Runtime construction verifies all local artifacts first and passes a copied,
  read-only-by-convention artifact map to the ONNX adapter. The primary
  artifact remains available through the legacy `modelBytes` argument.
- Unit tests cover schema compatibility, multi-file round trips, path safety,
  artifact validation, primary selection, aggregate checksums, and ONNX routing.

## Deferred and release-blocking items

This checkpoint does not select PaddleOCR, manga-ocr, manga-ocr-rs, ONNX
Runtime, a preprocessing stack, or any model weights. A real candidate still
must pass provenance, software/model license, checksum, language quality,
platform, page-latency, peak-memory, and CPU-fallback evidence gates. The
0.4.2 image-cleanup and typesetting work therefore remains blocked until that
gate and reader integration are reviewed and accepted.

## Privacy and source guarantees

Model artifacts are imported into local application data only. Model loading
and ONNX session creation are explicit and lazy. The adapter receives caller-
provided local page bytes and verified local model bytes; it has no network
client and never modifies the source page, source archive, or source PDF.
