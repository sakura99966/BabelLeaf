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
