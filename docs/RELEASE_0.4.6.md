# BabelLeaf 0.4.6 internal PC remediation

Status: INTERNAL_IMPLEMENTATION_PASS / EXTERNAL_VALIDATION_DEFERRED.
Final source/artifact closure is controlled by protected checks and the generated
canonical-main RELEASE_EVIDENCE receipt; this document alone does not assert
that a merge, tag or public release has occurred.

The dated [project status](PROJECT_STATUS.md) distinguishes the frozen historical
v0.4.6 tag from subsequent maintenance source and CI candidates. As of
2026-10-25 no v0.4.6 GitHub Release has been published. The measurements and
initial audit counts below belong to their recorded source freezes, not every
later commit with the same application version.

This candidate retains the approved 0.4 PC scope. It addresses the October 18
independent audit: dictionary HTML/CSS isolation, explicit session translation
consent, ordinary annotation/configuration durability and visible recovery,
dependency security and copied-runtime provenance.

The runtime copy manifest includes exact component versions, source/output
SHA-256 values, transformation tool versions and upstream notices. Build
verification rejects missing, modified, stale or unmapped copies. Strict SBOM
generation includes these components and requires static-output reconciliation
when bound to an installer.

At the initial qualification freeze, raw complete npm scanning reported three
development-only advisory records for two packages without published fixes.
Subsequent maintenance reduces the raw findings to two extract-zip records;
see the current status and dependency-security ledger. Exact-version source backports and
regression/hash checks are enforced by `pnpm security:dependencies`. This is
not a claim that the version-based scanner is clean. Windows Rust scanning is
separate from non-Windows warnings and future platform qualification.

Full unit/coverage, Chromium, production Web UI, Windows/Linux native,
interruption/recovery, installer lifecycle, actual packaged-asset hashes and
reference-host latency/workload checks are recorded in
`PC_0.4.6_INTERNAL_ACCEPTANCE.md`. Standard idle working set peaks at 101.20 MiB
over 300 seconds after a separate 60-second warmup; actual library interaction
is measured separately at 767.1 ms. These are reference-host measurements, not
minimum-spec or universal guarantees.

PDF.js 6 disposal uses the loading-task owner; background thumbnail rasterization
does not depend on a visible-window animation frame. Closed document resources
are released only after the last reader and speech owner, including asynchronous
speech shutdown, finishes. No new network capability or model weight is added.
Old tags and release assets remain immutable. See the remediation ledger for
failing-before evidence and the final package receipt for exact source/hashes.

Paid-provider calls, representative legal-corpus quality, independent minimum
hardware, human audio review, signing and responsible-owner legal review remain
DEFERRED by the owner. No keys, books or model weights are uploaded or bundled,
and no 0.5 platform development is included.

The October 24 canonical-main cold-cache SBOM follow-up adds explicit locked
Windows dependency prefetch/offline metadata preflight and retained strict-gap
diagnostics. A real empty-cache control rejects 239 incomplete components;
after locked fetch the complete 801-component graph has zero gaps. Final
delivery requires the subsequent protected merge and actual new-main candidate
receipt, not the failed initial main archive or a renamed PR package.
