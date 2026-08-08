# BabelLeaf 0.4.0-0.4.3 OCR foundation, comic workspace, and pipeline

## Scope

0.4.0 establishes the local OCR data, worker, model, task, and selectable
text-layer boundaries. 0.4.1 adds the editable comic workspace, explicit
single-region translation, review state, and translated overlay primitives.
0.4.2 adds sidecar-backed erasing, optional local inpainting, typesetting, and
separate image/CBZ/ZIP export. 0.4.3 adds a recoverable multi-stage queue. These
services do not require a bundled OCR model; model-dependent quality remains an
explicit evidence gate.

## Local data contract

`ocrSidecar.ts` stores one versioned `babelleaf.ocr-sidecar` document per
imported source. Each page record contains the page identity, dimensions,
format, local reference, processing status, regions, and error state. Each
region contains a polygon, orientation, optional source language and ruby
metadata, OCR text, confidence, reading order, and engine/model provenance.

The sidecar never stores page bytes, API keys, credentials, arbitrary remote
URLs, or editable source images. Atomic application-data writes are provided by
`OcrSidecarStore`; task snapshots are provided by `OcrTaskStore`.

## Worker and queue boundary

The existing `babelleaf.comic-worker` v1 protocol remains the transport
boundary. `OcrTaskQueue` adds one-to-four bounded workers, page selection,
pause, resume, cancellation, retry, checkpoints, and recovery after an
interrupted process. `OcrTaskController` updates the sidecar only with worker
results and never changes the imported source.

The queue accepts an engine callback rather than a process or shell command.
Desktop, Android, iOS, and future Rust/ONNX implementations can therefore use
different adapters without changing sidecar or reader code. A mock engine is
used by tests to exercise the complete lifecycle.

## Model packs

`ocrModels.ts` defines a local-only `babelleaf.ocr-model` manifest. The
manifest records an identifier, version, runtime, supported languages, engine
compatibility, checksum, license, size, and CPU-fallback capability. Model
bytes must be installed by an explicit local import and are absent from the
startup path. The registry does not fetch URLs or infer a license from a
repository name.

Production model selection remains subject to the measured candidate and
license gate in `DEVELOPMENT_ROADMAP.md`. PaddleOCR, manga-ocr, manga-ocr-rs,
and ONNX Runtime remain replaceable candidates; no complete external OCR
application or model weight is embedded in BabelLeaf 0.4.0-0.4.3. The
`ocrEngineGate.ts` service rejects a runtime unless local installation,
engine/model identity, language and capability coverage, license/checksum
evidence, platform benchmark, and resource budgets all pass.

`ocrModelPacks.ts` now provides the local lifecycle around that contract:
explicit model import, SHA-256 verification, idempotent versioned storage,
verified reads, and removal. The AI settings panel exposes this lifecycle to
desktop users without adding an implicit download. `ocrRuntime.ts` verifies the stored bytes before
constructing a replaceable runtime adapter. `ocrBenchmark.ts` emits bounded
local evidence for the gate. These services do not select an engine or embed
weights.

## Selectable text layer

`ocrTextLayer.ts` converts validated polygons into reading-order blocks and
plain text. `OcrTextLayer.tsx` renders those blocks as a transparent selectable
overlay over a caller-provided page-sized image or PDF canvas. The desktop
comic workspace mounts this layer beside the translated overlay and provides
an explicit visibility toggle. The source page remains intact, and the layer
can be hidden without deleting OCR data.

## Privacy and resource limits

OCR is local after a model is explicitly installed. No page image or OCR text
is sent to a cloud OCR service. The worker enforces 10,000 pages, 80 million
pixels per page, 2,000 regions per page, one-to-four workers, bounded language
lists, and sidecar text limits. Malformed, oversized, missing-model, and
unsupported-device conditions stop before partial source mutation.

## Comic workspace boundary

`comicWorkspace.ts` keeps machine OCR and manual revisions separate. Region
creation, deletion, restoration, polygon/text correction, reading order,
rotation, split, merge, approval, and rollback are pure bounded operations.
`comicTranslation.ts` calls a named provider only after an explicit caller
action and stores the machine result, source revision, review state, and
provenance in a credential-free workspace sidecar. `comicOverlay.ts` and
`ComicTranslationOverlay.tsx` hide stale translations until they are rerun or
reviewed, so OCR reruns cannot silently replace approved edits.

`comicImagePipeline.ts`, `comicTypesetting.ts`, `comicEditSidecar.ts`, and
`comicExport.ts` extend this boundary without writing source page bytes.
`comicPipeline.ts` composes the page stages with bounded recovery, selective
rerun, cache pruning, and export validation. The production OCR gate remains
separate from these deterministic and explicitly local services.
