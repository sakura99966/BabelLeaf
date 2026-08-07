# BabelLeaf 0.4.1 comic workspace

## Scope

The 0.4.1 workspace stores OCR corrections, manual regions, explicit
translation results, review state, and overlay style without modifying the
imported PDF, CBZ, FBZ, or image source. It is a separate
`babelleaf.comic-workspace` sidecar under application data.

`comicWorkspace.ts` keeps the machine OCR result and every manual revision as
separate records. An OCR rerun may replace the machine result and increments
its revision, but it does not remove manual text, polygons, approved regions,
or reviewed translations. If the effective source text changes, an existing
translation is marked stale and must be reviewed again.

## Region editing contract

The shared service supports creation, deletion, restoration, text and polygon
correction, orientation and language correction, reading-order changes,
rotation, split, merge, approval, and rollback of manual revisions. Geometry
is validated against the page dimensions and bounded to 64 polygon points per
region. Deleted regions remain as tombstones so an OCR rerun cannot silently
reintroduce them.

`ComicRegionEditor.tsx` is an accessible correction primitive. It deliberately
does not own page bytes, OCR processes, or network clients; the reader supplies
the workspace and writes the returned sidecar through `ComicWorkspaceStore`.

## Translation and overlay contract

`translateComicRegion` accepts an existing named BabelLeaf translation
provider and sends exactly one user-selected region. Loading a workspace,
opening a page, rendering an overlay, or recovering a task never invokes a
provider. The provider result records source text, source revision, provider,
model, prompt version, target language, machine text, and review status. API
keys and endpoints are not part of the workspace schema.

`ComicTranslationOverlay.tsx` renders only non-stale translated regions. It
uses the stored polygon, writing mode, rotation, and optional style without
flattening the page. A stale translation is intentionally hidden until it is
rerun or explicitly reviewed.

## OCR engine gate

`ocrEngineGate.ts` is a release gate, not an OCR implementation. A platform
adapter must provide the actual local runtime. It cannot be selected until the
model is explicitly installed, the engine and model match, required languages
and capabilities are present, license and checksum evidence are verified, the
target platform is benchmarked, and the p95 page-time and peak-memory budgets
pass. The gate performs no network request and does not load model bytes.

PaddleOCR, manga-ocr, manga-ocr-rs, and ONNX Runtime remain replaceable
candidates. Their applications, weights, and runtimes are not bundled by
0.4.1. The 0.4.1 workspace is therefore a safe integration boundary; the
production OCR engine selection remains a prerequisite for closing the full
0.4.x comic acceptance matrix.

## Recovery and privacy

`ComicWorkspaceStore.loadOrCreateFromOcr` migrates an existing validated OCR
sidecar into a workspace exactly once. Writes use the same atomic application
data helpers as translation and OCR stores. Workspace files never contain page
bytes, credentials, arbitrary URLs, or remote provider configuration. Source
files remain byte-for-byte unchanged.
