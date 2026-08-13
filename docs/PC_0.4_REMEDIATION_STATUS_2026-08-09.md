# BabelLeaf 0.4 PC corrective verification status

## Control record

> Historical ledger notice (2026-08-13): numerical results and the active
> verdict in this file have been superseded by
> `PC_0.4_FINAL_AUTOMATED_ACCEPTANCE_2026-08-13.md`. This file is retained for
> finding history and must not be used as the current package identity.

- Audit specification: `docs/PC_0.4_FULL_VERIFICATION_REMEDIATION_2026-08-09.md`.
- Roadmap gate: `docs/DEVELOPMENT_ROADMAP.md` revision 8 records that the
  0.4.3 PC closure is not accepted and blocks platform implementation.
- Verification date: 2026-08-09, Asia/Hong_Kong.
- Source base: `main` at `db1dce6aed9db2ca5dcfa2e078acd6a2346b6592` plus an
  uncommitted corrective working tree. The current Git metadata is read-only;
  no commit or remote push was possible in this run.
- Product version: 0.4.3.
- Host: Windows 10 Pro for Workstations 10.0.19045, WebView2 151.0.4129.72,
  Rust/Cargo 1.97.1, Node 24.15.0.
- Final automated continuation check: 2026-08-12, Asia/Hong_Kong. This
  continuation supersedes the earlier candidate hashes, performance result,
  regression counts, installer evidence, and SBOM result recorded below. The
  original rejection remains authoritative for external/manual gates that the
  continuation cannot satisfy.

## Corrective changes completed

1. Updated production JavaScript dependencies and lockfile. `pnpm audit
   --prod --audit-level moderate` now reports no known vulnerabilities.
2. Upgraded the direct Rust `quick-xml` parser to 0.41 and removed the
   Windows-targeted lockfile vulnerabilities. `cargo audit --target-os
   windows` reports zero vulnerabilities; unmaintained/unsound informational
   advisories remain and are not treated as resolved.
3. Added model-specific health checks for DeepSeek, OpenAI, and Anthropic;
   changed the OpenAI preset from a deprecated snapshot to the stable
   `gpt-5-mini` alias.
4. Replaced Unix-only Tauri test orchestration with Windows-capable Node
   launchers. Added bounded process cleanup, isolated runtime directories,
   WebView2 lock grace, a production static Web E2E server, and a Playwright
   completion boundary for the Windows CLI handle leak.
5. Repaired native and web E2E selectors and locale determinism. Required CI
   now includes dependency security audit, production Web E2E, and Windows
   native WebDriverIO jobs; the security job audits the repository root
   `Cargo.lock`.
6. Removed the browser SimpleCC `/public` warning by using filesystem aliases
   in test resolvers.
7. Added reader translation display modes (`original`, `translated`,
   `stacked`, `columns`) with persisted view settings and style contracts.
8. Added comic editor geometry/style fields, sidecar overlay styles, bounded
   undo/redo, localized region-editor labels, and deterministic import/export
   resource limits. Archive extraction now checks page bytes, total bytes, and
   declared compression ratio.
9. Moved the translation workbench and comic workspace behind lazy imports so
   optional OCR/archive/export code is not loaded in the reader startup path.
10. Rebuilt the standard BabelLeaf installer and replaced the previous
    `BabelLeaf Smoke` artifact at the expected release filename. The new
    artifact is still unsigned and was built from a dirty working tree.
11. Added `scripts/measure-windows-performance.ps1`, which records cold
    startup, process-tree working set/private bytes, host identity, and a
    bounded idle sample without killing unrelated processes.

## Regression ledger

