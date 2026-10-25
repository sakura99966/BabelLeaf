# BabelLeaf 0.4 PC full verification and remediation specification

## 0. Audit control record

- Audit date: 2026-08-09, Asia/Hong_Kong.
- Audited checkout: `main` at `db1dce6aed9db2ca5dcfa2e078acd6a2346b6592`.
- Local `origin/main` ref: the same commit. The remote was not fetched during this audit.
- Version declaration: application `0.4.3`; tag `v0.4.3` is on
  `f54000d0fbf3ee43bf870ea3361c621c4bbe6bb3`. `v0.4.3..HEAD` has no tree diff;
  HEAD is the merge commit.
- Roadmap authority: `docs/DEVELOPMENT_ROADMAP.md`, revision 7.
- Audit type: rejection audit and corrective-work specification.
- Product code changed by this audit: none.
- Dependency versions changed by this audit: none.
- Release artifacts changed by this audit: none.

Test host:

- Microsoft Windows 10 Pro for Workstations 10.0.19045, build 19045.
- Intel Core i9-13900K, 32 logical processors, 127.7 GiB RAM.
- WebView2 151.0.4129.72.
- Rust 1.97.1, Cargo 1.97.1, Node 24.15.0.
- Executing pnpm was 11.16.0; the repository declares pnpm 11.1.1.

## 1. Normative verdict

**REJECTED. BabelLeaf 0.4.3 does not satisfy the declared PC feature-closure
claim and must not be used as the baseline for beginning 0.5 platform ports.**

This is not a conclusion based only on missing manual testing. Required PC
capabilities are absent or not connected to any product entry point:

1. there is no selected production OCR implementation and no model-dependent
   detection/recognition route available from the comic workspace;
2. the complete comic batch pipeline exists only as an isolated service and is
   not reachable from the UI;
3. mandatory comic geometry, mask, style, undo/redo, and recovery workflows are
   absent from the desktop editor;
4. original-only, translated-only, stacked bilingual, and side-by-side bilingual
   reader modes are not implemented as reader modes;
5. the saved 0.4.3 release installer is a `BabelLeaf Smoke` package under the
   normal BabelLeaf filename;
6. production npm and Cargo dependency audits fail;
7. the declared hostile/format fixture matrices are primarily metadata rather
   than executable legal fixtures;
8. the comic import/export path is not memory bounded and accepts page counts
   that cannot fit the declared resource budget;
9. required runtime traffic-capture evidence does not exist;
10. the five-minute idle working-set sample exceeds the tracked 350 MiB budget.

The repository itself already contains admissions inconsistent with a PC
feature-closure claim. `docs/DEVELOPMENT_ROADMAP.md:199-204`, `229-237`,
`248-265`, `279-281`, and `347-350` state that no production OCR runtime/model
has been selected. `docs/NETWORK_POLICY.md` states that runtime traffic capture
and credential/transport hardening remain release gates.

All P0 and P1 items in this document belong to the 0.4 corrective line. Do not
start 0.5 implementation until they are closed with executable evidence.

## 2. Automated verification ledger

