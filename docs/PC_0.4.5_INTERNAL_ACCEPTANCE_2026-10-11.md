# BabelLeaf 0.4.5 internal PC qualification

## Verdict and scope

Verdict: **INTERNAL_IMPLEMENTATION_PASS / EXTERNAL_VALIDATION_DEFERRED**.

All reopened internal AUD-01 through AUD-08 and follow-up PC implementation
gates are qualified on the frozen implementation below. This is not signed
production or full external acceptance. No 0.5 implementation is included or
authorized. The owner explicitly deferred the external gates in this record.

This record supersedes the OPEN/TODO implementation and candidate-qualification
states in `AUDIT_REMEDIATION_0.4.4_2026-09-19.md`, without erasing its failing-before
evidence. It does not rewrite historical 0.4.3/0.4.4 tags, assets or measurements.

## Source and closure controls

- Product/package/crate version: `0.4.5`; Tauri inherits the package version.
- Frozen implementation: `c66d118b0e64ab87805a19ca28c83a99462c9554`.
- Source tree: `b58c94430052739d350c1fc35d21c72bc08c0eee`.
- PR: https://github.com/sakura99966/BabelLeaf/pull/7, against main.
- Hosted PR test checkout: `f7496441e44108daa08ec813b24916adfc905535`.
  Its tree is exactly the frozen implementation tree; its parents are the
  baseline main `56048657b2cb9dc27492f19f002b352beb68d91f` and the frozen head.
- PR checks: https://github.com/sakura99966/BabelLeaf/actions/runs/38132329138.
  All twelve lanes passed, including required-checks. Linux browser connection
  timed out before test execution on attempt 1; one same-source rerun passed
  all 120 integration tests. The initial failure is retained, not hidden.
- CodeQL: https://github.com/sakura99966/BabelLeaf/actions/runs/38132329132.
  All three analyses passed. Branch-protection rules are retained; no bypass.
- Final documentation-only commits must pass their own required checks before
  normal protected squash/rebase merge. Canonical main identity is PR 7's
  mergeCommit, not the PR test checkout. Post-merge packages must be rebuilt
  against canonical main, not relabelled from an earlier build.
- Exact post-commit package/SBOM/performance identities belong in the generated
  `BabelLeaf_0.4.5_RELEASE_EVIDENCE.json` and checksum file beside the artifacts.
  Those records and the successful main checks establish final Git/package
  closure; this document alone is not proof that a merge or upload occurred.

The source checkout applies the tracked deterministic Foliate security patch
through `scripts/prepare-reader-security.mjs`. Dirty submodule status in build
receipts reflects this known generated patch and CRLF/stat-only vendor state,
not an undisclosed application edit. Do not omit that fact or stage unpublished
gitlinks. Preserve the source patch and upstream notices.

## Complete automated matrix

Raw logs are preserved under `target/audit-20260919`; October 11 filenames
identify the actual run date despite the historical parent directory name.