| Gate | Result | Evidence |
| --- | --- | --- |
| TypeScript/Biome lint | PASS | `pnpm --filter @readest/readest-app lint`, 1,060 files |
| Formatting and diff whitespace | PASS | `pnpm fmt:check`, `git diff --check` |
| Unit tests | PASS | 374 files; 4,743 passed, 1 skipped; coverage 51.55% statements, 44.73% branches, 49.35% functions, 52.87% lines |
| Browser Vitest | PASS | 24 files; 313 passed, 1 skipped |
| Production Web E2E | PASS | `pnpm -C apps/readest-app build-web` followed by `CI=true pnpm -C apps/readest-app test:e2e:web`; 20/20, including PDF/MOBI/FB2/CBZ/Markdown local import matrix; wrapper exits cleanly. A non-CI dev-server run is intentionally not an acceptance run because Next development overlay portals can intercept pointer events. |
| Tauri integration Vitest | PASS | 110 passed, 1 skipped; executed with elevated normal Windows permissions |
| Native WebDriverIO | PASS | 18/18, including the WebGL path required by page curl; executed with normal Windows child-process permissions |
| Tauri production build and generated-output checks | PASS | `pnpm --filter @readest/readest-app build-check` after static-worker MIME fix |
| Rust application checks | PASS | `cargo fmt -p Readest --check`, `cargo check --all-targets`, Clippy `-D warnings`, 50 Rust tests; full workspace format still reports vendored submodule newline differences on this Windows checkout |
| npm production audit | PASS | `pnpm audit --prod --audit-level moderate` completed with network access; no known vulnerabilities found |
| Frozen lockfile install | PASS | `pnpm install --frozen-lockfile --prefer-offline`; pnpm 11.1.1; workspace already matched the lockfile |
| RustSec Windows audit | PASS WITH WARNINGS | isolated project-local advisory database loaded 1,211 advisories and the audit exited 0; 25 allowed informational warnings remain. Windows-reachable `lru 0.16.4` is inherited through Turso/Tantivy; its advisory requires a panicking key destructor plus unwind recovery, which the current cache keys do not use. Upstream replacement remains tracked. |
| Standard installer build | PASS | `BabelLeaf_0.4.3_x64-setup.exe`, ProductName `BabelLeaf`, FileVersion `0.4.3` |
| Exact standard installer lifecycle | PASS | `test:windows-installer:isolated` installed the exact package, observed a responsive BabelLeaf window, uninstalled it, and retained the user-data sentinel. `test:windows-installer:cleanup` forced a preflight failure and left no temporary profile residue. |
| Installer artifact hash | RECORDED | Final NSIS SHA-256 `B1F70EE9A94FB431ABDD87C2344ECC772E3A4406530FD3E4257B7ACABD956CC1`, 239,320,345 bytes; release binary SHA-256 `1E3172F84E5EE25540A5F0D2FA546644CF78C06119A8062847C6C4A021D09632`, 57,356,288 bytes |
| Installer signing | FAIL | Authenticode status `NotSigned` |
| Performance harness | PASS | Schema-3 report bound to the final release-binary SHA-256: startup 155.36 ms; 60-second warmup peak 350.52 MiB; required 300-second idle peak 346.07 MiB against 350 MiB budget; peak private bytes 130.11 MiB; seven standard isolated process roles retained; profile cleanup passed |
| Strict source SBOM | PASS | 796 components, complete pnpm production graph, zero license gaps, `SOURCE_COMPLETE`; artifact bytes and SHA-256 match the final NSIS package |

The current five-minute sample is stored at
`target/babelleaf-performance-0.4.3-release.json`. It is bound to the final
release-binary hash and closes the local 350 MiB performance gate. The build
still comes from an uncommitted working tree and therefore does not establish
release provenance.

## Workspace cleanup

- Removed the generated application `debug.log`, Playwright `test-results`,
  and Playwright `playwright-report` directories.
- Removed the post-regression `apps/readest-app/.next`, `apps/readest-app/out`,
  and `apps/readest-app/test-results` directories after verifying that they
  were generated build/test outputs and not release or user-data paths.
- Removed all temporary `BabelLeaf-installer-profile-*` directories created by
  the completed smoke runs, after validating each path was an installer test
  profile. Removed workspace build/test caches, format-fixture outputs, the
  isolated Corepack/Cargo homes, and superseded installer/performance
  diagnostics. Final lifecycle evidence (`target/windows-installer-current-17`
  and `target/windows-installer-preflight-current-6`), the final SBOM, the
  five-minute performance JSON, the release binary, and the NSIS installer
  were preserved. Source files, `.env` files, credentials, and user data were
  not targeted.
- The `tauri-plugin-turso` checkout still reports a metadata-only modified
  state because the read-only submodule index cannot be refreshed; `git diff
  --quiet` succeeds and the working-tree/index blob hashes are identical.
- The vendored `packages/tauri-plugins` checkout contains the one-line
  `_permission` naming correction used by the final build. It remains an
  uncommitted nested change because the current Git metadata is read-only and
  cannot create or advance the corresponding submodule commit.

