# BabelLeaf 0.4.6 internal PC qualification

## Verdict boundary

Verdict: **INTERNAL_IMPLEMENTATION_PASS / EXTERNAL_VALIDATION_DEFERRED**.
Qualification date: 2026-10-23. All local internal gates below pass. Final
required-check, protected merge and canonical-main closure receipts remain
independent controls; this source record alone does not assert merge, tag
publication or external acceptance.

Product scope is unchanged 0.4 PC. No 0.5 implementation, paid provider call,
credential access, model download or source-book modification is included.
This record supersedes current-source OPEN items in
`PC_0.4.6_REMEDIATION_STATUS.md` only when its closure receipts pass. The October
18 audit and previous-version tags, assets and measurements remain immutable.

## Source and reproducibility

- Application-source freeze: `741b792366fd3b4afc30b35823383a44ccb08d7c`.
- Test-tool freeze: `f44cd28f7d25c9067e41370c77822bb22afd50d1`. Its only later
  code changes are a native-probe prebundle policy and its contract test;
  production application/Rust/vendor/lock inputs are unchanged.
- PR: https://github.com/sakura99966/BabelLeaf/pull/10, targeting protected main.
- Full application PR run: https://github.com/sakura99966/BabelLeaf/actions/runs/39947068434,
  all twelve lanes PASS. CodeQL run 39947068215 PASS.
- Intermediate test-tool PR run 39978330158 and passing CodeQL 39978329872
  remain historical receipts. Final documentation-only head checks must pass
  before merge, even if pushing that head supersedes an intermediate run.
- Normal protection remains strict and admin-enforced: required-checks and
  all three CodeQL analyses. No bypass, fake approval, ignored failure or
  manual alert dismissal is used.
- `scripts/prepare-reader-security.mjs` reproducibly modifies only Foliate
  paginator/fixed-layout/PDF source. Receipts correctly report the prepared
  submodule dirty; rootSourceDirty=false on frozen native measurements. No
  unpublished submodule commit/gitlink is staged. Reapply preparation on build.

The canonical main package must be rebuilt after protected merge. Do not rename
the qualified 741b79236 candidate into a main build. The generated
`BabelLeaf_0.4.6_RELEASE_EVIDENCE.json` and checksum file beside the final package
must bind actual main SHA/tree, executable/NSIS/manifest/SBOM hashes, validation
receipts and remote/tag state. Those receipts, not this forward-looking source
record alone, establish final release closure. Packages are unsigned internal
candidates, not signed production releases.

## Complete applicable automated matrix

Raw logs/receipts remain under `target/remediation-0.4.6`; exact frozen native
receipts are copied there before the reusable driver output is reused.