| Gate | Result / evidence |
| --- | --- |
| Frozen install / pnpm identity | PASS; pnpm 11.1.1; `install-candidate-045-20261011.log`; Git hooks remain enabled |
| Type/Biome lint | PASS; 1,109 files; `lint-native-readiness-20261011.log` |
| Formatting / diff | PASS; 1,143 files; `format-native-readiness-20261011.log`; git diff --check |
| Full unit suite | PASS; 394 files, 4,900 passed / 1 inherited skipped; `push-native-ready-20261011.log` |
| Exact-head coverage | PASS; 53.33% statements, 46.19% branches, 51.45% functions, 54.68% lines; thresholds unchanged; `ci-c66d118b0-coverage.log` |
| Real-browser suite | PASS; 26 files, 320 passed / 1 inherited skipped; `browser-candidate-045-20261011.log` |
| Web UI Playwright | PASS; 23/23; Next development server; `web-e2e-candidate-045-20261011.log`; do not describe this lane as a production-server run |
| Production Web build/contracts | PASS; static webpack export; `build-web-c66d118b0-20261011.log`, `build-web-check-c66d118b0-20261011.log` |
| Production Tauri frontend and standard NSIS | PASS; `build-standard-c66d118b0-20261011.log`; embedded resources and offline WebView2 installer |
| Rustfmt / strict application Clippy | PASS; application package scope, -D warnings; `rust-clippy-ready-20261011.log`; MSVC linker import-library messages are informational |
| Rust application tests | PASS; 52/52; `rust-tests-ready-20261011.log` |
| Native Tauri integration | PASS; 5 files, 120 passed / 1 inherited skipped; `tauri-window-ready-20261011.log`; hosted Linux same suite also passed |
| Native Windows UI | PASS; 27/27; `wdio-ready-candidate-045-20261011.log` |
| Native process/workload matrix | PASS; eight phases; `native-window-ready-20261011.log`; hosted receipt `ci-native-c66d118b0/result.json` |
| Legal generated format matrix | PASS; 39 generated fixtures / 48 manifest entries, external-required=0; native and Web import lanes exercise parser routes |
| Production JavaScript security | PASS; zero advisories at all severities; `pnpm-audit-candidate-045-20261011.json`; not a dev/all-platform zero-advisory claim |
| Windows-target Rust security | PASS WITH TRACKED WARNINGS; zero vulnerabilities, 15 warnings; `rust-audit-candidate-045-20261011.json` |
| Standard installer preflight | PASS; product/version/identifier/current-user/offline-WebView2 configuration; `installer-preflight-c66d118b0.log` |
| Dedicated smoke installer lifecycle | PASS; install, responding window, uninstall, retained sentinel and owned-state cleanup; `installer-smoke-c66d118b0.log` and success.txt |
| Standard executable idle/portable gate | PASS; exact binary SHA below, 60-second warmup / 300-second idle; performance.json |
| Strict artifact-bound SBOM | PASS; CycloneDX, 796 components, zero gaps, complete production graph; exact package SHA recorded |

The shared inherited skip is Turso's FTS UPDATE regression in
`src/__tests__/database/suites/fts-tests.ts`. Production reader search does not
call fts_match; the current indexing policy is delete/insert. Keep the skip and
upstream follow-up visible. It is not a waived active PC workflow or an
external gate. Coverage is a regression threshold, not 100% path proof.

## Functional coverage and corrective closure

| Requirement / audit | Implementation and checks |
| --- | --- |
| Local formats, library, appearance, annotations and source preservation | Native 27-test format import matrix, Web 23-test UI matrix, format-fixture/diagnostic and parser tests; DRM, malformed and resource-limit diagnostics remain explicit |
| Provider setup, selection/unit/chapter/book translation | Named-provider and network-contract tests, completion/cancellation/error tests; application-owned prompts and endpoints; only explicit user requests; no real paid calls |
| Bilingual alignment, glossary, memory, review and interchange | translator/anchor/artifact, glossary, memory, review, TBX/TMX/XLIFF and dashboard regressions; stable source identities and credential-free sidecars |
| Comic OCR, region editor, bilingual overlay, mask and typesetting | OCR/workspace/worker/model-pack/edit-sidecar/pipeline tests and browser UI; concrete local Tesseract WASM and optional verified LaMa paths remain lazy; missing packs fail clearly; no bundled or downloaded weights |
| Separate image/CBZ/ZIP/image-only PDF export | Export/typesetting/source-protection tests; worker byte/count/cancellation budgets; native archive workload; no source overwrite |
| Local dictionary and speech | Real MDict import/persist/enable/lookup/removal in native UI; native English/Japanese/zh-CN synthesis completion; no online dictionary/cloud speech fallback; human listening remains external |
| AUD-01 untrusted content | SVG/EPUB sanitization, fail-closed sanitizer, no script opt-in/eval or sandbox allow-scripts; native hostile-document/IPC sentinel and positive-control probes in the corrective ledger |
| AUD-02 scoped enumeration | Absolute scoped root/entry validation, junction rejection, count/depth/time limits, no denied-native JS fallback; actual granted-root/4,096-file and junction probes |
| AUD-03 local writes and close protection | Path serialization, same-origin Web Locks, atomic replacement, schema-aware previous backup, identity/timestamp merges and conflict policy; text pending journals; comic dirty-result retention and local flush; multi-WebView concurrency, actual cross-window quit veto and kill recovery |
| AUD-04 complete translation output | SDK finishReason=stop / Anthropic end_turn only; partial/cancelled output never accepted into successful caches; safe status/Retry-After errors preserved |
| AUD-05 recoverable queue/checkpoints | Retry latest dirty snapshot locally before request/resume; no paid reissue after a local write failure; pause/error/dashboard visibility, checkpoint-tail recovery, restart and pending-result replay tests |
| AUD-06 dictionaries | 64 MiB ordinary-gzip output, 512 MiB input, 8 MiB reads, bounded cancellable worker; lazy RA/32-chunk LRU; transactional staged import and rollback preserve prior data; native 32 MiB gzip workload |
| AUD-07 dependencies | Updated production resolutions, frozen install, unchanged audit thresholds, fresh strict SBOM and Windows-target Rust disposition; no fabricated versions or audit suppression |
| AUD-08 archives | Count and cumulative final-byte checks before collection growth, transferred buffers and cancellable/terminated worker; eight authored PNGs exported twice and third cancelled; active workers return to zero |
| Follow-up request cache | Context-aware, complete-result-only cache; 512 entries / 8 MiB estimated UTF-16 string payload; 2,048 persistent rows; new row <=64 KiB UTF-8; same-transaction pruning; real IndexedDB/CJK regressions; no eager hydration or pruning timer |
| Native harness handshake | Await the owned post-window-build PID marker before /session; stale/missing/exit/access regressions; only webdriver-feature windows are initially visible; production startup and permissions unchanged |

