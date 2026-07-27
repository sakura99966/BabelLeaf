# Contributing to BabelLeaf

Thank you for helping build BabelLeaf. The project is in an early migration
stage, so small, well-tested changes that preserve the product boundary are
especially valuable.

Please be respectful, civil, and open-minded in issues, reviews, and other
project spaces.

## Before starting

Search the
[BabelLeaf issue tracker](https://github.com/sakura99966/BabelLeaf/issues)
before starting work. Open an issue first for:

- architecture or data-model changes;
- a new dependency, bundled model, font, dictionary, voice, or native binary;
- a new network destination or capability;
- format-support claims or large parser changes;
- user-visible behavior that materially changes the roadmap.

Small bug fixes, tests, documentation corrections, and tightly scoped
refactors may go directly to a pull request when the intent is clear.

## Product guardrails

Contributions must respect the current product contract:

- reading content is imported from local files;
- application and reading data stay local by default;
- the only planned external network capability is translation through a
  user-configured OpenAI-compatible endpoint;
- accounts, cloud sync, OPDS/RSS catalogs, web scraping, resource downloading,
  online metadata/dictionaries/TTS, telemetry, and inherited update services
  are outside the first release;
- DRM circumvention and unlicensed content acquisition are out of scope.

The Readest-derived tree still contains network-enabled features that are being
contained. Do not treat their presence as approval to expose or extend them.
Any proposed exception requires an issue, threat review, and an update to
[`docs/NETWORK_POLICY.md`](docs/NETWORK_POLICY.md) before implementation.

## Development environment

### Prerequisites

- Git with submodule support
- Node.js 24
- pnpm 11 (the repository pins `pnpm@11.1.1`)
- Rust stable and Cargo for Tauri development
- the [Tauri v2 platform prerequisites](https://v2.tauri.app/start/prerequisites/)

For Windows, install the WebView2 Runtime and Visual Studio Build Tools with
the **Desktop development with C++** workload. Windows ARM64 development also
requires the appropriate ARM64 C++ tools and Clang components.

### Clone and install

Fork BabelLeaf on GitHub, then clone your fork:

```bash
git clone --recurse-submodules https://github.com/YOUR-NAME/BabelLeaf.git
cd BabelLeaf
git remote add upstream https://github.com/sakura99966/BabelLeaf.git
git submodule update --init --recursive
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @readest/readest-app setup-vendors
```

Confirm the native toolchain:

```bash
pnpm tauri info
```

The internal workspace package is still named `@readest/readest-app` while the
baseline is being migrated. This is expected and is not the public product
name.

### Run locally

Desktop application:

```bash
pnpm tauri dev
```

Web-only frontend:

```bash
pnpm dev-web
```

The web target is useful for UI work, but a successful web build does not
replace native Tauri testing.

## Making changes

Create a focused branch from the latest BabelLeaf branch you intend to target:

```bash
git fetch upstream
git switch -c feat/short-description upstream/main
```

Keep pull requests small enough to review. Preserve unrelated user changes and
avoid drive-by formatting or generated-file churn.

For changes under `apps/readest-app`, follow its
[`AGENTS.md`](apps/readest-app/AGENTS.md):

- write a failing unit test before implementing a behavior change or bug fix;
- keep TypeScript strict and do not introduce `any`;
- prefer the minimum implementation needed for the requested behavior;
- verify formatting, lint, and applicable tests before submitting.

Do not commit API keys, tokens, private endpoints, copyrighted test books,
production user data, local paths, or generated translation content. Use small,
redistributable fixtures and document their source/license.

## Verification

At minimum, frontend and documentation work should pass:

```bash
pnpm --filter @readest/readest-app test:pr:web:unit
pnpm lint
pnpm format:check
pnpm --filter @readest/readest-app build
```

Changes to Tauri/Rust code also require:

```bash
pnpm fmt:check
pnpm clippy:check
pnpm --filter @readest/readest-app test:rust
```

Run focused tests while developing and add manual checks appropriate to the
change. Format and reader work should state which DRM-free sample types,
platforms, writing directions, and layouts were tested without uploading the
documents.

If your platform cannot run an applicable check, say exactly which check was
not run and why in the pull request. Do not describe an untested native package
as verified.

## Pull requests

A pull request should include:

- the user-visible problem and the chosen scope;
- tests added or changed;
- commands run and their results;
- screenshots for meaningful UI changes;
- platform and format coverage;
- network, privacy, data-migration, and license impact;
- remaining limitations or follow-up work.

Before submitting, confirm:

- no unintended external request is initialized or added;
- secrets and document text cannot enter logs or telemetry;
- source books are not overwritten by translation/OCR output;
- new dependencies and assets have recorded licenses and attribution;
- user-visible “supported” claims match tested behavior.

Submit pull requests to
[sakura99966/BabelLeaf](https://github.com/sakura99966/BabelLeaf/pulls).
Security issues must follow [`SECURITY.md`](SECURITY.md), not a public issue or
pull request.

## Working with upstream Readest

BabelLeaf is derived from [Readest](https://github.com/readest/readest) and
retains its history and attribution. A generic reader bug fix may also benefit
Readest; contributors are welcome to propose a clean upstream version under
Readest's contribution process. BabelLeaf-specific privacy, identity, or
product-boundary changes should remain clearly separated so upstream updates
can be reviewed deliberately.

The baseline decision and component provenance are documented in
[`docs/ADR-001-READEST-BASELINE.md`](docs/ADR-001-READEST-BASELINE.md) and
[`docs/UPSTREAM_INVENTORY.md`](docs/UPSTREAM_INVENTORY.md).

## License

By contributing, you agree that your contribution is distributed under the
repository's [GNU Affero General Public License v3.0 or later](LICENSE), unless
a file clearly states another compatible license. You must have the right to
submit the code and assets you contribute.

This guide is adapted from the Readest contribution guide, which in turn
credits the Cloudflare Wrangler contribution documentation.
