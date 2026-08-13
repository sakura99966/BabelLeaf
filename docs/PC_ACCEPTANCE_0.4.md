# BabelLeaf 0.4 PC acceptance baseline

This document defines the Windows desktop baseline that must be satisfied
before 0.4 can be accepted. It is not, by itself, a statement that the current
candidate has passed. The authoritative current verdict is recorded in
`DEVELOPMENT_ROADMAP.md` and
`PC_0.4_FINAL_AUTOMATED_ACCEPTANCE_2026-08-13.md`. The older
`PC_0.4_REMEDIATION_STATUS_2026-08-09.md` is a historical corrective ledger.
Later milestones are platform ports and native parity work; they must not
remove or weaken this desktop baseline.

## Required PC capabilities

- Import and read local EPUB, PDF, MOBI/AZW/AZW3, FB2/FBZ, CBZ/ZIP, TXT, and
  Markdown files without modifying the source bytes.
- Translate selected text, reading units, chapters, and books through the
  named DeepSeek V4, OpenAI, Anthropic Claude, or loopback Ollama adapters.
  The application owns the prompt and endpoint; a request starts only after an
  explicit user action.
- Restore translation jobs, sidecars, glossary, translation memory, review
  state, bilingual alignment, dictionary data, and speech settings after a
  restart. Credentials are stored only by the secure credential boundary.
- Open the comic workspace from a fixed-layout reader, import local images,
  CBZ/FBZ pages, or rasterized pages from a local PDF, import an OCR sidecar,
  correct or create regions, translate a selected region, save deterministic
  erase masks, typeset text, and export a separate CBZ or image-only PDF.
- Import, verify, list, and remove a local OCR model pack from AI settings.
  No model, page image, or OCR text is fetched or uploaded implicitly.
- Reject malformed, oversized, encrypted/DRM, unsupported, source-overwriting,
  and credential-bearing artifacts with a direct diagnostic.

## Release evidence

Every 0.4 release candidate must pass the complete frontend unit and browser
suites, TypeScript/lint/format checks, production build, Rust format/clippy and
offline tests, Windows NSIS build, and isolated install/start/uninstall/data
retention smoke tests. The exact package tested must be the exact package
tagged and pushed to `main`.

The OCR engine remains replaceable. A production model may be distributed only
after its local license, checksum, language/capability, platform benchmark,
and resource evidence are recorded. Imported OCR sidecars and manual region
editing remain valid without a bundled model.