| Gate | Result and exact evidence |
| --- | --- |
| pnpm / hooks / frozen resolution | pnpm 11.1.1 via corepack; normal format/lint/full-unit pre-push hooks retained; no bypass |
| TypeScript / Biome / format | PASS; 1,153 lint files / 1,183 format files at code freeze; final docs still require diff/link review |
| Full unit | PASS; 417 files, 5,079 passed / 1 inherited skip after probe contract; normal f44cd28f7 push |
| Full coverage | PASS; application freeze 5,078 passes / 1 inherited skip; statements 53.80%, branches 46.78%, functions 51.91%, lines 55.15%; unchanged thresholds; coverage-final-741b79236.log |
| Real Chromium | PASS; 28 files, 326 passed / 1 inherited skip; browser-final-741b79236.log |
| Production Web / contracts | PASS; production-web-20261023.log; static webpack export and runtime-copy checks |
| Production Web UI | PASS; 23/23, retries=0; production-web-e2e-20261023.log; not a development-server result |
| Legal format fixtures | PASS; 39 generated files / 48 manifest entries / external-required=0; format-fixtures-20261023-passed.log; not representative-corpus proof |
| Rust format / strict Clippy | PASS; rust-fmt-closure-20261023.log / rust-clippy-closure-20261023.log; application scope, -D warnings |
| Windows Rust unit | PASS; 52/52; rust-unit-closure-20261023.log |
| Native Windows WebView2 | PASS; 7 files, 126 passed / 1 inherited skip; native-frozen-f44cd28f7.log |
| Native Windows UI | PASS; final local 27/27 including real local speech completion and no unexpected non-loopback application traffic; native-ui-final-f44cd28f7.log; only documentation edits were uncommitted |
| Linux native | PASS; 126 passed / 1 inherited skip; hosted-linux-741b79236-pass.log; hidden-window PDF raster and disposal included |
| Native interruption/recovery | PASS; all 11 phases, source f44cd28f7 and rootSourceDirty=false; crash-frozen-f44cd28f7.json/log |
| Production/full JavaScript graph | PASS_WITH_PINNED_DEVELOPMENT_BACKPORTS; production unresolved=0, full unresolved=0; dependency-security-20261023-evening-fixed.json; raw scanner still reports three reviewed dev-only records |
| Windows Rust security | Zero vulnerabilities / 18 reviewed warnings; rust-windows-20261023-fixed.json; DB 640bf5a9f06e66d8721e8772766531fe77c8630d; not an all-platform zero claim |
| Standard production build | PASS; windows-standard-741b79236-build.log; immutable archived bytes below |
| Standard metadata preflight | PASS; current product/version/identifier, current-user NSIS and embedded offline WebView2 checked |
| Local dedicated smoke lifecycle | PASS; exact f44cd28f7 smoke bytes, install/responding launch/uninstall/data retention/owned-state cleanup; installer-isolated-f44cd28f7-ready.log and success.txt |
| Hosted standard lifecycle | PASS; real standard NSIS install/launch/uninstall/data retention plus actual packaged UI and embedded bytes; hosted-installer-741b79236-pass.log |
| Real standard packaged UI | PASS; actual Import menu, 7 components / 226 assets / 28,858,205 embedded bytes individually hashed; packaged-runtime-741b79236.json |
| Strict installer-bound SBOM | PASS; target/releases/0.4.6/741b79236/sbom.json, 801 components / zero gaps; no copied-runtime component omitted |
| Reference-host latency/workload | PASS; frozen native reading/subset receipts and detailed table below |
| Standard idle | PASS; idle-standard-741b79236.json; 60 s warmup / 300 s idle, portable placement and profile cleanup |
| Final main provenance / remote closure | Established only by final protected-head/main checks and generated RELEASE_EVIDENCE receipt, not an older candidate |

The inherited skip is Turso's FTS UPDATE regression. Production indexing uses
DELETE+INSERT, not this unsupported UPDATE path. The skip is visible and is not
an active PC workflow waiver. Coverage is a regression gate, not proof of every
path. WebView2 may log Chrome_WidgetWin_0 error 1412 during completed process
teardown; tests still require their normal assertions and exit status.

## Functional and audit closure

| Requirement / finding | Implementation and verification |
| --- | --- |
| Local library, all declared formats, appearance, search, annotation | Native/Web format-import UI, malformed/DRM/resource diagnostics, parser and source-hash regressions; genuine authored KF8 fixture separate from classic AZW extension routing |
| Selection/unit/chapter/book translation and providers | Named application-owned DeepSeek/OpenAI/Anthropic/loopback-Ollama contracts; explicit request boundary; complete-result/cache/cancel/retry tests, no paid call |
| Bilingual reading, anchors, glossary/memory/review/interchange | Existing full translator, sidecar, dashboard, TBX/TMX/XLIFF, alignment and recovery suites remain passing |
| Comic OCR/edit/translate/repair/typeset/export | Lazy local worker/model-pack, workspace, masks, edit revisions, pipeline, bounded export/source-protection and browser/native contracts pass; no claim of fresh positive inference without local weights |
| Dictionary / local speech | Real MDict import/persistence/lookup/removal and English/Japanese/zh-CN native synthesis completion; human listening remains external |
| AUD18-01 dictionary HTML and CSS | Inert-template sanitization, local-resource-only rewriting, shared shadow root plus trusted outer layout/paint/style containment; actual Chromium and native hostile CSS/script tests with safety positive controls |
| AUD18-02 implicit paid translation on reopen | Ephemeral view/book/provider/target/context grants; close/replacement/config change abort or invalidate; saved results reopen locally without granting permission |
| AUD18-03 ordinary configuration durability | Validated bounded atomic main/previous snapshots, preserved exact corrupt bytes, visible recovery/dirty retry, close veto, cross-window lock, annotation/tombstone merge and bounded save coalescing; native kill/recovery included |
| AUD18-04 dependency security | Actual published JS/Rust fixes and current Windows graph; exact-version source backports only for two development packages without published fixes, installed-code/hash regressions, reviewed warnings and future-platform findings retained |
| AUD18-05 copied runtime / SBOM | Explicit PDF.js/OCR/ONNX/WASM/font/style versions, sources, transforms, notices, source/output hashes and strict final-static/SBOM reconciliation; actual EXE bytes verified |
| Runtime resource follow-up | Closed parser/file resources detach synchronously and release after final pane/speech owner; separate TTS book lease survives pending shutdown; failure cleanup and concurrent reopen covered |
| PDF.js 6 follow-up | Return/await loadingTask.destroy instead of absent proxy.destroy; actual PDF repeated-disposal tests; thumbnail print intent avoids hidden-window rAF starvation without changing normal page rendering |
| CI / development-tool follow-up | Supported ubuntu-24.04 pinned; mocker 4.1.12 only, coordinated runner/browser family 4.1.11 because webdriverio 4.1.12 was not published; frozen probe prebundles prevent late URL invalidation, no retry or timeout waiver |
| Source pruning | Removed confirmed orphan Quota, CachedImage, useAutoHideScrollbar and unused copy-tool dependencies; narrow comic overlay imports. No unmeasured memory-savings claim or removal of safety/notice code |

