# BabelLeaf authoritative development roadmap

## Document status

- Status: authoritative project roadmap
- Current implementation baseline: `v0.4.0` OCR foundation at main merge commit `f82a7de0d`
- Roadmap revision: 3
- Approved scope date: 2026-08-04
- Last closure update: 2026-08-07
- Target stable release: `1.0.0`

This document is the source of truth for BabelLeaf version planning, implementation sequencing, code review, and release acceptance. Release notes record what a version actually delivered; this roadmap records what must be delivered before work advances to the next version.

Any approved scope change must update this document, the affected requirements or architecture document, and the future-version table in the same change. A version number alone is not evidence of completion. Completion requires every mandatory acceptance item for that version.

## Product destination

BabelLeaf 1.0 is an open-source, local-first, cross-platform reader for Simplified Chinese users reading primarily Chinese, English, and Japanese material. It must provide:

- local import and reading of novels, books, PDFs, text documents, and comics;
- reliable EPUB, PDF, MOBI/AZW/AZW3, FB2, CBZ/ZIP, TXT, and Markdown handling, with explicit diagnostics for unsupported, encrypted, DRM-protected, empty, or image-only content;
- selection, sentence, paragraph, chapter, and full-book translation initiated by the user;
- named DeepSeek V4, OpenAI, Anthropic Claude, and local Ollama adapters, with application-owned prompts and official endpoints so cloud users enter only an API key;
- original, translated, stacked bilingual, and side-by-side bilingual reading modes;
- durable local sidecars, terminology, translation memory, retryable jobs, and human review without rewriting the source book;
- imported local dictionaries, word lookup, and platform-native or local text-to-speech;
- local comic and scanned-page OCR, editable regions, translation, erasing, inpainting, typesetting, and export of a separate translated copy;
- supported Windows, macOS, Android, and iOS/iPadOS packages using a shared application core and platform adapters;
- bounded memory, CPU, disk, network, and model usage, with optional heavy features absent from the startup path;
- reproducible packaging, data migration, privacy, security, license, and release verification.

## Active product boundary

The following rules apply to every planned version:

1. Reading content is imported from local files selected by the user.
2. Opening, importing, reading, searching, looking up a local dictionary entry, or using local speech must not transmit book content.
3. External network traffic is limited to a translation request explicitly started by the user and sent through a named provider adapter, or to a user-configured loopback Ollama service.
4. Cloud provider endpoints and default model identifiers are controlled and release-verified by BabelLeaf. Arbitrary remote endpoints, arbitrary model fields, and editable product prompts are not part of the product.
5. Source books remain byte-for-byte unchanged. Translations, OCR data, review state, masks, and layout are stored in versioned local sidecars. Export creates a separate file.
6. BabelLeaf does not remove DRM and does not include or facilitate unlicensed content acquisition.
7. Accounts, cloud synchronization, telemetry, remote crash reporting, online catalogs, web scraping, Z-Library integration, web clipping, online dictionaries, cloud TTS, and automatic background translation are not current development goals.

Adding any excluded network capability requires an explicit product decision and a prior update to `NETWORK_POLICY.md`, privacy documentation, native capabilities, threat model, and release traffic-capture tests. It cannot enter through an incidental dependency or upstream merge.

## Engineering principles

### One product and replaceable engines

BabelLeaf owns one library, reader, settings system, task model, sidecar schema, and review interface. Complete external applications are not combined into the user interface. Parsers, OCR engines, inference runtimes, and image processors connect through narrow, versioned adapters or a local worker protocol.

### Shared core and platform boundaries

- Cross-platform reading, translation, sidecar, queue, and review behavior belongs in TypeScript or portable Rust.
- File access, secure credential storage, speech, document pickers, background execution, platform dictionaries, signing, and operating-system integration stay behind typed Tauri or `AppService` boundaries.
- Desktop-only paths, process assumptions, shell tools, and Python runtimes must not leak into shared mobile code.
- A desktop worker may be used during evaluation, but mobile viability must be decided through a separate adapter and measured before it becomes a product dependency.