## Latest implementation delta (2026-08-09)

- **A1 package-manager gate implemented:** the root `packageManager` value is
  now enforced by `scripts/verify-pnpm-version.mjs`; every pnpm-based required
  workflow pins pnpm `11.1.1` and executes the gate. Bare local pnpm `11.16.0`
  is rejected intentionally, while an isolated Corepack home successfully
  prepared pnpm `11.1.1` and passed `corepack pnpm -w verify:package-manager`.
- **A2 fixture infrastructure implemented:**
  `scripts/fixtures/generate-format-fixtures.mjs` produces 37 deterministic
  local hostile cases without network access. The tracked
  `apps/readest-app/test-data/FORMAT_FIXTURE_MANIFEST.json` records 50 entries,
  source/provenance, expected diagnostics, resource budgets, and SHA-256
  values. The generator verifies the tracked manifest without mutating it
  unless `--write-manifest` is explicitly supplied.
- **A2 test correction:** AZW/AZW3 are no longer tested by renaming a MOBI
  file. Native AZW/AZW3, FBZ, scanned-PDF, and user-folder release samples
  remain explicitly `external-required`; a native Markdown fixture is now
  repository-owned and exercised by the parser test.
- **Post-change evidence:** the targeted format and manifest tests pass (2
  files, 9 tests), TypeScript/Biome lint passes for 1,036 files, and the
  generator plus manifest comparison pass. This does not close installed
  package routing or the remaining external-sample acceptance items.
- **B1 reader sidecar integration started:** reader-side translations now use
  the durable `Data/translation-artifacts` store when an actual reader view is
  active. Segments carry a structural anchor and source fingerprint, are
  restored before a provider request, and save failures do not suppress an
  already returned translation. Installed-package reopen/font-change/page-turn
  evidence is still required.
- **A3 runtime network boundary tightened:** AI transport now rejects every
  target outside the fixed DeepSeek/OpenAI/Anthropic origins or loopback
  Ollama before invoking the platform fetch. Redirects and ambient credentials
  remain disabled. This is an allowlist control, not a substitute for the
  clean-profile DNS/TCP/HTTP capture and evidence required for acceptance.
- **A4 installer cleanup proof added:** the Windows smoke script now supports a
  forced preflight-failure path, and the wrapper verifies that an isolated
  `BabelLeaf-installer-profile-*` directory is removed even when installation
  never starts. This does not replace the complete signed-package lifecycle
  evidence.
- **C3 comic batch entry added:** `ComicWorkspaceDialog` now restores a local
  `Data/comic-pipelines` checkpoint after matching pages are re-imported and
  exposes page/range selection, progress, start, pause, resume, retry, and
  selective rerun controls. The first reachable stage is provider translation
  of existing OCR/manual regions; OCR remains explicitly blocked until a
  verified local model is installed. Queue checkpoints contain no image bytes
  or credentials. The installed-package UI and restart proof remain open.
- **C3 cancellation and C4 editing correction:** a cancelled comic queue now
  recreates its abort signal before a deliberate selective rerun, and refuses
  a rerun while cancelled workers are still draining. The desktop workspace
  now exposes split, merge-with-next, reading-order move, and a bounded local
  cleanup-mask editor with brush/erase/restore strokes and sidecar undo. These
  operations preserve the source image, but exact-package interaction and
  visual export evidence remain open.
- **C3 checkpoint identity correction:** the comic queue identifier now includes
  a stable page-set signature derived from page identity, dimensions, and local
  file byte size. Import is disabled while a queue is queued or running. This
  prevents a newly imported page set from reusing an unrelated checkpoint in
  the same workspace while retaining restart recovery for the same local set.
- **C3 retry race correction:** a retry requested while a failed run is still
  settling now waits for that run Promise to finish before resetting failed
  items and starting the retry. This removes the window in which the old run
  could consume the retry request without processing it.
- **A5 SBOM evidence generator added:** `scripts/generate-sbom.mjs` emits a
  CycloneDX-shaped source inventory with npm/Cargo components, repository
  revision, submodule status, optional artifact hash, and explicit gaps. The
  strict command is package-manager-gated; the local command is offline and
  records incomplete dependency/license evidence instead of claiming release
  compliance.
