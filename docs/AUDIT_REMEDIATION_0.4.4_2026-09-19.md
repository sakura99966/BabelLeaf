# 0.4.4 audit remediation checkpoint — 2026-09-19

Status: **IMPLEMENTATION AND VERIFICATION IN PROGRESS; NOT RELEASE ACCEPTANCE**.

Scope: `INDEPENDENT_AUDIT_0.4.4_2026-09-08.md`, AUD-01 through AUD-08. No 0.5 feature work, no release tag, no replacement of historical acceptance evidence. Baseline commit: `56048657b2cb9dc27492f19f002b352beb68d91f`.

## Implemented changes

| Audit | Current implementation | Remaining closure evidence / work |
| --- | --- | --- |
| AUD-01 | Sanitize SVG spine content; remove script opt-in setting, inline eval and loader script permission; fail closed on sanitizer failure; remove `allow-scripts` from Foliate frame sandboxes. `scripts/prepare-reader-security.mjs` reapplies the exact upstream hardening during build/dev/vendor preparation and fails on unexpected targets. | Exact native malicious EPUB/SVG probes; ensure selection, links, fixed layout and reflow continue working. No RCE or API-key leak was established by the original audit. |
| AUD-02 | Remove `Readest` path-substring exception; require absolute, traversal-free, filesystem-scoped paths for root and entries. Bound traversal to 100,000 visited entries, 32 levels and 5 seconds between filesystem operations. No JS fallback after native denial. Native denial and explicitly granted temporary-root tests pass. | Expand reparse-point/large-directory matrix. A blocking OS I/O call is not forcibly interrupted by the time budget; cancellation/paging is not implemented. |
| AUD-03 | Serialize JSON reads/writes by path, use Web Locks across same-origin windows when available, and use native same-directory temporary-file replacement. Merge artifact segments by identity/timestamp; merge translation-memory deltas instead of replacing unrelated entries. Add schema-aware backup fallback for artifact/job/memory loads. Keep failed reader saves in memory, display persistent warning and provide local-only retry; guard in-flight results against changed translation context. | Actual two-WebView concurrency and process-interruption tests; monotonic revision/CAS and previous-committed backup protocol are not implemented. Current backup-first pair is not one atomic transaction. Model/prompt generation conflicts, same-millisecond edits and delete/save races require explicit policy/tests. Closing a reader/process with unsaved data can still lose the in-memory buffer; no durable emergency journal/native close veto exists. |
| AUD-04 | Accept SDK output only with `finishReason=stop`; Anthropic only with `stop_reason=end_turn`. Reject partial output before successful cache/memory/sidecar insertion. Anthropic HTTP errors retain status and Retry-After through safe normalization. | Unified structured completion/usage contract remains to be reviewed. Live paid-provider validation remains external. |
| AUD-05 | Recover internal checkpoint tails after failures while retaining dirty data; surface failures from flush and pause the queue. Resume/retry/invalidate first flush local writes. Translation-memory storage failures no longer reissue a completed paid translation request. | Main/backup failure at multiple points, persistent and intermittent errors, UI failure visibility in batch dashboard, and kill/restart recovery matrix. |
| AUD-06 | Actual decompressed-output cap (64 MiB ordinary gzip), 512 MiB input cap, 8 MiB read cap, bounded native decompression stream with abort and timeout; preserve lazy RA chunks and use Blob slices for raw bodies. Dictionary-name probe capped at 1 MiB output and 4 KiB text. | Ordinary gzip currently retains bounded output in memory, not a disk-backed worker. Transactional import staging and lowest-spec responsiveness/memory measurements remain. RA damage/truncation/range consistency need additional adversarial fixtures. |
| AUD-07 | Upgrade Next to 16.3.3, provider-utils to 4.0.33 (port retained compatibility patch), patch browserslist/baseline-browser-mapping/fflate/sharp, rustls 0.23.45 and rustls-webpki 0.103.15. Keep existing audit thresholds. Disable generated Next agent-rule edits and development telemetry in Next configuration. | Frozen install, final exact candidate build, updated candidate SBOM/hashes and remote CI. Windows-target Rust audit must not be misreported as all-platform zero findings. |
| AUD-08 | Enforce count before rendering, cumulative final-page byte budget after each render/conversion; PDF converts before collection. Archive work runs in a cancellable worker with transferred input/output buffers; terminate on completion/error/timeout/abort. Cancel control and close/unmount cancellation added; cancelled file dialog no longer reports successful export. | Peak working-set and native WebView responsiveness under representative workloads; this is bounded in-memory packaging, not streaming-to-disk. LaMa/page rendering is only checked for cancellation between awaited stages. |

