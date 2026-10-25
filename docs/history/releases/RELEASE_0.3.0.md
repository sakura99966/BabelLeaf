# BabelLeaf 0.3.0

## Release purpose

0.3.0 extends the local-first translation workbench from a single in-memory
run to a resumable batch workflow. The original EPUB, PDF, MOBI/AZW, FB2,
CBZ, TXT, or Markdown file is never rewritten.

## Implemented scope

- Chapter and full-book jobs use a bounded queue with one-to-four workers.
- Each item records attempts, failure details, and a maximum retry budget.
- Running jobs are persisted under application `Data/translation-jobs`; a
  restart recovers the last running item as pending and resumes only after the
  user starts the job again.
- Failed items can be retried without re-translating completed segments.
- Translation artifacts remain the durable sidecar record and retain the
  source text, locator, status, and review result.
- A local glossary protects configured source terms during API requests and
  restores the configured target spelling in the result.
- A local translation memory is keyed by source text, language direction,
  provider/model, and glossary version. It is bounded and persisted under
  application `Data/translation-memory`.
- Human review can replace a translated segment and mark it `reviewed`.
- Format diagnostics distinguish supported text, empty/image-only content,
  unsupported formats, and DRM/encrypted input.
- The format matrix covers EPUB, PDF, MOBI, AZW, AZW3, FB2, CBZ, TXT, and
  Markdown. CBZ/FBZ remain explicitly image-only until the 0.4 OCR worker.

## Data and network boundaries

- API requests occur only after the user starts or retries a job.
- API keys and `.env` files are not read by the new local stores and are not
  written to artifacts, jobs, glossaries, memory, or sidecars.
- All translation data is stored in application data; the source book remains
  byte-for-byte unchanged.

## Verification

- 348 frontend unit test files pass: 4,632 tests with one existing skip.
- 24 browser test files pass: 313 tests with one existing skip.
- Translator queue, job persistence, glossary, memory, artifact review, and
  format-matrix tests pass.
- TypeScript, Biome format/lint, production build-output checks, Rust format,
  Clippy, and 50 Rust library tests pass.
- Tauri WebDriver integration tests pass on Windows when run through Git Bash.
- The x64 NSIS smoke installer embeds the offline WebView2 installer and
  passes install, launch, uninstall, and user-data retention validation in an
  isolated profile.

## Deferred scope

- OCR, comic text detection, erasing, inpainting, and typesetting remain 0.4.
- Full human review editing UI, terminology management screens, and batch
  queue dashboards beyond the workbench controls remain follow-up work.
- Network resource search, scraping, synchronization, and account services
  remain outside this local-first release.