- **Regression run after this delta:** unit tests passed (363 files, 4,708
  passed, 1 skipped), browser tests passed (24 files, 313 passed, 1 skipped),
  production build/output checks passed, production Web E2E passed 15/15,
  normal-permission Tauri integration passed (109 passed, 1 skipped), native
  WebDriverIO passed 17/17, Rust application fmt/check/Clippy passed, and Rust
  library tests passed 50/50. The full workspace `cargo fmt --check` still
  reports newline differences in vendored Tauri sources on this Windows
  checkout. The local offline SBOM was generated with 61 components
  and 14 explicit gaps; it is evidence of the gaps, not a release approval.
- **B2 progressive coverage gate added:** Vitest now requires at least 45%
  statements, 35% branches, 40% functions, and 45% lines, and a dedicated
  required CI job runs the complete coverage suite. The latest low-concurrency
  run passed at 49.73%, 42.94%, 47.16%, and 50.97% respectively; this is a
  baseline gate, not proof that every mandatory UI entry point is covered.
- **Post-identity regression:** after the checkpoint identity and import-lock
  change, the complete unit suite passed (363 files, 4,708 passed, 1 skipped),
  browser Vitest passed (24 files, 313 passed, 1 skipped), production build and
  generated-output checks passed, production Web E2E passed 15/15, and the
  coverage gate passed at 49.73%/42.94%/47.16%/50.97%. These results do not
  change the open installed-package, OCR, performance, signing, privacy-capture,
  and external-sample blockers below.
- **Native regression after queue retry correction:** Tauri integration passed
  110 tests with 1 skipped, including a real Windows credential-manager
  set/get/clear round trip using a synthetic value, and Windows native
  WebDriverIO passed 17/17 under
  normal desktop permissions. The launchers left no BabelLeaf, WebDriver, or
  test-server process running after completion.
- **C4 interaction and typesetting correction:** the workspace now exposes
  pointer-draggable polygon handles and explicit font-family, line-height,
  padding, and text-fit controls (`shrink`, `clip`, `overflow`). The values are
  validated into the overlay sidecar and used by deterministic page export.
  Model-backed inpainting and installed-package visual export evidence remain
  separate gates.
- **A2 production web import correction:** the repository-owned static server
  now serves `.mjs` as JavaScript, allowing the PDF.js worker to load in the
  exported web build. The local format matrix subsequently passed 20/20. The
  Playwright wrapper now forwards CLI filters and treats a watchdog timeout as
  failure rather than returning a false success.
- **A6 source-memory correction:** comic image imports are now written to the
  local Temp store one page at a time; the workspace keeps only the selected
  page URL and reopens source bytes on demand. Source-page blobs are revoked and
  session files are removed on close. Export remains bounded by the existing
  page/byte limits but still assembles the final archive in memory.
- **Windows idle-memory correction:** the WebView builder keeps the background
  throttling policy for platforms that support it and applies a bounded
  software-compositor profile on Windows. The exact release candidate retained
  Tauri, WebDriverIO, installer, and data-retention behavior; the five-minute
  peak fell from 403.45 MiB/238.26 MiB private to 386.11 MiB/176.38 MiB
  private after the software-compositor change, then to 377.33 MiB/171.34 MiB
  private after disabling WebView2 background networking, component updates,
  and domain reliability. The 350 MiB working-set gate remains failed, so this
  is an optimization with an open budget exception, not acceptance.
- **Additional memory experiment:** an opt-in WebView2 `--single-process`
  launch argument reduced a 30-second sample to 262.13 MiB and passed the
  existing smoke and Tauri integration checks, but it is not included in the
  candidate. It changes the browser process-isolation boundary for untrusted
  EPUB/PDF/image content and has not passed the full five-minute, hostile-input,
  crash-recovery, or security review required by the roadmap. The release
  default therefore remains the safer multi-process configuration, whose
  five-minute working-set sample is 377.33 MiB and remains a failure.
- **Current full regression:** low-concurrency unit and coverage suites passed
  (365 files; 4,711 passed, 1 skipped; 49.89%/43.14%/47.36%/51.13%), browser
  Vitest passed (24 files; 313 passed, 1 skipped), production build checks
  passed, production Web E2E passed 20/20, Tauri integration passed 110/1
  skipped, native WebDriverIO passed 17/17, and Rust application checks plus
  50 library tests passed. The initial parallel unit run had a Vitest worker
  exit caused by host contention; the required low-concurrency rerun passed.