Internal alternatives in old TODOs (disk-backed gzip/export streaming, paging,
cross-process CAS, richer provider usage records) are not all required to make
the approved bounded PC path correct. Do not restore unsafe/unbounded code, but
do not expand 0.4 solely to implement every possible alternative.

## Qualified candidate artifacts and resource evidence

Candidate directory: `target/releases/0.4.5/c66d118b0`. These exact bytes are
qualified candidate evidence, not a claim they were built from the later main
merge. Windows rebuilds are not byte-for-byte reproducible.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| BabelLeaf_0.4.5_x64-setup.exe | 247812504 | c25d864970c42fe2b459a6adfc939cf2ddf97744c6f5c5f50c0e960740b4dad4 |
| babelleaf.exe | 61385216 | 31e944b87d6636677bd3fb34739f09e5c16170bc387ab44bc0df7fb1f540f1da |
| BabelLeaf_0.4.5_SBOM.cdx.json | 364118 | b2b63973823d612eeba21d0f59f488503e5d5d91778ed8b66b6916adb254ccb6 |

- Standard executable startup: 159.63 ms, budget 2,500 ms.
- Warmup peak: 379.97 MiB over 60 seconds; recorded separately from idle.
- Idle process-tree peak: 110.49 MiB over 300 seconds, budget 350 MiB.
- Idle private-byte peak: 177.34 MiB. Portable placement and profile cleanup pass.
- Local synthetic workload peak: 744,767,488 working-set bytes / 533,704,704
  private bytes, 20 samples at 200 ms, budget 1 GiB; maximum heartbeat gap
  11.8 ms, budget 500 ms; four workers created / zero retained.
- Hosted workload peak: 667,627,520 working-set bytes / 441,274,368 private
  bytes, 27 samples at 200 ms; maximum heartbeat gap 11.7 ms; zero retained workers.
- Workload host is i9-13900K / approximately 128 GiB RAM, not the minimum class.
  Sampling is not instantaneous allocation proof. The authored workload is not
  representative OCR/LaMa quality evidence. Idle and workload budgets differ.
- Both standard and smoke packages are unsigned; standard installer <=250 MiB.

## Boundaries, residual risks and deferred gates

- Recovery probes cover process kill at controlled commit points, not power
  failure, storage-controller loss or simultaneous destruction of both copies.
  Atomic snapshot replacement and pending journals are not a database transaction.
