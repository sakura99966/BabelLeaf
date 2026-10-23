# 0.4.6 PC audit remediation

Source audit: INDEPENDENT_AUDIT_0.4.5_2026-10-18.md.
Branch: codex/0.4.6-audit-remediation. Product scope remains 0.4 PC.

## Gates

| ID | Scope | Status |
| --- | --- | --- |
| AUD18-01 | Inert, sanitized local dictionary HTML/CSS/resources | IMPLEMENTED; final package gate pending |
| AUD18-02 | Session-scoped explicit translation consent | IMPLEMENTED; final regression pending |
| AUD18-03 | Atomic, validated, recoverable book configuration | IMPLEMENTED; final regression/native crash gate pending |
| AUD18-04 | Current Rust dependency audit and native validation | IMPLEMENTED; Windows audit/Rust tests/Clippy pass; updated package qualification pending |
| AUD18-05 | Copied runtime vendor provenance/SBOM/security closure | IMPLEMENTED; source evidence passes; final static output/artifact gate pending |
| Follow-up | Full npm graph, static candidates, performance and review | OPEN |
| Closure | Full applicable regression, package qualification, remote backup and bounded cleanup | OPEN |

External paid-provider/corpus/minimum-host/human-voice/signing/legal gates remain
DEFERRED by owner instruction. Do not move existing release tags or replace their
assets. A green old CI run does not qualify changed source or new advisories.

## Execution record

- 2026-10-18: preserved existing deterministic foliate security preparation and
  the original audit report/probes/evidence. Created a dedicated remediation branch.
  No 0.5 feature or real provider request is authorized.
- Dictionary script sentinel changed from executable to blocked in Chromium.
  StarDict/MDict/SLOB share one inert-template/sanitized HTML and CSS boundary;
  local MDD images/styles and explicit audio/navigation regression remain passing.
- Session grants are never serialized or broadcast. Opening a saved translated
  view reads sidecars only; button grants are book/view/provider/target scoped,
  mutable Ollama configuration invalidates them, and close aborts pending requests.
  The store does not import provider SDKs into the basic reader dependency graph.
- Book configs use validated atomic main/previous-copy writes under cross-window
  locks, annotation conflict merging, bounded exact-byte invalid-original storage,
  explicit future-schema refusal and retained dirty snapshots with close veto.
  Library/settings no longer treat corrupt/unreadable files as fresh defaults.
- Added one generic unsaved-book warning in all 33 existing locales. Extraction
  no longer silently prunes dynamic keys. Unrelated scanner changes were removed.
- Intermediate verification: 4,940 unit passes before config changes; 321 browser
  passes plus one inherited skip after dictionary/consent fixes; 79 targeted
  surrounding config/import/annotation passes. Full new-source checks pending.
- Dependency remediation: rustls 0.23.46, quinn-proto 0.11.18 and ZIP 9.0.5;
  ZIP API adaptations pass 52 native unit tests and strict application Clippy.
  Windows version audit passes; the all-platform nix 0.19.1 finding remains a
  separate future-platform gate, not a proven Windows runtime vulnerability.
- JavaScript compatibility/security updates include PDF.js 6.2.108 and Vitest
  4.1.11. Removed cpx2, mkdirp and postcss-cli after replacing copy scripts with
  one checked Node build tool. Raw full npm audit still has three high
  development-only records for braces/extract-zip (no published fixes); exact
  source backports, lock/file hashes and 18 boundary/policy regressions enforce
  PASS_WITH_PINNED_DEVELOPMENT_BACKPORTS. No global ignore or false zero claim.
- A deterministic runtime copy policy now inventories 7 components / 226 assets
  (28,858,205 bytes with the pinned OpenCC Git-blob notice), hashes sources and output, preserves upstream notices,
  identifies Inter 4.001 from its actual font name table, and fails closed on
  unknown copies, missing metadata, changed versions or tampered output. The
  strict candidate source SBOM has 801 components and zero gaps. This is source
  evidence, not final installer or responsible-owner legal approval.
- Normal annotation writes coalesce to at most one active and one latest pending
  snapshot, preserving merged notes and dirty-close protection. Backup recovery
  now has a bounded session notice that survives UI mounting until acknowledgment;
  two new strings are translated in all 33 existing locales.
- CodeQL test-helper remediation replaces tag-stripping regexes with XML parsing
  and escapes HTML-sensitive JavaScript data literals. 64 surrounding tests pass.
  Remote alerts must be re-evaluated by fresh CodeQL; no alert is manually dismissed.
