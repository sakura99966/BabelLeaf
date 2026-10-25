# BabelLeaf

Read beyond language.

[简体中文](README.md) · [Project status](docs/PROJECT_STATUS.md) · [Documentation](docs/README.md)

BabelLeaf is an open-source, local-first reader for Simplified Chinese users reading books and comics in Chinese, English, Japanese, and other languages. The application derives from Readest and uses Tauri 2, React/Next.js, TypeScript, and Rust.

## Status

As of 2026-10-25, the mainline application version is **0.4.6**, with verdict `INTERNAL_IMPLEMENTATION_PASS / EXTERNAL_VALIDATION_DEFERRED` for the current Windows PC scope. It is not a stable or signed-production release.

- The latest public [GitHub pre-release](https://github.com/sakura99966/BabelLeaf/releases) is **v0.4.5**, which predates subsequent mainline corrections.
- The frozen `v0.4.6` source tag has no corresponding published GitHub Release. Later maintenance commits and CI candidates are separate source/artifact identities.
- macOS, Android, and iOS/iPadOS retain shared code and platform scaffolding, but have not completed native product acceptance.

See [project status](docs/PROJECT_STATUS.md) for dated source, CI, installer evidence, and unresolved gates.

## Current PC capabilities

- Local EPUB, PDF, MOBI/AZW/AZW3, FB2/FBZ, CBZ/ZIP, TXT, and Markdown reading; library, search, navigation, annotations, progress, and appearance settings.
- Explicit selection, reading-unit, chapter, and full-book translation; bounded, persistent jobs with pause, recovery, cancellation, retry, and caching.
- Source/translation and stacked/side-by-side bilingual views; stable anchors, glossary, translation memory, human review, and credential-free sidecars without source overwrite.
- Local dictionaries and supported system dictionary/speech adapters, with no online dictionary or cloud speech fallback.
- A comic workspace with local page import, Tesseract WASM OCR, selectable text, editable regions, explicit translation, erasing, optional local LaMa/ONNX inpainting, CJK/RTL typesetting, and separate image/archive/image-only PDF export.
- Lazy heavy runtimes, bounded caches/queues/input budgets, hostile-content isolation, and secure credential boundaries.

Format recognition is not a guarantee for every variant. Use legally obtained, DRM-free files. Model weights are neither bundled nor downloaded automatically: verified local model packs must be imported explicitly. Automated tests do not qualify representative OCR/inpainting quality.

## Privacy and translation

Reading content enters only through local import. Library data, notes, sidecars, jobs, and caches remain on the device; source documents are not rewritten.

Cloud translation uses named **DeepSeek V4, OpenAI, and Anthropic Claude** presets with application-owned official endpoints, models, and prompts. Users supply an API key, not an arbitrary URL/model. **Ollama is loopback-only.** Explicit cloud translation sends the selected content to the provider and may incur charges. Opening a book does not initiate translation; continuous and batch jobs require explicit initiation and session authorization.

There are no accounts, cloud sync, scraping/catalog services, telemetry, online metadata/dictionaries, cloud TTS, inherited updates, or DRM-removal features. See [network policy](docs/NETWORK_POLICY.md).

Paid-provider validation, lawful representative-corpus and human OCR/inpainting quality review, independent minimum-spec Windows validation, human voice review, signing, and owner/legal review remain **DEFERRED, not PASS**.

## Build from source

Requirements: Git with submodules, Node.js 24, pinned pnpm 11.1.1, Rust 1.90+, and the target Tauri toolchain. Windows requires MSVC Desktop development with C++ and WebView2. Install/configure Corepack if it is not available.

```bash
git clone --recurse-submodules https://github.com/sakura99966/BabelLeaf.git
cd BabelLeaf
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @readest/readest-app setup-vendors
corepack pnpm tauri dev
```

The internal Readest package/library identifiers are retained for compatibility. See the [development guide](docs/DEVELOPMENT.md) for tests, packaging, and bounded cleanup, and [contributing](CONTRIBUTING.md) for review requirements.

NSIS embeds web resources and the offline WebView2 installer. An installed directory with only the executable and uninstaller can be normal; the exact candidate must still pass installation, responsive launch, uninstall, and user-data retention checks.

## Roadmap and license

The [authoritative roadmap](docs/DEVELOPMENT_ROADMAP.md) proceeds through macOS, Android, iOS/iPadOS, platform parity, RC, and 1.0. A shared codebase is not native-platform qualification. Superseded release/audit records are retained under [history](docs/history/README.md), not presented as current acceptance.

BabelLeaf is [AGPL-3.0-or-later](LICENSE), retaining upstream attribution and corresponding-source obligations. See the [upstream inventory](docs/UPSTREAM_INVENTORY.md) and [baseline decision](docs/ADR-001-READEST-BASELINE.md). Fonts, dictionaries, models, voices, and fixtures require separate redistribution review. Report security issues using [SECURITY.md](SECURITY.md).