| Gate | Result | Evidence and qualification |
| --- | --- | --- |
| Frozen dependency install | PASS with network | `pnpm install --frozen-lockfile` completed. An offline-only attempt failed because the local pnpm cache lacked `@biomejs/biome-2.4.15.tgz`; that is an audit-host cache fact, not a product defect. |
| Formatting | PASS | 1,070 files checked. |
| TypeScript and Biome lint | PASS | tsgo no-emit and Biome lint completed; 1,029 files checked. |
| Tauri frontend production build | PASS | Next production build completed. |
| Web production build | PASS | `build-web` completed. |
| Generated-output contracts | PASS | untranslated-string and lookbehind checks completed. |
| Unit/service tests | PASS, insufficient coverage | 4,698 passed, 1 skipped, 4,699 total across 361 files. |
| Unit coverage | FAIL as a release assurance mechanism | Statements 50.09%, branches 43.37%, functions 47.52%, lines 51.31%. No thresholds are configured. Core UI files including `ComicWorkspaceDialog.tsx`, `TranslationWorkbenchDialog.tsx`, `TranslatorPopup.tsx`, `OcrTextLayer.tsx`, and glossary/memory panels reported 0% execution coverage. |
| Browser-backed Vitest | PASS with warning | 313 passed, 1 skipped. The build emitted two warnings that `/public/vendor/simplecc/simplecc_wasm.js` should be referenced as `/vendor/simplecc/simplecc_wasm.js`. |
| Playwright web E2E | CONDITIONAL PASS, official command broken | Correct web production output served with COOP/COEP passed 15/15. Local dev mode produced a `SharedArrayBuffer`/`crossOriginIsolated` error overlay. `CI=true pnpm test:e2e:web` fails because `start-web` is not defined. The GitHub required-check workflow does not run this suite. |
| Tauri integration Vitest | CONDITIONAL PASS, official Windows command broken | Direct Windows orchestration passed 109, skipped 1. `pnpm test:tauri` cannot run on a normal PowerShell PATH because it hard-depends on Bash/Unix utilities; even with Git Bash, subprocess PATH resolution failed for `dotenv`/`pnpm`. |
| Native WebDriverIO E2E | FAIL | 9 of 18 passed and 9 failed. Selectors for library container/header/bookshelf/clear/select/import are stale or absent; navigation fails; title still expects `Readest` while the app is `BabelLeaf`. This lane is not part of required CI. |
| Rust format | PASS | `cargo fmt -p Readest --check`. |
| Rust Clippy | PASS with incomplete scope | `cargo clippy -p Readest --all-targets --no-deps --offline -- -D warnings`. `--no-deps` excludes vendored workspace dependencies; release build still reports an unused `permission` warning in `packages/tauri-plugins/plugins/fs/src/commands.rs`. |
| Rust tests | PASS | 50 passed, 0 failed. |
| npm production advisory audit | FAIL | 4 findings: 2 high, 2 moderate. |
| RustSec audit | FAIL | 6 lockfile vulnerabilities and 24 allowed warnings. The direct Windows-relevant `quick-xml 0.36.2` EPUB parser has two high-severity advisories. |
| Windows x64 unsigned NSIS build from current source | PASS | Standard package built as `BabelLeaf`, SHA-256 `BAEC189AC50BAE5A372F58A842C691EB535E5F2B8E4E6390B149A58D874EA693`. |
| Current standard NSIS isolated smoke | PASS | Install, responding launch, uninstall, and user-data-sentinel retention passed for the newly built standard package. |
| Saved `release/` 0.4.3 artifact | FAIL | ProductName/FileDescription is `BabelLeaf Smoke`. Standard preflight rejects it before install. Its SHA-256 file correctly identifies the wrong artifact, so hashing does not repair provenance. |
| Package size | PASS | Current standard unsigned installer is 239,980,471 bytes, 228.86 MiB, below the 250 MiB budget. |
| Code signing | NOT SATISFIED | Both saved and newly built installers are `NotSigned`. The current roadmap schedules final Windows signing later, but this remains a production-distribution gap. |
| Five-minute idle memory | FAIL on audit host | Seven-process tree: working set 395.22 MiB, private bytes 220.67 MiB. The tracked budget is 350 MiB and does not specify which metric; working set exceeds it by 45.22 MiB (12.9%). WebView2 processes dominate. |
| Cold startup | NOT VALIDLY MEASURED | A warm direct-executable sample reached a responding window in 145 ms. This is not a cold installed-package-to-interactive-frame measurement and cannot close the 2,500 ms gate. |
| Other performance gates | NOT EXECUTED/NOT IMPLEMENTED | Import, page-turn p95, search p95, chapter/book queue, OCR page, OCR peak, comic save, overlay render, cache size, and minimum-hardware scenarios have constants but no release benchmark harness or recorded fixture evidence. |
| Manual native UI exercise | BLOCKED BY AUDIT TOOLING | The desktop control backend failed before app interaction with `EnumWindows failed: 系统找不到指定的路径 (0x80070003)`. Web/driver tests were used where possible. This tooling failure is not an application defect, but all real audio, native picker, and end-user workflow claims remain unverified. |

## 3. Requirement traceability matrix

Status vocabulary:

- `PASS`: executable evidence covers the requirement at the relevant boundary.
- `PARTIAL`: implementation or service tests exist, but product reachability or
  native end-to-end proof is incomplete.
- `FAIL`: required behavior is absent, contradicted, unsafe, or fails a gate.
- `UNVERIFIED`: it may exist, but this audit obtained no acceptable evidence.

