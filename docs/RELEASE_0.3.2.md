# BabelLeaf 0.3.2

## Release purpose

0.3.2 hardens local text translation for interchange and prepares a portable
boundary for future comic OCR. It does not add cloud synchronization, online
resource acquisition, DRM removal, background translation, or a production OCR
model.

## Delivered scope

- Glossaries export/import through versioned JSON and TSV plus TBX-Basic
  round-trip support.
- Translation memory export/import through versioned JSON and TSV plus TMX
  1.4 round-trip support, preserving provider, model, glossary version, hits,
  and stable cache keys.
- Review artifacts export/import through versioned JSON and TSV plus XLIFF 2.0
  round-trip support, preserving source, machine result, reviewed text,
  status, locator, stable anchor, provenance, and error details.
- Trust-boundary limits for interchange size, row count, XML elements, and
  hostile doctype/entity input. API keys and environment values are not part
  of any interchange payload.
- Layout-independent translation anchors based on section/block/chunk identity
  and normalized source fingerprints. Anchors are independent of pagination,
  font, line-height, writing mode, and window size.
- Explicit format diagnostics for text-layer, mixed, image-only, malformed,
  encrypted/DRM, unsupported, empty, and oversized documents.
- A legal local fixture matrix and tracked performance budgets covering EPUB,
  PDF, MOBI/AZW/AZW3, FB2, CBZ, TXT, and Markdown.
- A versioned local comic-worker protocol with capability discovery, bounded
  page/region limits, progress, cancellation, retryable errors, provenance,
  and a mock OCR adapter. No production OCR engine is bundled.
- Glossary, translation-memory, and review panels expose JSON/TSV/TBX/TMX/
  XLIFF format selection without changing the existing local-only workflow.

## Open-source assistance and license boundary

Readest, foliate-js, and PDF.js remain the pinned reader baseline. OmegaT and
Translate Toolkit informed glossary, memory, review, and interchange behavior;
their complete applications are not embedded. Comic Translate, BallonsTranslator,
manga-ocr, PaddleOCR, ONNX Runtime, OpenCV, LaMa, and rustybuzz remain
benchmark or protocol candidates for 0.4. Every future code revision, model,
weight, font, and data asset requires an independent license and checksum
record. See [`UPSTREAM_INVENTORY.md`](UPSTREAM_INVENTORY.md).

## Data, privacy, and resource boundaries

- Imported books remain byte-for-byte unchanged.
- Interchange and sidecar files contain no API key, credential, `.env` value,
  or arbitrary remote endpoint.
- Translation requests remain user initiated; worker processing is local.
- Interchange input is bounded at 8 MiB and rejects external XML entities and
  doctypes. Book resource diagnostics enforce 512 MiB files, 20,000 archive
  entries, and 2 GiB uncompressed content.
- OCR, inpainting, dictionary, speech, and model packs remain outside the
  startup path.

## Verification requirements

The release gate remains the full frontend, browser, Rust, build-output, and
Windows installer smoke suite, followed by code review, merge to `main`, remote
backup, branch cleanup, and bounded cache cleanup. Round-trip interchange,
hostile-input, anchor, fixture-matrix, and mock-worker tests are mandatory.

## Deferred scope

- Production OCR/detection selection, scanned-PDF text layers, comic region
  editing, erasing, inpainting, typesetting, and translated export remain
  0.4.x work.
- macOS, Android, and iOS/iPadOS release qualification remains on the roadmap
  after the text and comic-worker gates.