### Resource discipline

- Heavy parsers, dictionaries, speech engines, OCR, and inpainting models load only when required.
- Optional model packs are separately downloadable, versioned, checksummed, licensed, and removable.
- Page decoding, archive access, PDF rendering, and batch jobs use streaming, paging, range access, or bounded chunks where practical.
- Queues, retries, caches, image dimensions, archive entries, decompression, worker counts, and request sizes have explicit limits.
- Workers release memory and native resources deterministically and shut down after a bounded idle period.
- The base installer must not include a general Python runtime unless measurement proves that no smaller portable implementation meets the requirement and the exception is explicitly approved.
- Unused inherited services, routes, dependencies, feature flags, assets, and platform capabilities must be removed rather than merely hidden, provided that migration and required upstream notices are preserved.

### Untrusted document handling

EPUB HTML, CSS, SVG, archives, PDFs, images, fonts, dictionaries, and imported sidecars are untrusted input. Each parser must enforce traversal, decompression, allocation, entry-count, size, remote-subresource, schema, and content-sanitization limits. Malformed input must fail with a direct diagnostic instead of partially modifying user data.

## Current baseline and requirement coverage

| Requirement | Current state at 0.4.0 | Remaining milestone |
| --- | --- | --- |
| Local library and reader | Implemented from the Readest baseline | Format and platform matrix hardened through 0.8 |
| EPUB, PDF, MOBI/AZW/AZW3, FB2, CBZ/ZIP, TXT, Markdown | Parsing/rendering paths exist; 0.3.2 fixture, resource-limit, PDF diagnostics, and 0.4.0 OCR source routing are tracked; not every variant is guaranteed | Image pipeline in 0.4.1-0.4.3, cross-platform proof in 0.8 |
| Selection and viewport translation | Implemented | Provider UX hardening and platform validation through 0.8 |
| Chapter and full-book translation | Persistent bounded queue, recovery dashboard, retry, review, stable anchors, and interchange delivered | Stress and platform portability through 0.8 |
| DeepSeek V4, OpenAI, Claude, Ollama | Named adapter framework delivered | Release-time endpoint/model verification and platform validation through 0.8 |
| Bilingual reading and sidecar | Aligned layouts, layout-independent anchors, portable sidecar, machine-result retention, and review recovery delivered | Migration and cross-platform portability through 0.8 |
| Glossary and translation memory | Runtime enforcement plus validated management, limits, invalidation visibility, and JSON/TSV/TBX/TMX interchange delivered | Cross-platform migration and validation through 0.8 |
| Human review | Full review workspace with edit, approve, revert, status filters, provenance, keyboard paging, autosaved drafts, recovery, and JSON/TSV/XLIFF interchange delivered | Cross-format alignment and platform validation through 0.8 |
| Comic worker boundary | Versioned protocol, capability discovery, limits, cancellation, provenance, mock adapter, OCR sidecar, bounded queue, model manifest, and selectable text-layer primitive delivered | Production OCR engine/model selection and image pipeline in 0.4.x |
| Performance and resource controls | 0.3.2 budgets plus 0.4.0 OCR page-time and peak-memory budgets are tracked | Measured gates and optimization through 0.9 |
| Local dictionaries and word lookup | Baseline capability exists | Simplified-Chinese UX and native platform validation in 0.5-0.8 |
| Local or native speech | Baseline capability exists | Queue, language/voice selection, accessibility, and native validation in 0.5-0.8 |
| Scanned PDF and comic OCR | Local sidecar, task recovery, model-manifest, diagnostics, and selectable text-layer foundation delivered; a production OCR engine/model pack is not bundled | Production engine selection and quality gate, then 0.4.1-0.4.3 |
| Comic translation and editable overlays | Not implemented | 0.4.1 |
| Erasing, inpainting, typesetting, translated export | Not implemented | 0.4.2-0.4.3 |
| Windows production reliability | Unsigned package and isolated NSIS smoke verification exist | Signing and 1.0 release qualification in 0.9-1.0 |
| macOS | Shared source structure only | 0.5.0 |
| Android | Generated platform structure only | 0.6.0 |
| iOS/iPadOS | Generated platform structure only | 0.7.0 |
| Cross-platform feature parity | Not established | 0.8.0 |
| Stable release governance | Partial CI and release checks exist | 0.9.0-1.0.0 |