| Required PC capability | Status | Current evidence | Missing acceptance evidence or implementation |
| --- | --- | --- | --- |
| Local EPUB import/read | PARTIAL | Real EPUB fixtures, JS parsing, and native EPUB parity tests pass. | No installed-package user-flow matrix; hostile EPUB cases are not real fixtures; direct Rust XML parser is vulnerable. |
| Local PDF import/read | PARTIAL | Real text PDF parser tests pass; comic workspace contains a PDF rasterizer. | No installed-package text/mixed/scanned routing matrix; image-only/mixed diagnostics are mostly flag-based. |
| MOBI import/read | PARTIAL | One real MOBI fixture is parsed. | No installed-package flow or hostile/DRM fixture. |
| AZW/AZW3 import/read | FAIL AS QUALIFICATION | Tests rename the same MOBI bytes to `.azw`/`.azw3`. | Legally generated native AZW and AZW3 fixtures, malformed cases, and UI import proof. |
| FB2 import/read | PARTIAL | A real FB2 fixture is parsed. | No malformed/encrypted executable fixture or installed-package flow. |
| FBZ import/read/comic routing | FAIL AS QUALIFICATION | Format enums and import code exist. | No FBZ binary fixture and no end-to-end import/read/workspace test. |
| CBZ/ZIP import/read | PARTIAL | A CBZ fixture reaches image-only diagnostics; workspace archive import code exists. | Generic ZIP/FBZ paths, traversal/bomb files, bounded extraction, and installed-package flow are absent. |
| TXT import/read | PARTIAL/PASS AT WEB BOUNDARY | Playwright imports and reads a real TXT fixture. | Native installed-package file-picker proof. |
| Markdown import/read | FAIL AS QUALIFICATION | Unit test renames the TXT fixture to `.md`. | A Markdown fixture with headings, links, images, unsafe HTML, encoding, and sanitization assertions. |
| Source bytes never modified | PARTIAL | Translation/comic service tests assert source-preserving sidecars and separate export. | Hash-before/hash-after proof across the exact installed-package format/workflow matrix. |
| Selected-text one-action translation | PARTIAL | Provider and translation services are unit-tested; a UI component exists. | Core popup has no direct coverage and no real provider/native E2E. |
| Sentence/paragraph/reading-unit translation | PARTIAL | Selection and segment extraction infrastructure exists. | Explicit scope traceability and E2E for each declared scope. |
| Chapter/full-book jobs | PARTIAL | Queue, pause/resume/cancel/retry, sidecar, glossary, memory, review, and workbench services have tests. | Native UI E2E, provider-backed controlled smoke, crash/restart proof, and performance gates. |
| DeepSeek V4 preset | PARTIAL | Fixed official endpoint and `deepseek-v4-flash`; current official DeepSeek docs list that model. | No credentialed controlled smoke and health check does not verify access to the configured model. |
| OpenAI preset | FAIL RELEASE-LIFECYCLE GATE | Endpoint is fixed and model ID exists. | `gpt-5-mini-2025-08-07` is marked deprecated in current official OpenAI model docs; select and benchmark an active fixed model, then add release-time lifecycle validation. |
| Anthropic preset | PARTIAL | Fixed endpoint and `claude-sonnet-4-6`; Anthropic currently lists it as active. | No credentialed controlled smoke and health check only requests one arbitrary model. |
| Loopback Ollama | PARTIAL | Loopback-only validation and mock tests exist. | Real loopback model discovery/translation/cancel/error E2E without allowing remote arbitrary URLs. |
| API-key-only setup and secure storage | PARTIAL | Ordinary settings/backups delete keys; Windows keyring implementation exists. | Native set/get/restart/clear test with a synthetic credential; redacted log and uninstall-retention decision proof. |
| Original/translated/stacked/side-by-side reading | FAIL | `BilingualTranslationView` supports a component layout and the workbench hard-codes `layout='columns'`. | Actual reader modes, a mode selector, original-only and translated-only rendering, stacked mode integration, persisted anchors, reopen/font/writing-mode/window tests. |
| Glossary/TM/review/interchange | PARTIAL | Rich service-level coverage and workbench implementation. | Direct workbench UI coverage and installed-package restart/import/export proof. |
| Local dictionary import and lookup | PARTIAL | Real MDict, StarDict/DICT, and SLOB parser fixtures and provider tests exist. | Installed-package import, restart, lookup from selected text, malformed dictionary, removal, and no-network proof. |
| Native/local speech | PARTIAL | Controller/UI behavior and native invocation calls are heavily unit-tested. | Audible Windows voice enumeration, play/pause/resume/rate/voice/highlight/restart test with network capture. |
| Comic local image/CBZ/FBZ/PDF import | PARTIAL | Desktop entry point and import/rasterization code exist. | Real installed-package workflow; FBZ/scanned fixtures; bounded archive/PDF resource behavior. |
| Local OCR detection/recognition (zh/en/ja/vertical ja) | FAIL | Sidecars, worker protocols, model manifests, mock runtime, and candidate metadata exist. | A selected production runtime/model, detection/recognition decoder, model pack, license/checksum, quality matrix, CPU fallback, and UI action. |
| OCR model pack import/list/remove | PARTIAL | Settings panel and storage/checksum services exist. | Direct panel coverage and exact-package import/use/remove test with a real approved pack. Importing bytes currently does not create a product-reachable OCR run. |
| Selectable OCR text | PARTIAL | Overlay primitives and service tests exist. | Real OCR output and native selection/copy/lookup/translation E2E. |
| Region creation/correction/review | PARTIAL | Manual full-page region, text correction, soft-delete, approve, and revert are reachable. | Pointer geometry editing, resize, split, merge, rotation, reorder, language, reading order, keyboard/mouse, undo/redo. |
| Comic translation and context | PARTIAL | Explicit selected-region provider call exists. | Page/range/archive batch translation, context preview/bounds, glossary/TM/review integration, cancellation/retry UI. |
| Mask editing/inpainting | FAIL PRODUCT SURFACE | Deterministic service primitives and an optional worker interface exist. | Brush, erase, restore, feather, expand controls; previews; undo/redo; approved local inpainting implementation and diagnostics. Current UI only auto-paints the selected region bounds. |
| Typesetting | FAIL PRODUCT SURFACE | Layout services support many properties. UI calls a default `typesetPage`. | User controls for font, size, color, outline, alignment, spacing, rotation, writing direction, vertical CJK, RTL, overflow, fit, and missing-glyph diagnostics. |
| OCR-to-export batch progress/recovery | FAIL | `comicPipeline.ts` has a tested queue service. | No non-test production consumer, no UI task creation/progress/pause/resume/retry/rerun, and no actual OCR/cleanup/typeset/export composition. |
| Separate CBZ/PDF translated export | PARTIAL | UI and service export routes exist; source-overwrite checks pass in unit tests. | Exact-package complex-workflow export/reopen/visual comparison and bounded streaming. Image-set/ZIP export service is not exposed by the current dialog. |
| Malformed/oversized/DRM diagnostics | FAIL AS RELEASE MATRIX | Diagnostic functions map flags/errors to codes. | Real generated hostile binaries for every declared format and proof that partial artifacts are not persisted. |
| Runtime privacy boundary | UNVERIFIED/FAIL RELEASE GATE | CSP/static endpoint and prohibited-feature tests exist. | Clean-profile traffic capture for startup/import/read/dictionary/TTS/translation/shutdown; remote subresource capture; redirect and credential transport evidence. |
| Windows exact package lifecycle | FAIL FOR SAVED RELEASE, PASS FOR NEW LOCAL BUILD | A newly built standard package passes isolated lifecycle smoke. | Replace the wrong saved release artifact, bind hash/tag/commit/test evidence, and test upgrade plus failure cleanup. |
| Resource budgets | FAIL/UNVERIFIED | Package size passes; one idle sample fails. | Executable, reproducible, minimum-hardware benchmark matrix for every declared metric. |