- **Current installer/performance evidence:** the rebuilt working-tree
  `BabelLeaf_0.4.3_x64-setup.exe` passed three consecutive isolated install,
  responsive launch, silent uninstall, and user-data sentinel retention runs.
  The smoke harness now records the application root PID, terminates its
  related WebView2 process tree, and waits for the executable lock to clear
  before invoking NSIS. The forced preflight failure path returned the
  expected failure and left no temporary installer profile. A five-minute idle
  measurement of the rebuilt binary recorded 138.28 ms startup, 373.52 MiB
  peak process-tree working set, and 166.33 MiB peak private bytes. The
  software-compositor and background-network changes reduced the observed
  Windows working set, but the 350 MiB gate remains failed.

## Findings closed or narrowed

- BL-PC04-005: the expected release filename now identifies a normal
  `BabelLeaf` package, and the exact locally built bytes passed lifecycle smoke.
  Provenance is not release-grade because the source tree is uncommitted and
  the package is unsigned.
- BL-PC04-006: closed for current production npm advisories.
- BL-PC04-007: closed for current Windows-targeted vulnerabilities; warning
  triage for future targets remains open.
- BL-PC04-011: launcher, selector, web-server, native E2E, and required-CI
  portions are closed for the exercised paths. Coverage of product workflows
  remains insufficient.
- Comic region recovery UI: the editor now keeps deleted regions selectable
  and exposes localized Restore/Revert actions instead of treating them as an
  unselectable empty state. Direct component coverage verifies bounded
  geometry/style patches and recovery actions; installed-package workflow
  evidence remains open.
- BL-PC04-017: the edited comic region surface is localized for English and
  Simplified Chinese. Full comic workspace locale and minimum-window native
  verification remain open.
- BL-PC04-018: installer profile cleanup is in an outer `finally`; three
  consecutive isolated lifecycle runs and the forced preflight-failure wrapper
  leave no new profile, and the Tauri/WebView2 process-tree cleanup is now
  deterministic for the exercised path. Artifact signing/provenance and the
  remaining failure-injection scenarios remain open.
- BL-PC04-020: SimpleCC warning and stale Readest E2E expectations were fixed;
  the pnpm version gate is now implemented. Vendored dependency warnings and a
  remote CI run from a committed tree remain open.

## Acceptance blockers still open

The PC closure claim remains rejected. The following are not satisfied by
service mocks, manifests, enum presence, or unit-only tests:

### P0

- **BL-PC04-001:** no selected production OCR runtime/model with a real
  zh/en/ja and vertical-Japanese quality/resource matrix; the workspace still
  cannot run OCR from an imported model pack.
- **BL-PC04-002:** a desktop batch translation entry, page/range selection,
  progress, pause/resume, checkpoint restore, retry, and selective rerun are
  now implemented for existing OCR/manual regions. Installed-package
  restart evidence, OCR-stage integration, and full multi-stage processing
  remain open.
- **BL-PC04-003:** geometry fields, split/merge/reorder controls, bounded
  brush/erase/restore mask editing, pointer-level polygon handle editing, and
  deterministic export wiring are now reachable in the comic workspace. Font,
  line-height, padding, and text-fit controls are also sidecar-backed and used
  by export. Approved model-backed inpainting and installed-package
  recovery/visual export workflows remain incomplete.
- **BL-PC04-004:** reader-side DOM/style modes and durable anchored sidecar
  integration are implemented for the active reader view, but no
  installed-package end-to-end proof exists for persistence, anchors, reopen,
  font change, and page-turn behavior.
- **BL-PC04-008:** executable local hostile fixtures now exist for the
  generated cases and are hash-verified, but they are not yet routed through
  the installed application. Native AZW/AZW3, FBZ, scanned-PDF, and
  user-folder samples remain external requirements; installed-package
  malformed/DRM/resource-limit behavior is still unproven.
- **BL-PC04-009:** comic source import is now sequential and disk-spooled, and
  the UI retains only the selected-page object URL; source bytes are reopened
  on demand. Final CBZ/PDF assembly still accumulates the bounded rendered
  archive in memory, and installed-package memory evidence is absent.
- **BL-PC04-010:** AI requests now have an explicit runtime allowlist and
  redirect/credential controls, but no clean-profile DNS/TCP/HTTP capture and
  end-to-end allowlist report exists for startup, reading, dictionary, speech,
  translation, OCR, export, redirects, and shutdown.