## Version sequence

| Version | Phase | Mandatory outcome |
| --- | --- | --- |
| 0.3.1 | Text translation productization | Glossary, memory, review, and job management become complete end-user workflows |
| 0.3.2 | Text interoperability and comic readiness | Format matrix, interchange, anchors, worker protocol, benchmark, and license decisions are frozen |
| 0.4.0 | OCR foundation | Sidecar, worker, model-manifest, bounded task, diagnostics, and selectable text-layer contracts are delivered; production OCR engine selection remains a gate before the comic workspace |
| 0.4.1 | Comic translation workspace | Regions can be corrected, translated, reviewed, and displayed as editable bilingual overlays |
| 0.4.2 | Image cleanup and typesetting | Text can be erased, repaired, typeset, and exported to a separate translated copy |
| 0.4.3 | Image pipeline stabilization | The complete comic workflow becomes recoverable, bounded, documented, and release-tested |
| 0.5.0 | macOS and portable-core qualification | macOS ships natively and desktop assumptions are removed from the shared core |
| 0.6.0 | Android | Android imports, reads, translates, looks up, speaks, and persists supported local content |
| 0.7.0 | iOS/iPadOS | iOS and iPadOS meet equivalent native import, reading, translation, speech, and persistence requirements |
| 0.8.0 | Cross-platform parity | Core reading and translation behavior, sidecars, dictionaries, speech, accessibility, and migration are consistent across all targets |
| 0.9.0 | Release candidate | Performance, security, privacy, packaging, migration, recovery, licenses, and documentation pass release gates |
| 1.0.0 | Stable completion | All stated product goals and platform acceptance matrices pass on signed production packages |

Work must follow this sequence unless the roadmap is explicitly revised. A later version may be researched in parallel, but implementation cannot bypass an unresolved mandatory gate in the preceding version.

## 0.3.1 - Text translation productization

### Scope

- Add glossary management with create, edit, delete, search, filter, validation, versioning, conflict reporting, and safe import/export.
- Add translation-memory inspection, statistics, deletion, storage limits, and invalidation visibility.
- Add a complete review workspace showing source, machine translation, edited text, status, locator, provider provenance, and glossary version.
- Support edit, revert, approve, keyboard navigation, status filtering, autosave, and recovery of interrupted edits.
- Add a persistent batch dashboard with progress, pause, resume, cancel, retry, failure details, recovered-state indicators, history, and bounded cleanup.
- Complete API-key-only provider setup, direct validation messages, cancellation, timeout, redirect, rate-limit, and provider failure handling.
- Preserve the one-action workflow: after provider setup, invoking translation on selected text submits the application-owned instruction immediately and displays the result without asking the user for a prompt, model, or endpoint.
- Reconcile README, requirements, settings help, and release notes with the features already delivered in 0.3.0.

### Open-source assistance

- Use OmegaT as a workflow and fixture reference for terminology, translation memory, fuzzy-match presentation, and review status.
- Use Translate Toolkit as an external compatibility and validation reference for translation interchange formats.
- Do not embed the complete Java OmegaT application or a general Python localization runtime in BabelLeaf.

### Acceptance

- Closing and reopening a book restores every job, segment, edit, review state, glossary version, and translation-memory association.
- Retrying failed items does not resend completed items unless the user explicitly invalidates them.
- No source book, API key, `.env` value, or credential is written to a sidecar, log, diagnostic, test artifact, or repository file.
- No network request occurs until the user explicitly starts translation.
- Existing 0.2 and 0.3 sidecars remain readable or are migrated with a tested rollback-safe path.
- All release checks defined below pass before 0.3.2 implementation begins.