- Successfully persisted text pending results are replayable. Comic write
  failures remain in the protected current session for local retry; there is
  no guarantee of a new comic result surviving forced kill on an unwritable
  device. Normal guarded close retains it. Do not claim impossible durability.
- Directory deadlines are checked between OS operations; blocking OS I/O is not
  forcibly interrupted. Gzip and archive output remain bounded in-memory, not
  disk streaming. Model cancellation occurs at the supported worker/stage boundary.
- Cache string estimates exclude JavaScript object/engine overhead and legacy
  disk allocation. Cache eviction never prunes authoritative sidecars.
- Rust warnings: 11 unmaintained, 3 unsound, 1 yanked. glib is absent from the
  Windows graph; old rand/chacha entries are not resolved. Reachable lru 0.16.4
  is Tantivy's usize/Block get/put cache, not the advisory's pop/panicking-Drop
  call path. Retain RUSTSEC-2026-0253 and compatible upstream upgrade tracking.
- Owner-deferred: paid DeepSeek/OpenAI/Anthropic credentials and calls; lawful
  representative books/manga with human OCR/repair ground truth; separate
  minimum-spec clean Windows machine and exact standard installer lifecycle;
  human audio review; Authenticode authority; owner model/font/data/license review.
  Existing synthetic/runtime-contract checks do not replace these gates.

No external gate is PASS. Future platform work requires a fresh user request;
keep local-only import, explicit named-provider translation, no scraping/sync,
no cloud TTS, no implicit model downloads and no source modification.

## Safe closure and handoff

### Final closure follow-up

The documentation-only head 7637486da reproduced the Linux browser-session
startup timeout before any integration assertion. The passing same-source
rerun above is a historical receipt, not proof of a fully stable harness.
The Windows-only readiness behavior is now explicitly cfg-gated to Windows
webdriver builds; Linux and production startup retain their original policy.
Vitest's browser API now binds explicitly to 127.0.0.1, matching WebDriver and
the test-only IPC origin. No shipping permission is widened. Fresh required
checks on the final head, not a rerun of older checks, remain the merge gate.

A live open-alert check also found CodeQL #9: the local-only production-Web
preview script returned exception details. A real HTTP malformed-URI regression
failed before the fix; the response is now a generic 500 and traversal remains
404. Two new tests pass. Evidence: closure-followup-before-20261011.log,
closure-final-followup-20261011.log and native-loopback-before-20261011.log.
The preview script is not embedded in the Windows application, but is fixed
instead of dismissing the finding. Post-commit evidence records the final
full-suite counts and canonical source; the c66d118b0 table remains exact
historical candidate evidence, not a claim of a later build identity.

Other open main alerts are explicitly retained, not dismissed through the API:
CodeQL #7/#8 are controlled-fixture SSML text extraction in unit tests, not a
production sanitizer or an HTML rendering sink; #6 is Android's test-only CDP
Runtime.evaluate helper, where JSON string literals are evaluated directly and
not inserted into script-tag HTML. These do not ship in the PC runtime. Scorecard
#2/#3/#4 concern repository review/maintenance/badges; #5 scans all-platform and
development dependency manifests on historical main. Fresh target-specific
production audits and the resolved warning dispositions above establish the PC
dependency gate, not a zero-alert claim for every manifest or governance score.
Reconcile the alert state after canonical-main CodeQL/Scorecard runs; do not
suppress a new reachable production finding or expand into Android development.

After required checks, review and merge PR 7 normally, fetch/fast-forward main,
verify local/remote SHA, qualify canonical-main artifacts and main CI, and retain
their generated provenance records. Remove the merged audit branch only.

Finally remove individually resolved reproducible .next/out and compiler
caches. Preserve node_modules/public vendor resources needed for continued
development; preserve all source, credentials, user data, model packs, release
artifacts, raw logs, failed-test receipts, hashes, manifests and reports. Never
delete target or the shared pnpm store wholesale. Reapply the tracked Foliate
security preparation on subsequent development/build entry points.