## Regression evidence completed

Failing regressions were observed before fixes for script opt-in, out-of-order JSON writes, SDK truncation, checkpoint-tail poisoning, directory substring authorization, gzip output budget, export preflight, multi-instance translation memory, paid-request duplication on memory write failure, and schema-invalid main-file recovery.

- Final full unit/coverage run: **388 files; 4,798 passed, 1 skipped**. Coverage: statements 52.29%, branches 45.36%, functions 50.37%, lines 53.60%; existing thresholds passed. Evidence: `target/audit-20260919/coverage-final.log`.
- Full Chromium suite: **25 files; 316 passed, 1 skipped**. Includes browser SVG sanitizer, real DecompressionStream budget and actual archive worker/transfer tests.
- Rust library tests after rustls upgrade: **52 passed**.
- Rust clippy after rustls upgrade: passed (`cargo clippy -p Readest --no-deps -- -D warnings`). Dependency linker-message warning is not an application clippy error.
- Final TypeScript, Biome lint, format and `git diff --check`: passed.
- Final production static build on Next 16.3.3: passed. Build-output translation and lookbehind checks: passed. Evidence: `target/audit-20260919/build-final.log`.
- Frozen-lockfile installation with Corepack pnpm 11.1.1: passed.
- Schema-fallback/artifact/job/memory targeted rerun: **17 passed**.
- 2026-09-19 production pnpm audit: **0 advisories** across all severity levels.
- Fresh RustSec database revision `2b34578f89884736e0fcbd42f7ba8d6b10b4a0ce`: Windows-target vulnerability count **0** after upgrade. All-platform scan also includes out-of-scope `nix` 0.19.1 and informational notices; do not erase those from reporting.
- Source SBOM: `target/audit-20260919/sbom.source.json`, **816 components, 0 gaps**. This is not an installer-bound SBOM.
- Native Tauri integration: **4 files; 112 passed, 1 skipped**, including ungranted Readest-name directory rejection and native temporary-file replacement. Evidence: `target/audit-20260919/tauri-integration-host-final.log`.
- Web E2E: **23 passed**, evidence `target/audit-20260919/web-e2e.log`. This run used the development web server; it is not an exact packaged-artifact test.
- Native Windows WDIO E2E: **27 passed**, evidence `target/audit-20260919/native-wdio.log`; includes native format matrix, MDict lifecycle, Simplified Chinese, viewport, muted speech, IPC and local-only traffic checks.
- Format generator in native E2E: **39 local fixtures generated; 48 manifest entries checked; external-required=0**. This does not replace representative real-world books/OCR ground truth.

## Environment and reproducibility notes

1. Use `corepack pnpm` (repository pin 11.1.1). Direct `node node_modules/vitest/vitest.mjs` was used when pnpm executable resolution failed. Do not downgrade the package-manager guard.
2. Some dictionary unit fixtures need Node's standard File implementation because jsdom File lacks `.stream()`. Production browser streaming is tested separately; do not add an unbounded decompression fallback to satisfy a test double.
3. Existing user RustSec cache contained an invalid historical `RUSTSEC-0000-0000.md`. It was not removed. A fresh isolated DB was fetched into `target/audit-20260919/advisory-db`.
4. i18n scanner generated unrelated destructive resource changes. Those generated changes were restored from the previously clean baseline. Only one new warning key was added across 34 locale resources; no untranslated placeholders remain. Do not rerun the old scanner and commit its mass deletions.
5. Foliate is an upstream submodule. Do not commit a gitlink to an unpublished local commit. The tracked preparation script reproduces the working-copy sandbox hardening. Original upstream notices remain intact.
6. Native WebView construction timed out in the restricted sandbox at `window-build-started`. The normal-host rerun entered tests and exposed one permission failure in the old test harness. The harness now creates and explicitly grants an isolated temporary root **only under the `webdriver` feature**; the final normal-host integration run passed. Do not restore the production substring exception or grant arbitrary directories to satisfy test fixtures.

## Next execution order

