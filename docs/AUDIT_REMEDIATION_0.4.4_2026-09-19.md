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

## External gates unchanged

Real supplier credentials and explicit paid-call authorization; lawful representative OCR/comic corpus and human ground truth; exact standard installer lifecycle on an independent minimum-spec Windows system; EN/JA/zh-CN voice listening review; signing and signed-package validation; license/model/font/AGPL responsibility review. These remain outside automated local PASS claims.
