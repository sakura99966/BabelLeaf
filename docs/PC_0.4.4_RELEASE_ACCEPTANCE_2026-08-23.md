# BabelLeaf 0.4.4 PC release-closure acceptance record

## Verdict

0.4.4 is the traceable automated PC release-closure patch. It preserves the
completed 0.4 product scope and supersedes `v0.4.3` only for release provenance;
the historical tag and artifacts remain unchanged.

The local automated implementation, regression, native-runtime, package,
security, performance, and isolated-installer gates pass. The published
`v0.4.4` release is an explicitly unsigned build. It is not formal PC
acceptance because the credentialed, representative-corpus, clean-host,
human-audio, signing, and legal gates in this record remain external.

## Control record

- Product version: `0.4.4`.
- Verification date: 2026-08-23, Asia/Hong_Kong.
- Release branch: `codex/release-0.4.4`, based on `main` at
  `b3a57f0ce93f5ee7060b4893ab208b7491d9a348`.
- Canonical source identity: the commit resolved by the immutable `v0.4.4`
  tag and the GitHub release target.
- Historical boundary: `v0.4.3` remains on its original source identity and is
  not force-moved, deleted, or republished.
- Product boundary: local content and sidecars remain local; cloud translation
  requires explicit user action; source books and page images are not modified.

## Automated regression ledger

| Gate | Result | Evidence |
| --- | --- | --- |
| Package-manager identity | PASS | `corepack pnpm` and the Git-hook runner resolve the declared `pnpm 11.1.1`; the unrelated Codex fallback binary is not used |
| Formatting | PASS | Biome checks 1,119 files; `git diff --check` is required before commit |
| TypeScript/Biome lint | PASS | 1,081 files |
| Frontend unit tests | PASS | 384 files; 4,779 passed, 1 skipped |
| Coverage gate | PASS | 52.16% statements, 45.13% branches, 50.33% functions, 53.47% lines; thresholds remain satisfied |
| Browser Vitest | PASS | 24 files; 313 passed, 1 skipped |
| Production Tauri frontend build | PASS | Next static export plus translation and lookbehind output checks |
| Production Web build and E2E | PASS | 23/23 Playwright tests |
| Rust format and Clippy | PASS | `cargo fmt`; application Clippy with `-D warnings`; MSVC import-library linker messages are informational |
| Rust unit tests | PASS | 50/50 |
| Tauri integration | PASS | 4 files; 110 passed, 1 skipped, executed outside the restricted GUI sandbox |
| Native Windows WebDriverIO | PASS | 27/27; formats, MDict, zh-CN UI, viewport, WebGL, en/ja/zh speech completion, IPC, memory command, and traffic checks |
| Local format matrix | PASS | 48 manifest entries; 39 generated local fixtures; `external-required=0` |
| npm production audit | PASS | No known vulnerability at moderate-or-higher level using the current registry advisory response |
| Windows-target RustSec audit | PASS WITH TRACKED WARNINGS | 941 dependencies scanned against 1,225 advisories; zero vulnerabilities; 24 allowed unmaintained/unsound warnings retained for upstream disposition |
| Standard NSIS build and preflight | PASS | `BabelLeaf_0.4.4_x64-setup.exe`; standard product name, version, identifier, current-user mode, and embedded offline WebView2 configuration verified |
| Isolated installer lifecycle | PASS | Dedicated smoke identity installs, opens a responding window, uninstalls, cleans temporary state, and preserves the user-data sentinel |
| Exact standard lifecycle on this host | EXTERNAL | Safety guard refused to touch the existing BabelLeaf user-data profile; a separate clean host is required |
| Performance and portable-state budget | PASS | The release-attached evidence is bound to the final executable; startup and 300-second idle budgets, portable placement, and profile cleanup pass |
| Strict source/artifact SBOM | PASS | CycloneDX 1.5; application 0.4.4; 815 components; zero gaps; complete pnpm graph; RFC 4122 serial; exact SBOM hash is published with the release |

## Release artifacts

The release uploads the following files. The GitHub release body and checksum
file are the post-tag authority for exact byte counts and hashes:

- `BabelLeaf_0.4.4_x64-setup.exe`;
- `BabelLeaf_0.4.4_x64-setup.exe.sha256`;
- `BabelLeaf_0.4.4_SBOM.cdx.json`;
- `BabelLeaf_0.4.4_RELEASE_EVIDENCE.json`.

The standard executable and installer report product and file version `0.4.4`.
Both are `NotSigned`; this is explicit release metadata, not a completed signing
claim.

## Performance evidence

The post-commit `BabelLeaf_0.4.4_RELEASE_EVIDENCE.json` and its referenced
performance record are authoritative for the final executable bytes, SHA-256,
startup time, 60-second warmup peak, required 300-second idle peak, peak private
bytes, portable-state placement, and isolated-profile cleanup. These values are
generated after the source commit is frozen because Windows packaging is not
byte-for-byte reproducible across rebuilds.

The enforced budgets remain 2,500 ms for startup and 350 MiB for the required
300-second idle working-set peak. Warmup is recorded for comparison but is not
the approved idle budget. OCR and inpainting workload measurements remain
separate because optional model paths are absent from startup and no model
weight is bundled.

## Environment findings

- The Codex fallback PATH exposes `pnpm 11.19.0`, while the repository declares
  `pnpm 11.1.1`. Every release command used `corepack pnpm`, which resolves the
  declared version and passes `verify-pnpm-version.mjs`.
- Native Tauri tests cannot create WebView2 windows inside the restricted
  command sandbox. The identical tests pass outside that GUI restriction; this
  is an execution-boundary result, not a waived test.
- The user-level Cargo advisory checkout was structurally corrupt. The final
  RustSec audit used a newly fetched workspace-isolated database and did not
  delete or modify the user-level Cargo cache.
- The exact standard installer lifecycle correctly refused to run against an
  existing production user-data profile. The independent smoke identity was
  used for automation; exact standard-package clean-host execution remains
  external.

## External and user-owned gates

1. Supply explicit credentials and consent for paid lifecycle requests to each
   release-advertised cloud adapter: DeepSeek, OpenAI, and Anthropic. Verify
   submit, cancel, timeout/failure, restore, secure credential removal, and
   captured destinations.
2. Supply or approve a legally usable representative manga, webtoon, western
   comic, grayscale/color, low-resolution, vertical/mixed-language,
   handwritten/furigana, and scanned-book corpus. Record quality against human
   ground truth.
3. Execute the exact standard installer hash on a separate clean minimum-spec
   Windows host, including visible install, every supported format route, model
   lifecycle, comic workflow, restart/retry, export, uninstall, source-hash
   comparison, and data retention.
4. Perform human audio review for English, Japanese, and Simplified-Chinese
   voices. Automated completion does not prove intelligibility or output-device
   quality.
5. Supply an Authenticode certificate and protected signing procedure, then
   sign and repeat artifact-bound package, smoke, performance, SBOM, and
   provenance checks.
6. Complete owner or legal review of third-party notices, model/font terms, and
   AGPL corresponding-source obligations.

## Advancement rule

The immutable source, automated release evidence, and remote CI may close the
0.4.4 traceability defect. They do not close the external gates above. 0.5
production implementation remains blocked until those gates pass or the
authoritative roadmap is explicitly revised.