## 0.3.2 - Text interoperability and comic readiness

### Scope

- Add versioned JSON/TSV interchange for glossary and review data; add TMX/TBX support only after round-trip fixtures prove stable semantics.
- Stabilize anchors for original, translated, stacked, and side-by-side layouts across reopen, pagination, font, line-height, writing-mode, and window-size changes.
- Establish legal DRM-free fixtures for EPUB, text-layer PDF, scanned PDF, MOBI, AZW, AZW3, FB2, CBZ, TXT, and Markdown, including malformed and oversized cases.
- Distinguish text-layer, mixed, and image-only PDFs and route them without silent fallback.
- Freeze the versioned comic-worker protocol, capability discovery, progress, cancellation, error, resource-limit, and sidecar contracts.
- Benchmark candidate detection, OCR, inpainting, inference, and typesetting components on the same legally obtained Chinese, English, and Japanese sample set.
- Create a measured performance baseline covering cold startup, idle memory, import, page turn, search, chapter translation, full-book queue, model load, OCR page time, peak memory, disk cache, and package size.
- Record every selected code revision, software license, model license, weight source, font license, checksum, and modification in the upstream inventory.

### Acceptance

- Interchange formats pass deterministic round-trip and hostile-input validation.
- Every declared format has at least one valid, malformed, empty/image-only where applicable, and unsupported/encrypted diagnostic fixture.
- The worker protocol can swap a mock OCR engine without reader or sidecar changes.
- One primary OCR/detection route and one fallback route are selected from measured results; evaluation alone does not make a candidate a dependency.
- Performance budgets are recorded in a tracked document and become gates for all later releases.

## 0.4.0 - OCR foundation

### Scope

- Add local processing for CBZ/ZIP pages, image folders where the platform grants access, and image-only or mixed scanned PDF pages.
- Detect text regions and reading order and recognize Chinese, English, and Japanese text, including vertical Japanese and optional ruby metadata where the engine provides it.
- Store page identity, source dimensions, polygons, orientation, language, OCR text, confidence, reading order, engine/model provenance, and errors in the versioned sidecar.
- Render a selectable local text layer without modifying the page image.
- Add page, range, chapter/archive task selection with bounded workers, pause, resume, cancel, retry, checkpoints, and restart recovery.
- Load OCR models on demand and provide CPU fallback and explicit unsupported-device diagnostics.

### Preferred implementation candidates

- PaddleOCR for multilingual detection and recognition benchmarking.
- manga-ocr for Japanese manga recognition quality benchmarking.
- manga-ocr-rs as an experimental Rust/ONNX path where its accuracy, model provenance, and platform support pass the same tests.
- ONNX Runtime as the preferred cross-platform inference abstraction when the selected models are compatible.
- OpenCV for bounded preprocessing, geometry, masks, and non-model image operations.
- Comic Translate, BallonsTranslator, manga-image-translator, comic-text-detector, and mokuro as pipeline, interaction, and benchmark references. Direct code or worker use requires a separate revision and license decision.

### Acceptance

- A closed and reopened comic or scanned PDF restores the same regions, ordering, OCR text, confidence, and task status.
- OCR is fully local after an explicitly installed model pack; no page image or OCR text is sent to a cloud OCR service.
- Cancelled and failed jobs leave valid recoverable sidecars and no orphaned temporary files.
- Peak memory, worker count, page dimensions, archive expansion, and cache size remain within the approved 0.3.2 budgets.
- Source archives, PDFs, and images remain byte-for-byte unchanged.

### Foundation checkpoint status