1. Extend native integration with exact hostile-content and cross-window/crash cases; existing path/atomic-replacement probes pass.
2. Complete AUD-03/AUD-05 conflict, crash and persistent-storage-failure semantics above; test warning and retry under React and native lifecycle, including provider switches.
3. Complete remaining dictionary/import and export resource-boundary cases; apply shared sidecar input budgets (bytes, entries, strings, count consistency) before claiming hostile-input closure.
4. Rerun full unit/coverage/browser/Rust/type/lint/format; production build and output checks; Web E2E and native WDIO. Persist command exit status alongside logs.
5. Build isolated Windows candidate and execute install/start/uninstall/data-retention validation against that exact artifact. Regenerate artifact-bound SBOM/checksums and review all diffs.
6. Commit and push a reviewable remediation branch as backup; merge main only when the applicable gates are satisfied. No release/acceptance declaration based solely on mocks or a successful compiler exit.

## Continuation checkpoint: committed-copy recovery

- Backup branch `codex/audit-044-remediation-20260919` was pushed to origin at `a86db0594106f1ced040797a2c2399dcd079db3f`; main and release tags were not changed.
- Follow-up AUD-03/AUD-05 fix: before replacing a readable main JSON file, preserve that main in `.bak`, instead of writing the uncommitted new snapshot into both copies. A readable backup survives replacement of a corrupt/missing main. If neither copy is readable, the initial snapshot still bootstraps backup-first recovery. This supersedes the previous-committed-backup TODO above only for readable JSON snapshots, not schema guarantees, cross-process CAS or durable transaction semantics.
- Regression probes for both `safeSaveJSON` and `updateJSON` failed before the fix: a failed main write left backup revision 2 instead of committed revision 1. Both pass after the fix, including retry and subsequent corrupt-main recovery. Additional tests cover backup write failure (main remains unchanged) and preservation of a readable backup with corrupt main.
- Follow-up full unit run: 388 files, 4,802 passed, 1 skipped; TypeScript and Biome lint passed. GitHub Actions query returned no runs for the backup branch; remote CI is not yet verified. Earlier browser/native/build evidence predates this persistence follow-up and is not exact-candidate evidence for it.
- Frozen install and source production build were already verified above; the remaining AUD-07 build gate concerns the exact installer candidate, not repeating dependency installation without cause.
- Cross-WebView/process-kill tests, durable unsaved-reader recovery, representative resource measurements and exact installer lifecycle remain open. No release acceptance is claimed.

## External gates unchanged

Real supplier credentials and explicit paid-call authorization; lawful representative OCR/comic corpus and human ground truth; exact standard installer lifecycle on an independent minimum-spec Windows system; EN/JA/zh-CN voice listening review; signing and signed-package validation; license/model/font/AGPL responsibility review. These remain outside automated local PASS claims.

## PC-only continuation with external verification deferred

Owner instruction on 2026-09-19: temporarily skip external verification. Those
gates are DEFERRED, not PASS; this does not authorize 0.5 implementation or any
paid request. Current automation scope remains the 0.4 PC audit remediation.

- Draft PR: https://github.com/sakura99966/BabelLeaf/pull/7. CI is now triggered
  through the repository's existing pull-request workflow; branch pushes alone
  do not trigger it. Do not infer the newest worktree passed from an older SHA.
- Reader lifecycle: remove the fire-and-forget throttle from awaited close
  paths, await configuration saves before destroying content, gate close on
  actual in-flight translation operations and local pending saves, and retain
  failed results for retry. Before-unload uses a synchronous protection check.
  The guard survives viewport counter resets. It is not a crash journal or a
  cross-window application-exit protocol; those remain open.
- Text artifacts: cap at 100,000 segments, 1,048,576 characters per string field
  and 32 Mi characters across direct segment fields; reject duplicate IDs and
  revalidate the merged result. Three regressions failed before the fix. These
  are object-validation budgets, not a bounded filesystem read/JSON decoder;
  nested anchor and interchange-file byte budgets remain to be completed.
- Native hostile-content corpus: locally authored XHTML and fixed-layout SVG
  EPUBs exercise actual Foliate rendering in WebView2. XHTML deliberately
  bypasses sanitization to exercise the sandbox; SVG exercises the sanitizer.
  Parent marker stays unchanged, active SVG nodes are removed, drawing/text and
  ordinary XHTML selection/link targets remain. The initial SVG probe selected
  an empty facing-page frame; selecting the actual section index corrected the
  harness. Final native run: 115 passed, 1 skipped, including two independent
  native service instances performing 20 locked read-modify-write operations
  and corrupt-main recovery to the previous committed snapshot. This is NOT
  two separate WebViews or process-kill evidence.