### P1

- **BL-PC04-012:** a required progressive global coverage gate now exists at
  45/35/40/45% (statements/branches/functions/lines), and the current run
  passes it. Direct behavior coverage for several mandatory UI entry points
  remains insufficient for closure.
- **BL-PC04-014:** no credentialed controlled model-availability/translation
  smoke or release-time provider lifecycle check.
- **BL-PC04-015:** the development Tauri harness now proves Windows secure
  credential-manager set/get/clear and synthetic-value cleanup, but exact
  installed-package save/restart/clear evidence and release-log redaction
  checks remain open.
- **BL-PC04-016:** dictionary import/lookup and actual Windows voice playback
  are not proven on the installed package.
- **BL-PC04-017:** full comic workspace Simplified Chinese locale and native
  minimum-window exercise are not proven.

### P2 / release evidence

- **BL-PC04-019:** the strict source SBOM is complete, has zero license gaps,
  and is bound to the final NSIS hash. A signed artifact, committed-source
  identity, notices bundle review, and immutable release archive remain open.
- Cargo informational unsound/unmaintained warnings require disposition before
  platform ports.
- CI YAML has been reviewed structurally but still requires a remote GitHub
  Actions run after the working tree is committed and pushed.

## Normative verdict

**REJECTED.** The corrective pass materially improves dependency security,
test execution, release package identity, reader display-mode plumbing, comic
resource limits, startup loading, and measured performance. It does not
establish the declared PC feature closure because production OCR/model
qualification, installed-package batch/editor/export workflows, executable
hostile/external-format evidence, privacy capture, credentialed provider and
dictionary/TTS integration, signing, committed-source identity, and remote CI
remain open. Do not start 0.5 platform implementation or mark 0.4 accepted
until the blockers above have executable evidence.

## Historical continuation verification (2026-08-11; superseded candidate)

- Fixed the comic region editor deleted-state branch: deleted regions now
  render their recovery actions and can be restored without losing the sidecar
  identity. Added English and Simplified Chinese locale entries and direct
  component coverage for bounded geometry/style patches and recovery actions.
- Hid polygon, translation, typesetting, erase, split, merge, and reorder
  controls for deleted regions in the surrounding workspace so recovery is the
  only region action until Restore succeeds.
- Re-ran the low-concurrency unit suite (365 files, 4,711 passed, 1 skipped),
  browser Vitest (24 files, 313 passed, 1 skipped), coverage gate
  (49.89%/43.14%/47.36%/51.13%), production Web E2E (20/20), lint, build
  output checks, Rust Clippy and 50 Rust tests, Tauri integration (110 passed,
  1 skipped), and Windows native WebDriverIO (17/17).
- Tested an extended WebView2 flag set that keeps browser process isolation
  while disabling built-in extensions, sync, print preview, speech API and
  additional background features. The 30-second sample reached 373.01 MiB
  working set and 163.40 MiB private bytes with 1,068.16 ms startup; it still
  failed the 350 MiB budget and was not added to the release configuration.
- The experiment output was removed after review. No acceptance status was
  changed: the five-minute release candidate now measures 373.52 MiB and the
  production OCR, external-format, installed-workflow, signing, privacy and
  external-input blockers remain open.
- Rebuilt the unsigned Windows NSIS candidate after the editor fix. The new
  artifact passed the exact isolated lifecycle and forced-preflight cleanup
  checks in `target/windows-installer-current-17` and
  `target/windows-installer-preflight-current-6`; the five-minute measurement
  is `target/babelleaf-performance-0.4.3-current-3.json`.
- Rebuilt the production Web export and reran the format/import browser matrix
  (20/20) and Browser Vitest (24 files, 313 passed, 1 skipped) after the final
  workspace guard change. The final candidate remains unsigned and over the
  working-set budget; the normative verdict remains REJECTED.
- Re-ran the final-code native lanes after the workspace guard: Tauri
  integration completed with 110 passed and 1 skipped, and WebDriverIO
  completed with 17/17. Their temporary `.next`, `out`, `test-results`,
  `playwright-report`, debug log, and `target/debug` outputs were removed after
  confirming the release artifacts and verification evidence remained intact.

## Final automated continuation (2026-08-12)

- Removed persistent HTTP-plugin Cookie storage from the local-first provider
  boundary. Explicit DeepSeek/OpenAI/Anthropic requests retain TLS, HTTP/2,
  charset, macOS system-configuration, and controlled dangerous-settings
  support; no provider requires a browser-style persistent Cookie jar.
