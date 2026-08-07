# BabelLeaf local comic-worker protocol v1

0.3.2 freezes the boundary for the future OCR and image-translation worker;
it does not ship an OCR engine. The protocol is defined in
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
translation sidecar. Production selection remains deferred until the same
legally obtained Chinese, English, and Japanese sample set has been used to
benchmark detection, OCR, inpainting, and typesetting candidates.

Candidate projects are tracked in `UPSTREAM_INVENTORY.md`. No complete
external application is embedded, and every future engine, model, weight, and
font must have a pinned revision, checksum, license, and removal path.
