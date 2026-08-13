# BabelLeaf local Tesseract WASM OCR runtime

## Status and scope

BabelLeaf now has a concrete, lazy `tesseract-wasm` 0.11.0 runtime for the
Windows x64 PC baseline. It recognizes an explicitly selected, checksum-verified
local model pack and reads page bytes only through the application Temp store.
It does not download a model, resolve a page URL, upload an image, or start OCR
when a book or workspace is opened.

The supported release-gated model identities are the Apache-2.0
`tessdata_fast` 4.1.0 files for English, Simplified Chinese, Japanese, and
vertical Japanese. Their exact sizes and SHA-256 values are recorded in
`scripts/ocr/tessdata-fast-4.1.0.catalog.json`. A renamed, modified, differently
licensed, or differently versioned pack remains importable for future adapters
but cannot be selected by the current release-gated runtime.

Model weights are deliberately absent from the repository and installer. This
preserves the explicit local-import boundary and prevents background model
downloads. The application package contains only the BSD-2-Clause JavaScript
worker and its fast/fallback WASM runtime assets.

## Reproducible developer verification

Obtain the four model files and `LICENSE` from the official
`tesseract-ocr/tessdata_fast` repository at tag `4.1.0`, then place them under:

```text
target/ocr-models/tessdata_fast-4.1.0/
  LICENSE
  eng.traineddata
  chi_sim.traineddata
  jpn.traineddata
  jpn_vert.traineddata
```

Run the pinned verification and pack builder:

```powershell
node scripts/ocr/verify-tesseract-models.mjs
node scripts/ocr/build-tesseract-model-packs.mjs
```

The verifier fails on any model hash mismatch or normalized character accuracy
below 0.70. It runs `OCRClient` in a dedicated worker, records latency and
process memory, and exercises English, Simplified Chinese, horizontal Japanese,
and pre-rotated vertical Japanese. The checked evidence snapshot is
`docs/evidence/OCR_TESSERACT_WASM_WIN32_X64_2026-08-13.json`.

The final 2026-08-13 rerun passed all four samples at normalized accuracy 1.00.
Observed single-sample latency was 152.18-176.28 ms and maximum process memory
was 233.12 MiB. These measurements describe the verification process, not the
idle application.

The builder validates the same immutable catalog and creates four import
folders under `target/ocr-models/import-packs`. Each contains:

```text
manifest.json
<language>.traineddata
LICENSE.txt
provenance.json
```

In Settings, select `manifest.json`, the `.traineddata` file, and `LICENSE.txt`
together. `provenance.json` may also be selected; it is not stored as a model
artifact. Installation recalculates every file hash and the aggregate pack
inventory before any bytes are written to the model store.

## Runtime behavior

- The comic workspace lists only exact, platform-qualified packs as runnable.
- The user explicitly chooses the model, current-page or all-imported-pages
  scope, then presses **Run local OCR**.
- Pages are processed sequentially to constrain memory. Each completed result
  is merged into the immutable-source comic workspace and checkpointed before
  the next page starts.
- Cancellation prevents further page commits. Results already checkpointed
  remain available.
- Vertical-model pages are rotated counter-clockwise for recognition. Region
  rectangles are transformed back into source coordinates and CJK-only
  inter-character spaces introduced by the model are removed.
- The Worker is terminated after the selected run, releasing retained WASM
  memory. The runtime remains behind the lazy comic-workspace boundary and is
  absent from reader startup.

## Evidence boundary

The current synthetic matrix closes the missing concrete runtime, exact model
identity, license, checksum, basic four-language recognition, vertical
preprocessing, and Windows resource-budget portions of BL-PC04-001. It does not
substitute for a representative legal manga/scanned-book corpus or an exact
installed-package workflow. Those items remain explicit acceptance work and
must not be reported as passed based solely on this document.