- Browser suite: 316 passed, 1 skipped before the subsequent dictionary change.
- Dictionary import: copy into fresh UUID directories; reject an already
  existing destination; retain all pre-existing bundles until a recovery-aware
  metadata/garbage-collection protocol can prove they are unreferenced. On
  preparation failure, remove only directories created by this import call.
  Regression probes reproduced premature old-bundle deletion, leaked partial
  imports and reuse of existing destinations before fixes. Old retained copies
  are recovery data, not disposable cache. Metadata rollback in the UI and
  recovery-aware garbage collection still require explicit verification.
- Candidate packaging is in progress. The first smoke package predates final
  in-flight accounting and dictionary changes and is superseded; it must not
  be used as exact-candidate proof for this checkpoint.

## 2026-09-20 verification of commit 02643f220

Source: `02643f2207d112a79dcac7f16cd686aeff40a425`. The following evidence
applies to this commit, not to later follow-up changes.

- GitHub PR workflow run `35452135061`: SUCCESS, head SHA verified; all required
  jobs passed, including Windows installer smoke, native E2E, browser tests,
  Web E2E, coverage, Rust lint/tests, build and dependency/security audit.
  CodeQL run `35452135070` also passed.
- Local isolated NSIS lifecycle: PASS. The installed executable opened a
  responding window; uninstall completed and preserved the data sentinel.
  Evidence: `target/audit-20260919/installer-02643f220.log` and
  `target/audit-20260919/installer-02643f220/success.txt`.
- Strict installer-bound SBOM: 816 components, zero gaps, generated through
  normal-host execution. The earlier restricted `--help` invocation was not a
  supported help mode and produced an incomplete fallback source inventory
  (593 components, 8 gaps); that fallback is not accepted evidence.
- Installer SHA-256:
  `0faeb4e6c27f2869c0672684d89581803cdcf0ebdec7c2574b8e8743b7f28a30`.
- Executable SHA-256:
  `a8abd306b84dd0d6b48d9614d16ffbf17e6feb4e6f948aaa5199bfe055de7499`.
- SBOM SHA-256:
  `76b30c29f23ac6b2abc311807f84a2a48b7cd4d3d546f681b100846caa615f18`.
- This is the independent **BabelLeaf Smoke** identity, not a clean-host test
  of the production product identity. External checks remain DEFERRED by the
  owner. Main and historical release tags remain unchanged.
- Exact executable performance: PASS; responding-window startup 154.57 ms,
  60-second warmup peak working set 358.47 MiB, 300-second idle peak working set
  118.41 MiB and peak private memory 189.49 MiB. Startup budget is 2,500 ms;
  the 350 MiB budget applies to idle, not warmup. Portable placement and
  temporary profile cleanup passed. Evidence:
  `target/audit-20260919/performance-02643f220.json`. This measures window
  response and idle, not book-open latency or OCR/export workload peaks.

## 2026-09-20 follow-up: failed-save state consistency

Three defects were independently reproduced before fixes:

1. A failed older pending-artifact write arriving after a successful newer
   merged save left `hasUnsaved=true` with an empty retry queue. The error flag
   now reflects retained pending entries; a stale failure cannot permanently
   pause the reader's translation queue after its data was committed.
2. Dictionary settings were published to the global in-memory settings before
   disk persistence. On failure the UI retained the uncommitted replacement.
   Publish only after successful persistence, restore the committed dictionary
   view on failure, and do not discard newer local edits during rollback.
   Previously retained bundle files remain available to that restored view.
3. Malformed JSON in both main and backup copies was treated as an absent typed
   store. Schema-validated loads and read-modify-write transactions now reject
   with a readable-copy error instead of silently returning the empty default.
   Missing-file initialization and valid backup recovery remain supported.

Verification: full unit/coverage 389 files, **4,815 passed, 1 skipped**;
statements 52.38%, branches 45.42%, functions 50.45%, lines 53.67%; TypeScript,
Biome lint and diff whitespace checks passed. Native integration **115 passed,
1 skipped**. Native WDIO **27 passed** after the first two fixes but before the
final malformed-copy change. Logs: `coverage-recovery-final-20260920.log`,
`tauri-recovery-20260920.log`, `wdio-recovery-20260920.log` under the audit target
directory. The new follow-up is not covered by the older installer/performance
hashes above. Full audit closure remains pending the unresolved items in the
implementation table and next-execution list; do not mark main/release accepted.

