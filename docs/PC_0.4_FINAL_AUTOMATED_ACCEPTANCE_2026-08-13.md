# BabelLeaf 0.4.3 PC final automated acceptance record

## Verdict

The current working tree passes every PC 0.4.3 implementation check and every
acceptance gate that can be completed locally without user credentials,
signing authority, legally supplied evaluation content, a separate minimum-spec
host, or writable Git and GitHub state.

This is not a formal release acceptance. The release verdict remains
**PENDING EXTERNAL EVIDENCE**, and 0.5 platform implementation remains blocked,
until the user-owned and external gates in this record are completed against
the exact final package and committed source identity.

This record supersedes earlier candidate hashes, measurements, dependency
counts, and automated test counts in
`PC_0.4_REMEDIATION_STATUS_2026-08-09.md`. Historical findings in that document
remain useful only where this record does not replace them.

## Control record

- Product version: `0.4.3`.
- Verification date: 2026-08-13, Asia/Hong_Kong.
- Host: Windows 10 Pro for Workstations 10.0.19045.
- Repository base: `main` at
  `db1dce6aed9db2ca5dcfa2e078acd6a2346b6592` plus the reviewed corrective
  working tree.
- Git state: dirty and uncommitted because `.git` is read-only in the current
  environment. No claim of committed-source provenance is made.
- Product boundary: local files and sidecars remain local; cloud translation
  is reachable only after an explicit user action; original books and page
  images are not modified.

## Final automated regression ledger

| Gate | Result | Current evidence |
| --- | --- | --- |
| Formatting | PASS | 1,117 files; `git diff --check` also passes, apart from informational checkout line-ending notices |
| TypeScript/Biome lint and type checks | PASS | 1,079 files |
| Unit tests | PASS | 382 files; 4,771 passed, 1 skipped |
| Coverage | PASS | 52.10% statements, 45.07% branches, 50.23% functions, 53.41% lines |
| Browser Vitest | PASS | 24 files; 313 passed, 1 skipped |
| Production Web E2E | PASS | 23/23; no unhandled view-transition rejection |
| Rust application tests | PASS | 50/50 |
| Rust format/check/Clippy | PASS | all targets; Clippy with `-D warnings` |
| Tauri integration | PASS | 110 passed, 1 skipped; clean process exit |
| Native Windows WebDriverIO | PASS | 27/27; local formats, MDict, zh-CN, viewport, WebGL, en/ja/zh TTS completion, memory command, IPC and traffic checks |
| Production application build | PASS | Next production build, translations, generated-output contracts, and lookbehind checks |
| Local format matrix | PASS | 48 manifest entries; 39 generated legal local fixtures; `external-required=0` |
| npm production security audit | PASS | no known vulnerabilities at moderate-or-higher audit level |
| Windows-target RustSec audit | PASS WITH TRACKED WARNINGS | zero known Windows-target vulnerabilities; 24 allowed unmaintained or unsound advisories retained for upstream disposition |
| Strict source SBOM | PASS | CycloneDX 1.5, 814 components, complete pnpm production graph, zero gaps, `SOURCE_COMPLETE` |

The full JavaScript, browser, Rust, Tauri, native, build, audit, model, package,
and performance lanes were rerun after the functional corrections. After the
full regression, the only source-level changes were the WebDriver-only clean
exit watcher and a Windows-irrelevant transitive lockfile patch; the affected
Rust, Tauri, lint, and native contract lanes were rerun.

## Final Windows artifacts

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `target/x86_64-pc-windows-msvc/release/babelleaf.exe` | 61,180,416 | `c7da90a4af716bdd651fe062856a2dbc47d74b3fe1864d43a62b8aae0439135c` |
| `target/x86_64-pc-windows-msvc/release/bundle/nsis/BabelLeaf_0.4.3_x64-setup.exe` | 243,240,961 | `29d26a349dfc39ff6ae3cecf96a3dc6d82498100141f28f7eb8f29ef91b9670b` |

- Product and file version metadata are `BabelLeaf` and `0.4.3`.
- The standard NSIS package passes packaging preflight and contains the offline
  WebView2 bootstrap path.
- The isolated smoke flavor passes silent install, responsive launch,
  uninstall, temporary-profile cleanup, and preservation of a user-data
  sentinel. It exits with no BabelLeaf process left behind.
- The standard package is unsigned (`Authenticode: NotSigned`).
- The isolated smoke was completed before a final lockfile-only update to
  `event-listener` from 5.4.1 to 5.4.2. That crate is not in the Windows target
  graph. The rebuilt standard artifact and its hash above are authoritative,
  but an exact-package clean-host UI lifecycle remains an external gate.

## Performance and portability

`target/babelleaf-performance-0.4.3-release.json` is bound to the final
executable hash above and records:

- startup: 162.79 ms against a 2,500 ms budget;
- 60-second warmup peak working set: 349.13 MiB;
- required 300-second idle peak working set: 97.43 MiB against a 350 MiB
  budget;
- peak private bytes during the idle sample: 127.93 MiB;
- portable-state placement: pass;
- isolated-profile cleanup: pass.

Portable mode stores `settings.json`, application data, logs, and the WebView2
profile adjacent to its executable. The WebView2 memory target changes to low
after bounded inactivity and returns to normal on focus or input. Above-fold
cover loading is bounded, and optional translation, comic, OCR, and inpainting
code remains outside the startup path.

## OCR and image-repair evidence

- `tesseract-wasm` 0.11.0 with exact locally imported `tessdata_fast` 4.1.0
  English, Simplified Chinese, Japanese, and vertical-Japanese models passed
  four deterministic samples at normalized accuracy 1.00. The latest rerun
  measured 152.18-176.28 ms and a maximum process memory of 233.12 MiB.
