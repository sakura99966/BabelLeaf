# BabelLeaf 0.2.1

## Release purpose

Version 0.2.1 closes the 0.2 text-translation workflow by making the
bilingual workbench position durable and reader-navigable while preserving the
original book file.

## Completed acceptance items

- Bilingual workbench pages are logical segment pages, so text reflow from font
  or layout changes does not invalidate the saved page.
- The last bilingual page is persisted in the per-book view configuration and
  restored when the book and workbench are reopened.
- Each translated segment retains a stable segment ID and source locator.
- The workbench exposes a source-location action that navigates the reader to
  the segment's EPUB CFI section when available.
- Real `sample-alice.epub` and `sample-alice.txt` fixtures are extracted by the
  same translation pipeline used by the reader.
- Windows installer preflight, installation, startup, uninstall, and user-data
  preservation remain mandatory release-candidate checks.

## Verification

- Frontend format check and TypeScript/Biome lint pass.
- Translation workbench and real EPUB/TXT extraction tests pass.
- Full frontend Vitest suite passes with the 0.2.1 regression coverage (343
  files, 4,609 passed, 1 skipped).
- `cargo test -p Readest --lib --offline` passes (50 tests), the scoped Readest
  Rust format check passes, and `cargo clippy -p Readest --no-deps --offline
  --locked -- -D warnings` passes.
- The 0.2.1 frontend production build, installer preflight, and isolated
  Windows installation/startup/uninstall/data-preservation smoke test pass.

## Remaining owner-only release gate

The tracked local `apps/readest-app/.env` file is intentionally excluded from
automation because it may contain credentials. Its existing deletion-only
change must be reviewed and committed by the repository owner after confirming
that it removes only legacy online-service configuration. Until that review is
complete, the repository cannot be declared fully clean.

## Deferred to 0.3

- Translation memory, glossary enforcement, and interactive human review.
- A complete multi-format (PDF, MOBI/AZW, FB2, CBZ, Markdown) translation
  matrix and explicit DRM/unsupported-format diagnostics.
- Comic OCR, region editing, inpainting, and translated typesetting.
