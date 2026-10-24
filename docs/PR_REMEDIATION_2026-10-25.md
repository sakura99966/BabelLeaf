# PR audit follow-up — 2026-10-25

Scope: resolve the 2026-10-24 PR audit without changing reader features, external
validation deferrals, or the immutable v0.4.6 tag and release assets.

## Disposition

- PRs #1–#6 and #11 remain closed. They contain historical workflow dependency
  snapshots, not missing application features; do not reopen or merge them.
- PRs #7–#10 and #13 are already merged. Their review fixes were verified in
  main, with no unresolved inline review thread.
- PR #12 was merged normally as
  `817592228ace43351dc7b1e243a894f89374caf3` after all 16 final check records
  succeeded. It changes only pinned CI dependencies. The merged-main
  [Scorecard run 40110777029](https://github.com/sakura99966/BabelLeaf/actions/runs/40110777029)
  separately passed the 2.5.0 analysis, artifact upload and SARIF upload path.
  It does not grant broader workflow permissions.

## REPO-P2-01: portable development instruction entry

The old `apps/readest-app/CLAUDE.md` Git entry had mode `120000` and the ten-byte
link target `AGENTS.md\n`. A Windows checkout with `core.symlinks=false` wrote
that target as an ordinary file; it did not prove the link was portable.

Replace this entry with a tracked regular Markdown file (Git mode `100644`)
using the documented `@AGENTS.md` import. AGENTS.md remains the single shared
development guide; none of its project rules are copied or weakened. A regular
file avoids both the malformed target and Windows symlink privilege requirements.
See [the official import syntax](https://code.claude.com/docs/en/memory#import-additional-files).

The regression in `repository-instructions.test.ts` checks Git mode, the shared
guide and its rule files, and fresh index checkouts with both
`core.symlinks=false` and `core.symlinks=true`. Temporary checkouts are removed in
`finally`. The original entry fails these checks before the fix; keep that failure
as evidence rather than suppressing the assertions.

This developer-documentation correction is not a reader runtime feature or a
macOS product acceptance result. The original #1 checkout error is historical;
the audit did not prove its underlying cause was identical to this defect.

## Fresh security gate findings

The first merged-main application run, 40110777047, failed production audit on
GHSA-mrhx-c7xc-m3w5 in Zod 4.4.3. This is a dependency advisory detected by the
fresh scan, not evidence that #12 introduced application code. Pin official Zod
4.6.6 and rebind the existing AI SDK peer graph in the lockfile. Four bounded
collection regressions failed before the update; all five cases include a valid
control and do not allocate an oversized denial-of-service payload.

The complete graph then identified five additional development-only advisory
records: GHSA-m5mm-p8h7-m29v in serialize-javascript and GHSA-w74x-v6f9-j3xg,
GHSA-xhq7-xmqj-769h, GHSA-wjr9-j795-jxcr and GHSA-333x-w4r6-6crp in fast-uri.
Use the actually published upstream fixes 7.1.3 and 3.1.9 respectively. Installed
dependency regressions exercise script-close escaping, malformed schemes,
relative-reference equivalence, invalid authorities and suffix references.
Malformed URI resolution must throw, not return a dangerous scheme. The suffix
case follows upstream's explicit `reference: 'suffix', scheme: 'x'` contract;
an invalid authority without that scheme option is not the same parse path.

No vulnerability ignore, policy expansion, patch-hash exemption or lowered
threshold is introduced. Keep the old failed main run as historical evidence;
only a fresh final-main application/security run can close the new findings.
See the dated follow-up in `DEPENDENCY_SECURITY_0.4.6.md` for primary sources.

The first PR #14 head's fresh Rust gate also reported Tokio
RUSTSEC-2026-0386 and a newly yanked clipboard-win 5.4.1. Update only Tokio to
the published 1.53.3 fix and clipboard-win to the non-yanked 5.4.3 release;
preserve unrelated Windows support-crate dependency choices. Tokio's affected
APIs are under `tokio::io::unix`, not a demonstrated Windows call path, and the
registry provides no clipboard yank reason; do not invent one. Two lock-baseline
regressions fail before these updates. `cargo fetch --locked` accepts the minimal
updated graph. The local audit tool cannot parse the current advisory database's
gettext crate alias; retain that failure, do not exclude advisories, and require
a fresh hosted Rust security/Clippy/unit/native/package run for the final head.

## Non-blocking provenance observations

PR #12 deliberately pins the verified official Rust-cache commit
`c8037a86dde8214a8310e9f54a8fc61ab362aa31`, which includes the workspace-root
cache-key fix after the current v2 release tag. Do not describe it as an exact
release-tag snapshot or replace it with a floating tag.

The official Scorecard action still selects its Docker image by version tag,
not OCI digest. This inherited supply-chain hardening opportunity is not a
newly demonstrated application vulnerability and is not asserted fixed here.
Existing reviewed advisory records and external acceptance deferrals remain
governed by `DEPENDENCY_SECURITY_0.4.6.md` and the PC acceptance documents.

## Completion gates

1. Demonstrate the regression failure before changing the entry; verify all new
   checks after both content and index file mode are corrected.
2. Run the full unit suite, lint and formatting checks. Review the exact patch,
   excluding the pre-existing deterministic Foliate security-preparation diff.
3. Use the protected PR merge path. Require application CI and all three CodeQL
   analyses; then inspect final-main application CI, CodeQL and Scorecard/SARIF.
4. Verify no open repository PR remains, synchronize local/remote main, and
   remove only the merged maintenance branches and reproducible test caches.
5. Preserve the original release tag, installers, manifests, user data,
   credentials and audit evidence. This maintenance change does not qualify a
   replacement v0.4.6 package or pass deferred external gates.

Execution receipts and exact CI run identities are retained under
`target/pr-close-20261025/`; a green pre-merge check is not a substitute for the
final-main runs.
