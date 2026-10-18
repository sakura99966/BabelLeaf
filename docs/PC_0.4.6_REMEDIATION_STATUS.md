# 0.4.6 PC audit remediation

Source audit: INDEPENDENT_AUDIT_0.4.5_2026-10-18.md.
Branch: codex/0.4.6-audit-remediation. Product scope remains 0.4 PC.

## Gates

| ID | Scope | Status |
| --- | --- | --- |
| AUD18-01 | Inert, sanitized local dictionary HTML/CSS/resources | IMPLEMENTED; final package gate pending |
| AUD18-02 | Session-scoped explicit translation consent | IMPLEMENTED; final regression pending |
| AUD18-03 | Atomic, validated, recoverable book configuration | IMPLEMENTED; final regression/native crash gate pending |
| AUD18-04 | Current Rust dependency audit and native validation | OPEN |
| AUD18-05 | Copied runtime vendor provenance/SBOM/security closure | OPEN |
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
