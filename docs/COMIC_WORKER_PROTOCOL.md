# BabelLeaf local comic-worker protocol v1 (0.4.0-0.4.1 gate hardening)

0.4.0 uses the frozen boundary for local OCR and future image translation;
the base package still does not ship a heavy OCR runtime or model weight. The
protocol is defined in
`apps/readest-app/src/services/translators/comicWorkerProtocol.ts`.

The reader sends a versioned request containing a book hash, bounded page
references, dimensions, source languages, and explicit processing options.
Page bytes remain local. A worker reports capabilities, progress,
cancellation, retryable page errors, and a result containing page identity,
regions, polygons, orientation, language, OCR text, confidence, reading order,
engine, and model provenance.

The adapter enforces 10,000 pages, 80 million pixels per page, 2,000 regions
per page, one-to-four workers, and a bounded language list. A mock OCR engine
is covered by tests and can be swapped without changing the reader, queue, or
translation sidecar. OCR sidecars and task snapshots add page status,
checkpoint, model/runtime provenance, and selectable text-layer data without
modifying the source page. Production model-pack selection is enforced by
`ocrEngineGate.ts`: a model must be explicitly installed locally and pass
engine identity, language, capability, license/checksum, platform benchmark,
and resource-budget checks. The 0.4.1 comic workspace and gate-hardening
services build on this contract without embedding a runtime or weights.

Model-pack installation, per-artifact and aggregate checksum verification,
runtime construction, and benchmark evidence are implemented in
`ocrModelPacks.ts`, `ocrRuntime.ts`, and `ocrBenchmark.ts`. Schema-version 1
single-file packs remain readable; schema-version 2 packs pass a verified
artifact map to the adapter. They remain local-only and lazy; the queue
receives an adapter only after `ocrEngineGate.ts` accepts the complete evidence
set.

The 0.4.1.2 and 0.4.1.3 adapter checkpoints add `onnxOcrRuntime.ts` and the
multi-artifact model boundary. They expose a narrow session, local-page-source,
artifact-map, and output-decoder contract that can be implemented by ONNX
Runtime Web, Node.js, React Native, or a native Tauri worker. The adapter
validates decoded regions and closes sessions deterministically, but does not
select an engine, bundle model weights, or add a runtime dependency.

Candidate projects are tracked in `UPSTREAM_INVENTORY.md`. No complete
external application is embedded, and every future engine, model, weight, and
font must have a pinned revision, checksum, license, and removal path.
