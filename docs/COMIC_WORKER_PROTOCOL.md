# BabelLeaf local comic-worker protocol v1

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
modifying the source page. Production model-pack selection remains a separate
license and benchmark gate; a model must be explicitly installed locally.

Candidate projects are tracked in `UPSTREAM_INVENTORY.md`. No complete
external application is embedded, and every future engine, model, weight, and
font must have a pinned revision, checksum, license, and removal path.
