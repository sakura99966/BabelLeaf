# ADR-001: Use Readest as the BabelLeaf application baseline

- **Status:** Accepted
- **Date:** 2026-07-27
- **Decision owners:** BabelLeaf maintainers

## Context

BabelLeaf began with a Koodo Reader codebase while its product scope was being
defined. The scope has since become more specific:

- local file import rather than an online catalog or scraping workflow;
- local library state without accounts or cloud synchronization in the near
  term;
- explicit DeepSeek V4 or loopback Ollama translation as the only intended
  external network feature;
- text books first, followed by a desktop-first comic OCR and typesetting
  workflow;
- Windows delivery first, while preserving credible macOS, Android, and iOS
  paths.

Koodo is an Electron application that supports multiple desktop operating
systems; it is not Windows-only. Its desktop focus would, however, leave
BabelLeaf with a separate architectural decision for mobile.

Readest is a React/Next.js reader packaged with Tauri v2. It already supplies a
cross-platform application structure, local library and reader features,
foliate-js integration, PDF.js integration, and import paths for the main
formats BabelLeaf needs to evaluate.

Readest also contains product areas that conflict with BabelLeaf's intended
boundary, including accounts, sync, online catalogs, metadata services,
telemetry, updater infrastructure, and multiple online translation/dictionary/
speech providers. Selecting it is therefore a starting-point decision, not an
assertion that the inherited application already satisfies BabelLeaf's privacy
policy.

## Decision

Use Readest commit
`8c212e5b8b019e40e162a7e20cb90f336a308f13` as the current application
baseline.

The migration was established with merge commit `2bc0b11d`. The merge preserves
both source histories while keeping the Readest tree as the working tree for
the new baseline.

Keep the pre-migration Koodo state reachable through:

- commit `93bd8ebbc613906ca730717dfa3261e2ea93327d`;
- the second-parent history of the migration merge.

Maintain read-only upstream remotes for both Readest and Koodo. Bring future
Readest changes into BabelLeaf only after reviewing product policy, network
behavior, data migrations, licenses, and regression risk.

During the migration, internal names such as `@readest/readest-app` may remain
temporarily where renaming them would create high-cost upstream merge
conflicts. User-visible identity, operating-system identifiers, data
directories, credential namespaces, update channels, and release endpoints
must be isolated before a BabelLeaf release.

## Consequences

### Benefits

- One TypeScript/React UI foundation can be used with Tauri desktop and mobile
  targets.
- BabelLeaf can start from a mature local reading engine instead of rebuilding
  EPUB, PDF, MOBI-family, comic archive, annotation, navigation, and layout
  behavior at once.
- The Tauri boundary gives sensitive storage and the future controlled LLM
  transport a native implementation point.
- The Git merge retains attribution, makes provenance inspectable, and leaves
  the Koodo work recoverable.

### Costs and risks

- Readest carries substantial network-enabled code that must be gated, removed,
  or replaced before release. Documentation alone is not enforcement.
- Readest identifiers and credential/data namespaces must not be reused by
  BabelLeaf, or the applications could conflict on the same machine.
- The repository depends on multiple Git submodules and Rust/native build
  tooling, increasing setup and CI complexity.
- Upstream synchronization will produce conflicts as BabelLeaf deliberately
  removes or changes Readest product features.
- A Tauri target does not make desktop dependencies portable automatically.
  In particular, a future Python-based comic worker requires a separate mobile
  design.

## Alternatives considered

### Continue directly on Koodo

This would retain a familiar Electron desktop base and reduce immediate
migration work. It was not selected because BabelLeaf now places more weight
on a shared desktop/mobile application structure. Koodo remains useful as
historical implementation reference.

### Start a new Flutter, Kotlin Multiplatform, or other greenfield client

A greenfield client could enforce the product boundary from the first line of
code, but it would also require rebuilding or bridging mature document reading
behavior before translation work could begin. That cost is not justified for
the first milestone.

### Combine several complete reader applications

Rejected. BabelLeaf will have one library, one settings model, and one primary
reader UI. Candidate OCR or conversion projects may be integrated later only
behind explicit local adapters or worker protocols, with independent license
review.

## Follow-up work required by this decision

1. Freeze BabelLeaf identity, data paths, credential namespaces, deep links,
   installers, and release configuration.
2. Introduce a deny-by-default capability policy and remove all unintended
   startup/background network activity.
3. Replace inherited translation providers with the built-in DeepSeek V4
   adapter, loopback Ollama, and a narrow native transport.
4. Establish Windows native build and local-import regression coverage.
5. Validate representative, legally obtained, DRM-free documents before
   describing any format as release-supported.
6. Preserve upstream copyright notices and maintain the component inventory.

This ADR supersedes the old choice of Koodo as the active application baseline.
It does not remove the old history or its attribution.