- Isolated Tauri/WebDriver test APPDATA, LOCALAPPDATA, and WebView2 profiles;
  added a post-window-build PID handshake, bounded child timeout, and exact-PID
  cleanup. This removes port-ready/window-ready races and prevents stale test
  processes or profile locks without terminating unrelated BabelLeaf windows.
- Added a supported Windows WebView2 low-memory target that switches inactive
  windows to `Low` and restores `Normal` on focus or input. Command-palette,
  language detection/catalog, TXT conversion, TTS constants, app-lock UI, and
  optional workspace code are deferred from the library startup path.
- Final full regression results: formatting 1,098 files; lint/type checking
  1,060 files; 374 unit files with 4,743 passed and 1 skipped; 24 browser files
  with 313 passed and 1 skipped; production Web E2E 20/20; Rust 50/50;
  Tauri integration 110 passed and 1 skipped; native WebDriverIO 18/18;
  format manifest 50 entries with 37 generated local fixtures and 5 declared
  external-required entries. Production build/output contracts, frozen pnpm
  install, Clippy `-D warnings`, npm audit, and `git diff --check` pass.
- Final performance evidence is
  `target/babelleaf-performance-0.4.3-release.json` (schema 3). It records the
  exact release executable SHA-256, 155.36 ms startup, 346.07 MiB peak tree
  working set during the required 300-second idle window, 130.11 MiB peak
  private bytes, seven retained sandbox/process roles, and successful isolated
  profile cleanup.
- Final strict SBOM evidence is
  `target/babelleaf-compliance/sbom.source.json`: 796 components, complete
  production package listing, zero license gaps, and matching NSIS bytes/hash.
  `pnpm audit --prod --audit-level moderate` reports no known vulnerabilities.
  RustSec reports no vulnerability-class finding, with 25 allowed
  unmaintained/unsound informational warnings retained for upstream tracking.
- Final installer evidence uses
  `BabelLeaf_0.4.3_x64-setup.exe`, 239,320,345 bytes, SHA-256
  `B1F70EE9A94FB431ABDD87C2344ECC772E3A4406530FD3E4257B7ACABD956CC1`.
  Isolated install, responsive launch, uninstall, data-sentinel retention, and
  forced-preflight cleanup pass. Authenticode remains `NotSigned`.
- Post-verification cleanup removed more than 47 GiB of reproducible Next,
  Cargo, WebDriver, RustSec, fixture, and superseded performance artifacts.
  The final executable, NSIS bundle, schema-3 performance JSON, strict SBOM,
  installer evidence, source, local environment files, credentials, and user
  data were not removed.
- The automated gates above are closed. The normative verdict remains
  **REJECTED** because a selected production OCR/model quality and license
  matrix, installed-package batch/editor/export and hostile/external-format
  workflows, clean-profile traffic capture, credentialed provider lifecycle,
  Windows dictionary/TTS playback, signed package, committed-source identity,
  and remote required-check run are still absent. These require external
  models, legal samples, credentials, audio/manual observation, signing
  authority, writable Git metadata, or remote CI and cannot be replaced by a
  synthetic local test.

## Active continuation (2026-08-13; current working tree)

- Selected `tesseract-wasm` 0.11.0 as the concrete Windows x64 local OCR
  runtime. It is dynamically imported only after an explicit **Run local OCR**
  action. The packaged Worker and fast/fallback WASM assets contain no model
  weights and remain outside the reader startup chunk.
- Added an exact Apache-2.0 `tessdata_fast` 4.1.0 catalog for English,
  Simplified Chinese, Japanese, and vertical Japanese. Only manifests whose
  identity, version, artifact inventory, license file, sizes, and SHA-256
  values exactly match the catalog receive release-gate evidence. No model is
  downloaded or bundled by the application.
- Added reproducible local model verification and import-pack construction
  scripts. The dedicated-worker matrix passed all four deterministic samples:
  normalized character accuracy 1.00 for every sample, 139.93-163.52 ms page
  latency, and 171.26-225.07 MiB observed process memory. The immutable record
  is `docs/evidence/OCR_TESSERACT_WASM_WIN32_X64_2026-08-13.json`.