- OpenCV LaMa `inpainting_lama_2025jan.onnx` through `onnxruntime-web` 1.27.0
  passed the deterministic masked-region test. The latest rerun measured
  3,488.16 ms model load, 11,059.92 ms inference, and 747.08 MiB process RSS.
- Both paths require explicit, checksum-verified local model import. Neither
  model is bundled or downloaded by BabelLeaf. OCR runs sequentially and LaMa
  remains a single-session, explicit high-memory option with deterministic
  cleanup as the lower-resource fallback.
- Synthetic correctness does not establish representative manga or scanned
  book quality. That remains an external corpus and visual-review gate.

## Security, privacy, and dependency disposition

- Provider traffic is restricted to the named DeepSeek, OpenAI, Anthropic
  origins or loopback Ollama, with redirects and ambient credentials disabled.
- Native E2E observed no non-loopback application traffic without an explicit
  translation action and no rejected Tauri IPC.
- API keys use the secure credential boundary and are excluded from sidecars,
  diagnostics, and repository artifacts by tests and static checks.
- `event-listener` was updated to the patched 5.4.2 release.
- The all-platform Rust lockfile still contains `nix` 0.19.1 through
  `battery` 0.7.8 only for FreeBSD and DragonFlyBSD; it is absent from the
  planned Windows, macOS, iOS, and Android target graph.
- Windows-reachable `lru` 0.16.4 remains transitive through Tantivy/Turso. Its
  published unsoundness requires a stored key whose destructor panics while
  unwinding is caught. Current BabelLeaf cache keys do not meet that trigger;
  Tantivy's current semver constraint prevents a compatible lockfile-only move
  to the fixed major release. Track the upstream upgrade rather than forcing an
  incompatible transitive override in 0.4.3.
- ONNX Runtime's unused-initializer messages and the WebView2
  `Chrome_WidgetWin_0` unregister diagnostic occur during successful local
  inference or clean shutdown. They do not change exit status or test results
  and remain recorded as upstream diagnostics.

## Findings closed in the current working tree

- The Tauri ACL now explicitly permits the Windows WebView2 memory command in
  normal and WebDriver capabilities; native execution proves the command.
- The WebDriver harness now uses a bounded, test-only clean-exit handshake and
  no longer reports an application exit code 1.
- Library cover loading no longer marks an unbounded number of images as eager;
  first-visible rows are bounded and the remaining covers are lazy.
- Local portable mode no longer leaks application state into the normal user
  profile during the performance harness.
- The local format manifest has no external-required placeholder and includes a
  reproducibly generated native KF8/AZW3 fixture.
- OCR, selectable text, translation, region editing, cleanup, typesetting,
  CBZ/ZIP export, and image-only PDF export retain immutable source bytes and
  versioned sidecar state.

## External and user-owned gates

The following items cannot be truthfully completed from the current local
environment. They are release gates, not missing implementation claims.

1. Supply explicit test credentials and consent for one paid, real lifecycle
   request to each release-advertised cloud adapter: DeepSeek, OpenAI, and
   Anthropic. Validate setup, submit, cancel, timeout/failure, result restore,
   secure credential persistence/removal, and captured destination traffic.
2. Supply or approve a legally usable representative corpus of manga,
   webtoon, western-comic, grayscale, color, low-resolution, vertical-text,
   mixed-language, handwritten/furigana, and scanned-book pages. Record OCR,
   cleanup, typesetting, and export quality against manual ground truth.
3. Run the exact standard installer hash above on a clean supported
   minimum-spec Windows VM or physical host. Complete visible install, launch,
   every format route, model import/removal, end-to-end comic workflow,
   restart/retry, export, uninstall, source-hash comparison, and data-retention
   checks.
4. Perform human audio review for English, Japanese, and Simplified Chinese
   Windows voices. Automation proves API completion and queue behavior, not
   intelligibility, pronunciation, volume, or device output.
5. Provide the Windows Authenticode certificate and protected signing
   procedure, then rebuild or sign and repeat hash-bound package, smoke,
   performance, SBOM, and provenance checks.
6. Complete the owner or legal review of third-party notices, model and font
   redistribution terms, and AGPL-3.0 corresponding-source obligations.
7. Restore writable Git metadata and authenticated GitHub access. Review and
   commit the working tree, merge it into `main`, push it, run all required
   remote checks, protect `main`, tag the exact source, and bind the released
   artifact to that identity.

## Workspace cleanup

After verification, 32.58 GiB of reproducible output was removed from exact,
workspace-bounded paths. The removed set comprised Next/Web export output,
Playwright output, Cargo debug/release caches and intermediate dependency
objects, generated format fixtures, the isolated RustSec database, superseded
performance reports, stale installer-test profiles, the smoke-only installer,
and obsolete smoke failure logs.

The final executable and standard installer, final performance JSON, strict
SBOM, current smoke success record, OCR and LaMa model inputs, curated model
evidence, source files, `.env` files, credentials, and user data were preserved.
The hashes of both final Windows artifacts were recomputed after cleanup and
still match this record.

## Resumption order

1. Freeze and commit the current reviewed working tree without source changes.
2. Execute the credentialed provider and representative-corpus gates.
3. Build or sign one final standard package from the committed identity.
4. Execute the exact-package clean-host lifecycle and manual visual/audio
   review.
5. Regenerate performance evidence and the strict SBOM for the exact signed
   artifact.
6. Push, run required GitHub checks, protect and merge `main`, tag the release,
   and archive hashes and evidence.
7. Mark 0.4.3 accepted only if every item above passes; only then begin 0.5.
