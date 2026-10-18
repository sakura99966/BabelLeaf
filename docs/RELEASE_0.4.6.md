# BabelLeaf 0.4.6 remediation candidate

Status: IN PROGRESS; not yet internally release-qualified.

This candidate retains the approved 0.4 PC scope. It addresses the October 18
independent audit: dictionary HTML/CSS isolation, explicit session translation
consent, ordinary annotation/configuration durability and visible recovery,
dependency security and copied-runtime provenance.

The runtime copy manifest includes exact component versions, source/output
SHA-256 values, transformation tool versions and upstream notices. Build
verification rejects missing, modified, stale or unmapped copies. Strict SBOM
generation includes these components and requires static-output reconciliation
when bound to an installer.

Raw complete npm scanning still reports three development-only advisory records
for two packages without published fixes. Exact-version source backports and
regression/hash checks are enforced by `pnpm security:dependencies`. This is
not a claim that the version-based scanner is clean. Windows Rust scanning is
separate from non-Windows warnings and future platform qualification.

Fresh applicable tests, code review, native and installer qualification,
resource evidence, remote CI and protected main merge remain required; follow
`PC_0.4.6_REMEDIATION_STATUS.md`. Old tags and release assets are immutable.

Paid-provider calls, representative legal-corpus quality, independent minimum
hardware, human audio review, signing and responsible-owner legal review remain
DEFERRED by the owner. No keys, books or model weights are uploaded or bundled,
and no 0.5 platform development is included.
