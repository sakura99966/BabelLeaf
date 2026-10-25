# Contributing to BabelLeaf

BabelLeaf is maintaining its 0.4 Windows PC feature scope. Native macOS and mobile qualification are later milestones, not already-supported products. Start with the [current status](docs/PROJECT_STATUS.md), [roadmap](docs/DEVELOPMENT_ROADMAP.md), and [development guide](docs/DEVELOPMENT.md).

Please be respectful and keep changes focused, reviewable, and evidence-backed.

## Agree on scope

Search the [issue tracker](https://github.com/sakura99966/BabelLeaf/issues) first. Open an issue before changing architecture/data models, adding dependencies or bundled data/models/native binaries, adding a network capability, making broad format claims, or changing milestone scope. Small fixes, tests, and documentation corrections can go directly to a PR.

For changes under `apps/readest-app`, read its [AGENTS.md](apps/readest-app/AGENTS.md) and applicable rule files. Write a failing regression before a behavior fix, keep strict TypeScript without `any`, and preserve unrelated user changes. Use a focused `codex/` branch by default for agent-driven work.

## Product and privacy guardrails

- Content is imported locally. Library state, annotations, sidecars, and caches stay on the device; original books/pages are never overwritten by translation or OCR output.
- External requests are explicit translation through named DeepSeek V4, OpenAI, or Anthropic Claude adapters. Endpoints, models, and prompts are application-controlled. Ollama is loopback-only; arbitrary OpenAI-compatible URLs are not supported.
- Accounts, synchronization, catalogs, scraping/download services, online metadata/dictionaries/TTS, telemetry, inherited update services, and DRM circumvention are out of scope.
- No implicit translation, model download, credential use, paid call, or document upload is authorized by a test or maintenance request.
- Deferred provider, corpus, device, human-quality, signing, and legal checks must remain visibly deferred, not reported as passed.

Removed upstream services are not dormant options. A proposed exception requires an explicit scope decision, threat review, and [network policy](docs/NETWORK_POLICY.md) update before implementation.

Never commit API keys, private books, user data, generated translations, or machine-specific credentials. Use small redistributable fixtures with documented provenance. Follow [SECURITY.md](SECURITY.md) for vulnerabilities instead of posting sensitive details publicly.

## Development and verification

Use the exact package-manager pin and commands in [DEVELOPMENT.md](docs/DEVELOPMENT.md). Do not regenerate the lockfile with another global pnpm version. Internal `@readest/readest-app` and Rust library names are compatibility identifiers, not an unfinished product rename.

Verification is proportional to the change, with no weakened required gate:

| Change | Minimum local evidence |
| --- | --- |
| Documentation only | Local link validation, formatting/diff checks, and review against actual source/release status |
| Application behavior | Failing-before regression, full unit suite, lint/type checks, formatting, production build, and relevant browser/native/security/format checks |
| Rust/platform behavior | Applicable Rust fmt, Clippy, unit, integration, and native-host checks in addition to application gates |
| Packaging or version closure | Full applicable matrix and the exact install/launch/shutdown/uninstall/data-retention lifecycle, source-bound evidence, and fresh protected-main checks |

Git hooks and protected remote checks still apply to documentation PRs. A full binary release is not needed just to reorganize Markdown. If a platform or external gate cannot run, record the exact limitation instead of claiming acceptance.

Unsigned internal candidates must be labeled as such; they do not satisfy Authenticode or signed-production acceptance. Do not move an old tag, replace historical release assets, reuse a package hash for changed source, or silently publish a maintenance build as an old release.

## Pull requests and completion

Submit to [sakura99966/BabelLeaf](https://github.com/sakura99966/BabelLeaf/pulls) with the problem/scope, changed tests, commands and results, affected platforms/formats, privacy/license impact, and remaining limitations. Include screenshots only when useful for UI changes.

Review success, failure, cancellation, restart, data migration, cleanup, concurrency, and input-budget paths. Confirm no secrets/document text enter logs and that dependency/assets have exact provenance and notices.

Use the protected PR merge path: no direct-main push, force push, skipped hook, or protection bypass. Confirm required checks for the actual head, merge normally, inspect canonical-main checks, synchronize, and remove only verified merged task branches. Version closure additionally follows every gate in the roadmap; a green build is not a release verdict.

Keep current guides separate from [historical records](docs/history/README.md). After remote backup, clean only resolved, bounded, reproducible caches. Never delete `target/` wholesale: it also holds unique reports, raw logs, packages, SBOMs, manifests, hashes, and release receipts. Preserve source, user data, credentials, model packs, and tracked mobile scaffolding.

## Upstream and license

Readest-derived code, Git history, and notices are retained. Generic fixes may be proposed upstream separately; BabelLeaf identity/privacy changes should remain clearly reviewable. See the [baseline decision](docs/ADR-001-READEST-BASELINE.md) and [upstream inventory](docs/UPSTREAM_INVENTORY.md).

Contributions must be yours to submit and are distributed under [AGPL-3.0-or-later](LICENSE), unless a file states another compatible license. Code, model weights, fonts, dictionaries, voices, and test content need separate license review. This guide retains attribution to the Readest contribution guide and its Cloudflare Wrangler documentation antecedent.