- Added vertical-page counter-clockwise preprocessing, CJK inter-character
  whitespace normalization, and inverse rectangle mapping back to source page
  coordinates. Direct unit coverage verifies the coordinate transform.
- Connected the verified runtime to the desktop comic workspace with model
  selection, current-page/all-imported-pages scope, explicit start, progress,
  cancellation, one-page-at-a-time processing, sidecar checkpointing after
  every page, and deterministic Worker shutdown. Manual edits remain separate
  and source page bytes are not modified.
- Added English and Simplified Chinese interface strings plus component-level
  workflow coverage. The focused OCR/runtime/model/workflow/settings/workspace
  set passes 15 tests before the added end-to-end workspace case; the complete
  workspace component file now passes 4/4. TypeScript and Biome pass for 1,069
  files with no warning.
- Replaced the external-required format placeholders with deterministic legal
  local fixtures, including a reproducibly generated native KF8/AZW3 sample.
  The current fixture gate generates 39 local fixtures, verifies 48 manifest
  entries, and reports `external-required=0`.

### Current blocker disposition

- **BL-PC04-001 is narrowed, not closed.** The concrete runtime, exact model
  provenance/license/checksum gate, basic zh-CN/en/ja/vertical-ja recognition,
  resource evidence, and application entry point now exist. A representative
  legally usable manga/scanned-book corpus and exact installed-NSIS workflow
  remain required before production OCR quality is accepted.
- **BL-PC04-002 is narrowed.** The OCR stage is now reachable and checkpoints
  results, but exact-package restart/retry evidence for the complete
  OCR-to-translation-to-cleanup-to-typeset-to-export sequence remains open.
- **BL-PC04-008 is narrowed.** The repository matrix no longer has
  external-required placeholders. Installed-application routing of every valid
  and hostile case, DRM diagnostics, and user-folder interaction still require
  executable evidence.
- Adding a new production dependency invalidates the previous SBOM, package
  hashes, installer, performance, audit, and exact-package evidence. Those
  gates must be regenerated after the remaining implementation work freezes.
- **BL-PC04-003 is narrowed.** A concrete, strictly catalogued OpenCV LaMa
  model and ONNX Runtime Web 1.27.0 adapter now provide local model-backed
  cleanup, explicit current-page preview, opt-in export, checksum/license
  verification, masked-only compositing, single-session execution, and
  deterministic release. The synthetic Windows x64 test removed glyph-like
  strokes, but observed 744.38 MiB process RSS and 10.59-second inference;
  representative manga quality and exact installed-package evidence remain
  open. See `INPAINT_LAMA_RUNTIME.md` and the curated evidence JSON.
- The normative verdict remains **REJECTED**. Representative OCR/inpainting
  and installed-package workflows, privacy capture, credentialed provider checks,
  installed secure-credential lifecycle, dictionary/physical TTS, minimum
  window and full zh-CN review, signing, writable Git provenance, push, and
  remote CI remain open.

## Final local automated disposition (2026-08-13; authoritative continuation)

The implementation and all user-independent local automated gates now pass.
The authoritative evidence, current package hashes, final test counts, measured
resource use, accepted upstream warnings, and external/user-owned gates are in
`PC_0.4_FINAL_AUTOMATED_ACCEPTANCE_2026-08-13.md`. In particular:

- the final executable is 61,180,416 bytes with SHA-256
  `c7da90a4af716bdd651fe062856a2dbc47d74b3fe1864d43a62b8aae0439135c`;
- the final unsigned NSIS package is 243,240,961 bytes with SHA-256
  `29d26a349dfc39ff6ae3cecf96a3dc6d82498100141f28f7eb8f29ef91b9670b`;
- the 300-second idle working-set peak is 97.43 MiB; startup is 162.79 ms;
- the strict source SBOM contains 814 components, zero gaps, and is bound to
  the final NSIS hash;
- Tesseract's latest verification peak is 233.12 MiB, while the explicit LaMa
  quality path measures 747.08 MiB process RSS and remains outside startup;
- exact final-package clean-host execution, credentialed providers,
  representative legal content, human visual/audio review, signing, legal
  review, committed-source provenance, and remote CI remain external gates.

Accordingly, the earlier blanket **REJECTED** wording in this historical ledger
is refined to **LOCAL AUTOMATION PASS / FORMAL RELEASE PENDING EXTERNAL
EVIDENCE**. It does not authorize 0.5 implementation.
