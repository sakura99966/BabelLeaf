# 0.4.6 dependency-security disposition

Date: 2026-10-18. Scope: Windows PC candidate; not blanket cross-platform or
responsible-owner legal acceptance. Raw reports are retained under
`target/remediation-0.4.6/`. Never suppress a new advisory to reproduce an old
green result.

## Enforced checks and active fixes

- Production npm graph: zero unresolved findings.
- Full npm graph: `PASS_WITH_PINNED_DEVELOPMENT_BACKPORTS`; raw version-based
  scanning still reports three high advisory records, not zero.
- Windows Rust audit: zero vulnerability records; 18 warnings remain visible.
- All-platform Rust audit still fails on nix 0.19.1 through battery 0.7.8 /
  tauri-plugin-device-info 1.0.1. This is a mandatory future non-Windows
  qualification issue, not a demonstrated Windows runtime flaw.
- Updated rustls to 0.23.46, quinn-proto to 0.11.18, and ZIP to 9.0.5. Native
  ZIP code uses bounded named-entry reads, not unbounded archive extraction.
- Updated PDF.js to 6.2.108; annotation scripting is explicitly disabled.
  Runtime copies (including dev-declared PDF.js, codecs, styles, WASM and fonts)
  are reconciled against the installed packages and final static output.
- Runtime assets are inventoried by `runtime-vendor-policy.mjs` and verified
  by `runtime-vendors.mjs`. Strict artifact-bound SBOM requires this evidence.
  Package-declared licenses and upstream notices do not substitute for the
  owner's deferred font/model/legal approval.

## Unpublished development-only fixes

Registry inspection and official advisory pages showed no published fixed
release for these two packages at this review. Do not specify fictitious
versions or add a global ignore. Replace the local patch when a compatible,
verified upstream fix is actually available.

| Package | Raw advisory | Actual mitigation |
| --- | --- | --- |
| braces 3.0.3 | GHSA-vfj7-8cjw-p6xm | Parser depth guard plus iterative, bounded AST preflight for compile/expand/stringify; malformed cycles and caller-supplied ASTs included |
| extract-zip 2.0.1 | GHSA-jmr9-qjv8-65gv; GHSA-7pqw-9j4j-h8q3 | Lexical/real-parent confinement before mkdir, bounded symlink targets, exclusive temporary regular files and atomic leaf replacement |

These are development dependency paths, not shipped runtime copies. The gate
rejects unknown advisories, different versions, production findings, changed
patch bytes and mismatching workspace/lock hashes. Eleven real-installed-package
boundary/control cases and eight policy cases must pass before audit acceptance.
It also fails closed on incomplete/network-error audit output. The extract
backport is not claimed to defeat a separate hostile process concurrently
replacing ancestor directories outside the private build/test root.
The gate derives copied-runtime names from the actual declared source manifests,
including aliased components. A dev-declared package copied into the runtime
cannot inherit a development-only mitigation disposition from pnpm's dev flag.

Authoritative definitions:
`scripts/dependency-security-policy.json`, `pnpm-workspace.yaml`,
`pnpm-lock.yaml` and the two `patches/*.patch` files.
CI runs `pnpm -w security:dependencies` without lowering the existing production
audit threshold.

## Rust warning review

Source: fresh RustSec report and
`rust-warning-reachability.json` (`cargo tree --locked --offline -p Readest
--target x86_64-pc-windows-msvc -e normal -i NAME@VERSION`).
This is graph/call-condition review, not proof that arbitrary inputs are safe.
No warning is hidden from cargo-audit.