The 0.4.0 implementation closes the sidecar, worker, model-manifest,
diagnostic, bounded-task, recovery, and selectable-text-layer foundation. It
does not bundle a production OCR runtime or model weights. The measured engine
and model selection gate therefore remains open; 0.4.1 implementation must
close that gate before it is accepted as a complete comic OCR workflow.

## 0.4.1 - Comic translation workspace

### Scope

- Add region selection, creation, deletion, split, merge, resize, rotation, reorder, source-language correction, OCR correction, and reading-order editing.
- Reuse the existing named-provider adapters, queue, terminology, translation memory, artifact provenance, cancellation, retry, and review states.
- Support page-context translation while displaying exactly what text will be sent and enforcing bounded context limits.
- Provide original, OCR text, translation, and bilingual overlay modes.
- Persist manual corrections independently from machine-generated OCR so rerunning an engine does not silently destroy edits.
- Provide undo, redo, autosave, crash recovery, keyboard/mouse workflows on desktop, and touch-ready interaction contracts for later mobile work.

### Acceptance

- Every manual region, OCR, translation, and review edit survives navigation and restart.
- Rerunning OCR or translation produces a reviewable revision and never silently overwrites approved user edits.
- Translation requests remain explicit and sidecars remain credential-free.
- The full text translation regression suite passes unchanged, proving that comic support reuses rather than duplicates the translation core.

## 0.4.2 - Image cleanup, typesetting, and export

### Scope

- Generate and edit text masks with brush, erase, restore, feather, expand, and region-level controls.
- Provide deterministic non-model cleanup and an optional local inpainting model behind the same worker protocol.
- Add translated text boxes with font, size, color, outline, alignment, spacing, rotation, writing direction, vertical CJK, RTL, overflow, fit, and style controls.
- Keep the live editable layer in the sidecar and render previews without flattening the source.
- Export a separate translated image set, CBZ/ZIP, or supported PDF copy; never overwrite the imported source.
- Preserve or explicitly report unsupported color profiles, transparency, animation, page metadata, and image formats.

### Preferred implementation candidates

- OpenCV for mask processing, geometry, and deterministic cleanup.
- LaMa or a measured successor for optional local inpainting, subject to separate model-license and redistribution review.
- Browser CSS/SVG/canvas for the editable preview layer.
- HarfBuzz/rustybuzz or an equivalent portable shaper for deterministic export only after vertical CJK, ruby, RTL, font fallback, and platform parity benchmarks pass.
- BallonsTranslator, Comic Translate, manga-image-translator, and Koharu as behavior and editor references rather than combined application baselines.

### Acceptance

- A complex page can be corrected, translated, cleaned, typeset, undone, redone, reopened, and exported without losing editable state.
- Exported output matches the sidecar layout within documented renderer tolerances.
- Missing fonts, unsupported glyphs, excessive text, failed inpainting, and low-confidence OCR produce visible diagnostics.
- Optional models are absent from the base startup path and can be installed, verified, updated, unloaded, and removed independently.

## 0.4.3 - Image pipeline stabilization

### Scope

- Complete batch archive/scanned-PDF progress, recovery, revision history, selective rerun, cache cleanup, and export validation.
- Add representative manga, webtoon, western-comic, grayscale, color, low-resolution, vertical-text, mixed-language, and large-page fixtures.
- Harden image decoders, archive limits, PDF page extraction, temporary storage, worker crashes, model incompatibility, and out-of-memory behavior.
- Document model installation, disk use, CPU/GPU behavior, privacy, licenses, troubleshooting, and quality limitations.
- Remove experimental engines and code paths that were not selected.

### Acceptance

- The complete OCR-to-export workflow passes a restart and crash-recovery test without modifying source data.
- Exact Windows packages pass install, model install, launch, processing, export, model removal, uninstall, and application-data retention tests.
- The selected worker and models meet recorded resource budgets on the minimum supported Windows hardware class.
- All unused experimental runtime dependencies are removed before release closure.

## 0.5.0 - macOS and portable-core qualification

### Scope

