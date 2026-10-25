# BabelLeaf 0.4.5 maintenance candidate

Status: INTERNAL IMPLEMENTATION PASS; EXTERNAL VALIDATION DEFERRED.

Unsigned maintenance qualification, not signed production acceptance. Published
artifact availability and canonical source are established by the release page
and post-commit `BabelLeaf_0.4.5_RELEASE_EVIDENCE.json`, not by this source note.

This candidate retains the approved 0.4 PC feature scope. It closes the
independent audit findings with reader-content isolation, scoped directory
enumeration, atomic/recovery-aware local writes, cross-window save coordination,
pending text-translation journals, guarded text/comic closure, complete-output
checks, retryable checkpoints and bounded dictionary/archive workers.

Translation request caches include model/prompt context, reject incomplete or
cancelled output, and retain at most 512 entries / 8 MiB of estimated string
payload in memory. New persistent cache entries are limited to 64 KiB UTF-8 and
2,048 rows; pruning runs with the new write. These are disposable caches, not
the authoritative translation sidecars. Legacy disk allocation and JavaScript
object overhead are not included in these payload budgets.

Unused whole-database cache hydration/pruning code is removed. The package
remains local-first, without scraping, sync, telemetry, cloud speech, implicit
model downloads, bundled model weights or automatic translation requests.

The historical `v0.4.4` tag and assets stay immutable. Fresh Windows package
hashes, exact-source checks, SBOM, isolated installer lifecycle, performance and
remote CI are qualified in `PC_0.4.5_INTERNAL_ACCEPTANCE_2026-10-11.md`.
Main merge and fresh canonical-main package identity must be bound by the
post-commit provenance record; earlier candidate hashes must not be relabelled.

Paid-provider validation, representative lawful corpus and human OCR/inpainting
quality review, independent minimum-spec Windows testing, human voice review,
Authenticode signing and responsible-owner license/model/font review remain
DEFERRED by the owner, not PASS. This maintenance candidate does not authorize
0.5 platform development or claim complete external PC acceptance.
