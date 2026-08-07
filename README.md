# BabelLeaf

**Read beyond language.**

[简体中文](README_cn.md)

BabelLeaf is an open-source, local-first reader for Simplified Chinese users
who read books and comics in English, Japanese, and other languages. It is
currently developed for Windows with a shared Tauri v2 codebase intended to
remain portable to macOS, Android, and iOS.

The active application baseline is derived from Readest. BabelLeaf keeps the
local reading foundation while removing product services that do not belong in
the project.

## Current product boundary

- Reading content enters through local file import.
- Books, reading progress, annotations, dictionaries, settings, and
  translation caches stay on the device.
- Network access is limited to translation explicitly requested by the user
  through named DeepSeek V4, OpenAI, or Anthropic Claude presets, or loopback
  Ollama.
- Accounts, cloud synchronization, OPDS/RSS catalogs, web clipping, resource
  scraping, public sharing, billing, telemetry, online metadata, online
  dictionaries, cloud TTS, and inherited update services are not part of the
  current application.
- BabelLeaf does not remove DRM or provide access to copyrighted material the
  user is not authorized to use.

The network boundary and its remaining release checks are documented in
[Network Policy](docs/NETWORK_POLICY.md).

## Development status

BabelLeaf is pre-release software. The repository currently provides:

- a Tauri v2 desktop and mobile application structure;
- local library import and reading foundations;
- parser and rendering paths for EPUB, PDF, MOBI/AZW/AZW3, FB2, CBZ/ZIP, TXT,
  and Markdown content;
- local highlights, notes, search, reading progress, and appearance settings;
- imported local dictionaries and supported operating-system dictionary
  integration;
- native or browser speech engines without an online speech fallback;
- selection and reading-unit translation through named DeepSeek V4, OpenAI,
  Anthropic Claude, or local Ollama adapters.

Format recognition is not a compatibility guarantee for every file variant.
Testing must use legally obtained, DRM-free documents.

Versions 0.2 through 0.3.2 now provide the following translation workflow in
addition to selection and viewport translation:

- a reader-side chapter/full-book workbench with bounded, pauseable,
  cancellable translation jobs and local checkpoints;
- aligned source/translation pairs and portable, credential-free JSON sidecar
  import/export;
- a persistent retryable batch queue, glossary enforcement, bounded translation
  memory, format diagnostics, and reviewed segment state;
- glossary and translation-memory management with validated local import/export,
  conflict reporting, bounded history cleanup, and glossary-version visibility;
- a review workspace with provider provenance, locators, status filters,
  machine-result retention, approve/revert actions, keyboard paging, and
  recoverable local drafts;
- a persistent job dashboard that restores jobs after restart and distinguishes
  recovered state, failures, retries, and terminal history.
- versioned JSON/TSV glossary, translation-memory, and review interchange with
  TBX, TMX, and XLIFF round trips;
- layout-independent source anchors, explicit text-layer/mixed/image-only and
  malformed/oversized diagnostics, a legal fixture matrix, and tracked
  performance budgets;
- a replaceable local comic-worker protocol with capability discovery,
  bounded progress/cancellation/error contracts, and a mock OCR adapter.

The following major features remain planned:

- separate handling for text-layer and scanned PDFs;
- local comic OCR, text-region detection, inpainting, translated typesetting,
  and editable overlays;
- signed production packages and target-platform release validation for
  macOS, Android, and iOS.

The authoritative sequence from 0.3.2 through the stable 1.0.0 release is
defined in the [development roadmap](docs/DEVELOPMENT_ROADMAP.md). Version
planning, implementation, review, and release acceptance must use that document.

See [Architecture](apps/readest-app/docs/architecture.md) for runtime
boundaries and [Upstream Inventory](docs/UPSTREAM_INVENTORY.md) for source and
license provenance. The current and future translation contract is documented
in [Translation Requirements](docs/TRANSLATION_REQUIREMENTS.md).

## Architecture

```text
Next.js / React interface
        |
        +-- foliate-js and PDF.js reading foundation
        +-- local library, settings, annotations, and caches
        +-- local dictionaries and native/system speech
        +-- explicit translation adapters
                |
                +-- DeepSeek V4, OpenAI, Anthropic Claude (fixed official endpoints and models)
                +-- Ollama
        |
        +-- Tauri v2 platform boundary
                +-- Windows
                +-- macOS
                +-- Android
                +-- iOS
```

Platform-neutral reading and translation behavior stays in TypeScript.
Filesystem access, secure storage, native speech, and operating-system
integration stay behind typed Tauri/application-service adapters.

## Development

### Requirements

- Git with submodule support
- Node.js 24
- pnpm 11; the repository pins the exact package-manager version
- Rust 1.90 or newer
- the platform prerequisites required by Tauri v2
- on Windows, WebView2 Runtime and Visual Studio Build Tools with the
  **Desktop development with C++** workload

### Set up

```bash
git clone --recurse-submodules https://github.com/sakura99966/BabelLeaf.git
cd BabelLeaf
git submodule update --init --recursive
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @readest/readest-app setup-vendors
```

### Local workspace cleanup

Development builds create large, ignored directories such as `target/`,
`node_modules/`, `.next/`, `out/`, `public/vendor/`, and ignored generated
subdirectories under `src-tauri/gen/`. They are reproducible and may be
removed when disk space is needed. Do not delete the tracked mobile scaffolding
files under `src-tauri/gen/`. The optional `.upstream/` directory is only a
disposable local research mirror.
After removing dependencies or vendor assets, restore them with:

```bash
pnpm install --frozen-lockfile
pnpm --filter @readest/readest-app setup-vendors
```

The internal workspace package and Rust library retain several upstream
Readest identifiers for compatibility. User-visible product identity, bundle
IDs, credential namespaces, and release configuration use BabelLeaf.

Run the desktop application:

```bash
pnpm tauri info
pnpm tauri dev
```

Run the main verification gates:

```bash
pnpm --filter @readest/readest-app test -- --run
pnpm lint
pnpm format:check
pnpm --filter @readest/readest-app build
pnpm fmt:check
pnpm clippy:check
pnpm --filter @readest/readest-app test:rust
```

Build the unsigned Windows x64 validation package:

```bash
pnpm --filter @readest/readest-app build-win-x64:unsigned
pnpm --filter @readest/readest-app test:windows-installer -- -PreflightOnly
```

The NSIS package embeds the WebView2 offline installer. Tauri also embeds the
web assets and required resources in the main executable, so an installed
directory containing only `babelleaf.exe` and `uninstall.exe` is expected and
is not evidence of missing files. Release validation must still install,
launch, and uninstall the package in a clean Windows user or virtual machine.

## Source history

The active tree derives from
[Readest](https://github.com/readest/readest) commit
`8c212e5b8b019e40e162a7e20cb90f336a308f13`. Migration merge `2bc0b11d`
preserves the earlier BabelLeaf/Koodo history. The pre-Readest BabelLeaf/Koodo
baseline remains reachable in main history at
`93bd8ebbc613906ca730717dfa3261e2ea93327d`.

Koodo is a cross-platform Electron desktop reader; it was not rejected as
Windows-only. Readest was selected because its Tauri v2 structure provides a
more direct path to a shared desktop and mobile application.

## License and attribution

BabelLeaf is distributed under the
[GNU Affero General Public License v3.0 or later](LICENSE), consistent with
the active Readest baseline. Upstream copyright, license, modification, and
source-distribution obligations must be retained.

Fonts, dictionaries, OCR models, model weights, voices, test documents, and
other bundled data require separate license and redistribution review. Listing
an upstream project as a candidate does not mean its code or assets have been
integrated.