## 2026-09-20 follow-up: ordinary gzip worker isolation

- Browser/WebView ordinary gzip fallback now runs in a dedicated module worker;
  the bounded native DecompressionStream engine is shared with hosts lacking
  Worker support. The PC path uses a worker. No worker starts at module import.
- The initial worker received the Blob and output budget, enforced 512 MiB input and
  64 MiB maximum actual output, and transfers its completed ArrayBuffer back.
  Client timeout/abort terminates the worker independently of stream progress.
  Success, malformed result, worker errors and postMessage failure also dispose
  the worker and timer. Lazy RA chunks and raw Blob range reads are unchanged.
- A failing regression confirmed ordinary gzip previously did not create an
  available worker. Worker lifecycle tests now cover success, cancel, timeout,
  runtime failure and message-send failure. Real Chromium and native WebView2
  tests validate decompression and rejection of actual output over budget.
- Full unit/coverage: **4,820 passed, 1 skipped**, 390 files. Native integration:
  **116 passed, 1 skipped**, five files. TypeScript/Biome lint passed. Evidence:
  `coverage-gzip-worker-20260920.log`, `tauri-gzip-worker-20260920.log` under the
  audit target directory. Real browser security suite: three tests passed.
- This closes the missing worker termination boundary, not disk-backed random
  access or representative workload peak-memory qualification. Output remains
  bounded in memory. Updated exact production candidate validation is still
  required; older candidate hashes above do not cover this code.

### Lazy native-file transport correction

The first worker implementation had a reproduced compatibility defect:
`NativeFile`/`RemoteFile` have empty backing Blobs and lazy overridden reads.
Structured-cloning those objects into the worker transferred no compressed
content (`Compressed input was truncated`). The corrected protocol transfers a
ReadableStream with backpressure and declared input size, keeping lazy native
range reads on the originating side. Worker completion, abort, timeout, and
message failures cancel that input reader and release its lock. It does not
materialize the full compressed file before starting the worker.

Regression evidence: real Chromium lazy-Blob test failed before correction;
all four browser security tests now pass. Native integration writes a synthetic
gzip file, reads it through a real NativeFile and the worker, verifies decoded
content, closes the file and deletes it. The complete native suite passes
**117 tests, 1 skipped**. Full unit suite: **4,820 passed, 1 skipped** across
390 files; TypeScript and Biome lint pass. Logs:
`unit-gzip-stream-final-20260920.log` and
`tauri-gzip-stream-final-20260920.log` in the audit target directory.
The initial native regression run failed only in test cleanup because it used
`removeFile` instead of the service's `deleteFile`; the corrected full rerun
passed. Updated package verification remains required before release acceptance.

## 2026-09-20 follow-up: bounded sidecar file import

- Reproduced the translation workbench reading an oversized selected native
  file before any byte-budget check, without closing its owned file afterward.
  The failing UI regression is retained in
  `target/audit-20260919/sidecar-limit-before-20260920.log`.
- Translation JSON/TSV/XLIFF and OCR JSON imports now share `readSidecarInput`:
  reject invalid sizes or inputs over 64 MiB before reading, request only the
  validated range, and close caller-opened native files on success or failure.
  Picker-owned Files remain owned by the picker/caller. Schema validation still
  follows reading; this does not replace entry/string/count consistency limits.
- Tests cover oversized translation/OCR UI imports without persistence, invalid
  sizes, bounded UTF-8 reads, ownership, failed range reads, and oversized slice
  results. Real native integration reads a small Japanese JSON file through both
  NativeFile and the application-selected file adapter, then deletes it.
- Verification: full unit suite **4,828 passed, 1 skipped**, 391 files before the
  final OCR UI assertion; that expanded OCR component suite subsequently passed
  all five tests. Native integration **118 passed, 1 skipped**; TypeScript and
  Biome lint passed. Evidence: `unit-sidecar-input-20260920.log` and
  `tauri-sidecar-input-20260920.log` under the audit target directory. The Git
  pre-push gate reruns the final full unit suite.
- Remaining scope includes persisted-store byte budgets, nested metadata/string
  limits, job/count consistency, multi-window/crash recovery, and an updated
  artifact-bound installer/SBOM/performance run. External verification remains
  DEFERRED by owner instruction, not PASS. This checkpoint is not release approval.

### WebKit CI follow-up: portable worker input protocol

