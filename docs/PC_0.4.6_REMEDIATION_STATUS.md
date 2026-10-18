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
- Final product implementation baseline for current candidates:
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
- Real standard-binary probe passes without a dev server or webdriver feature:
  product BabelLeaf 0.4.6, hydrated empty library, 226 embedded assets /
  28,858,205 bytes individually verified against source hashes, and removed
  owned portable profile. The reusable test:windows-packaged-runtime command
  now checks loopback endpoint process ownership, source manifest equivalence,
  variant/version, bounds, streamed bytes and cleanup; Windows CI runs it
  before the installer lifecycle. Twelve input/CI-contract regressions added.
- Same-product frozen regressions: Chromium 321 passes / 1 inherited skip;
  native integration 121 passes / 1 skip; native UI 27 passes; 11-phase
  process interruption/recovery PASS. The dedicated smoke package installs,
  launches with a responding window, uninstalls and retains its data sentinel.
  Full idle measurement is currently running; it is not yet marked PASS.

## Remaining internal closure work (no 0.5)

1. Finish current standard-EXE 60-second warmup / 300-second idle receipt and
   preserve the smoke installer/executable before bounded compiler-cache cleanup.
2. Complete the performance scenario matrix from PERFORMANCE_BASELINE.md:
   EPUB/PDF import-to-readable, 50-turn p95, full-book search p95, 20/5000-segment
   mock queues, workspace atomic save and warmed overlay update. Record fixture
   hashes, hardware/runtime, byte/worker/cache budgets and scope. Existing
   heartbeat/workload results do not substitute for these measurements.
3. Verify model-dependent OCR/inpainting evidence from already authorized local
   packs where available; do not download models or claim deferred corpus/human
   quality/minimum-host/signing/legal gates passed.
4. Review dictionary stylesheet scope as well as active-code/resource sanitizing:
   MDict already uses a shadow root; confirm StarDict/SLOB style rules cannot
   affect application chrome. This is a follow-up inspection target, not a
   newly demonstrated script/native-code exploit.
5. Fresh final full regression and reviewed PR #10 CI (including the new real
   packaged-runtime gate), final documentation, normal protected merge, exact
   canonical-main package/provenance binding and safe cleanup. Do not move old
   tags or label a previous candidate as a new main build.