- Build and run the native macOS package on supported Intel and Apple Silicon targets as applicable to the chosen Tauri/toolchain support policy.
- Implement sandbox-safe import, persisted file access, open-with/file associations, secure API-key storage, local dictionaries, native speech, clipboard, menus, shortcuts, window restoration, and sidecar storage.
- Validate translation, OCR, optional model installation, worker lifecycle, and export under macOS signing and sandbox constraints.
- Remove remaining Windows path, registry, process, installer, WebView, and filesystem assumptions from shared code.
- Produce signed and notarized release-candidate packages and verify install, first launch, upgrade, uninstall, and user-data retention.

### Acceptance

- Windows remains regression-clean while macOS passes the same functional data and network contracts.
- A sidecar exported on Windows opens with equivalent anchors, edits, terminology, review state, and comic regions on macOS.
- Native package, signing, notarization, sandbox permissions, privacy declarations, secure storage, speech, dictionary, and file access pass on physical target hardware.
- Source inspection is not accepted as a substitute for native builds and runtime tests.

## 0.6.0 - Android

### Scope

- Implement Android document picker, open-with/share target where appropriate, scoped storage, persisted URI access, application-data storage, secure credentials, and migration.
- Adapt library import, reading, search, annotations, selection translation, bilingual layouts, local dictionaries, TTS, and sidecars for touch, lifecycle, rotation, process death, and limited memory.
- Adapt OCR and comic overlays to device capabilities; optional inpainting and high-cost export may be disabled with a direct capability explanation on unsupported devices.
- Implement bounded foreground/background task behavior consistent with Android platform restrictions and require explicit user-created translation/OCR jobs.
- Produce signed test packages and exercise supported physical-device/API-level classes.

### Acceptance

- Import, reopen after process death, reading progress, annotations, translation, dictionary lookup, speech, sidecar import/export, and application upgrade pass on physical devices.
- The application remains usable without OCR models installed and does not download models automatically.
- Low-memory, storage-revocation, URI-revocation, network loss, cancellation, thermal throttling, and interrupted-upgrade cases fail safely.
- Android network capture matches the same local-first policy as desktop.

## 0.7.0 - iOS and iPadOS

### Scope

- Implement Document Picker, security-scoped file access/bookmarks, app sandbox storage, Keychain credentials, local import/export, and migration.
- Adapt reader, bilingual layouts, selection, annotations, dictionary integration where platform APIs permit it, native speech, accessibility, multitasking, rotation, and iPad split layouts.
- Adapt OCR and comic overlays through an approved ONNX/Core ML/native path with measured package, memory, thermal, and battery behavior.
- Design around iOS background-execution limits; no job may imply guaranteed unattended execution when the platform cannot provide it.
- Produce signed device builds and TestFlight-ready packages with required privacy manifests and disclosures.

### Acceptance

- Local import, reopen, progress, annotations, translation, speech, sidecars, upgrade, and recovery pass on physical iPhone and iPad classes in the support matrix.
- Security-scoped access revocation, memory pressure, interruption, app termination, model absence, and export errors preserve valid user data.
- App Store privacy declarations and runtime traffic capture match actual behavior.

## 0.8.0 - Cross-platform feature parity

### Scope

- Establish one declared feature and format matrix for Windows, macOS, Android, and iOS/iPadOS, identifying only justified platform exceptions.
- Complete source/translation anchors across pagination, scrolling, font changes, writing modes, screen sizes, touch and keyboard input.
- Complete Simplified-Chinese product text and test English/Japanese source rendering, vertical text, ruby, punctuation, fallback fonts, and mixed scripts.
- Complete local dictionary import/management and platform dictionary adapters with explicit availability diagnostics.
- Complete speech language detection, voice selection, sentence/paragraph progression, pause/resume, screen-off/audio-session handling where allowed, and accessibility integration.
- Add local backup/export/import for settings, sidecars, glossaries, translation memory, and review data without creating cloud synchronization.
- Verify sidecar schema migration and portability in every platform direction.

