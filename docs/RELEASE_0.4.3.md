# BabelLeaf 0.4.3

## Release purpose

0.4.3 stabilizes the comic processing pipeline around bounded, restart-safe
services. The version closes the 0.4 code path without claiming unmeasured OCR
quality or bundling a model runtime.

## Delivered scope

- Ordered OCR, translation, cleanup, typesetting, and export stages composed
  behind one page queue.
- Pause, resume, cancel, retry, restart recovery, checkpoint persistence,
  revision history, and selective page rerun.
- Redacted, bounded diagnostics that never persist API keys, bearer tokens, or
  provider credentials.
- Bounded concurrency, page dimensions, attempts, history, generated-artifact
  cache pruning, and export identity/size validation.
- Representative service-level tests for failure, recovery, cache eviction,
  source preservation, and ordered multi-stage execution.
- Desktop comic workspace entry from the reader header for local image/CBZ/FBZ
  or PDF-page import, OCR-sidecar import, manual region correction, selectable OCR text,
  explicit region translation, deterministic erasing, typesetting, and
  separate CBZ/PDF export.
- Settings now provides explicit local OCR model-pack import, checksum
  verification, listing, and removal; no model is fetched implicitly.
- Documentation of model installation, privacy, resource limits, and the
  distinction between imported OCR data and an explicitly installed local
  worker.

## Verification

The release closure runs the complete frontend unit and browser suites, type
and lint checks, production build, build-output checks, Rust formatting,
clippy, offline library tests, Windows NSIS build, and isolated installer smoke
tests. The release branch is merged into `main`, tagged, pushed, and only then
are bounded reproducible caches removed.

## Explicit boundary

The desktop workflow accepts imported OCR sidecars and explicitly installed
local model packs. A production OCR engine still has to satisfy the measured
license, quality, and resource gate before a model is bundled by a release.
The repository contains no hidden download, cloud OCR, Python runtime, or
unverified model weights.