## 4. Corrective findings

### BL-PC04-001 — P0 — Production OCR is not implemented as a usable feature

Evidence:

- `docs/DEVELOPMENT_ROADMAP.md:199-204`, `229-237`, `248-265`, `279-281`,
  and `347-350` explicitly leave the production OCR gate open.
- `docs/UPSTREAM_INVENTORY.md` marks PaddleOCR, manga-ocr, manga-ocr-rs,
  ONNX Runtime, and complete comic applications as candidates, not integrations.
- `ComicWorkspaceDialog.tsx:504` tells the user to add OCR regions manually or
  import an OCR sidecar.
- Production usage search finds `onnxOcrRuntime.ts` and `ocrRuntime.ts` only in
  service exports/benchmark boundaries, not in the comic workspace.

Required remediation:

1. Select one primary and one fallback local OCR route using the same licensed
   zh/en/ja manga/scanned-page corpus.
2. Pin runtime revision, model artifacts, licenses, checksums, preprocessing,
   decoder, language support, minimum hardware, and CPU fallback.
3. Connect an explicit `Run OCR` action and bounded page/range/archive task UI
   to the installed model pack and worker protocol.
4. Persist provenance and partial/recoverable results without credentials.
5. Prove no page/OCR text network transfer and unload/remove the model cleanly.

Acceptance evidence:

- Exact Windows package: pack import -> verify -> select -> OCR zh/en/ja and
  vertical Japanese -> cancel -> resume/retry -> restart -> select/copy text ->
  remove pack -> uninstall.
- Quality/resource table with fixture hashes, dimensions, runtime, worker count,
  CPU fallback, per-stage time, peak working set/private bytes, and disk use.

### BL-PC04-002 — P0 — Comic batch pipeline is service-only dead product code

Evidence:

- Non-test imports of `ComicPipelineQueue`/`composeComicPipelineStages` resolve
  only to `comicPipeline.ts` and the barrel export.
- `ComicWorkspaceDialog.tsx` invokes single-region translation, default
  typesetting, deterministic erase, and whole-document export directly. It does
  not construct the OCR/translation/cleanup/typeset/export queue.

Required remediation:

- Integrate the existing queue behind a desktop task UI with page/range/archive
  selection, progress, pause, resume, cancel, retry, selective rerun, revision
  history, restart recovery, cache cleanup, and diagnostics.
- Do not delete `comicPipeline.ts` merely because reachability analysis marks it
  unused. It represents required functionality. Either integrate it or revise
  the authoritative product scope through an approved scope change.

### BL-PC04-003 — P0 — Required comic editor operations are absent

Evidence:

- Roadmap 0.4.1 requires split, merge, resize, rotation, reorder, language and
  reading-order correction, undo/redo, autosave/recovery, and desktop input.
- `ComicRegionEditor.tsx:22` explicitly says geometry tools remain
  sidecar-driven. The component only edits OCR text and performs
  approve/delete/restore/revert.
- New manual regions are created as a fixed 5%-95% page rectangle
  (`ComicWorkspaceDialog.tsx:610-624`).
- No UI exists for mask brush/erase/restore/feather/expand or typesetting style
  properties; current erase is a generated region-bounds paint operation with
  hard-coded cleanup radii (`694-761`).

Required remediation:

- Implement the entire roadmap operation set as UI-reachable, keyboard/mouse
  accessible, undoable sidecar revisions.
- Add style controls and accurate preview/export parity for horizontal, RTL,
  vertical CJK, ruby/fallback, and overflow diagnostics.
- Add component, browser, native E2E, restart, and visual-regression tests.

### BL-PC04-004 — P0 — Bilingual reading modes are not reader modes