### Acceptance

- The same legal fixture library passes the declared format and behavior matrix on every target platform.
- Sidecars and backups round-trip across all platforms without losing anchors, edits, review states, OCR regions, masks, or typesetting.
- Keyboard, touch, screen reader, high contrast, reduced motion, dynamic text, and focus-navigation tests pass where supported.
- Every platform exception is documented with a technical reason and user-facing diagnostic.

## 0.9.0 - Release candidate

### Scope

- Freeze feature scope and complete performance optimization, unused upstream removal, bundle analysis, lazy loading, cache eviction, worker shutdown, database maintenance, and leak testing.
- Complete migrations from all published BabelLeaf versions and supported Readest-origin local data without colliding with Readest identities.
- Add crash recovery, corruption detection, backup guidance, atomic writes, storage-full handling, and rollback-safe schema migrations.
- Complete hostile-document, archive, sidecar, redirect, credential, CSP, native-capability, and supply-chain security tests.
- Generate dependency and asset notices, SBOMs, checksums, corresponding-source instructions, model manifests, privacy documentation, and reproducible build records.
- Capture clean-profile traffic for startup, import, reading, search, dictionary, speech, translation, OCR, export, and shutdown on every target.
- Produce signed release-candidate packages and complete install, launch, upgrade, rollback where supported, uninstall, and user-data retention tests.

### Acceptance

- No open release-blocking P0 or P1 defect remains.
- All performance budgets pass on declared minimum hardware/device classes or an explicit roadmap revision approves a measured change.
- Every bundled or downloadable component has recorded provenance, license, checksum, update policy, and removal behavior.
- All CI, native runtime, package, privacy, security, accessibility, migration, and recovery gates are green on the exact release candidates.

## 1.0.0 - Stable completion

### Scope

- Correct only release-blocking defects found in 0.9.0; do not add new product features.
- Publish final Windows, macOS, Android, and iOS/iPadOS packages through their approved signing and distribution routes.
- Publish complete user, privacy, security, troubleshooting, migration, data-location, backup, model, license, and source-build documentation.
- Tag and archive the verified source, lock files, submodules, notices, SBOMs, checksums, build logs, and release evidence.

### Final acceptance definition

BabelLeaf 1.0 is complete only when all of the following are true:

- all product-destination capabilities in this document are implemented or are listed as an explicitly approved platform exception;
- all supported local formats pass the legal fixture matrix and unsupported/DRM cases fail explicitly;
- text and comic translation preserve the source, store durable local data, and make external requests only after explicit user action;
- DeepSeek V4, OpenAI, Claude, and Ollama adapters pass current endpoint, credential, cancellation, error, and privacy tests;
- bilingual layouts, terminology, translation memory, review, dictionaries, and speech pass the cross-platform matrix;
- OCR, region editing, image cleanup, typesetting, and translated export pass quality, recovery, and resource gates;
- Windows, macOS, Android, and iOS/iPadOS packages are built and exercised natively on the supported target matrix;
- no release-blocking defect, prohibited network behavior, credential leak, source mutation, missing license obligation, or unbounded critical resource path remains;
- signed packages pass install, first launch, upgrade, normal use, shutdown, uninstall, and user-data retention verification;
- the tagged commit, release notes, roadmap status, documentation, and published artifacts agree.

## Open-source reuse plan