The historical audit probes remain failing-before evidence. Their production
regressions are now maintained in the normal suites; old pre-hardening fixture
mocks/DOM assumptions are not substituted for the current executable contracts.

## Performance measurements and limits

Host: Windows 10 19045 x64, i9-13900K, 32 logical CPUs,
137,167,110,144 RAM bytes; WebView2 155.0.0.0. This is not a minimum-spec host.
No other build/full-test job ran during the recorded frozen native scenarios.
The reference startup uses a fresh owned profile, not an OS page-cache flush.

| Scenario | Measured | Budget / scope |
| --- | ---: | --- |
| Standard launch to committed interactive library | 767.1 ms | <=2500 ms enforced; real Import menu click; not Win32 window readiness |
| EPUB managed import to readable page | 544.9 ms | <=8000 ms; copy, durable library, actual rendered text |
| PDF managed import to readable page | 466.7 ms | <=8000 ms; actual rendered text/canvas |
| EPUB / PDF warmed 50-turn p95 | 112.1 / 57.0 ms | <=250 ms; actual location changes; bounded edge reversal included |
| EPUB / PDF full-book search p95 | 176.6 / 247.7 ms | <=500 ms; 5 complete searches, first cold search included, stable 400/404 matches |
| Chapter / full-book mock queue | 407.1 / 21,425.4 ms | <=60 s / 15 min; 20/5000 segments, concurrency 2, recovered 129 completed items, every item exactly once |
| Comic workspace atomic save p95 | 76.6 ms | <=500 ms; 20 pages, 1000 regions, 100 manual revisions, 1000 translations, 710,913-byte sidecar; 16 writes/8 saves |
| Warmed overlay commit/layout p95 | 1.9 ms | <=16 ms; 50 measured updates after 10 warmups; 45 visible/5 stale regions; not GPU presentation latency |
| Reading peak working set / private bytes | 800,919,552 / 687,882,240 bytes | Each <=1 GiB; owned process tree sampled every 200 ms |
| Queue/workspace peak working set / private | 583,929,856 / 399,962,112 bytes | Each <=1 GiB; 78 samples |
| Native workload peak working set / private | 729,202,688 / 514,174,976 bytes | Each <=1 GiB; four workers created/zero retained, heartbeat gaps <=11.8 ms |
| Reading / queue sampled disk high-water | 34,711,178 / 37,749,514 bytes | <=1 GiB; 2-second samples of entire owned profile/tool/fixture directory; junctions excluded; not unsampled absolute peaks |
| Standard NSIS size | 248,653,252 bytes | <=250 MiB; includes offline WebView2 bootstrap; optional weights excluded |
| Idle 60 s warmup + 300 s measurement | 101.20 MiB working set / 180.54 MiB private | <=350 MiB idle working-set peak; 274 samples; warmup peak 380.30 MiB separately recorded; portable placement/profile cleanup pass |

Native fixture identities (source and sandbox bytes unchanged):

