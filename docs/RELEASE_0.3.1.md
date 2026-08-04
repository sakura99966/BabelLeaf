# BabelLeaf 0.3.1

## Release purpose

0.3.1 productizes the local-first text translation workflow. It adds durable
management and review surfaces without changing the imported source book or
introducing synchronization, accounts, resource scraping, or background
network activity.

## Implemented scope

- Glossary management supports create, edit, delete, search, local validation,
  same-direction conflict reporting, versioned persistence, and credential-free
  JSON import/export.
- Translation memory exposes entries, hits, provider/language/model context,
  glossary-version invalidation visibility, bounded capacity, replacement,
  deletion, clearing, and portable JSON import/export.
- The review workspace shows every durable segment, source locator, provider and
  model provenance, glossary version, machine output, current edit, status, and
  failure details. It supports filtering, keyboard paging, edit, approve,
  machine-result reversion, autosaved local drafts, and recovery indicators.
- The batch dashboard lists durable jobs after restart, marks recovered jobs,
  shows progress and failure details, supports start/resume/retry/pause/cancel,
  offers an explicit rerun/invalidation action for completed results, and
  removes only old terminal history through bounded cleanup.
- Named provider failures are normalized into direct not-configured,
  cancellation, timeout, redirect, rate-limit, credential, empty-response, and
  bounded failure messages. Request timeouts and abort signals are propagated
  to the provider adapter.
- Existing sidecars and job snapshots remain readable. New provenance and
  review fields are optional and therefore require no destructive migration.

## Open-source assistance and license boundary

The implementation continues to use the pinned Readest/foliate-js/PDF.js
reading baseline. OmegaT's glossary, translation-memory, and review workflow,
and Translate Toolkit's interchange-validation practices were used as behavior
and fixture references; neither complete application was embedded. The
candidate comic projects remain deferred to 0.4 and are not dependencies of
this release. Provenance and license decisions are recorded in
[`UPSTREAM_INVENTORY.md`](UPSTREAM_INVENTORY.md).

## Data and network boundaries

- Translation starts only after an explicit user action or retry.
- Source files are never rewritten. Durable artifacts, jobs, glossary, memory,
  and review drafts contain no API keys or `.env` values.
- Provider endpoints and models remain application-controlled. Users enter
  only named-provider credentials, with loopback-only Ollama as the local
  exception.
- Old terminal job history is cleaned only after explicit confirmation and
  bounded retention; active and recoverable jobs are preserved.

## Verification record

The release gate requires the full frontend, browser, Rust, build-output, and
Windows installer smoke suites, followed by code review, merge to `main`,
remote push, and bounded cache cleanup. The final pass/fail evidence is
recorded in the release commit and workflow artifacts; no release candidate is
accepted while any required check is failing.

## Deferred scope

- TMX/TBX/XLIFF interchange and the full legal format fixture matrix remain
  0.3.2 work.
- Scanned-PDF OCR, comic detection, erasing, inpainting, and typesetting remain
  0.4 work. PaddleOCR, manga-ocr, ONNX Runtime, OpenCV, LaMa, rustybuzz, and
  Comic Translate are benchmark or protocol references only until a separate
  license, model, performance, and platform decision is approved.
- macOS, Android, and iOS release qualification remains on the roadmap after
  the text and comic-worker gates.