- Removed three confirmed unreferenced legacy modules: cloud quota UI, CachedImage
  and useAutoHideScrollbar, plus quota-only tests. Supported cached-cover service
  APIs and platform adapters remain. This reduces maintenance surface; no measured
  runtime-memory saving is claimed from deleting already-unbundled source.
- Latest intermediate checks (before the final helper/native-fixture changes):
  409 unit files, 5,004 passed / 1 inherited skipped; lint 1,134 files; real
  Chromium 321 passed / 1 inherited skipped with no unhandled errors. Full final
  coverage/build/native/installer/performance/CI qualification remains pending.
- Follow-up review found and fixed two additional edges with failing-before
  regressions: a synchronous completion observer could enqueue a write that
  the original drain did not finish; a range-moved annotation could drop its
  existing deletion marker. Surrounding storage/store tests now pass.
- First hosted PR #10 run exposed a clean-checkout notice dependency: the
  OpenCC nested development submodule is not initialized by shallow CI checkout.
  Its exact pinned upstream license is now tracked in licenses/runtime, so the
  notice-only build input does not require downloading the entire nested tree.
  The initial failed hosted run remains evidence, not a waived gate.
- Current-host follow-up: 121 native integration passes (including actual
  dictionary HTML in WebView2), 27 native UI passes, 23 production-static Web UI
  passes, 52 Rust unit passes and strict Clippy pass. The 11-phase native
  interruption probe passed ordinary config main/backup, tombstone retention,
  exact invalid-byte archival and recovery notification. These precede the final
  edge-fix freeze; final exact-source qualification/CI is still open.
- See DEPENDENCY_SECURITY_0.4.6.md for every warning/backport/platform/hosted-alert
  disposition. Scope and external deferrals remain unchanged.
- Product implementation baseline for the archived pre-style-scope candidates:
  b93f462ad07a601d8ef632f3b986844628d613c6. The later ed137d6de test-only change
  replaces expensive WASM deep comparison with exact native byte comparison.
  Hosted coverage previously timed out on that comparison; its threshold was
  not lowered. A local overlapping full-suite/coverage run also timed out on
  cold NativeAppService import and contaminated the next platform mock. Both
  full coverage and a subsequent isolated push hook pass; retain the initial
  logs and avoid concurrent full-coverage/full-unit processes.
- Current verified standard candidate is archived under
  target/releases/0.4.6/b93f462ad, with EXE, NSIS package, runtime manifest,
  artifact inventory and strict artifact-bound SBOM (801 components, zero gaps).
  The standard EXE SHA-256 is
  af087ed8e7b8b577aef059d1b689bcee844ff0b56b0adb0d03d02fde64eee73d.
  These are candidate identities, not canonical-main/release identities.
  The later dictionary containment change modifies application code; these
  archived binaries do not qualify that new change and must not be relabeled.
- Real standard-binary probe passes without a dev server or webdriver feature:
  product BabelLeaf 0.4.6, hydrated empty library, 226 embedded assets /
  28,858,205 bytes individually verified against source hashes, and removed
  owned portable profile. The reusable test:windows-packaged-runtime command
  now checks loopback endpoint process ownership, source manifest equivalence,
  variant/version, bounds, streamed bytes and cleanup; Windows CI runs it
  after the installer lifecycle has supplied WebView2 on a clean runner.
  Input/CI-contract and protocol-dispatch regressions are included.
- Same-product frozen regressions: Chromium 321 passes / 1 inherited skip;
  native integration 121 passes / 1 skip; native UI 27 passes; 11-phase
  process interruption/recovery PASS. The dedicated smoke package installs,
  launches with a responding window, uninstalls and retains its data sentinel.
  Full idle measurement has passed: 60-second warmup / 300-second idle,
  99.96 MiB peak process-tree working set and 171.35 MiB peak private bytes.
  Warmup peak was 371.94 MiB; it is not hidden or counted as an idle failure.
  Responding Win32 window was observed at 143.24 ms. This is not a measured
  first-interactive-library-frame latency; that timing remains in the matrix.
  Portable-state placement and owned-profile cleanup passed.
- Bounded cleanup removed 17,675 files / 14,693,052,881 logical bytes (about
  13.68 GiB) from 13 allowlisted compiler/Next directories and three hash-proven
  duplicate EXE/installer copies. Reparse-point and resolved-path checks passed.
  All unique standard/smoke candidates, historical releases, logs, source,
  credentials, dictionaries/books and model packs remain. Native test EXE/DLL
  roots remain available; Cargo build caches may need regeneration later.
  Earlier temporary-copy cleanup is separately recorded. Byte totals are
  logical sizes, not a guarantee of the same physical-disk reclamation.