Evidence:

- Roadmap product destination requires original, translated, stacked, and
  side-by-side modes.
- The only production `BilingualTranslationView` use is the review tab and is
  hard-coded to columns at `TranslationWorkbenchDialog.tsx:861-868`.
- No original-only/translated-only reader renderer, stacked selector, or
  persisted reader layout integration was found.

Required remediation:

- Implement four explicit reader modes, not only a review table.
- Use stable source/translation anchors across pagination, reopen, font,
  line-height, writing mode, and window changes.
- Add fixture-based E2E for EPUB/TXT at minimum and qualify PDF/MOBI/FB2 where
  selectable text is available.

### BL-PC04-005 — P0 — Saved release artifact identity is wrong

Evidence:

- `release/BabelLeaf_0.4.3_x64-setup.exe`:
  - bytes: 239,984,678;
  - SHA-256: `0AA70E97742F604E30300248C941181EFF0902F7D136F2246D24506350519D31`;
  - ProductName/FileDescription: `BabelLeaf Smoke`;
  - signature: `NotSigned`.
- The adjacent `.sha256` matches those wrong bytes.
- Standard preflight error: `Installer product name 'BabelLeaf Smoke' does not
  match 'BabelLeaf'.`
- A current standard source build produces ProductName `BabelLeaf`, SHA-256
  `BAEC189AC50BAE5A372F58A842C691EB535E5F2B8E4E6390B149A58D874EA693`, and
  passes isolated install/launch/uninstall/data retention.

Required remediation:

- Treat the saved 0.4.3 artifact as invalid; never rename/copy a smoke-config
  artifact into the release path.
- Add one release script that builds standard config, records commit/tree/config,
  validates VersionInfo and identifier, runs smoke against the exact bytes, then
  copies/signs/hashes those same bytes atomically.
- CI/release evidence must identify artifact SHA, source tree, Tauri config, and
  smoke result. Do not accept a hash alone as provenance.

### BL-PC04-006 — P0 — npm production dependency advisories

`pnpm audit --prod --audit-level moderate` fails:

| Package | Locked | Severity | Advisory | Fixed |
| --- | ---: | --- | --- | ---: |
| `nanoid` | 3.3.12 | high | GHSA-28wg-ghj8-5hjv | >=3.3.16 |
| `nanoid` | 3.3.12 | high | GHSA-2v37-7h3g-55p8 | >=3.3.17 |
| `postcss` | 8.5.18 | moderate | GHSA-fxqj-rqcc-2cmp | >=8.5.23 |
| `dompurify` | 3.4.12 | moderate | GHSA-55q2-fjhq-7xh7 | >=3.4.13 |

`dompurify` is a direct production dependency used at an untrusted-document
boundary. Transitive build-tool-only reachability must be documented, but audit
exceptions are forbidden unless exploitability is proved and time-bounded.

Required remediation: update through the lockfile, run document sanitization
and full release regressions, add `pnpm audit --prod` to required CI, and record
any narrowly scoped exception with expiry and reachability evidence.

### BL-PC04-007 — P0 — RustSec failure at the native EPUB trust boundary

`cargo-audit 0.22.2` reports six lockfile vulnerabilities plus 24 unmaintained or
unsound warnings. PC-critical findings:

- `quick-xml 0.36.2`, direct dependency of `Readest`, is used by
  `src-tauri/src/epub_parser.rs` for imported EPUB XML.
- RUSTSEC-2026-0194: quadratic duplicate-attribute processing, severity 7.5.
- RUSTSEC-2026-0195: unbounded namespace-declaration allocation, severity 7.5.
- Both require `quick-xml >=0.41.0` according to RustSec.

Other lockfile findings include `nix 0.19.1` (device-info/non-Windows path),
`quick-xml 0.39.4` (Wayland path), and `rkyv 0.7.46` (not present in the current
target-all dependency tree). They still require lockfile cleanup or a documented
target/reachability decision.

Required remediation:

- Upgrade the direct parser and add malicious duplicate-attribute/namespace
  resource tests against the native command.
- Add `cargo audit` or an equivalent RustSec policy gate to CI.
- Triage all 24 warnings by current target, future platform target, and package
  reachability before 0.5; do not carry known unsound future-platform paths into
  porting work.

### BL-PC04-008 — P0 — Format and hostile-input matrix is declarative, not executable

Evidence:

- `formatMatrix.ts` lists files such as `malformed.epub`, `encrypted.epub`,
  `sample-scanned.pdf`, `oversized-page.cbz`, FBZ and image-folder manifests,
  but they do not exist in the repository.
- `format-matrix.test.ts:66-99` calls diagnostic functions with flags/errors
  instead of opening hostile files.
- AZW/AZW3 tests rename MOBI bytes; Markdown renames TXT bytes.
- CBZ is only opened to confirm `image-only`; FBZ and image-folder inputs are
  not opened.
- `docs/FORMAT_FIXTURE_MATRIX.md` claims generated hostile cases and release
  candidate samples, but no executable generator or separate checksum/license
  evidence was found.

Required remediation:

- Add deterministic legal fixture generators where binary samples should not be
  committed; otherwise commit redistributable fixtures with provenance.
- Open every valid/malformed/empty/image-only/encrypted/oversized case through
  the real parser/importer and assert code, no source mutation, no partial
  sidecar, cleanup, time, memory, entry, and expansion bounds.
- Use actual AZW/AZW3/Markdown/FBZ/ZIP/scanned/mixed PDF/image-folder semantics.

### BL-PC04-009 — P0 — Comic import/export violates bounded-resource requirements

Evidence:

- PDF and archive limits allow 10,000 pages.
- PDF rasterization accumulates every rasterized `File` in memory.
- Archive extraction loads every supported entry into a `Blob`; no total
  uncompressed-byte or compression-ratio check is visible in the workspace path.
- The UI stores all page blobs/object URLs for the session.
- Export accumulates all rendered page `ArrayBuffer`s; PDF conversion uses
  `Promise.all` for all non-JPEG pages, then creates a final complete archive.
- A single permitted 80-million-pixel RGBA page is approximately 305 MiB before
  canvas, mask, cleanup, encoded output, and WebView copies.

Required remediation:

- Enforce archive entry count, declared/actual uncompressed bytes, compression
  ratio, per-entry bytes, dimensions, total decoded pixels, page count, and disk
  quota before/during extraction.
- Stream or window input pages; use bounded worker concurrency and temporary
  files; release image bitmaps/canvases/URLs deterministically.
- Stream export or spool page outputs to bounded disk; never hold source,
  decoded RGBA, encoded pages, conversions, and final archive simultaneously.
- Add bomb, 80 MP, thousands-of-pages, cancellation, out-of-memory, and temp
  cleanup tests with process-tree memory capture.

### BL-PC04-010 — P0 — Local-first runtime behavior has not passed its release gate

Evidence: `docs/NETWORK_POLICY.md` explicitly says source containment exists but
clean runtime traffic capture remains outstanding. No traffic-capture script,
trace, allowlist report, or exact-package evidence was found.

Required remediation:

- On a clean profile, capture DNS and TCP/HTTP(S) attempts during install,
  startup, import of hostile remote-subresource books, ordinary reading,
  dictionary lookup, native TTS, sidecar reopen, shutdown, each named cloud
  provider, and loopback Ollama.
- Assert zero external traffic except the exact explicit provider request.
- Test redirect refusal/credential stripping and absence of secrets/book text in
  logs, diagnostics, sidecars, crash artifacts, URL query strings, and exports.

### BL-PC04-011 — P1 — Native and web E2E gates are broken or excluded

Required remediation:

1. Replace or wrap `scripts/test-tauri.sh` with a cross-platform launcher;
   never rely on `bash`, `pkill`, `lsof`, `xargs`, or an implicit subprocess
   PATH for the Windows-required lane.
2. Define a production web server command with COOP/COEP and route fallback, or
   use a supported Next production serving strategy for exported output.
3. Run `test:e2e:web` and native WebDriverIO in required CI.
4. Repair the stale WebDriver selectors/title and add actual import/read,
   translation, dictionary/TTS, workbench, and comic workflows.
5. Guarantee test launcher cleanup on success, failure, timeout, and interrupt.

### BL-PC04-012 — P1 — Test coverage cannot protect the closure claim

Required remediation:

- Set progressive coverage thresholds and a stricter changed/core-module gate.
- Require direct tests for `ComicWorkspaceDialog`, `ComicRegionEditor`,
  `OcrModelPackPanel`, `OcrTextLayer`, `TranslationWorkbenchDialog`,
  `TranslatorPopup`, glossary/memory panels, and reader integration.
- A global percentage alone is insufficient; every mandatory product entry
  point needs behavior/negative/persistence tests.

### BL-PC04-013 — P1 — Performance baseline is constants, not a release gate

Required remediation:

- Define memory metric precisely: process-tree working set, private bytes, or
  both. Working set is required for user-visible RAM budgeting.
- Build one tracked harness that records host, artifact hash, fixture hash,
  cold/warm state, WebView version, per-process and tree metrics, p50/p95, cache,
  and failure reason.
- Run on the minimum supported Windows class and compare against an approved
  baseline in CI/release evidence.
- Treat the current 395.22 MiB five-minute working-set sample as a failure until
  the metric is redefined by an approved roadmap change or the usage is reduced.

### BL-PC04-014 — P1 — Provider lifecycle and real request validation are incomplete

Current official verification on 2026-08-09:

- DeepSeek lists `deepseek-v4-flash` and base URL `https://api.deepseek.com`:
  <https://api-docs.deepseek.com/quick_start/pricing>.
- OpenAI lists `gpt-5-mini-2025-08-07` but marks the snapshot deprecated:
  <https://developers.openai.com/api/docs/models/gpt-5-mini>.
- Anthropic lists `claude-sonnet-4-6` as active, with tentative retirement not
  sooner than 2027-02-17:
  <https://platform.claude.com/docs/en/about-claude/model-deprecations>.

Required remediation:

- Select active fixed defaults by translation quality, latency, price, context,
  availability, and API compatibility. A latest model is not automatically the
  correct translation model.
- Add a release-time official-document/model-lifecycle check.
- Provider `healthCheck()` must prove the selected model is available to the
  account or clearly distinguish key validity from model availability. A generic
  HTTP 200 from `/models` is insufficient.
- Use controlled synthetic strings and non-production keys for redacted native
  smoke evidence. Never place keys in CI logs or repository secrets artifacts.

### BL-PC04-015 — P1 — Native secure credential boundary lacks integration proof

Unit tests mock bridge storage. Add exact-package Windows tests using a synthetic
secret: save, verify ordinary settings/backups/sidecars/logs are clean, restart,
load, translate mock/controlled content, clear, verify removal, and document
uninstall retention. Clean all synthetic credentials even on failure.

### BL-PC04-016 — P1 — Dictionary and speech have no installed-package functional proof

Required remediation:

- Dictionary: real MDict+MDD, StarDict/DICT, and SLOB import through the picker,
  restart, selected-word lookup, multi-provider order, malformed input, removal,
  and traffic capture.
- TTS: enumerate actual Windows voices; speak English/Japanese/Chinese fixture
  text; pause/resume/seek/rate/voice; cross-page highlighting; restart/stop;
  verify audible output or a platform test sink and zero network traffic.

### BL-PC04-017 — P1 — Comic workspace is not fully localized for the target user

`ComicRegionEditor.tsx` contains hard-coded English labels and actions rather
than the translation hook. Move all core workflow strings into the Simplified
Chinese locale, add extraction checks that cover these components, and run a
native zh-CN UI test at minimum supported window dimensions.

### BL-PC04-018 — P1 — Installer failure path leaks isolated profiles

`test-windows-installer.ps1` creates the isolated profile before the main try
block, records a failure, then rethrows at lines 394-401 before profile removal
at lines 404-409. Failed preflight runs leave
`%TEMP%\BabelLeaf-installer-profile-*` directories.

Move bounded profile cleanup into a guaranteed outer `finally`. Preserve only
redacted failure evidence under the explicit artifacts directory. Add a test
that intentionally fails preflight and proves no profile/install/process/port/
registry residue remains.

### BL-PC04-019 — P2 — Packaging and compliance evidence are incomplete

- The installer is unsigned.
- No generated SBOM, third-party notice set, or dependency-license inventory was
  found; `UPSTREAM_INVENTORY.md` explicitly says it is not a dependency SBOM.
- Add SPDX/CycloneDX or equivalent source and binary SBOMs, dependency notices,
  license-policy checks, submodule revision checks, and artifact signing before
  a production release. Retain AGPL corresponding-source obligations.

### BL-PC04-020 — P2 — Build warnings and stale baseline tests remain

- Fix the SimpleCC `/public/...` resource warning.
- Include relevant vendored workspace code in warning review; the FS plugin
  unused-variable warning is not caught by `--no-deps` Clippy.
- Remove stale `Readest` expectations and names only where they are not required
  upstream attribution or internal compatibility identifiers.
- Make the pnpm version used by local/CI release commands match `packageManager`.

## 5. Optimization and code-reduction program

These are evidence-first tasks. Do not remove code merely because a static
search fails to see a dynamic/native entry point.

### 5.1 Immediate resource changes

1. Dynamically load `TranslationWorkbenchDialog` and `ComicWorkspaceDialog`.
   `HeaderBar.tsx` currently imports both large, optional workspaces statically.
2. Stream comic/PDF input and export as specified in BL-PC04-009.
3. Measure whether both public and hashed copies of Jieba and SimpleCC WASM are
   required. The web output is 49.77 MiB and contains duplicate-sized copies
   (Jieba 3.83 MiB twice; SimpleCC 1.09 MiB twice). Remove only after every
   runtime/worker URL path is tested.
4. Keep the offline WebView2 installer for a reliable offline package, but
   consider producing a second signed bootstrapper distribution. Never replace
   the only installer with a network-dependent bootstrapper without an explicit
   product decision.
5. Disable Next build telemetry explicitly for reproducible release jobs.

### 5.2 Reachability and platform feature splitting

1. Add a tracked dependency/reachability report for npm, Cargo features, Tauri
   commands/capabilities, public assets, workers, and native plugins.
2. Split mobile-only biometric, haptic, share, native-bridge, CarPlay/Android
   Auto, and related JS/native code from the Windows startup/bundle path where
   Tauri/Next platform boundaries permit it. Preserve the code needed for future
   ports in platform modules rather than registering it unconditionally.
3. Review `tauri-plugin-sharekit`, `tauri-plugin-device-info`, deep-link, CLI,
   WebView upgrade, and other inherited plugins against current PC requirements,
   measured package/runtime cost, capabilities, and future-port need.
4. Large modules should be split by tested responsibility:
   `Annotator.tsx` (~1,717 lines), library page (~1,405),
   `ComicWorkspaceDialog.tsx` (~1,034), comic workspace service (~1,042), and
   translation workbench (~885). Splitting is justified only when it reduces
   loaded code, isolates state, or enables direct tests.