| Capability | Preferred source of assistance | Integration policy |
| --- | --- | --- |
| Reader and formats | Readest, foliate-js, PDF.js, js-mdict | Continue the current pinned baseline and update selectively after regression and license review |
| Translation workflow and interchange | OmegaT, Translate Toolkit | Use behavior, schemas, fixtures, and external validation; avoid embedding complete Java/Python applications |
| Multilingual OCR | PaddleOCR | Benchmark detection and recognition; integrate through a replaceable adapter or exported portable model only after license/model review |
| Japanese manga OCR | manga-ocr, manga-ocr-rs | Benchmark accuracy and portability; select by measured result rather than repository popularity |
| Cross-platform inference | ONNX Runtime | Preferred abstraction when compatible with selected models and target package budgets |
| Image processing | OpenCV | Use bounded native operations behind the worker protocol |
| Inpainting | LaMa or a measured successor | Optional downloadable model; code and weights reviewed separately |
| Comic end-to-end behavior | Comic Translate, BallonsTranslator, manga-image-translator | Benchmark and architecture/editor reference; do not merge multiple complete applications |
| Selectable comic text | mokuro | Sidecar and overlay reference |
| Comic reading UX | YACReader, KOReader | Navigation, RTL, double-page, zoom, touch, and library reference only unless a specific component is separately approved |
| Text shaping/export | HarfBuzz/rustybuzz | Evaluate for deterministic portable export after vertical CJK and RTL tests |
| Format conversion reference | calibre | Reference and fixtures only; do not embed the complete application |

An upstream project is not approved merely because it is open source. Before use, BabelLeaf must verify the exact revision, software license, transitive dependencies, model and data licenses, distribution duties, runtime cost, maintenance state, and platform viability. A separate process is not automatically outside copyleft or corresponding-source obligations.

## Test and review gates for every version

The exact commands may evolve, but equivalent coverage is mandatory:

1. Frontend unit and service tests.
2. Browser and reader integration tests.
3. TypeScript type checking, lint, formatting, and production build.
4. Rust formatting, Clippy, unit, integration, and Tauri tests.
5. Format, sidecar, migration, hostile-input, network-policy, and credential tests relevant to the version.
6. Performance and resource comparisons against the approved baseline.
7. Manual code review of all version changes, including error paths, cleanup, concurrency, persistence, security, privacy, and licensing.
8. Required GitHub branch checks with no ignored unexplained failure.
9. Native build and runtime validation on every platform affected by the version.
10. Installation, responsive launch, upgrade where applicable, uninstall, and user-data retention using the exact release candidate.

Documentation-only changes require at minimum link validation, formatting/diff checks, and review against current repository truth. They do not require an unrelated full binary release unless they close a version.

## Mandatory version-closure procedure

For every version, including patch versions:

1. Freeze scope and map every change to this roadmap and the version release document.
2. Run the complete applicable test and native package matrix.
3. Review all changed code, generated artifacts, dependency changes, licenses, and unresolved defects.
4. Verify the exact release candidate's install, launch, primary workflows, shutdown, uninstall, and user-data retention behavior.
5. Commit and tag the verified release state.
6. Merge the reviewed release branch into the repository's primary `main` branch.
7. Push the verified `main`, tag, and required release evidence to the remote repository.
8. Confirm remote checks and branch state, then remove obsolete merged branches.
9. Only after the remote backup is confirmed, remove bounded reproducible caches and generated build/test output.
10. Confirm a clean worktree. Preserve source files, `.env`, credentials, imported books, sidecars, user data, and any non-reproducible evidence unless their owner explicitly authorizes removal.

No work may be declared complete because a build command alone succeeded. Packaging and runtime verification are independent release gates.

## Roadmap governance

- The next implementation target after the 0.4.0 foundation checkpoint is 0.4.1,
  subject to the production OCR engine/model gate and release acceptance.
- Development must stop at each version boundary for review and acceptance before entering the next version unless the user explicitly authorizes continuous work through named versions.
- P0 and P1 defects found in review belong to the current version and must be resolved before the next version begins.
- Research spikes may occur ahead of schedule only in disposable branches or ignored evaluation directories and may not become production dependencies without the milestone's selection gate.
- A feature is not complete until implementation, tests, documentation, data migration, performance, privacy, license, package, and native-platform requirements relevant to it all pass.
- Release notes must update the current-state table in this roadmap when a milestone closes.
- The remote `main` branch must require the applicable CI checks and reviewed changes before merge; a temporary protection exception must be documented and removed before release closure.