- EPUB: a6403b7951058243f91843bbe8a9e46ed205d5a7dcdb9758f70f11e360e17246.
- PDF: f6dd04bcb9cf62087625edc5a38f091e6fe7edbf5cb39d612479bb332f5dbbd3.
- 20 segments: 182ed14fed3a709624915d069fb0e678e0c4ed037ef69de2dd8f01b0199bf265.
- 5000 segments: f003083bfb6bf25aee2bb9796730f5862c9e0c337d4ef3a36f13b368d39be660.
- Comic workspace: d15e5c02efc36239d1e3e101077fb994f501cf76ef57bd025ded783e6cd582c1.
- Native webdriver EXE: f689d9198b667d5b969866799b7cd9768e2b1ff494f0dec0fc1f22fdef71a4f7;
  this is not the standard release executable below.

The shared hosted Windows run recorded 2664.9 ms interactive startup with its
reference-host budget explicitly unenforced. Preserve that result; do not call
it a minimum-host or universal 2500 ms guarantee. Paid network latency, model
quality, OCR/inpainting throughput without weights and arbitrary large books
are not inferred from these deterministic fixtures.

## Immutable candidate identities

Pre-merge standard candidate: `target/releases/0.4.6/741b79236`.

| File | SHA-256 |
| --- | --- |
| babelleaf.exe | e603b31434f30478512489e7f627bfa61e519f89ad1294c278129d91e6d01abc |
| BabelLeaf_0.4.6_x64-setup.exe | 8c863a00786ef0bcb273c3bc7b0b415f026005d8c042843a158a1c0c327560eb |
| runtime-manifest.json | 0146e94a2acbffe8e35837a6336054bc89494b71279ce6814693ff708beb863a |

Dedicated local smoke candidate: `target/releases/0.4.6/f44cd28f7-smoke`;
installer SHA-256 d62d655c4a8fe48368a68e812b559e65c7d8be4f63dbf5404066901bbf0545b8,
executable befb4a6ad27bed5160d37c2c59e76d400ed2b029899141e47ce854f9292536f4.
Smoke identity deliberately differs from the standard product and has no file
associations. Hosted CI separately exercises the standard identity on a clean
runner. Never confuse these with canonical-main bytes or replace older assets.

## Residual and owner-deferred conditions

- Raw npm version scanning still reports three development-only advisories;
  exact backports are tested and hash-bound, not a false zero or global ignore.
- Windows Rust has 14 unmaintained, 3 unsound and 1 yanked warning with call-path
  disposition in DEPENDENCY_SECURITY_0.4.6.md. Non-Windows nix 0.19.1 is a future
  platform finding, not Windows vulnerability proof. Governance/Scorecard
  history/badge/aggregate-OSV findings are not silently dismissed.
- Recovery covers controlled process kill and ordinary atomic replacements,
  not power loss or destruction of every copy. Unwritable-storage comic results
  stay protected for local retry in the current session; forced-kill durability
  cannot be guaranteed before any successful write.
- Positive OCR/LaMa inference is not freshly requalified: no authorized local
  model weights were present, and none were downloaded. Lazy runtime resources,
  pack checksums/limits, missing-pack diagnostics and worker/pipeline contracts
  are covered; historical model results remain historical.
- DEFERRED by owner: paid provider credentials/calls; representative lawful
  books/manga and human OCR/repair ground truth; independent minimum-spec clean
  Windows hardware; human listening/accessibility review; Authenticode authority;
  responsible-owner model/font/data/license review. None is PASS.
- Future platform work needs a new request. Keep local import, explicit named
  provider requests, no scraping/sync/cloud TTS or implicit model downloads.

## Closure and cleanup controls

After the local matrix and final required PR checks pass, merge normally,
fetch/fast-forward actual main, rebuild/qualify/bind its artifacts and strict
SBOM, verify local/remote/tag identities and main checks, then remove only this
merged remediation branch. An internal-qualified annotated tag is not a signed
production acceptance statement or permission to replace historical releases.

Only then remove individually resolved reproducible compiler/Next/test caches
and hash-proven duplicate copies, with a generated before/after receipt.
Keep tiny Next route/root-parameter type outputs needed by normal lint/hooks.
Preserve source, credentials, .env, user books/sidecars/dictionaries, models,
all unique historical release/candidate artifacts, failure evidence, logs,
hashes/manifests/SBOMs and current runtime vendor assets. Do not delete target,
node_modules, the shared pnpm store or user application profiles wholesale.