- Dependency security now resolves actual copied-runtime package identities
  (including component aliases) before evaluating dev-only backports. A dev flag
  cannot exempt a runtime copy. The fresh full gate still passes with the same
  three transparent development backport records.
- Fresh CodeQL identified a high-severity test-probe response-dispatch warning:
  the callback Map was owned but the external response id lacked an explicit
  numeric/has/callable guard. Added malformed/non-callable/duplicate-response
  regression, explicit validation and safe JSON handling; hosted reanalysis
  must confirm closure, not a manual dismissal.
- The first hosted actual-package probe timed out before discovering a CDP
  target. It had run before NSIS could bootstrap WebView2 on a clean host.
  Reordered the dependency with a failing-before contract test; added bounded
  process/endpoint diagnostics (no page contents or user data) if it recurs.
  The next hosted run must establish the outcome; do not infer PASS from the
  current-host result alone.
- Additional style-scope review reproduced two real Chromium failures: StarDict
  CSS changed a control outside the dictionary, and fixed dictionary content
  covered unrelated controls. StarDict/SLOB HTML now shares MDict's shadow
  boundary. All three also use an outer trusted layout/paint/style containment
  and isolated stacking boundary, outside the reach of supplied `:host` rules.
  Cross-shadow external-link delegation uses a boundary-checked composed path.
  Dictionary styling, `::part` font scaling, safe links, MDD images/audio and
  ordinary plain-text providers remain supported. Targeted checks: 168 dictionary
  unit tests and 6 real-browser security/font tests pass. Native/full/package
  requalification of this application-source change is pending.
- Exact head 242707945 hosted results: application checks, both unit shards,
  full coverage, static build, security audit, Chromium, native Windows and all
  CodeQL analyses pass. The installer lifecycle passed, but the actual-package
  probe failed again (no CDP endpoint, application process still alive).
  Bootstrap ordering alone did not resolve it; it is not a waived gate.
  Those results precede the new dictionary containment change.
- Full post-containment Chromium regression passes 324 tests / 1 inherited
  skipped. The packaged probe now uses direct bounded loopback HTTP instead of
  a global fetch dispatcher, and reports the last endpoint error plus bounded
  owned-process startup diagnostics when it fails. The new transport tests
  cover direct communication, malformed/oversized responses, redirects and
  invalid ports. This improves diagnostic/security boundaries; the hosted root
  cause and final outcome are not assumed.
- 2026-10-22 continuation: the fresh hosted diagnostics identify WebView2
  154.0.4258.62, an alive/responding owned application and browser subprocesses,
  but no remote-port argument. Microsoft documents that Runtime 150+ drops
  WEBVIEW2_* overrides from elevated hosts:
  https://github.com/MicrosoftEdge/WebView2Feedback/issues/5645 .
  The probe now gives its disposable copy a nonce-only executable name, and
  only on elevated hosts creates one exact HKLM AdditionalBrowserArguments
  value for that name. It never targets babelleaf.exe or a wildcard. Cleanup
  checks the value is still ours before removing it and fails visibly on
  restore failure; normal non-elevated runs continue using process-local env.
  No normal product policy/ACL, runtime downgrade or general debug flag was added.
- The same hosted run passed Windows native security/regression, but the hidden
  Linux WebKitGTK test window exposed no hit-testing surface. The overlay test
  now always checks actual fixed-containing-block geometry with a deliberate
  containment-removal positive control; visible surfaces additionally retain
  hit-testing. It does not skip the safety assertion or waive the failing job.
- Added a native performance subset for actual 20/5000-segment controllers,
  atomic sidecars, pause/checkpoint reconstruction and warmed React overlay
  layout. Fixture shape/p95 calculations have unit guards. The initial probe
  failed during module loading (not a measured product latency); fail-fast page
  error handling and eager dependency preparation prevent a silent 15-minute
  wait. ComicTranslationOverlay imports its narrow pure helpers instead of the
  all-provider/all-model barrel. The native subset subsequently passed: chapter
  426.6 ms, 5000-segment durable recovery 21,358.6 ms, workspace save p95 98.1 ms
  and warmed overlay commit/layout p95 1.7 ms. Peak owned process-tree working
  set was 566,743,040 bytes; private bytes 375,848,960. These generated-fixture
  measurements do not qualify import, page turns, full-book search, cold startup
  or model/corpus quality. Canonical workspace serialization, rather than raw
  JSON object-key order, verifies restored content; changed text still fails.
