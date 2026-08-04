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

## 0.3 delivered batch workflow

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

The following end-user features remain out of scope for the 0.3 release:

- manual prompt editing and arbitrary endpoint/model fields;
- automatic background translation;
- glossary editing screens and a full interactive review workspace;
- scanned-PDF OCR translation and comic text detection, cleanup, and
  typesetting.

Those features require separate data models, bounded queues, progress and
cancellation UX, local result storage, and platform validation before release.