### 5.3 Dormant feature rule

- Required but disconnected translation/OCR/comic services are not cleanup
  targets; connect them first.
- Inherited optional reader features not in the approved product destination
  must receive a product decision, usage evidence, dependency/resource delta,
  migration impact, and removal tests before deletion.
- After functional closure, remove alternate experimental OCR/inpainting/runtime
  paths that were not selected, as roadmap 0.4.3 requires.

## 6. Required corrective sequence

### Corrective checkpoint A — release/security containment

Close BL-PC04-005, 006, 007, 008, 010, 011, and 018. Mark the existing saved
0.4.3 artifact invalid. Add dependency audits, executable hostile fixtures,
reliable cross-platform test launchers, traffic capture, and artifact provenance.

### Corrective checkpoint B — text PC closure

Close BL-PC04-004 and 012-017 for translation, bilingual reader modes, provider
lifecycle, native credential storage, dictionaries, TTS, localization, native
E2E, and measured performance.

### Corrective checkpoint C — comic PC closure

Close BL-PC04-001, 002, 003, and 009. Select and qualify OCR, connect the batch
pipeline, complete editor/mask/typesetting controls, and make processing bounded.

### Corrective checkpoint D — exact release candidate

1. Freeze scope and use one clean commit/tree.
2. Run the complete command and manual matrices below.
3. Review every changed file, dependency, capability, permission, generated
   artifact, license, error path, cleanup path, and concurrency boundary.
4. Build the standard candidate exactly once or use a content-addressed build
   promotion mechanism.
5. Install/upgrade/launch/execute primary workflows/shutdown/uninstall against
   those exact bytes; preserve the intended user data only.
6. Sign, hash, attach SBOM/notices/evidence, tag the verified tree, merge, push,
   confirm required checks/branch protection, then clean reproducible caches.

## 7. Mandatory re-acceptance matrix

The implementing Codex must update command names if the repository changes, but
must preserve equivalent coverage. No failure may be ignored without a tracked,
time-bounded, evidence-backed disposition.

Automated gates:

1. frozen install and package-manager version check;
2. formatting, TypeScript, Biome, generated-output checks;
3. full unit tests and enforceable core-module coverage thresholds;
4. browser Vitest;
5. Playwright production-web E2E;
6. Windows-native Tauri integration and WebDriverIO E2E;
7. Rust format, all-target workspace Clippy policy, unit/integration tests;
8. `pnpm audit --prod` and RustSec audit;
9. executable valid/malformed/empty/image-only/encrypted/oversized format matrix;
10. sidecar schema/migration/rollback/hostile-input tests;
11. source hash invariance and credential redaction tests;
12. clean-profile network capture with an explicit allowlist;
13. performance harness for every budget on the supported minimum host;
14. standard Windows package build, VersionInfo/config/provenance validation,
    install, upgrade, launch, shutdown, uninstall, data retention, and failure
    cleanup;
15. signing, SBOM, notice, license, and submodule-revision gates.

Manual/native workflow gates on the exact release candidate:

- import/read/reopen/search/navigate each supported format;
- selected, sentence/paragraph, chapter, and book translation for every named
  provider mode, including cancel/rate limit/timeout/redirect/offline failure;
- four bilingual modes with font/layout/reopen changes;
- glossary/TM/review/edit/import/export/recovery;
- real dictionary formats and selected-word lookup;
- actual Windows TTS voice and playback controls;
- approved OCR pack lifecycle and zh/en/ja/vertical-ja OCR;
- complete comic region/mask/typesetting/batch/recovery/export flow over manga,
  webtoon, western, grayscale, color, low-resolution, mixed-language, and large
  legal fixtures;
- byte-for-byte source preservation and expected sidecar/user-data retention;
- clean shutdown with no orphaned processes, ports, temp files, credentials, or
  model mappings.

## 8. Stop conditions for future agents

1. Do not report 0.4 accepted while any P0 or P1 item is open.
2. Do not begin macOS/Android/iOS product implementation while the shared PC
   core is still missing bilingual modes or production OCR.
3. Do not substitute mocks, enum presence, manifest entries, or service-only
   unit tests for a user-reachable feature.
4. Do not call a format qualified by renaming another format's bytes.
5. Do not call a model pack usable merely because it can be stored and hashed.
6. Do not promote a smoke-config package by renaming it.
7. Do not weaken privacy, source immutability, fixed-provider, DRM, license, or
   resource boundaries to make a test pass.
8. Do not clean non-reproducible evidence, user data, credentials, source,
   `.env`, or release artifacts without explicit authorization.

## 9. Audit-generated temporary data policy

The audit created only reproducible local build/test output and this document.
Temporary audit servers, tool binaries, profiles, traces, reports, and build
caches are not release evidence. After this document is verified, remove those
bounded generated paths while preserving source, `.env`, credentials, user data,
sidecars, imported books, and all pre-existing `release/` artifacts. Do not
delete the invalid saved installer during the audit; its identity is evidence
for BL-PC04-005 and remediation requires an explicit release action.