| Package / advisory | Current Windows scope and disposition |
| --- | --- |
| bincode 1.3.3 / RUSTSEC-2025-0141 | Unmaintained; persisted-scope dependency. Preserve stored-grant compatibility; replacing its binary format requires a separately tested upstream/migration change. No specific exploit is established by this maintenance warning. |
| encoding 0.2.33 / RUSTSEC-2021-0153 | Unmaintained; MOBI native parser. Keep bounded parser and malformed-input regressions; a replacement must retain required legacy encodings and book compatibility. |
| unic-char-property 0.9.0 / RUSTSEC-2025-0081 | Unmaintained; urlpattern through Tauri utilities/http/deep-link. Preserve native capability matching; track upstream replacement. |
| unic-char-range 0.9.0 / RUSTSEC-2025-0075 | Same urlpattern chain and compatibility requirement. |
| unic-common 0.9.0 / RUSTSEC-2025-0080 | Same urlpattern chain and compatibility requirement. |
| unic-ucd-ident 0.9.0 / RUSTSEC-2025-0100 | Same urlpattern chain and compatibility requirement. |
| unic-ucd-version 0.9.0 / RUSTSEC-2025-0098 | Same urlpattern chain and compatibility requirement. |
| lru 0.16.4 / RUSTSEC-2026-0253 | Windows normal graph: Turso -> tantivy 0.26.1. The reviewed Tantivy source uses `LruCache<usize, Block>` only (`src/store/reader.rs`); the advisory requires a stored key destructor to panic during pop and later reuse of the cache. usize has no destructor, so that prerequisite is absent at this reviewed integration. Do not generalize this to new callers/key types. Upstream compatible replacement remains tracked. |
| fxhash 0.2.1 / RUSTSEC-2025-0057 | Not found in the selected Windows normal graph; lock/build/future-target maintenance record, not proven PC reachability. |
| mach 0.3.2 / RUSTSEC-2020-0168 | No selected Windows normal path; future Apple dependency review. |
| paste 1.0.15 / RUSTSEC-2024-0436 | No selected Windows normal path; macro/build maintenance warning remains visible. |
| proc-macro-error 1.0.4 / RUSTSEC-2024-0370 | No selected Windows normal path; macro/build maintenance warning remains visible. |
| zbus_names 4.3.3 / RUSTSEC-2026-0371 | No selected Windows normal path; future desktop/DBus maintenance review. |
| zvariant 5.13.0 / RUSTSEC-2026-0370 | Same future DBus chain; do not blindly change cross-platform serialization. |
| zvariant_derive 5.13.0 / RUSTSEC-2026-0372 | Same future DBus chain / derive tooling. |
| glib 0.18.5 / RUSTSEC-2024-0429 | Unsound warning, no selected Windows normal path; must requalify on Linux/GTK targets. |
| rand 0.7.3 / RUSTSEC-2026-0097 | Unsound warning, absent from selected Windows normal graph; advisory custom-logger/reseed preconditions are not a demonstrated PC path. |
| chacha20 0.10.1 / yanked | No selected Windows normal path; yanked locked-version record remains visible and requires future-target resolution. |

Re-run graph/call-site review if dependencies, enabled features, callbacks or
target change. A passing Windows scan is not permission to enter 0.5 with the
non-Windows issue unresolved.

## Hosted alerts and governance

At the main baseline, CodeQL alerts 6-8 were test-helper findings, not proven
reader runtime exploits. Source fixes replace duplicate tag regexes with XML
parsing and harden test JavaScript data serialization; fresh CodeQL and main
analysis must determine closure. No manual dismissal or fake approval is used.

Scorecard alerts 2-5 concern code-review coverage, activity history, best-practice
badges and an aggregate OSV dependency view. Protected PR #10, exact source and
raw security reports provide current evidence; they cannot manufacture historic
reviews/badges or erase unpatched-version identifiers. Retain these findings and
distinguish them from current PC vulnerability records. Owner/admin governance
decisions and external legal approval are not silently performed.

## 2026-10-23 development-tool follow-up

Hosted run 39639782805 failed the complete JavaScript dependency gate after
three Vite advisories were updated on October 20: GHSA-698v-4r3x-3vcv,
GHSA-r825-w8mm-5pxw and GHSA-587h-7wmj-h5pm. They concern the development
server/editor-launch path, not a demonstrated packaged-reader exploit.
The Vite override and lockfile now require >=7.3.7 <8, the patched upstream
line. Fresh local security evidence reports production unresolved=0 and full
unresolved=0; the existing three pinned development backports remain explicit.
No new suppression, false version or reduced threshold was introduced.

Primary references:
- https://github.com/advisories/GHSA-698v-4r3x-3vcv
- https://github.com/advisories/GHSA-r825-w8mm-5pxw
- https://github.com/advisories/GHSA-587h-7wmj-h5pm
- https://github.com/vitejs/vite/releases/tag/v7.3.7

The October 23 fresh scan then identified GHSA-qxg6-89mg-rqv8 and
GHSA-xp26-3454-mjgp in @vitest/mocker 4.1.11. npm actually publishes the
official fixed mocker 4.1.12, but not @vitest/browser-webdriverio 4.1.12;
that adapter still requires vitest exactly 4.1.11. Keep the coordinated
runner/browser/coverage family at 4.1.11 and override only the affected
internal mocker to the real upstream 4.1.12 patch. Full unit/browser/native
regression is required; no fictitious adapter or relaxed peer constraint.
The fresh JavaScript gate passes with zero new unresolved records.

The same date's RustSec DB 640bf5a9f06e66d8721e8772766531fe77c8630d
identified RUSTSEC-2026-0381/0382/0383 in the Windows TLS graph. Lockfile-only
compatible updates are rustls-webpki 0.103.16 and webpki-roots/
webpki-root-certs 1.0.10. The updated Windows scan has zero vulnerabilities
and the same 18 separately reviewed warnings. Rebuild and native regression
remain required; an old executable cannot qualify these TLS changes.

Primary references:

- https://github.com/advisories/GHSA-qxg6-89mg-rqv8
- https://github.com/advisories/GHSA-xp26-3454-mjgp
- https://github.com/rustls/webpki/pull/546
- https://github.com/rustls/webpki-roots/pull/133
