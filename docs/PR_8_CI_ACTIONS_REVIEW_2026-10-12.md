# PR 8: CI action maintenance review

Scope: https://github.com/sakura99966/BabelLeaf/pull/8.

This is CI maintenance within the completed 0.4 PC scope, not a product
version, runtime dependency upgrade or authorization to start 0.5.
The immutable v0.4.5 package/tag/evidence remain bound to
ece7d27e64a1abc19fac04d5af610a926d40bc6c. Do not overwrite those assets.

## Original failure

Original Dependabot head: 0f34e7f2643695a3c1672d7f53d830718ea3d8b8.
Failed workflow: https://github.com/sakura99966/BabelLeaf/actions/runs/38136089535.

Only rust_lint, build_tauri_app and their required-checks aggregate failed.
Both native build failures reported that tao generated three warnings and
that Cargo build.warnings denied them. The Tauri port-readiness failure was
a consequence of compilation aborting, not a new WebView startup defect.
The unit, coverage, browser, production-Web, native-Windows, installer,
security-audit and three CodeQL lanes passed on that original head.

The official setup-rust-toolchain v2.0.0 changes warning enforcement from a
RUSTFLAGS default to CARGO_BUILD_WARNINGS=deny, supported by recent Cargo.
The Cargo-wide policy includes dependency warnings that capped rustc lints
previously did not make fatal. The old lint job already supplies its own
RUSTFLAGS, and build/test jobs use rustflags: ''. This major-version default
change is therefore not a behavior-preserving pin update.

Primary source:
https://github.com/actions-rust-lang/setup-rust-toolchain/releases/tag/v2.0.0.
The pinned action.yml defines build-warnings with default deny.

## Remediation and regression

Set build-warnings: warn explicitly on all five Rust setup steps. This keeps
dependency warnings visible; it does not hide them with allow, disable a job,
add continue-on-error, downgrade a tool or weaken application Clippy.

Keep cargo clippy -p Readest --no-deps -- -D warnings, cargo fmt --check,
cargo test -p Readest --lib and the required-checks aggregate unchanged.
All actions stay fixed to full 40-character upstream commit identities.

github-actions-warning-policy.test.ts covers each of the five Rust jobs and
the unchanged application/native-test aggregate gates. The before-fix run
has five missing-policy assertion failures and one passing strict-gate test.
The fixed run must pass all six. Tests read the workflow, not copies of its
policy, and execute in the normal full unit/coverage suite.

## Pin provenance

Eight unique updated action commits match their official release tags:
CodeQL v4.38.3, paths-filter v4.0.3, sccache-action v0.0.11,
setup-rust-toolchain v2.0.0, pnpm/action-setup v6.1.0,
setup-node v7.1.0, upload-artifact v7.0.2 and Scorecard v2.4.4.
CodeQL's three entry points account for three of the eleven grouped updates.

rust-cache f0d9c3887740aee45f6153b24b3a6b815192ec16 is an official
GitHub-verified commit five commits after v2.9.2, not the exact v2/v2.9.2 tag.
The upstream comparison contains timestamp-pruning cleanup and generated
distribution/workflow updates. Do not replace a reviewed fixed commit solely
because a mutable major tag differs, or falsely report tag equality.

## Closure gate and evidence

Local regression, full unit suite, lint, formatting and diff checks must pass.
Fresh checks on the actual repaired PR head, including all required CodeQL
analyses and native/installer lanes, are the merge gate. Do not rerun the
original failing source and interpret a transient pass as remediation.

Merge normally without an administrator bypass; compare fetched local main,
remote main and PR mergeCommit; verify the main workflows on that exact SHA.
Remove only the merged PR branch after these checks. Retain local raw records
under target/pr-8: original.diff, original-failed.log, before/after regression,
upstream pin verification and final PR/main workflow identities. Generated
post-commit receipts establish actual completion; this pre-merge source note
does not claim that a future merge or main check already happened.

No shipping reader code, package-manager version, network/privacy capability,
runtime Cargo graph, user data or published release asset is changed.
Preserve the known deterministic Foliate security preparation. Do not
recreate already-cleaned compiler caches just to validate YAML-only changes;
the changed Linux/Windows action behavior is exercised by hosted CI.