- 2026-10-23: hosted run 39639782805 confirms the actual elevated policy path:
  installer lifecycle and standard-package hydration/226 embedded asset hashes
  PASS, elevatedPolicyApplied=true, policyCleanupPass=true, profileCleanupPass=true.
  Native Windows, Linux build/native, browser, coverage and CodeQL checks pass.
  The remaining failed CI job is the newly published Vite development-tool
  advisory set. Vite is locally pinned to >=7.3.7 <8; the fresh dependency gate
  reports production unresolved=0, full unresolved=0, with the same three
  explicitly reviewed development backports. New-source CI is still required.

## Remaining internal closure work (no 0.5)

October 23 follow-up (not a final qualification):

- Fresh advisory data required official @vitest/mocker 4.1.12 and TLS root/
  verification patch updates. JavaScript gate passes with zero unresolved
  records; Windows Rust audit has zero vulnerabilities / 18 reviewed warnings.
- Added bounded, local-only library readiness timing after a committed UI paint
  opportunity. The standard-package probe additionally clicks the real Import
  button and requires its local menu, with a separately enforced reference-host
  2500 ms budget. No telemetry, requests or persistent timing log in the product.
- Native reading scenarios passed on generated/copied repository fixtures:
  EPUB import 526.8 ms / turn p95 102.5 ms / full-book search p95 182.8 ms;
  PDF import 707.9 ms / turn p95 59.1 ms / search p95 258.4 ms. Each format
  includes 50 real changed-CFI turns and 5 complete searches. Peak owned process
  tree working set 800,440,320 bytes; private bytes 694,087,680. Sampled entire
  owned profile/test-tool footprint peaked at 33,845,696 bytes, including fixtures;
  this is an observed high-water sample, not an unsampled absolute peak. Source
  and sandbox fixture SHA-256 were unchanged; the passing profile was removed.
- Those tests exposed a real PDF.js 6 resource disposal incompatibility. A
  failing-before real Chromium test reproduced pdf.destroy being absent. The
  checked reader preparer now reproducibly uses and returns loadingTask.destroy;
  comic PDF rasterization awaits teardown. Real repeated-disposal regression
  passes; native equivalent added. No unpublished submodule gitlink is staged.
- Closed document content is now released independently from retained metadata/
  annotations, after the final reader and speech owners finish. Another pane,
  background speech and a concurrent reopen retain their resources; tests cover
  failure cleanup and an old teardown not erasing a reopened document. Full
  speech/native/UI regression of this follow-up remains pending.
- Review additionally reproduced early release during pending native speech
  shutdown and skipped controller shutdown after a media-unbind exception.
  Speech now has a separate idempotent book-owner lease through settled teardown;
  stopped UI state cannot release that lease early, and media cleanup failures
  do not prevent controller/file cleanup. Replacement-owner regressions pass.
- Local source checks after these changes: TypeScript/Biome pass; 416 unit files,
  5,077 tests passed / 1 inherited skip. The prior full Chromium run passed
  325 tests / 1 inherited skip; exact frozen native/browser/package qualification
  remains in progress. No gate or timeout budget was reduced to obtain PASS.
- The evening scan newly identifies six Next.js/DOMPurify advisory records;
  published fixes 16.4.1 / 3.4.17 replace the earlier package versions. The
  failed hosted security gate remains recorded rather than waived. The separate
  Chromium installation failure explicitly says Ubuntu 26.04 is unsupported;
  all Linux PR verification jobs now pin the already qualified Ubuntu 24.04
  LTS instead of the moving ubuntu-latest alias. A failing-before workflow
  regression guards that choice; browser/native tests are not removed/retried.

1. Reconcile the latest full local checks and PR #10 checks, including the
   protocol-dispatch fix and real packaged-runtime CI step. Preserve current
   candidate identities; do not merge main while internal gates remain open.
2. Complete the performance scenario matrix from PERFORMANCE_BASELINE.md:
   first interactive library frame, EPUB/PDF import-to-readable, 50-turn p95, full-book search p95, 20/5000-segment
   mock queues, workspace atomic save and warmed overlay update. Record fixture
   hashes, hardware/runtime, byte/worker/cache budgets and scope. Existing
   heartbeat/workload results do not substitute for these measurements.
3. Verify model-dependent OCR/inpainting evidence from already authorized local
   packs where available; do not download models or claim deferred corpus/human
   quality/minimum-host/signing/legal gates passed.
4. Requalify the dictionary stylesheet containment change in native WebView2 and
   the new exact-source standard package. The demonstrated defects affected
   stylesheet scope and overlay containment; no new script/native-code exploit
   is claimed.
5. Fresh final full regression and reviewed PR #10 CI (including the new real
   packaged-runtime gate), final documentation, normal protected merge, exact
   canonical-main package/provenance binding and safe cleanup. Do not move old
   tags or label a previous candidate as a new main build.
