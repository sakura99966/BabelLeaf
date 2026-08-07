# Translation requirements

## Current release target

The current translation feature is a user-initiated, local-first reader
workflow. Its purpose is to translate selected text and reader-level content
without adding an account system, synchronization service, or generic remote
gateway.

### Named provider setup and execution

1. The user selects a named provider in the AI Translation settings panel:
   **DeepSeek V4**, **OpenAI**, **Anthropic Claude**, or local **Ollama**.
2. Cloud providers require only their API key. BabelLeaf stores each key in a
   provider-specific platform secure-store namespace and does not write keys to
   ordinary settings files, backups, logs, or translation caches.
3. Cloud provider endpoints and default translation models are application
   controlled. The user cannot enter an arbitrary URL or model. Ollama remains
   the only user-configured endpoint and is restricted to HTTP loopback.
4. Selecting text and opening the translation popup immediately submits the
   translation request. The popup displays the returned translation or a
   direct failure message; the user does not enter a prompt or endpoint.
5. Every request includes the product-owned literary translation instruction:
   preserve meaning, tone, paragraph structure, names, formatting, and
   punctuation; return only the translation without explanations or Markdown.

The DeepSeek and OpenAI adapters use an OpenAI-compatible chat protocol. The
Anthropic adapter uses the Messages API protocol and its provider-specific
headers. A legacy custom OpenAI-compatible API key is never migrated to any
named provider, because doing so could send a credential intended for another
service to the wrong endpoint.

### Local alternative

Ollama remains an optional local provider. Its URL is constrained to loopback
origins by the native capability policy. It requires a local server and model;
it does not require a BabelLeaf-managed cloud account.

## Provider adapter contract

Any later provider must be added through a named provider adapter. Each
adapter must define all of the following in the application:

- the official API base address and protocol adapter;
- a vetted default translation model and the fixed system instruction;
- an API-key-only user interface, with no manually entered endpoint URL;
- a provider-specific secure-storage identifier;
- request, cancellation, error, and health-check behavior;
- exact CSP and Tauri HTTP permission entries; and
- unit, integration, and release-network verification.

This is intentionally not a generic "OpenAI-compatible endpoint" feature.
OpenAI-compatible and Anthropic-style APIs have different request and
credential semantics, and a provider-specific adapter prevents endpoint
mistakes, reduces exposed network scope, and keeps mobile porting behavior
consistent.

## 0.2 delivered translation workflow

The repository now contains a versioned local translation-artifact schema and a
bounded, pauseable, cancellable chapter/book job queue. Version 0.2 wires these
services to a reader-side translation workbench opened from the reader view
menu. The workbench extracts bounded text segments from supported text-bearing
book sections, runs user-started translation with bounded concurrency, shows
progress, supports pause/resume/cancel, and checkpoints completed or failed
segments locally without changing the source document.

The workbench also renders completed source/translation pairs in an aligned
bilingual layout and supports portable JSON sidecar export/import. Sidecars
are validated against the current book hash, provider, and target language;
they contain no API keys. The existing reader translation toggle remains the
low-latency viewport workflow, while the workbench is the durable chapter/book
workflow.

## 0.3 and 0.3.1 delivered batch workflow

Version 0.3 adds a local-only chapter/full-book queue. Jobs are bounded,
pauseable, cancellable, persisted under application data, and recoverable after
an interrupted run. Failed items have an explicit retry budget and can be
retried without changing completed segments. A glossary protects configured
terms during provider requests, and a bounded translation memory avoids
repeating an identical request for the same language/provider/model/glossary
version. Reviewed segment text is stored in the same sidecar artifact with a
`reviewed` status.

The 0.3 format matrix verifies EPUB, PDF, MOBI/AZW/AZW3, FB2, TXT, and Markdown
text extraction. CBZ/FBZ are detected as image-only and report that OCR is
required; DRM or encrypted inputs receive an explicit diagnostic. No source
file is modified.

Version 0.3.1 adds end-user management around that workflow. Glossaries and
translation memory can be inspected, validated, imported, exported, edited,
bounded, and cleaned locally. The review workspace preserves the machine
result before a human edit, supports approval and reversion, exposes provider
and glossary provenance, filters durable statuses, and stores interrupted
drafts for recovery. The batch dashboard lists durable jobs after restart,
marks recovered snapshots, exposes failure details and retry actions, and
offers explicit invalidation before a completed result is rerun, and cleans only
old terminal history. Provider transport errors are normalized into
direct cancellation, timeout, redirect, rate-limit, credential, and failure
messages without exposing credentials.

## 0.3.2 delivered interoperability and readiness

Version 0.3.2 adds versioned JSON/TSV interchange for glossary, translation
memory, and review data, with deterministic TBX, TMX, and XLIFF round trips.
It adds layout-independent source anchors, explicit text-layer/mixed/
image-only/malformed/oversized diagnostics, a legal local fixture matrix, and
tracked resource/performance budgets. A versioned local comic-worker protocol
with capability discovery, limits, progress, cancellation, retryable errors,
and a mock OCR engine is available for integration testing. Interchange
payloads never contain credentials or arbitrary endpoints.

## 0.4.0 delivered OCR foundation

Version 0.4.0 adds a local OCR foundation behind the versioned worker protocol.
OCR sidecars preserve page identity, source dimensions, polygons, orientation,
language, text, confidence, reading order, optional ruby metadata, engine and
model provenance, runtime, and failure state. The imported PDF, CBZ, FBZ, or
image source remains byte-for-byte unchanged.

OCR tasks use a bounded one-to-four worker queue with page selection, pause,
resume, cancellation, retry, checkpoints, and restart recovery. Sidecar and
task stores use the application data boundary and safe atomic JSON writes. A
selectable text-layer component renders OCR text as a transparent overlay and
does not flatten or rewrite the page image.

Model packs are explicitly installed from local files. Their manifests record
the checksum, license, supported languages, runtime, compatible engine, and
CPU-fallback capability. BabelLeaf does not download OCR models automatically,
send page images or OCR text to a cloud OCR service, or place model bytes on
the startup path. Missing models, incompatible runtimes, malformed pages, and
resource limits produce direct diagnostics. The release gate also requires
matching engine/model identity, verified license and checksum evidence, target
platform benchmark evidence, and approved page-time and peak-memory budgets.

## 0.4.1 delivered comic translation workspace

Version 0.4.1 adds a separate `babelleaf.comic-workspace` sidecar. Machine OCR
regions and manual corrections are independent revisions. Region creation,
polygon/text/language/orientation correction, ordering, split, merge, delete,
restore, approval, and rollback preserve the imported page. OCR reruns update
machine data while keeping manual and approved edits; changed source text marks
existing translations stale for review.

Translation is still explicitly user-triggered. A single effective region is
sent through an existing named provider adapter and the workspace stores only
the source revision, target language, provider/model provenance, machine text,
review state, and optional overlay style. API keys, arbitrary endpoints, page
bytes, and automatic background requests are prohibited in the workspace.

The following end-user features remain outside the delivered 0.4.1 scope:

- manual prompt editing and arbitrary endpoint/model fields;
- automatic background translation;
- production OCR runtime/model distribution until the engine gate passes;
- image cleanup, inpainting, typesetting, and translated image export.

Those features require separate data models, bounded queues, progress and
cancellation UX, local result storage, and platform validation before release.

## Roadmap authority

The implementation and acceptance sequence for the remaining translation,
comic, platform, and stable-release work is defined in
[`DEVELOPMENT_ROADMAP.md`](DEVELOPMENT_ROADMAP.md). Provider or translation
scope changes must update both documents in the same change.