Remote run `35509852056`, job `106075747010` reproduced `DataCloneError` in
Linux native WebKit when transferring ReadableStream. The job name is
`build_tauri_app`, but the failure was in two native dictionary tests, not a
TypeScript compilation error. Chromium/WebView2 success did not cover this
runtime difference. Local production frontend build at `240c84362` passed.

The worker protocol now requests one input chunk at a time through messages,
transferring only ArrayBuffers. Lazy files remain on the originating side;
the worker reconstructs a stream with backpressure for bounded decompression.
Cached adapter buffers are not detached. No unsupported stream transfer or
whole-input fallback is used. A failed protocol regression confirmed the old
transfer, and cancellation testing checks that an outstanding read cannot send
a late chunk after worker termination. Chromium security regressions pass;
Windows native and full unit reruns are recorded in
`tauri-gzip-portable-20260920.log` and `unit-gzip-portable-20260920.log`.
The replacement Linux CI run must pass before treating this issue as closed.

## 2026-09-20 follow-up: verified CI and job recovery boundaries

Remote CI for exact commit `539e8ec391fb6336694a7b15d79a8ef473987165`
passed in workflow `35510387158`, including Linux native integration,
Windows installer smoke, Windows browser/native E2E, web E2E, coverage,
Rust lint, security audit and required-checks. CodeQL workflow `35510387168`
also passed. This closes the previously reproduced WebKit stream-transfer
failure for that revision, not the remaining audit or external acceptance gates.

Further independent probes reproduced and now regress:

- Job parsing accepted duplicate item identities, inconsistent total/completed/
  failed/cancelled counts, unbounded item arrays and oversized fields. Enforce
  100,000 items, 1 Mi-character fields, 32 Mi-character cumulative item text
  including nested anchors, unique IDs, safe integers and counts derived from
  actual item statuses. Invalid counts are rejected rather than silently repaired.
- Nested anchor strings bypassed artifact cumulative budgets. Include them in
  the aggregate; cap anchor prefix/suffix at the existing generated 96-character
  limit, hash metadata at 64 characters, and locator at 1 Mi characters.
- Dashboard listing did not pass the schema validator to backup recovery,
  unlike direct job loading. A structurally invalid main file could hide a task
  despite a valid backup. Listing now uses the same schema-aware recovery inside
  its per-file error boundary; one unrecoverable file does not hide other jobs.

Failing probe logs under `target/audit-20260919`:
`job-limits-before-20260920.log`, `anchor-limits-before-20260920.log`,
`nested-budget-before-20260920.log`, `job-list-backup-before-20260920.log`.
Native integration after the initial job/anchor changes: 118 passed, 1 skipped
(`tauri-job-anchor-limits-20260920.log`); this predates the final listing fix.
The final full unit rerun is `unit-job-anchor-final-20260920.log`.
TypeScript and Biome lint pass. These changes do not establish cross-WebView
crash recovery, pre-read persisted-file budgets or an updated installer identity.

## 2026-09-20 follow-up: write-boundary validation and truncated copies

All remote checks for `342ff227d159321ae5020d88ea158e7505922a4f` passed,
including required-checks, native/browser E2E, installer smoke and CodeQL.
This is evidence for the preceding commit, not the changes below.

Two additional independently reproduced defects were fixed:

1. `TranslationJobStore.save` could persist a snapshot rejected by its own load
   validator, and observed mutable caller state after its first filesystem await.
   Parse and detach the snapshot before any filesystem operation. Invalid input
   cannot replace either committed copy; later caller edits cannot alter the
   captured payload or destination ID. Tests verify both behaviors.
2. Successful reads yielding empty/whitespace content were classified as absent
   data. When both typed recovery copies were truncated, read-modify-write could
   silently initialize over them. Classify such reads as corrupt, retaining
   schema-aware backup fallback and throwing when neither copy is readable.
   Missing-file initialization and untyped legacy defaults remain unchanged.
   This does not yet distinguish every native permission/I/O error from absence.

Failing probes: `job-save-before-20260920.log` and
`empty-store-before-20260920.log` under `target/audit-20260919`.
Final full unit suite: **4,848 passed, 1 skipped**, 391 files
(`unit-save-empty-final-20260920.log`). TypeScript/Biome lint and whitespace
checks passed. A native regression creates zero-byte main and whitespace backup,
verifies typed load/update fail, and verifies both files retain their contents;
native suite log: `tauri-save-empty-20260920.log`.
No main merge, release tag, external validation, source-book mutation or cleanup
of recovery/evidence data was performed. Remaining audit gates stay open.
